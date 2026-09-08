/**
 * Homepage inventory — the ONE place that decides which pools the homepage shows and in what
 * order. The UI only renders what comes out of here.
 *
 *   season  → seasonal merchandising weights (winter: indoor → heated → night swims → general)
 *   eligible → homepage eligibility (photo, valid price, resolvable city, a pool category,
 *              no operator flags, not a pool-table/billiards space, not blocklisted)
 *   rank    → seasonal weight + quality boosts; ctx.location / ctx.density are reserved slots so
 *              proximity and market-supply terms can be added later without touching the UI
 *
 * Pricing: every card price is priceWithBookingFee() from util/currency — the exact rule
 * ListingCard uses on /s (host rate + guest booking fee, CA SB 478 all-in display). No second formula.
 */
import { convertMoneyToNumber, priceWithBookingFee } from '../../util/currency';
import { createSlug } from '../../util/urlHelpers';

export const SEASON_WINTER = 'winter';
export const SEASON_SUMMER = 'summer';

// Rotation: April–August is summer; September–March is the fall/winter merchandising
// (indoor and heated lead as soon as the outdoor season winds down after Labor Day).
export const getSeason = (date = new Date()) => {
  const month = date.getMonth();
  return month >= 3 && month <= 7 ? SEASON_SUMMER : SEASON_WINTER;
};

export const SEASONS = {
  [SEASON_WINTER]: {
    key: SEASON_WINTER,
    heroEyebrow: 'Indoor & heated pools · open all winter',
    inventoryHeading: 'Warm swims, open all winter',
    moreEyebrow: 'Open all winter',
    shortcutOrder: ['indoor', 'heated', 'hottub', 'night', 'party', 'family'],
    // "For you" sorts by this weight per homepage category, then by the quality boosts in rank().
    weights: { indoor: 100, heated: 80, night: 60, general: 20 },
  },
  [SEASON_SUMMER]: {
    key: SEASON_SUMMER,
    heroEyebrow: 'Private pools by the hour · anywhere in America',
    inventoryHeading: 'Pools worth jumping into',
    moreEyebrow: 'Open all summer',
    shortcutOrder: ['party', 'family', 'night', 'heated', 'hottub', 'indoor'],
    weights: { general: 60, night: 70, heated: 30, indoor: 10 },
  },
};

export const TAB_FOR_YOU = 'foryou';
export const TABS = [
  { key: TAB_FOR_YOU, label: 'For you', heading: null, noun: null },
  { key: 'heated', label: 'Heated', heading: 'Heated pools', noun: 'heated' },
  { key: 'indoor', label: 'Indoor', heading: 'Indoor pools', noun: 'indoor' },
  { key: 'night', label: 'Night swims', heading: 'Night swims', noun: 'night-swim' },
];

// Homepage category keys, matched case-insensitively against the Console listing-categories
// asset ("Indoor pools", "Heated pools", "Night swimming", "Public pools", …).
const CATEGORY_MATCHERS = [
  ['indoor', /indoor/i],
  ['heated', /heated/i],
  ['night', /night/i],
  ['public', /public/i],
];
export const HOMEPAGE_CATEGORY_KEYS = ['indoor', 'heated', 'night'];

export const categoryKeyForName = (name) => {
  const found = CATEGORY_MATCHERS.find(([, re]) => re.test(String(name || '')));
  return found ? found[0] : 'general';
};

// Flattens the (possibly nested) Console category tree into { [id]: name }.
export const flattenCategories = (categories = [], acc = {}) => {
  (categories || []).forEach((c) => {
    if (c?.id) acc[c.id] = c.name || c.id;
    if (c?.subcategories?.length) flattenCategories(c.subcategories, acc);
  });
  return acc;
};

// Resolves the Console ids the homepage merchandises: { indoor, heated, night } → id | null.
export const resolveHomepageCategoryIds = (categories = []) => {
  const names = flattenCategories(categories);
  return Object.entries(names).reduce(
    (acc, [id, name]) => {
      const key = categoryKeyForName(name);
      return HOMEPAGE_CATEGORY_KEYS.includes(key) && !acc[key] ? { ...acc, [key]: id } : acc;
    },
    { indoor: null, heated: null, night: null }
  );
};

// "123 Main St, Bothell, WA 98011, United States" → "Bothell, WA". Same city parse as
// ListingCard on /s, plus the state (ZIP stripped) so cards read like the design.
export const cityStateFromAddress = (address) => {
  const parts = String(address || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 3) {
    const city = parts[parts.length - 3];
    const region = parts[parts.length - 2].replace(/\s*\d{5}(-\d{4})?$/, '').trim();
    return region ? `${city}, ${region}` : city;
  }
  return parts.slice(0, 2).join(', ');
};

export const listingCity = (publicData) => {
  const location = publicData?.location || {};
  if (location.city) {
    return location.state ? `${location.city}, ${location.state}` : location.city;
  }
  return cityStateFromAddress(location.address);
};

