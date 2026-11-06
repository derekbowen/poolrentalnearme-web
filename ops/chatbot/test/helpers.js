'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { loadBank } = require('../engine/bank');
const { Engine } = require('../engine/flows');

let cached = null;
function loadEngine() {
  if (!cached) {
    const { entries, routes } = loadBank();
    cached = { entries, routes, engine: new Engine({ bank: entries, routes }) };
  }
  return cached;
}

/**
 * Drive the engine through a list of turns. A turn is a string (typed text)
 * or { button: value, title } or { text }. Escalations are resolved with
 * `escalation(result)` (default: success).
 */
function talk(engine, turns, { state = null, escalation = () => ({ ok: true }) } = {}) {
  const transcript = [];
  let st = state;
  for (const t of turns) {
    const input =
      typeof t === 'string'
        ? { kind: 'text', text: t }
        : t.button
          ? { kind: 'button', value: t.button, title: t.title || '' }
          : { kind: 'text', ...t };
    const res = engine.handle(st, input);
    st = res.state;
    const entry = { input, actions: [...res.actions], events: [...res.events], escalations: [] };
    for (const a of res.actions) {
      if (a.type !== 'escalate') continue;
      const result = escalation(st);
      const after = engine.afterEscalation(st, result);
      entry.escalations.push({ result, before: st, actions: after.actions, events: after.events });
      st = after.state;
      entry.actions.push(...after.actions.map((x) => ({ ...x, afterEscalation: true })));
      entry.events.push(...after.events);
    }
    entry.state = st;
    transcript.push(entry);
  }
  return { transcript, state: st };
}

/** Every public message the customer saw, in order. */
function botLines(transcript) {
  const out = [];
  for (const t of transcript)
    for (const a of t.actions) if (a.type === 'say' || a.type === 'select') out.push(a.content);
  return out;
}

function lastPublic(entry) {
  const pub = entry.actions.filter((a) => a.type === 'say' || a.type === 'select');
  return pub[pub.length - 1];
}

/**
 * Mock Chatwoot Application API. Records every call; `fail` is a list of
 * { match: RegExp (against "METHOD path"), when?: body => bool, status, times } rules.
 */
