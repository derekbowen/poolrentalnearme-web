// Credit-burn protection: per-sender inbound flood cap + global outbound circuit
// breaker. In-memory sliding windows (per-container; reset on restart) -- fast, no
// DB call on the hot path. Signature verification (verify.js) already blocks forged
// requests; this guards against real-number flooding and any runaway send loop.
'use strict';
const fs = require('fs');
const cfg = require('../config');

const INBOUND_MAX = 25;      const INBOUND_WIN_MS = 10 * 60 * 1000;  // 25 inbound / 10 min per number
const OUTBOUND_MAX = 60;     const OUTBOUND_WIN_MS = 5 * 60 * 1000;  // >60 concierge sends / 5 min => trip STOP
const COMPLIANCE = /^\s*(stop|stopall|unsubscribe|cancel|end|quit|start|unstop|yes|help|info)\s*$/i;

const _inbound = new Map();  // phone -> [ts]
const _outbound = [];        // global [ts]
const prune = (arr, win, now) => { const cut = now - win; while (arr.length && arr[0] < cut) arr.shift(); };

// Inbound flood cap. Admin numbers and single-word compliance keywords (STOP/START/…)
// are ALWAYS allowed so opt-out never breaks even under a flood.
function checkInbound(phone, body, nowMs) {
  const now = nowMs || 0;
  if (cfg.isAdmin(phone)) return { allowed: true, admin: true, count: 0 };
  if (COMPLIANCE.test(String(body || ''))) return { allowed: true, compliance: true, count: 0 };
  let arr = _inbound.get(phone); if (!arr) { arr = []; _inbound.set(phone, arr); }
  prune(arr, INBOUND_WIN_MS, now); arr.push(now);
  return { allowed: arr.length <= INBOUND_MAX, count: arr.length };
}

// Call before EVERY concierge outbound send. If concierge sends spike abnormally,
// auto-engage the STOP kill switch (halts autonomous bot sends) and report tripped.
function guardOutbound(nowMs) {
  const now = nowMs || 0;
  prune(_outbound, OUTBOUND_WIN_MS, now); _outbound.push(now);
  if (_outbound.length > OUTBOUND_MAX) {
    try { fs.writeFileSync(cfg.STOP_FILE, 'AUTO circuit-breaker: concierge outbound spike ' + _outbound.length + ' in 5min'); } catch {}
    return { allowed: false, tripped: true, count: _outbound.length };
  }
  return { allowed: true, count: _outbound.length };
}
function _reset() { _inbound.clear(); _outbound.length = 0; }  // test helper
module.exports = { checkInbound, guardOutbound, INBOUND_MAX, OUTBOUND_MAX, _reset };
