// One-time (or re-runnable, idempotent) invite blast: text every host with a
// verified phone the reply-to-accept BETA opt-in invite. Respects opt-outs,
// skips test accounts and already-enrolled hosts, rate-limits for the toll-free
// number, logs every send to sms_log. Set BLAST_DRY_RUN=true to preview counts
// without sending a single text.
//
// Gates, in order: opt-out (STOP) → already enrolled → marketing consent.
// Consent defaults to fail-closed for accounts that predate the signup
// checkbox; see consent.js and SMS_MARKETING_UNKNOWN_POLICY. Always dry-run
// first and read skipped_marketing_unknown before deciding that policy.
//
// Run:  docker exec poolrentalnearme-production sh -lc 'BLAST_DRY_RUN=true bun /path/betablast.js'

const sdk = require('api-util/integration');
const twsend = require('./twsend');
const store = require('./supastore');
const { isTestAccount } = require('./exclude');
const consent = require('./consent');

const DRY = process.env.BLAST_DRY_RUN === 'true';
const THROTTLE_MS = Number(process.env.BLAST_THROTTLE_MS || 400); // toll-free ~3/s
const log = (...a) => console.log('[beta-blast]', ...a);

const INVITE =
  'Pool Rental Near Me (BETA): you can now accept or decline booking requests right by text — reply 1 to accept, 2 to decline. Reply YES to turn it on. Reply STOP to opt out, HELP for help.';

const toE164 = raw => {
  if (!raw) return '';
  const s = String(raw).trim();
  if (s.startsWith('+')) return s.replace(/[^\d+]/g, '');
  const d = s.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d[0] === '1') return `+${d}`;
  return d ? `+${d}` : '';
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Every host (author of a published listing) with a valid phone → {phone,name}.
const collectHosts = async () => {
  const hosts = new Map();
  let page = 1, pages = 1;
  do {
    const res = await sdk.listings.query(
      {
        states: ['published'],
        perPage: 100,
        page,
        include: ['author'],
        // `email` is not optional here even though nothing prints it:
        // isTestAccount() matches on it, and a sparse fieldset that omits it
        // returns users with no email at all, so the test-account guard
        // silently passed every synthetic account through.
        'fields.user': ['email', 'profile.displayName', 'profile.protectedData'],
      },
      { allowRawResponse: true }
    );
    const raw = res._raw.data;
    pages = raw.meta?.totalPages || 1;
    for (const u of (raw.included || []).filter(i => i.type === 'user')) {
      const phone = toE164(u.attributes?.profile?.protectedData?.phoneNumber);
      if (!phone || phone.length < 12) continue;
      const state = consent.marketingConsentState(u);
      const existing = hosts.get(phone);
      if (!existing) {
        hosts.set(phone, {
          phone,
          name: u.attributes?.profile?.displayName || '',
          userId: u.id.uuid,
          email: u.attributes?.email || '',
          isTest: isTestAccount(u),
          marketingConsent: state,
        });
        continue;
      }
      // Two accounts sharing one phone. Dedup is per-phone but consent is
      // per-account, so first-write-wins would let a page-order accident
      // decide whether a recorded "no" counts. Merge to the most restrictive
      // answer instead, and let either account mark the number synthetic.
      existing.marketingConsent = consent.mostRestrictive(existing.marketingConsent, state);
      existing.isTest = existing.isTest || isTestAccount(u);
    }
    page++;
  } while (page <= pages && page <= 50);
  return [...hosts.values()];
};

const run = async () => {
  const hosts = await collectHosts();
  const policy = consent.unknownPolicy();
  log(`hosts with valid phone: ${hosts.length}  (DRY_RUN=${DRY}, unknown-consent policy=${policy})`);
  const stats = {
    sent: 0,
    skipped_opted_out: 0,
    skipped_enrolled: 0,
    // Counted, not dropped silently during collection: an over-broad exclude
    // rule has to be visible in a dry run, not invisible upstream of stats.
    skipped_test_account: 0,
    // Split deliberately: 'denied' is a host who unticked the box, 'unknown'
    // is a host who signed up before the box existed. Only the second number
    // moves if the policy flag changes, so a dry run has to show them apart.
    skipped_marketing_denied: 0,
    skipped_marketing_unknown: 0,
    failed: 0,
    dry_would_send: 0,
  };
  for (const host of hosts) {
    const { phone } = host;
    if (host.isTest) {
      stats.skipped_test_account++;
      log('skipped test account', host.email || phone);
      continue;
    }
    if (await store.isOptedOut(phone)) { stats.skipped_opted_out++; continue; }
    if (await store.isBetaEnrolled(phone)) { stats.skipped_enrolled++; continue; }
    if (!consent.isMarketingAllowed(host.marketingConsent, policy)) {
      if (host.marketingConsent === consent.DENIED) stats.skipped_marketing_denied++;
      else stats.skipped_marketing_unknown++;
      continue;
    }
    if (DRY) { stats.dry_would_send++; continue; }
    try {
      const msg = await twsend({ body: INVITE, phoneNumber: phone });
      await store.logOutcome({ event_type: 'beta_invite', status: 'sent', recipient_role: 'provider', phone, twilio_sid: msg?.sid || null });
      stats.sent++;
      log('invited', phone, msg?.sid);
    } catch (e) {
      if (e && (e.code === 21610 || /opted out/i.test(e.message || ''))) {
        await store.setOptOut(phone, true, host.userId);
        await store.logOutcome({ event_type: 'beta_invite', status: 'skipped_opted_out', recipient_role: 'provider', phone, error: '21610' });
        stats.skipped_opted_out++;
      } else {
        await store.logOutcome({ event_type: 'beta_invite', status: 'failed', recipient_role: 'provider', phone, error: String(e.message || e).slice(0, 300) });
        stats.failed++;
        log('FAILED', phone, e.message);
      }
    }
    await sleep(THROTTLE_MS);
  }
  log('DONE', JSON.stringify(stats));
  return stats;
};

if (require.main === module) {
  run().then(() => process.exit(0)).catch(e => { log('FATAL', e.message); process.exit(1); });
}
module.exports = { run, INVITE, collectHosts };
