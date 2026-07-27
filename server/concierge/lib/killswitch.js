// Kill switches — the FIRST thing built and tested, before anything can send.
// Hard kill (STOP file): halts ALL autonomous bot sends instantly. Admin relay,
// TAKE, and SAY are NOT autonomous and must keep working during STOP.
// Soft pause (PAUSE file): admin PAUSE/RESUME; same effect on bot sends.
'use strict';
const fs = require('fs');
const cfg = require('../config');

// True when the bot must NOT send autonomously.
function botSendsHalted() {
  try { return fs.existsSync(cfg.STOP_FILE) || fs.existsSync(cfg.PAUSE_FILE); }
  catch { return true; } // fail CLOSED: if we can't check, do not send
}
function hardStopped() { try { return fs.existsSync(cfg.STOP_FILE); } catch { return true; } }
function paused()      { try { return fs.existsSync(cfg.PAUSE_FILE); } catch { return true; } }

// Gate every autonomous bot send through this. Admin relay does NOT call it.
// Returns {ok:true} to proceed, or {ok:false, reason} to block (and log).
function guardBotSend() {
  if (hardStopped()) return { ok: false, reason: 'STOP_FILE' };
  if (paused())      return { ok: false, reason: 'PAUSED' };
  return { ok: true };
}
function setPause(on) {
  if (on) fs.writeFileSync(cfg.PAUSE_FILE, new Date().toISOString());
  else { try { fs.unlinkSync(cfg.PAUSE_FILE); } catch {} }
}
module.exports = { botSendsHalted, hardStopped, paused, guardBotSend, setPause };