const isHeatedListing = (publicData, title) => {
  const amenities = Array.isArray(publicData?.poolAmenities) ? publicData.poolAmenities : [];
  return !!publicData?.heated || amenities.includes('heated') || /heated/i.test(title || '');
};

const CATEGORY_LABELS = { indoor: 'Indoor', heated: 'Heated', night: 'Night swims' };

// "Indoor · Heated · Fits 20" — the one attribute line on a card.
export const tagFor = ({ cat, categoryName, heated, guests }) => {
  const label = CATEGORY_LABELS[cat] || categoryName || 'Private pool';
  return [label, heated && cat !== 'heated' ? 'Heated' : null, guests ? `Fits ${guests}` : null]
    .filter(Boolean)
    .join(' · ');
};

// All-in price label: whole dollars drop the cents ("$115"), anything else always shows two
// decimals ("$80.50", "$143.75"). The marketplace-wide currency format allows 0–2 fraction
// digits, which renders "$80.5" — never on the homepage.
export const formatAllInPrice = (intl, money) => {
  if (!money) return '';
  const label = intl.formatNumber(convertMoneyToNumber(money), {
    style: 'currency',
    currency: money.currency,
    currencyDisplay: 'symbol',
    useGrouping: true,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return label.replace(/\.00$/, '');
};

/**
 * Normalizes a Sharetribe listing entity (with images/author denormalized) into the flat shape
 * the homepage cards render. Sample/fallback listings are authored directly in this shape.
 */
export const toHomepageListing = (listing, ctx = {}) => {
  const { categoryNames = {}, intl } = ctx;
  const { id, attributes = {}, images = [], author = null } = listing || {};
  const { title = '', price = null, publicData = {}, state, deleted, createdAt } = attributes;
  const uuid = id?.uuid || id;
  const categoryName = categoryNames[publicData.categoryLevel1] || '';
  const cat = categoryKeyForName(categoryName);
  const heated = cat === 'heated' || isHeatedListing(publicData, title);
  const guests = publicData.guestallowed ?? publicData.maxGuests ?? null;
  const avgRating = publicData.avgRating;
  const allIn = price ? priceWithBookingFee(price) : null;

  return {
    id: uuid,
    slug: createSlug(title),
    title,
    city: listingCity(publicData),
    cat,
    categoryName,
    heated,
    guests,
    price: allIn,
    priceLabel: intl ? formatAllInPrice(intl, allIn) : '',
    image: images[0] || null,
    author,
    tag: tagFor({ cat, categoryName, heated, guests }),
    topHost: !!(publicData.proHost || publicData.swimplyIcalUrl),
    fav: typeof avgRating === 'number' && avgRating >= 4.7,
    published: state === 'published' && !deleted,
    createdAt,
    flags: [],
  };
};

// "Indoorstay pool table movie theater" (Queens) sits in Indoor pools but is a pool table.
export const BLOCKLIST = ['6a54df9b-d7c0-4bde-81bf-269527a56867'];
const NOT_A_POOL = /pool table|billiard/i;

export const isEligible = (l) =>
  !!l &&
  l.published !== false &&
  !!l.image &&
  !!l.price &&
  l.price.amount > 0 &&
  !!l.city &&
  l.cat !== 'public' &&
  !(l.flags && l.flags.length) &&
  !NOT_A_POOL.test(l.title || '') &&
  !BLOCKLIST.includes(l.id);

export const rank = (l, ctx = {}) => {
  const weights = ctx.weights || SEASONS[SEASON_WINTER].weights;
  let score = weights[l.cat] != null ? weights[l.cat] : weights.general;
  if (l.fav) score += 15;
  if (l.topHost) score += 10;
  if (l.heated && l.cat !== 'heated') score += 8;
  if ((l.guests || 0) >= 20) score += 3;
  // Reserved: ctx.location (proximity to the visitor) and ctx.density (market supply) plug in
  // here. Nothing in the UI needs to change when they do.
  return score;
};

// Stable sort: equal scores keep the API order (newest first), so a thin category never
// empties the grid — "For you" always fills from general inventory.
export const rankListings = (listings, ctx) =>
  listings.slice().sort((a, b) => rank(b, ctx) - rank(a, ctx));

export const pickForTab = (ranked, tabKey, limit = 5) =>
  tabKey === TAB_FOR_YOU
    ? ranked.slice(0, limit)
    : ranked.filter((l) => l.cat === tabKey || (tabKey === 'heated' && l.heated)).slice(0, limit);

// Human-readable ranking order for the status line: "indoor → heated → night swims → top-rated pools".
export const rankingOrderLabel = (weights) => {
  const labels = {
    indoor: 'indoor',
    heated: 'heated',
    night: 'night swims',
    general: 'top-rated pools',
  };
  return Object.keys(weights)
    .sort((a, b) => weights[b] - weights[a])
    .map((k) => labels[k])
    .join(' → ');
};
