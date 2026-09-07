// Run with: bun test src/containers/LandingPage/homepageInventory.test.js
// (the repo's jest config only covers server/; bun's runner handles the ESM/JSX source tree.)
import { describe, expect, it } from 'bun:test';

import { types as sdkTypes } from '../../util/sdkLoader';
import { priceWithBookingFee } from '../../util/currency';
import {
  BLOCKLIST,
  SEASONS,
  SEASON_SUMMER,
  SEASON_WINTER,
  TAB_FOR_YOU,
  cityStateFromAddress,
  formatAllInPrice,
  getSeason,
  isEligible,
  pickForTab,
  rank,
  rankListings,
  rankingOrderLabel,
  resolveHomepageCategoryIds,
  tagFor,
  toHomepageListing,
} from './homepageInventory';

const { Money, UUID } = sdkTypes;

// Minimal react-intl stand-in: formatMoney calls intl.formatNumber(major, currencyOptions).
const intl = { formatNumber: (value) => `$${Number(value).toFixed(2)}` };

const CATEGORIES = [
  { id: 'private-pool', name: 'Private pool' },
  { id: 'heated-pools', name: 'Heated pools' },
  {
    id: 'indoor-pools',
    name: 'Indoor pools',
    subcategories: [{ id: 'indoor-lap', name: 'Indoor lap' }],
  },
  { id: 'night-swimming', name: 'Night swimming' },
  { id: 'public-pools', name: 'Public pools' },
];
const categoryNames = {
  'private-pool': 'Private pool',
  'heated-pools': 'Heated pools',
  'indoor-pools': 'Indoor pools',
  'night-swimming': 'Night swimming',
  'public-pools': 'Public pools',
};

const image = { id: new UUID('img'), type: 'image', attributes: { variants: {} } };

const entity = ({
  id,
  title,
  cents = 10000,
  category,
  address = '1 Main St, Bothell, WA 98011, United States',
  publicData = {},
  images = [image],
  state = 'published',
}) => ({
  id: new UUID(id),
  type: 'listing',
  attributes: {
    title,
    state,
    deleted: false,
    price: new Money(cents, 'USD'),
    publicData: { categoryLevel1: category, location: { address }, ...publicData },
  },
  images,
});

describe('season', () => {
  it('reads September–March as fall/winter and April–August as summer', () => {
    expect(getSeason(new Date(2026, 11, 12))).toBe(SEASON_WINTER);
    expect(getSeason(new Date(2026, 2, 1))).toBe(SEASON_WINTER);
    expect(getSeason(new Date(2026, 8, 7))).toBe(SEASON_WINTER);
    expect(getSeason(new Date(2026, 3, 1))).toBe(SEASON_SUMMER);
    expect(getSeason(new Date(2026, 7, 31))).toBe(SEASON_SUMMER);
  });

  it('describes the ranking order from the weight table', () => {
    expect(rankingOrderLabel(SEASONS.winter.weights)).toBe(
      'indoor → heated → night swims → top-rated pools'
    );
    expect(rankingOrderLabel(SEASONS.summer.weights)).toBe(
      'night swims → top-rated pools → heated → indoor'
    );
  });
});

describe('category resolution', () => {
  it('finds the Console ids for indoor / heated / night by name, walking subcategories', () => {
    expect(resolveHomepageCategoryIds(CATEGORIES)).toEqual({
      indoor: 'indoor-pools',
      heated: 'heated-pools',
      night: 'night-swimming',
    });
  });

  it('returns nulls when the asset has no matching categories', () => {
    expect(resolveHomepageCategoryIds([{ id: 'x', name: 'Backyards' }])).toEqual({
      indoor: null,
      heated: null,
      night: null,
    });
    expect(resolveHomepageCategoryIds(undefined)).toEqual({
      indoor: null,
      heated: null,
      night: null,
    });
  });
});

describe('city', () => {
  it('parses "City, ST" from a Sharetribe address and strips the ZIP', () => {
    expect(cityStateFromAddress('1 Main St, Bothell, WA 98011, United States')).toBe('Bothell, WA');
    expect(cityStateFromAddress("Coeur d'Alene, ID 83814, United States")).toBe(
      "Coeur d'Alene, ID"
    );
    expect(cityStateFromAddress('Queens, NY')).toBe('Queens, NY');
    expect(cityStateFromAddress('')).toBe('');
  });
});

describe('pricing', () => {
  it('uses the same all-in rule as /s (priceWithBookingFee) and drops ".00"', () => {
    const l = toHomepageListing(entity({ id: 'a', title: 'The Swimpark', cents: 12500 }), {
      categoryNames,
      intl,
    });
    expect(l.price.amount).toBe(priceWithBookingFee(new Money(12500, 'USD')).amount);
    expect(l.price.amount).toBe(14375);
    expect(l.priceLabel).toBe('$143.75');
    expect(formatAllInPrice(intl, new Money(11500, 'USD'))).toBe('$115');
  });
});

