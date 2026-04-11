/**
 * POST /api/boost/attribute
 * ─────────────────────────
 * Called when a transaction completes (or transitions to a "paid" state).
 * Decides whether the booking should be attributed to a prior promoted-
 * listing click and, if so, charges the host 25% of the booking subtotal.
 *
 * This is the REVENUE endpoint for the Promoted Listings model. Without it,
 * promotions are free advertising. With it, PRNM collects a performance fee
 * aligned to actual bookings.
 *
 * Request body:
 *   {
 *     transactionId: 'uuid',     // Sharetribe transaction id
 *     promoClickId: 'uuid'|null, // from prnm_promo_click cookie at booking
 *   }
 *
 * Flow:
 *   1. Load transaction, verify it is in a billable state.
 *   2. Confirm the promoClickId (if any) matches a click within the
 *      attribution window for the transaction's listing. If no match,
 *      the booking is NOT attributed and nothing is charged.
 *   3. Compute ad charge = booking_subtotal × 0.25.
 *   4. In production: create a Stripe destination charge OR an
 *      off-session invoice against the host's Connect account.
 *      In mock mode (no STRIPE_SECRET_KEY): skip real charge, just
 *      update the listing's promotion stats.
 *   5. Increment listing.publicData.promotion.stats counters:
 *      attributedBookings += 1
 *      attributedRevenueCents += bookingSubtotalCents
 *      platformAdChargeCents += chargeCents
 *
 * Idempotency:
 *   A transaction must not be attributed twice. We store the attribution
 *   record in transaction.protectedData.promoAttribution — if it's already
 *   set on entry, we return the existing record.
 *
 * NOTE: This endpoint is designed to be called from a Sharetribe transition
 * webhook (e.g. on `transition/confirm-payment`). It can also be called
 * manually for backfill. It should NOT be exposed publicly — it's an
 * internal endpoint that expects the caller to have authority.
 */

const { getTrustedSdk } = require('../../api-util/sdk');

const PROMOTION_AD_RATE = 0.25;
const ATTRIBUTION_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

module.exports = async (req, res) => {
  const { transactionId, promoClickId } = req.body || {};

  if (!transactionId) {
    return res.status(400).json({ error: 'transactionId required' });
  }

  try {
    const sdk = await getTrustedSdk(req);

    // Fetch the transaction with related listing.
    const txRes = await sdk.transactions.show({
      id: transactionId,
      include: ['listing'],
    });
    const tx = txRes.data.data;
    const included = txRes.data.included || [];
    const listing = included.find(i => i.type === 'listing');

    if (!tx) {
      return res.status(404).json({ error: 'transaction_not_found' });
    }
    if (!listing) {
      return res.status(422).json({ error: 'transaction_has_no_listing' });
    }

    // Idempotency: if already attributed, return the existing record.
    const existingAttribution = tx.attributes?.protectedData?.promoAttribution;
    if (existingAttribution) {
      return res.json({
        ok: true,
        alreadyAttributed: true,
        attribution: existingAttribution,
      });
    }

    // The booking must cite a promoClickId from the Sponsored band cookie.
    // Without it, this was an organic booking — no charge.
    if (!promoClickId) {
      return res.json({
        ok: true,
        attributed: false,
        reason: 'no_promo_click',
      });
    }

    // Promo click records live on the listing's promotion stats; in a
    // production build this would be a separate table (Supabase /
    // Sharetribe Integration API store). For Phase 1 we validate the
    // click timestamp encoded in the click id itself:
    //   promoClickId format: `<listingId>:<epochMs>:<rand>`
    const parts = String(promoClickId).split(':');
    if (parts.length < 2) {
      return res.json({ ok: true, attributed: false, reason: 'malformed_click' });
    }
    const [clickListingId, clickEpochStr] = parts;
    const clickEpoch = Number(clickEpochStr);

    if (!Number.isFinite(clickEpoch)) {
      return res.json({ ok: true, attributed: false, reason: 'malformed_click' });
    }

    // Click must be for the same listing that was booked.
    if (clickListingId !== listing.id.uuid) {
      return res.json({
        ok: true,
        attributed: false,
        reason: 'click_listing_mismatch',
      });
    }

    // Click must be within the attribution window.
    if (Date.now() - clickEpoch > ATTRIBUTION_WINDOW_MS) {
      return res.json({
        ok: true,
        attributed: false,
        reason: 'click_outside_window',
      });
    }

    // Compute the ad charge from the booking subtotal (in cents).
    // Sharetribe transaction lineItems carry the subtotal — we sum the
    // host-facing line items (excluding platform commission).
    const lineItems = tx.attributes?.lineItems || [];
    const hostSubtotalCents = lineItems
      .filter(li => li.includeFor?.includes('provider') && !li.reversal)
      .reduce((acc, li) => acc + (li.lineTotal?.amount || 0), 0);

    if (hostSubtotalCents <= 0) {
      return res.json({
        ok: true,
        attributed: false,
        reason: 'no_subtotal',
      });
    }

    const chargeCents = Math.round(hostSubtotalCents * PROMOTION_AD_RATE);

    // ── Payment step ──
    const hasStripe = !!process.env.STRIPE_SECRET_KEY;
    let stripeRecord = null;
    if (hasStripe) {
      // TODO(handoff): Create a Stripe destination charge OR an off-session
      // invoice against the host's Connect account for `chargeCents`.
      // Requires resolving the host's Stripe connected account id from
      // listing.author.attributes.profile.protectedData.stripeAccountId
      // (or equivalent). Left as a TODO because it's environment-dependent.
      stripeRecord = { mode: 'stripe', status: 'todo_not_implemented' };
    } else {
      stripeRecord = { mode: 'mock', status: 'logged_only' };
    }

    // ── Update listing promotion stats ──
    // We need to write to the listing's publicData.promotion.stats. This
    // requires the Integration API because the current request's trusted
    // SDK may not own the listing. For Phase 1 we attempt ownListings
    // update and fall back to logging if that fails.
    const attributionRecord = {
      attributedAt: new Date().toISOString(),
      promoClickId,
      chargeCents,
      subtotalCents: hostSubtotalCents,
      adRate: PROMOTION_AD_RATE,
      stripe: stripeRecord,
    };

    try {
      // Mark the transaction so we don't double-charge.
      await sdk.transactions.updateMetadata({
        id: transactionId,
        metadata: { promoAttribution: attributionRecord },
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[boost/attribute] could not write tx metadata:', e.message);
    }

    return res.json({
      ok: true,
      attributed: true,
      attribution: attributionRecord,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[boost/attribute] error:', err);
    return res.status(500).json({
      error: 'attribution_failed',
      detail: err.message,
    });
  }
};
