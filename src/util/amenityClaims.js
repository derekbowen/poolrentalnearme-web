/**
 * Which "Why you'll love it" cards a listing may show publicly.
 *
 * A listing carries two checkbox groups that overlap:
 *   poolAmenities        the host's factual amenity checklist ("heated", "hot_tub")
 *   advantagesSelection  a marketing highlight picker ("heated-pool")
 *
 * The listing page used to render advantagesSelection as fact. On 2026-09-22,
 * 93 of 125 published listings displayed "Heated pool" while only 46 hosts had
 * ticked `heated` in their own amenity list. A host with a hot tub and an
 * unheated pool (Backyard Oasis CT) reported it.
 *
 * Rule: poolAmenities is authoritative. A highlight renders only when it names
 * an objective feature AND the host selected that EXACT feature in
 * poolAmenities. No equivalence is inferred:
 *   - `hot_tub` does not imply `heated-pool` (hot tub water is heated; the pool
 *     need not be)
 *   - `hot_tub` does not imply `spa-and-sauna-nearby`
 *   - a free-text poolAmenities label ("Heated indoor pool") is not the
 *     `heated` key and does not count
 *
 * Highlights with no exact factual counterpart (shade, fire pit, private
 * access, views, dining, eco filtration, cleaning, lifeguard, spa & sauna) are
 * suppressed: nothing in the host's structured data can confirm them. They stay
 * stored on the listing; they are simply not asserted.
 *
 * Host data is never modified by this module.
 */

// advantage slug -> the one poolAmenities key that must be present, verbatim.
export const ADVANTAGE_FACT_KEYS = Object.freeze({
  'heated-pool': 'heated',
  'night-lighting': 'evening_lights',
  'diving-board': 'diving_board',
  'water-slide': 'slide',
  'music-system': 'sound_system',
});

/**
 * Advantage slugs that may be shown for this listing, in the host's order,
 * de-duplicated. Anything uncorroborated is dropped.
 *
 * @param {Object} publicData listing publicData
 * @returns {string[]}
 */
export const corroboratedAdvantages = publicData => {
  const selected = Array.isArray(publicData?.advantagesSelection)
    ? publicData.advantagesSelection
    : [];
  const facts = new Set(
    (Array.isArray(publicData?.poolAmenities) ? publicData.poolAmenities : []).filter(
      v => typeof v === 'string'
    )
  );
  const out = [];
  selected.forEach(slug => {
    const key = ADVANTAGE_FACT_KEYS[slug];
    if (key && facts.has(key) && !out.includes(slug)) {
      out.push(slug);
    }
  });
  return out;
};
