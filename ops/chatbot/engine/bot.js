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
 * a slot is free. While any cap holds nothing is sent. Deferred alerts wait in
 * line (urgent first, then the longest wait) and a full state store evicts
 * ordinary chats before any of them (memory.js setRank).
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
// the retry line: over MAX_DEFERRED the oldest non-urgent entry goes; urgent entries are never dropped to make
// room, up to a hard ceiling (MAX_DEFERRED_URGENT, about 50 hours of alerts at 10 an hour)
const MAX_DEFERRED = 200;
const MAX_DEFERRED_URGENT = 500;
const SWEEP_BATCH = 5;
const RETRY_FETCH_MS = 60 * 1000; // getConversation failed: try that one again in a minute
const RETRY_STATUS_MS = 5 * 60 * 1000; // resolved or snoozed in Chatwoot: look again in five minutes

/** Urgent first, then the one logged earliest. */
function orderDeferred(list) {
  return list.sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0) || (a.at || 0) - (b.at || 0));
}

/** Keep the line bounded without ever dropping an urgent alert for room (until the hard ceiling). */
function boundDeferred(list) {
  while (list.length > MAX_DEFERRED) {
    // ordered: the first non-urgent entry is the oldest non-urgent one
    const i = list.findIndex((x) => !x.urgent);
    if (i < 0) break;
    list.splice(i, 1);
  }
  // only urgent entries left over the cap: the newest of them wait outside the list (their own next message re-adds them)
  if (list.length > MAX_DEFERRED_URGENT) list.length = MAX_DEFERRED_URGENT;
  return list;
}

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
    // deferred alerts (D3): conversations holding a reserved slot right now, retries queued by a sweep and
    // not finished yet, and retries that failed to fetch the conversation (tried again later, out of line)
    this.inflight = new Set();
    this.sweepQueued = new Set();
    this.retryAfter = new Map();
    // a full store evicts ordinary chats first: never a founder alert still waiting for a slot
    if (store && typeof store.setRank === 'function') store.setRank((st) => this.retainRank(st));
  }

  /** How much a stored state matters when the store is full (memory.js): 3 urgent deferred alert … 0 ordinary. */
  retainRank(st) {
    const h = st && st.handoff;
    if (!h || st.humanOwned) return 0;
    if (this.engine.deferred(st)) return h.urgency === 'high' ? 3 : 2;
    // handed off and waiting for a person (or a failed alert their next message retries)
    if (h.status === 'sent' || h.status === 'capped' || h.status === 'failed') return 1;
    return 0;
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

  /**
   * Serialise work per conversation so two quick messages never race. One key type for every caller:
   * webhooks carry the conversation id as a number, the deferred list as a string, and a deferred retry
   * must never run beside a message turn for the same conversation (round 3, race2.js).
   */
  enqueue(convId, fn) {
    const q = String(convId);
    const prev = this.queues.get(q) || Promise.resolve();
    const next = prev.then(fn, fn);
    const tail = next.catch((err) => {
      this.logger.error(`conversation ${q}: ${err && err.message ? err.message : err}`);
    });
    this.queues.set(q, tail);
    tail.then(() => {
      if (this.queues.get(q) === tail) this.queues.delete(q);
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
  /*
   * The retry line (round 3, deferred_starve): urgent alerts first, then the one that has waited longest.
   * An entry keeps its place (the time it was first logged, handoff.cappedAt) however often it is retried
   * or the customer writes again, so newer junk never gets ahead of it. A free slot goes to the front of
   * the line: a sweep queues at most as many retries as there are free slots, and any other alert (a fresh
   * handoff, or a retry from further back) that finds the slots spoken for is logged and waits its turn.
   */
  deferredList() {
    const list = this.store.getMeta ? this.store.getMeta(DEFERRED_KEY) : null;
    return Array.isArray(list) ? list : [];
  }

  trackDeferred(convId, state) {
    if (!this.store.setMeta) return;
    const key = this.key(convId);
    const before = this.deferredList();
    const old = before.find((x) => x && x.key === key);
    const list = before.filter((x) => x && x.key && x.key !== key);
    if (state && this.engine.deferred(state)) {
      const h = state.handoff;
      // its original place in line: a retry or a new message never sends it to the back
      const at = Number.isFinite(h.cappedAt) ? h.cappedAt : old && Number.isFinite(old.at) ? old.at : this.now();
      list.push({ key, convId: String(convId), contact: this.contactKey(state), at, urgent: h.urgency === 'high' });
    }
    const next = boundDeferred(orderDeferred(list));
    if (JSON.stringify(next) !== JSON.stringify(before)) this.store.setMeta(DEFERRED_KEY, next);
  }

  /** The line as it stands: still-deferred entries in order (urgency read from the live state), and stale keys. */
  deferredQueue() {
    const queue = [];
    const stale = [];
    for (const x of this.deferredList()) {
      if (!x || !x.key) continue;
      const st = this.store.peek ? this.store.peek(x.key) : this.store.get(x.key);
      if (!st || !this.engine.deferred(st)) {
        stale.push(x.key);
        continue;
      }
      const h = st.handoff;
      queue.push({ ...x, urgent: h.urgency === 'high', at: Number.isFinite(h.cappedAt) ? h.cappedAt : x.at || 0 });
    }
    return { queue: orderDeferred(queue), stale };
  }

  backedOff(key, now) {
    const until = this.retryAfter.get(key);
    if (until == null) return false;
    if (now >= until) {
      this.retryAfter.delete(key);
      return false;
    }
    return true;
  }

  /** Deferred alerts ahead of `key` in line that could take a free slot right now. */
  aheadInLine(key, urgent, now) {
    const { queue } = this.deferredQueue();
    const inLine = queue.some((x) => x.key === key);
    let ahead = 0;
    for (const x of queue) {
      if (x.key === key) break;
      // not in line (a fresh handoff): an urgent one goes ahead of every non-urgent wait
      if (!inLine && urgent && !x.urgent) break;
      if (this.inflight.has(x.key) || this.backedOff(x.key, now)) continue;
      if (this.flood.check({ conv: x.key, contact: x.contact || null, now })) continue;
      ahead++;
    }
    return ahead;
  }

  /**
   * Check and take a flood slot (D3) in one synchronous step, in line: when the free slots are spoken for
   * by deferred alerts ahead of this one, it is treated as over the hourly ceiling and waits its turn.
   */
  reserveInLine({ conv, contact, now }, urgent) {
    const capped = this.flood.check({ conv, contact, now });
    if (capped) return { capped };
    if (this.deferredList().length && this.aheadInLine(conv, urgent, now) >= this.flood.freeGlobal(now))
      return { capped: 'global' };
    const slot = this.flood.reserve({ conv, contact, now });
    if (slot.token) this.inflight.add(conv);
    return slot;
  }

  /** Cheap and synchronous: queue retries for the front of the line, at most one per free slot. */
  sweepDeferred() {
    const list = this.deferredList();
    if (!list.length) return 0;
    const now = this.now();
    // while the hourly ceiling holds nothing can pass, and this costs almost nothing on every webhook
    const free = this.flood.freeGlobal(now);
    if (free <= 0) return 0;
    const { queue, stale } = this.deferredQueue();
    if (stale.length && this.store.setMeta)
      this.store.setMeta(DEFERRED_KEY, list.filter((x) => x && !stale.includes(x.key)));
    let queued = 0;
    for (const x of queue) {
      if (queued >= Math.min(free, SWEEP_BATCH)) break;
      // holding a slot already (counted in `free`), or its last fetch failed: not in the way of the rest
      if (this.inflight.has(x.key) || this.backedOff(x.key, now)) continue;
      // its own per-conversation / per-visitor cap still holds
      if (this.flood.check({ conv: x.key, contact: x.contact || null, now })) continue;
      queued++;
      if (this.sweepQueued.has(x.key)) continue; // queued by an earlier sweep and not run yet
      this.sweepQueued.add(x.key);
      const done = () => this.sweepQueued.delete(x.key);
      // (errors are logged by enqueue; then(done, done) adds no unhandled rejection of its own)
      this.enqueue(x.convId, () => this.runDeferred(x.convId)).then(done, done);
    }
    return queued;
  }

  async runDeferred(convId) {
    const key = this.key(convId);
    // read when its turn comes (the queue is shared with message turns): a newer state wins
    const st = this.store.get(key);
    if (!st || !this.engine.deferred(st)) return { ignored: 'deferred' };
    // the merged custom attributes and the live status come from Chatwoot itself
    const c = await this.client.getConversation(convId);
    if (!c.ok || !c.data) {
      this.retryAfter.set(key, this.now() + RETRY_FETCH_MS);
      return { ignored: 'deferred_fetch' };
    }
    const conv = c.data;
    if (conv.status === 'resolved' || conv.status === 'snoozed') {
      this.retryAfter.set(key, this.now() + RETRY_STATUS_MS);
      return { ignored: 'deferred_status' };
    }
    this.retryAfter.delete(key);
    const res = this.engine.retryDeferred(st, { now: this.now() });
    return this.execute(convId, conv, res);
  }

  // ------------------------------------------------------------------ turns
  async runTurn(convId, conv, st, input) {
    const res = this.engine.handle(st, input, { now: this.now() });
    return this.execute(convId, conv, res);
  }

  async execute(convId, conv, res) {
    try {
      return await this.executeTurn(convId, conv, res);
    } finally {
      // a reserved slot is now either an alert that went out or one given back: no longer "in flight"
      this.inflight.delete(this.key(convId));
    }
  }

  async executeTurn(convId, conv, res) {
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
      // check and take the slot in one synchronous step (D3): concurrent conversations can't all slip under a cap,
      // and a free slot goes to the front of the deferred line (urgent first, then the longest wait)
      const slot = fresh ? this.reserveInLine(keys, urgent) : null;
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
