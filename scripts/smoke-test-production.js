#!/usr/bin/env node
/**
 * Post-deploy smoke tests. Read-only against live production.
 *
 * Creates no booking, charges no card, writes no row, sends no message. The
 * transaction check uses the line-item calculator, which is a pure speculative
 * calculation — the same call the booking form makes before anyone clicks pay.
 *
 *   node scripts/smoke-test-production.js                 # public checks only
 *   node scripts/smoke-test-production.js --require-all   # credentialed checks must pass too
 *   node scripts/smoke-test-production.js --json
 *   SMOKE_BASE_URL=https://staging.example.com node scripts/smoke-test-production.js
 *
 * Exit 0 when every applicable check passes. Without --require-all, checks whose
 * credentials are absent are reported as SKIPPED and do not fail the run, so the
 * script is useful from a laptop as well as from CI.
 *
 * No secret value is printed. Credentials are used to authenticate and nothing
 * more; only the outcome is reported.
 */

/* eslint-disable no-console */
const BASE = process.env.SMOKE_BASE_URL || 'https://www.poolrentalnearme.com';
const args = new Set(process.argv.slice(2));
const requireAll = args.has('--require-all');
const asJson = args.has('--json');

const results = [];
const pass = (name, detail) => results.push({ name, status: 'pass', detail });
const fail = (name, detail) => results.push({ name, status: 'fail', detail });
const skip = (name, detail) => results.push({ name, status: requireAll ? 'fail' : 'skip', detail });

const get = async (path, opts = {}) => {
  const url = path.startsWith('http') ? path : BASE + path;
  const r = await fetch(url, {
    redirect: 'manual',
    headers: { 'user-agent': 'prnm-smoke-test', ...(opts.headers || {}) },
    ...opts,
  });
  return { status: r.status, location: r.headers.get('location'), text: async () => r.text() };
};

const step = async (name, fn) => {
  try {
    await fn();
  } catch (e) {
    fail(name, `threw: ${String(e && e.message).slice(0, 160)}`);
  }
};

// ------------------------------------------------------------ public surface
await step('application responds', async () => {
  const r = await get('/');
  r.status === 200 ? pass('application responds', `GET / -> 200`) : fail('application responds', `GET / -> ${r.status}`);
});

await step('critical public routes', async () => {
  const routes = ['/', '/s', '/signup', '/login', '/terms-of-service', '/privacy-policy'];
  const bad = [];
  for (const p of routes) {
    const r = await get(p);
    if (r.status !== 200) bad.push(`${p}=${r.status}`);
  }
  bad.length
    ? fail('critical public routes', `not 200: ${bad.join(', ')}`)
    : pass('critical public routes', `${routes.length} routes 200`);
});

await step('sitemap available', async () => {
  const r = await get('/sitemap.xml');
  if (r.status !== 200) return fail('sitemap available', `-> ${r.status}`);
  const body = await r.text();
  const locs = (body.match(/<loc>/g) || []).length;
  locs > 0 ? pass('sitemap available', `${locs} entries`) : fail('sitemap available', 'no <loc> entries');
});

await step('unknown routes 404', async () => {
  // A soft 404 (HTTP 200 on a missing page) is a regression this codebase has
  // shipped before; assert the real status.
  const r = await get('/definitely-not-a-real-page-smoke-test');
  r.status === 404
    ? pass('unknown routes 404', 'true 404')
    : fail('unknown routes 404', `got ${r.status} — soft 404 regression`);
});

let listingPath = null;
let listingId = null;
await step('listing retrieval', async () => {
  const r = await get('/s');
  const body = await r.text();
  const m = body.match(/\/l\/[a-zA-Z0-9-]+\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
  if (!m) return fail('listing retrieval', 'no listing link found on /s');
  listingPath = m[0];
  listingId = m[1];
  const lr = await get(listingPath);
  lr.status === 200
    ? pass('listing retrieval', `${listingPath.slice(0, 48)} -> 200`)
    : fail('listing retrieval', `${listingPath} -> ${lr.status}`);
});

await step('canonical page rendering', async () => {
  if (!listingPath) return skip('canonical page rendering', 'no listing available');
  const r = await get(listingPath + '?ref=smoke-test');
  const body = await r.text();
  const canonical = (body.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/) || [])[1];
  if (!canonical) return fail('canonical page rendering', 'no canonical tag');
  canonical.includes('?')
    ? fail('canonical page rendering', 'canonical carries a query string — duplicate URL per share click')
    : pass('canonical page rendering', 'canonical is query-free');
});

