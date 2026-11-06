// "Text us" bubble: the ONE content module (roles, topics, canned answers)
// plus the pure builders for the prefilled text and the sms:/mailto: links.
// No React, no CSS, no browser globals: bun tests import this directly.
//
// Content rules (CLAUDE.md rules 1 and 8):
//   - Every topic below is Derek's approved wording, word for word: approved
//     by Derek Bowen on 2026-11-05 ("Approve all"). The approved record is
//     textUsContent.approved.json next to this file, and textUsContent.test.js
//     fails if any id, label, answer, link or human-only flag here drifts from
//     it. Do not reword, add or drop a topic without a new approval.
//   - Human-only topics (`humanOnly: true`) carry Derek's approved hand-off
//     line as their answer and no link: they send the visitor to "Text us".
//   - Nothing is signed and no person is named.
//   - Fee figures come from src/config/businessFacts.js, never hard-coded,
//     and so does the text line (businessFacts.textUsLine).
//   - Links are relative, so a visitor on .co.uk, .ca or .com.au stays on that
//     domain (every host serves the whole site).
//
// The insurance-language gate (scripts/check-insurance-language.sh) matches
// this file because of Derek's approved host topic id/label
// host-insurance-damage / "Insurance, damage, injury or a dispute". It was
// accepted deliberately into scripts/insurance-language.baseline: the topic
// is human-only and makes no statement about insurance.
import BUSINESS_FACTS from '../../config/businessFacts';

const FEES = BUSINESS_FACTS.fees;

export const SUPPORT_EMAIL = 'support@poolrentalnearme.com';

// The PRNM business text line, in pieces so it never appears as one string in
// page HTML or in the bundle. Joined only inside the builders below, which run
// when a visitor taps "Text us".
const PHONE_PARTS = BUSINESS_FACTS.textUsLine.e164Parts;

const phoneE164 = () => PHONE_PARTS.join('');

export const phoneDisplay = () =>
  `(${PHONE_PARTS[1]}) ${PHONE_PARTS[2]}-${PHONE_PARTS[3]}${PHONE_PARTS[4]}`;

export const ROLES = Object.freeze([
  Object.freeze({ id: 'swimmer', label: "I'm a swimmer", hint: 'Guest who books pools' }),
  Object.freeze({ id: 'host', label: "I'm a host", hint: 'Pool owner' }),
  Object.freeze({ id: 'other', label: 'Something else', hint: '' }),
]);

const topic = (role, id, label, humanOnly, answer, link = null) =>
  Object.freeze({
    role,
    id,
    label,
    humanOnly,
    answer,
    link: link ? Object.freeze({ label: link[0], href: link[1] }) : null,
  });

const SAFETY_HANDOFF =
  "If anyone is hurt or in danger, call 911 first. This one needs a person. Text us and we'll get back to you.";
const FEE_TERMS = ['See our fee terms', '/terms-of-service#4-1-fee-structure'];
const YOUR_BOOKINGS = ['See your bookings', '/inbox/orders'];
const YOUR_LISTINGS = ['Your listings', '/listings'];

