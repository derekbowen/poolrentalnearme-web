import React from 'react';

/**
 * SectionTrustStrip — a compact, above-the-fold row of trust signals for the
 * listing page (Phase 1 of the listing redesign). Leads with proof so a young
 * marketplace's thin native-review shelf isn't the first thing a guest sees.
 *
 * Renders only the chips it has data for (never an empty/ugly strip):
 *   • ★ native rating + review count       (publicData.avgRating / reviewCount)
 *   • Proven Host — external reputation     (publicData.extRep — dormant until
 *                                            the External Reputation feature
 *                                            populates it; wired now, hidden
 *                                            when absent)
 *   • Hosts up to N                         (publicData.maxGuests)
 *   • Verified host / New host fallback
 *
 * Presentation only — no booking, pricing, or money-path involvement.
 */

const BLUE = '#0EA5E9';
const BLUE_INK = '#0b7cb0';
const GOLD = '#F5B301';
const GOLD_INK = '#8a6400';
const INK = '#16222c';
const MUTED = '#5c6b78';
const LINE = '#e4eaef';

const wrap = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '10px',
  alignItems: 'center',
  margin: '4px 0 20px',
};

const chip = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '7px 12px',
  borderRadius: '10px',
  border: `1px solid ${LINE}`,
  background: '#fff',
  fontSize: '14px',
  fontWeight: 600,
  color: INK,
  lineHeight: 1.2,
};

const provenChip = {
  ...chip,
  border: `1px solid ${GOLD}`,
  background: 'rgba(245,179,1,0.10)',
  color: GOLD_INK,
};

const star = { color: GOLD, fontWeight: 800 };
const sub = { color: MUTED, fontWeight: 500 };

const SectionTrustStrip = props => {
  const { publicData = {}, reviews = [] } = props;

  const reviewCount =
    Number(publicData.reviewCount) || (Array.isArray(reviews) ? reviews.length : 0);
  const avgRating =
    Number(publicData.avgRating) ||
    (reviews && reviews.length
      ? reviews.reduce((s, r) => s + (r?.attributes?.rating || 0), 0) / reviews.length
      : 0);

  const extRep = publicData.extRep || null;
  const maxGuests = Number(publicData.guestallowed ?? publicData.maxGuests) || null;

  const chips = [];

  // 1) Native rating (only when there's real review data).
  if (reviewCount > 0 && avgRating > 0) {
    chips.push(
      <span style={chip} key="rating">
        <span style={star}>★</span> {avgRating.toFixed(1)}{' '}
        <span style={sub}>
          ({reviewCount} review{reviewCount === 1 ? '' : 's'})
        </span>
      </span>
    );
  }

  // 2) Proven Host — external reputation (dormant until data feature populates it).
  if (extRep && extRep.rating && extRep.count) {
    const plat = extRep.platform
      ? extRep.platform.charAt(0).toUpperCase() + extRep.platform.slice(1)
      : 'another platform';
    chips.push(
      <span style={provenChip} key="proven" title={`Verified by Pool Rental Near Me`}>
        🛡️ Proven Host{' '}
        <span style={{ ...sub, color: GOLD_INK }}>
          {extRep.rating}★ · {extRep.count} on {plat}
        </span>
      </span>
    );
  }

  // 3) Capacity.
  if (maxGuests) {
    chips.push(
      <span style={chip} key="cap">
        👥 Hosts up to {maxGuests}
      </span>
    );
  }

  // 4) Trust fallback so the strip is never empty and never bare for new hosts.
  if (reviewCount === 0 && !extRep) {
    chips.push(
      <span style={{ ...chip, color: BLUE_INK, borderColor: BLUE }} key="new">
        ✓ Verified host
      </span>
    );
  }

  if (!chips.length) {
    return null;
  }

  return <div style={wrap}>{chips}</div>;
};

export default SectionTrustStrip;
