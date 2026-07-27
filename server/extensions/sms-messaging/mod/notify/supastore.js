// Durable state for the SMS poller, in prnm-content-production (Supabase).
// Uses PostgREST + the service-role key (bypasses RLS). No client lib needed.
//
// Tables (see migration): sms_poll_cursor, sms_log, sms_heartbeat.
// Idempotency: sms_log has a UNIQUE (event_sequence_id, recipient_role) index.
// We INSERT a 'sending' row first; a 409 means someone already handled this
// exact (event, recipient) → we skip → never a duplicate text.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CURSOR_ID = 'sms_poller';
const HEARTBEAT_ID = 'sms_poller';

const configured = () => !!(SUPABASE_URL && SUPABASE_KEY);

const rest = (path, { method = 'GET', body, prefer } = {}) => {
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
};

// ---- cursor -------------------------------------------------------------
const getCursor = async () => {
  const r = await rest(`sms_poll_cursor?id=eq.${CURSOR_ID}&select=last_sequence_id`);
  if (!r.ok) throw new Error(`getCursor ${r.status}`);
  const rows = await r.json();
  return rows[0]?.last_sequence_id ?? 0;
};

const setCursor = async seq => {
  const r = await rest(`sms_poll_cursor?id=eq.${CURSOR_ID}`, {
    method: 'PATCH',
    body: { last_sequence_id: seq, updated_at: new Date().toISOString() },
    prefer: 'return=minimal',
  });
  if (!r.ok) throw new Error(`setCursor ${r.status}`);
};

// ---- idempotent send claim ---------------------------------------------
// Returns { claimed:true, id } if this (event,recipient) is ours to send,
// or { claimed:false } if a row already exists (duplicate — skip).
const claimSend = async row => {
  const r = await rest('sms_log', {
    method: 'POST',
    body: [row],
    prefer: 'return=representation,resolution=ignore-duplicates',
  });
  if (r.status === 409) return { claimed: false };
  if (!r.ok) throw new Error(`claimSend ${r.status} ${await r.text()}`);
  const rows = await r.json();
  // ignore-duplicates returns [] when the row already existed
  if (!rows.length) return { claimed: false };
  return { claimed: true, id: rows[0].id };
};

const finishSend = async (id, patch) => {
  await rest(`sms_log?id=eq.${id}`, { method: 'PATCH', body: patch, prefer: 'return=minimal' });
};

// Log a non-sending outcome (skipped_no_phone / skipped_disabled / skipped_test)
// without the unique-claim dance (best-effort audit).
const logOutcome = async row => {
  try {
    await rest('sms_log', { method: 'POST', body: [row], prefer: 'return=minimal' });
  } catch (e) {
    /* audit is best-effort */
  }
};

// ---- heartbeat ----------------------------------------------------------
const heartbeatOk = async () => {
  await rest(`sms_heartbeat?id=eq.${HEARTBEAT_ID}`, {
    method: 'PATCH',
    body: { last_ok_at: new Date().toISOString(), consecutive_failures: 0, last_error: null, updated_at: new Date().toISOString() },
    prefer: 'return=minimal',
  });
};

const heartbeatFail = async errMsg => {
  // read-modify-write the failure counter
  try {
    const r = await rest(`sms_heartbeat?id=eq.${HEARTBEAT_ID}&select=consecutive_failures`);
    const cur = (await r.json())[0]?.consecutive_failures ?? 0;
    await rest(`sms_heartbeat?id=eq.${HEARTBEAT_ID}`, {
      method: 'PATCH',
      body: { consecutive_failures: cur + 1, last_error: String(errMsg).slice(0, 400), updated_at: new Date().toISOString() },
      prefer: 'return=minimal',
    });
  } catch (e) {
    /* best-effort */
  }
};

const getHeartbeat = async () => {
  const r = await rest(`sms_heartbeat?id=eq.${HEARTBEAT_ID}&select=*`);
  return (await r.json())[0] || {};
};

module.exports = {
  configured,
  getCursor,
  setCursor,
  claimSend,
  finishSend,
  logOutcome,
  heartbeatOk,
  heartbeatFail,
  getHeartbeat,
};

// ---- opt-out (compliance) ----------------------------------------------
// Local mirror of opt-out state for a fast pre-send check + our own records.
// Twilio Advanced Opt-Out is the carrier-authoritative layer; this backs it up
// and is also populated when Twilio rejects a send with 21610 (opted out).
const isOptedOut = async phone => {
  const r = await rest(`sms_opt_out?phone=eq.${encodeURIComponent(phone)}&select=opted_out`);
  if (!r.ok) return false; // fail-open on read error; Twilio still blocks at carrier level
  const rows = await r.json();
  return rows[0]?.opted_out === true;
};

