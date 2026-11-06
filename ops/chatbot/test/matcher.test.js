'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('./helpers');
const { roleOfCategory } = require('../engine/matcher');

const { entries, engine } = loadEngine();
const m = engine.matcher;

test('every question and every variant matches its own entry (905 phrasings)', () => {
  const misses = [];
  let n = 0;
  for (const e of entries) {
    // The same wording can belong to a guest entry and a host entry ("instant book");
    // the remembered role picks between them, so self-match runs with the entry's role.
    const role = roleOfCategory(e.category);
    for (const text of [e.question, ...e.variants]) {
      n++;
      const r = m.match(text, { role });
      if (r.status !== 'confident' || r.top.id !== e.id)
        misses.push(`${e.id}: "${text}" -> ${r.status} ${r.top && r.top.id}`);
    }
  }
  assert.equal(n, 905);
  assert.deepEqual(misses, []);
});

test('guest/host twins without a known role: never guess, ask the role', () => {
  for (const text of ['instant book?', 'promo code', 'discount code', 'update price']) {
    const r = m.match(text, {});
    assert.notEqual(r.status, 'confident', text);
    assert.equal(r.needsRole, true, text);
  }
  assert.equal(m.match('instant book', { role: 'swimmer' }).top.id, 'booking-instant-vs-request');
  assert.equal(m.match('instant book', { role: 'host' }).top.id, 'host-pricing-08');
});

// Invented typo / slang / shorthand phrasings, at least 3 per category. None of these strings is in the bank.
const TYPO_CASES = [
  // booking
  ['hw do i book a pool', 'booking-how-to-book'],
  ['can i book for 2morrow', 'booking-same-day'],
  ['do i hav to make an acount to book', 'booking-account-required'],
  ['host aint replied to my request yet', 'booking-host-no-reply'],
  ['how many ppl can i bring', 'booking-guest-count'],
  ['can i book a pool rn', 'booking-same-day'],
  ['is my bookin confirmd', 'booking-status'],
  // prices and payments
  ['r there any hidden fees', 'pay-all-in-price'],
  ['can i venmo the owner', 'pay-off-platform'],
  ['do u guys take paypal', 'pay-methods'],
  ['my card got declind', 'pay-payment-failed'],
  ['wen will my card get charged', 'pay-when-charged'],
  // cancellations and changes
  ['i need 2 cancel my reservaton', 'cancel-how'],
  ['can i reschedual my booking', 'cancel-reschedule'],
  ['wats the cancelation policy', 'cancel-policy'],
  ['can we stay longer pls', 'cancel-extend-time'],
  // pool rules and amenities
  ['can i bring my pupy', 'rules-pets'],
  ['is alchohol ok at the pool', 'rules-alcohol-glass'],
  ['can my kids swim w/o an adult', 'rules-kids-supervision'],
  ['is the water heatd', 'amenity-heated'],
  ['wat r the house rulez', 'rules-house-rules'],
  // arrival and access
  ['wheres the gate code', 'arrive-entry'],
  ['were runnin late', 'arrive-running-late'],
  ['is there parkin', 'arrive-parking'],
  ['is it wheelchair accesible', 'arrive-accessibility'],
  ['when do i get the adress', 'arrive-address'],
  // safety, disputes, and human help
  ['r u a bot', 'human-are-you-a-bot'],
  ['whats ur email', 'human-contact-support'],
  ['is this listin a scam', 'safety-scam-report'],
  ['can i talk 2 a human', 'human-talk-to-person'],
  // creating a host listing
  ['how do i lsit my pool on here', 'host-listing-01'],
  ['can i upload iphone pics', 'host-listing-02'],
  ['can i import from swimplly', 'host-listing-03'],
  ['how do i pause my listin', 'host-listing-08'],
  // host pricing and calendars
  ['how do i chnage my hourly rate', 'host-pricing-02', 'host'],
  ['can i block off my calender for vacation', 'host-pricing-05'],
  ['wknd pricing', 'host-pricing-03'],
  // payouts
  ['wen do i get payed', 'payouts-02'],
  ['how do i add my bank acct', 'payouts-01'],
  ['do i get a 1099k', 'payouts-08'],
  ['stripe wont verify me', 'payouts-05'],
  // accounts and technical problems
  ['forgot my pw', 'account-01'],
  ['cant sign in', 'account-02'],
  ['didnt get the verifcation email', 'account-03'],
  ['stop txting me', 'account-06'],
  ['how do i delete my acount', 'account-07'],
];

