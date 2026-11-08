'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { generateDrafts } = require('../tools/draft-additions');
const { summarize } = require('../tools/metrics');
const { Tracker, readLog } = require('../engine/tracking');
const { build } = require('../server');
const { tmpDir } = require('./helpers');

const ENTRIES = path.join(__dirname, '..', 'bank', 'entries.json');
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

function writeLog(dir) {
  const file = path.join(dir, 'events.jsonl');
  const t = new Tracker({ file });
  const unmatched = [
    ['1:1', 'is there a lifeguard on duty'],
    ['1:2', 'do you have lifeguards'],
    ['1:3', 'is a lifeguard there'],
    ['1:4', 'lifeguard on duty?'],
    ['1:5', 'can i bring a grill'], // one-off
    ['1:6', 'is the pool salt water'],
    ['1:6', 'is it salt water'], // same conversation twice: not "recurring"
  ];
  for (const [conv, text] of unmatched) t.log(conv, [{ type: 'unmatched', text, attempt: 1 }]);
  t.log('1:7', [
    { type: 'answered', entry: 'booking-how-to-book', score: 1, mode: 'auto', via: 'match' },
  ]);
  t.log('1:7', [
    { type: 'answered', entry: 'booking-how-to-book', score: 0.8, mode: 'auto', via: 'match' },
  ]);
  t.log('1:8', [
    { type: 'handoff', reason: 'founder_request', urgency: 'normal' },
    { type: 'escalated', reason: 'founder_request' },
  ]);
  t.log('1:9', [
    { type: 'handoff', reason: 'urgent', urgency: 'high' },
    { type: 'escalation_failed', step: 'toggle_status', status: 500 },
  ]);
  return file;
}

test('draft-additions: clusters recurring unmatched questions into drafts, never touches entries.json', () => {
  const dir = tmpDir();
  const log = writeLog(dir);
  const out = path.join(dir, 'drafts');
  const before = sha(ENTRIES);
  const res = generateDrafts({ logFile: log, outDir: out, min: 3, minConversations: 2 });
  assert.equal(sha(ENTRIES), before, 'entries.json unchanged');
  assert.equal(res.clusters.length, 1, 'only the lifeguard question recurs across conversations');
  assert.equal(res.written.length, 1);
  const draft = JSON.parse(fs.readFileSync(res.written[0], 'utf8'));
  assert.match(draft.status, /DRAFT - not live/);
  assert.equal(draft.cluster.count, 4);
  assert.equal(draft.cluster.conversations, 4);
  assert.equal(draft.suggested_entry.answer, '', 'no invented answer');
  assert.deepEqual(draft.suggested_entry.sources, []);
  assert.equal(draft.suggested_entry.mode, 'handoff');
  assert.ok(draft.cluster.examples.every((x) => /lifeguard/.test(x)));
  // dry run writes nothing
  const dry = generateDrafts({ logFile: log, outDir: path.join(dir, 'dry'), dryRun: true });
  assert.equal(fs.existsSync(path.join(dir, 'dry')), false);
  assert.equal(dry.written.length, 1);
});

test('metrics: answered by entry id, unmatched, escalations ok vs failed', () => {
  const dir = tmpDir();
  const s = summarize(readLog(writeLog(dir)));
  assert.equal(s.answered, 2);
  assert.equal(s.unmatched, 7);
  assert.deepEqual(s.top_entries[0], ['booking-how-to-book', 2]);
  assert.equal(s.handoffs, 2);
  assert.equal(s.handoffs_urgent, 1);
  assert.equal(s.escalated_ok, 1);
  assert.equal(s.escalation_failed, 1);
  assert.deepEqual(s.escalation_failed_by_step, [['toggle_status', 1]]);
});

test('validate-bank CLI passes on the shipped bank', () => {
  const out = execFileSync(
    process.execPath,
    [path.join(__dirname, '..', 'tools', 'validate-bank.js')],
    { encoding: 'utf8' }
  );
  assert.match(out, /100 entries, 918 questions\+variants, 0 self-match misses, 0 errors/);
});

test('server refuses to start without the webhook secret or Chatwoot settings (and never echoes values)', () => {
  const env = {
    CHATWOOT_URL: 'http://127.0.0.1:3009',
    CHATWOOT_BOT_TOKEN: 'super-secret-token-value',
    CHATWOOT_ACCOUNT_ID: '1',
    CHATWOOT_DEREK_USER_ID: '1',
    CHATWOOT_BRANDON_USER_ID: '2',
    BOT_DATA_DIR: tmpDir(),
  };
  assert.throws(() => build(env), /CHATWOOT_WEBHOOK_SECRET/);
  assert.throws(
    () => build({ ...env, CHATWOOT_WEBHOOK_SECRET: 's', CHATWOOT_DEREK_USER_ID: '' }),
    /CHATWOOT_DEREK_USER_ID/
  );
  const ok = build({ ...env, CHATWOOT_WEBHOOK_SECRET: 's' });
  assert.equal(ok.config.port, 3120);
  assert.equal(ok.config.host, '127.0.0.1');
  assert.doesNotMatch(JSON.stringify(ok.config), /super-secret-token-value/);
  assert.doesNotMatch(JSON.stringify(ok.bot.client), /super-secret-token-value/);
});
