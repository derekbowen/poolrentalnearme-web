import React, { useState } from 'react';

import {
  PROMOTION_AD_RATE_LABEL,
  formatAdCharge,
} from '../../config/boostConfig';
import {
  isPromotionActive,
  computePromotionStats,
  formatPriceCents,
} from '../../util/listingBoost';

import css from './BoostListingCard.module.css';

/**
 * BoostListingCard
 * ────────────────
 * Host-facing promotion panel for a single listing. One toggle, one number.
 *
 * THE ENTIRE UI IS THREE ELEMENTS:
 *   1. Status (ON or OFF)
 *   2. One sentence of plain English: "You pay 25% of a booking only when
 *      a guest books after clicking your promoted listing."
 *   3. A toggle button.
 *
 * When active, a compact performance summary shows: attributed bookings,
 * gross revenue from promoted bookings, platform ad charge, net payout.
 *
 * Deliberately MISSING from this component:
 *   - Tier selection (no tiers)
 *   - Price anchoring / comparison
 *   - Expected-bookings copy
 *   - Refund guarantee language
 *   - ROI calculator
 *   - Feature bullet lists
 *   - "Why this is worth it" framing
 * The eBay promoted-listings philosophy: don't explain, don't promise,
 * just take a cut when it converts. See src/config/boostConfig.js for
 * the full reasoning.
 */
const BoostListingCard = ({ listing, onChange }) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const active = isPromotionActive(listing);
  const stats = active ? computePromotionStats(listing) : null;

  const toggle = async nextEnabled => {
    setSubmitting(true);
    setError(null);
    try {
      const listingId = listing.id?.uuid || listing.id;
      const res = await fetch('/api/boost/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId, enabled: nextEnabled }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed (${res.status})`);
      }
      const data = await res.json();
      if (onChange) onChange(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ACTIVE STATE — single-row toggle + compact performance summary.
  if (active) {
    const grossCharge = formatAdCharge(stats?.attributedRevenueCents || 0);
    return (
      <div className={css.root}>
        <div className={css.activeHeader}>
          <div>
            <div className={css.activeEyebrow}>Promotion</div>
            <div className={css.activeTitle}>Active</div>
          </div>
          <button
            type="button"
            className={css.toggleOff}
            onClick={() => toggle(false)}
            disabled={submitting}
          >
            {submitting ? 'Turning off…' : 'Turn off'}
          </button>
        </div>

        <div className={css.statGrid}>
          <div className={css.statBox}>
            <div className={css.statValue}>{stats?.attributedBookings ?? 0}</div>
            <div className={css.statLabel}>Attributed bookings</div>
          </div>
          <div className={css.statBox}>
            <div className={css.statValue}>
              {formatPriceCents(stats?.attributedRevenueCents ?? 0)}
            </div>
            <div className={css.statLabel}>Gross from promoted bookings</div>
          </div>
          <div className={css.statBox}>
            <div className={css.statValue}>
              {formatPriceCents(stats?.platformAdChargeCents ?? 0)}
            </div>
            <div className={css.statLabel}>Platform ad charge</div>
          </div>
          <div className={css.statBox}>
            <div className={css.statValue}>
              {formatPriceCents(stats?.netPayoutCents ?? 0)}
            </div>
            <div className={css.statLabel}>Your net payout</div>
          </div>
        </div>

        {error ? <div className={css.errorBanner}>{error}</div> : null}

        <div className={css.activeFooter}>
          {PROMOTION_AD_RATE_LABEL} of the booking subtotal. No up-front fee.
          Pauses automatically when you're fully booked or the water's too
          cold to swim.
        </div>
      </div>
    );
  }

  // IDLE STATE — one sentence, one button.
  return (
    <div className={css.root}>
      <div className={css.header}>
        <div className={css.eyebrow}>Promotion</div>
        <h3 className={css.title}>Promote this listing</h3>
        <p className={css.lede}>
          Pay {PROMOTION_AD_RATE_LABEL} of the booking subtotal — only when a
          guest books after clicking your promoted listing. Nothing up front.
        </p>
      </div>

      {error ? <div className={css.errorBanner}>{error}</div> : null}

      <div className={css.ctaRow}>
        <button
          type="button"
          className={css.primaryCta}
          onClick={() => toggle(true)}
          disabled={submitting}
        >
          {submitting ? 'Turning on…' : 'Turn on promotion'}
        </button>
      </div>

      <div className={css.finePrint}>
        Pauses automatically when you're fully booked, during bad weather, or
        when the water is too cold to swim.
      </div>
    </div>
  );
};

export default BoostListingCard;
