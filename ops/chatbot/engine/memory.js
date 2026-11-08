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
 */
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

class MemoryStore {
  constructor({ file = null, ttlDays = 30, maxConversations = 1000, debounceMs = 2000 } = {}) {
    this.file = file;
    this.ttlMs = ttlDays * 24 * 3600 * 1000;
    this.max = maxConversations;
    this.debounceMs = debounceMs;
    this.map = new Map();
    this.meta = new Map();
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

  set(key, state) {
    this.map.delete(key);
    this.map.set(key, JSON.parse(JSON.stringify(state)));
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
      if (now - (v.updatedAt || 0) > this.ttlMs) this.map.delete(k);
    }
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
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

module.exports = { MemoryStore };
