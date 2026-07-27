// Context builder -- on each inbound, assemble a read-only snapshot the brain needs:
// who is this, their Sharetribe listings/Stripe, recent SMS, and any MMS photos.
// Read-only. Never sends. Reuses the Integration SDK + sms_log.
'use strict';
const cfg = require('../config');
const store = require('./store');
let sdk; try { sdk = require('/home/bun/app/server/api-util/integration'); } catch { sdk = null; }
const U = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: K, Authorization: 'Bearer ' + K };
const d10 = s => { const x = String(s || '').replace(/\D/g, ''); return x.length === 11 && x[0] === '1' ? x.slice(1) : x; };

async function findSharetribeUserByPhone(phone) {
  if (!sdk) return null;
  const tail = d10(phone).slice(-10);
  for (let p = 1; p <= 40; p++) {
    const q = await sdk.users.query({ perPage: 100, page: p, include: ['stripeAccount'] }, { allowRawResponse: true });
    const u = q._raw.data.data.find(x => d10(x.attributes.profile?.protectedData?.phoneNumber).endsWith(tail));
    if (u) return u;
    if (q._raw.data.data.length < 100) break;
  }
  return null;
}
async function listingsFor(uid) {
  if (!sdk) return [];
  const ls = await sdk.listings.query({ authorId: uid, include: ['images'] }, { allowRawResponse: true });
  return ls._raw.data.data.map(l => ({
    id: l.id.uuid, state: l.attributes.state, title: l.attributes.title,
    images: (l.relationships?.images?.data || []).length,
    price: l.attributes.price?.amount ?? null,
  }));
}
async function recentMessages(phone, n = 6) {
  const r = await fetch(U + `/rest/v1/sms_log?phone=eq.${encodeURIComponent(cfg.norm(phone))}&select=created_at,event_type,body_preview&order=created_at.desc&limit=${n}`, { headers: H });
  return r.ok ? await r.json() : [];
}

// inbound = { From, Body, NumMedia, MediaUrl0.. } (Twilio params) OR {from, body, media[]}
async function build(inbound) {
  const from = cfg.norm(inbound.from || inbound.From || '');
  const body = inbound.body ?? inbound.Body ?? '';
  const media = inbound.media || collectMedia(inbound);
  const isAdmin = cfg.isAdmin(from);

  let contact = await store.getContactByPhone(from);
  let user = await findSharetribeUserByPhone(from);
  if (user && (!contact || !contact.sharetribe_user_id)) {
    const pr = user.attributes.profile || {};
    contact = await store.upsertContact({
      phone: from, email: user.attributes.email,
      sharetribe_user_id: user.id.uuid, display_name: pr.displayName || `${pr.firstName || ''} ${pr.lastName || ''}`.trim(),
    });
  }
  const profile = user ? (user.attributes.profile || {}) : {};
  const snap = {
    from, body, media, isAdmin,
    admin: isAdmin ? cfg.adminName(from) : null,
    name: contact?.display_name || profile.displayName || null,
    email: user?.attributes?.email || contact?.email || null,
    sharetribe_user_id: user?.id?.uuid || contact?.sharetribe_user_id || null,
    stripeConnected: user ? !!user.attributes.stripeConnected : null,
    listings: user ? await listingsFor(user.id.uuid) : [],
    recent: await recentMessages(from),
    known: !!user,
  };
  return snap;
}
function collectMedia(p) {
  const n = parseInt(p.NumMedia || '0', 10) || 0;
  const out = [];
  for (let i = 0; i < n; i++) if (p['MediaUrl' + i]) out.push({ url: p['MediaUrl' + i], type: p['MediaContentType' + i] || null });
  return out;
}
module.exports = { build, findSharetribeUserByPhone };
