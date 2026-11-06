'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('../engine/safety');
const { loadEngine } = require('./helpers');
const { correctedText } = require('../engine/normalize');

const { SAFETY_TARGETS } = require('../engine/flows');

const { engine } = loadEngine();
const guard = (t) => s.detectGuards(t, correctedText(t, engine.matcher.speller, SAFETY_TARGETS));

test('Luhn: real test card numbers pass, near-misses fail', () => {
  assert.ok(s.luhnValid('4242424242424242'));
  assert.ok(s.luhnValid('4111111111111111'));
  assert.ok(s.luhnValid('378282246310005'));
  assert.ok(!s.luhnValid('4242424242424241'));
  assert.ok(!s.luhnValid('1234567890123456'));
});

test('card numbers are redacted and never echoed; phone numbers and booking ids are left alone', () => {
  const r = s.scanSensitive('card 4242-4242-4242-4242 exp 12/28 cvv 123, call me 555-201-3344');
  assert.equal(r.cards, 1);
  assert.equal(r.cvv, 1);
  assert.doesNotMatch(r.text, /4242/);
  assert.doesNotMatch(r.text, /\b123\b/);
  assert.match(r.text, /555-201-3344/);
  assert.equal(s.scanSensitive('order 6abaf08c-023d-4f34-8e87-74ea4a6efac4').found, false);
  assert.equal(s.scanSensitive('my card 1234 5678 9012 3456 (not a real number)').cards, 0);
});

test('passwords are redacted', () => {
  const r = s.scanSensitive('my password is Hunter2!! please reset it');
  assert.equal(r.passwords, 1);
  assert.doesNotMatch(r.text, /Hunter2/);
});

test('log redaction removes cards, emails, phones and booking ids', () => {
  const out = s.redactForLog(
    '4111 1111 1111 1111 me@example.com +1 (555) 201-3344 6abaf08c-023d-4f34-8e87-74ea4a6efac4'
  );
  assert.doesNotMatch(out, /4111|example\.com|201-3344|6abaf08c/);
});

test('booking reference: UUIDs, order links, "booking ref: X"', () => {
  assert.equal(
    s.findBookingRef('https://www.poolrentalnearme.com/order/6ABAF08C-023d-4f34-8e87-74ea4a6efac4'),
    '6abaf08c-023d-4f34-8e87-74ea4a6efac4'
  );
  assert.equal(s.findBookingRef('booking reference: PRNM-1234'), 'PRNM-1234');
  assert.equal(s.findBookingRef('my booking is tomorrow'), null);
});

test('urgent: injury and danger (including typos) → safety-injury', () => {
  for (const t of [
    'someone is drowning',
    'my sun is drowing',
    'my kid got injurd',
    'guest slipped and fell',
    'there was an accident',
    'call an ambulance',
    'he hit his head',
  ]) {
    const g = guard(t);
    assert.ok(g, t);
    assert.equal(g.kind, 'urgent', t);
    assert.equal(g.route, 'safety-injury', t);
  }
});

test('urgent routing for every rule-8 / safety / dispute topic', () => {
  const cases = {
    'i was harassed by the host': 'safety-harassment',
    'i feel unsafe right now': 'safety-harassment',
    'the gate doesnt latch': 'safety-unsafe-pool',
    'water looks green and cloudy': 'safety-unsafe-pool',
    'locked out of the pool and host isnt answering': 'arrive-cant-get-in',
    'host didnt show up and were here': 'arrive-cant-get-in',
    'guests broke my patio chair': 'safety-damage',
    'how do i file a damage claim': 'safety-damage',
    'do you have insurance': 'safety-insurance',
    'am i covered if a guest gets hurt': 'safety-insurance',
    'who pays if a guest sues me': 'safety-insurance',
    'is this listing a scam': 'safety-scam-report',
    'someone asked for my password': 'safety-scam-report',
    'my guests wont leave': 'dispute-guest-breaking-rules',
    'i was charged twice': 'builtin:dispute-charge',
    'i want a refund': 'builtin:dispute-charge',
    'im filing a chargeback': 'builtin:dispute-charge',
  };
  for (const [t, route] of Object.entries(cases)) {
    const g = guard(t);
    assert.ok(g, t);
    assert.equal(g.kind, 'urgent', t);
    assert.equal(g.route, route, t);
  }
  assert.equal(guard('am i covered if a guest gets hurt').rule8, true);
});

test('near-miss handoffs: questions the bank must not answer', () => {
  const cases = {
    'can i get my deposit back': 'builtin:deposit-question',
    'can i bring my service dog': 'builtin:service-animal',
    'can i list my apartment complex pool': 'builtin:host-eligibility',
    'can i rent out my backyard without a pool': 'builtin:host-eligibility',
    'what happens to my bookings if i close my listing': 'builtin:closed-listing-bookings',
    'how do i change my minimum hours': 'builtin:host-booking-limits',
    'how long does a refund take': 'builtin:refund-question',
    'what if the host doesnt show up': 'builtin:host-no-show',
    'is there a liability waiver': 'rules-waiver',
  };
  for (const [t, route] of Object.entries(cases)) {
    const g = guard(t);
    assert.ok(g, t);
    assert.equal(g.kind, 'handoff', t);
    assert.equal(g.route, route, t);
  }
});

test('no false alarms on ordinary questions', () => {
  for (const t of [
    'i accidentally broke a chair', // damage, not injury
    'how do i get paid',
    'set up direct deposit',
    'is the pool heated',
    'host not responding',
    'the umbrella is broken',
    'will i get a refund if i cancel',
    'refund policy',
    'what if someone gets hurt',
    'locked out of my account',
    'im filing my taxes',
    'how do i manage my listing',
    'i used my card',
    'treat yourself',
    'press inquiry',
  ]) {
    const g = guard(t);
    if (t === 'i accidentally broke a chair') assert.equal(g.route, 'safety-damage');
    else if (t === 'press inquiry') assert.equal(g.route, 'builtin:partnership', 'not "injury"');
    else if (t === 'what if someone gets hurt') assert.ok(!g || g.route !== 'safety-injury', t);
    else assert.equal(g, null, t);
  }
});

test('"locked out" alone asks which kind', () => {
  const g = guard("I'm locked out");
  assert.equal(g.kind, 'clarify');
  assert.deepEqual(g.routes, ['arrive-cant-get-in', 'account-02']);
});

test('human / founder requests, but not identity questions or "talk to the host"', () => {
  for (const t of [
    'human please',
    'agent',
    'talk to the founder',
    'speak to someone',
    'i want a person not a bot',
    'can i talk to derek',
    'connect me to support',
    'let me talk to whoever runs this',
    'are you able to connect me to a person',
  ]) {
    assert.ok(s.wantsHuman(t), t);
  }
  for (const t of [
    'are you a real person',
    'am i chatting with a human',
    'talk to the pool owner first',
    'how do i contact the host',
    'how do i reach customer service',
    'who am i talking to',
  ]) {
    assert.ok(!s.wantsHuman(t), t);
  }
  assert.equal(s.questionRemains('talk to the founder'), false);
  assert.equal(s.questionRemains('I want to talk to a human about my refund'), true);
});

test('mood: upset customers get flagged', () => {
  assert.equal(s.mood('THIS IS RIDICULOUS I WANT MY MONEY'), 'upset');
  assert.equal(s.mood('this is unacceptable'), 'upset');
  assert.equal(s.mood('hey how do i book'), 'neutral');
});
