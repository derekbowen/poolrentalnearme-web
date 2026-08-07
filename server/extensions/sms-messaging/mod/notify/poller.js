// Self-contained SMS notifier. Polls the Sharetribe Integration API events
// feed (no RabbitMQ), maps transitions/messages to host+guest SMS, and sends
// via the existing Twilio helper. Durable cursor + idempotent audit log live
// in Supabase (prnm-content-production). Fully observable; kill-switchable.

const integrationSdk = require('api-util/integration');
const send = require('extensions/common/mod/sms/send');
const twsend = require('./twsend');
const { getPhoneNumber } = require('extensions/sms-messaging/utils/sms');
const T = require('extensions/sms-messaging/config/events');
const store = require('./supastore');
const { buildMessage } = require('./messages');
const { isTestAccount } = require('./exclude');
const welcome = require('./welcome'); // Founder Welcome Text (host-signup SMS)
const swimplyResync = require('./swimply-resync'); // auto re-sync of host Swimply iCal feeds

const POLL_MS = Number(process.env.SMS_POLL_INTERVAL_MS || 12000);
const HEARTBEAT_STALE_MS = 15 * 60 * 1000;
const ALARM_PHONE = process.env.SMS_ALARM_PHONE || '';
const PAYOUT_SMS = process.env.PAYOUT_SMS_ENABLED !== 'false'; // default on
const smsEnabled = () => process.env.SMS_NOTIFICATIONS_ENABLED === 'true';

