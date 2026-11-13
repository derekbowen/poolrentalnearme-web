'use strict';
/**
 * D3 handoff flood caps, end to end: real webhook server + Bot + ChatwootClient
 * against the mock Chatwoot. Also: forged button values, the sampled 401 log
 * line, and a 150,000-character message through the webhook.
 */
const test = require('node:test');
const { before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createServer, sampler } = require('../server');
const { Bot } = require('../engine/bot');
const { ChatwootClient } = require('../engine/chatwoot');
const { MemoryStore } = require('../engine/memory');
const { Tracker } = require('../engine/tracking');
const { FloodLedger, DEFAULT_LIMITS } = require('../engine/flood');
const { COPY, LINE_911 } = require('../engine/copy');
const H = require('./helpers');

const TOKEN = 'test-bot-token';
const SECRET = 'test-webhook-secret';
const AGENTS = [
  { id: 11, name: 'Derek Bowen' },
  { id: 12, name: 'Brandon Elias' },
];
const silent = { info() {}, warn() {}, error() {} };

let mock;
const servers = [];

async function startBot({ floodLimits = {}, now } = {}) {
  const { engine } = H.loadEngine();
  const bot = new Bot({
    engine,
    client: new ChatwootClient({ baseUrl: mock.url, token: TOKEN, accountId: H.ACCOUNT_ID }),
    store: new MemoryStore({ file: null }),
    tracker: new Tracker({ file: null }),
    accountId: H.ACCOUNT_ID,
    inboxId: H.INBOX_ID,
    agents: AGENTS,
    publicUrl: 'https://chat.poolrentalnearme.com',
    logger: silent,
    floodLimits,
    ...(now ? { now } : {}),
  });
  const server = createServer({ bot, secret: SECRET, logger: silent });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  const url = `http://127.0.0.1:${server.address().port}/webhook`;
  const send = async (payload) => {
    const r = await H.postWebhook(url, payload, { secret: SECRET });
    await server.drain();
    return r;
  };
  return { bot, server, url, send };
}

before(async () => {
  mock = await H.startMockChatwoot({ token: TOKEN, existingLabels: [] });
});
after(async () => {
  for (const s of servers) await new Promise((r) => s.close(r));
  await mock.close();
});

