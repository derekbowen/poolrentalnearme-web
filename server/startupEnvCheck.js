/**
 * Startup configuration check.
 *
 * The failure mode this exists to kill: a production-critical credential goes
 * missing, a subsystem quietly switches itself off, and the site keeps serving
 * 200s while host notifications stop. That looks exactly like a quiet week. It
 * has already happened here — `poller.js` logs `DISABLED … Poller not started`
 * and returns, and `share-link-stats` answers `{total: 0}`, so a host sees a
 * truthful-looking zero.
 *
 * So on boot we say so, loudly, once, in a banner nobody can miss in the logs.
 *
 * Fatal-vs-loud, deliberately:
 *   Deployments are already blocked by scripts/preflight-production.js, which
 *   fails closed in CI before an image is built. That is the right place to stop
 *   a bad release. Making the *running server* exit on missing configuration
 *   would turn one absent optional-looking variable into a crash-loop on a box
 *   nobody can reach quickly — trading a silent subsystem for a total outage.
 *
 *   Default: log an unmissable banner and keep serving.
 *   `PRNM_STRICT_ENV=true`: refuse to start. Turn this on once production has
 *   been verified clean, and the failure mode becomes impossible rather than
 *   merely visible.
 *
 * Names only. No value is ever read into the log.
 */

// Mirrors scripts/check-env.js. Kept as a small explicit list rather than an
// import so the server has no dependency on the scripts directory at runtime.
const REQUIRED = [
  { service: 'Sharetribe', name: 'VITE_SHARETRIBE_SDK_CLIENT_ID' },
  { service: 'Sharetribe', name: 'SHARETRIBE_SDK_CLIENT_SECRET' },
  {
    service: 'Sharetribe',
    name: 'SHARETRIBE_INTEGRATION_SDK_CLIENT_ID',
    aliases: ['SHARETRIBE_INTEG_CLIENT_ID'],
  },
  {
    service: 'Sharetribe',
    name: 'SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET',
    aliases: ['SHARETRIBE_INTEG_CLIENT_SECRET'],
  },
  { service: 'Supabase', name: 'SUPABASE_URL' },
  { service: 'Supabase', name: 'SUPABASE_SERVICE_ROLE_KEY' },
  { service: 'Twilio', name: 'TWILIO_ACCOUNT_SID' },
  { service: 'Twilio', name: 'TWILIO_AUTH_TOKEN' },
  { service: 'Twilio', name: 'TWILIO_MESSAGING_SERVICE_SID', aliases: ['TWILIO_PHONE_NUMBER'] },
  { service: 'Stripe', name: 'STRIPE_SECRET_KEY' },
  { service: 'Marketplace', name: 'VITE_MARKETPLACE_ROOT_URL' },
];

// What actually stops working, so the log says why it matters rather than just
// naming a variable.
const IMPACT = {
  Sharetribe: 'listing reads/writes, host lookup, promo codes, calendar sync',
  Supabase: 'host notifications, share-link click tracking, reply routing, concierge',
  Twilio: 'every outbound and inbound SMS',
  Stripe: 'payout history and identity verification',
  Marketplace: 'absolute URLs in emails, SMS and iCal links',
};

const isSet = name => {
  const v = process.env[name];
  return typeof v === 'string' && v.trim() !== '';
};

export const missingRequired = () =>
  REQUIRED.filter(r => !isSet(r.name) && !(r.aliases || []).some(isSet));

export const checkStartupEnv = (logger = console) => {
  const missing = missingRequired();
  if (missing.length === 0) {
    logger.info?.('[startup] configuration OK — all production-critical variables present');
    return { ok: true, missing: [] };
  }

  const byService = missing.reduce((acc, m) => {
    (acc[m.service] = acc[m.service] || []).push(m.name);
    return acc;
  }, {});

  const lines = [
    '',
    '='.repeat(72),
    `MISSING PRODUCTION-CRITICAL CONFIGURATION — ${missing.length} variable(s)`,
    '='.repeat(72),
  ];
  for (const [service, names] of Object.entries(byService)) {
    lines.push(`  ${service}  —  degraded: ${IMPACT[service] || 'unknown'}`);
    for (const n of names) lines.push(`    missing: ${n}`);
  }
  lines.push('');
  lines.push('  These subsystems will appear healthy while doing nothing.');
  lines.push('  See docs/INFRASTRUCTURE_SECRET_AUDIT.md for where each belongs.');
  lines.push('='.repeat(72));
  lines.push('');
  const banner = lines.join('\n');

  if (String(process.env.PRNM_STRICT_ENV).toLowerCase() === 'true') {
    (logger.error || console.error)(banner);
    (logger.error || console.error)('[startup] PRNM_STRICT_ENV=true — refusing to start.');
    process.exit(1);
  }

  (logger.error || console.error)(banner);
  return { ok: false, missing: missing.map(m => m.name) };
};

export default checkStartupEnv;
