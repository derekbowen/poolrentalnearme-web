// Founder Welcome Text. When a host-intent user signs up (publicData.userType
// === 'provider'), enqueue a ONE-TIME welcome SMS ~2 min later and send it from
// the poller sweep. Fully decoupled from the "Complete Your Listing" campaign
// cron — different process, tiny volume, own queue table.
//
// Guards (spec):
//   - only host-intent signups (userType 'provider')
//   - only fresh signups (created within FOUNDER_WELCOME_MAX_AGE_MS) so a
//     cursor jump can never backfill-blast old accounts
//   - skip internal/test accounts (shared exclude.js)
//   - never send if the number is opted out (sms_opt_out)
//   - never send twice: UNIQUE(user_id) on the queue = idempotent enqueue,
//     status pending->sent transition = idempotent send
//   - quiet hours: a welcome due between 8 PM and 9 AM Pacific is held for the
//     next 9:05 AM Pacific
//   - re-check host-intent + phone + opt-out at SEND time (phone may be captured
//     a moment after user/created; intent may change)
//   - every send logged to sms_log (event_type='founder_welcome')
//   - inbound replies ride the SAME forwarding already live in inbound.js
//
// Gated by FOUNDER_WELCOME_ENABLED (default off). Queue: sms_welcome_queue.

const moment = require('moment-timezone');
const integrationSdk = require('api-util/integration');
const twsend = require('./twsend');
const store = require('./supastore');
const { getPhoneNumber } = require('extensions/sms-messaging/utils/sms');
const { isTestAccount } = require('./exclude');

const TZ = 'America/Los_Angeles';
const ENABLED = () => process.env.FOUNDER_WELCOME_ENABLED === 'true';
const DELAY_MS = Number(process.env.FOUNDER_WELCOME_DELAY_MS || 2 * 60 * 1000); // ~2 min
const MAX_AGE_MS = Number(process.env.FOUNDER_WELCOME_MAX_AGE_MS || 15 * 60 * 1000); // fresh-signup guard
const SWEEP_MS = Number(process.env.FOUNDER_WELCOME_SWEEP_MS || 60 * 1000); // check the queue every minute
const HOST_USERTYPE = process.env.FOUNDER_WELCOME_USERTYPE || 'provider';
const QUIET_START = Number(process.env.FOUNDER_WELCOME_QUIET_START || 20); // 8 PM Pacific
const QUIET_END = Number(process.env.FOUNDER_WELCOME_QUIET_END || 9); //     9 AM Pacific

