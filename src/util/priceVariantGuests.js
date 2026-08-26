/**
 * Guest-count bands on price variants.
 *
 * Hosts price by group size - "1-5 Guests" costs less than "21-30 Guests" - but
 * a Sharetribe priceVariant only ever carried `name` and `priceInSubunits`, so
 * the band existed solely as free text. That left the guest picking a tier by
 * reading it, and left us unable to check that the tier matched the group that
 * actually showed up.
 *
 * This module adds `minGuests`/`maxGuests` to the variant and derives the tier
 * from a guest count instead.
 *
 * THE SAFETY LINE, and it is deliberate:
 *
 *   parseGuestBand() reads a band out of a NAME. It is for the backfill tool
 *   and for host-facing suggestions ONLY. It must never price a booking.
 *
 *   getVariantGuestBand() reads STRUCTURED minGuests/maxGuests and nothing else.
 *   That is the only function the order panel and the server may use.
 *
 * The reason is that variant names are not one axis. Across the 117 published
 * listings hosts have encoded weekday/weekend ("Weekday (M-Th) 1-10 people"),
 * promos ("21 to 30 guests weekday pricing Promo 30%!"), occasion packages
 * ("Date night (2 guests)") and add-ons ("spa heating") in the same field. A
 * conservative parser resolves only 30 of the 62 multi-variant listings
 * cleanly. 82% of variants is fine for suggesting; it is not fine for money.
 */

// Words hosts actually use for "guest" on this marketplace.
const GUEST_WORD = '(?:guests?|ppl|people|persons?|pax|pp)';
// "1-5 Guests", "16 to 20 guests", "11-15 pp"
const RANGE_RE = new RegExp(`(\\d{1,3})\\s*(?:-|to|–|—)\\s*(\\d{1,3})\\s*${GUEST_WORD}`, 'i');
// "Up to 30 guests", "max 10 people"
const UPTO_RE = new RegExp(`(?:up\\s*to|max(?:imum)?)\\s*(\\d{1,3})\\s*${GUEST_WORD}`, 'i');
// "5 people or less" - an upper bound phrased backwards. Must be tried before
// SINGLE_RE, which would read it as exactly 5 and lock out parties of 1-4.
const OR_LESS_RE = new RegExp(`(\\d{1,3})\\s*${GUEST_WORD}\\s*or\\s*(?:less|fewer)`, 'i');
// "Date night (2 guests)" - an exact size, not a band.
const SINGLE_RE = new RegExp(`(?:^|[^\\d])(\\d{1,3})\\s*${GUEST_WORD}`, 'i');

