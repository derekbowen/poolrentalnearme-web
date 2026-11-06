'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadBank, validateBank, forbiddenHits, CATEGORIES, LINE_911 } = require('../engine/bank');
const { COPY, handoffConfirmed, handoffFailed } = require('../engine/copy');
const { SYN_COLLISIONS } = require('../engine/normalize');
const { RULES } = require('../engine/safety');

const { entries, routes } = loadBank();

test('bank: 100 entries, 10 per category, schema valid, no errors', () => {
  const { errors } = validateBank(entries, routes);
  assert.deepEqual(errors, []);
  assert.equal(entries.length, 100);
  for (const c of CATEGORIES) assert.equal(entries.filter((e) => e.category === c).length, 10, c);
});

test('bank: entries.json is pretty-printed JSON (editable file, one source of truth)', () => {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'bank', 'entries.json'), 'utf8');
  assert.equal(raw, `${JSON.stringify(JSON.parse(raw), null, 2)}\n`);
});

test('bank: no two entries share a question', () => {
  const qs = entries.map((e) => e.question.toLowerCase());
  assert.equal(new Set(qs).size, qs.length);
});

test('bank: injury and danger answers lead with the 911 line', () => {
  for (const id of [
    'safety-injury',
    'safety-damage',
    'safety-unsafe-pool',
    'safety-harassment',
    'dispute-guest-breaking-rules',
  ]) {
    assert.ok(entries.find((e) => e.id === id).answer.startsWith(LINE_911), id);
  }
});

test('bank: insurance, damage, injury and dispute topics are never auto-answered', () => {
  for (const id of [
    'safety-injury',
    'safety-damage',
    'safety-insurance',
    'safety-scam-report',
    'safety-unsafe-pool',
    'safety-harassment',
    'dispute-guest-breaking-rules',
    'rules-waiver',
    'cancel-refund',
  ]) {
    assert.equal(entries.find((e) => e.id === id).mode, 'handoff', id);
  }
});

test('copy: nothing the assistant says contains a forbidden phrase', () => {
  const lines = [
    ...Object.values(COPY).flatMap((v) =>
      typeof v === 'string'
        ? [v]
        : Array.isArray(v)
          ? v.map((x) => x.title)
          : v && v.title
            ? [v.title]
            : []
    ),
    handoffConfirmed({ replyMethod: 'chat' }),
    handoffConfirmed({ replyMethod: 'email', email: 'a@b.co', urgent: true }),
    handoffFailed({ injury: true }),
    ...Object.values(routes.builtin).map((b) => b.answer),
    ...entries.map((e) => e.answer),
    ...RULES.filter((r) => r.prompt).map((r) => r.prompt),
  ];
  for (const l of lines) assert.deepEqual(forbiddenHits(l), [], l);
});

test('copy: the assistant never asks for a password or a full card number', () => {
  const all = [
    ...Object.values(COPY).filter((v) => typeof v === 'string'),
    ...entries.map((e) => e.answer),
    ...Object.values(routes.builtin).map((b) => b.answer),
  ];
  for (const l of all) {
    // warnings ("don't type your password here") are fine; asks are not
    const asks = l
      .split(/(?<=[.?!])\s+/)
      .filter((sentence) => !/\b(don'?t|never|not|no)\b/i.test(sentence));
    for (const sentence of asks) {
      assert.doesNotMatch(
        sentence,
        /(what'?s|send|share|tell me|give me|type|enter|paste) (me )?(your|the) (password|card number|full card|cvv|security code)/i,
        l
      );
    }
  }
});

test('copy: the only people named are Derek and Brandon (rule 1)', () => {
  const all = [
    ...Object.values(COPY).filter((v) => typeof v === 'string'),
    ...entries.map((e) => e.answer),
    ...Object.values(routes.builtin).map((b) => b.answer),
  ].join(' ');
  const names = new Set(all.match(/\b[A-Z][a-z]+\b/g));
  for (const n of ['Stephen', 'Sarah', 'Mike', 'Jessica', 'Team Lead']) assert.ok(!names.has(n), n);
  assert.match(all, /Derek and Brandon/);
});

test('copy: confirmation says "I\'ve sent", never promises a fast reply, offers chat or email only', () => {
  const c = handoffConfirmed({ replyMethod: 'chat' });
  assert.match(c, /^Cool\. I've sent Derek and Brandon the rundown/);
  for (const s of [
    c,
    handoffConfirmed({ replyMethod: 'email', email: 'x@y.co' }),
    handoffConfirmed({ urgent: true }),
  ]) {
    assert.doesNotMatch(s, /\b(right away|immediately|in minutes|asap|shortly|within)\b/i);
  }
  assert.deepEqual(
    COPY.replyButtons.map((b) => b.value),
    ['reply:chat', 'reply:email']
  );
  assert.match(handoffFailed({}), /support@poolrentalnearme\.com/);
  assert.doesNotMatch(handoffFailed({}), /I've sent|sent it over/);
});

test('lexicon: no synonym surface form hijacks another concept', () => {
  assert.deepEqual(SYN_COLLISIONS, []);
});

test('routes: every route points at a real entry and clarify entries are fully wired', () => {
  const ids = new Set(entries.map((e) => e.id));
  for (const list of Object.values(routes.starters))
    for (const b of list)
      if (b.value.startsWith('entry:')) assert.ok(ids.has(b.value.slice(6)), b.value);
  for (const e of entries.filter((x) => x.mode === 'clarify')) {
    assert.equal(routes.clarify_routes[e.id].length, e.clarify_options.length, e.id);
  }
  assert.deepEqual(
    routes.starters.greeting.map((b) => b.title),
    ['Booking a swim', 'Hosting a pool', 'Talk to the founder']
  );
});
