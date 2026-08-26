import {
  parseGuestBand,
  getVariantGuestBand,
  hasCompleteGuestBands,
  selectVariantForGuestCount,
  getMaxPricedGuests,
  validateGuestBands,
} from './priceVariantGuests';

// Names below are real variant names from published listings (2026-08-26 audit).

describe('parseGuestBand (backfill/suggestion only - never pricing)', () => {
  it('parses plain ranges in the wordings hosts actually use', () => {
    expect(parseGuestBand('1-5 Guests')).toEqual({ minGuests: 1, maxGuests: 5, source: 'range' });
    expect(parseGuestBand('16 to 20 guests')).toEqual({
      minGuests: 16,
      maxGuests: 20,
      source: 'range',
    });
    expect(parseGuestBand('11-15 pp')).toEqual({ minGuests: 11, maxGuests: 15, source: 'range' });
    expect(parseGuestBand('86-100pp')).toEqual({ minGuests: 86, maxGuests: 100, source: 'range' });
    expect(parseGuestBand('6-10 persons')).toEqual({
      minGuests: 6,
      maxGuests: 10,
      source: 'range',
    });
  });

  it('parses "N or less" as an upper bound, not an exact size', () => {
    // "Rate for 5 people or less" once parsed as exactly 5-5, which would have
    // made parties of 1-4 unbookable on a live listing.
    expect(parseGuestBand('Rate for 5 people or less')).toEqual({
      minGuests: 1,
      maxGuests: 5,
      source: 'upto',
    });
    expect(parseGuestBand('10 guests or fewer')).toEqual({
      minGuests: 1,
      maxGuests: 10,
      source: 'upto',
    });
  });

  it('parses "up to" and exact-size names', () => {
    expect(parseGuestBand('Up to 30 guests')).toEqual({
      minGuests: 1,
      maxGuests: 30,
      source: 'upto',
    });
    expect(parseGuestBand('Date night (2 guests)')).toEqual({
      minGuests: 2,
      maxGuests: 2,
      source: 'single',
    });
  });

  it('refuses names that are not a single guest band', () => {
    // Real names that carry other axes or no band at all.
    expect(parseGuestBand('Per hour')).toBeNull();
    expect(parseGuestBand('Weekend Premium')).toBeNull();
    expect(parseGuestBand('spa heating')).toBeNull();
    expect(parseGuestBand('Weekday Rate')).toBeNull();
    expect(parseGuestBand('21+ guests')).toBeNull(); // open-ended: host must set the cap
    expect(parseGuestBand('16 to 20')).toBeNull(); // no guest word: could be hours
    expect(parseGuestBand('')).toBeNull();
    expect(parseGuestBand(null)).toBeNull();
  });

  it('refuses inverted ranges rather than reordering a typo', () => {
    expect(parseGuestBand('70-51 people')).toBeNull();
  });
});

describe('getVariantGuestBand (the only reader allowed near pricing)', () => {
  it('reads structured bounds and ignores the name entirely', () => {
    expect(getVariantGuestBand({ name: 'whatever', minGuests: 6, maxGuests: 10 })).toEqual({
      minGuests: 6,
      maxGuests: 10,
    });
    // A parseable name without structured bounds is NOT a band.
    expect(getVariantGuestBand({ name: '1-5 Guests', priceInSubunits: 8500 })).toBeNull();
  });

  it('rejects malformed bounds', () => {
    expect(getVariantGuestBand({ minGuests: 10, maxGuests: 5 })).toBeNull();
    expect(getVariantGuestBand({ minGuests: 0, maxGuests: 5 })).toBeNull();
    expect(getVariantGuestBand({ minGuests: 'a', maxGuests: 5 })).toBeNull();
    expect(getVariantGuestBand(null)).toBeNull();
  });
});

describe('hasCompleteGuestBands', () => {
  const banded = { minGuests: 1, maxGuests: 5, priceInSubunits: 3000 };
  it('requires every variant to be banded - partial coverage is no coverage', () => {
    expect(hasCompleteGuestBands([banded, { minGuests: 6, maxGuests: 10 }])).toBe(true);
    expect(hasCompleteGuestBands([banded, { name: '6-10 guests' }])).toBe(false);
    expect(hasCompleteGuestBands([])).toBe(false);
    expect(hasCompleteGuestBands(undefined)).toBe(false);
  });
});