const toPositiveInt = (value) => {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * Best-effort read of a guest band from a variant NAME.
 * Backfill and host suggestions only - never pricing. See the safety line above.
 *
 * @param {string} name variant name
 * @returns {{minGuests: number, maxGuests: number, source: string}|null}
 */
export const parseGuestBand = (name) => {
  const str = String(name || '');
  if (!str.trim()) {
    return null;
  }

  const range = str.match(RANGE_RE);
  if (range) {
    const min = toPositiveInt(range[1]);
    const max = toPositiveInt(range[2]);
    // "70-51pp" is a typo, not a band. Refuse rather than silently reorder.
    return min && max && min <= max ? { minGuests: min, maxGuests: max, source: 'range' } : null;
  }

  const upto = str.match(UPTO_RE);
  if (upto) {
    const max = toPositiveInt(upto[1]);
    return max ? { minGuests: 1, maxGuests: max, source: 'upto' } : null;
  }

  const orLess = str.match(OR_LESS_RE);
  if (orLess) {
    const max = toPositiveInt(orLess[1]);
    return max ? { minGuests: 1, maxGuests: max, source: 'upto' } : null;
  }

  const single = str.match(SINGLE_RE);
  if (single) {
    const n = toPositiveInt(single[1]);
    return n ? { minGuests: n, maxGuests: n, source: 'single' } : null;
  }

  return null;
};

/**
 * Structured band on a variant. The ONLY band reader allowed near pricing.
 *
 * @param {Object} variant a priceVariant
 * @returns {{minGuests: number, maxGuests: number}|null}
 */
export const getVariantGuestBand = (variant) => {
  const min = toPositiveInt(variant?.minGuests);
  const max = toPositiveInt(variant?.maxGuests);
  if (!min || !max || min > max) {
    return null;
  }
  return { minGuests: min, maxGuests: max };
};

/**
 * True only when EVERY variant carries a usable structured band, so a guest
 * count can be resolved to exactly one price. Partial coverage is treated as no
 * coverage - a half-banded listing must keep the plain tier picker.
 *
 * @param {Array} priceVariants
 * @returns {boolean}
 */
export const hasCompleteGuestBands = (priceVariants) => {
  const variants = Array.isArray(priceVariants) ? priceVariants : [];
  return variants.length > 0 && variants.every((v) => !!getVariantGuestBand(v));
};

/**
 * Resolve a guest count to exactly one variant.
 *
 * Fails closed: an ambiguous count (overlapping bands, e.g. "51-70pp" and
 * "70-85pp" both claiming 70) resolves to nothing rather than guessing which
 * price the guest should pay.
 *
 * @param {Array} priceVariants
 * @param {number} guestCount
 * @returns {{variant: Object|null, reason: string}}
 */
export const selectVariantForGuestCount = (priceVariants, guestCount) => {
  const count = toPositiveInt(guestCount);
  if (!count) {
    return { variant: null, reason: 'no-guest-count' };
  }
  const variants = Array.isArray(priceVariants) ? priceVariants : [];
  const matches = variants.filter((v) => {
    const band = getVariantGuestBand(v);
    return band && count >= band.minGuests && count <= band.maxGuests;
  });

  if (matches.length === 1) {
    return { variant: matches[0], reason: 'ok' };
  }
  if (matches.length === 0) {
    return { variant: null, reason: 'no-tier-covers-count' };
  }
  return { variant: null, reason: 'ambiguous-overlapping-tiers' };
};

/**
 * The largest group any tier is priced for. This - not the listing's
 * `guestallowed` - is the real ceiling, because several listings allow more
 * guests than they price for (Manasseh Paradise prices to 30 but allows 85).
 *
 * @param {Array} priceVariants
 * @returns {number|null}
 */
export const getMaxPricedGuests = (priceVariants) => {
  const bands = (Array.isArray(priceVariants) ? priceVariants : [])
    .map(getVariantGuestBand)
    .filter(Boolean);
  return bands.length ? Math.max(...bands.map((b) => b.maxGuests)) : null;
};

/**
 * Listing-health check over a set of banded variants.
 *
 * `nonMonotonicPrice` encodes the rule of this marketplace: a bigger group
 * costs more. A larger band priced at or below a smaller one is either a bad
 * parse or a host mistake, and in both cases must not be auto-applied.
 *
 * @param {Array} priceVariants
 * @param {number} [guestAllowed] listing capacity, to catch tiers that stop short
 * @returns {{issues: Array<{type: string, detail: string}>, bands: Array}}
 */
export const validateGuestBands = (priceVariants, guestAllowed) => {
  const issues = [];
  const variants = Array.isArray(priceVariants) ? priceVariants : [];

  const bands = variants
    .map((v) => {
      const band = getVariantGuestBand(v);
      return band ? { ...band, name: v.name, priceInSubunits: v.priceInSubunits } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.minGuests - b.minGuests || a.maxGuests - b.maxGuests);

  if (bands.length !== variants.length) {
    issues.push({
      type: 'incompleteBands',
      detail: `${variants.length - bands.length} of ${variants.length} variants have no guest band`,
    });
  }

  for (let i = 1; i < bands.length; i++) {
    const prev = bands[i - 1];
    const curr = bands[i];
    if (curr.minGuests <= prev.maxGuests) {
      issues.push({
        type: 'overlap',
        detail: `"${prev.name}" and "${curr.name}" both cover ${curr.minGuests}`,
      });
    } else if (curr.minGuests > prev.maxGuests + 1) {
      issues.push({
        type: 'gap',
        detail: `no tier covers ${prev.maxGuests + 1}-${curr.minGuests - 1} (between "${
          prev.name
        }" and "${curr.name}")`,
      });
    }
    const prevPrice = Number(prev.priceInSubunits);
    const currPrice = Number(curr.priceInSubunits);
    if (Number.isFinite(prevPrice) && Number.isFinite(currPrice) && currPrice <= prevPrice) {
      issues.push({
        type: 'nonMonotonicPrice',
        detail: `"${curr.name}" takes more guests than "${prev.name}" but does not cost more`,
      });
    }
  }

  const capacity = toPositiveInt(guestAllowed);
  const topPriced = bands.length ? Math.max(...bands.map((b) => b.maxGuests)) : null;
  if (capacity && topPriced && topPriced < capacity) {
    issues.push({
      type: 'capacityMismatch',
      detail: `listing allows ${capacity} guests but tiers stop at ${topPriced}`,
    });
  }

  return { issues, bands };
};