describe('normalization', () => {
  it('maps category, heat, guests and the attribute tag', () => {
    const l = toHomepageListing(
      entity({
        id: 'b',
        title: 'The Backyard Oasis',
        category: 'indoor-pools',
        publicData: { poolAmenities: ['heated'], guestallowed: 20 },
      }),
      { categoryNames, intl }
    );
    expect(l.cat).toBe('indoor');
    expect(l.heated).toBe(true);
    expect(l.guests).toBe(20);
    expect(l.tag).toBe('Indoor · Heated · Fits 20');
    expect(l.city).toBe('Bothell, WA');
    expect(l.slug).toBe('the-backyard-oasis');
  });

  it('treats the heated category as heated and general listings as "Private pool"', () => {
    expect(tagFor({ cat: 'heated', heated: true, guests: 18 })).toBe('Heated · Fits 18');
    expect(tagFor({ cat: 'general', categoryName: '', heated: false, guests: null })).toBe(
      'Private pool'
    );
    expect(tagFor({ cat: 'general', categoryName: 'Backyards', heated: true, guests: 8 })).toBe(
      'Backyards · Heated · Fits 8'
    );
  });
});

describe('eligibility', () => {
  const ok = () =>
    toHomepageListing(entity({ id: 'ok', title: 'Sunshine Oasis', category: 'heated-pools' }), {
      categoryNames,
      intl,
    });

  it('accepts a published, priced, photographed pool with a city', () => {
    expect(isEligible(ok())).toBe(true);
  });

  it('rejects the blocklisted Queens billiards listing and anything named like a pool table', () => {
    expect(BLOCKLIST).toContain('6a54df9b-d7c0-4bde-81bf-269527a56867');
    expect(isEligible({ ...ok(), id: BLOCKLIST[0] })).toBe(false);
    expect(isEligible({ ...ok(), title: 'Indoorstay pool table movie theater' })).toBe(false);
    expect(isEligible({ ...ok(), title: 'Billiards lounge' })).toBe(false);
  });

  it('rejects missing photo, unset price, missing city, public pools and operator flags', () => {
    expect(isEligible({ ...ok(), image: null })).toBe(false);
    expect(isEligible({ ...ok(), price: null })).toBe(false);
    expect(isEligible({ ...ok(), price: new Money(0, 'USD') })).toBe(false);
    expect(isEligible({ ...ok(), city: '' })).toBe(false);
    expect(isEligible({ ...ok(), cat: 'public' })).toBe(false);
    expect(isEligible({ ...ok(), flags: ['pricing_not_set'] })).toBe(false);
    expect(
      isEligible(toHomepageListing(entity({ id: 'd', title: 'Draft', state: 'draft' }), { intl }))
    ).toBe(false);
  });
});

describe('ranking', () => {
  const l = (over) => ({
    id: over.id,
    title: over.id,
    cat: 'general',
    heated: false,
    guests: 0,
    fav: false,
    topHost: false,
    ...over,
  });

  it('orders winter "For you" indoor → heated → night → general, with quality boosts', () => {
    const ctx = { weights: SEASONS.winter.weights };
    expect(rank(l({ cat: 'indoor' }), ctx)).toBe(100);
    expect(rank(l({ cat: 'heated' }), ctx)).toBe(80);
    expect(rank(l({ cat: 'night' }), ctx)).toBe(60);
    expect(rank(l({ cat: 'general' }), ctx)).toBe(20);
    expect(
      rank(l({ cat: 'general', fav: true, topHost: true, heated: true, guests: 50 }), ctx)
    ).toBe(56);
    // heated boost only applies outside the heated category itself
    expect(rank(l({ cat: 'heated', heated: true }), ctx)).toBe(80);
  });

  it('flips the order for summer', () => {
    const ctx = { weights: SEASONS.summer.weights };
    expect(rank(l({ cat: 'night' }), ctx)).toBeGreaterThan(rank(l({ cat: 'general' }), ctx));
    expect(rank(l({ cat: 'general' }), ctx)).toBeGreaterThan(rank(l({ cat: 'indoor' }), ctx));
  });

  it('keeps API order for equal scores so a thin category fills from general inventory', () => {
    const ctx = { weights: SEASONS.winter.weights };
    const listings = [
      l({ id: 'g1' }),
      l({ id: 'g2' }),
      l({ id: 'i1', cat: 'indoor' }),
      l({ id: 'g3' }),
      l({ id: 'h1', cat: 'heated' }),
    ];
    expect(rankListings(listings, ctx).map((x) => x.id)).toEqual(['i1', 'h1', 'g1', 'g2', 'g3']);
    expect(pickForTab(rankListings(listings, ctx), TAB_FOR_YOU, 3).map((x) => x.id)).toEqual([
      'i1',
      'h1',
      'g1',
    ]);
  });

  it('category tabs show that category only; Heated also includes heated general pools', () => {
    const ranked = [
      l({ id: 'i1', cat: 'indoor', heated: true }),
      l({ id: 'h1', cat: 'heated', heated: true }),
      l({ id: 'g1', heated: true }),
      l({ id: 'g2' }),
    ];
    expect(pickForTab(ranked, 'indoor').map((x) => x.id)).toEqual(['i1']);
    expect(pickForTab(ranked, 'heated').map((x) => x.id)).toEqual(['i1', 'h1', 'g1']);
    expect(pickForTab(ranked, 'night')).toEqual([]);
  });
});
