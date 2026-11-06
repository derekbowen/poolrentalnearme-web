'use strict';
/**
 * Append-only JSONL log of what the assistant did, for metrics.js and
 * draft-additions.js. One line per event:
 *
 *   {"ts":"…","type":"answered","conv":"1:42","entry":"booking-how-to-book","score":0.93,"mode":"auto","via":"match"}
 *   {"ts":"…","type":"unmatched","conv":"1:42","text":"…redacted…","best":{"id":"…","score":0.31},"attempt":1}
 *   {"ts":"…","type":"handoff","conv":"1:42","reason":"founder_request","urgency":"normal",…}
 *   {"ts":"…","type":"escalated"|"escalation_failed",…}
 *
 * Never written: tokens, secrets, full card numbers, passwords, email
 * addresses, phone numbers (text fields pass through redactForLog first).
 */
const fs = require('node:fs');
const path = require('node:path');
const { redactForLog } = require('./safety');

const TEXT_FIELDS = new Set(['text']);
const DROP_FIELDS = new Set(['email', 'token', 'secret', 'password', 'content']);

class Tracker {
  constructor({ file = null, maxBytes = 50 * 1024 * 1024 } = {}) {
    this.file = file;
    this.maxBytes = maxBytes;
    this.memory = [];
    if (file) fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  }

  clean(ev) {
    const out = {};
    for (const [k, v] of Object.entries(ev)) {
      if (DROP_FIELDS.has(k)) continue;
      out[k] = TEXT_FIELDS.has(k) && typeof v === 'string' ? redactForLog(v) : v;
    }
    return out;
  }

  log(conv, events) {
    const lines = [];
    for (const ev of [].concat(events || [])) {
      const rec = { ts: new Date().toISOString(), conv, ...this.clean(ev) };
      this.memory.push(rec);
      if (this.memory.length > 1000) this.memory.shift();
      lines.push(JSON.stringify(rec));
    }
    if (!this.file || !lines.length) return;
    try {
      const st = fs.statSync(this.file);
      if (st.size > this.maxBytes) fs.renameSync(this.file, `${this.file}.1`);
    } catch {
      /* first write */
    }
    fs.appendFileSync(this.file, `${lines.join('\n')}\n`, { mode: 0o600 });
  }
}

/** Read a JSONL log (plus its rotated .1) into an array, skipping bad lines. */
function readLog(file) {
  const out = [];
  for (const f of [`${file}.1`, file]) {
    let raw;
    try {
      raw = fs.readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line));
      } catch {
        /* skip */
      }
    }
  }
  return out;
}

module.exports = { Tracker, readLog };
