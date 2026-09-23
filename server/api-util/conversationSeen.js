// Per-user, per-conversation read state.
//
// Sharetribe has no read/unread concept. The host dashboard used to count every
// transaction whose lastTransition was `transition/inquire` as "guests sent you
// messages" — a state that reading, replying, or waiting never changes, so 62
// hosts carried 111 permanent "new messages" (oldest Nov 2024).
//
// Model: the user's own Sharetribe privateData holds one top-level key per
// conversation, `convSeen_<txId>` = createdAt of the newest message they have
// seen. privateData is server-persisted per user (survives reload and device
// changes) and updateProfile merges TOP-LEVEL keys, so two devices marking two
// different conversations cannot overwrite each other.
//
// A conversation is unread when the newest message from the OTHER party is
// newer than all of: what this user has seen, this user's own newest message
// (replying means you read it; your own message never makes anything unread),
// and READ_STATE_BASELINE.

const SEEN_PREFIX = 'convSeen_';

// Messages before this instant count as seen. The state is new, so without a
// baseline every historical inbound message would light up as unread at once.
// Set to 48h before this shipped, so anything recent still surfaces.
const READ_STATE_BASELINE = '2026-09-20T20:00:00.000Z';

const seenKey = txId => `${SEEN_PREFIX}${txId}`;
const ms = v => (v == null ? NaN : new Date(v).getTime());

const seenAt = (privateData, txId) => {
  const v = privateData && privateData[seenKey(txId)];
  return typeof v === 'string' && !Number.isNaN(ms(v)) ? v : null;
};

// messages: [{ senderId, createdAt }]
const isUnread = ({ meId, messages, seenIso, baselineIso = READ_STATE_BASELINE }) => {
  let latestInbound = -Infinity;
  let latestOwn = -Infinity;
  for (const m of messages || []) {
    const t = ms(m.createdAt);
    if (Number.isNaN(t)) continue;
    if (m.senderId === meId) latestOwn = Math.max(latestOwn, t);
    else latestInbound = Math.max(latestInbound, t);
  }
  if (latestInbound === -Infinity) return false;
  const floor = Math.max(
    Number.isNaN(ms(seenIso)) ? -Infinity : ms(seenIso),
    latestOwn,
    Number.isNaN(ms(baselineIso)) ? -Infinity : ms(baselineIso)
  );
  return latestInbound > floor;
};

// The privateData patch that records "seen through `throughIso`", clamped to
// the newest message that actually exists. Monotonic: never moves backwards.
// Returns null when nothing would change.
const seenPatch = ({ privateData, txId, latestMessageIso, throughIso }) => {
  const latest = ms(latestMessageIso);
  if (Number.isNaN(latest)) return null;
  const through = ms(throughIso);
  const target = Number.isNaN(through) ? latest : Math.min(through, latest);
  const current = ms(seenAt(privateData, txId));
  if (!Number.isNaN(current) && current >= target) return null;
  return { [seenKey(txId)]: new Date(target).toISOString() };
};

