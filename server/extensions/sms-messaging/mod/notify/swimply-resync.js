// Auto re-sync of hosts' external calendar feeds (Swimply iCal) — c93 v2.
//
// Why: hosts never manually re-sync, and a stale import is a slow-motion
// double booking. This sweep re-fetches every listing's saved feed on a fixed
// cadence and blocks any new bookings it finds.
//
// Guardrails (all load-bearing):
//   - CREATE-ONLY. The only mutating call is availabilityExceptions.create
//     (seats:0). It NEVER modifies or deletes anything — a host's manual
//     blocks and prior imports are untouchable by design.
//   - SSRF guard: only https URLs on swimply.com / *.swimply.com are fetched.
//   - Timeouts everywhere: a hanging feed or audit insert cannot wedge the
//     sweep (Promise.race + axios timeout; abandoned promises are defused).
//   - Covered-events pre-filter (same semantics as sync-ical.js), with 409s
//     NOT counted against the per-listing create cap — large feeds converge
//     instead of re-attempting the same doomed slots forever.
//   - Per-host failure isolation: syncListing never throws; one bad feed is
//     logged and the sweep moves on.
//   - Every listing's sweep is audited to Supabase (email_send_log rows,
//     template_name='swimply_sync_sweep'; feed URL query strings redacted so
//     signed tokens don't persist in the log).
//   - Off unless SWIMPLY_RESYNC_ENABLED=true; cadence 4h (min 15 min).
//
// Known limitations (documented, accepted):
//   - Single-replica assumption: the marketplace runs one container; the
//     `sweeping` flag is per-process.
//   - Partial-overlap events: an event that partially overlaps an existing
//     exception is treated as covered (create-only design; same as manual sync).
//   - RRULE series are not expanded (Swimply feeds emit literal VEVENTs);
//     any rrule events are counted in the audit row, not silently dropped.
const ical = require('node-ical');
const integrationSdk = require('../../../../api-util/integration');

const ENABLED = () => process.env.SWIMPLY_RESYNC_ENABLED === 'true';
const INTERVAL_MS = Math.max(15 * 60e3, Number(process.env.SWIMPLY_RESYNC_INTERVAL_MS) || 4 * 3600e3);
const FIRST_DELAY_MS = 5 * 60e3; // let the container settle after deploys
const WINDOW_DAYS = 365;
const MAX_CREATES_PER_LISTING = 50; // per sweep; 409s/failures do not consume it
const MAX_ATTEMPTS_PER_LISTING = 150; // hard bound on create calls per sweep
const FEED_TIMEOUT_MS = 30e3;
const AUDIT_TIMEOUT_MS = 10e3;
// Known-wrong URL shapes hosts paste (HTML pages, not ics feeds) — skip early.
const BAD_URL = /swimply\.com\/(pooldetails|calendar)/i;

const SUPA = process.env.SUPABASE_URL || 'https://qbzpjsiahqgyoazjurqy.supabase.co';
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const log = (...a) => console.log('[swimply-resync]', ...a);

// Race a promise against a deadline; defuse the loser so an abandoned
// rejection can never surface as an unhandled rejection.
function withTimeout(p, ms, label) {
  let t;
  const deadline = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(label + ' timed out after ' + ms + 'ms')), ms);
  });
  Promise.resolve(p).catch(() => {});
  return Promise.race([p, deadline]).finally(() => clearTimeout(t));
}

// SSRF guard: the feed URL is host-writable data — only fetch Swimply over https.
function feedUrlProblem(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch (e) {
    return 'saved url is not a valid link';
  }
  if (u.protocol !== 'https:') return 'saved url must be https';
  const h = u.hostname.toLowerCase();
  if (!(h === 'swimply.com' || h.endsWith('.swimply.com'))) {
    return 'saved url host is not Swimply';
  }
  if (BAD_URL.test(raw)) return 'saved url is a web page, not an ics feed';
  return null;
}

