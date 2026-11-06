'use strict';
/**
 * Executor: turns Chatwoot Agent Bot webhooks into engine turns and carries
 * out the resulting actions through the Chatwoot API.
 *
 * The assistant speaks only when ALL hold:
 *   event = message_created, message_type = incoming, private = false,
 *   conversation.status = pending, the inbox is ours, and no person has taken over.
 * Button taps arrive as message_updated on our own input_select message.
 * A human agent's public reply marks the conversation human-owned (and opens it).
 */
const { runHandoff } = require('./handoff');
const { findBookingRef } = require('./safety');

const MESSAGE_TYPES = { 0: 'incoming', 1: 'outgoing', 2: 'activity', 3: 'template' };
function messageType(v) {
  if (typeof v === 'number') return MESSAGE_TYPES[v] || String(v);
  return String(v || '');
}

class Lru {
  constructor(max = 5000) {
    this.max = max;
    this.set = new Set();
  }
  seen(key) {
    if (this.set.has(key)) return true;
    this.set.add(key);
    if (this.set.size > this.max) this.set.delete(this.set.values().next().value);
    return false;
  }
}

class Bot {
  /**
   * @param {object} o
   * @param {import('./flows').Engine} o.engine
   * @param {import('./chatwoot').ChatwootClient} o.client
   * @param {import('./memory').MemoryStore} o.store
   * @param {import('./tracking').Tracker} o.tracker
   * @param {string|number} o.accountId
   * @param {string|number} [o.inboxId]   only this inbox is handled (recommended)
   * @param {Array<{id:number|string,name:string}>} o.agents   Derek and Brandon (Chatwoot user ids)
   * @param {string} o.publicUrl          https://chat.poolrentalnearme.com (conversation links in the note)
   */
  constructor({
    engine,
    client,
    store,
    tracker,
    accountId,
    inboxId = null,
    agents = [],
    publicUrl = '',
    logger = null,
    now = () => Date.now(),
  }) {
    this.engine = engine;
    this.client = client;
    this.store = store;
    this.tracker = tracker;
    this.accountId = String(accountId);
    this.inboxId = inboxId == null || inboxId === '' ? null : String(inboxId);
    this.agents = agents;
    this.publicUrl = String(publicUrl || '').replace(/\/+$/, '');
    this.logger = logger || { info() {}, warn() {}, error() {} };
    this.now = now;
    this.queues = new Map();
    this.seenMessages = new Lru();
    this.seenSelections = new Lru();
  }

  key(convId) {
    return `${this.accountId}:${convId}`;
  }

  conversationUrl(convId) {
    return this.publicUrl
      ? `${this.publicUrl}/app/accounts/${this.accountId}/conversations/${convId}`
      : '';
  }

  /** Serialise work per conversation so two quick messages never race. */
  enqueue(convId, fn) {
    const prev = this.queues.get(convId) || Promise.resolve();
    const next = prev.then(fn, fn);
    const tail = next.catch((err) => {
      this.logger.error(`conversation ${convId}: ${err && err.message ? err.message : err}`);
    });
    this.queues.set(convId, tail);
    tail.then(() => {
      if (this.queues.get(convId) === tail) this.queues.delete(convId);
    });
    return next;
  }

  /** Resolves once every queued conversation turn has finished (tests, shutdown). */
  async idle() {
    while (this.queues.size) await Promise.all([...this.queues.values()]);
  }

