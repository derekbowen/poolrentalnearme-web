// The inbound webhook handler -- assembles the switchboard:
//   verify signature -> idempotency -> context -> (admin command | customer thread)
// Pure-ish: all IO goes through injected `send` + the store, so it tests offline.
// NOT wired to Twilio until the Phase A test matrix passes and Derek says GO.
'use strict';
const cfg = require('../config');
const verify = require('./verify');
const idem = require('./idempotency');
const context = require('./context');
const { parse } = require('./commands');
const { dispatch } = require('./dispatch');
const store = require('./store');
const guard = require('./guard');
const render = require('./render');


// --- transparent pass-through to the EXISTING handler -------------------------
// Non-admin traffic (customers, STOP/START opt-out, booking "1"/"2"/YES) is
// re-signed for the legacy URL and forwarded UNCHANGED, so every current
// behavior is preserved exactly. We own the auth token, so the re-sign is valid.
let _twilio; try { _twilio = require('twilio'); } catch { _twilio = null; }
const LEGACY_URL = process.env.LEGACY_INBOUND_URL || 'https://www.poolrentalnearme.com/api/sms/inbound';
async function forwardToLegacy(params, authToken) {
  const body = new URLSearchParams(params).toString();
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (_twilio && authToken) headers['X-Twilio-Signature'] = _twilio.getExpectedTwilioSignature(authToken, LEGACY_URL, params);
  const r = await fetch(LEGACY_URL, { method: 'POST', headers, body });
  const twiml = await r.text();
  return { status: r.status, twiml, action: 'forwarded-legacy' };
}

const mapThread = t => t ? { id: t.id, owner: t.owner, status: t.status, contact_id: t.contact_id, summary: t.summary } : null;

// deps: { send(phone,text)->{sid,status}, authToken, url, log? }
async function handleInbound(params, deps = {}) {
  const authToken = deps.authToken || process.env.TWILIO_AUTH_TOKEN || process.env.AUTH_TOKEN;
  const url = deps.url || process.env.CONCIERGE_INBOUND_URL || '';
  const signature = deps.signature;
  const send = deps.send;
  const log = deps.log || (() => {});

  // 1) signature — unsigned/bad = drop + log
  if (!verify.verify({ authToken, signature, url, params })) {
    log('drop-unsigned', { from: params.From });
    return { status: 403, action: 'dropped-unsigned' };
  }
  // 2) inbound flood cap (admins + STOP/START exempt) — blocks credit-burn floods
  const from = cfg.norm(params.From || '');
  const rl = guard.checkInbound(from, params.Body, Date.now());
  if (!rl.allowed) { log('rate-limited', { from, count: rl.count }); return { status: 200, action: 'rate-limited', twiml: '<Response></Response>' }; }
  if (!cfg.isAdmin(from)) {
    log('passthrough', { from });
    return forwardToLegacy(params, authToken);   // customers, STOP/START, 1/2/YES — unchanged
  }
  // admin: idempotency (retries) then concierge command handling
  const sid = params.MessageSid || params.SmsMessageSid;
  if (!(await idem.claim(sid, { note: 'concierge-inbound' }))) return { status: 200, action: 'duplicate-skip' };
  const ctx = await context.build(params);
  return handleAdmin(ctx, send, log);
}

function guardedSend(send, log) {
  return async (phone, text) => {
    const g = guard.guardOutbound(Date.now());
    if (!g.allowed) { log('circuit-breaker-tripped', { count: g.count }); return { blocked: true }; }
    return send(phone, text);
  };
}

async function handleAdmin(ctx, rawSend, log) {
  const send = guardedSend(rawSend, log);
  const me = ctx.admin;
  const cmd = parse(ctx.body);

  // pre-fetch anything dispatch needs synchronously
  const renderData = {};
  if (cmd.type === 'STATUS') renderData.status = await render.status();
  if (cmd.type === 'LIST')   renderData.list = await render.list();
  if (cmd.type === 'DIGEST') renderData.digest = await render.digest();
  const renderObj = { status: () => renderData.status, list: () => renderData.list, digest: () => renderData.digest };

  const thr = cmd.thread ? mapThread(await store.getThread(cmd.thread)) : null;
  const getThread = n => (thr && thr.id === n ? thr : null);
  const sticky = cmd.type === 'RELAY' ? await store.stickyThreadFor(me) : null;

  const res = dispatch(cmd, { me, getThread, sticky, render: renderObj });

  if (res.effect) await store.applyEffect(res.effect);
  if (res.toAdmin) await send(ctx.from, res.toAdmin);
  if (res.toCustomer) {
    const t = await store.getThread(res.toCustomer.thread);
    // admin SAY/relay -> human-directed, NOT autonomous, so it bypasses STOP.
    if (t && t.contact_id) await send(t.contact_id, res.toCustomer.text);
  }
  log('admin-cmd', { me, type: cmd.type });
  return { status: 200, action: 'admin', cmd: cmd.type };
}

async function handleCustomer(ctx, rawSend, log) {
  const send = guardedSend(rawSend, log);
  // Phase A: no bot auto-reply. Create/find the thread + notify the routed admin.
  const contact_id = ctx.from;
  const summary = `${ctx.name || 'unknown'} · ${(ctx.body || '').slice(0, 30)}`;
  const thread = await store.findOrCreateThread(contact_id, { summary });
  const owner = thread.owner && thread.owner !== 'bot' ? thread.owner : 'derek'; // routectl round-robin later
  const adminPhone = owner === 'brandon' ? cfg.BRANDON : cfg.DEREK;
  const photos = ctx.media && ctx.media.length ? ` [${ctx.media.length} photo(s)]` : '';
  const known = ctx.known ? '' : ' (new number)';
  const ping = `📨 Thread ${thread.id} · ${ctx.name || ctx.from}${known}${photos}\n"${(ctx.body || '').slice(0, 70)}"\nTAKE ${thread.id} to reply.`;
  await send(adminPhone, ping);
  log('customer-thread', { thread: thread.id, from: ctx.from });
  return { status: 200, action: 'customer-thread', thread: thread.id };
}

module.exports = { handleInbound };
