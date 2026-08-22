/**
 * Provider activation audit - find the providers closest to making PRNM money.
 *
 * Answers, for every provider who is not live: where exactly are they stuck,
 * and how cheap is it to unstick them. Ranks the last-7-day cohort first, then
 * texts a phone-readable summary to the staff in server/config/staff.js.
 *
 *   node scripts/providers-activation-audit.js            # dry run, prints everything
 *   node scripts/providers-activation-audit.js --send     # also texts staff
 *   node scripts/providers-activation-audit.js --all      # include >7d cohort in SMS
 *
 * Runs inside the marketplace container (needs the Integration SDK creds and
 * twsend). Read-only against Sharetribe; the only write is the staff SMS.
 *
 * FUNNEL SOURCES - each step reads the authoritative field, verified against
 * live records rather than assumed:
 *
 *   provider account exists  <- user.attributes.profile.publicData.userType
 *                               === 'provider', OR the user authors a listing
 *                               (people who list without the flag are real
 *                               providers; the flag alone under-counts)
 *   listing started          <- listings/query?authorId, any state
 *   listing state            <- listing.attributes.state: draft | pendingApproval
 *                               | published | closed (all four observed/handled)
 *   photos                   <- listing.relationships.images.data.length
 *   description / price      <- listing.attributes.description / .price
 *   availability             <- listing.attributes.availabilityPlan.entries
 *   stripe connected         <- user.attributes.stripeConnected (Sharetribe's own
 *                               flag) CROSS-CHECKED against the stripeAccount
 *                               relationship. Disagreement is reported, not
 *                               silently resolved.
 *   bookable / live          <- published AND price AND >=1 photo AND an
 *                               availabilityPlan with entries AND stripe
 *                               connected. A published listing that cannot take
 *                               money is not live, whatever the state says.
 *
 * KNOWN LIMITATION, stated rather than papered over: Sharetribe exposes only
 * `stripeAccountId` on the stripeAccount relationship, and the production
 * Stripe key is restricted (rk_live) and cannot read /v1/accounts. So
 * "payout onboarding fully complete" (charges_enabled / payouts_enabled /
 * requirements.currently_due) is NOT directly observable with current
 * credentials. This audit reports stripe as connected / onboarding-incomplete /
 * not-connected from the two Sharetribe signals, and flags the gap. Granting an
 * unrestricted Stripe read key would upgrade this field.
 */

/* eslint-disable no-console */

const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;

// Accounts that are not real providers and would pollute the win list.
const TEST_ACCOUNT = u => {
  const email = (u.email || '').toLowerCase();
  const name = (u.name || '').toLowerCase();
  return (
    email.includes('@poolrentalnearme.com') ||
    email.startsWith('qa') ||
    name.includes('qa ') ||
    name.includes('repro') ||
    name.includes('test')
  );
};

const idOf = x => (typeof x.id === 'string' ? x.id : x.id.uuid);