// Soft-launch allowlist. When SMS_ALLOWLIST is set to a comma-separated list of
// E.164 numbers, ONLY those recipients get texts (everyone else is logged as
// skipped_not_allowlisted). Empty/unset = wide launch (send to everyone).
// Read fresh each send so the list can be widened without a redeploy.
const allowlist = () =>
  (process.env.SMS_ALLOWLIST || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
const isAllowlisted = phone => {
  const list = allowlist();
  return list.length === 0 || list.includes(phone);
};

// transaction/initiated is REQUIRED for inquiries: an inquiry is the tx's FIRST
// transition, which emits initiated (not transitioned). Without it the poller
// is structurally deaf to inquiries regardless of the K map.
const EVENT_TYPES = 'transaction/transitioned,transaction/initiated,message/created,user/created';

// transition → list of { role, kind }
const K = {
  [T.TRANSITION_CONFIRM_PAYMENT]: [{ role: 'provider', kind: 'HOST_NEW_REQUEST' }, { role: 'customer', kind: 'GUEST_REQUEST_RECEIVED' }],
  [T.TRANSITION_REQUEST]: [{ role: 'provider', kind: 'HOST_NEW_REQUEST' }, { role: 'customer', kind: 'GUEST_REQUEST_RECEIVED' }],
  [T.TRANSITION_REQUEST_AFTER_INQUIRY]: [{ role: 'provider', kind: 'HOST_NEW_REQUEST' }, { role: 'customer', kind: 'GUEST_REQUEST_RECEIVED' }],
  [T.TRANSITION_ACCEPT]: [{ role: 'customer', kind: 'GUEST_ACCEPTED' }],
  [T.TRANSITION_ACCEPT_WITH_PAYMENT]: [{ role: 'customer', kind: 'GUEST_ACCEPTED' }],
  [T.TRANSITION_OPERATOR_ACCEPT_WITH_PAYMENT]: [{ role: 'customer', kind: 'GUEST_ACCEPTED' }],
  // c148: Console/inbound accepts fire plain operator-accept - guests heard nothing.
  'transition/operator-accept': [{ role: 'customer', kind: 'GUEST_ACCEPTED' }],
  'transition/operator-decline': [{ role: 'customer', kind: 'GUEST_DECLINED' }],
  [T.TRANSITION_DECLINE]: [{ role: 'customer', kind: 'GUEST_DECLINED' }],
  [T.TRANSITION_DECLINE_WITHOUT_PAYMENT]: [{ role: 'customer', kind: 'GUEST_DECLINED' }],
  [T.TRANSITION_OPERATOR_DECLINE_WITHOUT_PAYMENT]: [{ role: 'customer', kind: 'GUEST_DECLINED' }],
  [T.TRANSITION_EXPIRE]: [{ role: 'customer', kind: 'GUEST_DECLINED' }],
  [T.TRANSITION_CANCEL]: [{ role: 'provider', kind: 'HOST_CANCELLED' }, { role: 'customer', kind: 'GUEST_CANCELLED' }],
  // c154: completion opens the review window (expires ~7 days) - guests heard
  // nothing and reviews were silently lost. Text them the direct link.
  [T.TRANSITION_COMPLETE]: [{ role: 'provider', kind: 'HOST_PAYOUT' }, { role: 'customer', kind: 'GUEST_REVIEW_INVITE' }],
  [T.TRANSITION_OPERATOR_COMPLETE]: [{ role: 'provider', kind: 'HOST_PAYOUT' }, { role: 'customer', kind: 'GUEST_REVIEW_INVITE' }],
  // Custom Offers: host sends a package deal → text the guest; guest accepts → text the host.
  'transition/send-offer': [{ role: 'customer', kind: 'OFFER_RECEIVED' }],
  'transition/accept-offer': [{ role: 'provider', kind: 'OFFER_ACCEPTED' }],
  // Inquiries: with a message the 💬 message/created text already reaches the
  // host; the message-less inquiry was previously SILENT (host never knew a
  // guest was interested). processTransaction skips this kind when the tx
  // already has a message, so it fires only for the silent case.
  'transition/inquire': [{ role: 'provider', kind: 'INQUIRY_RECEIVED' }],
};

const log = (...a) => console.log('[sms-poller]', ...a);

// Appended once, to a user's FIRST text (Twilio-recommended + branded).
const FIRST_MSG_FOOTER = '\n\nMsgs from Pool Rental Near Me. Reply STOP to opt out, HELP for help.';

// resolve a transactions.show() response (data + included) into named entities.
// The Integration SDK here is wrapped by wrapInstanceWithResponseTransformer,
// so callers pass { allowRawResponse: true } and we read the raw SDK payload
// off res._raw (res itself is the denormalised entity array).
const resolveTx = res => {
  const raw = res._raw || res;
  const { data, included = [] } = raw.data;
  const find = ref => (ref ? included.find(i => i.type === ref.type && i.id.uuid === ref.id.uuid) : null);
  const rel = data.relationships || {};
  return {
    tx: data,
    txId: data.id.uuid,
    listing: find(rel.listing?.data),
    booking: find(rel.booking?.data),
    customer: find(rel.customer?.data),
    provider: find(rel.provider?.data),
  };
};

// Format an integer cents amount as "$150" (whole) or "$149.50".
const fmtUsd = cents =>
  typeof cents === 'number' ? `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}` : '';

const ctxFrom = r => {
  const offer = r.tx?.attributes?.protectedData?.pendingOffer || null;
  return {
    listing: r.listing?.attributes?.title || 'your pool',
    booking: r.booking?.attributes || null,
    tz: r.listing?.attributes?.availabilityPlan?.timezone || null,
    txId: r.txId,
    guestName: r.customer?.attributes?.profile?.firstName || '',
    hostName: r.provider?.attributes?.profile?.firstName || '',
    // Present only on offer transitions; templates guard on it.
    offerAmount: offer ? fmtUsd(offer.negotiatedPriceCents) : '',
  };
};

// One (event, recipient) → at most one SMS, logged, idempotent.
const deliver = async ({ seq, eventType, transition, txId, role, user, kind, ctx, snippet }) => {
  const base = {
    event_sequence_id: seq,
    recipient_role: role,
    transaction_id: txId,
    transition: transition || null,
    event_type: eventType,
    recipient_user_id: user?.id?.uuid || null,
  };
  if (!user || isTestAccount(user)) {
    await store.logOutcome({ ...base, status: 'skipped_test' });
    return;
  }
  const phone = getPhoneNumber({ user });
  if (!phone) {
    await store.logOutcome({ ...base, status: 'skipped_no_phone' });
    return;
  }
  // Compliance: never text an opted-out number (local mirror; Twilio also
  // blocks at the carrier level with 21610, which we capture below).
  if (await store.isOptedOut(phone)) {
    await store.logOutcome({ ...base, status: 'skipped_opted_out', phone });
    return;
  }
  // Soft-launch gate: during the allowlist window, non-listed recipients are
  // recorded but never texted.
  if (!isAllowlisted(phone)) {
    await store.logOutcome({ ...base, status: 'skipped_not_allowlisted', phone });
    return;
  }
  if (!smsEnabled()) {
    await store.logOutcome({ ...base, status: 'skipped_disabled', phone });
    return;
  }
  // Atomically claim this (event, recipient) — a duplicate returns not-claimed.
  const claim = await store.claimSend({ ...base, phone, status: 'sending' });
  if (!claim.claimed) {
    log('dup skip', seq, role);
    return;
  }
  let body = buildMessage(kind, { ...ctx, snippet });
  // First text to this number gets the branded STOP footer exactly once.
  if (await store.claimFirstMessage(phone)) {
    body += FIRST_MSG_FOOTER;
  }
  try {
    const msg = await twsend({ body, phoneNumber: phone });
    await store.finishSend(claim.id, { status: 'sent', twilio_sid: msg?.sid || null, body_preview: (body || '').slice(0, 120) });
    log('sent', kind, '→', role, msg?.sid);
    // Reply-to-accept: record that this host can now text 1/2 about this tx.
    // (Deep link in the message stays the primary path; this just enables the
    // SMS shortcut. Stored only for delivered host-request texts.)
    if (kind === 'HOST_NEW_REQUEST') {
      await store.rememberRequest({ phone, txId, pool: ctx?.listing });
    }
  } catch (e) {
    // Twilio 21610 = recipient opted out. Record it locally and don't retry.
    if (e && (e.code === 21610 || /opted out/i.test(e.message || ''))) {
      await store.setOptOut(phone, true, user?.id?.uuid);
      await store.finishSend(claim.id, { status: 'skipped_opted_out', error: '21610' });
      log('opted-out (21610)', role, phone);
      return;
    }
    await store.finishSend(claim.id, { status: 'failed', error: String(e.message || e).slice(0, 400), body_preview: (body || '').slice(0, 120) });
    log('SEND FAILED', kind, role, e.message);
    throw e; // bubbles to failure counter
  }
};

const processTransaction = async (seq, resource) => {
  const transition = resource.attributes.lastTransition;
  // Additional-charge transactions reuse booking transition names
  // (transition/request, transition/confirm-payment). Their events must not
  // masquerade as new bookings to the host or the guest.
  const processName = resource.attributes.processName || '';
  if (processName.indexOf('additional-charge') === 0) return;
  let targets = K[transition];
  if (!targets) return;
  targets = targets.filter(t => !(t.kind === 'HOST_PAYOUT' && !PAYOUT_SMS));
  if (!targets.length) return;

  const res = await integrationSdk.transactions.show({
    id: resource.id.uuid,
    include: ['listing', 'booking', 'customer', 'provider'],
  }, { allowRawResponse: true });
  const r = resolveTx(res);
  // Message-less-inquiry guard: if the inquiry carried a message, the
  // message/created event already texts the host — skip to avoid a double.
  // (Events API lags real time by more than the inquiry→message gap, so by
  // processing time the message is queryable if it exists.) On query failure
  // we send anyway: a rare double text beats a silently lost lead.
  if (transition === 'transition/inquire') {
    try {
      const m = await integrationSdk.messages.query(
        { transactionId: r.txId, perPage: 1 },
        { allowRawResponse: true }
      );
      if (((m._raw || m).data.data || []).length > 0) return;
    } catch (e) {
      log('inquire message-check failed, sending anyway', e.message);
    }
  }
  const ctx = ctxFrom(r);
  for (const t of targets) {
    const user = t.role === 'provider' ? r.provider : r.customer;
    await deliver({ seq, eventType: 'transaction/transitioned', transition, txId: r.txId, role: t.role, user, kind: t.kind, ctx });
  }
};

const processMessage = async (seq, resource) => {
  const rel = resource.relationships || {};
  const txRef = rel.transaction?.data;
  const senderRef = rel.sender?.data;
  if (!txRef) return;
  const res = await integrationSdk.transactions.show({
    id: txRef.id.uuid,
    include: ['listing', 'customer', 'provider'],
  }, { allowRawResponse: true });
  const r = resolveTx(res);
  const ctx = ctxFrom(r);
  const snippet = resource.attributes?.content || '';
  const senderId = senderRef?.id?.uuid;
  // Notify the party who did NOT send.
  if (senderId && r.customer && senderId === r.customer.id.uuid) {
    await deliver({ seq, eventType: 'message/created', transition: null, txId: r.txId, role: 'provider', user: r.provider, kind: 'NEW_MESSAGE_TO_HOST', ctx, snippet });
  } else if (senderId && r.provider && senderId === r.provider.id.uuid) {
    await deliver({ seq, eventType: 'message/created', transition: null, txId: r.txId, role: 'customer', user: r.customer, kind: 'NEW_MESSAGE_TO_GUEST', ctx, snippet });
  }
};

let failuresThisCycle = 0;

const pollOnce = async () => {
  let cursor = await store.getCursor();
  // First run: don't blast history — jump the cursor to the latest event.
  if (!cursor || cursor === 0) {
    const latest = await integrationSdk.events.query({ eventTypes: EVENT_TYPES }, { allowRawResponse: true });
    const evs = latest._raw.data.data;
    const maxSeq = evs.reduce((m, e) => Math.max(m, e.attributes.sequenceId), 0);
    if (maxSeq) {
      await store.setCursor(maxSeq);
      log('initialized cursor to latest sequenceId', maxSeq, '(history skipped)');
    }
    await store.heartbeatOk();
    return;
  }
  const res = await integrationSdk.events.query({ startAfterSequenceId: cursor, eventTypes: EVENT_TYPES }, { allowRawResponse: true });
  const events = res._raw.data.data;
  for (const ev of events) {
    const seq = ev.attributes.sequenceId;
    try {
      if (ev.attributes.eventType === 'transaction/transitioned') await processTransaction(seq, ev.attributes.resource);
      // initiated = the tx's first transition. ONLY handle inquiries here —
      // booking initiations (request-payment) must wait for confirm-payment's
      // transitioned event, or hosts would be texted before payment confirms.
      else if (
        ev.attributes.eventType === 'transaction/initiated' &&
        ev.attributes.resource?.attributes?.lastTransition === 'transition/inquire'
      ) await processTransaction(seq, ev.attributes.resource);
      else if (ev.attributes.eventType === 'message/created') await processMessage(seq, ev.attributes.resource);
      else if (ev.attributes.eventType === 'user/created') await welcome.onUserCreated(seq, ev.attributes.resource);
    } catch (e) {
      failuresThisCycle++;
      log('event error seq', seq, e.message);
    }
    cursor = Math.max(cursor, seq);
    await store.setCursor(cursor); // advance per-event so a crash never re-blasts
  }
  await store.heartbeatOk();
  if (events.length) log(`processed ${events.length} event(s), cursor=${cursor}`);
};

// ---- expiring-soon warning sweep -------------------------------------------
// Booking requests auto-expire per process.edn at
// min(entered-pending + 6 days, booking-start + 1 day, booking-end).
// Warn the host once when less than ~3h remains. Runs every 15 min; one
// warning per transaction ever (sms_log transition='expire_warning').
const EXPIRE_WARN_WINDOW_MS = 3 * 3600e3;
const PENDING_TRANSITIONS = [T.TRANSITION_CONFIRM_PAYMENT, T.TRANSITION_REQUEST, T.TRANSITION_REQUEST_AFTER_INQUIRY];

const expiryOf = (tx, booking) => {
  const entered = new Date(tx.attributes.lastTransitionedAt).getTime();
  const candidates = [entered + 6 * 86400e3];
  const bs = booking?.attributes?.start ? new Date(booking.attributes.start).getTime() : null;
  const be = booking?.attributes?.end ? new Date(booking.attributes.end).getTime() : null;
  if (bs) candidates.push(bs + 86400e3);
  if (be) candidates.push(be);
  return Math.min(...candidates);
};

const sweepExpiring = async () => {
  if (!smsEnabled()) return;
  try {
    const res = await integrationSdk.transactions.query(
      { lastTransitions: PENDING_TRANSITIONS, include: ['booking', 'listing', 'provider'], perPage: 100 },
      { allowRawResponse: true }
    );
    const raw = res._raw.data;
    const inc = raw.included || [];
    const find = ref => (ref ? inc.find(i => i.type === ref.type && i.id.uuid === ref.id.uuid) : null);
    for (const tx of raw.data) {
      try {
        const rel = tx.relationships || {};
        const booking = find(rel.booking?.data);
        const provider = find(rel.provider?.data);
        const listing = find(rel.listing?.data);
        const txId = tx.id.uuid;
        const msLeft = expiryOf(tx, booking) - Date.now();
        if (msLeft <= 0 || msLeft > EXPIRE_WARN_WINDOW_MS) continue;
        if (!provider || isTestAccount(provider)) continue;
        const phone = getPhoneNumber({ user: provider });
        if (!phone || (await store.isOptedOut(phone)) || !isAllowlisted(phone)) continue;
        if (await store.hasWarnedExpiring(txId)) continue;
        const ctx = {
          listing: listing?.attributes?.title || 'your pool',
          booking: booking?.attributes || null,
          tz: listing?.attributes?.availabilityPlan?.timezone || null,
          txId,
        };
        let body = buildMessage('HOST_EXPIRING_SOON', ctx);
        if (await store.claimFirstMessage(phone)) body += FIRST_MSG_FOOTER;
        const msg = await twsend({ body, phoneNumber: phone });
        await store.logOutcome({
          event_type: 'expire_sweep', transition: 'expire_warning', transaction_id: txId,
          recipient_role: 'provider', recipient_user_id: provider.id.uuid, phone,
          status: 'sent', twilio_sid: msg?.sid || null, body_preview: body.slice(0, 120),
        });
        log('expire warning sent', txId.slice(0, 8), Math.round(msLeft / 60000) + 'min left');
      } catch (e) {
        if (e && (e.code === 21610 || /opted out/i.test(e.message || ''))) {
          const p = getPhoneNumber({ user: find(tx.relationships?.provider?.data) });
          if (p) await store.setOptOut(p, true);
        } else {
          log('expire warn error', tx.id.uuid.slice(0, 8), e.message);
        }
      }
    }
  } catch (e) {
    log('expire sweep error', e.message);
  }
};

// ---- day-before booking reminder sweep (c109) ------------------------------
// Texts the guest once when their accepted booking starts in ~20-28h. Runs
// every 30 min inside 16:00-24:00 UTC (9AM-5PM PT / noon-8PM ET); one reminder
// per transaction ever (sms_log transition='reminder_24h', fail-closed dedupe).
const ACCEPTED_TRANSITIONS = [T.TRANSITION_ACCEPT, T.TRANSITION_ACCEPT_WITH_PAYMENT, T.TRANSITION_OPERATOR_ACCEPT_WITH_PAYMENT, 'transition/operator-accept'];
const REMIND_MIN_MS = 20 * 3600e3;
const REMIND_MAX_MS = 28 * 3600e3;
const reminderWindowOk = () => { const h = new Date().getUTCHours(); return h >= 16 && h < 24; };

const sweepReminders = async () => {
  if (!smsEnabled() || !reminderWindowOk()) return;
  try {
    const res = await integrationSdk.transactions.query(
      { lastTransitions: ACCEPTED_TRANSITIONS, include: ['booking', 'listing', 'customer', 'provider'], perPage: 100 },
      { allowRawResponse: true }
    );
    const raw = res._raw.data;
    const inc = raw.included || [];
    const find = ref => (ref ? inc.find(i => i.type === ref.type && i.id.uuid === ref.id.uuid) : null);
    for (const tx of raw.data) {
      try {
        const rel = tx.relationships || {};
        const booking = find(rel.booking?.data);
        const customer = find(rel.customer?.data);
        const listing = find(rel.listing?.data);
        const txId = tx.id.uuid;
        const bs = booking?.attributes?.start ? new Date(booking.attributes.start).getTime() : null;
        if (!bs) continue;
        const msTo = bs - Date.now();
        if (msTo < REMIND_MIN_MS || msTo > REMIND_MAX_MS) continue;
        if (!customer || isTestAccount(customer)) continue;
        const phone = getPhoneNumber({ user: customer });
        if (!phone || (await store.isOptedOut(phone)) || !isAllowlisted(phone)) continue;
        if (await store.hasReminded(txId)) continue;
        const ctx = { listing: listing?.attributes?.title || 'your pool', booking: booking?.attributes || null, txId, tz: listing?.attributes?.availabilityPlan?.timezone || null };
        let body = buildMessage('GUEST_REMINDER', ctx);
        if (await store.claimFirstMessage(phone)) body += FIRST_MSG_FOOTER;
        const msg = await twsend({ body, phoneNumber: phone });
        await store.logOutcome({
          event_type: 'reminder_24h', transition: 'reminder_24h', transaction_id: txId,
          recipient_role: 'customer', recipient_user_id: customer.id.uuid, phone,
          status: 'sent', twilio_sid: msg?.sid || null, body_preview: body.slice(0, 120),
        });
        log('booking reminder sent', txId.slice(0, 8));
        // c148: same-day heads-up for the HOST too (they're the ones prepping a pool).
        try {
          const provider = find(rel.provider?.data);
          if (provider && !isTestAccount(provider)) {
            const hphone = getPhoneNumber({ user: provider });
            if (hphone && !(await store.isOptedOut(hphone)) && isAllowlisted(hphone) && !(await store.hasRemindedHost(txId))) {
              const hctx = {
                listing: listing?.attributes?.title || 'your pool',
                booking: booking?.attributes || null,
                txId,
                tz: listing?.attributes?.availabilityPlan?.timezone || null,
                guestName: customer?.attributes?.profile?.displayName || null,
              };
              let hbody = buildMessage('HOST_REMINDER', hctx);
              if (await store.claimFirstMessage(hphone)) hbody += FIRST_MSG_FOOTER;
              const hmsg = await twsend({ body: hbody, phoneNumber: hphone });
              await store.logOutcome({
                event_type: 'reminder_24h_host', transition: 'reminder_24h_host', transaction_id: txId,
                recipient_role: 'provider', recipient_user_id: provider.id.uuid, phone: hphone,
                status: 'sent', twilio_sid: hmsg?.sid || null, body_preview: hbody.slice(0, 120),
              });
              log('host reminder sent', txId.slice(0, 8));
            }
          }
        } catch (he) {
          log('host reminder error', txId.slice(0, 8), he.message);
        }
      } catch (e) {
        if (e && (e.code === 21610 || /opted out/i.test(e.message || ''))) {
          const p = getPhoneNumber({ user: find(tx.relationships?.customer?.data) });
          if (p) await store.setOptOut(p, true);
        } else {
          log('reminder error', tx.id.uuid.slice(0, 8), e.message);
        }
      }
    }
  } catch (e) {
    log('reminder sweep error', e.message);
  }
};

// ---- onboarding nudge sweep ----------------------------------------------
// One-shot "finish your listing" text ~4h after phone verification (enqueued
// by otp/verify.js). Quiet-hours: sends only 18:00–24:00 UTC (11AM–5PM PT =
// 2–8PM ET — daytime across all US zones; per-host timezones once they have a
// listing with coordinates). Due rows outside the window stay queued.
const NUDGE_ENABLED = () => process.env.ONBOARD_NUDGE_ENABLED === 'true';
const NUDGE_BODY =
  'Pool Rental Near Me: your phone is verified ✓ Next step: finish your pool listing so guests can find you — takes about 5 minutes. Pick up where you left off: https://www.poolrentalnearme.com/l/new';

const inSendWindow = () => {
  const h = new Date().getUTCHours();
  return h >= 18 && h < 24;
};

const hasPublishedListing = async userId => {
  const res = await integrationSdk.listings.query(
    { authorId: userId, states: ['published'], perPage: 1 },
    { allowRawResponse: true }
  );
  return (res._raw.data.meta?.totalItems || 0) > 0;
};

const sweepNudges = async () => {
  if (!NUDGE_ENABLED()) return;
  try {
    const due = await store.claimDueNudges(10);
    for (const n of due) {
      try {
        if (!inSendWindow()) {
          await store.deferNudge(n.id); // re-queued for the next window
          continue;
        }
        const ures = await integrationSdk.users.show({ id: n.user_id }, { allowRawResponse: true });
        const user = ures._raw.data.data;
        if (isTestAccount(user)) {
          await store.finishNudge(n.id, 'skipped_test');
          continue;
        }
        if (await store.isOptedOut(n.phone)) {
          await store.finishNudge(n.id, 'skipped_opted_out');
          continue;
        }
        if (await hasPublishedListing(n.user_id)) {
          await store.finishNudge(n.id, 'skipped_listed'); // they finished on their own
          continue;
        }
        let body = NUDGE_BODY;
        if (await store.claimFirstMessage(n.phone)) body += FIRST_MSG_FOOTER;
        const msg = await twsend({ body, phoneNumber: n.phone });
        await store.finishNudge(n.id, 'sent');
        await store.logOutcome({ event_type: 'nudge_4h', status: 'sent', recipient_role: 'provider', recipient_user_id: n.user_id, phone: n.phone, twilio_sid: msg?.sid || null, body_preview: body.slice(0, 120) });
        log('nudge sent', n.phone);
      } catch (e) {
        if (e && (e.code === 21610 || /opted out/i.test(e.message || ''))) {
          await store.setOptOut(n.phone, true, n.user_id);
          await store.finishNudge(n.id, 'skipped_opted_out');
        } else {
          await store.finishNudge(n.id, 'failed');
          await store.logOutcome({ event_type: 'nudge_4h', status: 'failed', recipient_role: 'provider', recipient_user_id: n.user_id, phone: n.phone, error: String(e.message || e).slice(0, 300) });
          log('nudge FAILED', n.phone, e.message);
        }
      }
    }
  } catch (e) {
    log('nudge sweep error', e.message);
  }
};

// ---- heartbeat alarm ----------------------------------------------------
let alarmActive = false;
const checkHeartbeat = async () => {
  try {
    const hb = await store.getHeartbeat();
    const lastOk = hb.last_ok_at ? new Date(hb.last_ok_at).getTime() : 0;
    const stale = Date.now() - lastOk > HEARTBEAT_STALE_MS;
    const spiking = (hb.consecutive_failures || 0) >= 5;
    if ((stale || spiking) && !alarmActive && ALARM_PHONE) {
      alarmActive = true;
      const why = stale ? `no successful poll in >15 min` : `${hb.consecutive_failures} consecutive failures`;
      await send({ phoneNumber: ALARM_PHONE, body: `⚠️ PRNM SMS notifier problem: ${why}. Check the poller.` }).catch(() => {});
      log('ALARM sent:', why);
    } else if (!stale && !spiking) {
      alarmActive = false; // reset once healthy
    }
  } catch (e) {
    log('heartbeat check error', e.message);
  }
};

const startPoller = () => {
  if (!store.configured()) {
    log('DISABLED — SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set. Poller not started.');
    return;
  }
  const al = allowlist();
  log(`starting. interval=${POLL_MS}ms, sms_enabled=${smsEnabled()}, payout_sms=${PAYOUT_SMS}, alarm=${ALARM_PHONE ? 'set' : 'unset'}, allowlist=${al.length ? `${al.length} number(s) (soft-launch)` : 'wide (all recipients)'}`);
  const tick = async () => {
    failuresThisCycle = 0;
    try {
      await pollOnce();
    } catch (e) {
      log('poll cycle error', e.message);
      await store.heartbeatFail(e.message);
    }
    if (failuresThisCycle) await store.heartbeatFail(`${failuresThisCycle} event failures`);
    setTimeout(tick, POLL_MS);
  };
  tick();
  setInterval(checkHeartbeat, 5 * 60 * 1000);
  setInterval(sweepNudges, 5 * 60 * 1000);
  setInterval(sweepExpiring, 15 * 60 * 1000);
  setInterval(sweepReminders, 30 * 60 * 1000); // c109 day-before guest reminders
  welcome.start(); // Founder Welcome Text sweep (host-signup SMS); no-op when disabled
  swimplyResync.start(); // external-calendar auto re-sync; no-op when disabled
  log(`onboard nudge: ${NUDGE_ENABLED() ? 'ENABLED (11AM–5PM PT window)' : 'disabled'}; expire warnings: every 15min`);
};

module.exports = { startPoller };
