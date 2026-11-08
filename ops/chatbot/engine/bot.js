'use strict';
/**
 * Executor: turns Chatwoot Agent Bot webhooks into engine turns and carries
 * out the resulting actions through the Chatwoot API.
 *
 * The assistant speaks only when ALL hold:
 *   event = message_created, message_type = incoming, private = false,
 *   conversation.status = pending, the inbox is ours, and no person has taken over.
 * One exception: after a handoff (sent or flood-capped) and before any person
 * replies, danger in a new message gets the 911 line once and an urgent label,
 * priority and plain note (flag_urgent), never a new @mention or reopen.
 * Button taps arrive as message_updated on our own input_select message.
 * A human agent's public reply marks the conversation human-owned (and opens it).
 *
 * Handoffs that would reach the founders' phones are capped (flood.js, D3):
 * beyond a cap the conversation is labelled and kept pending, with no @mention
 * and no open toggle, and the customer is told only what is true. A handoff
 * logged over the hourly ceiling (or the per-visitor cap) is deferred, not
 * dropped: it is retried on the visitor's next message and by a sweep on every
 * webhook (and a 60 s timer in server.js), and sent as a normal alert only when
 * a slot is free. While any cap holds nothing is sent.
 */
const { runHandoff, runCappedHandoff } = require('./handoff');
const { findBookingRef, MAX_INPUT_CHARS, MAX_STORED_CHARS } = require('./safety');
const { FloodLedger } = require('./flood');
const { sampler } = require('./logsample');

/** The contact behind a conversation (Chatwoot contact id), from the webhook payload. */
function contactIdOf(p) {
  const conv = (p && p.conversation) || {};
  const sender = conv.meta && conv.meta.sender;
  if (sender && sender.id != null && (!sender.type || sender.type === 'contact')) return String(sender.id);
  if (conv.contact_inbox && conv.contact_inbox.contact_id != null)
    return String(conv.contact_inbox.contact_id);
  if (conv.contact_id != null) return String(conv.contact_id);
  const s = p && p.sender;
  if (
    p &&
    p.event === 'message_created' &&
    messageType(p.message_type) === 'incoming' &&
    s &&
    s.id != null &&
    (!s.type || s.type === 'contact')
  )
    return String(s.id);
  return null;
}