describe('selectVariantForGuestCount', () => {
  const tiers = [
    { name: '1-5 guests', minGuests: 1, maxGuests: 5, priceInSubunits: 20000 },
    { name: '6-10 guests', minGuests: 6, maxGuests: 10, priceInSubunits: 25000 },
    { name: '11-15 guests', minGuests: 11, maxGuests: 15, priceInSubunits: 30000 },
  ];

  it('resolves a count to exactly one tier, including boundaries', () => {
    expect(selectVariantForGuestCount(tiers, 1).variant.name).toBe('1-5 guests');
    expect(selectVariantForGuestCount(tiers, 5).variant.name).toBe('1-5 guests');
    expect(selectVariantForGuestCount(tiers, 6).variant.name).toBe('6-10 guests');
    expect(selectVariantForGuestCount(tiers, 15).variant.name).toBe('11-15 guests');
  });

  it('fails closed above the top priced tier instead of guessing', () => {
    expect(selectVariantForGuestCount(tiers, 16)).toEqual({
      variant: null,
      reason: 'no-tier-covers-count',
    });
  });

  it('fails closed on overlapping tiers (real case: 51-70pp / 70-85pp at 70)', () => {
    const overlapping = [
      { name: '51-70pp', minGuests: 51, maxGuests: 70, priceInSubunits: 30000 },
      { name: '70-85pp', minGuests: 70, maxGuests: 85, priceInSubunits: 32900 },
    ];
    expect(selectVariantForGuestCount(overlapping, 70)).toEqual({
      variant: null,
      reason: 'ambiguous-overlapping-tiers',
    });
    // Non-boundary counts still resolve.
    expect(selectVariantForGuestCount(overlapping, 60).variant.name).toBe('51-70pp');
  });

  it('fails closed without a usable count', () => {
    expect(selectVariantForGuestCount(tiers, 0).reason).toBe('no-guest-count');
    expect(selectVariantForGuestCount(tiers, undefined).reason).toBe('no-guest-count');
  });
});

describe('getMaxPricedGuests', () => {
  it('reports the priced ceiling, which is what the selector must use', () => {
    // Manasseh Paradise shape: guestallowed 85, but tiers stop at 30.
    const tiers = [
      { minGuests: 1, maxGuests: 10 },
      { minGuests: 11, maxGuests: 20 },
      { minGuests: 21, maxGuests: 30 },
    ];
    expect(getMaxPricedGuests(tiers)).toBe(30);
    expect(getMaxPricedGuests([])).toBeNull();
  });
});

describe('validateGuestBands (listing health)', () => {
  it('passes a clean ladder where bigger groups cost more', () => {
    const tiers = [
      { name: '1-5', minGuests: 1, maxGuests: 5, priceInSubunits: 20000 },
      { name: '6-10', minGuests: 6, maxGuests: 10, priceInSubunits: 25000 },
      { name: '11-15', minGuests: 11, maxGuests: 15, priceInSubunits: 30000 },
    ];
    expect(validateGuestBands(tiers, 15).issues).toEqual([]);
  });

  it('flags overlaps, gaps, and capacity beyond the top tier', () => {
    const tiers = [
      { name: '1-5', minGuests: 1, maxGuests: 5, priceInSubunits: 10000 },
      { name: '5-10', minGuests: 5, maxGuests: 10, priceInSubunits: 15000 }, // overlaps at 5
      { name: '15-20', minGuests: 15, maxGuests: 20, priceInSubunits: 20000 }, // gap 11-14
    ];
    const { issues } = validateGuestBands(tiers, 30); // allows 30, priced to 20
    const types = issues.map((i) => i.type);
    expect(types).toContain('overlap');
    expect(types).toContain('gap');
    expect(types).toContain('capacityMismatch');
  });

  it('flags a bigger band that does not cost more - hosts charge more for more guests', () => {
    const tiers = [
      { name: '1-5', minGuests: 1, maxGuests: 5, priceInSubunits: 20000 },
      { name: '6-10', minGuests: 6, maxGuests: 10, priceInSubunits: 20000 }, // same price
      { name: '11-15', minGuests: 11, maxGuests: 15, priceInSubunits: 15000 }, // cheaper!
    ];
    const { issues } = validateGuestBands(tiers, 15);
    expect(issues.filter((i) => i.type === 'nonMonotonicPrice')).toHaveLength(2);
  });

  it('counts variants with no band as incomplete', () => {
    const tiers = [
      { name: '1-5', minGuests: 1, maxGuests: 5, priceInSubunits: 10000 },
      { name: 'spa heating', priceInSubunits: 5000 },
    ];
    const { issues } = validateGuestBands(tiers, 5);
    expect(issues.map((i) => i.type)).toContain('incompleteBands');
  });
});
