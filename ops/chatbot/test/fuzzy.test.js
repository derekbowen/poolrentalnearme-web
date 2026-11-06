'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { damerau, maxEdits, tokenSimilarity } = require('../engine/fuzzy');
const { canonicalTokens, stem, clean } = require('../engine/normalize');

test('damerau: insert, delete, substitute, adjacent swap each cost 1', () => {
  assert.equal(damerau('book', 'book'), 0);
  assert.equal(damerau('book', 'boook'), 1);
  assert.equal(damerau('cancel', 'cancl'), 1);
  assert.equal(damerau('cancel', 'cancal'), 1);
  assert.equal(damerau('list', 'lsit'), 1); // swap
  assert.equal(damerau('accept', 'accpet'), 1); // swap
  assert.equal(damerau('reschedule', 'resceduale'), 2);
  assert.equal(damerau('kitten', 'sitting'), 3);
});

test('damerau: early exit beyond the limit', () => {
  assert.equal(damerau('abcdefgh', 'zyxwvuts', 2), 3);
});

test('length-aware thresholds: short words must match exactly', () => {
  assert.equal(maxEdits(3), 0);
  assert.equal(maxEdits(4), 1);
  assert.equal(maxEdits(5), 1);
  assert.equal(maxEdits(8), 2);
  assert.equal(maxEdits(12), 3);
  assert.equal(tokenSimilarity('pay', 'pat'), 0);
  assert.equal(tokenSimilarity('911', '91'), 0);
  assert.ok(tokenSimilarity('calendar', 'calender') > 0.8);
  assert.equal(tokenSimilarity('host', 'cost'), 0, 'first letter must agree for short words');
});

test('normalise: contractions, punctuation, emoji, slang', () => {
  assert.equal(clean('What’s the gate code?! 🏊'), 'whats the gate code');
  assert.deepEqual(canonicalTokens("can't log in"), ['not', 'login']);
  assert.deepEqual(canonicalTokens('how 2 book'), ['how', 'book']);
  assert.deepEqual(canonicalTokens('r u a robot'), ['bot']);
  assert.deepEqual(canonicalTokens('ppl'), ['guest']);
  assert.equal(stem('cancelled'), 'cancel');
  assert.equal(stem('swimming'), 'swim');
  assert.equal(stem('charged'), stem('charge'));
});
