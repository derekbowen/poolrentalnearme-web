// Weekly host stats + post-your-link nudge. Thursdays, via run_weekly_stats.sh.
//
// c195 (2026-09-02): the Thursday text now reports the SAME number the host
// sees on their dashboard - /go/ share-link clicks logged by go-redirect.js into
// Supabase (sms_reply_ctx, kind=share_click). The host list is every published
// listing, so a host who joined yesterday is included automatically. Switchy
// short links, host_links.json and click_history.jsonl are no longer read here.
//
// Two numbers for one idea was the bug: a host who posted the dashboard link saw
// the badge move and then got a "quiet week" text; a host who joined after the
// August link batch never got a text at all.
//
// Kill switch: /home/ubuntu/switchy/WEEKLY_STOP (checked by the wrapper) and
// /tmp/WEEKLY_STOP inside the container. WEEKLY_DRY=1 sends nothing.

const fs = require('fs');
const twsend = require('/home/bun/app/server/extensions/sms-messaging/mod/notify/twsend');

const greet = n =>
  String(n || '').trim().toLowerCase() === 'derek' ? 'Derek here.' : `Hi ${n} - Derek here.`;

const U = process.env.SUPABASE_URL;
const K = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' };
const rest = (p, o = {}) =>
  fetch(U + '/rest/v1/' + p, {
    headers: { ...H, ...(o.prefer ? { Prefer: o.prefer } : {}) },
    method: o.method || 'GET',
    body: o.body ? JSON.stringify(o.body) : undefined,
  }).then(async r => ({ s: r.status, j: await r.json().catch(() => null) }));