// GSM-7 safe (ASCII hyphens/quotes, no em-dash/smart quotes) so it stays 2
// segments. Overridable via env without a redeploy. Self-contained STOP line
// keeps it compliant regardless of first-contact state.
const BODY =
  process.env.FOUNDER_WELCOME_BODY ||
  "Hey, it's Derek, founder of Pool Rental Near Me - welcome aboard! Me and Brandon " +
    "run this personally. Listing your pool takes about 10 minutes and it's 0% host fees " +
    'all of 2026, so you keep everything. Questions? Just reply here or call, we actually ' +
    'answer. Reply STOP to opt out.';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Reuses the existing sms_nudge_queue table (id,user_id,phone,due_at,status,
// created_at,sent_at) with a 'welcome_' status namespace. The sibling onboard
// nudge sweep filters status='pending', so the two never collide. (No DDL access
// in this env; a dedicated sms_welcome_queue is a clean-up-later, sql provided.)
const TABLE = process.env.FOUNDER_WELCOME_TABLE || 'sms_nudge_queue';
const ST_PENDING = 'welcome_pending';
const ST_SENDING = 'welcome_sending';

const log = (...a) => console.log('[founder-welcome]', ...a);

// ---- own queue REST (keeps supastore.js untouched) ----------------------
const rest = (path, { method = 'GET', body, prefer } = {}) => {
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
};

// ---- quiet hours + scheduling ------------------------------------------
const inQuietHours = m => {
  const h = m.hour();
  return h >= QUIET_START || h < QUIET_END; // [20:00, 24:00) U [00:00, 09:00)
};
const inSendWindow = () => !inQuietHours(moment.tz(TZ));

// due_at for a signup at fromMs: +DELAY, unless that lands in quiet hours, in
// which case the next 9:05 AM Pacific (evening -> tomorrow; early AM -> today).
const computeDueAt = fromMs => {
  const t = moment.tz(fromMs + DELAY_MS, TZ);
  if (!inQuietHours(t)) return t.toDate();
  const target = t.clone().hour(9).minute(5).second(0).millisecond(0);
  if (t.hour() >= QUIET_START) target.add(1, 'day');
  return target.toDate();
};

// ---- enqueue (called from the poller on user/created) -------------------
// Never throws — a welcome-enqueue failure must not disturb the SMS poller.
const onUserCreated = async (seq, resource) => {
  if (!ENABLED()) return;
  try {
    const userId = resource?.id?.uuid;
    if (!userId) return;
    // Re-fetch fresh (event snapshot may lag phone capture by a beat).
    let user;
    try {
      user = await integrationSdk.users.show({ id: userId });
    } catch (e) {
      // some SDK versions nest under .data.data
      user = null;
    }
    if (!user) return;
    const attrs = user.attributes || {};
    const createdAt = attrs.createdAt ? new Date(attrs.createdAt).getTime() : Date.now();
    if (Date.now() - createdAt > MAX_AGE_MS) return; // stale (cursor jump) — never backfill-blast
    if (isTestAccount(user)) return;
    const userType = attrs.profile?.publicData?.userType;
    if (userType !== HOST_USERTYPE) return; // host-intent only
    // Spec trigger: "signup where a phone number is captured". Phone is a
    // protected-scope signup field, so it's present at user/created. Skip if
    // absent (and the queue's phone column is NOT NULL). Re-checked at send.
    const phone = getPhoneNumber({ user });
    if (!phone) return;
    // Dedupe: never enqueue a second welcome for a user we've already queued/sent.
    // (Single poller instance → pre-check is sufficient, matching the codebase's
    // beta/expiring patterns; sms_nudge_queue has no UNIQUE(user_id).)
    const dup = await rest(`${TABLE}?user_id=eq.${encodeURIComponent(userId)}&status=like.welcome*&select=id&limit=1`);
    if (dup.ok && (await dup.json()).length) return;
    const dueAt = computeDueAt(createdAt).toISOString();
    const r = await rest(TABLE, {
      method: 'POST',
      body: [{ user_id: userId, phone, due_at: dueAt, status: ST_PENDING }],
      prefer: 'return=representation',
    });
    if (r.ok) {
      const rows = await r.json().catch(() => []);
      if (rows.length) log('enqueued welcome', userId.slice(0, 8), 'due', dueAt, phone ? '' : '(phone pending)');
    }
  } catch (e) {
    log('enqueue error', e.message);
  }
};

// ---- sweep (called on an interval from the poller) ----------------------
const claimDue = async limit => {
  const r = await rest(
    `${TABLE}?status=eq.${ST_PENDING}&due_at=lte.${encodeURIComponent(new Date().toISOString())}&order=due_at.asc&limit=${limit}&select=*`
  );
  if (!r.ok) return [];
  const rows = await r.json();
  const claimed = [];
  for (const row of rows) {
    const c = await rest(`${TABLE}?id=eq.${row.id}&status=eq.${ST_PENDING}`, {
      method: 'PATCH',
      body: { status: ST_SENDING },
      prefer: 'return=representation',
    });
    if (c.ok && (await c.json()).length) claimed.push(row);
  }
  return claimed;
};

// Terminal/skip statuses are namespaced 'welcome_*' so a caller passes the bare
// suffix ('sent','skipped_opted_out',...) and we store 'welcome_<suffix>'.
const finish = async (id, suffix) => {
  const status = `welcome_${suffix}`;
  await rest(`${TABLE}?id=eq.${id}`, {
    method: 'PATCH',
    body: { status, ...(suffix === 'sent' ? { sent_at: new Date().toISOString() } : {}) },
    prefer: 'return=minimal',
  });
};

// Return a row to welcome_pending with a new due_at (quiet-hours / retry defer).
const defer = async (id, dueAtIso) => {
  await rest(`${TABLE}?id=eq.${id}`, { method: 'PATCH', body: { status: ST_PENDING, due_at: dueAtIso }, prefer: 'return=minimal' });
};

const sendOne = async row => {
  const base = { event_type: 'founder_welcome', recipient_role: 'provider', recipient_user_id: row.user_id };
  // Belt & suspenders: never fire outside the daytime window.
  if (!inSendWindow()) {
    await defer(row.id, computeDueAt(Date.now()).toISOString());
    return;
  }
  // Re-fetch and re-validate everything at send time.
  let user = null;
  try {
    user = await integrationSdk.users.show({ id: row.user_id });
  } catch (e) {
    user = null;
  }
  if (!user) {
    await finish(row.id, 'failed');
    await store.logOutcome({ ...base, phone: row.phone, status: 'failed', error: 'user_show_failed' });
    return;
  }
  if (isTestAccount(user)) {
    await finish(row.id, 'skipped_test');
    return;
  }
  if (user.attributes?.profile?.publicData?.userType !== HOST_USERTYPE) {
    await finish(row.id, 'skipped_not_host');
    return;
  }
  const phone = getPhoneNumber({ user });
  if (!phone) {
    await finish(row.id, 'skipped_no_phone');
    return;
  }
  if (await store.isOptedOut(phone)) {
    await finish(row.id, 'skipped_opted_out');
    await store.logOutcome({ ...base, phone, status: 'skipped_opted_out' });
    return;
  }
  try {
    const msg = await twsend({ body: BODY, phoneNumber: phone });
    await finish(row.id, 'sent');
    await store.logOutcome({ ...base, phone, status: 'sent', twilio_sid: msg?.sid || null, body_preview: BODY.slice(0, 120) });
    log('welcome sent', phone, msg?.sid);
  } catch (e) {
    if (e && (e.code === 21610 || /opted out/i.test(e.message || ''))) {
      await store.setOptOut(phone, true, row.user_id);
      await finish(row.id, 'skipped_opted_out');
      await store.logOutcome({ ...base, phone, status: 'skipped_opted_out', error: '21610' });
      return;
    }
    // Transient — leave for the next sweep (bounded retry via re-pending).
    await defer(row.id, new Date(Date.now() + 5 * 60 * 1000).toISOString());
    await store.logOutcome({ ...base, phone, status: 'failed', error: String(e.message || e).slice(0, 300) });
    log('welcome FAILED', phone, e.message);
  }
};

const sweep = async () => {
  if (!ENABLED()) return;
  try {
    const due = await claimDue(10);
    for (const row of due) await sendOne(row);
    if (due.length) log(`swept ${due.length} due welcome(s)`);
  } catch (e) {
    log('sweep error', e.message);
  }
};

const start = () => {
  log(
    `${ENABLED() ? 'ENABLED' : 'disabled'}; userType=${HOST_USERTYPE}, delay=${DELAY_MS}ms, ` +
      `quiet=${QUIET_START}:00-${QUIET_END}:00 ${TZ}, sweep=${SWEEP_MS}ms`
  );
  setInterval(sweep, SWEEP_MS);
};

module.exports = { onUserCreated, sweep, start, computeDueAt, inQuietHours, BODY, TZ };