// Request handlers, built from injected dependencies so they can be tested
// against a fake SDK. server/api/conversations.js wires the real ones.
const makeHandlers = ({ getSdk, handleError, toUUID }) => {
  const uuidOf = id => (id && id.uuid) || id || null;
  const iso = d => (d instanceof Date ? d.toISOString() : d ? String(d) : null);

  // Newest transactions are enough for the dashboard: at the time of writing the
  // whole marketplace has ~220 transactions and no user is near 100.
  const TX_PAGE = 100;

  const unread = async (req, res) => {
    const sdk = getSdk(req, res);
    try {
      const meRes = await sdk.currentUser.show();
      const me = meRes.data.data;
      const meId = uuidOf(me.id);
      const privateData = (me.attributes.profile || {}).privateData || {};

      const rel = (entity, name) => (entity.relationships || {})[name] || {};
      const toMsg = m => ({
        createdAt: iso(m.attributes.createdAt),
        senderId: uuidOf((rel(m, 'sender').data || {}).id),
      });

      // One query with messages included. If the API ever rejects that include
      // (400), fall back to one messages query per conversation — slower, same
      // answer — rather than silently showing nobody any messages.
      let body;
      let messagesOf;
      try {
        body = (
          await sdk.transactions.query({
            perPage: TX_PAGE,
            include: ['messages', 'messages.sender', 'customer', 'provider', 'listing'],
          })
        ).data;
        const msgById = new Map(
          (body.included || []).filter(e => e.type === 'message').map(m => [uuidOf(m.id), m])
        );
        messagesOf = async tx =>
          (rel(tx, 'messages').data || [])
            .map(d => msgById.get(uuidOf(d.id)))
            .filter(Boolean)
            .map(toMsg);
      } catch (e) {
        if (e.status !== 400) throw e;
        body = (
          await sdk.transactions.query({ perPage: TX_PAGE, include: ['customer', 'provider', 'listing'] })
        ).data;
        messagesOf = async tx =>
          ((await sdk.messages.query({ transactionId: tx.id, perPage: 100, include: ['sender'] })).data
            .data || []).map(toMsg);
      }

      const byKey = new Map((body.included || []).map(e => [`${e.type}/${uuidOf(e.id)}`, e]));
      const one = (entity, name) => {
        const d = rel(entity, name).data;
        return d ? byKey.get(`${d.type}/${uuidOf(d.id)}`) : null;
      };

      const out = [];
      for (const tx of body.data || []) {
        const txId = uuidOf(tx.id);
        const messages = await messagesOf(tx);
        if (!isUnread({ meId, messages, seenIso: seenAt(privateData, txId) })) continue;

        const provider = one(tx, 'provider');
        const role = provider && uuidOf(provider.id) === meId ? 'provider' : 'customer';
        const other = one(tx, role === 'provider' ? 'customer' : 'provider');
        const listing = one(tx, 'listing');
        out.push({
          transactionId: txId,
          role,
          otherName: (other && ((other.attributes || {}).profile || {}).displayName) || null,
          listingTitle: (listing && (listing.attributes || {}).title) || null,
          latestInboundAt: messages
            .filter(m => m.senderId !== meId)
            .map(m => m.createdAt)
            .sort()
            .pop(),
        });
      }
      res.set('Cache-Control', 'no-store');
      return res.status(200).json({ unread: out });
    } catch (e) {
      return handleError(res, e);
    }
  };

  const seen = async (req, res) => {
    const { transactionId, through } = req.body || {};
    if (!transactionId || typeof transactionId !== 'string') {
      return res.status(400).json({ error: 'transactionId is required' });
    }
    const sdk = getSdk(req, res);
    try {
      const [meRes, msgRes] = await Promise.all([
        sdk.currentUser.show(),
        // Participants only — anyone else gets a 403/404 from Sharetribe.
        sdk.messages.query({ transactionId: toUUID(transactionId), perPage: 100 }),
      ]);
      const privateData = (meRes.data.data.attributes.profile || {}).privateData || {};
      const latestMessageIso = (msgRes.data.data || [])
        .map(m => iso(m.attributes.createdAt))
        .sort()
        .pop();
      const patch = seenPatch({ privateData, txId: transactionId, latestMessageIso, throughIso: through });
      if (patch) {
        await sdk.currentUser.updateProfile({ privateData: patch });
      }
      const seenIso = patch ? Object.values(patch)[0] : seenAt(privateData, transactionId);
      res.set('Cache-Control', 'no-store');
      return res.status(200).json({ seenAt: seenIso || null });
    } catch (e) {
      return handleError(res, e);
    }
  };

  return { unread, seen };
};

module.exports = {
  isUnread,
  seenPatch,
  seenAt,
  seenKey,
  makeHandlers,
  READ_STATE_BASELINE,
  SEEN_PREFIX,
};