const setOptOut = async (phone, optedOut, userId) => {
  await rest('sms_opt_out', {
    method: 'POST',
    body: [{ phone, opted_out: optedOut, user_id: userId || null, updated_at: new Date().toISOString(), ...(optedOut ? { opted_out_at: new Date().toISOString() } : {}) }],
    prefer: 'resolution=merge-duplicates,return=minimal',
  });
};

// Returns true if this is the FIRST message to this phone (so we append the
// STOP footer exactly once), and records the first-contact timestamp.
const claimFirstMessage = async phone => {
  const r = await rest(`sms_opt_out?phone=eq.${encodeURIComponent(phone)}&select=first_msg_at`);
  const rows = r.ok ? await r.json() : [];
  const existing = rows[0];
  if (existing?.first_msg_at) return false;
  await rest('sms_opt_out', {
    method: 'POST',
    body: [{ phone, first_msg_at: new Date().toISOString(), updated_at: new Date().toISOString() }],
    prefer: 'resolution=merge-duplicates,return=minimal',
  });
  return true;
};

module.exports.isOptedOut = isOptedOut;
module.exports.setOptOut = setOptOut;
module.exports.claimFirstMessage = claimFirstMessage;

// ---- reply-to-accept context (sms_reply_ctx) ---------------------------
// Lets an inbound "1"/"2"/"YES" be matched back to the transaction we texted
// the host about. Two kinds:
//   'request'         — we sent a HOST_NEW_REQUEST; host may accept/decline.
//   'pending_decline' — host texted "2"; awaiting a "YES" within a short TTL.
const nowIso = () => new Date().toISOString();
const inMin = m => new Date(Date.now() + m * 60000).toISOString();
const enc = encodeURIComponent;

// Record that we texted `phone` a booking request for `txId`. TTL defaults to
// 6 days (the booking-request expiry window in the process).
const rememberRequest = async ({ phone, txId, pool, whenLabel, ttlMinutes = 6 * 24 * 60 }) => {
  try {
    await rest('sms_reply_ctx', {
      method: 'POST',
      body: [{ phone, tx_id: txId, kind: 'request', pool: pool || null, when_label: whenLabel || null, expires_at: inMin(ttlMinutes) }],
      prefer: 'return=minimal',
    });
  } catch (e) {
    /* best-effort; deep link in the text is the fallback */
  }
};

// Unresolved, unexpired 'request' rows for a phone, newest first.
const pendingRequests = async phone => {
  const r = await rest(
    `sms_reply_ctx?phone=eq.${enc(phone)}&kind=eq.request&resolved=eq.false&expires_at=gt.${nowIso()}&order=created_at.desc&select=*`
  );
  if (!r.ok) return [];
  return r.json();
};

const resolveRequest = async (phone, txId) => {
  await rest(`sms_reply_ctx?phone=eq.${enc(phone)}&tx_id=eq.${enc(txId)}&kind=eq.request`, {
    method: 'PATCH',
    body: { resolved: true },
    prefer: 'return=minimal',
  });
};

// Arm a decline that needs a "YES" confirmation (replaces any prior armed one).
const setPendingDecline = async ({ phone, txId, pool, whenLabel, ttlMinutes = 10 }) => {
  await rest(`sms_reply_ctx?phone=eq.${enc(phone)}&kind=eq.pending_decline`, { method: 'DELETE', prefer: 'return=minimal' });
  await rest('sms_reply_ctx', {
    method: 'POST',
    body: [{ phone, tx_id: txId, kind: 'pending_decline', pool: pool || null, when_label: whenLabel || null, expires_at: inMin(ttlMinutes) }],
    prefer: 'return=minimal',
  });
};

const getPendingDecline = async phone => {
  const r = await rest(
    `sms_reply_ctx?phone=eq.${enc(phone)}&kind=eq.pending_decline&expires_at=gt.${nowIso()}&order=created_at.desc&select=*`
  );
  if (!r.ok) return null;
  return (await r.json())[0] || null;
};

const clearPendingDecline = async phone => {
  await rest(`sms_reply_ctx?phone=eq.${enc(phone)}&kind=eq.pending_decline`, { method: 'DELETE', prefer: 'return=minimal' });
};

// ---- expiring-soon warning (idempotency via sms_log) ---------------------
// One warning per transaction, ever. Single poller instance + this pre-check
// is sufficient; rows are written via logOutcome with transition='expire_warning'.
const hasWarnedExpiring = async txId => {
  const r = await rest(`sms_log?transaction_id=eq.${enc(txId)}&transition=eq.expire_warning&limit=1&select=id`);
  if (!r.ok) return true; // fail-closed: on read error, skip rather than risk a dup
  return (await r.json()).length > 0;
};
module.exports.hasWarnedExpiring = hasWarnedExpiring;

