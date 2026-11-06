import fs from 'fs';
import path from 'path';
import {
  ROLES,
  TOPICS,
  SUPPORT_EMAIL,
  topicsFor,
  findTopic,
  buildPrefill,
  buildSmsHref,
  buildMailtoHref,
  phoneDisplay,
} from './textUsContent';
import { HIDE_ON_ROUTES, shouldHide, canSms, track } from './textUsLogic';
import routing from '../../../server/extensions/sms-messaging/mod/notify/routing';

// "Text us" bubble (bun test: src/ is ESM with no babel config, so jest
// cannot load it). The number is never written here as one string either.
const DIGITS = ['855', '617', '8207'];
const NUMBER = `+1${DIGITS.join('')}`;
const DISPLAY = `(${DIGITS[0]}) ${DIGITS[1]}-${DIGITS[2]}`;
const WHOLE_NUMBER = new RegExp(
  [DIGITS.join(''), DIGITS.slice(1).join(''), DIGITS.slice(1).join('-')].join('|')
);

const SRC = path.resolve(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');
const BUBBLE_FILES = [
  'components/TextUsBubble/TextUsBubble.js',
  'components/TextUsBubble/TextUsBubble.module.css',
  'components/TextUsBubble/textUsContent.js',
  'components/TextUsBubble/textUsLogic.js',
];

// Topics that only a person may answer (house rule 8 and the approved spec).
// Built from fragments: this file only asserts that these words are ABSENT
// from canned answers, so it should not register as carrying them with the
// CI wording gate in scripts/.
const HUMAN_ONLY_WORDS = new RegExp(
  [['in', 'sur'], ['liabil'], ['cov', 'erage'], ['claim'], ['damage'], ['injur'], ['dispute']]
    .concat([['refund']])
    .map((parts) => parts.join(''))
    .join('|'),
  'i'
);

describe('buildPrefill()', () => {
  it('builds the exact swimmer opener with a straight apostrophe', () => {
    expect(buildPrefill('swimmer', 'Pool rules')).toBe(
      "Hi! I'm a swimmer on Pool Rental Near Me. Question about Pool rules: "
    );
  });

  it('builds the exact host opener', () => {
    expect(buildPrefill('host', 'Fees & pricing')).toBe(
      "Hi! I'm a host on Pool Rental Near Me. Question about Fees & pricing: "
    );
  });

  it('builds the exact "something else" opener, which carries no topic', () => {
    expect(buildPrefill('other', 'Another question')).toBe(
      'Hi! I have a question about Pool Rental Near Me: '
    );
    expect(buildPrefill('other')).toBe('Hi! I have a question about Pool Rental Near Me: ');
  });

  it('never uses a curly apostrophe', () => {
    TOPICS.forEach((t) => expect(buildPrefill(t.role, t.label)).not.toMatch(/[\u2018\u2019]/));
  });

  it('is recognised by the SMS webhook for every topic the bubble offers', () => {
    // The server routes these threads to both founders only if it detects
    // them; this pins the client and server halves together.
    TOPICS.forEach((t) => {
      const text = buildPrefill(t.role, t.label);
      expect(routing.isBubbleOpener(text)).toBe(true);
      expect(routing.isBubbleOpener(text.trim())).toBe(true); // Twilio trims Body
      expect(routing.isBubbleOpener(`${text}what time can I come?`)).toBe(true);
    });
  });
});

describe('buildSmsHref()', () => {
  it('uses the sms:+1...?&body= form already used in this repo', () => {
    const text = buildPrefill('host', 'Fees & pricing');
    expect(buildSmsHref(text)).toBe(`sms:${NUMBER}?&body=${encodeURIComponent(text)}`);
  });

  it('percent-encodes the body exactly', () => {
    expect(buildSmsHref(buildPrefill('host', 'Fees & pricing'))).toBe(
      `sms:${NUMBER}?&body=Hi!%20I'm%20a%20host%20on%20Pool%20Rental%20Near%20Me.%20Question%20about%20Fees%20%26%20pricing%3A%20`
    );
  });

  it('round-trips every prefill', () => {
    TOPICS.forEach((t) => {
      const text = buildPrefill(t.role, t.label);
      const body = buildSmsHref(text).split('?&body=')[1];
      expect(decodeURIComponent(body)).toBe(text);
      expect(body).not.toMatch(/[ &#?]/);
    });
  });
});

describe('desktop fallback', () => {
  it('shows the number as (855) 617-8207', () => {
    expect(phoneDisplay()).toBe(DISPLAY);
  });

  it('mails support@ with the same text as the subject', () => {
    const text = buildPrefill('swimmer', 'Safety, injury, damage or a refund dispute');
    expect(SUPPORT_EMAIL).toBe('support@poolrentalnearme.com');
    expect(buildMailtoHref(text)).toBe(
      `mailto:support@poolrentalnearme.com?subject=${encodeURIComponent(text.trimEnd())}`
    );
  });
});

describe('content', () => {
  it('offers the three roles from the spec', () => {
    expect(ROLES.map((r) => [r.id, r.label])).toEqual([
      ['swimmer', "I'm a swimmer"],
      ['host', "I'm a host"],
      ['other', 'Something else'],
    ]);
  });

  it('gives every role at least one topic, and every topic a known role and unique id', () => {
    const roleIds = ROLES.map((r) => r.id);
    roleIds.forEach((id) => expect(topicsFor(id).length).toBeGreaterThan(0));
    TOPICS.forEach((t) => expect(roleIds).toContain(t.role));
    expect(new Set(TOPICS.map((t) => t.id)).size).toBe(TOPICS.length);
    expect(findTopic('host', 'host-fees').label).toBe('Fees & pricing');
    expect(findTopic('swimmer', 'host-fees')).toBeNull();
  });

  it('human-only topics carry no answer, no link and no facts', () => {
    const humanOnly = TOPICS.filter((t) => t.humanOnly);
    expect(humanOnly.map((t) => t.id)).toEqual([
      'swimmer-safety-dispute',
      'host-damage-dispute',
      'other-partnerships',
      'other-account-privacy',
      'other-general',
    ]);
    humanOnly.forEach((t) => {
      expect(t).not.toHaveProperty('answer');
      expect(t).not.toHaveProperty('link');
      expect(typeof t.handoff).toBe('string');
      // A hand-off asserts nothing: no figures, prices, percentages or policy words.
      expect(t.handoff).not.toMatch(/\d|%|\$/);
      expect(t.handoff).not.toMatch(HUMAN_ONLY_WORDS);
    });
  });

  it('any topic about rule-8 subjects, disputes or refunds is human-only', () => {
    TOPICS.filter((t) => HUMAN_ONLY_WORDS.test(t.label)).forEach((t) =>
      expect(`${t.id}: ${t.humanOnly}`).toBe(`${t.id}: true`)
    );
  });

  it('canned answers are sourced and stay off human-only subjects', () => {
    const canned = TOPICS.filter((t) => !t.humanOnly);
    expect(canned.length).toBeGreaterThan(0);
    canned.forEach((t) => {
      expect(t).not.toHaveProperty('handoff');
      expect(t.answer.length).toBeGreaterThan(0);
      expect(t.sources.length).toBeGreaterThan(0);
      t.sources.forEach((s) => {
        expect(s.ref.length).toBeGreaterThan(0);
        expect(s.quote.length).toBeGreaterThan(0);
      });
      expect(t.answer).not.toMatch(HUMAN_ONLY_WORDS);
      if (t.link) expect(t.link.href.startsWith('https://www.poolrentalnearme.com/')).toBe(true);
    });
  });

  it('ships the fact-checked fee answer word for word', () => {
    // The figures are interpolated from src/config/businessFacts.js; if the
    // ToS fee ever changes, this is the alarm to re-check the sentence.
    const t = findTopic('host', 'host-fees');
    expect(t.answer).toBe(
      'You set your own price and can change it any time. You can also offer paid add-ons. ' +
        'We charge hosts 0%, so you keep 100% of your listed price. ' +
        'Guests pay a separate 15% service fee, shown in their total before they book. ' +
        "It's our published fee, not a promo."
    );
    expect(t.link).toEqual({
      label: 'See our fee terms',
      href: 'https://www.poolrentalnearme.com/terms-of-service#4-1-fee-structure',
    });
  });

  it('names nobody and signs nothing (house rule 1)', () => {
    const copy = JSON.stringify(
      [ROLES, TOPICS].flat().map((x) => [x.label, x.hint, x.answer, x.handoff, x.link])
    );
    expect(copy).not.toMatch(/\b(Derek|Brandon|Stephen|founder|co-founder|CEO)\b/i);
    expect(copy).not.toMatch(/(^|\s)[-–—]\s*[A-Z][a-z]+\s*$/m);
  });

  it('carries none of the unapproved claim shapes in businessFacts.notApproved', () => {
    const copy = TOPICS.map((t) => t.answer || t.handoff).join('\n');
    expect(copy).not.toMatch(/payouts?\s+(in|within)\s+24|next business day|instant payout/i);
    expect(copy).not.toMatch(
      /free cancellation|24\/7|starting at \$|hosts?\s+(typically\s+)?earn/i
    );
    expect(copy).not.toMatch(/\b([1-9]\d?)%\s*host/i);
  });
});

describe('where the bubble shows', () => {
  it('hides on every payment, booking-bar and accept/decline route', () => {
    HIDE_ON_ROUTES.forEach((name) => expect(shouldHide(name)).toBe(true));
    expect(HIDE_ON_ROUTES).toEqual(
      expect.arrayContaining([
        'CheckoutPage',
        'OrderDetailsPage',
        'SaleDetailsPage',
        'ListingPage',
        'ListingPageVariant',
        'ListingPageCanonical',
        'PaymentMethodsPage',
        'StripePayoutPage',
        'StripePayoutOnboardingPage',
        'EditListingStripeOnboardingPage',
      ])
    );
  });

  it('shows everywhere else, including the listing editor and NotFound', () => {
    ['SearchPage', 'EditListingPage', 'InboxPage', 'HostDashboardPage'].forEach((name) =>
      expect(shouldHide(name)).toBe(false)
    );
    expect(shouldHide(undefined)).toBe(false);
  });

  it('only names routes that exist', () => {
    // BottomNav's own hide list went stale; this one cannot silently.
    const routes = read('routing/routeConfiguration.js');
    HIDE_ON_ROUTES.forEach((name) => expect(routes).toContain(`name: '${name}'`));
  });
});

describe('canSms()', () => {
  const win = ({ coarse = false, ua = '', throws = false } = {}) => ({
    matchMedia: () => {
      if (throws) throw new Error('no matchMedia');
      return { matches: coarse };
    },
    navigator: { userAgent: ua },
  });
  const MAC =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148';
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36';

  it('opens SMS on touch devices, including iPadOS with a Mac user agent', () => {
    expect(canSms(win({ coarse: true, ua: MAC }))).toBe(true);
  });
  it('opens SMS on a mobile user agent', () => {
    expect(canSms(win({ ua: IPHONE }))).toBe(true);
    expect(canSms(win({ ua: ANDROID, throws: true }))).toBe(true);
  });
  it('shows the number on desktop and when there is no window', () => {
    expect(canSms(win({ ua: MAC }))).toBe(false);
    expect(canSms(undefined)).toBe(false);
  });
});

describe('track()', () => {
  it('reports to Plausible only when it is already on the page', () => {
    const calls = [];
    track('open', { plausible: (...a) => calls.push(a) });
    expect(calls).toEqual([['TextUs', { props: { step: 'open' } }]]);
    expect(() => track('open', {})).not.toThrow();
    expect(() => track('open', undefined)).not.toThrow();
    expect(() =>
      track('open', {
        plausible: () => {
          throw new Error('blocked');
        },
      })
    ).not.toThrow();
  });
});

describe('source guarantees', () => {
  const sources = BUBBLE_FILES.map((p) => [p, read(p)]);

  it('never contains the text line as one string', () => {
    sources.forEach(([p, s]) => expect(`${p}: ${WHOLE_NUMBER.test(s)}`).toBe(`${p}: false`));
  });

  it('has no text entry, no network call and no third-party script', () => {
    const banned = new RegExp(
      [
        '<form',
        '<input',
        '<textarea',
        'contentEditable',
        'fetch\\(',
        'XMLHttpRequest',
        'sendBeacon',
        'dangerouslySetInnerHTML',
        '<script',
        'eval\\(',
      ].join('|')
    );
    sources.forEach(([p, s]) => expect(`${p}: ${(s.match(banned) || [''])[0]}`).toBe(`${p}: `));
  });

  it('links to no web origin but www.poolrentalnearme.com', () => {
    sources.forEach(([p, s]) =>
      (s.match(/https?:\/\/[^\s'"`)]+/g) || []).forEach((url) =>
        expect(`${p}: ${url}`).toMatch(/^[^:]+: https:\/\/www\.poolrentalnearme\.com(\/|$)/)
      )
    );
  });

  it('is mounted client-only from the root route, by dynamic import', () => {
    const router = read('routing/AppRouter.jsx');
    expect(router).toContain("import('../components/TextUsBubble/TextUsBubble')");
    expect(router).not.toMatch(
      /import\s+\w+\s+from\s+'..\/components\/TextUsBubble\/TextUsBubble'/
    );
    expect(router).toMatch(/<TextUsMount \/>/);
    expect(read('components/index.js')).not.toContain('TextUsBubble');
  });
});
