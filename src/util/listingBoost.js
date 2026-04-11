/**
 * Promotion helpers
 * ─────────────────
 * Pure functions for reading promotion state off a Sharetribe listing and
 * deciding whether a promoted listing should serve in the Sponsored band
 * right now (vs. turned on but paused for qualification reasons).
 *
 * Promotion state lives on listing.attributes.publicData.promotion:
 *
 *   promotion: {
 *     active: true,                   // host has toggled it ON
 *     activatedAt: '2026-04-10T00:00:00Z',
 *     adRate: 0.25,                   // snapshotted from PROMOTION_AD_RATE
 *                                     // at activation time (historical
 *                                     // record — never mutated)
 *     stats: {
 *       impressions: 0,
 *       clicks: 0,
 *       attributedBookings: 0,
 *       attributedRevenueCents: 0,    // gross booking subtotals
 *       platformAdChargeCents: 0,     // 25% of above, collected from host
 *     },
 *     lastQualifiedAt: '...',         // last time server-side qualifier ran
 *     lastQualifiedResult: 'ok',      // or 'fully_booked' | 'water_too_cold' | ...
 *   }
 *
 * Also maintained for back-compat with the searchable flat flag:
 *   publicData.boostActive: true
 *   publicData.promotionActive: true  (preferred alias)
 */

import {
  PROMOTION_AD_RATE,
  PROMOTION_QUALIFICATION,
  formatAdCharge,
} from '../config/boostConfig';

/**
 * Is the promotion turned on? Cheap check — does not hit weather/availability.
 * Use this for Sponsored-band eligibility in render paths; use
 * `qualifyBoost` on the server for serving decisions.
 */
export const isPromotionActive = listing => {
  const promo = listing?.attributes?.publicData?.promotion;
  if (!promo?.active) return false;
  return true;
};

// Back-compat alias. SearchPage.duck and BoostListingCard still import
// `isBoostPurchased`. Keeping this export so we don't break search rendering
// while we transition callers.
export const isBoostPurchased = isPromotionActive;

/**
 * Client-side qualification — pure, no external calls. Returns
 * { run, reason } using whatever context the caller can provide.
 *
 * Authoritative serving decisions happen on the server
 * (server/services/boostQualification.js) because that's where weather and
 * water temp are available. This client helper is useful for optimistic
 * UI (gray out the toggle when we already know it won't serve).
 */
export const shouldPromotionRun = (listing, ctx = {}) => {
  if (!isPromotionActive(listing)) return { run: false, reason: 'not_active' };

  // Photos guard.
  const photoCount = listing.images?.length || 0;
  if (photoCount < PROMOTION_QUALIFICATION.minPhotos) {
    return { run: false, reason: 'insufficient_photos' };
  }

  // Availability guard (only if caller has the data).
  const openDays = ctx.openDaysNext7 ?? null;
  if (openDays !== null && openDays < PROMOTION_QUALIFICATION.minOpenDaysNext7) {
    return { run: false, reason: 'fully_booked' };
  }

  // Air temp guard (only if caller has the data).
  const forecastHigh = ctx.forecastHighF ?? null;
  if (forecastHigh !== null && forecastHigh < PROMOTION_QUALIFICATION.minForecastHighF) {
    return { run: false, reason: 'cold_forecast' };
  }

  // Water temp guard (only if caller has the data).
  const waterTemp = ctx.waterTempF ?? null;
  if (
    waterTemp !== null &&
    waterTemp < PROMOTION_QUALIFICATION.minEstimatedWaterTempF
  ) {
    return { run: false, reason: 'water_too_cold' };
  }

  return { run: true, reason: 'ok' };
};

// Back-compat alias — old callers still import shouldBoostRun.
export const shouldBoostRun = shouldPromotionRun;

/**
 * Merge promoted listings into a primary search result set.
 *
 * Ranking: since there are no tiers anymore, ranking inside the Sponsored
 * band is driven by (a) server-side relevance (already applied by Sharetribe
 * query) and (b) a small random jitter to prevent permanent ordering that
 * favors early adopters. In the future, ranking can factor in historical
 * CTR or the host's attribution history — but NOT the ad rate (it's fixed).
 *
 * Returns { sponsored, standard, all }.
 */
export const mergeBoostedResults = ({ primary = [], boosted = [], maxSponsored = 6 }) => {
  const boostedIds = new Set();

  const ranked = [...boosted]
    .map(l => ({ listing: l, jitter: Math.random() }))
    .sort((a, b) => a.jitter - b.jitter)
    .slice(0, maxSponsored)
    .map(x => {
      boostedIds.add(x.listing.id?.uuid || x.listing.id);
      return x.listing;
    });

  const standard = primary.filter(l => {
    const id = l.id?.uuid || l.id;
    return !boostedIds.has(id);
  });

  return {
    sponsored: ranked,
    standard,
    all: [...ranked, ...standard],
  };
};

/**
 * Summarize promotion performance for the host dashboard.
 * Returns { impressions, clicks, ctr, attributedBookings,
 *           attributedRevenueCents, platformAdChargeCents, netPayoutCents }.
 *
 * `netPayoutCents` = gross attributed revenue − 25% ad charge.
 * This is what the host actually keeps from promoted bookings.
 */
export const computePromotionStats = listing => {
  const promo = listing?.attributes?.publicData?.promotion;
  if (!promo) return null;

  const stats = promo.stats || {};
  const impressions = stats.impressions || 0;
  const clicks = stats.clicks || 0;
  const attributedBookings = stats.attributedBookings || 0;
  const attributedRevenueCents = stats.attributedRevenueCents || 0;
  const platformAdChargeCents =
    stats.platformAdChargeCents ||
    Math.round(attributedRevenueCents * PROMOTION_AD_RATE);
  const netPayoutCents = attributedRevenueCents - platformAdChargeCents;

  return {
    impressions,
    clicks,
    ctr: impressions > 0 ? clicks / impressions : 0,
    attributedBookings,
    attributedRevenueCents,
    platformAdChargeCents,
    netPayoutCents,
  };
};

// Back-compat alias — old callers still import computeBoostROI.
export const computeBoostROI = computePromotionStats;

/**
 * Format a price in cents to "$XX" display.
 */
export const formatPriceCents = cents => {
  if (cents == null) return '—';
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars.toFixed(0)}` : `$${dollars.toFixed(2)}`;
};

// Re-export so components don't need to pull from two places.
export { formatAdCharge, PROMOTION_AD_RATE };
