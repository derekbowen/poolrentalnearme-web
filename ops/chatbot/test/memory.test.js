'use strict';
/**
 * The state store under load (security review, round 3): a full store of worst-case
 * conversations must serialise quickly, writes are coalesced and asynchronous, and the
 * store never holds more than its cap.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { MemoryStore } = require('../engine/memory');
const H = require('./helpers');

const { engine } = H.loadEngine();

/** A worst-case conversation state: 1,500-char junk messages and founder requests, as in verify2/state_probe.js. */
function worstState() {
  const words = ['pool', 'booking', 'refund', 'host', 'cancel', 'payout', 'gate', 'lights', 'towels', 'parking', 'zzq', 'xkcd'];
  let seed = 7;
  const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  const junk = (n) => {
    let s = '';
    while (s.length < n) s += `${words[Math.floor(rnd() * words.length)]}${Math.floor(rnd() * 1e6).toString(36)} `;
    return s.slice(0, n);
  };
  let st = null;
  for (let i = 0; i < 60; i++) {
    const r = engine.handle(st, { kind: 'text', text: i % 7 === 3 ? 'talk to the founder' : junk(1500), messageId: i }, { now: 1e12 + i * 1000 });
    st = r.state;
    if (r.actions.some((a) => a.type === 'escalate'))
      st = engine.afterEscalation(st, { ok: true, done: { note: true, attributes: true, labels: true, status: true } }, { now: 1e12 }).state;
  }
  return st;
}

test('a conversation state stays small (no field grows without bound)', () => {
  const st = worstState();
  const bytes = JSON.stringify(st).length;
  assert.ok(bytes < 10000, `${bytes} bytes`);
});

test('a full store (1,000 worst-case conversations) serialises in well under a webhook budget, and is capped', () => {
  const st = worstState();
  const store = new MemoryStore({ file: null });
  for (let i = 0; i < 1200; i++) store.set(`7:${i}`, { ...st, updatedAt: Date.now() });
  const t0 = process.hrtime.bigint();
  const body = store.body();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const data = JSON.parse(body);
  assert.equal(Object.keys(data.conversations).length, 1000, 'pruned to the cap, oldest first');
  assert.ok(!('7:0' in data.conversations) && '7:1199' in data.conversations);
  // measured ~60 ms on a laptop for ~9 MB; the old default (5,000 × 7.6 KB) was ~0.85 s per flush
  assert.ok(ms < 1000, `${ms.toFixed(0)} ms for ${(body.length / 1e6).toFixed(1)} MB`);
  assert.ok(body.length < 12e6, `${body.length} bytes`);
});

test('writes are coalesced and asynchronous; the file is mode 600; flush() still writes synchronously', async () => {
  const file = path.join(H.tmpDir(), 'state.json');
  const store = new MemoryStore({ file, debounceMs: 20 });
  let writes = 0;
  const orig = store.flushAsync.bind(store);
  store.flushAsync = () => {
    writes++;
    return orig();
  };
  for (let i = 0; i < 200; i++) store.set(`7:${i}`, { v: 1, updatedAt: Date.now(), i });
  assert.equal(fs.existsSync(file), false, 'nothing written synchronously on set()');
  await new Promise((r) => setTimeout(r, 80));
  await store.writing;
  assert.equal(writes, 1, 'one write for a burst of changes');
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(Object.keys(saved.conversations).length, 200);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  store.set('7:x', { v: 1, updatedAt: Date.now() });
  store.flush();
  assert.ok('7:x' in JSON.parse(fs.readFileSync(file, 'utf8')).conversations);
  // a fresh store reads it back
  assert.ok(new MemoryStore({ file }).get('7:x'));
});
