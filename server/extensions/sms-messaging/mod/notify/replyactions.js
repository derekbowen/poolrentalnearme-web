// Reply-to-accept: a host texts "1" to accept or "2" then "YES" to decline a
// booking request. We act as OPERATOR through the Integration API using ONLY
// the existing operator-accept / operator-decline transitions — no process.edn
// changes, no capture/refund-logic changes. The transition itself performs the
// Stripe capture (accept) or refund (decline) exactly as the host dashboard does.
//
// Gated by REPLY_TO_ACCEPT_ENABLED (default off). The deep link in every text
// remains the primary path; this is a convenience layer on top.

const integrationSdk = require('api-util/integration');
const store = require('./supastore');
const { getPhoneNumber } = require('extensions/sms-messaging/utils/sms');

const enabled = () => process.env.REPLY_TO_ACCEPT_ENABLED === 'true';

const log = (...a) => console.log('[reply-to-accept]', ...a);

// Live lastTransition → the pending state + the operator transitions that
// accept (capture) or decline (refund) from that state. Anything not listed
// here is already handled/expired and must NOT be transitioned.
const PENDING = {
  'transition/confirm-payment': {
    accept: 'transition/operator-accept', // preauthorized → capture
    decline: 'transition/operator-decline', // preauthorized → full refund
  },
  'transition/request': {
    accept: 'transition/operator-accept-with-payment', // requested → create+capture
    decline: 'transition/operator-decline-without-payment', // requested → nothing captured
  },
  'transition/request-after-inquiry': {
    accept: 'transition/operator-accept-with-payment',
    decline: 'transition/operator-decline-without-payment',
  },
};

const toE164 = raw => {
  if (!raw) return '';
  const s = String(raw).trim();
  if (s.startsWith('+')) return s.replace(/[^\d+]/g, '');
  const digits = s.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits ? `+${digits}` : '';
};

const showTx = async txId => {
  const res = await integrationSdk.transactions.show(
    { id: txId, include: ['listing', 'booking', 'provider'] },
    { allowRawResponse: true }
  );
  const raw = res._raw.data;
  const d = raw.data;
  const inc = raw.included || [];
  const find = ref => (ref ? inc.find(i => i.type === ref.type && i.id.uuid === ref.id.uuid) : null);
  const rel = d.relationships || {};
  return {
    txId: d.id.uuid,
    lastTransition: d.attributes.lastTransition,
    provider: find(rel.provider?.data),
    listing: find(rel.listing?.data),
  };
};

const poolName = tx => tx.listing?.attributes?.title || 'your pool';

// Verify the texting phone really is this tx's provider AND the tx is still
// awaiting host action. Never transition otherwise.
const loadActionable = async (txId, senderPhone) => {
  const tx = await showTx(txId);
  const providerPhone = toE164(getPhoneNumber({ user: tx.provider }));
  if (!providerPhone || providerPhone !== toE164(senderPhone)) {
    return { ok: false, reason: 'not_your_tx', tx };
  }
  const pending = PENDING[tx.lastTransition];
  if (!pending) return { ok: false, reason: 'not_pending', tx };
  return { ok: true, pending, tx };
};

const fire = async (txId, transition) => {
  await integrationSdk.transactions.transition({ id: txId, transition, params: {} });
};

// Handle inbound "1" / "2" / "YES" from `phone`. Returns a reply string to text
// back, or null if this isn't a reply-to-accept command (caller falls through).
const handleReply = async (phone, token) => {
  if (!enabled()) {
    // Feature off, but a host tried to accept/decline by text — acknowledge
    // helpfully and log the attempt so we can see demand. "YES" is left alone
    // (it's the opt-in keyword until reply-to-accept is live).
    if (token === '1' || token === '2') {
      await store.logInboundReply({ phone, token, status: 'reply_to_accept_disabled' });
      return 'Tap the link in your booking text to accept or decline — reply-by-text is coming soon.';
    }
    return null;
  }
  // Never carry on an SMS conversation with someone who opted out.
  if (await store.isOptedOut(phone)) return null;

  // "YES" confirms a decline only if one is armed; otherwise it's the START
  // keyword and we let the caller's opt-in logic handle it.
  if (token === 'YES') {
    const pd = await store.getPendingDecline(phone);
    if (!pd) {
      // Not confirming a decline → this YES is a beta opt-in (the invite text
      // asks hosts to "reply YES"). Enrolling also implies they want texts.
      const newly = await store.enrollBeta(phone);
      return newly
        ? 'You’re in the beta ✅ Reply 1 to accept or 2 to decline any booking request — we’ll still text you a link too. Reply STOP to opt out anytime.'
        : 'You’re all set for one-tap accept-by-text. Reply 1 to accept or 2 to decline a booking request.';
    }
    await store.clearPendingDecline(phone);
    const a = await loadActionable(pd.tx_id, phone);
    if (!a.ok) {
      return a.reason === 'not_pending'
        ? 'That request was already handled or expired — no change was made.'
        : 'We couldn’t match that request to your number.';
    }
    try {
      await fire(pd.tx_id, a.pending.decline);
    } catch (e) {
      log('decline transition failed', pd.tx_id, e.message);
      return 'That request was just handled elsewhere — no change was made.';
    }
    await store.resolveRequest(phone, pd.tx_id);
    log('declined', pd.tx_id);
    return `Declined ${poolName(a.tx)}. The guest’s payment has been released. Thanks for the quick reply.`;
  }

  if (token === '1' || token === '2') {
    // Beta gate: only enrolled hosts can act. Others get the invite (this is
    // what keeps the money path opt-in — no capture without a prior YES).
    if (!(await store.isBetaEnrolled(phone))) {
      await store.logInboundReply({ phone, token, status: 'beta_not_enrolled' });
      return 'One-tap accept-by-text is a new beta — reply YES to turn it on for your account, then reply 1 to accept or 2 to decline. Or just tap the link in your booking text.';
    }
    const reqs = await store.pendingRequests(phone);
    const uniqueTx = [...new Set(reqs.map(r => r.tx_id))];
    if (uniqueTx.length === 0) {
      return 'You have no pending booking requests right now. If you were expecting one, open the link in your text.';
    }
    if (uniqueTx.length > 1) {
      return `You have ${uniqueTx.length} pending requests — please tap the link in each text to accept or decline the right one.`;
    }
    const txId = uniqueTx[0];
    const a = await loadActionable(txId, phone);
    if (!a.ok) {
      return a.reason === 'not_pending'
        ? 'That request was already handled or expired — no change was made.'
        : 'We couldn’t match that request to your number.';
    }
    if (token === '1') {
      try {
        await fire(txId, a.pending.accept);
      } catch (e) {
        log('accept transition failed', txId, e.message);
        return 'That request was just handled elsewhere — no change was made.';
      }
      await store.resolveRequest(phone, txId);
      log('accepted', txId);
      return `✅ You accepted ${poolName(a.tx)}. The guest is confirmed and charged — you’re all set!`;
    }
    // token === '2' → arm the decline; require a YES.
    await store.setPendingDecline({ phone, txId, pool: poolName(a.tx) });
    return `Decline ${poolName(a.tx)}? Reply YES to confirm — this releases the guest’s payment. Ignore this text to keep the request.`;
  }

  return null;
};

module.exports = { handleReply, enabled, toE164 };
