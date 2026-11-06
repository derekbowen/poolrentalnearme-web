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
  'src/components/TextUsBubble/textUsContent.js',
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

describe('the one approved phone number (businessFacts.textUsLine)', () => {
  // Derek approved ONE number for ONE widget on 2026-11-05: the "Text us"
  // bubble's text line. Everything else under notApproved stays unapproved,
  // including every other phone number in copy.
  const block = name => {
    const m = facts.match(new RegExp(`\\b${name}: Object\\.freeze\\(([\\s\\S]*?)\\n  \\}?\\]?\\),\\n`));
    return m ? m[1] : '';
  };
  const strings = s => (s.match(/'[^']*'/g) || []).map(q => q.slice(1, -1));

  it('leaves every notApproved entry in place, including "any support phone number"', () => {
    expect(strings(block('notApproved'))).toEqual([
      'typical host earnings per month or per year (any figure)',
      'payout speed ("24 hours", "instant")',
      'a platform-wide free-cancellation window (policies are per listing)',
      '"24/7 support line" and any support phone number',
      'city / host / customer / course counts',
      'a starting price per hour ("Starting at $25/hour")',
    ]);
  });

  it('records the line, its single surface, who approved it and when', () => {
    const line = block('textUsLine');
    // Parts, never the joined number (the bubble joins them at tap time).
    expect(line).toMatch(/e164Parts: Object\.freeze\(\['\+1', '855', '617', '82', '07'\]\)/);
    expect(line).toMatch(/approvedFor: 'src\/components\/TextUsBubble\/ \("Text us" help bubble\), text only'/);
    expect(line).toMatch(/approvedBy: 'Derek Bowen'/);
    expect(line).toMatch(/approvedOn: '2026-11-05'/);
  });

  it('is the only carve-out, and it narrows the support-phone entry to that line', () => {
    const ex = block('approvedExceptions');
    expect((ex.match(/notApproved:/g) || []).length).toBe(1);
    expect(ex).toContain(`notApproved: '"24/7 support line" and any support phone number'`);
    expect(ex).toContain(`allows: 'textUsLine, shown only by the "Text us" help bubble, as a number to text'`);
    expect(ex).toMatch(/approvedBy: 'Derek Bowen',\s+approvedOn: '2026-11-05'/);
  });

  it('is read only by the bubble, and written out on no copy surface', () => {
    // Only the bubble's content module may use the approved line.
    const users = [];
    const walk = dir => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(p);
        else if (/\.(js|jsx)$/.test(e.name) && !/\.test\.js$/.test(e.name) && read(p).includes('textUsLine')) {
          users.push(p);
        }
      }
    };
    walk('src');
    walk('server');
    expect(users.sort()).toEqual([
      'src/components/TextUsBubble/textUsContent.js',
      'src/config/businessFacts.js',
    ]);
    // No surface spells the line out (the bubble builds it from the parts).
    const digits = ['855', '617', '8207'];
    const spelled = new RegExp(
      [digits.join(''), digits.join('-'), `\\(${digits[0]}\\) ${digits[1]}-${digits[2]}`, digits.slice(1).join('-')].join('|')
    );
    for (const { p, t } of text) {
      const m = t.match(spelled);
      expect(m ? `${p}: "${m[0]}"` : null).toBeNull();
    }
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
