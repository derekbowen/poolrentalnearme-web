// Store layer -- read/write concierge state in Supabase. Thin PostgREST wrapper.
// Applies the pure dispatcher's EFFECTS to real tables. No SMS here.
'use strict';
const cfg = require('../config');
const ks = require('./killswitch');
const U = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' };

async function sb(path, { method = 'GET', body, prefer } = {}) {
  const r = await fetch(U + '/rest/v1/' + path, {
    method, headers: { ...H, ...(prefer ? { Prefer: prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  let json = null; try { json = txt ? JSON.parse(txt) : null; } catch {}
  if (!r.ok) throw new Error(`${method} ${path.split('?')[0]} -> ${r.status} ${txt.slice(0, 160)}`);
  return json;
}
const one = a => (Array.isArray(a) && a.length ? a[0] : null);
const nowISO = () => new Date().toISOString();

// ----- contacts -----
async function getContactByPhone(phone) {
  return one(await sb(`contacts?phone=eq.${encodeURIComponent(cfg.norm(phone))}&limit=1`));
}
async function upsertContact({ phone, email, sharetribe_user_id, display_name }) {
  const row = { phone: cfg.norm(phone), email, sharetribe_user_id, display_name };
  return one(await sb('contacts?on_conflict=phone', { method: 'POST', body: [row], prefer: 'resolution=merge-duplicates,return=representation' }));
}

// ----- threads -----
async function getThread(id) { return one(await sb(`support_threads?id=eq.${id}&limit=1`)); }
async function listOpenThreads() {
  return await sb(`support_threads?status=neq.resolved&select=id,contact_id,status,owner,summary,last_intent&order=updated_at.desc&limit=50`);
}
async function newestOpenForContact(contact_id) {
  return one(await sb(`support_threads?contact_id=eq.${encodeURIComponent(contact_id)}&status=neq.resolved&order=updated_at.desc&limit=1`));
}
async function findOrCreateThread(contact_id, { channel = 'sms', summary = null } = {}) {
  const existing = await newestOpenForContact(contact_id);
  if (existing) return existing;
  return one(await sb('support_threads', { method: 'POST', body: [{ contact_id, channel, status: 'bot', owner: 'bot', summary }], prefer: 'return=representation' }));
}
async function patchThread(id, patch) {
  return one(await sb(`support_threads?id=eq.${id}`, { method: 'PATCH', body: { ...patch, updated_at: nowISO() }, prefer: 'return=representation' }));
}

// ----- apply a dispatcher effect to real state -----
async function applyEffect(effect) {
  if (!effect) return { applied: false };
  switch (effect.op) {
    case 'take': {
      const sticky = new Date(Date.now() + cfg.RELAY_STICKY_MIN * 60000).toISOString();
      await patchThread(effect.thread, { owner: effect.owner, status: 'human', sticky_until: sticky });
      return { applied: true };
    }
    case 'handback': await patchThread(effect.thread, { owner: 'bot', status: 'bot', sticky_until: null }); return { applied: true };
    case 'resolve':  await patchThread(effect.thread, { status: 'resolved', sticky_until: null }); return { applied: true };
    case 'watch': {
      const t = await getThread(effect.thread); if (!t) return { applied: false };
      const w = new Set(t.watchers || []); w.add(effect.who);
      await patchThread(effect.thread, { watchers: [...w] }); return { applied: true };
    }
    case 'unwatch': {
      const t = await getThread(effect.thread); if (!t) return { applied: false };
      const w = (t.watchers || []).filter(x => x !== effect.who);
      await patchThread(effect.thread, { watchers: w }); return { applied: true };
    }
    case 'setPause': ks.setPause(effect.on); return { applied: true };
    case 'approve': case 'reject':
      // pending-action execution lands in Phase C/D; here we just record intent.
      return { applied: true, deferred: effect.op };
    default: return { applied: false };
  }
}

// sticky relay target for an admin: the thread they currently own & still-sticky
async function stickyThreadFor(adminName) {
  const rows = await sb(`support_threads?owner=eq.${adminName}&status=eq.human&sticky_until=gt.${nowISO()}&order=sticky_until.desc&limit=1`);
  const t = one(rows);
  return t ? { thread: t.id, until: t.sticky_until } : null;
}

module.exports = { sb, getContactByPhone, upsertContact, getThread, listOpenThreads,
  newestOpenForContact, findOrCreateThread, patchThread, applyEffect, stickyThreadFor };
