/**
 * POST /api/boost/purchase  (legacy route name — now does "promote toggle")
 * ────────────────────────────────────────────────────────────────────────
 * Host turns promotion ON or OFF for one of their listings.
 *
 * This is the eBay Promoted Listings model: NO payment at activation.
 * The host owes nothing until a guest clicks the Sponsored slot and books
 * within the 14-day attribution window. At that point
 * server/api/boost/attribute.js runs and collects 25% of the booking
 * subtotal via Stripe Connect.
 *
 * Request body:
 *   { listingId: 'uuid', enabled: true | false }
 *
 * Response:
 *   { ok: true, promotion: { active, activatedAt, adRate } }
 *
 * Why we kept the filename /boost/purchase.js:
 *   The apiRouter already routes /api/boost/purchase to this file, and
 *   renaming would ripple into client fetch calls during handoff.
 *   New callers should still use /api/boost/promote below (aliased in
 *   apiRouter).
 */

const { getTrustedSdk } = require('../../api-util/sdk');

// Single fixed ad rate. Must stay in sync with src/config/boostConfig.js
// PROMOTION_AD_RATE — duplicated here because the server file is CommonJS
// and can't import from the ESM client config.
const PROMOTION_AD_RATE = 0.25;

const emptyStats = () => ({
  impressions: 0,
  clicks: 0,
  attributedBookings: 0,
  attributedRevenueCents: 0,
  platformAdChargeCents: 0,
});

module.exports = async (req, res) => {
  const { listingId, enabled } = req.body || {};

  if (!listingId) {
    return res.status(400).json({ error: 'listingId required' });
  }
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled (boolean) required' });
  }

  try {
    const sdk = await getTrustedSdk(req);

    // Verify ownership via ownListings.show — will 403 if not owned.
    const showRes = await sdk.ownListings.show({ id: listingId });
    const listing = showRes.data.data;
    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    const existingPublicData = listing.attributes.publicData || {};
    const existingPromo = existingPublicData.promotion || {};

    let promotion;
    if (enabled) {
      promotion = {
        active: true,
        activatedAt: existingPromo.activatedAt || new Date().toISOString(),
        // Snapshot the rate at activation — historical integrity, in case
        // we ever change the platform rate later.
        adRate: PROMOTION_AD_RATE,
        stats: existingPromo.stats || emptyStats(),
        lastQualifiedAt: null,
        lastQualifiedResult: null,
      };
    } else {
      promotion = {
        ...existingPromo,
        active: false,
        deactivatedAt: new Date().toISOString(),
      };
    }

    await sdk.ownListings.update({
      id: listingId,
      publicData: {
        ...existingPublicData,
        // Full promotion object.
        promotion,
        // Flat searchable mirrors — Sharetribe search filters only work on
        // top-level publicData fields. Must be declared in the listing
        // search schema as a boolean for pub_promotionActive=true to work.
        // Keep boostActive aliased for SearchPage.duck's current filter.
        promotionActive: !!enabled,
        boostActive: !!enabled,
      },
    });

    return res.json({
      ok: true,
      promotion: {
        active: promotion.active,
        activatedAt: promotion.activatedAt,
        adRate: PROMOTION_AD_RATE,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[boost/purchase] error:', err);
    return res.status(500).json({
      error: 'Promotion update failed',
      detail: err.message,
    });
  }
};
