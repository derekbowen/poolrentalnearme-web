'use strict';
/**
 * Per-conversation memory: a small JSON file (mode 600), written atomically.
 * The key facts are also mirrored into Chatwoot conversation custom attributes
 * (prnm_*), so a lost file can be rebuilt from the webhook payload.
 *
 * Pass `file: null` for an in-memory store (tests).
 *
 * `meta` holds small records that are not conversations (the handoff flood
 * ledger): they are saved with the file but never pruned as conversations.
 *
 * Writes are coalesced (at most one every `debounceMs`, 2 s by default) and the
 * file write itself is asynchronous, so a burst of webhooks never blocks the event
 * loop on disk. The store keeps at most 1,000 conversations (30-day TTL): about
 * 8 MB of JSON in the worst case, a few tens of milliseconds to serialise.
 * flush() is the synchronous write used at shutdown and in tests.
 *
 * Eviction is not plain LRU (round 3, deferred_starve): the executor ranks each
 * state (setRank) and the lowest rank goes first, least recently written first
 * within a rank. A founder alert still waiting for a free slot (rank 2-3) is
 * never evicted to make room for ordinary chats, so a flood of 1,000 "hi"
 * conversations cannot make the bot forget an emergency it told the customer it
 * had logged. A pinned state (rank >= PIN_RANK) is also exempt from the TTL.
 */
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

// states ranked this high (a founder alert still waiting for a slot) also outlive the TTL
const PIN_RANK = 2;
const PRUNE_SLACK = 50;

class MemoryStore {
  constructor({ file = null, ttlDays = 30, maxConversations = 1000, debounceMs = 2000 } = {}) {
    this.file = file;
    this.ttlMs = ttlDays * 24 * 3600 * 1000;
    this.max = maxConversations;
    this.debounceMs = debounceMs;
    this.map = new Map();
    this.meta = new Map();
    // how much a state matters when the store is full (0 = ordinary); see setRank()
    this.rank = () => 0;
    this.timer = null;
    this.writing = null; // the asynchronous write in progress, if any
    this.dirty = false; // changed again while that write was running
    if (file) this.load();
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const data = JSON.parse(raw);
      for (const [k, v] of Object.entries(data.conversations || {})) this.map.set(k, v);
      for (const [k, v] of Object.entries(data.meta || {})) this.meta.set(k, v);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        // keep a copy of an unreadable file instead of overwriting it
        try {
          fs.renameSync(this.file, `${this.file}.corrupt-${Date.now()}`);
        } catch {
          /* ignore */
        }
      }
    }
  }

  get(key) {
    const v = this.map.get(key);
    return v ? JSON.parse(JSON.stringify(v)) : null;
  }

  /** The stored state itself, not a copy: read-only, for cheap checks on hot paths (the deferred sweep). */
  peek(key) {
    return this.map.get(key) || null;
  }

  /**
   * How much a state matters when the store is full: (state) => number. Lower ranks are evicted first;
   * a rank of PIN_RANK or more is also kept past the TTL.
   */
  setRank(fn) {
    this.rank = typeof fn === 'function' ? fn : () => 0;
  }

  rankOf(v) {
    try {
      const r = Number(this.rank(v));
      return Number.isFinite(r) ? r : 0;
    } catch {
      return 0;
    }
  }

  set(key, state) {
    this.map.delete(key);
    this.map.set(key, JSON.parse(JSON.stringify(state)));
    // bounded between writes too (and for a store with no file): prune once it is a little over the cap
    if (this.map.size > this.max + PRUNE_SLACK) this.prune();
    this.schedule();
  }

  delete(key) {
    this.map.delete(key);
    this.schedule();
  }

  getMeta(key) {
    const v = this.meta.get(key);
    return v ? JSON.parse(JSON.stringify(v)) : null;
  }

  setMeta(key, value) {
    this.meta.set(key, JSON.parse(JSON.stringify(value)));
    this.schedule();
  }

  prune(now = Date.now()) {
    for (const [k, v] of this.map) {
      if (now - (v.updatedAt || 0) > this.ttlMs && this.rankOf(v) < PIN_RANK) this.map.delete(k);
    }
    const over = this.map.size - this.max;
    if (over <= 0) return;
    // lowest rank first, least recently written first within a rank (the map keeps write order)
    const order = [...this.map].map(([k, v], i) => ({ k, r: this.rankOf(v), i }));
    order.sort((a, b) => a.r - b.r || a.i - b.i);
    for (let n = 0; n < over; n++) this.map.delete(order[n].k);
  }

  schedule() {
    if (!this.file) return;
    if (this.writing) {
      this.dirty = true;
      return;
    }
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flushAsync().catch(() => {
        /* the next change retries; a sync flush() runs at shutdown */
      });
    }, this.debounceMs);
    if (this.timer.unref) this.timer.unref();
  }

  body() {
    this.prune();
    return JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      conversations: Object.fromEntries(this.map),
      meta: Object.fromEntries(this.meta),
    });
  }

  /** Coalesced background write: serialise once, write a temp file, rename it into place. */
  async flushAsync() {
    if (!this.file) return;
    if (this.writing) {
      this.dirty = true;
      return this.writing;
    }
    const tmp = `${this.file}.${process.pid}.tmp`;
    const run = async () => {
      await fsp.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
      await fsp.writeFile(tmp, this.body(), { mode: 0o600 });
      await fsp.rename(tmp, this.file);
    };
    this.dirty = false;
    this.writing = run().finally(() => {
      this.writing = null;
      if (this.dirty) {
        this.dirty = false;
        this.schedule();
      }
    });
    return this.writing;
  }

  /** Synchronous write (shutdown, tests). */
  flush() {
    if (!this.file) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const dir = path.dirname(this.file);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const tmp = `${this.file}.${process.pid}.sync.tmp`;
    fs.writeFileSync(tmp, this.body(), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
    this.dirty = false;
  }
}

module.exports = { MemoryStore, PIN_RANK };