const d10 = s => {
  const x = String(s || '').replace(/\D/g, '');
  return x.length === 11 && x[0] === '1' ? x.slice(1) : x;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DRY = process.env.WEEKLY_DRY === '1';
const ROOT = 'https://www.poolrentalnearme.com';

// Same slug rule as go-redirect.js / SharePoolCard.js. Resolution is by the
// 8-hex uuid suffix; the slug is cosmetic but must not break the suffix.
const slugify = t =>
  (t || 'pool')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'pool';
const linkFor = l => `${ROOT}/go/${slugify(l.title)}-${l.id.slice(0, 8)}`;

// Synthetic-account rules, inlined rather than required from the container's
// exclude.js: the deployed copy still matches probe words as bare substrings
// (mdupree@, jconcannon@ would be dropped). These are the anchored rules.
const isTestEmail = email => {
  const e = String(email || '');
  if (!e) return false;
  if (/@mailinator\.com$/i.test(e) || /@example\.com$/i.test(e)) return true;
  const local = e.slice(0, e.lastIndexOf('@') === -1 ? e.length : e.lastIndexOf('@'));
  if (/^(claude-|merlin-|login-health\+|lockout-check\+)/i.test(local)) return true;
  return /(^|[._+-])(smoke|diag|e2e|repro|dup|conc|ssotest|write-diag)([._+-]|$)/i.test(local);
};

const ST = 'https://flex-integ-api.sharetribe.com';
const stToken = async () => {
  const r = await fetch(ST + '/v1/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.SHARETRIBE_INTEGRATION_SDK_CLIENT_ID,
      client_secret: process.env.SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET,
      grant_type: 'client_credentials',
      scope: 'integ',
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('sharetribe token failed');
  return j.access_token;
};
const rid = x => {
  const i = x && x.id;
  return typeof i === 'string' ? i : i && i.uuid;
};

// Every published listing with its author -> one row per HOST (by phone).
const collectHosts = async () => {
  const tok = await stToken();
  const get = async p =>
    (await fetch(`${ST}/v1/integration_api/${p}`, { headers: { Authorization: 'Bearer ' + tok } })).json();
  const byPhone = new Map();
  const stats = { listings: 0, no_phone: 0, test_account: 0, config: 0 };
  for (let page = 1; page <= 50; page++) {
    const r = await get(
      `listings/query?states=published&perPage=100&page=${page}&include=author` +
        `&fields.user=email,profile.displayName,profile.firstName,profile.protectedData`
    );
    if (r.errors) throw new Error('listings/query: ' + JSON.stringify(r.errors).slice(0, 200));
    const users = {};
    for (const u of r.included || []) if (u.type === 'user') users[rid(u)] = u;
    for (const l of r.data || []) {
      stats.listings++;
      const la = l.attributes || {};
      const title = String(la.title || '').trim();
      if (/CONFIG LISTING/i.test(title)) { stats.config++; continue; }
      const u = users[rid(l.relationships && l.relationships.author && l.relationships.author.data)];
      if (!u) continue;
      const ua = u.attributes || {};
      const prof = ua.profile || {};
      if (isTestEmail(ua.email)) { stats.test_account++; continue; }
      const phone = prof.protectedData && prof.protectedData.phoneNumber;
      const ph = d10(phone);
      if (ph.length !== 10) { stats.no_phone++; continue; }
      const name = (prof.firstName || prof.displayName || '').trim().split(/\s+/)[0] || 'there';
      const row = byPhone.get(ph) || { phone: '+1' + ph, name, email: ua.email, listings: [] };
      row.listings.push({ id: rid(l), title });
      byPhone.set(ph, row);
    }
    const tp = r.meta && r.meta.totalPages;
    if (!tp || page >= tp) break;
  }
  return { hosts: [...byPhone.values()], stats };
};

// All share clicks, grouped by listing. A failed read ABORTS the run: a lookup
// failure and a real zero must never produce the same "nobody has seen your
// pool" message (Stephanie Frey, Aug 2026).
const collectClicks = async () => {
  const total = {};
  const week = {};
  const cutoff = Date.now() - 7 * 864e5;
  const PAGE = 5000;
  for (let off = 0; off < 200000; off += PAGE) {
    const r = await rest(
      `sms_reply_ctx?kind=eq.share_click&select=tx_id,created_at&order=created_at.asc&limit=${PAGE}&offset=${off}`
    );
    if (r.s !== 200 || !Array.isArray(r.j)) throw new Error(`share_click read failed: HTTP ${r.s}`);
    for (const x of r.j) {
      total[x.tx_id] = (total[x.tx_id] || 0) + 1;
      if (new Date(x.created_at).getTime() >= cutoff) week[x.tx_id] = (week[x.tx_id] || 0) + 1;
    }
    if (r.j.length < PAGE) break;
  }
  return { total, week };
};

(async () => {
  if (fs.existsSync('/tmp/WEEKLY_STOP')) { console.log('STOP file present'); return; }
  const now = new Date();
  const utcH = now.getUTCHours() + now.getUTCMinutes() / 60;
  const east = (utcH - 4 + 24) % 24;
  const hawaii = (utcH - 10 + 24) % 24;
  const inWindow = !(east < 9 || east >= 20.5 || hawaii < 9 || hawaii >= 20.5);
  if (!inWindow && !DRY) {
    console.log(`ABORT quiet hours: UTC ${utcH.toFixed(2)} -> ET ${east.toFixed(2)} HI ${hawaii.toFixed(2)}`);
    return;
  }
  console.log(`window ${inWindow ? 'OK' : 'CLOSED (dry run continues)'} (ET ${east.toFixed(1)}h, HI ${hawaii.toFixed(1)}h)${DRY ? '  [DRY RUN]' : ''}`);

  const { hosts, stats } = await collectHosts();
  console.log(`hosts from published listings: ${hosts.length}  (listings ${stats.listings}, no phone ${stats.no_phone}, test ${stats.test_account}, config ${stats.config})`);
  const { total, week } = await collectClicks();
  console.log(`share_click listings with any click: ${Object.keys(total).length}`);

  const rows = hosts.map(h => {
    let clicks = 0, wk = 0, best = h.listings[0], bestN = -1;
    for (const l of h.listings) {
      const n = total[l.id] || 0;
      clicks += n;
      wk += week[l.id] || 0;
      if (n > bestN) { best = l; bestN = n; }
    }
    return { ...h, title: best.title, link: linkFor(best), clicks, week: wk };
  });

  const oo = await rest('sms_opt_out?opted_out=eq.true&select=phone');
  if (oo.s !== 200 || !Array.isArray(oo.j)) throw new Error('opt-out read failed: HTTP ' + oo.s);
  const optedOut = new Set(oo.j.map(x => d10(x.phone)));
  let suppress = new Set();
  try { suppress = new Set(JSON.parse(fs.readFileSync('/tmp/host_suppress.json', 'utf8')).map(d10)); } catch (e) {}
  const since = new Date(Date.now() - 6 * 864e5).toISOString();
  const rec = await rest(`sms_log?event_type=eq.host_weekly_stats&created_at=gte.${since}&select=phone`);
  if (rec.s !== 200 || !Array.isArray(rec.j)) throw new Error('sms_log read failed: HTTP ' + rec.s);
  const already = new Set(rec.j.map(x => d10(x.phone)));

  let sent = 0, fail = 0, skip = 0, a = 0, b = 0, c = 0;
  for (const r of rows) {
    const ph = d10(r.phone);
    if (ph.length !== 10 || optedOut.has(ph) || suppress.has(ph) || already.has(ph)) { skip++; continue; }
    const t = String(r.title).trim();
    let body;
    if (r.week > 0) { a++;
      body = `${greet(r.name)} ${r.week} ${r.week === 1 ? 'person' : 'people'} clicked your pool link this week ` +
        `(${r.clicks} all time). That's ${r.week === 1 ? 'someone' : 'people'} who wanted to see ${t}. ` +
        `Post it somewhere new this weekend and that number goes up: ${r.link}`;
    } else if (r.clicks > 0) { b++;
      body = `${greet(r.name)} Your pool link is at ${r.clicks} clicks, but it was quiet this week. ` +
        `It worked before, it'll work again - drop it in a local Facebook group or your stories today ` +
        `and you'll see it move: ${r.link}`;
    } else { c++;
      body = `${greet(r.name)} Straight talk: your pool link hasn't been clicked yet, which means it ` +
        `hasn't been seen yet. Nobody can book ${t} if they don't know it exists. ` +
        `Post this once on Facebook Marketplace or your neighborhood group this weekend: ${r.link}`;
    }
    if (DRY) { sent++; if (sent <= 5) console.log(`\n  --> ${r.name} (${r.clicks}c, week ${r.week})\n      ${body}`); continue; }
    try {
      await twsend({ body, phoneNumber: r.phone });
      await rest('sms_log', { method: 'POST', prefer: 'return=minimal', body: {
        phone: r.phone, event_type: 'host_weekly_stats', status: 'sent', recipient_role: 'provider',
        body_preview: body.slice(0, 300) } });
      sent++;
    } catch (e) { fail++; console.log(`  FAIL ${r.name}: ${String(e.message).slice(0, 80)}`); }
    await sleep(700);
  }
  console.log(`\n${DRY ? 'WOULD SEND' : 'SENT'} ${sent} | FAILED ${fail} | SKIPPED ${skip}`);
  console.log(`buckets -> clicks this week: ${a} | quiet week: ${b} | never clicked: ${c}`);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
