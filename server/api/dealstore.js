// Durable store for host "package deal" links, in Supabase via PostgREST.
// Reuses the existing sms_reply_ctx table (kind='host_deal') so no new table /
// migration is needed. Columns map:
//   phone       -> deal token (the URL secret)
//   pool        -> listingId
//   tx_id       -> negotiatedPriceCents (as string)
//   when_label  -> JSON { host, note, cur }
//   expires_at  -> deal expiry
//   resolved    -> false while open
//
// The token in the URL is the only thing needed to view/accept a deal, and the
// PRICE is always read server-side from this record (never from the client), so
// a tampered link cannot change what a guest is charged.
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enc = encodeURIComponent;

const rest = async (path, { method = 'GET', body, prefer } = {}) => {
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`dealstore ${method} ${path.split('?')[0]} ${r.status} ${await r.text()}`);
  return r;
};

const DAY = 24 * 60 * 60 * 1000;

// Create a deal; returns the token.
const createDeal = async ({ hostId, listingId, negotiatedPriceCents, currency = 'USD', note = '', ttlDays = 30 }) => {
  const token = crypto.randomBytes(18).toString('base64url'); // ~24 char URL-safe secret
  await rest('sms_reply_ctx', {
    method: 'POST',
    body: [
      {
        kind: 'host_deal',
        phone: token,
        pool: listingId,
        tx_id: String(negotiatedPriceCents),
        when_label: JSON.stringify({ host: hostId, note: String(note || '').slice(0, 500), cur: currency }),
        expires_at: new Date(Date.now() + ttlDays * DAY).toISOString(),
      },
    ],
    prefer: 'return=minimal',
  });
  return token;
};

// Read an OPEN, unexpired deal by token. Returns null if missing/expired.
const getDeal = async token => {
  if (!token || typeof token !== 'string') return null;
  const r = await rest(
    `sms_reply_ctx?kind=eq.host_deal&phone=eq.${enc(token)}&resolved=eq.false&expires_at=gt.${new Date().toISOString()}&select=*&limit=1`
  );
  const row = (await r.json())[0];
  if (!row) return null;
  let meta = {};
  try {
    meta = JSON.parse(row.when_label || '{}');
  } catch (e) {
    meta = {};
  }
  const cents = parseInt(row.tx_id, 10);
  if (!Number.isFinite(cents) || cents < 2500) return null;
  return {
    token,
    listingId: row.pool,
    negotiatedPriceCents: cents,
    currency: meta.cur || 'USD',
    note: meta.note || '',
    hostId: meta.host || null,
  };
};

module.exports = { createDeal, getDeal, rest };