const base = (conv) => `/api/v1/accounts/${H.ACCOUNT_ID}/conversations/${conv}`;
const forConv = (conv, calls = mock.calls) => calls.filter((c) => c.path.startsWith(`${base(conv)}/`));
const mentionNotes = (calls) =>
  calls.filter((c) => c.body && c.body.private === true && /mention:\/\/user\//.test(c.body.content || ''));
const plainNotes = (calls) =>
  calls.filter(
    (c) =>
      c.body &&
      c.body.private === true &&
      /^PRNM handoff/.test(c.body.content || '') &&
      !/mention:\/\//.test(c.body.content || '')
  );
const toggles = (calls) => calls.filter((c) => /toggle_status$/.test(c.path));
const publicTexts = (calls) =>
  calls.filter((c) => c.method === 'POST' && /\/messages$/.test(c.path) && c.body && c.body.private === false).map((c) => c.body.content);
const labelSets = (calls) => calls.filter((c) => c.method === 'POST' && /\/labels$/.test(c.path)).map((c) => c.body.labels);
let msgId = 70000;

test('resolve → reopen loop: one alert per conversation per 24 h; each later thread is logged in a plain note, never "already flagged"', async () => {
  mock.reset();
  const { send } = await startBot();
  const conv = 301;
  const perCycle = [];
  for (let cycle = 1; cycle <= 3; cycle++) {
    const mark = mock.calls.length;
    await send(H.incoming(conv, ++msgId, 'someone is hurt at the pool'));
    await send(H.resolved(conv)); // visitor (or anyone) ends the chat, then writes again
    perCycle.push(forConv(conv, mock.calls.slice(mark)));
  }
  const all = forConv(conv);
  assert.equal(mentionNotes(all).length, 1, 'exactly one @mention note');
  assert.equal(toggles(all).length, 1, 'opened (bot handoff push) exactly once');
  for (const calls of perCycle.slice(1)) {
    const texts = publicTexts(calls);
    assert.ok(texts[0].startsWith(LINE_911), 'the 911 line still leads');
    // after a resolve this is a NEW thread: the founders were never told about it, so never "already flagged"
    assert.ok(texts.includes(COPY.cappedLoggedUrgent));
    assert.ok(!texts.includes(COPY.cappedAlready) && !texts.includes(COPY.cappedAlreadyUrgent));
    assert.ok(!texts.some((t) => /I've sent/.test(t)), 'never claims a new alert was sent');
    assert.ok(labelSets(calls).some((l) => l.includes('handoff-capped') && l.includes('urgent')));
    assert.ok(calls.some((c) => /toggle_priority$/.test(c.path)), 'marked urgent (no push in 4.16.2)');
    assert.equal(toggles(calls).length, 0);
    assert.equal(mentionNotes(calls).length, 0, 'no @mention');
    assert.equal(plainNotes(calls).length, 1, 'the new thread is written down in a plain note');
    assert.match(plainNotes(calls)[0].body.content, /logged, no alert/);
  }
});

test('per contact: two alerts per 24 h; the third conversation is logged without an alert', async () => {
  mock.reset();
  const { send } = await startBot();
  const contactId = 9901;
  for (const conv of [311, 312, 313]) {
    await send(H.incoming(conv, ++msgId, 'talk to a person', { contactId }));
    await send(H.incoming(conv, ++msgId, 'question about my listing photos', { contactId }));
    const sel = forConv(conv).filter((c) => c.body && c.body.content_type === 'input_select').pop();
    assert.ok(sel.body.content_attributes.items.some((i) => i.value === 'reply:chat'));
    await send(H.buttonClick(conv, ++msgId, 'reply:chat', 'Here in chat', { contactId }));
  }
  assert.equal(mentionNotes(forConv(311)).length, 1);
  assert.equal(mentionNotes(forConv(312)).length, 1);
  const third = forConv(313);
  assert.equal(mentionNotes(third).length, 0);
  assert.equal(toggles(third).length, 0, 'kept pending');
  assert.equal(plainNotes(third).length, 1, 'a summary note with no @mention');
  assert.match(plainNotes(third)[0].body.content, /logged, no alert/);
  assert.ok(labelSets(third).some((l) => l.includes('handoff-capped')));
  assert.equal(publicTexts(third).pop(), COPY.cappedLogged);
});

test('global ceiling: beyond N alerts per rolling hour → handoff-overflow, no @mention, not opened; clears after the hour', async () => {
  mock.reset();
  let clock = Date.now();
  const { send } = await startBot({ floodLimits: { globalPerHour: 2 }, now: () => clock });
  for (const conv of [321, 322, 323]) await send(H.incoming(conv, ++msgId, 'someone is drowning'));
  assert.equal(mentionNotes(forConv(321)).length, 1);
  assert.equal(mentionNotes(forConv(322)).length, 1);
  const third = forConv(323);
  assert.equal(mentionNotes(third).length, 0);
  assert.equal(toggles(third).length, 0);
  assert.ok(labelSets(third).some((l) => l.includes('handoff-overflow')));
  assert.ok(third.some((c) => /toggle_priority$/.test(c.path)), 'still marked urgent for triage (no push)');
  const texts = publicTexts(third);
  assert.ok(texts[0].startsWith(LINE_911));
  assert.equal(texts.pop(), COPY.cappedLoggedUrgent);
  // the capped conversation stays quiet afterwards; danger gets the 911 line once, an urgent label,
  // priority and a plain note (no @mention, no reopen: D3)
  mock.reset();
  await send(H.incoming(323, ++msgId, 'hello?'));
  // one short line (no alert: the ceiling still holds), then quiet
  assert.deepEqual(publicTexts(forConv(323)), [COPY.waitingAckCapped]);
  assert.equal(mentionNotes(forConv(323)).length, 0);
  assert.equal(toggles(forConv(323)).length, 0);
  mock.reset();
  await send(H.incoming(323, ++msgId, 'he is not breathing'));
  const after = forConv(323);
  assert.deepEqual(publicTexts(after), [LINE_911, COPY.markedUrgent]);
  assert.equal(toggles(after).length, 0);
  assert.equal(mentionNotes(after).length, 0);
  assert.ok(after.some((c) => /toggle_priority$/.test(c.path)));
  assert.ok(labelSets(after).some((l) => l.includes('urgent') && l.includes('handoff-overflow')));
  assert.ok(after.some((c) => c.body && c.body.private && /^PRNM update \(URGENT, no new alert\)/.test(c.body.content)));
  // said once, not on every message
  mock.reset();
  await send(H.incoming(323, ++msgId, 'please hurry he is still not breathing'));
  assert.deepEqual(publicTexts(forConv(323)), []);
  // an hour later a new conversation alerts again
  clock += DEFAULT_LIMITS.globalWindowMs + 1000;
  mock.reset();
  await send(H.incoming(324, ++msgId, 'someone is drowning'));
  assert.equal(mentionNotes(forConv(324)).length, 1);
});

test('a retried handoff whose @mention note already went out is not capped (same alert)', async () => {
  mock.reset();
  const { send } = await startBot({ floodLimits: { globalPerHour: 1 } });
  const conv = 331;
  await send(H.incoming(conv, ++msgId, 'can i talk to a person about my listing photos'));
  mock.fail.push({ match: /toggle_status$/, status: 500, times: 1 });
  await send(H.buttonClick(conv, ++msgId, 'reply:chat', 'Here in chat'));
  await send(H.incoming(conv, ++msgId, 'hello? still there?'));
  const calls = forConv(conv);
  assert.equal(mentionNotes(calls).length, 1);
  assert.equal(toggles(calls).length, 2, 'failed toggle, then the retry');
  assert.match(publicTexts(calls).pop(), /^Cool\. I've sent Derek and Brandon/);
});

test('the flood ledger survives a restart (store file) and a resolve', () => {
  const file = path.join(H.tmpDir(), 'state.json');
  const store = new MemoryStore({ file });
  const ledger = new FloodLedger({ store });
  const now = Date.now();
  ledger.record({ conv: '7:1', contact: '7:contact:5', now });
  store.flush();
  const again = new FloodLedger({ store: new MemoryStore({ file }) });
  assert.equal(again.check({ conv: '7:1', contact: '7:contact:5', now: now + 1000 }), 'conversation');
  assert.equal(again.check({ conv: '7:2', contact: '7:contact:5', now: now + 1000 }), null);
  again.record({ conv: '7:2', contact: '7:contact:5', now: now + 2000 });
  assert.equal(again.check({ conv: '7:3', contact: '7:contact:5', now: now + 3000 }), 'contact');
  // 24 h after the first alert it has expired: one left for this contact, none for conversation 7:1
  assert.equal(again.check({ conv: '7:1', contact: '7:contact:5', now: now + DEFAULT_LIMITS.windowMs + 1 }), null);
  // conversation_resolved never touches the ledger (it lives in store meta, not conversation state)
  const { engine } = H.loadEngine();
  const st = engine.returnedToBot(engine.humanTookOver(null));
  assert.equal(st.flood, undefined);
});

test('forged button values over the webhook do nothing', async () => {
  mock.reset();
  const { send } = await startBot();
  const conv = 341;
  await send(H.incoming(conv, ++msgId, 'hi'));
  mock.reset();
  await send(H.buttonClick(conv, ++msgId, 'entry:safety-injury', 'x'.repeat(10000)));
  await send(H.buttonClick(conv, ++msgId, 'route:account-02:-1', 'x'));
  assert.deepEqual(forConv(conv), []);
});

test('a 150,000-character message: answered quickly, nothing long reaches Chatwoot', async () => {
  mock.reset();
  const { send } = await startBot();
  const conv = 351;
  const huge = `talk to a person about my pool ${'blah '.repeat(30000)}`.slice(0, 150000);
  const t0 = Date.now();
  const r = await send(H.incoming(conv, ++msgId, huge));
  assert.equal(r.status, 200);
  assert.ok(Date.now() - t0 < 2000);
  for (const c of forConv(conv)) assert.ok(JSON.stringify(c.body || {}).length < 6000);
});

test('401s are logged at most once a minute, with a count of the rest', async () => {
  let clock = 0;
  const warns = [];
  const { engine } = H.loadEngine();
  const bot = new Bot({
    engine,
    client: new ChatwootClient({ baseUrl: mock.url, token: TOKEN, accountId: H.ACCOUNT_ID }),
    store: new MemoryStore({ file: null }),
    tracker: new Tracker({ file: null }),
    accountId: H.ACCOUNT_ID,
    agents: AGENTS,
  });
  const server = createServer({
    bot,
    secret: SECRET,
    logger: { info() {}, warn: (m) => warns.push(m), error() {} },
    now: () => clock,
  });
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  servers.push(server);
  const url = `http://127.0.0.1:${server.address().port}/webhook`;
  for (let i = 0; i < 5; i++) assert.equal((await H.postWebhook(url, { junk: i })).status, 401);
  assert.equal(warns.length, 1);
  clock += 61 * 1000;
  assert.equal((await H.postWebhook(url, { junk: 9 })).status, 401);
  assert.equal(warns.length, 2);
  assert.match(warns[1], /\+4 more since the last line/);
  // the sampler itself
  let t = 0;
  const lines = [];
  const log = sampler(1000, () => t);
  log((m) => lines.push(m), 'a');
  log((m) => lines.push(m), 'a');
  t = 1000;
  log((m) => lines.push(m), 'a');
  assert.deepEqual(lines, ['a', 'a (+1 more since the last line)']);
});

// ------------------------------------------------------------------ round-2 review (fix2, round 2)
/** An in-process Chatwoot client whose every call takes `delay` ms, like real HTTP (verify2/security/race.js). */
function slowClient(delay, counts) {
  const ok = (extra = {}) => new Promise((r) => setTimeout(() => r({ ok: true, status: 200, ...extra }), delay));
  return {
    sendText: () => ok(),
    sendSelect: () => ok(),
    sendNote: (c, t) => {
      if (/mention:\/\/user\//.test(t)) counts.mentions++;
      return ok();
    },
    setCustomAttributes: () => ok(),
    getLabels: () => ok({ labels: [] }),
    setLabels: () => ok(),
    togglePriority: () => ok(),
    toggleStatus: () => {
      counts.opens++;
      return ok();
    },
  };
}
function burstBot(counts, delay = 20) {
  const { engine } = H.loadEngine();
  return new Bot({
    engine,
    client: slowClient(delay, counts),
    store: new MemoryStore({ file: null }),
    tracker: new Tracker({ file: null }),
    accountId: 1,
    inboxId: 5,
    agents: AGENTS,
    publicUrl: 'https://chat.poolrentalnearme.com',
    logger: silent,
  });
}
const burstMsg = (conv, contact, content) => ({
  account: { id: 1 },
  inbox: { id: 5 },
  event: 'message_created',
  id: conv,
  message_type: 'incoming',
  private: false,
  content,
  conversation: { id: conv, status: 'pending', custom_attributes: {}, meta: { sender: { id: contact, type: 'contact' } } },
});

test('D3 under concurrency: 30 conversations escalating at once → exactly 10 @mentions and 10 opens (global ceiling)', async () => {
  const counts = { mentions: 0, opens: 0 };
  const bot = burstBot(counts);
  await Promise.all(
    Array.from({ length: 30 }, (_, i) => bot.handleEvent(burstMsg(i + 1, 1000 + i, 'someone is hurt at the pool')))
  );
  await bot.idle();
  assert.equal(counts.mentions, DEFAULT_LIMITS.globalPerHour);
  assert.equal(counts.opens, DEFAULT_LIMITS.globalPerHour);
});

test('D3 under concurrency: 5 conversations of one contact at once → exactly 2 @mentions and 2 opens', async () => {
  const counts = { mentions: 0, opens: 0 };
  const bot = burstBot(counts);
  await Promise.all(Array.from({ length: 5 }, (_, i) => bot.handleEvent(burstMsg(i + 1, 500, 'someone is hurt at the pool'))));
  await bot.idle();
  assert.equal(counts.mentions, DEFAULT_LIMITS.perContact);
  assert.equal(counts.opens, DEFAULT_LIMITS.perContact);
});

test('D3 reservation: a handoff that fails before its @mention note gives the slot back', () => {
  const ledger = new FloodLedger({ limits: { globalPerHour: 1 } });
  const now = Date.now();
  const a = ledger.reserve({ conv: 'a', contact: 'x', now });
  assert.ok(a.token);
  assert.equal(ledger.reserve({ conv: 'b', contact: 'y', now }).capped, 'global');
  ledger.release(a.token);
  assert.ok(ledger.reserve({ conv: 'b', contact: 'y', now: now + 1 }).token);
});

test('open conversation after a sent handoff: danger gets the 911 line once, urgent label + priority, no new @mention, no reopen', async () => {
  mock.reset();
  const { send } = await startBot();
  const conv = 361;
  await send(H.incoming(conv, ++msgId, 'talk to a person'));
  await send(H.incoming(conv, ++msgId, 'question about my listing photos'));
  await send(H.buttonClick(conv, ++msgId, 'reply:chat', 'Here in chat'));
  assert.equal(mentionNotes(forConv(conv)).length, 1);
  assert.equal(toggles(forConv(conv)).length, 1);
  // Chatwoot now reports the conversation as open; nobody has replied yet
  mock.reset();
  await send(H.incoming(conv, ++msgId, 'hello?', { status: 'open' }));
  assert.deepEqual(publicTexts(forConv(conv)), [COPY.waitingAckSent], 'one short line, said once');
  mock.reset();
  await send(H.incoming(conv, ++msgId, 'hello??', { status: 'open' }));
  assert.deepEqual(forConv(conv), [], 'otherwise quiet while they wait');
  await send(H.incoming(conv, ++msgId, 'omg my son is choking', { status: 'open' }));
  const calls = forConv(conv);
  assert.deepEqual(publicTexts(calls), [LINE_911, COPY.markedUrgent]);
  assert.ok(calls.some((c) => /toggle_priority$/.test(c.path) && c.body.priority === 'urgent'));
  assert.ok(labelSets(calls).some((l) => l.includes('urgent')));
  assert.equal(mentionNotes(calls).length, 0);
  assert.equal(toggles(calls).length, 0);
  // once a person replies, the assistant stays silent even about danger (a person is handling it)
  await send(H.agentReply(conv, ++msgId, 'Derek here, calling 911 with you now', { status: 'open' }));
  mock.reset();
  await send(H.incoming(conv, ++msgId, 'he is still choking', { status: 'open' }));
  assert.deepEqual(publicTexts(forConv(conv)), []);
});

test('capped conversation: a booking ref typed later reaches the custom attributes', async () => {
  mock.reset();
  const { send } = await startBot();
  const contactId = 9911;
  const ref = '7a1c2e3f-aaaa-bbbb-cccc-1234567890ab';
  for (const conv of [371, 372, 373]) {
    await send(H.incoming(conv, ++msgId, 'talk to a person', { contactId }));
    await send(H.incoming(conv, ++msgId, 'payout question', { contactId }));
    await send(H.buttonClick(conv, ++msgId, 'ref:none', "I don't have it", { contactId }));
    await send(H.buttonClick(conv, ++msgId, 'reply:chat', 'Here in chat', { contactId }));
  }
  assert.equal(mentionNotes(forConv(373)).length, 0, 'the third is contact-capped');
  mock.reset();
  await send(H.incoming(373, ++msgId, `actually my ref is ${ref}`, { contactId }));
  const attrs = forConv(373).filter((c) => /custom_attributes$/.test(c.path));
  assert.ok(attrs.some((c) => c.body.custom_attributes.prnm_booking_ref === ref));
  assert.deepEqual(publicTexts(forConv(373)), [COPY.waitingAckCapped]);
  assert.equal(mentionNotes(forConv(373)).length, 0, 'still contact-capped: no alert');
});

// ------------------------------------------------------------------ round-3 review (security)
test('deferred: a handoff logged over the hourly ceiling alerts once the ceiling frees up (next message, or the sweep)', async () => {
  mock.reset();
  let clock = Date.now();
  const { bot, send } = await startBot({ floodLimits: { globalPerHour: 2 }, now: () => clock });
  for (const conv of [401, 402]) await send(H.incoming(conv, ++msgId, 'someone is hurt at the pool'));
  // t0: the 11th-style emergency goes over the ceiling: logged, labelled, no @mention, not opened
  await send(H.incoming(403, ++msgId, 'my kid is drowning'));
  assert.equal(mentionNotes(forConv(403)).length, 0);
  assert.equal(toggles(forConv(403)).length, 0);
  assert.ok(labelSets(forConv(403)).some((l) => l.includes('handoff-overflow')));
  // still over the ceiling: a founder request in that chat gets a reply, but no alert
  mock.reset();
  await send(H.incoming(403, ++msgId, 'can i talk to the founder'));
  assert.ok(publicTexts(forConv(403)).length >= 1, 'never silence');
  assert.equal(mentionNotes(forConv(403)).length, 0);
  assert.equal(toggles(forConv(403)).length, 0);
  // t0 + 61 min: the next message sends the real alert, exactly once
  clock += 61 * 60 * 1000;
  mock.reset();
  await send(H.incoming(403, ++msgId, 'hello? is anyone going to help me'));
  const calls = forConv(403);
  assert.equal(mentionNotes(calls).length, 1, 'exactly one @mention');
  assert.match(mentionNotes(calls)[0].body.content, /Logged earlier without an alert \(hourly ceiling reached\)/);
  assert.match(mentionNotes(calls)[0].body.content, /> my kid is drowning/);
  assert.equal(toggles(calls).length, 1, 'exactly one open');
  assert.ok(calls.some((c) => /toggle_priority$/.test(c.path)), 'still urgent');
  const last = labelSets(calls).pop();
  assert.ok(!last.includes('handoff-overflow') && last.includes('urgent'), last.join(','));
  assert.match(publicTexts(calls).pop(), /^I've sent Derek and Brandon the rundown and marked it urgent/);
  // and never again for that thread
  mock.reset();
  await send(H.incoming(403, ++msgId, 'hello??'));
  assert.equal(mentionNotes(forConv(403)).length, 0);
  assert.equal(toggles(forConv(403)).length, 0);

  // the sweep: the customer writes nothing more, any later webhook (or the timer) sends it.
  // 403's alert above took one of this hour's two slots, so 404 alerts and 405 + 406 are logged.
  mock.reset();
  for (const conv of [404, 405]) await send(H.incoming(conv, ++msgId, 'someone is hurt at the pool'));
  await send(H.incoming(406, ++msgId, 'my daughter fainted'));
  assert.equal(mentionNotes(forConv(404)).length, 1);
  assert.equal(mentionNotes(forConv(405)).length + mentionNotes(forConv(406)).length, 0);
  assert.deepEqual(bot.deferredList().map((x) => x.convId), ['405', '406']);
  assert.equal(bot.sweepDeferred(), 0, 'nothing is retried while the ceiling holds');
  clock += 61 * 60 * 1000;
  mock.reset();
  assert.equal(bot.sweepDeferred(), 2);
  await bot.idle();
  for (const conv of [405, 406]) {
    assert.equal(mentionNotes(forConv(conv)).length, 1, `${conv}`);
    assert.equal(toggles(forConv(conv)).length, 1, `${conv}`);
    assert.match(publicTexts(forConv(conv)).pop(), /^I've sent Derek and Brandon/);
  }
  assert.equal(bot.sweepDeferred(), 0, 'sent: off the list');
  assert.deepEqual(bot.deferredList(), []);
});

test('a note that timed out (status 0) keeps its flood slot: a slow Chatwoot cannot push past the caps', async () => {
  const { engine } = H.loadEngine();
  let noteCalls = 0;
  const ok = async () => ({ ok: true, status: 200 });
  const client = {
    sendText: ok,
    sendSelect: ok,
    // the note may have been created even though the client gave up waiting
    sendNote: async () => (++noteCalls, { ok: false, status: 0, error: 'timeout' }),
    setCustomAttributes: ok,
    getLabels: async () => ({ ok: true, status: 200, labels: [] }),
    setLabels: ok,
    togglePriority: ok,
    toggleStatus: ok,
    getConversation: async () => ({ ok: true, status: 200, data: { id: 1, status: 'pending', custom_attributes: {} } }),
  };
  const bot = new Bot({
    engine,
    client,
    store: new MemoryStore({ file: null }),
    tracker: new Tracker({ file: null }),
    accountId: H.ACCOUNT_ID,
    inboxId: H.INBOX_ID,
    agents: AGENTS,
    logger: silent,
    floodLimits: { globalPerHour: 1 },
  });
  await bot.handleEvent(H.incoming(501, ++msgId, 'someone is hurt at the pool'));
  await bot.idle();
  assert.equal(noteCalls, 1);
  assert.equal(bot.flood.check({ conv: `${H.ACCOUNT_ID}:999`, now: Date.now() }), 'global', 'the slot stays taken');
  // a definite error status from Chatwoot does give the slot back
  const bot2 = new Bot({
    engine,
    client: { ...client, sendNote: async () => ({ ok: false, status: 500 }) },
    store: new MemoryStore({ file: null }),
    tracker: new Tracker({ file: null }),
    accountId: H.ACCOUNT_ID,
    inboxId: H.INBOX_ID,
    agents: AGENTS,
    logger: silent,
    floodLimits: { globalPerHour: 1 },
  });
  await bot2.handleEvent(H.incoming(502, ++msgId, 'someone is hurt at the pool'));
  await bot2.idle();
  assert.equal(bot2.flood.check({ conv: `${H.ACCOUNT_ID}:999`, now: Date.now() }), null, 'released');
});

// ------------------------------------------------------------------ round-3 review (engine: race2, deferred_starve)
/**
 * An in-process Chatwoot whose calls take `delay(kind, conv, body)` ms. Records, per conversation, the
 * @mention notes, the opens and every public text. getConversation reports the conversation pending.
 */
function recordingClient(delay = () => 2) {
  const log = { mentions: {}, opens: {}, texts: {} };
  const bump = (o, c) => (o[String(c)] = (o[String(c)] || 0) + 1);
  const later = (kind, c, body, extra = {}) =>
    new Promise((r) => setTimeout(() => r({ ok: true, status: 200, ...extra }), delay(kind, String(c), body)));
  const text = (c, t) => ((log.texts[String(c)] = log.texts[String(c)] || []).push(t), later('text', c, t));
  return {
    log,
    sendText: text,
    sendSelect: text,
    sendNote: (c, t) => {
      if (/mention:\/\/user\//.test(t)) bump(log.mentions, c);
      return later('note', c, t);
    },
    setCustomAttributes: (c) => later('attrs', c),
    getLabels: (c) => later('labels', c, null, { labels: [] }),
    setLabels: (c) => later('labels', c),
    togglePriority: (c) => later('priority', c),
    toggleStatus: (c) => (bump(log.opens, c), later('open', c)),
    getConversation: (c) => later('get', c, null, { data: { id: Number(c), status: 'pending', custom_attributes: {} } }),
  };
}
function lineBot({ client, clock, store = new MemoryStore({ file: null }), floodLimits = { globalPerHour: 1 } }) {
  const { engine } = H.loadEngine();
  return new Bot({
    engine,
    client,
    store,
    tracker: new Tracker({ file: null }),
    accountId: H.ACCOUNT_ID,
    inboxId: H.INBOX_ID,
    agents: AGENTS,
    logger: silent,
    now: () => clock.t,
    floodLimits,
  });
}
const sentLines = (texts = []) => texts.filter((t) => /I've sent Derek and Brandon/.test(t));

test('round 3 (race2): a deferred retry and a visitor message for the same chat never run side by side: one alert, status sent, nothing 25 h later', async () => {
  const clock = { t: Date.now() };
  let slow = false;
  // the visitor's turn says "Got it…" first and that send is slow: the deferred retry (a separate queue before
  // the fix, keyed by the string id) alerted meanwhile, and the stale message turn wrote its state last
  const client = recordingClient((kind, c, t) => (slow && kind === 'text' && /^Got it/.test(t || '') ? 400 : 2));
  const bot = lineBot({ client, clock });
  await bot.handleEvent(H.incoming(801, ++msgId, 'someone is hurt at the pool'));
  await bot.idle();
  await bot.handleEvent(H.incoming(803, ++msgId, 'my kid is drowning'));
  await bot.idle();
  assert.equal(client.log.mentions['803'] || 0, 0, 'over the hourly ceiling: logged, no alert');
  assert.deepEqual(bot.deferredList().map((x) => x.convId), ['803']);
  clock.t += 61 * 60 * 1000;
  slow = true;
  // the 60 s timer and a webhook for the same conversation, not awaited in between
  bot.sweepDeferred();
  bot.handleEvent(H.incoming(803, ++msgId, 'please hurry'));
  await bot.idle();
  assert.equal(client.log.mentions['803'], 1, 'exactly one @mention');
  assert.equal(client.log.opens['803'], 1, 'opened once');
  const st = bot.store.get(`${H.ACCOUNT_ID}:803`);
  assert.equal(st.handoff.status, 'sent');
  assert.deepEqual(bot.deferredList(), []);
  // 25 h later the per-conversation cap has aged out: the sweep must not alert this thread again
  slow = false;
  clock.t += 25 * 3600 * 1000;
  assert.equal(bot.sweepDeferred(), 0);
  await bot.handleEvent(H.incoming(803, ++msgId, 'hello?'));
  await bot.idle();
  assert.equal(client.log.mentions['803'], 1);
  assert.equal(client.log.opens['803'], 1);
  assert.equal(sentLines(client.log.texts['803']).length, 1, 'the customer is told "I\'ve sent…" once');
  // and the queue itself: a number and a string for one conversation share one queue
  const order = [];
  const a = bot.enqueue(42, async () => {
    await new Promise((r) => setTimeout(r, 30));
    order.push('number');
  });
  const b = bot.enqueue('42', async () => order.push('string'));
  await Promise.all([a, b]);
  assert.deepEqual(order, ['number', 'string']);
});

test('round 3 (deferred_starve a): an urgent deferred alert survives a flood of 1,000 other chats and goes out when the ceiling frees', async () => {
  const clock = { t: Date.now() };
  const client = recordingClient(() => 0);
  const bot = lineBot({ client, clock });
  await bot.handleEvent(H.incoming(811, ++msgId, 'someone is hurt at the pool'));
  await bot.handleEvent(H.incoming(812, ++msgId, 'my kid is drowning'));
  await bot.idle();
  assert.deepEqual(bot.deferredList().map((x) => x.convId), ['812']);
  for (let i = 0; i < 1100; i++) await bot.handleEvent(H.incoming(20000 + i, ++msgId, 'hi'));
  await bot.idle();
  bot.store.prune(clock.t);
  assert.ok(bot.store.map.size <= 1000, `${bot.store.map.size} conversations kept`);
  assert.ok(bot.store.get(`${H.ACCOUNT_ID}:812`), 'the deferred emergency was not evicted');
  assert.ok(bot.store.get(`${H.ACCOUNT_ID}:811`), 'nor the handed-off chat waiting for a person');
  assert.equal(bot.store.get(`${H.ACCOUNT_ID}:20000`), null, 'the oldest ordinary chat went first');
  // a TTL sweep never drops a deferred alert either
  bot.store.prune(clock.t + 31 * 24 * 3600 * 1000);
  assert.ok(bot.store.get(`${H.ACCOUNT_ID}:812`));
  clock.t += 61 * 60 * 1000;
  assert.equal(bot.sweepDeferred(), 1);
  await bot.idle();
  assert.equal(client.log.mentions['812'], 1);
  assert.equal(sentLines(client.log.texts['812']).length, 1);
  assert.deepEqual(bot.deferredList(), []);
});

/** A non-urgent handoff that needs three webhooks (founder request, the question, "Here in chat"). */
async function founderHandoff(bot, conv) {
  await bot.handleEvent(H.incoming(conv, ++msgId, 'talk to a person'));
  await bot.handleEvent(H.incoming(conv, ++msgId, 'question about my listing photos'));
  await bot.handleEvent(H.buttonClick(conv, ++msgId, 'reply:chat', 'Here in chat'));
  await bot.idle();
}

test('round 3 (deferred_starve b): with 50 older junk alerts waiting, the real emergency takes the first free slot; junk retries cannot jump it', async () => {
  const clock = { t: Date.now() };
  const client = recordingClient(() => 1);
  const bot = lineBot({ client, clock });
  await founderHandoff(bot, 821); // takes this hour's one slot
  assert.equal(client.log.mentions['821'], 1);
  const junk = Array.from({ length: 50 }, (_, i) => 900 + i);
  for (const conv of junk) {
    await founderHandoff(bot, conv);
    clock.t += 1000;
  }
  await bot.handleEvent(H.incoming(822, ++msgId, 'my kid is drowning'));
  await bot.idle();
  // the junk keeps writing while it waits: that never moves the emergency back
  for (const conv of junk.slice(0, 10)) await bot.handleEvent(H.incoming(conv, ++msgId, 'hello??'));
  await bot.idle();
  const line = bot.deferredList();
  assert.equal(line.length, 51);
  assert.equal(line[0].convId, '822', 'urgent first in line');
  assert.ok(line[0].urgent);
  // the slot frees: a junk visitor writes first, in the same instant. The sweep that runs on that webhook
  // gives the slot to the emergency, and the junk turn finds it spoken for.
  clock.t += 60 * 60 * 1000 + 1;
  await bot.handleEvent(H.incoming(junk[0], ++msgId, 'still waiting'));
  await bot.idle();
  assert.equal(client.log.mentions['822'], 1, 'the emergency alerted as soon as a slot freed');
  assert.equal(junk.reduce((n, c) => n + (client.log.mentions[String(c)] || 0), 0), 0, 'no junk alert jumped it');
  // the next slot goes to the junk that has waited longest
  clock.t += 60 * 60 * 1000 + 1;
  assert.equal(bot.sweepDeferred(), 1);
  await bot.idle();
  assert.equal(client.log.mentions[String(junk[0])], 1);
  assert.equal(bot.deferredList().length, 49);
});

test('round 3 (deferred_starve c): a full line drops the oldest non-urgent entry, never an urgent one', () => {
  const clock = { t: 1e12 };
  const store = new MemoryStore({ file: null });
  const bot = lineBot({ client: recordingClient(), clock, store });
  const { engine } = H.loadEngine();
  const deferredState = (conv, urgent, at) => {
    const st = engine.handle(null, { kind: 'text', text: urgent ? 'my kid is drowning' : 'hi' }, { now: at }).state;
    st.handoff = { status: 'capped', capped: 'global', cappedAt: at, urgency: urgent ? 'high' : 'normal', done: {}, extra: [] };
    st.contactId = String(conv);
    store.set(bot.key(conv), st);
    bot.trackDeferred(conv, st);
  };
  deferredState(1, true, 1000); // the oldest entry of all is urgent
  for (let i = 0; i < 199; i++) deferredState(100 + i, false, 2000 + i);
  assert.equal(bot.deferredList().length, 200);
  deferredState(400, false, 5000);
  let line = bot.deferredList();
  assert.equal(line.length, 200);
  assert.equal(line[0].convId, '1', 'the urgent entry stays, first in line');
  assert.ok(!line.some((x) => x.convId === '100'), 'the oldest non-urgent entry made room');
  // a line of urgent entries is never trimmed to make room under the soft cap
  for (let i = 0; i < 250; i++) deferredState(1000 + i, true, 6000 + i);
  line = bot.deferredList();
  assert.equal(line.filter((x) => x.urgent).length, 251);
  assert.equal(line.length, 251, 'every non-urgent entry gave way');
  assert.equal(line[0].convId, '1');
  // re-tracking keeps the original place in line (cappedAt), however often it is retried
  clock.t += 3600 * 1000;
  bot.trackDeferred(1, store.get(bot.key(1)));
  assert.equal(bot.deferredList()[0].at, 1000);
});