const hasReminded = async txId => {
  const r = await rest(`sms_log?transaction_id=eq.${enc(txId)}&transition=eq.reminder_24h&limit=1&select=id`);
  if (!r.ok) return true; // fail-closed: on read error, skip rather than risk a dup
  return (await r.json()).length > 0;
};
module.exports.hasReminded = hasReminded;

// ---- onboarding nudge queue (sms_nudge_queue) ---------------------------
// One-shot "finish your listing" text, enqueued at phone-verification time
// (best-effort call from otp/verify.js) and sent by the poller sweep ~4h
// later inside the daytime window.
const scheduleOnboardNudge = async (phone, userId) => {
  await rest('sms_nudge_queue', {
    method: 'POST',
    body: [{ user_id: userId, phone, due_at: new Date(Date.now() + 4 * 3600 * 1000).toISOString() }],
    prefer: 'return=minimal',
  });
};

// Atomically claim one due pending nudge (PATCH filtered on status=pending is
// the claim; a competing sweep gets zero rows back).
const claimDueNudges = async limit => {
  const r = await rest(
    `sms_nudge_queue?status=eq.pending&due_at=lte.${encodeURIComponent(new Date().toISOString())}&order=due_at.asc&limit=${limit}&select=*`
  );
  if (!r.ok) return [];
  const rows = await r.json();
  const claimed = [];
  for (const row of rows) {
    const c = await rest(`sms_nudge_queue?id=eq.${row.id}&status=eq.pending`, {
      method: 'PATCH',
      body: { status: 'sending' },
      prefer: 'return=representation',
    });
    if (c.ok && (await c.json()).length) claimed.push(row);
  }
  return claimed;
};

const finishNudge = async (id, status) => {
  await rest(`sms_nudge_queue?id=eq.${id}`, {
    method: 'PATCH',
    body: { status, ...(status === 'sent' ? { sent_at: new Date().toISOString() } : {}) },
    prefer: 'return=minimal',
  });
};

// Un-claim (back to pending) — used when the row is due but we're outside the
// send window; it'll be picked up again when the window opens.
const deferNudge = async id => {
  await rest(`sms_nudge_queue?id=eq.${id}`, { method: 'PATCH', body: { status: 'pending' }, prefer: 'return=minimal' });
};

module.exports.scheduleOnboardNudge = scheduleOnboardNudge;
module.exports.claimDueNudges = claimDueNudges;
module.exports.finishNudge = finishNudge;
module.exports.deferNudge = deferNudge;

// ---- reply-to-accept BETA enrollment -----------------------------------
// A host must opt into the beta before "1"/"2" will act on a booking. Stored
// as a permanent row in sms_reply_ctx (kind='beta_optin'), so no new table.
const BETA_FAR_FUTURE = '2099-01-01T00:00:00Z';

const isBetaEnrolled = async phone => {
  const r = await rest(`sms_reply_ctx?phone=eq.${enc(phone)}&kind=eq.beta_optin&select=id&limit=1`);
  if (!r.ok) return false;
  return (await r.json()).length > 0;
};

// Idempotent. Returns true if this call newly enrolled them, false if already in.
const enrollBeta = async phone => {
  if (await isBetaEnrolled(phone)) return false;
  await rest('sms_reply_ctx', {
    method: 'POST',
    body: [{ phone, tx_id: 'beta', kind: 'beta_optin', expires_at: BETA_FAR_FUTURE }],
    prefer: 'return=minimal',
  });
  return true;
};

module.exports.isBetaEnrolled = isBetaEnrolled;
module.exports.enrollBeta = enrollBeta;

// Log an inbound reply we received (e.g. a "1"/"2" while reply-to-accept is
// still disabled). Best-effort; never blocks the webhook response.
const logInboundReply = async ({ phone, token, status }) => {
  try {
    await rest('sms_log', {
      method: 'POST',
      body: [{ event_type: 'inbound_reply', status, recipient_role: 'provider', phone, body_preview: token }],
      prefer: 'return=minimal',
    });
  } catch (e) {
    /* best-effort */
  }
};

module.exports.logInboundReply = logInboundReply;
module.exports.rememberRequest = rememberRequest;
module.exports.pendingRequests = pendingRequests;
module.exports.resolveRequest = resolveRequest;
module.exports.setPendingDecline = setPendingDecline;
module.exports.getPendingDecline = getPendingDecline;
module.exports.clearPendingDecline = clearPendingDecline;