  loadState(convId, conv) {
    const st = this.store.get(this.key(convId));
    if (st) return st;
    const attrs = (conv && conv.custom_attributes) || {};
    const fresh = this.engine.hydrate(convId, attrs, this.now());
    fresh.mirrored = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('prnm_'))
    );
    return fresh;
  }

  // ------------------------------------------------------------------ events
  async handleEvent(p) {
    if (!p || typeof p !== 'object') return { ignored: 'payload' };
    const accountId = p.account && p.account.id != null ? String(p.account.id) : null;
    if (accountId !== this.accountId) return { ignored: 'account' };
    const inboxId =
      (p.inbox && p.inbox.id != null && p.inbox.id) ||
      (p.conversation && p.conversation.inbox_id) ||
      (p.inbox_id != null ? p.inbox_id : null);
    if (this.inboxId && String(inboxId) !== this.inboxId) return { ignored: 'inbox' };
    switch (p.event) {
      case 'message_created':
        return this.onMessageCreated(p);
      case 'message_updated':
        return this.onMessageUpdated(p);
      case 'conversation_status_changed':
        return this.onStatusChanged(p);
      case 'conversation_resolved':
        return this.onResolved(p);
      default:
        return { ignored: p.event || 'event' };
    }
  }

  async onMessageCreated(p) {
    const conv = p.conversation || {};
    const convId = conv.id;
    if (convId == null) return { ignored: 'conversation' };
    if (p.private) return { ignored: 'private' };
    const mt = messageType(p.message_type);
    if (mt === 'outgoing') {
      const senderType = p.sender && p.sender.type;
      if (senderType === 'user') return this.enqueue(convId, () => this.onHumanReply(convId, conv));
      return { ignored: 'outgoing' };
    }
    if (mt !== 'incoming') return { ignored: mt };
    if (p.id != null && this.seenMessages.seen(`m:${p.id}`)) return { ignored: 'duplicate' };
    return this.enqueue(convId, async () => {
      let st = this.loadState(convId, conv);
      if (conv.status !== 'pending') {
        // A person owns it (or it is resolved/snoozed). Stay silent; only note a booking ref they add.
        const ref = findBookingRef(p.content || '');
        if (ref && !st.bookingRef && st.handoff && st.handoff.status === 'sent') {
          st.bookingRef = ref;
          await this.mirror(convId, conv, st);
        }
        this.store.set(this.key(convId), st);
        return { silent: conv.status || 'unknown' };
      }
      const input = {
        kind: 'text',
        text: typeof p.content === 'string' ? p.content : '',
        messageId: p.id,
        attachments: Array.isArray(p.attachments) && p.attachments.length > 0,
      };
      return this.runTurn(convId, conv, st, input);
    });
  }

  async onMessageUpdated(p) {
    const conv = p.conversation || {};
    const convId = conv.id;
    if (convId == null) return { ignored: 'conversation' };
    const attrs = p.content_attributes || {};
    const submitted = Array.isArray(attrs.submitted_values) ? attrs.submitted_values : [];
    if (p.content_type !== 'input_select' || !submitted.length) return { ignored: 'update' };
    if (messageType(p.message_type) !== 'outgoing' || (p.sender && p.sender.type === 'user'))
      return { ignored: 'update' };
    if (this.seenSelections.seen(`s:${p.id}`)) return { ignored: 'duplicate' };
    const choice = submitted[0] || {};
    return this.enqueue(convId, async () => {
      const st = this.loadState(convId, conv);
      if (conv.status !== 'pending') return { silent: conv.status || 'unknown' };
      return this.runTurn(convId, conv, st, {
        kind: 'button',
        value: String(choice.value || ''),
        title: String(choice.title || ''),
        messageId: p.id,
      });
    });
  }

  async onHumanReply(convId, conv) {
    const st = this.engine.humanTookOver(this.loadState(convId, conv), { now: this.now() });
    const events = [{ type: 'human_takeover' }];
    if (conv.status === 'pending') {
      const r = await this.client.toggleStatus(convId, 'open');
      if (!r.ok)
        events.push({
          type: 'api_error',
          step: 'toggle_status_after_human_reply',
          status: r.status,
        });
    }
    this.store.set(this.key(convId), st);
    this.tracker.log(this.key(convId), events);
    return { humanOwned: true };
  }

  async onStatusChanged(p) {
    const convId = p.id;
    if (convId == null) return { ignored: 'conversation' };
    if (p.status !== 'pending') return { ignored: 'status' };
    return this.enqueue(convId, async () => {
      const st = this.store.get(this.key(convId));
      if (!st || !(st.humanOwned || st.handoff)) return { ignored: 'status' };
      this.store.set(this.key(convId), this.engine.returnedToBot(st, { now: this.now() }));
      this.tracker.log(this.key(convId), [{ type: 'returned_to_bot' }]);
      return { returnedToBot: true };
    });
  }

  async onResolved(p) {
    const convId = p.id;
    if (convId == null) return { ignored: 'conversation' };
    return this.enqueue(convId, async () => {
      const st = this.store.get(this.key(convId));
      if (!st) return { ignored: 'resolved' };
      // keep who they are, forget the finished thread
      const fresh = this.engine.returnedToBot(st, { now: this.now() });
      fresh.bookingRef = null;
      fresh.bookingRefDeclined = false;
      fresh.tried = [];
      fresh.replyMethod = null;
      this.store.set(this.key(convId), fresh);
      this.tracker.log(this.key(convId), [{ type: 'resolved' }]);
      return { resolved: true };
    });
  }

  // ------------------------------------------------------------------ turns
  async runTurn(convId, conv, st, input) {
    const res = this.engine.handle(st, input, { now: this.now() });
    let state = res.state;
    const events = [...res.events];
    let escalated = false;
    const sent = [];
    for (const a of res.actions) {
      if (a.type !== 'escalate') {
        sent.push(await this.perform(convId, a, events));
        continue;
      }
      escalated = true;
      const attributes = {
        ...this.baseAttributes(conv, state),
        ...this.engine.mirrorAttributes(state),
      };
      const result = await runHandoff({
        client: this.client,
        convId,
        attributes,
        labels: this.engine.labelsFor(state),
        note: this.engine.buildNote(state, {
          agents: this.agents,
          conversationUrl: this.conversationUrl(convId),
        }),
        urgent: state.handoff && state.handoff.urgency === 'high',
        done: (state.handoff && state.handoff.done) || {},
      });
      if (result.done && result.done.attributes)
        state.mirrored = this.engine.mirrorAttributes(state);
      const after = this.engine.afterEscalation(state, result, { now: this.now() });
      state = after.state;
      events.push(...after.events);
      for (const b of after.actions) sent.push(await this.perform(convId, b, events));
    }
    if (!escalated) await this.mirror(convId, conv, state, events);
    this.store.set(this.key(convId), state);
    this.tracker.log(this.key(convId), events);
    return { actions: res.actions.map((a) => a.type), sent, escalated };
  }

  baseAttributes(conv, state) {
    const base = { ...((conv && conv.custom_attributes) || {}) };
    for (const k of Object.keys(base)) if (k.startsWith('prnm_')) delete base[k];
    return base;
  }

  async perform(convId, a, events) {
    let r;
    if (a.type === 'say') r = await this.client.sendText(convId, a.content);
    else if (a.type === 'select') r = await this.client.sendSelect(convId, a.content, a.items);
    else if (a.type === 'note') r = await this.client.sendNote(convId, a.content);
    else return { type: a.type, ok: true };
    if (!r.ok) {
      events.push({ type: 'send_failed', kind: a.type, status: r.status });
      this.logger.warn(`send ${a.type} to conversation ${convId} failed (status ${r.status})`);
    }
    return { type: a.type, ok: r.ok };
  }

  /** Mirror prnm_* facts into Chatwoot custom attributes when they changed. */
  async mirror(convId, conv, state, events = []) {
    const attrs = this.engine.mirrorAttributes(state);
    if (JSON.stringify(attrs) === JSON.stringify(state.mirrored || {})) return;
    const r = await this.client.setCustomAttributes(convId, {
      ...this.baseAttributes(conv, state),
      ...attrs,
    });
    if (r.ok) state.mirrored = attrs;
    else events.push({ type: 'api_error', step: 'custom_attributes', status: r.status });
  }
}

module.exports = { Bot, messageType };