// ------------------------------------------- the fee invariant (read-only)
await step('fee invariant', async () => {
  if (!listingId) return skip('fee invariant', 'no listing available');
  const start = new Date(Date.now() + 7 * 86400000);
  start.setUTCHours(18, 0, 0, 0);
  const HOURS = 2;
  const end = new Date(start.getTime() + HOURS * 3600000);

  const r = await fetch(BASE + '/api/transaction-line-items', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'prnm-smoke-test' },
    body: JSON.stringify({
      isOwnListing: false,
      listingId,
      orderData: { bookingStart: start.toISOString(), bookingEnd: end.toISOString() },
    }),
  });
  const body = await r.text();
  if (r.status !== 200) {
    // Availability rules (advance notice, blocked dates) are not a fee failure.
    const benign = /advance notice|not available|earliest available/i.test(body);
    return benign
      ? skip('fee invariant', `listing unavailable for the probe window: ${body.slice(0, 90)}`)
      : fail('fee invariant', `HTTP ${r.status}: ${body.slice(0, 140)}`);
  }

  // Transit-encoded. Read the shapes we need without a transit dependency.
  const unit = body.match(/"line-item\/hour"[\s\S]{0,80}?\[\s*(\d+)\s*,\s*"USD"\s*\]/);
  const qty = body.match(/"line-item\/hour"[\s\S]{0,200}?"~f(\d+(?:\.\d+)?)"/);
  const commissionPct = body.match(/"line-item\/customer-commission"[\s\S]{0,200}?"~f(\d+(?:\.\d+)?)"/);
  // Within a line item the money tuples appear in emitted order: unitPrice
  // first, lineTotal last. Transit caches the keys ("^2", "^6", ...) so their
  // names are not stable across responses, but that ordering is.
  const commissionSegment = body.slice(body.indexOf('"line-item/customer-commission"'));
  const money = [...commissionSegment.matchAll(/\[\s*(\d+)\s*,\s*"USD"\s*\]/g)].map(m => Number(m[1]));
  const commissionTotal = money.length >= 2 ? money[money.length - 1] : null;
  const hasProviderCommission = body.includes('line-item/provider-commission');

  if (!unit || !commissionPct) return fail('fee invariant', 'could not parse line items from the response');

  const unitCents = Number(unit[1]);
  const quantity = qty ? Number(qty[1]) : HOURS;
  const pct = Number(commissionPct[1]);
  const base = unitCents * quantity;
  const expectedCommission = Math.round(base * (pct / 100));
  const actualCommission = commissionTotal;

  const problems = [];
  if (pct !== 15) problems.push(`customer commission is ${pct}%, expected 15%`);
  if (hasProviderCommission) problems.push('a provider-commission line item exists, expected none (0% host fee)');
  if (actualCommission !== null && actualCommission !== expectedCommission) {
    problems.push(`commission ${actualCommission} != base ${base} x ${pct}% = ${expectedCommission}`);
  }

  const dollars = c => `$${(c / 100).toFixed(2)}`;
  problems.length
    ? fail('fee invariant', problems.join('; '))
    : pass(
        'fee invariant',
        `${dollars(unitCents)} x ${quantity}h = ${dollars(base)}, +${pct}% = ${dollars(actualCommission ?? expectedCommission)}, host fee 0%, payin ${dollars(base + (actualCommission ?? expectedCommission))}`
      );
});

