const {
  getVariantGuestBand,
  hasCompleteGuestBands,
  selectVariantForGuestCount,
  partySizeTierConflict,
} = require('./guestBands');

const listingWith = (priceVariants) => ({ attributes: { publicData: { priceVariants } } });

// Banded ladder mirroring "Justice For Pools" pricing.
const TIERS = [
  { name: '1-5 guests', minGuests: 1, maxGuests: 5, priceInSubunits: 20000 },
  { name: '6-10 guests', minGuests: 6, maxGuests: 10, priceInSubunits: 25000 },
  { name: '11-15 guests', minGuests: 11, maxGuests: 15, priceInSubunits: 30000 },
];

describe('getVariantGuestBand', () => {
  it('reads structured bounds only - a banded-looking name is not a band', () => {
    expect(getVariantGuestBand({ minGuests: 6, maxGuests: 10 })).toEqual({
      minGuests: 6,
      maxGuests: 10,
    });
    expect(getVariantGuestBand({ name: '1-5 Guests' })).toBeNull();
    expect(getVariantGuestBand({ minGuests: 10, maxGuests: 5 })).toBeNull();
  });
});

describe('selectVariantForGuestCount', () => {
  it('resolves boundaries to exactly one tier and fails closed elsewhere', () => {
    expect(selectVariantForGuestCount(TIERS, 5).variant.name).toBe('1-5 guests');
    expect(selectVariantForGuestCount(TIERS, 6).variant.name).toBe('6-10 guests');
    expect(selectVariantForGuestCount(TIERS, 16).reason).toBe('no-tier-covers-count');
    const overlapping = [
      { name: 'a', minGuests: 1, maxGuests: 10 },
      { name: 'b', minGuests: 10, maxGuests: 20 },
    ];
    expect(selectVariantForGuestCount(overlapping, 10).reason).toBe('ambiguous-overlapping-tiers');
  });
});

describe('partySizeTierConflict (the checkout guard)', () => {
  it('accepts a party size inside the paid tier', () => {
    const params = { priceVariantName: '6-10 guests', protectedData: { partySize: 8 } };
    expect(partySizeTierConflict(listingWith(TIERS), params)).toBeNull();
  });

  it('rejects paying the small-group price for a big group', () => {
    const params = { priceVariantName: '1-5 guests', protectedData: { partySize: 12 } };
    const err = partySizeTierConflict(listingWith(TIERS), params);
    expect(err).toMatch(/covers 1-5 guests/);
    expect(err).toMatch(/booking is for 12/);
    expect(err).toMatch(/"11-15 guests"/); // tells the guest the right tier
  });

  it('stays out of the way when it cannot be sure', () => {
    // No structured bands at all (every listing today).
    const legacy = [{ name: '1-5 guests', priceInSubunits: 20000 }];
    expect(
      partySizeTierConflict(listingWith(legacy), {
        priceVariantName: '1-5 guests',
        protectedData: { partySize: 40 },
      })
    ).toBeNull();
    // Bands on some variants only - incomplete is not enforceable.
    const partial = [TIERS[0], { name: 'spa heating', priceInSubunits: 5000 }];
    expect(
      partySizeTierConflict(listingWith(partial), {
        priceVariantName: '1-5 guests',
        protectedData: { partySize: 12 },
      })
    ).toBeNull();
    // No party size stated (mobile app, legacy clients).
    expect(
      partySizeTierConflict(listingWith(TIERS), { priceVariantName: '1-5 guests' })
    ).toBeNull();
    // No tier stated.
    expect(
      partySizeTierConflict(listingWith(TIERS), { protectedData: { partySize: 8 } })
    ).toBeNull();
    // Unknown tier name: later pricing fails with a clearer error.
    expect(
      partySizeTierConflict(listingWith(TIERS), {
        priceVariantName: 'nope',
        protectedData: { partySize: 8 },
      })
    ).toBeNull();
    // Missing listing entirely.
    expect(partySizeTierConflict(null, { protectedData: { partySize: 8 } })).toBeNull();
  });

  it('hasCompleteGuestBands gates enforcement', () => {
    expect(hasCompleteGuestBands(TIERS)).toBe(true);
    expect(hasCompleteGuestBands([TIERS[0], { name: 'x' }])).toBe(false);
  });
});
