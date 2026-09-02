/**
 * Rendered-content regression: the marketplace's customer-facing strings must
 * agree with the approved business facts, and must not carry any of the
 * unapproved claim shapes the 2026-09-01 audit found live.
 *
 * Lives in server/ (CJS) because the src/ jest path cannot parse JSX in this
 * repo. It reads the source files as text on purpose: the point is what a
 * reader sees, not what a module exports.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

const facts = read('src/config/businessFacts.js');
const hostFee = Number((facts.match(/hostServiceFeePercent:\s*(\d+)/) || [])[1]);
const renterFee = Number((facts.match(/renterServiceFeePercent:\s*(\d+)/) || [])[1]);

// Customer-facing text surfaces in THIS repo.
const SURFACES = [
  'src/translations/en.json',
  'src/containers/TermsOfServicePage/terms-2026-1.js',
  'src/containers/LandingPage/PremiumLandingPage.jsx',
  'server/extensions/sms-messaging/mod/notify/messages.js',
  'server/extensions/sms-messaging/mod/notify/welcome.js',
  'server/extensions/sms-messaging/mod/notify/betablast.js',
];
const text = SURFACES.filter(p => fs.existsSync(path.join(ROOT, p)))
  .map(p => ({ p, t: read(p) }));

describe('approved business facts', () => {
  it('are the values the Terms of Service state', () => {
    // ToS §4.1 is the authority; if the ToS changes, this test is the alarm.
    const tos = read('src/containers/TermsOfServicePage/terms-2026-1.js');
    expect(tos).toMatch(/Host Service Fee:\*\* Zero percent \(0%\)/);
    expect(tos).toMatch(/Renter Service Fee:\*\* Fifteen percent \(15%\)/);
    expect(hostFee).toBe(0);
    expect(renterFee).toBe(15);
  });
});

describe('customer-facing copy in this repo', () => {
  it('never states a non-zero host fee', () => {
    // "10% host fee", "5% host fee", "host fee of 12%" — any of these is a lie
    // against the ToS. The 0% form is the only allowed one.
    const bad = /\b([1-9]\d?)%\s*(host|provider)\s*(service\s*)?fee|\b(host|provider)\s*(service\s*)?fee[^.\n]{0,20}\b([1-9]\d?)%/i;
    for (const { p, t } of text) {
      const m = t.match(bad);
      expect(m ? `${p}: "${m[0]}"` : null).toBeNull();
    }
  });

  it('never tells a host their net is "after" a fee', () => {
    const bad = /net\s*\(after\s*\d+%\s*fee\)|after\s+(a\s+)?\d+%\s+(host\s+)?fee/i;
    for (const { p, t } of text) {
      const m = t.match(bad);
      expect(m ? `${p}: "${m[0]}"` : null).toBeNull();
    }
  });

  it('carries none of the unapproved claim shapes', () => {
    const unapproved = [
      [/hosts?\s+(typically\s+)?(earn|make)\s+(up\s+to\s+)?\$[\d,]+/i, 'host earnings estimate'],
      [/payouts?\s+(in|within)\s+24\s*hours|24-hour payouts|get paid in 24 hours/i, 'payout-speed claim'],
      [/free cancellation up to \d+ hours/i, 'platform-wide cancellation window'],
      [/24\/7 support/i, '24/7 support claim'],
      [/starting at \$\d+\s*(\/|per|an?)\s*h(ou)?r/i, 'starting-price claim'],
    ];
    // Hits that were live when this gate was introduced and are awaiting the
    // founder's decision (house rule 5: an unsourced claim is not mine to
    // settle). Listed exactly so the gate still fails on any NEW occurrence.
    // Remove an entry once Derek approves the wording or the copy is changed.
    const KNOWN_PENDING_REVIEW = new Set([
      'src/containers/LandingPage/PremiumLandingPage.jsx: 24/7 support claim: "24/7 Support"',
    ]);
    for (const { p, t } of text) {
      for (const [re, label] of unapproved) {
        const m = t.match(re);
        const hit = m ? `${p}: ${label}: "${m[0]}"` : null;
        if (hit && KNOWN_PENDING_REVIEW.has(hit)) continue;
        expect(hit).toBeNull();
      }
    }
  });
});
