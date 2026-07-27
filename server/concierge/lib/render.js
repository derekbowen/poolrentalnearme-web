// Text renderers for STATUS / LIST / DIGEST. Pull live counts; return SMS-ready text.
'use strict';
const store = require('./store');
const ks = require('./killswitch');

async function status() {
  const open = await store.listOpenThreads();
  const byOwner = open.reduce((m, t) => (m[t.owner || 'bot'] = (m[t.owner || 'bot'] || 0) + 1, m), {});
  const paused = ks.paused() ? 'PAUSED' : (ks.hardStopped() ? 'STOPPED' : 'live');
  return [
    `PRNM Concierge — ${paused}`,
    `Open threads: ${open.length} (bot ${byOwner.bot || 0} · derek ${byOwner.derek || 0} · brandon ${byOwner.brandon || 0})`,
    `LIST for detail.`,
  ].join('\n');
}
async function list() {
  const open = await store.listOpenThreads();
  if (!open.length) return 'No open threads. 🎉';
  return open.slice(0, 15).map(t =>
    `${t.id} · ${(t.summary || t.contact_id || '?').slice(0, 34)} · ${t.owner || 'bot'}`).join('\n');
}
async function digest() {
  const open = await store.listOpenThreads();
  return `Daily digest — ${open.length} open thread(s). Full metrics land in Phase B (scoreboard).`;
}
module.exports = { status, list, digest };
