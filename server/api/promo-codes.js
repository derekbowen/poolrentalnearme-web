const { getSdk, handleError } = require('../api-util/sdk');
const integrationSdk = require('../api-util/integration');

// c152: host-managed promo codes, stored on the listing's publicData.promoCodes.
// The discount engine (server/api-util/lineItems.js) is the only thing that
// applies them at pricing time; this file just curates the list. Everything is
// owner-gated and validated here — the client can't set a shape we don't allow.

const HOST_PREFIX = 'H-';
const MAX_CODES = 25;

const cleanCode = raw => {
  const up = String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9\-]/g, '');
  if (!up) return null;
  const withPrefix = up.startsWith(HOST_PREFIX) ? up : HOST_PREFIX + up;
  return withPrefix.length >= 4 && withPrefix.length <= 24 ? withPrefix : null;
};

const ownedListing = async (req, res, listingId) => {
  const sdk = getSdk(req, res);
  const r = await sdk.ownListings.show({ id: listingId });
  return r.data.data;
};

const readCodes = listing => {
  const pd = (listing.attributes && listing.attributes.publicData) || {};
  return Array.isArray(pd.promoCodes) ? pd.promoCodes : [];
};

const writeCodes = async (listingId, codes) =>
  integrationSdk.listings.update({ id: listingId, publicData: { promoCodes: codes } });

module.exports.save = async (req, res) => {
  const { listingId, code, type, value, maxRedemptions, maxPerUser, expires, label } = req.body || {};
  if (!listingId) return res.status(400).json({ error: 'listingId is required' });
  if (!integrationSdk) return res.status(500).json({ error: 'Integration API is not configured.' });

  const cleaned = cleanCode(code);
  if (!cleaned) {
    return res.status(400).json({ error: 'Use 2-22 letters or numbers for the code name.' });
  }
  const kind = type === 'fixed' ? 'fixed' : 'percent';
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return res.status(400).json({ error: 'Enter a discount amount.' });
  }
  if (kind === 'percent' && num > 50) {
    return res.status(400).json({ error: 'Percent discounts are capped at 50%.' });
  }
  const amountValue = kind === 'percent' ? Math.round(num) : Math.round(num * 100); // fixed comes in dollars
  const limit = Number.isFinite(Number(maxRedemptions)) && Number(maxRedemptions) > 0
    ? Math.min(1000, Math.round(Number(maxRedemptions)))
    : null;
  const perUser = Number.isFinite(Number(maxPerUser)) && Number(maxPerUser) > 0
    ? Math.min(100, Math.round(Number(maxPerUser)))
    : 1;
  let expiresIso = null;
  if (expires) {
    const d = new Date(expires);
    if (!Number.isFinite(d.getTime())) return res.status(400).json({ error: 'That expiration date is not valid.' });
    if (d.getTime() < Date.now()) return res.status(400).json({ error: 'Pick an expiration date in the future.' });
    expiresIso = d.toISOString();
  }

  let listing;
  try {
    listing = await ownedListing(req, res, listingId);
  } catch (e) {
    return res.status(403).json({ error: 'Only the pool owner can manage promo codes.' });
  }

  const codes = readCodes(listing);
  const idx = codes.findIndex(c => String(c.code || '').toUpperCase() === cleaned);
  if (idx < 0 && codes.length >= MAX_CODES) {
    return res.status(400).json({ error: `You can have up to ${MAX_CODES} codes on a pool.` });
  }
  const prior = idx >= 0 ? codes[idx] : {};
  const record = {
    code: cleaned,
    type: kind,
    value: amountValue,
    label: String(label || '').slice(0, 60) || null,
    maxRedemptions: limit,
    maxPerUser: perUser,
    redeemed: Number.isInteger(prior.redeemed) ? prior.redeemed : 0,
    active: true,
    expires: expiresIso,
    created: prior.created || new Date().toISOString(),
    updated: new Date().toISOString(),
  };
  const next = idx >= 0 ? codes.map((c, i) => (i === idx ? record : c)) : [...codes, record];

  try {
    await writeCodes(listingId, next);
    return res.status(200).json({ ok: true, code: record, codes: next });
  } catch (e) {
    return handleError(res, e);
  }
};

module.exports.deactivate = async (req, res) => {
  const { listingId, code } = req.body || {};
  if (!listingId || !code) return res.status(400).json({ error: 'listingId and code are required' });
  if (!integrationSdk) return res.status(500).json({ error: 'Integration API is not configured.' });
  let listing;
  try {
    listing = await ownedListing(req, res, listingId);
  } catch (e) {
    return res.status(403).json({ error: 'Only the pool owner can manage promo codes.' });
  }
  const target = String(code).trim().toUpperCase();
  const codes = readCodes(listing);
  const next = codes.map(c =>
    String(c.code || '').toUpperCase() === target ? { ...c, active: false, updated: new Date().toISOString() } : c
  );
  try {
    await writeCodes(listingId, next);
    return res.status(200).json({ ok: true, codes: next });
  } catch (e) {
    return handleError(res, e);
  }
};

module.exports.list = async (req, res) => {
  const listingId = req.query && req.query.listingId;
  if (!listingId) return res.status(400).json({ error: 'listingId is required' });
  try {
    const listing = await ownedListing(req, res, listingId);
    return res.status(200).json({ codes: readCodes(listing) });
  } catch (e) {
    return res.status(403).json({ error: 'Only the pool owner can view promo codes.' });
  }
};
