/**
 * Promotion (Marketplace Ads) Configuration
 * ─────────────────────────────────────────
 * PRNM's paid placement system — modeled after eBay Promoted Listings.
 *
 * THE CORE MECHANIC:
 *   Hosts toggle "Promote this listing" ON. They pay NOTHING up front.
 *   When a guest books a promoted listing within 14 days of clicking it
 *   from a Sponsored slot, the host owes PRNM 25% of the booking subtotal.
 *   That's it. No tiers. No slider. No refund calc. No expected-bookings
 *   copy. No ROI calculator.
 *
 * Why this is better than flat-fee tiers:
 *   1. Zero activation friction — host cannot say "I paid $X and got nothing"
 *   2. Platform margin scales with host success — pure alignment
 *   3. Sponsored band auto-sorts by rate × relevance, so competition lifts
 *      rates over time without PRNM lifting a finger
 *   4. No refund exposure — host only pays on real bookings
 *   5. Opacity is a feature — the less we explain, the more they bid
 *
 * Two placement axes in search results:
 *   1. SPONSORED (paid)  — this file / the Promote product
 *   2. TRUSTED (earned)  — Host Academy certification tiers (hostAcademy.js)
 *
 * Guests must never confuse the two. FeaturedBadge ("Promoted") and
 * CertificationBadge ("PRNM Master") look visually distinct on purpose.
 */

// ─── Ad rate ────────────────────────────────────────────
// Single fixed rate — 25% of booking subtotal on attributed bookings.
// No slider. No override. No tiers. This is deliberate.
//
// Why 25%:
//   Pool hosts gross $150–$350 per booking at ~70% margin. A 25% ad take
//   on an attributed booking still leaves the host with a substantial
//   profit on a booking they wouldn't otherwise have had. And 25% × $250
//   = $62.50 to PRNM — which is a larger margin than any flat-fee tier
//   we previously considered.
//
// Constant export (not a config object) because it should not vary per
// listing, per host, or per geo. If we ever need to A/B test it, change
// it here — not in the UI.
export const PROMOTION_AD_RATE = 0.25;

// Display string for UI consumers. Never format this inline — always
// import to guarantee consistency between host-facing surfaces.
export const PROMOTION_AD_RATE_LABEL = '25%';

// ─── Attribution ────────────────────────────────────────
// Click-to-book attribution window. When a guest clicks a promoted listing
// and books within this window, the booking is attributed and the host
// owes the ad rate. 14 days is eBay's default and matches user booking
// intent for weekend pool rentals (search Monday, decide Thursday, book
// the following Tuesday is common).
export const ATTRIBUTION_WINDOW_DAYS = 14;

// Cookie name used on promoted-listing clicks. Set by SponsoredResultsBar
// on click, read at booking time by server/api/boost/attribute.js.
export const ATTRIBUTION_COOKIE = 'prnm_promo_click';

// Attribution source taxonomy — used for reporting, not for logic.
// The source key is stored on transaction.protectedData.promoClick.source
// when a promoted booking is attributed.
export const ATTRIBUTION_SOURCES = {
  sponsored_internal: 'PRNM Sponsored Band',
  google_ads: 'Google Ads (pooled)',
  meta_ads: 'Meta Ads (pooled)',
  bing_ads: 'Bing Ads (pooled)',
  organic: 'Organic search',
  direct: 'Direct',
};

// ─── Qualification rules ────────────────────────────────
// A promotion only SERVES (renders in Sponsored band) when these hold.
// This is where we stop the host from burning opportunity cost on
// unbookable moments — because even though they don't pay until a booking
// happens, clicks on unbookable listings hurt our overall conversion rate
// and train Google/Meta's Smart Bidding on noise.
export const PROMOTION_QUALIFICATION = {
  // Minimum open availability in the next 7 days for a promotion to be
  // active. If the pool is fully booked, pause serving — we don't want
  // Sponsored slots showing fully-booked listings.
  minOpenDaysNext7: 2,

  // Listing must have at least this many photos. Weak creative hurts
  // the whole Sponsored band's conversion rate.
  minPhotos: 3,

  // Air temp threshold for weather-based pausing.
  // The water temp estimator (server/services/waterTempEstimator.js) runs
  // alongside this for a more nuanced check — this is just the simple floor.
  minForecastHighF: 72,

  // Water temp threshold. If the AI estimator says the pool is below this,
  // promotion auto-pauses — a cold pool won't convert clicks to bookings.
  minEstimatedWaterTempF: 74,

  // Listing must be in this state to serve.
  requireState: 'published',
};

// ─── Display helpers ────────────────────────────────────
// A simple helper so the UI can format "N% of $X = $Y" without passing
// the rate through a hundred components.
export const formatAdCharge = (bookingSubtotalCents = 0) => {
  const chargeCents = Math.round(bookingSubtotalCents * PROMOTION_AD_RATE);
  return {
    chargeCents,
    chargeDollars: (chargeCents / 100).toFixed(2),
    rateLabel: PROMOTION_AD_RATE_LABEL,
  };
};

// ─── External ad pool (Phase 1b) ────────────────────────
// When a listing has promotion ON and we detect high intent (guest
// searching city + pool rental keywords from outside PRNM), the external
// ad pool routes paid traffic to that listing from Google/Bing/Meta.
//
// The host still only pays PRNM the 25% ad rate on booked outcomes —
// PRNM fronts the external ad spend and recovers it from the margin.
// This is only viable because the ad rate is high enough to absorb
// external CPC costs; at a 5% rate it would be break-even at best.
export const EXTERNAL_AD_POOL = {
  googleAds: {
    enabled: !!process.env.GOOGLE_ADS_CUSTOMER_ID,
    customerId: process.env.GOOGLE_ADS_CUSTOMER_ID || null,
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || null,
    targetCpaCents: 800, // $8 per booking — Smart Bidding will not exceed
    campaignType: 'PERFORMANCE_MAX',
    keywordTemplates: [
      'pool rental {city}',
      'rent a pool {city}',
      'rent a pool near me',
      'swim for a day {city}',
      'backyard pool rental {city}',
      'private pool rental {city}',
      'hourly pool rental {city}',
    ],
  },
  metaAds: {
    enabled: !!process.env.META_AD_ACCOUNT_ID,
    accountId: process.env.META_AD_ACCOUNT_ID || null,
    accessToken: process.env.META_ACCESS_TOKEN || null,
    targetCpaCents: 700,
    objective: 'OUTCOME_LEADS',
  },
  bingAds: {
    enabled: !!process.env.BING_ADS_CUSTOMER_ID,
    customerId: process.env.BING_ADS_CUSTOMER_ID || null,
    targetCpaCents: 500, // Bing is cheaper per click
  },
};

// ─── Feature flags ──────────────────────────────────────
export const PROMOTION_ENABLED = true;
export const PROMOTION_EXTERNAL_ADS_ENABLED = false; // flip when creds exist

// ─── Back-compat aliases ────────────────────────────────
// Some older code still imports BOOST_ENABLED / BOOST_TIERS. Rather than
// rip those out in every caller right now, alias them here. The BOOST_TIERS
// alias is `null` on purpose — any caller that still reads tiers will
// crash loudly in dev, which is what we want so we catch stragglers.
export const BOOST_ENABLED = PROMOTION_ENABLED;
export const BOOST_TIERS = null;