function startMockChatwoot({ token = 'test-bot-token', existingLabels = ['vip'] } = {}) {
  const calls = [];
  const fail = [];
  let nextId = 1000;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const parsed = body ? JSON.parse(body) : null;
      const sig = `${req.method} ${req.url}`;
      calls.push({
        method: req.method,
        path: req.url,
        body: parsed,
        token: req.headers.api_access_token,
        authorization: req.headers.authorization,
        forwardedProto: req.headers['x-forwarded-proto'],
      });
      const send = (code, obj) => {
        const s = obj === undefined ? '' : JSON.stringify(obj);
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(s);
      };
      if (req.headers.api_access_token !== token)
        return send(401, { error: 'Invalid Access Token' });
      const rule = fail.find(
        (f) => f.match.test(sig) && f.times > 0 && (!f.when || f.when(parsed))
      );
      if (rule) {
        rule.times -= 1;
        return send(rule.status, { error: 'mock failure' });
      }
      if (req.method === 'POST' && /\/messages$/.test(req.url))
        return send(200, { id: nextId++, ...parsed });
      if (req.method === 'GET' && /\/labels$/.test(req.url))
        return send(200, { payload: existingLabels });
      if (req.method === 'POST' && /\/labels$/.test(req.url))
        return send(200, { payload: parsed.labels });
      if (req.method === 'POST' && /\/custom_attributes$/.test(req.url))
        return send(200, { custom_attributes: parsed.custom_attributes });
      if (req.method === 'POST' && /\/toggle_status$/.test(req.url))
        return send(200, { payload: { success: true, current_status: 'open' } });
      if (req.method === 'POST' && /\/toggle_priority$/.test(req.url)) return send(200);
      if (req.method === 'GET' && /\/conversations\/\d+$/.test(req.url))
        return send(200, { id: 1, custom_attributes: {} });
      return send(404, { error: 'not mocked' });
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        server,
        calls,
        fail,
        url: `http://127.0.0.1:${server.address().port}`,
        reset() {
          calls.length = 0;
          fail.length = 0;
        },
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

function sign(secret, body, ts = Math.floor(Date.now() / 1000)) {
  return {
    ts: String(ts),
    sig: `sha256=${crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')}`,
  };
}

let deliveryCounter = 0;
async function postWebhook(url, payload, { secret = null, headers = {}, delivery } = {}) {
  const body = JSON.stringify(payload);
  const h = {
    'Content-Type': 'application/json',
    'X-Chatwoot-Delivery': delivery || `d-${++deliveryCounter}-${Date.now()}`,
    ...headers,
  };
  if (secret) {
    const { ts, sig } = sign(secret, body);
    h['X-Chatwoot-Timestamp'] = ts;
    h['X-Chatwoot-Signature'] = sig;
  }
  const res = await fetch(url, { method: 'POST', headers: h, body });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const ACCOUNT_ID = 7;
const INBOX_ID = 3;

/** Each test conversation is its own visitor unless `contactId` says otherwise (flood caps count per contact). */
const contactFor = (convId, contactId) => (contactId == null ? 50000 + Number(convId) : contactId);

function incoming(
  convId,
  msgId,
  content,
  { status = 'pending', attrs = {}, attachments = [], contactId = null } = {}
) {
  const cid = contactFor(convId, contactId);
  return {
    event: 'message_created',
    id: msgId,
    content,
    content_type: 'text',
    content_attributes: {},
    message_type: 'incoming',
    private: false,
    sender: { id: cid, name: 'Visitor', email: null, phone_number: null, identifier: null },
    account: { id: ACCOUNT_ID, name: 'Pool Rental Near Me' },
    inbox: { id: INBOX_ID, name: 'Website' },
    attachments,
    conversation: {
      id: convId,
      inbox_id: INBOX_ID,
      status,
      custom_attributes: attrs,
      labels: [],
      meta: { sender: { id: cid, name: 'Visitor' } },
      contact_inbox: { contact_id: cid },
    },
  };
}

function buttonClick(convId, msgId, value, title, { status = 'pending', contactId = null } = {}) {
  const cid = contactFor(convId, contactId);
  return {
    event: 'message_updated',
    id: msgId,
    content: 'buttons',
    content_type: 'input_select',
    content_attributes: { items: [{ title, value }], submitted_values: [{ title, value }] },
    message_type: 'outgoing',
    private: false,
    sender: { id: 9, name: 'PRNM Assistant (automated)', type: 'agent_bot' },
    account: { id: ACCOUNT_ID, name: 'Pool Rental Near Me' },
    inbox: { id: INBOX_ID, name: 'Website' },
    conversation: {
      id: convId,
      inbox_id: INBOX_ID,
      status,
      custom_attributes: {},
      labels: [],
      meta: { sender: { id: cid, name: 'Visitor' } },
      contact_inbox: { contact_id: cid },
    },
  };
}

function resolved(convId, { contactId = null } = {}) {
  const cid = contactFor(convId, contactId);
  return {
    event: 'conversation_resolved',
    id: convId,
    inbox_id: INBOX_ID,
    status: 'resolved',
    account: { id: ACCOUNT_ID, name: 'Pool Rental Near Me' },
    inbox: { id: INBOX_ID, name: 'Website' },
    meta: { sender: { id: cid, name: 'Visitor' } },
    contact_inbox: { contact_id: cid },
  };
}

function agentReply(convId, msgId, content, { status = 'pending' } = {}) {
  return {
    ...incoming(convId, msgId, content, { status }),
    message_type: 'outgoing',
    sender: { id: 11, name: 'Derek Bowen', email: 'derek@example.invalid', type: 'user' },
  };
}

function tmpDir(prefix = 'prnm-bot-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

module.exports = {
  loadEngine,
  talk,
  botLines,
  lastPublic,
  startMockChatwoot,
  postWebhook,
  sign,
  incoming,
  buttonClick,
  resolved,
  agentReply,
  tmpDir,
  ACCOUNT_ID,
  INBOX_ID,
};