async function integrationToken() {
  const cid = process.env.SHARETRIBE_INTEGRATION_SDK_CLIENT_ID;
  const sec = process.env.SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET;
  if (!cid || !sec) throw new Error('missing SHARETRIBE_INTEGRATION_SDK_CLIENT_ID/SECRET');
  const r = await fetch('https://flex-integ-api.sharetribe.com/v1/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cid,
      client_secret: sec,
      grant_type: 'client_credentials',
      scope: 'integ',
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('integration auth failed');
  return j.access_token;
}

const makeGet = token => async path => {
  const r = await fetch('https://flex-integ-api.sharetribe.com/v1/integration_api/' + path, {
    headers: { Authorization: 'Bearer ' + token },
  });
  return r.json();
};

async function pageAll(get, path) {
  let out = [];
  let included = [];
  for (let pg = 1; pg <= 30; pg++) {
    const sep = path.includes('?') ? '&' : '?';
    const r = await get(`${path}${sep}perPage=100&page=${pg}`);
    const rows = r.data || [];
    if (!rows.length) break;
    out = out.concat(rows);
    included = included.concat(r.included || []);
    if (rows.length < 100) break;
  }
  return { rows: out, included };
}

/** Pull the whole provider funnel into normalized records. */
async function collect(get) {
  const { rows: users } = await pageAll(get, 'users/query');
  const { rows: listings } = await pageAll(get, 'listings/query?include=author,images');

  const byAuthor = new Map();
  for (const l of listings) {
    const rel = l.relationships && l.relationships.author && l.relationships.author.data;
    if (!rel) continue;
    const aid = typeof rel.id === 'string' ? rel.id : rel.id.uuid;
    if (!byAuthor.has(aid)) byAuthor.set(aid, []);
    byAuthor.get(aid).push(l);
  }

  const providers = [];
  for (const u of users) {
    const uid = idOf(u);
    const a = u.attributes || {};
    const p = a.profile || {};
    const isFlagged = (p.publicData || {}).userType === 'provider';
    const hasListing = byAuthor.has(uid);
    if (!isFlagged && !hasListing) continue;
    if (a.deleted || a.banned) continue;

    providers.push({
      id: uid,
      name: `${p.firstName || ''} ${p.lastName || ''}`.trim() || '(no name)',
      email: a.email || '',
      phone: (p.protectedData || {}).phoneNumber || (p.publicData || {}).phoneNumber || '',
      createdAt: a.createdAt,
      emailVerified: !!a.emailVerified,
      stripeConnectedFlag: a.stripeConnected === true,
      flaggedProvider: isFlagged,
      listings: byAuthor.get(uid) || [],
    });
  }
  return { providers, totalUsers: users.length, totalListings: listings.length };
}

/** Stripe state from the two Sharetribe signals, disagreement surfaced. */
async function stripeState(get, prov) {
  const su = await get('users/show?id=' + prov.id + '&include=stripeAccount');
  const sa = ((su.included || []).find(x => x.type === 'stripeAccount') || {}).attributes;
  const hasAccount = !!(sa && sa.stripeAccountId);
  const flag = prov.stripeConnectedFlag;
  if (flag && hasAccount) return { status: 'connected', ambiguous: false };
  if (hasAccount && !flag) return { status: 'onboarding incomplete', ambiguous: true };
  if (flag && !hasAccount) return { status: 'onboarding incomplete', ambiguous: true };
  return { status: 'not connected', ambiguous: false };
}

const nImages = l => ((l.relationships && l.relationships.images && l.relationships.images.data) || []).length;

/** Pick the listing furthest along the funnel - that is the one to finish. */
function bestListing(listings) {
  const live = listings.filter(l => !l.attributes.deleted && l.attributes.state !== 'closed');
  const rank = { published: 3, pendingApproval: 2, draft: 1 };
  return live.sort((a, b) => (rank[b.attributes.state] || 0) - (rank[a.attributes.state] || 0))[0] || null;
}

function assess(prov, stripe) {
  const l = bestListing(prov.listings);
  const blockers = [];
  let listingStatus = 'none';
  let photos = 0;
  let hasPrice = false;
  let hasDesc = false;
  let hasAvail = false;

  if (!l) {
    blockers.push('no_listing');
  } else {
    listingStatus = l.attributes.state;
    photos = nImages(l);
    hasPrice = !!(l.attributes.price && l.attributes.price.amount > 0);
    hasDesc = !!(l.attributes.description && l.attributes.description.trim().length >= 40);
    hasAvail = !!(
      l.attributes.availabilityPlan &&
      Array.isArray(l.attributes.availabilityPlan.entries) &&
      l.attributes.availabilityPlan.entries.length > 0
    );
    if (!photos) blockers.push('missing_photos');
    if (!hasDesc) blockers.push('missing_description');
    if (!hasPrice) blockers.push('missing_price');
    if (!hasAvail) blockers.push('missing_availability');
    if (l.attributes.state !== 'published') blockers.push('listing_not_published');
  }
  if (stripe.status === 'not connected') blockers.push('stripe_not_connected');
  else if (stripe.status === 'onboarding incomplete') blockers.push('stripe_onboarding_incomplete');

  const live =
    listingStatus === 'published' && photos > 0 && hasPrice && hasAvail && stripe.status === 'connected';

  let status;
  if (live) status = 'live';
  else if (!l) status = 'signup_only';
  else if (listingStatus === 'published') status = 'published_not_bookable';
  else if (stripe.status === 'not connected' && photos && hasPrice && hasDesc) status = 'stripe_missing';
  else if (stripe.status === 'onboarding incomplete') status = 'stripe_incomplete';
  else if (photos && hasPrice && hasDesc && hasAvail) status = 'ready_to_publish';
  else if (photos || hasPrice || hasDesc) status = 'listing_incomplete';
  else status = 'listing_started';

  // Deterministic ease: count the real steps left, weight no-listing hardest.
  let ease;
  if (live) ease = null;
  else if (!l) ease = 'HARD';
  else {
    const contentGaps = [!photos, !hasPrice, !hasDesc, !hasAvail].filter(Boolean).length;
    const stripeGap = stripe.status !== 'connected' ? 1 : 0;
    const publishGap = listingStatus !== 'published' ? 1 : 0;
    const steps = contentGaps + stripeGap + publishGap;
    if (steps <= 1) ease = 'VERY EASY';
    else if (contentGaps === 0 && steps <= 2) ease = 'VERY EASY';
    else if (steps === 2) ease = 'EASY';
    else if (steps === 3) ease = 'MEDIUM';
    else ease = 'HARD';
  }

  // One concrete action, in Derek's vocabulary.
  let action;
  if (live) action = null;
  else if (!l) action = 'Onboarding assist — no listing started';
  else if (contentComplete(photos, hasPrice, hasDesc, hasAvail) && stripe.status === 'not connected')
    action = 'Call — listing complete, Stripe missing';
  else if (stripe.status === 'connected' && (!photos || listingStatus !== 'published'))
    action = 'Text — Stripe done, needs photos + Publish';
  else if (listingStatus === 'draft' && (photos || hasPrice) && hasDesc)
    action = 'Call — draft is nearly finished';
  else if (listingStatus === 'published' && stripe.status !== 'connected')
    action = 'Call — live listing but cannot get paid, Stripe missing';
  else action = 'Onboarding assist — listing partially built';

  return {
    ...prov,
    listingTitle: l ? l.attributes.title || '(untitled)' : null,
    listingId: l ? idOf(l) : null,
    listingStatus,
    photos,
    hasPrice,
    hasDesc,
    hasAvail,
    stripe: stripe.status,
    stripeAmbiguous: stripe.ambiguous,
    listingCount: prov.listings.length,
    blockers,
    primaryBlocker: blockers[0] || null,
    status,
    ease,
    action,
    live,
  };
}

const contentComplete = (photos, hasPrice, hasDesc, hasAvail) => photos > 0 && hasPrice && hasDesc && hasAvail;

const EASE_ORDER = { 'VERY EASY': 0, EASY: 1, MEDIUM: 2, HARD: 3 };

/**
 * Format a phone so it is tappable in a text message.
 *
 * The first version of this report deliberately left phone numbers out of the
 * SMS - the brief listed what the message "can include" and phone was not on
 * it, so it was read as an allowlist. That was too literal: the prohibition was
 * about bank/Stripe/identity data, and a text telling Derek to CALL someone
 * with no number in it is useless on the device it arrives on. Numbers are in.
 * Anything genuinely sensitive (Stripe ids, payout detail) still never ships.
 */
const dialable = phone => {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') return `${d.slice(1, 4)}-${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return 'NO PHONE ON FILE';
};

function rank(list) {
  return [...list].sort((a, b) => {
    const e = (EASE_ORDER[a.ease] ?? 9) - (EASE_ORDER[b.ease] ?? 9);
    if (e !== 0) return e;
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
}

/**
 * Phone-readable SMS, split on whole providers so no entry is cut in half.
 *
 * Editorial choice: providers whose only story is "signed up, never started"
 * are collapsed into one grouped line instead of getting four lines each. In
 * the first run that turned a 3-part text into 1 - thirteen identical HARD
 * entries were burning two thirds of the message and pushing the two names
 * actually worth calling off the first screen. Names are all still listed.
 */
function buildSms(recent, counts) {
  const head = 'PRNM PROVIDER WIN LIST — LAST 7 DAYS';
  const entries = [];
  let n = 0;
  let lastEase = null;
  const detailed = recent.filter(p => p.ease !== 'HARD');
  const collapsed = recent.filter(p => p.ease === 'HARD');

  for (const p of detailed) {
    let block = '';
    if (p.ease !== lastEase) {
      block += `${p.ease}\n`;
      lastEase = p.ease;
    }
    n++;
    const when = String(p.createdAt).slice(5, 10).replace('-', '/');
    block += `${n}. ${p.name} — signed up ${when}\n`;
    block += `${dialable(p.phone)}\n`;
    block += `Listing: ${p.listingStatus === 'none' ? 'not started' : p.listingStatus}${p.photos ? ` (${p.photos} photos)` : ''}\n`;
    block += `Stripe: ${p.stripe.toUpperCase()}\n`;
    block += `Next: ${p.action}`;
    entries.push(block);
  }
  if (collapsed.length) {
    entries.push(
      `HARD (${collapsed.length}) — signed up, no listing started:\n` +
        collapsed.map(p => `${p.name} ${dialable(p.phone)}`).join('\n') +
        `\nNext: onboarding assist`
    );
  }

  const stuckMoney = counts.publishedNotBookable
    ? `\n!! ${counts.publishedNotBookable} listings are LIVE but cannot take money (host has no Stripe) — ${counts.publishedNotBookableRecent} of them signed up this week. Fix these first.`
    : '';
  const tail =
    `TOTAL:\n${counts.recentNonLive} new providers not live\n` +
    `${counts.veryEasy} very easy · ${counts.easy} easy · ${counts.medium} medium · ${counts.hard} hard\n` +
    `(${counts.olderNonLive} older non-live providers not shown)` +
    stuckMoney;

  const parts = [];
  let cur = '';
  const LIMIT = 900;
  for (const e of [...entries, tail]) {
    if (cur && (cur + '\n' + e).length > LIMIT) {
      parts.push(cur);
      cur = e;
    } else {
      cur = cur ? cur + '\n' + e : e;
    }
  }
  if (cur) parts.push(cur);
  return parts.map((body, i) =>
    parts.length === 1 ? `${head}\n${body}` : `PRNM Provider Win List ${i + 1}/${parts.length}\n${body}`
  );
}

async function main() {
  const argv = process.argv.slice(2);
  const doSend = argv.includes('--send');
  const includeAll = argv.includes('--all');

  const token = await integrationToken();
  const get = makeGet(token);

  const { providers, totalUsers, totalListings } = await collect(get);

  const assessed = [];
  const dataIssues = [];
  for (const prov of providers) {
    const s = await stripeState(get, prov);
    const a = assess(prov, s);
    if (TEST_ACCOUNT(a)) {
      dataIssues.push(`excluded test/internal account: ${a.name} <${a.email}>`);
      continue;
    }
    if (a.stripeAmbiguous) dataIssues.push(`stripe signals disagree: ${a.name} (${a.stripe})`);
    if (a.listingCount > 1) dataIssues.push(`multiple listings (${a.listingCount}): ${a.name}`);
    if (!a.phone) dataIssues.push(`no phone on file: ${a.name} <${a.email}>`);
    if (!a.flaggedProvider && a.listingCount) dataIssues.push(`authors a listing but userType!=provider: ${a.name}`);
    assessed.push(a);
  }

  const live = assessed.filter(p => p.live);
  const nonLive = assessed.filter(p => !p.live);
  const cutoff = Date.now() - SEVEN_DAYS_MS;
  const recent = rank(nonLive.filter(p => new Date(p.createdAt).getTime() >= cutoff));
  const older = rank(nonLive.filter(p => new Date(p.createdAt).getTime() < cutoff));

  const counts = {
    recentNonLive: recent.length,
    olderNonLive: older.length,
    veryEasy: recent.filter(p => p.ease === 'VERY EASY').length,
    easy: recent.filter(p => p.ease === 'EASY').length,
    medium: recent.filter(p => p.ease === 'MEDIUM').length,
    hard: recent.filter(p => p.ease === 'HARD').length,
    // A published listing whose host cannot receive money is the most
    // expensive state on the platform: it takes bookings and then strands
    // the payout. Surfaced separately because the 7-day window hides most.
    publishedNotBookable: nonLive.filter(p => p.status === 'published_not_bookable').length,
    publishedNotBookableRecent: recent.filter(p => p.status === 'published_not_bookable').length,
  };

  const byStage = {};
  for (const p of nonLive) byStage[p.status] = (byStage[p.status] || 0) + 1;

  // ---------- internal report (full contact detail) ----------
  console.log('===== PRNM PROVIDER ACTIVATION AUDIT =====');
  console.log(`generated: ${new Date().toISOString()}`);
  console.log(`users scanned: ${totalUsers} | listings scanned: ${totalListings}`);
  console.log(`providers: ${assessed.length} | live: ${live.length} | NOT live: ${nonLive.length}`);
  console.log(`non-live signed up in last 7 days: ${recent.length} | older: ${older.length}`);
  console.log('');
  console.log('count by activation stage (non-live):');
  for (const k of Object.keys(byStage).sort((a, b) => byStage[b] - byStage[a])) {
    console.log(`  ${k.padEnd(24)} ${byStage[k]}`);
  }
  console.log('');
  console.log(`ease (last 7d): VERY EASY ${counts.veryEasy} | EASY ${counts.easy} | MEDIUM ${counts.medium} | HARD ${counts.hard}`);

  const dump = (title, arr) => {
    console.log('');
    console.log(`--- ${title} (${arr.length}) ---`);
    for (const p of arr) {
      console.log(
        `[${p.ease}] ${p.name} | ${p.phone || 'NO PHONE'} | ${p.email}\n` +
          `    signed up: ${p.createdAt}\n` +
          `    listing:   ${p.listingStatus}${p.listingTitle ? ` "${p.listingTitle}"` : ''} | photos:${p.photos} price:${p.hasPrice} desc:${p.hasDesc} availability:${p.hasAvail}\n` +
          `    stripe:    ${p.stripe}\n` +
          `    status:    ${p.status} | blockers: ${p.blockers.join(', ') || 'none'}\n` +
          `    ACTION:    ${p.action}`
      );
    }
  };
  dump('LAST 7 DAYS — NOT LIVE (primary cohort)', recent);
  dump('OLDER — NOT LIVE', older);

  console.log('');
  console.log('--- TOP 10 EASIEST WINS (all cohorts) ---');
  const top10 = rank(nonLive).slice(0, 10);
  top10.forEach((p, i) =>
    console.log(`  ${i + 1}. [${p.ease}] ${p.name} — ${p.action} — ${p.phone || 'no phone'}`)
  );

  console.log('');
  console.log('--- DATA QUALITY NOTES ---');
  if (!dataIssues.length) console.log('  none');
  for (const d of [...new Set(dataIssues)]) console.log('  ' + d);
  console.log('  LIMITATION: payout-onboarding completion (charges_enabled/payouts_enabled)');
  console.log('  is not readable - Sharetribe exposes only stripeAccountId and the production');
  console.log('  Stripe key is restricted. Stripe column is connected/incomplete/not-connected.');

  // ---------- SMS ----------
  const smsSource = includeAll ? rank(nonLive) : recent;
  const parts = buildSms(smsSource, counts);
  console.log('');
  console.log(`--- SMS (${parts.length} part${parts.length > 1 ? 's' : ''}) ---`);
  parts.forEach((p, i) => console.log(`\n[part ${i + 1}]\n${p}`));

  if (!doSend) {
    console.log('');
    console.log('DRY RUN - no SMS sent. Re-run with --send to text staff.');
    return;
  }

  // Re-check state immediately before sending: a provider may have gone live
  // in the minutes this audit took, and texting a stale win list wastes a call.
  const { providers: fresh } = await collect(get);
  const freshLive = new Set();
  for (const prov of fresh) {
    const s = await stripeState(get, prov);
    const a = assess(prov, s);
    if (a.live) freshLive.add(a.id);
  }
  const wentLive = smsSource.filter(p => freshLive.has(p.id));
  if (wentLive.length) {
    console.log('');
    console.log('RE-CHECK: went live during the audit, dropping from SMS: ' + wentLive.map(p => p.name).join(', '));
  }
  const finalSource = smsSource.filter(p => !freshLive.has(p.id));
  const finalParts = finalSource.length === smsSource.length ? parts : buildSms(finalSource, counts);

  const { resolveStaffRecipients } = require('../server/config/staff');
  const twsend = require('../server/extensions/sms-messaging/mod/notify/twsend');
  const recipients = resolveStaffRecipients();

  for (const r of recipients) {
    for (const body of finalParts) {
      const res = await twsend({ body, phoneNumber: r.phone });
      console.log(`sent to ${r.name}: ${!!res}${res && res.sid ? ' ' + res.sid : ''}`);
      await new Promise(z => setTimeout(z, 2000));
    }
  }
}

main().catch(e => {
  console.error('AUDIT FAILED:', e.message);
  process.exit(1);
});