test(`typo / slang phrasings land on the right entry (${TYPO_CASES.length} cases)`, () => {
  const bad = [];
  for (const [text, id, role = null] of TYPO_CASES) {
    const r = m.match(text, { role });
    if (r.status !== 'confident' || r.top.id !== id)
      bad.push(`"${text}" -> ${r.status} ${r.top && r.top.id} (want ${id})`);
  }
  assert.deepEqual(bad, []);
  const cats = new Set(TYPO_CASES.map(([, id]) => entries.find((e) => e.id === id).category));
  assert.equal(cats.size, 10);
});

// Everyday rewordings (no typos). Must be answered correctly or clarified, never answered wrongly.
const PARAPHRASES = [
  ['how do i reserve a pool for saturday', 'booking-how-to-book'],
  ['does the owner need to approve my request', 'booking-instant-vs-request'],
  ["host hasn't gotten back to me", 'booking-host-no-reply'],
  ['the host never replied to my request', 'booking-host-no-reply'],
  ['can i ask the host something before booking', 'booking-message-host'],
  ['where can i check if my reservation went through', 'booking-status'],
  ['whats the max number of guests', 'booking-guest-count'],
  ['the host sent me a custom offer what do i do', 'booking-custom-offer'],
  ['whats the service fee for', 'pay-service-fee'],
  ['can i pay with venmo', 'pay-off-platform'],
  ['why did my total go up', 'pay-price-changes'],
  ['is this in usd or aud', 'pay-currency'],
  ['can i move my booking to sunday', 'cancel-reschedule'],
  ['what if it rains', 'cancel-weather'],
  ['is my dog allowed', 'rules-pets'],
  ['can my kids use the diving board', 'rules-diving-slides'],
  ['can we play music', 'rules-music-noise'],
  ['when do i get the address', 'arrive-address'],
  ['how do i add this to my calendar', 'arrive-add-calendar'],
  ['can we get there early', 'arrive-early'],
  ['whats your email address', 'human-contact-support'],
  ['do you have a phone number', 'human-contact-support'],
  ['im a renter can i list', 'host-listing-04'],
  ['does my listing need to be approved', 'host-listing-06'],
  ['do you charge hosts a fee', 'host-pricing-01', 'host'],
  ['can i set different prices on weekends', 'host-pricing-03', 'host'],
  ['can i sync my swimply calendar', 'host-pricing-07'],
  ['why is my payout less than what the guest paid', 'payouts-09'],
  ['i live in canada can i get paid', 'payouts-10'],
  ['the accept button doesnt work', 'account-08'],
  ['my listing says outdated listing', 'account-09'],
];

test('everyday rewordings: right answer or a clarifying question, never a wrong answer', () => {
  let confident = 0;
  const wrong = [];
  for (const [text, id, role = null] of PARAPHRASES) {
    const r = m.match(text, { role });
    if (r.status === 'confident') {
      if (r.top.id === id) confident++;
      else wrong.push(`"${text}" -> ${r.top.id} (want ${id})`);
    } else {
      assert.ok(
        r.candidates.some((c) => c.id === id) || r.needsRole,
        `"${text}" should at least offer ${id}`
      );
    }
  }
  assert.deepEqual(wrong, []);
  assert.ok(
    confident >= PARAPHRASES.length - 4,
    `${confident}/${PARAPHRASES.length} answered outright`
  );
});

test('known real words are never fuzzed into neighbours ("safe" ≠ "save", "bank" ≠ "back")', () => {
  const r = m.match('is it safe to swim', {});
  assert.ok(!(r.status === 'confident' && r.top.id === 'host-listing-05'));
  assert.equal(m.speller('safe'), 'safe');
  assert.equal(m.speller('bank'), 'bank');
  assert.equal(m.speller('reservaton'), 'reservation');
});

test('one generic word is not enough to answer outright', () => {
  const r = m.match('work', {});
  assert.notEqual(r.status, 'confident');
});
