const { getSdk, handleError } = require('../api-util/sdk');
const { createDeal } = require('./dealstore');

const ROOT = (process.env.VITE_MARKETPLACE_ROOT_URL || 'https://www.poolrentalnearme.com').replace(/\/$/, '');

const slugify = s =>
  String(s || 'pool')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'pool';

/**
 * POST /api/create-deal   (JSON body, provider session required)
 *
 * A host creates a shareable "package deal" link for one of their listings.
 * They send the link to their guest however they already talk; the guest opens
 * it, picks a date, and pays at the agreed price — no message-thread required.
 * This sidesteps the version-locked-conversation problem entirely.
 *
 * Body: { listingId, priceCents, note }
 */
module.exports = async (req, res) => {
  try {
    const { listingId, priceCents, note } = req.body || {};
    const cents = parseInt(priceCents, 10);
    if (!listingId) return res.status(400).json({ error: 'listingId is required' });
    if (!Number.isFinite(cents) || cents < 2500) {
      return res.status(400).json({ error: 'Deal price must be at least $25.00.' });
    }

    const sdk = getSdk(req, res);

    // Ownership check: ownListings.show only returns a listing the caller owns.
    // A non-owner (or logged-out) request throws → 403.
    let listing;
    try {
      const r = await sdk.ownListings.show({ id: listingId });
      listing = r.data.data;
    } catch (e) {
      return res.status(403).json({ error: 'You can only create a deal for your own pool.' });
    }
    const meRes = await sdk.currentUser.show();
    const hostId = meRes.data.data.id.uuid;
    const currency = listing?.attributes?.price?.currency || 'USD';
    const title = listing?.attributes?.title || 'pool';

    const token = await createDeal({
      hostId,
      listingId,
      negotiatedPriceCents: cents,
      currency,
      note,
    });

    const url = `${ROOT}/l/${slugify(title)}/${listingId}?deal=${token}`;
    res.status(200).json({ token, url, priceCents: cents, currency });
  } catch (e) {
    handleError(res, e);
  }
};
