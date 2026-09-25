/**
 * Duration-tiered hourly rates (e.g. "Per hour" $90, "3+ hours" $75).
 *
 * A variant's minimum duration is its explicit numeric `minHours`, else a
 * leading "N+ hour(s)" in its name. Guest-count tiers ("1-10 guests") carry
 * neither, so a listing without any duration tier is left exactly as before.
 *
 * The server picks the tier from the booked duration — the guest's selected
 * tier name is never trusted for price: the eligible variant with the highest
 * minimum wins, and a tier whose minimum the booking does not reach is never
 * used.
 */
const NAME_MIN_RE = /^\s*(\d+(?:\.\d+)?)\s*\+\s*(?:hours?|hrs?|h)\b/i;

const variantMinHours = (pv) => {
  if (!pv) return null;
  const raw = typeof pv.minHours === 'string' ? parseFloat(pv.minHours) : pv.minHours;
  if (Number.isFinite(raw) && raw > 0) return raw;
  const m = typeof pv.name === 'string' ? pv.name.match(NAME_MIN_RE) : null;
  return m ? parseFloat(m[1]) : null;
};

const validPrice = (pv) => pv && Number.isInteger(pv.priceInSubunits) && pv.priceInSubunits >= 0;

const hasDurationTiers = (priceVariants) =>
  Array.isArray(priceVariants) && priceVariants.some((pv) => variantMinHours(pv) != null);

/**
 * @returns {{ variant: Object|null, minHours: number }} the tier to charge;
 *   variant null means no tier applies and the listing's base price is used.
 */
const selectDurationTier = (priceVariants, hours, chosenName) => {
  const eligible = (priceVariants || [])
    .filter(validPrice)
    .map((pv) => ({ variant: pv, minHours: variantMinHours(pv) || 0 }))
    .filter((t) => Number.isFinite(hours) && hours >= t.minHours);
  if (!eligible.length) return { variant: null, minHours: 0 };
  const top = Math.max(...eligible.map((t) => t.minHours));
  const best = eligible.filter((t) => t.minHours === top);
  return best.find((t) => t.variant.name === chosenName) || best[0];
};

module.exports = { variantMinHours, hasDurationTiers, selectDurationTier };