// Audit row per listing per sweep. Auditing must never break the sweep.
async function audit(row) {
  if (!SKEY) return;
  try {
    const safe = { ...row };
    if (safe.feed_url) safe.feed_url = String(safe.feed_url).split('?')[0] + '?<redacted>';
    await withTimeout(
      fetch(`${SUPA}/rest/v1/email_send_log`, {
        method: 'POST',
        headers: {
          apikey: SKEY,
          Authorization: 'Bearer ' + SKEY,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify([
          {
            template_name: 'swimply_sync_sweep',
            recipient_email: 'calendar-sync@poolrentalnearme.com',
            message_id: row.listingId,
            status: row.error || row.failed > 0 ? 'failed' : 'sent', // 'accepted' is rejected by email_send_log status CHECK
            error_message: row.error || (row.failed > 0 ? row.failed + ' create(s) failed' : null),
            metadata: safe,
          },
        ]),
      }),
      AUDIT_TIMEOUT_MS,
      'audit insert'
    );
  } catch (e) {
    /* swallow — auditing never breaks the sweep */
  }
}

async function listingsWithFeeds() {
  const out = [];
  let page = 1;
  while (page <= 10) {
    const res = await integrationSdk.listings.query(
      { states: ['published', 'draft'], perPage: 100, page },
      { allowRawResponse: true }
    );
    const data = (res && res._raw && res._raw.data && res._raw.data.data) || [];
    for (const l of data) {
      const url = ((l.attributes || {}).publicData || {}).swimplyIcalUrl;
      if (url) {
        out.push({
          id: (l.id && (l.id.uuid || l.id)) + '',
          title: (l.attributes || {}).title || '',
          url,
        });
      }
    }
    const tp = (res && res._raw && res._raw.data && res._raw.data.meta && res._raw.data.meta.totalPages) || 1;
    if (page >= tp) break;
    page++;
  }
  return out;
}

// Sync one listing's feed. NEVER throws (per-host isolation).
async function syncListing(entry) {
  const row = {
    sweep: true,
    listingId: entry.id,
    title: entry.title,
    feed_url: entry.url,
    feed_events: 0,
    in_window: 0,
    created: 0,
    already_blocked: 0,
    failed: 0,
    deferred: 0,
    invalid_events: 0,
    rrule_skipped: 0,
    error: null,
  };
  try {
    const problem = feedUrlProblem(entry.url);
    if (problem) {
      row.error = 'skipped: ' + problem;
      await audit(row);
      return row;
    }

    const events = await withTimeout(
      ical.async.fromURL(entry.url, { timeout: FEED_TIMEOUT_MS - 5e3 }),
      FEED_TIMEOUT_MS,
      'feed fetch'
    );
    const vals = Object.values(events);
    row.feed_events = vals.filter(e => e.type === 'VEVENT').length;

    const now = new Date();
    const windowEnd = new Date(now.getTime() + WINDOW_DAYS * 864e5);
    const toBlock = [];
    for (const ev of vals) {
      if (ev.type !== 'VEVENT') continue;
      if (ev.rrule) {
        row.rrule_skipped++;
        continue;
      }
      let s = ev.start instanceof Date ? ev.start : new Date(ev.start);
      const e = ev.end instanceof Date ? ev.end : new Date(ev.end);
      if (isNaN(s) || isNaN(e)) {
        row.invalid_events++;
        continue;
      }
      if (!(e > now && s < windowEnd)) continue;
      // In-progress events: clamp start just ahead of now so Sharetribe
      // doesn't reject a past start on every sweep.
      if (s <= now) s = new Date(now.getTime() + 60e3);
      if (s >= e) continue; // fully elapsed after clamping
      toBlock.push({ s, e, summary: ev.summary || '' });
    }
    row.in_window = toBlock.length;
    if (toBlock.length === 0) {
      await audit(row);
      return row;
    }

    // Covered-events pre-filter (epoch-precomputed; full pagination).
    const existing = [];
    let page = 1;
    while (page <= 20) {
      const eres = await integrationSdk.availabilityExceptions.query(
        { listingId: entry.id, start: now, end: windowEnd, perPage: 100, page },
        { allowRawResponse: true }
      );
      const chunk = (((eres || {})._raw || {}).data || {}).data || [];
      for (const x of chunk) {
        const a = x.attributes || {};
        existing.push([Date.parse(a.start), Date.parse(a.end)]);
      }
      const tp = ((((eres || {})._raw || {}).data || {}).meta || {}).totalPages || 1;
      if (page >= tp || chunk.length === 0) break;
      page++;
    }
    const covered = (s, e) => {
      const sm = s.getTime();
      const em = e.getTime();
      return existing.some(r => r[0] < em && r[1] > sm);
    };

    const uncovered = [];
    for (const item of toBlock) {
      if (covered(item.s, item.e)) row.already_blocked++;
      else uncovered.push(item);
    }

    // Create until the CREATED cap is hit — 409s and failures do not consume
    // the cap, so large feeds make real progress every sweep. A hard attempt
    // bound keeps a pathological feed from spinning the API.
    let attempted = 0;
    for (const { s, e } of uncovered) {
      if (row.created >= MAX_CREATES_PER_LISTING || attempted >= MAX_ATTEMPTS_PER_LISTING) break;
      attempted++;
      try {
        await integrationSdk.availabilityExceptions.create(
          { listingId: entry.id, seats: 0, start: s, end: e },
          { expand: true }
        );
        row.created++;
      } catch (err) {
        if (err && err.status === 409) row.already_blocked++;
        else row.failed++;
      }
    }
    row.deferred = uncovered.length - attempted;
  } catch (e) {
    row.error = String((e && e.message) || e).slice(0, 300);
  }
  await audit(row);
  return row;
}

let sweeping = false; // never overlap sweeps (single-replica assumption)
async function sweep() {
  if (!ENABLED() || sweeping) return;
  sweeping = true;
  try {
    const entries = await withTimeout(listingsWithFeeds(), 120e3, 'listing scan');
    log('sweep start —', entries.length, 'listing(s) with saved feeds');
    for (const entry of entries) {
      const r = await syncListing(entry);
      log(
        `  ${entry.id} "${entry.title.slice(0, 28)}" feed=${r.feed_events} window=${r.in_window}` +
          ` created=${r.created} already=${r.already_blocked} failed=${r.failed}` +
          (r.deferred ? ` deferred=${r.deferred}` : '') +
          (r.error ? ` error=${r.error}` : '')
      );
    }
    log('sweep done');
  } catch (e) {
    log('sweep error (outer):', (e && e.message) || e);
  } finally {
    sweeping = false;
  }
}

let timer = null;
function start() {
  if (!ENABLED()) {
    log('disabled (SWIMPLY_RESYNC_ENABLED != true)');
    return;
  }
  if (timer) return;
  if (!SKEY) {
    log('WARNING: SUPABASE_SERVICE_ROLE_KEY missing — sweeps will run UNAUDITED');
  }
  log('armed — sweeping every ' + Math.round((INTERVAL_MS / 3600e3) * 10) / 10 + 'h (first sweep in 5 min)');
  setTimeout(() => {
    sweep().catch(() => {});
  }, FIRST_DELAY_MS);
  timer = setInterval(() => {
    sweep().catch(() => {});
  }, INTERVAL_MS);
}

module.exports = { start, sweep };