const DEFERRED_KEY = 'deferred';
const MAX_DEFERRED = 200;

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
    floodLimits = {},
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
    this.flood = new FloodLedger({ store, limits: floodLimits });
    this.logCapped = sampler(60 * 1000, now);
  }

  contactKey(state) {
    return state && state.contactId ? `${this.accountId}:contact:${state.contactId}` : null;
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
    // what we would have written ourselves (validated), never the raw visitor-settable attributes
    fresh.mirrored = this.engine.mirrorAttributes(fresh);
    return fresh;
  }

  // ------------------------------------------------------------------ events
  async handleEvent(p) {
    if (!p || typeof p !== 'object') return { ignored: 'payload' };
    // any webhook is a chance to send a handoff that was logged over a ceiling (no-op when none waits)
    this.sweepDeferred();
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
      if (!st.contactId) st.contactId = contactIdOf(p);
      if (conv.status !== 'pending') {
        const waiting =
          !st.humanOwned && st.handoff && (st.handoff.status === 'sent' || st.handoff.status === 'capped');
        if (waiting) {
          // Handed off, nobody has replied yet: the engine stays quiet except for the 911 line on danger
          // (once), an urgent label/priority and a plain note. No new @mention, no reopen (D3).
          return this.runTurn(convId, conv, st, {
            kind: 'text',
            text: typeof p.content === 'string' ? p.content.slice(0, MAX_INPUT_CHARS + 64) : '',
            messageId: p.id,
          });
        }
        // A person owns it (or it is resolved/snoozed). Stay silent; only note a booking ref they add.
        const ref = findBookingRef(String(p.content || '').slice(0, MAX_INPUT_CHARS));
        if (ref && !st.bookingRef && st.handoff && st.handoff.status === 'sent') {
          st.bookingRef = ref;
          await this.mirror(convId, conv, st);
        }
        this.store.set(this.key(convId), st);
        return { silent: conv.status || 'unknown' };
      }
      const input = {
        kind: 'text',
        // the engine reads only the first MAX_INPUT_CHARS (D4); never hand it the whole 150k
        text: typeof p.content === 'string' ? p.content.slice(0, MAX_INPUT_CHARS + 64) : '',
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
      if (!st.contactId) st.contactId = contactIdOf(p);
      if (conv.status !== 'pending') return { silent: conv.status || 'unknown' };
      // visitor-controlled: the engine only accepts a value it offered, with its own title
      return this.runTurn(convId, conv, st, {
        kind: 'button',
        value: String(choice.value || '').slice(0, 200),
        title: String(choice.title || '').slice(0, MAX_STORED_CHARS),
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

  // ------------------------------------------------------------------ deferred handoffs (D3)
  /*
   * A handoff logged over the hourly ceiling (or the per-visitor cap) is not final: once a slot is
   * free it is sent as a normal alert (@mention note, open toggle), without waiting for the visitor
   * to write again. Nothing is sent while a cap still holds.
   */
  deferredList() {
    const list = this.store.getMeta ? this.store.getMeta(DEFERRED_KEY) : null;
    return Array.isArray(list) ? list : [];
  }

  trackDeferred(convId, state) {
    if (!this.store.setMeta) return;
    const key = this.key(convId);
    const list = this.deferredList().filter((x) => x && x.key !== key);
    if (this.engine.deferred(state))
      list.push({ key, convId: String(convId), contact: this.contactKey(state), at: this.now() });
    const before = JSON.stringify(this.deferredList());
    const next = list.slice(-MAX_DEFERRED);
    if (JSON.stringify(next) !== before) this.store.setMeta(DEFERRED_KEY, next);
  }

  /** Cheap and synchronous: queue a retry for each deferred handoff that would pass the caps now. */
  sweepDeferred() {
    const list = this.deferredList();
    if (!list.length) return 0;
    const now = this.now();
    let queued = 0;
    for (const x of list) {
      if (queued >= 5) break;
      // the ledger first (no state read): while the ceiling holds this loop costs almost nothing
      if (this.flood.check({ conv: x.key, contact: x.contact || null, now })) continue;
      const st = this.store.get(x.key);
      if (!st || !this.engine.deferred(st)) {
        this.trackDeferred(x.convId, st || {});
        continue;
      }
      queued++;
      this.enqueue(x.convId, () => this.runDeferred(x.convId));
    }
    return queued;
  }

  async runDeferred(convId) {
    const st = this.store.get(this.key(convId));
    if (!st || !this.engine.deferred(st)) return { ignored: 'deferred' };
    // the merged custom attributes and the live status come from Chatwoot itself
    const c = await this.client.getConversation(convId);
    if (!c.ok || !c.data) return { ignored: 'deferred_fetch' };
    const conv = c.data;
    if (conv.status === 'resolved' || conv.status === 'snoozed') return { ignored: 'deferred_status' };
    const res = this.engine.retryDeferred(st, { now: this.now() });
    return this.execute(convId, conv, res);
  }

  // ------------------------------------------------------------------ turns
  async runTurn(convId, conv, st, input) {
    const res = this.engine.handle(st, input, { now: this.now() });
    return this.execute(convId, conv, res);
  }

  async execute(convId, conv, res) {
    let state = res.state;
    const events = [...res.events];
    let escalated = false;
    const sent = [];
    for (const a of res.actions) {
      if (a.type !== 'escalate') {
        sent.push(await this.perform(convId, a, events));
        continue;
      }
      const done = (state.handoff && state.handoff.done) || {};
      const urgent = !!(state.handoff && state.handoff.urgency === 'high');
      // a retry of a handoff whose @mention note already went out is the same alert, not a new one
      const fresh = !done.note;
      const keys = { conv: this.key(convId), contact: this.contactKey(state), now: this.now() };
      // check and take the slot in one synchronous step (D3): concurrent conversations can't all slip under a cap
      const slot = fresh ? this.flood.reserve(keys) : null;
      const capped = slot && slot.capped ? slot.capped : null;
      // a handoff logged over a ceiling, tried again: still capped → nothing at all (it is already labelled
      // and noted); a slot is free now → the normal alert, and the overflow label goes
      if (a.deferred && capped) continue;
      escalated = true;
      const attributes = {
        ...this.baseAttributes(conv, state),
        ...this.engine.mirrorAttributes(state),
      };
      let result;
      if (capped) {
        result = await runCappedHandoff({
          client: this.client,
          convId,
          attributes,
          labels: [
            ...this.engine.labelsFor(state),
            capped === 'global' ? 'handoff-overflow' : 'handoff-capped',
          ],
          // the founders' note for this same open thread is already there: add nothing. A new thread
          // (after a resolve or a hand-back) gets its own note, without an @mention.
          note:
            capped === 'conversation' && state.alertThread
              ? null
              : this.engine.buildNote(state, {
                  agents: [],
                  conversationUrl: this.conversationUrl(convId),
                  capped,
                }),
          urgent,
          done,
        });
        result.capped = capped;
        if (!result.ok) result.capped = null;
        events.push({ type: 'handoff_capped', cap: capped, ok: result.ok });
        this.logCapped(
          (m) => this.logger.warn(m),
          `conversation ${convId}: handoff over the ${capped} cap, logged without an alert`
        );
      } else {
        result = await runHandoff({
          client: this.client,
          convId,
          attributes,
          labels: this.engine.labelsFor(state),
          note: this.engine.buildNote(state, {
            agents: this.agents,
            conversationUrl: this.conversationUrl(convId),
          }),
          urgent,
          done,
          drop: a.deferred ? ['handoff-overflow', 'handoff-capped'] : [],
        });
        if (a.deferred) events.push({ type: 'deferred_handoff', ok: result.ok, was: state.handoff.capped });
        // The @mention note reached Chatwoot: that is an alert, whatever happens next (the slot stays taken).
        // It definitely never got there (a step before it failed, or Chatwoot answered the note with an
        // error status): nobody was alerted, so the slot goes back. A timeout or network error on the
        // note itself (status 0) may still have created it: keep the slot. A lost alert is cheaper than an
        // uncapped one.
        const noteUnknown = result.step === 'note' && !result.status;
        if (slot && slot.token && !(result.done && result.done.note) && !noteUnknown) this.flood.release(slot.token);
      }
      if (result.done && result.done.attributes)
        state.mirrored = this.engine.mirrorAttributes(state);
      const after = this.engine.afterEscalation(state, result, { now: this.now() });
      state = after.state;
      events.push(...after.events);
      for (const b of after.actions) sent.push(await this.perform(convId, b, events));
    }
    // a danger flag that didn't go through may be tried again on their next message
    if (sent.some((x) => x.type === 'flag_urgent' && !x.ok)) state.dangerAt = null;
    if (!escalated) await this.mirror(convId, conv, state, events);
    this.store.set(this.key(convId), state);
    this.trackDeferred(convId, state);
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
    else if (a.type === 'flag_urgent') return this.flagUrgent(convId, a, events);
    else return { type: a.type, ok: true };
    if (!r.ok) {
      events.push({ type: 'send_failed', kind: a.type, status: r.status });
      this.logger.warn(`send ${a.type} to conversation ${convId} failed (status ${r.status})`);
    }
    return { type: a.type, ok: r.ok };
  }

  /**
   * Danger reported while the handoff waits for a person: labels + urgent priority + a plain
   * note (no @mention: no new push, D3). okText is said only when every call succeeded.
   */
  async flagUrgent(convId, a, events) {
    const fail = (step, r) => {
      events.push({ type: 'api_error', step, status: r ? r.status : 0 });
      this.logger.warn(`flag urgent on conversation ${convId} failed at ${step} (status ${r ? r.status : 0})`);
      return { type: a.type, ok: false };
    };
    if (a.note && /mention:\/\//i.test(a.note)) return fail('note_mention', null);
    const g = await this.client.getLabels(convId);
    if (!g.ok) return fail('labels_get', g);
    const l = await this.client.setLabels(convId, [...new Set([...(g.labels || []), ...(a.labels || [])])]);
    if (!l.ok) return fail('labels_set', l);
    const pr = await this.client.togglePriority(convId, 'urgent');
    if (!pr.ok) return fail('priority', pr);
    if (a.note) {
      const n = await this.client.sendNote(convId, a.note);
      if (!n.ok) return fail('note', n);
    }
    events.push({ type: 'flagged_urgent' });
    if (a.okText) {
      const t = await this.client.sendText(convId, a.okText);
      if (!t.ok) return fail('send_text', t);
    }
    return { type: a.type, ok: true };
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

module.exports = { Bot, messageType, contactIdOf };
