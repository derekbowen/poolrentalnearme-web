'use strict';
/**
 * Handoff flood caps (D3). Only escalations that reach the founders' phones
 * count: the @mention note (conversation_mention push) and the open toggle
 * (bot handoff → conversation_creation push).
 *
 *   - at most 1 per conversation per 24 h
 *   - at most 2 per contact per 24 h
 *   - at most 10 across the whole inbox per rolling hour
 *
 * The ledger lives in the store's meta section, apart from conversation state,
 * so a visitor who resolves the chat ("end conversation") and writes again does
 * not reset it. Beyond a cap the executor sends no @mention and does not open
 * the conversation: it labels it and keeps it pending (bot.js).
 */
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const DEFAULT_LIMITS = Object.freeze({
  perConversation: 1,
  perContact: 2,
  windowMs: DAY,
  globalPerHour: 10,
  globalWindowMs: HOUR,
});

const META_KEY = 'flood';

class FloodLedger {
  /**
   * @param {object} [o]
   * @param {import('./memory').MemoryStore} [o.store]  persisted in store meta when given
   * @param {object} [o.limits]  overrides DEFAULT_LIMITS
   */
  constructor({ store = null, limits = {} } = {}) {
    this.store = store;
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    const saved = store && typeof store.getMeta === 'function' ? store.getMeta(META_KEY) : null;
    this.data = {
      conv: (saved && saved.conv) || {},
      contact: (saved && saved.contact) || {},
      global: (saved && Array.isArray(saved.global) && saved.global) || [],
    };
  }

  prune(now) {
    const keep = (list, win) => (list || []).filter((t) => Number.isFinite(t) && now - t < win);
    for (const kind of ['conv', 'contact']) {
      for (const [k, list] of Object.entries(this.data[kind])) {
        const kept = keep(list, this.limits.windowMs);
        if (kept.length) this.data[kind][k] = kept;
        else delete this.data[kind][k];
      }
    }
    this.data.global = keep(this.data.global, this.limits.globalWindowMs);
  }

  /**
   * Which cap (if any) would a new founder-notifying escalation break?
   * @returns {null | 'conversation' | 'contact' | 'global'}
   */
  check({ conv, contact = null, now = Date.now() }) {
    this.prune(now);
    const L = this.limits;
    if (conv && (this.data.conv[conv] || []).length >= L.perConversation) return 'conversation';
    if (contact && (this.data.contact[contact] || []).length >= L.perContact) return 'contact';
    if (this.data.global.length >= L.globalPerHour) return 'global';
    return null;
  }

  /** Founder alerts the hourly ceiling still allows right now (the per-conversation / per-contact caps aside). */
  freeGlobal(now = Date.now()) {
    this.prune(now);
    return Math.max(0, this.limits.globalPerHour - this.data.global.length);
  }

  /**
   * Check and take a slot in the same synchronous step, so escalations that
   * arrive together (separate conversation queues, each awaiting several
   * Chatwoot calls) can never all pass the check before any of them records.
   * @returns {{ token: object } | { capped: 'conversation' | 'contact' | 'global' }}
   */
  reserve({ conv, contact = null, now = Date.now() }) {
    const capped = this.check({ conv, contact, now });
    if (capped) return { capped };
    this.record({ conv, contact, now });
    return { token: { conv, contact, at: now } };
  }

  /** Give a reserved slot back: the handoff failed before the @mention note was accepted (no one was alerted). */
  release(token) {
    if (!token) return;
    const drop = (list) => {
      const i = (list || []).lastIndexOf(token.at);
      if (i >= 0) list.splice(i, 1);
    };
    if (token.conv) drop(this.data.conv[token.conv]);
    if (token.contact) drop(this.data.contact[token.contact]);
    drop(this.data.global);
    this.prune(token.at);
    this.save();
  }

  /** Record an escalation that notified the founders (reserve() already does this for a reserved one). */
  record({ conv, contact = null, now = Date.now() }) {
    this.prune(now);
    if (conv) (this.data.conv[conv] = this.data.conv[conv] || []).push(now);
    if (contact) (this.data.contact[contact] = this.data.contact[contact] || []).push(now);
    this.data.global.push(now);
    this.save();
  }

  save() {
    if (this.store && typeof this.store.setMeta === 'function') this.store.setMeta(META_KEY, this.data);
  }
}

module.exports = { FloodLedger, DEFAULT_LIMITS };