// ------------------------------------------------------ credentialed checks
await step('Sharetribe Integration API auth', async () => {
  const id = process.env.SHARETRIBE_INTEGRATION_SDK_CLIENT_ID || process.env.SHARETRIBE_INTEG_CLIENT_ID;
  const secret =
    process.env.SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET || process.env.SHARETRIBE_INTEG_CLIENT_SECRET;
  if (!id || !secret) return skip('Sharetribe Integration API auth', 'credentials not present');
  const r = await fetch('https://flex-integ-api.sharetribe.com/v1/auth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      grant_type: 'client_credentials',
      scope: 'integ',
    }),
  });
  r.status === 200
    ? pass('Sharetribe Integration API auth', 'token issued')
    : fail('Sharetribe Integration API auth', `token endpoint -> ${r.status}`);
});

await step('Supabase connectivity', async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return skip('Supabase connectivity', 'credentials not present');
  const r = await fetch(`${url}/rest/v1/?apikey=${encodeURIComponent(key)}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  r.status < 400
    ? pass('Supabase connectivity', `REST root -> ${r.status}`)
    : fail('Supabase connectivity', `REST root -> ${r.status}`);
});

await step('Stripe platform auth', async () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return skip('Stripe platform auth', 'STRIPE_SECRET_KEY not present');
  const r = await fetch('https://api.stripe.com/v1/balance', {
    headers: { Authorization: `Bearer ${key}` },
  });
  // 200 = authenticated. 403 = authenticated but this restricted key lacks the
  // balance permission, which is expected for rk_live_ keys and still proves auth.
  // 401 = the key itself is rejected.
  if (r.status === 200) return pass('Stripe platform auth', 'authenticated (full access)');
  if (r.status === 403) return pass('Stripe platform auth', 'authenticated (restricted key, balance not permitted)');
  fail('Stripe platform auth', `-> ${r.status}`);
});

await step('Twilio readiness', async () => {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return skip('Twilio readiness', 'credentials not present');
  const sender = process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_PHONE_NUMBER;
  if (!sender) return fail('Twilio readiness', 'no messaging service SID and no phone number — every send would fail');
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
    headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64') },
  });
  r.status === 200
    ? pass('Twilio readiness', 'account reachable, sender configured')
    : fail('Twilio readiness', `account lookup -> ${r.status}`);
});

await step('notification path alive', async () => {
  // The poller has no health endpoint and its failure mode is silence. Recent
  // sms_log activity is the closest read-only proxy for "it is running".
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return skip('notification path alive', 'Supabase credentials not present');
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const r = await fetch(`${url}/rest/v1/sms_log?select=created_at&created_at=gte.${since}&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (r.status >= 400) return fail('notification path alive', `sms_log query -> ${r.status}`);
  const rows = await r.json();
  Array.isArray(rows) && rows.length
    ? pass('notification path alive', 'sms_log has activity in the last 7 days')
    : fail('notification path alive', 'no sms_log activity in 7 days — the poller may be silently disabled');
});

// ------------------------------------------------------------------ report
const failed = results.filter(r => r.status === 'fail');
const skipped = results.filter(r => r.status === 'skip');

if (asJson) {
  console.log(JSON.stringify({ ok: failed.length === 0, base: BASE, results }, null, 2));
  process.exit(failed.length === 0 ? 0 : 1);
}

const G = '[32m', R = '[31m', D = '[2m', X = '[0m';
const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (s, c) => (color ? `${c}${s}${X}` : s);

console.log(`SMOKE TEST — ${BASE}`);
console.log('');
for (const r of results) {
  const mark = r.status === 'pass' ? paint('✓', G) : r.status === 'fail' ? paint('✗', R) : paint('-', D);
  console.log(`  ${mark} ${r.name}`);
  console.log(`      ${paint(r.detail, D)}`);
}
console.log('');
if (failed.length === 0) {
  console.log(paint(`PASSED — ${results.length - skipped.length} check(s).`, G));
  if (skipped.length) console.log(paint(`${skipped.length} skipped (no credentials). Use --require-all in CI.`, D));
  process.exit(0);
}
console.log(paint(`FAILED — ${failed.length} check(s):`, R));
for (const r of failed) console.log(`  ${r.name}: ${r.detail}`);
process.exit(1);
