/**
 * Guest-band enforcement for priced bookings.
 *
 * CJS mirror of the band readers in src/util/priceVariantGuests.js - the
 * client is ESM under vite, this side is CommonJS under bun, and the three
 * pure functions here are small enough that sharing a file across that
 * boundary buys less than it costs. IF ONE SIDE CHANGES, CHANGE BOTH.
 *
 * Only STRUCTURED minGuests/maxGuests are read. Variant names are never
 * parsed here - names carry weekday/weekend, promos and packages on live
 * listings, and money must not depend on a regex.
 */

const toPositiveInt = (value) => {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const getVariantGuestBand = (variant) => {
  const min = toPositiveInt(variant && variant.minGuests);
  const max = toPositiveInt(variant && variant.maxGuests);
  if (!min || !max || min > max) {
    return null;
  }
  return { minGuests: min, maxGuests: max };
};

const hasCompleteGuestBands = (priceVariants) => {
  const variants = Array.isArray(priceVariants) ? priceVariants : [];
  return variants.length > 0 && variants.every((v) => !!getVariantGuestBand(v));
};

const selectVariantForGuestCount = (priceVariants, guestCount) => {
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
  return {
    variant: null,
    reason: matches.length ? 'ambiguous-overlapping-tiers' : 'no-tier-covers-count',
  };
};

/**
 * The checkout invariant: on a listing whose variants all carry guest bands,
 * a stated party size must land in the tier being paid for. Hosts price
 * bigger groups higher, so "12 guests on the 1-5 tier" is exactly the case
 * this exists to reject.
 *
 * Deliberately narrow. It only fires when the listing has complete bands AND
 * the order states both a party size and a tier - clients that send neither
 * (the mobile app, legacy sessions mid-checkout) are untouched. It never
 * *chooses* a price; it only refuses a contradiction.
 *
 * @param {Object} listing denormalised listing (attributes.publicData)
 * @param {Object} params bodyParams.params of the initiate/transition call
 * @returns {string|null} an error message to 400 with, or null when fine
 */
const partySizeTierConflict = (listing, params) => {
  const publicData = (listing && listing.attributes && listing.attributes.publicData) || {};
  const { priceVariants } = publicData;
  if (!hasCompleteGuestBands(priceVariants)) {
    return null;
  }
  const partySize = toPositiveInt(params && params.protectedData && params.protectedData.partySize);
  const chosenName = params && params.priceVariantName;
  if (!partySize || !chosenName) {
    return null;
  }
  const chosen = (priceVariants || []).find((v) => v && v.name === chosenName);
  if (!chosen) {
    return null; // unknown tier fails later in pricing, with a better error
  }
  const band = getVariantGuestBand(chosen);
  if (partySize >= band.minGuests && partySize <= band.maxGuests) {
    return null;
  }
  const resolved = selectVariantForGuestCount(priceVariants, partySize);
  const suggestion = resolved.variant
    ? ` For ${partySize} guests the rate is "${resolved.variant.name}".`
    : '';
  return (
    `The selected rate "${chosenName}" covers ${band.minGuests}-${band.maxGuests} guests, ` +
    `but the booking is for ${partySize}.${suggestion}`
  );
};

module.exports = {
  getVariantGuestBand,
  hasCompleteGuestBands,
  selectVariantForGuestCount,
  partySizeTierConflict,
};