export const TOPICS = Object.freeze([
  // ---- swimmer ------------------------------------------------------------
  topic(
    'swimmer',
    'swimmer-booking',
    'How booking works',
    false,
    "Find a pool, pick a time and send your booking request. You're not charged until the host accepts (your card may show a temporary hold), and some pools accept instantly. You'll be notified when it's confirmed. Each host sets house rules, so read the listing first and message the host with any questions.",
    ['Find a pool', '/s']
  ),
  topic(
    'swimmer',
    'swimmer-price',
    'What the price includes',
    false,
    'Hosts set their own rates. ' +
      `The price shown on listings and in search already includes our ${FEES.renterServiceFeePercent}% guest service fee. ` +
      'Some pools add other charges, like paid add-ons. Checkout lists every charge and your full total before you pay.',
    FEE_TERMS
  ),
  topic(
    'swimmer',
    'swimmer-no-reply',
    'No reply from the host',
    false,
    "You're not charged until the host accepts. You can message the host from your booking page. If they don't reply in time, the request expires and any hold on your card is released automatically (your bank may show it pending a few days). If your swim is coming up soon, text us.",
    YOUR_BOOKINGS
  ),
  topic(
    'swimmer',
    'swimmer-cancel',
    'Cancelling or changing',
    false,
    'Some pools list their cancellation terms on the listing page, under "Things to know". To cancel or change a booking, text us your booking details and we\'ll help.',
    YOUR_BOOKINGS
  ),
  topic(
    'swimmer',
    'swimmer-rules',
    'Pool rules',
    false,
    'Each host sets house rules, so check "Things to know" on the listing and your booking details. At every pool: no diving, no glass, no pets or alcohol unless the listing allows them, under-16s need continuous adult supervision, and bring only the guests you booked.',
    ['Rules at every pool', '/terms-of-service#7-3-prohibited-activities']
  ),
  topic(
    'swimmer',
    'swimmer-safety-dispute',
    'Safety, injury, damage or a refund dispute',
    true,
    SAFETY_HANDOFF
  ),

  // ---- host ---------------------------------------------------------------
  topic(
    'host',
    'host-listing',
    'Listing my pool',
    false,
    'Start on our listing page: choose your space, upload at least 3 photos, check the details we fill in, then set your rates and availability. ' +
      "When you publish, we'll take you straight to setting up how you get paid. " +
      `Listing is free, and you keep ${FEES.hostKeepsPercent}% of your listed price.`,
    ['Start your listing', '/wizard/']
  ),
  topic(
    'host',
    'host-fees',
    'Fees & pricing',
    false,
    'You set your own price and can change it any time. You can also offer paid add-ons. ' +
      `We charge hosts ${FEES.hostServiceFeePercent}%, so you keep ${FEES.hostKeepsPercent}% of your listed price. ` +
      `Guests pay a separate ${FEES.renterServiceFeePercent}% service fee, shown in their total before they book. ` +
      "It's our published fee, not a promo.",
    FEE_TERMS
  ),
  topic(
    'host',
    'host-payouts',
    'Getting paid',
    false,
    "Add your bank under Account settings, then Payout details. We'll prompt you right after you publish, and you'll need it set up to accept bookings. Once a booking completes, your money is paid out to your bank automatically. Your Payouts page shows each payout and when it arrives.",
    ['Your payouts', '/account/payouts']
  ),
  topic(
    'host',
    'host-calendar',
    'Calendar & availability',
    false,
    'Go to Your listings, edit your pool and open the Calendar tab. Every day stays open for bookings until you block it. You can block a whole date range, or only the weekdays or weekends in it. Hourly listings with a weekly schedule can also block specific hours.',
    YOUR_LISTINGS
  ),
  topic(
    'host',
    'host-more-bookings',
    'Getting more bookings',
    false,
    "Use clear photos that show your pool as it is today, and list your amenities and house rules. Reply to messages fast and accept requests before they expire. Once your payout details are set up, you can turn on instant booking in your listing's Price tab so requests are accepted automatically.",
    YOUR_LISTINGS
  ),
  // Human-only (house rule 8: insurance goes to Derek). Approved label; see
  // the insurance-gate note at the top of this file.
  topic(
    'host',
    'host-insurance-damage',
    'Insurance, damage, injury or a dispute',
    true,
    SAFETY_HANDOFF
  ),

  // ---- something else -----------------------------------------------------
  topic(
    'other',
    'other-partnerships',
    'Partnerships & press',
    true,
    "This one's best with a person. Text us who you are and what you have in mind, and we'll get back to you."
  ),
  topic(
    'other',
    'other-not-working',
    "Something isn't working",
    false,
    'Sorry about that! Text us what you were trying to do, what happened, and your booking reference if you have one. If one of our systems fails and you lose money because of it, we make it right on our end.',
    ['Platform failure policy', '/host-standards#8-platform-failures']
  ),
  topic(
    'other',
    'other-account-privacy',
    'Delete my account or data',
    true,
    "This one needs a person. Text us and we'll get back to you."
  ),
  topic(
    'other',
    'other-general',
    'Another question',
    true,
    "Text us your question and we'll get back to you."
  ),
]);

export const topicsFor = (roleId) => TOPICS.filter((t) => t.role === roleId);

export const findTopic = (roleId, topicId) =>
  TOPICS.find((t) => t.role === roleId && t.id === topicId) || null;

// The opening line of the visitor's text. These are EXACT: the SMS webhook
// recognises them (server/extensions/sms-messaging/mod/notify/routing.js,
// isBubbleOpener) and routes the conversation to both founders. Straight
// apostrophe in "I'm".
export const buildPrefill = (roleId, topicLabel) => {
  const label = String(topicLabel == null ? '' : topicLabel).trim();
  if (roleId === 'swimmer') {
    return `Hi! I'm a swimmer on Pool Rental Near Me. Question about ${label}: `;
  }
  if (roleId === 'host') {
    return `Hi! I'm a host on Pool Rental Near Me. Question about ${label}: `;
  }
  return 'Hi! I have a question about Pool Rental Near Me: ';
};

// The sms: form already used in this repo; it works on iOS and Android.
export const buildSmsHref = (text) => `sms:${phoneE164()}?&body=${encodeURIComponent(text)}`;

export const buildMailtoHref = (text) =>
  `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(String(text).trimEnd())}`;
