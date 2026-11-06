'use strict';
/**
 * End to end: real HTTP webhook server + real engine + real Chatwoot client,
 * talking to a mock Chatwoot Application API that records every call.
 */
const test = require('node:test');
const { before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('../server');
const { Bot } = require('../engine/bot');
const { ChatwootClient } = require('../engine/chatwoot');
const { MemoryStore } = require('../engine/memory');
const { Tracker, readLog } = require('../engine/tracking');
const { COPY, LINE_911 } = require('../engine/copy');
const H = require('./helpers');

const TOKEN = 'test-bot-token';
const SECRET = 'test-webhook-secret';
const DEREK = { id: 11, name: 'Derek Bowen' };
const BRANDON = { id: 12, name: 'Brandon Elias' };
const silent = { info() {}, warn() {}, error() {} };

let mock;
let server;
let url;
let bot;
let logFile;

before(async () => {
  mock = await H.startMockChatwoot({ token: TOKEN, existingLabels: ['vip'] });
  const { engine } = H.loadEngine();
  logFile = path.join(H.tmpDir(), 'events.jsonl');
  bot = new Bot({
    engine,
    client: new ChatwootClient({ baseUrl: mock.url, token: TOKEN, accountId: H.ACCOUNT_ID }),
    store: new MemoryStore({ file: null }),
    tracker: new Tracker({ file: logFile }),
    accountId: H.ACCOUNT_ID,
    inboxId: H.INBOX_ID,
    agents: [DEREK, BRANDON],
    publicUrl: 'https://chat.poolrentalnearme.com',
    logger: silent,
  });
  server = createServer({ bot, secret: SECRET, logger: silent, health: { entries: 100 } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}/webhook`;
});

after(async () => {
  await new Promise((r) => server.close(r));
  await mock.close();
});

async function send(payload, opts = {}) {
  const r = await H.postWebhook(url, payload, { secret: SECRET, ...opts });
  await server.drain();
  return r;
}
const base = (conv) => `/api/v1/accounts/${H.ACCOUNT_ID}/conversations/${conv}`;
const callList = (conv, calls = mock.calls) =>
  calls.map((c) => `${c.method} ${c.path.replace(base(conv), '…')}`);
const publicMessages = (calls = mock.calls) =>
  calls.filter(
    (c) => c.method === 'POST' && /\/messages$/.test(c.path) && c.body && c.body.private === false
  );
let msgId = 5000;

test('founder handoff: exact Chatwoot calls, note @mentions both, "I\'ve sent" only after success', async () => {
  mock.reset();
  const conv = 101;
  await send(H.incoming(conv, ++msgId, 'hi'));
  await send(H.buttonClick(conv, 9001, 'founder', 'Talk to the founder'));
  await send(H.incoming(conv, ++msgId, 'my payout from saturday never arrived'));
  await send(H.buttonClick(conv, 9002, 'ref:none', "I don't have it"));
  const beforeHandoff = mock.calls.length;
  await send(H.buttonClick(conv, 9003, 'reply:chat', 'Here in chat'));

  assert.deepEqual(callList(conv), [
    'POST …/messages', // greeting + 3 buttons
    'POST …/messages', // "Sure thing... What's it about?"
    'POST …/custom_attributes', // memory mirrored (handoff started)
    'POST …/messages', // booking ref question
    'POST …/messages', // reply-method question
    'POST …/custom_attributes', // 1. full hash
    'GET …/labels', // 2a. existing labels
    'POST …/labels', // 2b. existing + new
    'POST …/messages', // 3. private note with @mentions
    'POST …/toggle_status', // 4. bot handoff → open
    'POST …/messages', // 5. confirmation
  ]);
  const c = mock.calls;
  assert.equal(c[0].body.content_type, 'input_select');
  assert.deepEqual(
    c[0].body.content_attributes.items.map((i) => i.title),
    ['Booking a swim', 'Hosting a pool', 'Talk to the founder']
  );
  assert.match(c[0].body.content, /automated assistant/);
  assert.match(
    c[1].body.content,
    /^Sure thing\. I'll bring in Derek and Brandon, the founders\. What's it about/
  );
  assert.equal(c[3].body.content, COPY.askBookingRef);
  assert.equal(c[4].body.content, COPY.askReplyMethod);

  const [attrs, getLabels, setLabels, note, toggle, confirm] = c.slice(beforeHandoff);
  assert.deepEqual(attrs.body.custom_attributes, {
    prnm_reply_method: 'chat',
    prnm_urgency: 'normal',
    prnm_handoff_reason: 'founder_request',
    prnm_entry_ids: 'human-talk-to-person',
  });
  assert.equal(getLabels.method, 'GET');
  assert.deepEqual(setLabels.body.labels, ['vip', 'handoff', 'topic-payouts']);
  assert.equal(note.body.private, true);
  assert.equal(note.body.message_type, 'outgoing');
  assert.match(note.body.content, /\[@Derek Bowen\]\(mention:\/\/user\/11\/Derek%20Bowen\)/);
  assert.match(note.body.content, /\[@Brandon Elias\]\(mention:\/\/user\/12\/Brandon%20Elias\)/);
  assert.match(note.body.content, /> my payout from saturday never arrived/);
  assert.match(note.body.content, /Urgency: normal/);
  assert.match(note.body.content, /Booking ref: customer does not have it/);
  assert.match(note.body.content, /Reply method: here in chat/);
  assert.match(
    note.body.content,
    /Conversation: https:\/\/chat\.poolrentalnearme\.com\/app\/accounts\/7\/conversations\/101/
  );
  assert.deepEqual(toggle.body, { status: 'open' });
  assert.equal(confirm.body.private, false);
  assert.equal(
    confirm.body.content,
    "Cool. I've sent Derek and Brandon the rundown so you don't have to explain everything again. They'll reply right here in this chat."
  );

  // "sent" appears in exactly one public message, the last call, after toggle_status returned 200
  const sentIdx = c.findIndex(
    (x) =>
      x.body && typeof x.body.content === 'string' && /I've sent|sent it over/.test(x.body.content)
  );
  assert.equal(sentIdx, c.length - 1);
  assert.ok(c.findIndex((x) => /toggle_status$/.test(x.path)) < sentIdx);

  // every call used the bot token header, never Authorization: Bearer
  for (const x of c) {
    assert.equal(x.token, TOKEN);
    assert.equal(x.authorization, undefined);
    assert.equal(x.forwardedProto, 'https');
  }

  // after the handoff the assistant is silent, even if Chatwoot still reports pending
  mock.reset();
  await send(H.incoming(conv, ++msgId, 'thanks, any update?'));
  assert.deepEqual(mock.calls, []);
});

test('urgent injury: 911 first, priority urgent, toggle open, confirmation — and silence afterwards', async () => {
  mock.reset();
  const conv = 102;
  await send(H.incoming(conv, ++msgId, 'someone is drowning in the pool!!'));
  assert.deepEqual(callList(conv), [
    'POST …/messages',
    'POST …/messages',
    'POST …/custom_attributes',
    'GET …/labels',
    'POST …/labels',
    'POST …/messages',
    'POST …/toggle_priority',
    'POST …/toggle_status',
    'POST …/messages',
  ]);
  const c = mock.calls;
  assert.ok(
    c[0].body.content.startsWith(LINE_911),
    'the very first thing the customer sees is the 911 line'
  );
  assert.equal(c[1].body.content, COPY.labelLineAfter);
  assert.deepEqual(c[4].body.labels, ['vip', 'handoff', 'urgent', 'topic-safety']);
  assert.equal(c[5].body.private, true);
  assert.match(c[5].body.content, /^PRNM handoff \(URGENT\)/);
  assert.match(c[5].body.content, /mention:\/\/user\/11\//);
  assert.match(c[5].body.content, /mention:\/\/user\/12\//);
  assert.deepEqual(c[6].body, { priority: 'urgent' });
  assert.deepEqual(c[7].body, { status: 'open' });
  assert.match(c[8].body.content, /^I've sent Derek and Brandon the rundown and marked it urgent/);

  // the conversation is now open: customer adds their booking link → no reply, only the attribute is filled in
  mock.reset();
  await send(
    H.incoming(
      conv,
      ++msgId,
      'booking https://www.poolrentalnearme.com/order/6abaf08c-023d-4f34-8e87-74ea4a6efac4',
      { status: 'open' }
    )
  );
  assert.deepEqual(callList(conv), ['POST …/custom_attributes']);
  assert.equal(
    mock.calls[0].body.custom_attributes.prnm_booking_ref,
    '6abaf08c-023d-4f34-8e87-74ea4a6efac4'
  );
  assert.equal(publicMessages().length, 0);
});

test('Chatwoot fails at toggle_status: honest fallback, stays pending, retry later skips the duplicate note', async () => {
  mock.reset();
  const conv = 103;
  await send(H.incoming(conv, ++msgId, 'can i talk to a person about my listing photos'));
  mock.fail.push({ match: /toggle_status$/, status: 500, times: 1 });
  const mark = mock.calls.length;
  await send(H.buttonClick(conv, 9101, 'reply:chat', 'Here in chat'));
  const attempt = mock.calls.slice(mark);
  assert.deepEqual(callList(conv, attempt), [
    'POST …/custom_attributes',
    'GET …/labels',
    'POST …/labels',
    'POST …/messages', // note
    'POST …/toggle_status', // 500
    'POST …/messages', // honest fallback
  ]);
  const fallback = attempt[5].body.content;
  assert.match(fallback, /couldn't get this over to Derek and Brandon/);
  assert.match(fallback, /support@poolrentalnearme\.com/);
  assert.doesNotMatch(fallback, /I've sent|sent it over/);
  assert.ok(!mock.calls.some((x) => x.body && /I've sent/.test(x.body.content || '')));
  assert.ok(
    readLog(logFile).some(
      (e) =>
        e.type === 'escalation_failed' &&
        e.step === 'toggle_status' &&
        e.conv === `${H.ACCOUNT_ID}:${conv}`
    )
  );

  // next customer message: retry (note not posted again), then confirm
  const mark2 = mock.calls.length;
  await send(H.incoming(conv, ++msgId, 'hello? still there?'));
  assert.deepEqual(callList(conv, mock.calls.slice(mark2)), [
    'POST …/custom_attributes',
    'GET …/labels',
    'POST …/labels',
    'POST …/toggle_status',
    'POST …/messages',
  ]);
  assert.match(
    mock.calls[mock.calls.length - 1].body.content,
    /^Cool\. I've sent Derek and Brandon the rundown/
  );
});

test('Chatwoot fails at the private note: toggle_status is never called, so the conversation stays pending', async () => {
  mock.reset();
  const conv = 104;
  await send(H.incoming(conv, ++msgId, 'talk to the founder about a partnership'));
  mock.fail.push({
    match: /^POST .*\/messages$/,
    when: (b) => b && b.private === true,
    status: 500,
    times: 1,
  });
  const mark = mock.calls.length;
  await send(H.buttonClick(conv, 9201, 'reply:chat', 'Here in chat'));
  assert.deepEqual(callList(conv, mock.calls.slice(mark)), [
    'POST …/custom_attributes',
    'GET …/labels',
    'POST …/labels',
    'POST …/messages', // note → 500
    'POST …/messages', // honest fallback
  ]);
  assert.ok(
    !mock.calls.some((x) => /toggle_status$/.test(x.path)),
    'never opened: Chatwoot keeps it pending'
  );
  const last = publicMessages().pop();
  assert.match(last.body.content, /support@poolrentalnearme\.com/);
  assert.doesNotMatch(last.body.content, /I've sent|sent it over/);
});

test('Chatwoot fails at labels: no note, no toggle, honest fallback', async () => {
  mock.reset();
  const conv = 105;
  await send(H.incoming(conv, ++msgId, 'talk to the founder about a partnership'));
  mock.fail.push({ match: /^POST .*\/labels$/, status: 422, times: 1 });
  await send(H.buttonClick(conv, 9202, 'reply:chat', 'Here in chat'));
  assert.ok(!mock.calls.some((x) => /toggle_status$/.test(x.path)));
  assert.ok(!mock.calls.some((x) => x.body && x.body.private === true));
  assert.match(publicMessages().pop().body.content, /support@poolrentalnearme\.com/);
});

test('webhook security: unsigned, forged and stale requests are rejected before anything runs', async () => {
  mock.reset();
  const payload = H.incoming(110, ++msgId, 'how do i book');
  assert.equal((await H.postWebhook(url, payload)).status, 401);
  assert.equal((await H.postWebhook(url, payload, { secret: 'wrong-secret' })).status, 401);
  const body = JSON.stringify(payload);
  const old = H.sign(SECRET, body, Math.floor(Date.now() / 1000) - 3600);
  const stale = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Chatwoot-Timestamp': old.ts,
      'X-Chatwoot-Signature': old.sig,
    },
    body,
  });
  assert.equal(stale.status, 401);
  await server.drain();
  assert.deepEqual(mock.calls, []);
  const health = await fetch(url.replace('/webhook', '/healthz'));
  assert.deepEqual(await health.json(), { ok: true, entries: 100 });
});

test('retries are deduplicated by delivery id and by message id', async () => {
  mock.reset();
  const conv = 111;
  const p = H.incoming(conv, ++msgId, 'is the pool heated');
  await send(p, { delivery: 'same-delivery' });
  const n = mock.calls.length;
  await send(p, { delivery: 'same-delivery' });
  await send(p, { delivery: 'another-delivery-same-message' });
  assert.equal(mock.calls.length, n);
  assert.equal(publicMessages().length, 2); // label line + answer, once
});

test('a human agent replies: the assistant stands down and opens the conversation', async () => {
  mock.reset();
  const conv = 114;
  await send(H.incoming(conv, ++msgId, 'how do i book a pool'));
  mock.reset();
  await send(H.agentReply(conv, ++msgId, 'Hey, Derek here, I can help.'));
  assert.deepEqual(callList(conv), ['POST …/toggle_status']);
  mock.reset();
  await send(H.incoming(conv, ++msgId, 'thanks Derek, what about parking?'));
  assert.deepEqual(mock.calls, []);
});

test('card number end to end: warned, note to delete, digits never sent to Chatwoot or written to the log', async () => {
  mock.reset();
  const conv = 113;
  await send(H.incoming(conv, ++msgId, 'charged twice?? card 4242 4242 4242 4242'));
  const all = JSON.stringify(mock.calls.map((c) => c.body));
  assert.doesNotMatch(all, /4242/);
  assert.ok(mock.calls.some((c) => c.body && c.body.content === COPY.cardWarning));
  assert.ok(
    mock.calls.some(
      (c) => c.body && c.body.private === true && /Please delete that message/.test(c.body.content)
    )
  );
  assert.doesNotMatch(fs.readFileSync(logFile, 'utf8'), /4242/);
  // "charged twice" is a dispute: urgent handoff
  assert.ok(mock.calls.some((c) => /toggle_priority$/.test(c.path)));
});

test('ignored: other inboxes, other accounts, conversations that are not pending', async () => {
  mock.reset();
  const other = H.incoming(120, ++msgId, 'how do i book');
  other.inbox.id = 99;
  other.conversation.inbox_id = 99;
  await send(other);
  const acct = H.incoming(121, ++msgId, 'how do i book');
  acct.account.id = 1234;
  await send(acct);
  await send(H.incoming(122, ++msgId, 'how do i book', { status: 'open' }));
  await send(H.incoming(123, ++msgId, 'note to self', { status: 'pending' }), {});
  assert.equal(callList(123).length > 0, true); // pending one is answered
  assert.ok(!mock.calls.some((c) => /conversations\/(120|121|122)\//.test(c.path)));
});

test('tracking log: answered entry ids, unmatched questions and escalations, without secrets', () => {
  const ev = readLog(logFile);
  assert.ok(ev.some((e) => e.type === 'answered' && e.entry === 'amenity-heated'));
  assert.ok(ev.some((e) => e.type === 'escalated' && e.reason === 'founder_request'));
  assert.ok(ev.some((e) => e.type === 'handoff' && e.urgency === 'high'));
  const raw = fs.readFileSync(logFile, 'utf8');
  assert.doesNotMatch(raw, new RegExp(`${TOKEN}|${SECRET}`));
  assert.doesNotMatch(raw, /@example\.com/);
});
