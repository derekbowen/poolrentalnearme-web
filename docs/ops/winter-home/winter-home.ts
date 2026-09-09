/**
 * Winter homepage configuration (Phase 1 of the 2026-09-09 rebuild brief).
 *
 * Everything a human might want to change lives here, not in JSX:
 * the hero "from" price, the six featured listings, the chip URLs, the six
 * city cards. Nothing in this file is fetched live; the listings behind the
 * ids are fetched live at request time (title, photo, price, guests).
 *
 * Content rules: no invented statistics, no press logos, no insurance or
 * coverage language, no review counts unless the listing really has reviews.
 */

/**
 * Hero "from $X" price. Set by Derek on 2026-09-09 as a constant, NOT a live
 * minimum: the live floor that day was $20.70 (White Lodge Pool, Albuquerque),
 * a 20-day-old listing that does not headline the site. $40 = $40.25 all-in
 * (Tropical Oasis, Pflugerville; Deebos Backyard Paradise) rounded down.
 * REVIEW BY 2026-10-09: re-run the census and confirm $40 is still honest.
 */
export const HERO_FROM_PRICE = 40;
export const HERO_FROM_PRICE_REVIEW_BY = "2026-10-09";

/**
 * Featured winter pools, display order. Each must be a published listing whose
 * own tags say heated or indoor (verified against publicData 2026-09-09).
 * Six render; extra ids are spares that fill in if one goes unpublished.
 */
export const WINTER_FEATURED_LISTING_IDS: string[] = [
  "69da42df-c2c8-4d20-ac98-889e5e0af82c", // Luxury Indoor Pool — Peters Township, PA (indoorpools)
  "687891ff-95ed-432b-8e91-125fd5095786", // Tropical Paradise Heated Pool and Spa — Rancho Palos Verdes, CA (heatedpools)
  "6a713580-85d9-43eb-8f84-35a431128c2f", // The Backyard Oasis — Coeur d'Alene, ID (indoorpools)
  "685ed1bc-d63b-4004-9123-aa3e41dc8fd7", // Private Heated Saltwater Oasis w/ hot tub — Acworth, GA (heated)
  "68816fa0-2ddf-40c7-9cc9-fe673a156a9a", // Indoor NYC Pool — Jamaica, NY (indoorpools)
  "69ff1cde-1688-41e0-8f27-9bceeb69573b", // La Saltwater Pool & Spa | Free Heat — Sherman Oaks, CA (heated saltwater)
  "69fb6104-fdb3-44a3-97b5-026928bb6d90", // spare: Tropical Oasis — Patio, Pool & Spa — Pflugerville, TX
  "68cf25c3-c83e-45de-ab0a-16725e8cf5e2", // spare: Island Time Pool — Lilburn, GA (indoorpools)
];
export const WINTER_FEATURED_COUNT = 6;

/**
 * Search filters the marketplace search page actually honors (verified
 * 2026-09-09 by result counts). Indoor's source of truth is the listing
 * category (categoryLevel2 = indoorpools, 5 listings); the poolAmenities
 * "indoor" tag (4 listings) is not used.
 */
export const SEARCH_URLS = {
  all: "/s",
  indoor: "/s?pub_categoryLevel1=pool&pub_categoryLevel2=indoorpools",
  heated: "/s?pub_poolAmenities=heated",
  hotTub: "/s?pub_poolAmenities=hot_tub",
  birthday: "/s?keywords=birthday",
  swimLessons: "/s?keywords=lesson",
  holidayParty: "/s?keywords=holiday%20party",
  familyDay: "/s?keywords=family",
  poolParty: "/s?keywords=party",
} as const;

export type Chip = { label: string; href: string };

/** Under the hero search bar. */
export const HERO_CHIPS: Chip[] = [
  { label: "Indoor", href: SEARCH_URLS.indoor },
  { label: "Heated", href: SEARCH_URLS.heated },
  { label: "Hot tub", href: SEARCH_URLS.hotTub },
];

/** The single browse row (replaces "Any excuse" and "Browse by pool type"). */
export const BROWSE_CHIPS: Chip[] = [
  { label: "Indoor", href: SEARCH_URLS.indoor },
  { label: "Heated", href: SEARCH_URLS.heated },
  { label: "Hot tub", href: SEARCH_URLS.hotTub },
  { label: "Birthday", href: SEARCH_URLS.birthday },
  { label: "Swim lessons", href: SEARCH_URLS.swimLessons },
  { label: "Holiday party", href: SEARCH_URLS.holidayParty },
  { label: "Family day", href: SEARCH_URLS.familyDay },
  { label: "Pool party", href: SEARCH_URLS.poolParty },
];

export type WinterCityConfig = {
  /** Slug of the existing /p/<slug> city page (kept in the "All cities" list). */
  slug: string;
  name: string;
  state: string;
  /** Marketplace search bounds "neLat,neLng,swLat,swLng" from /api/geocode-suggest. */
  bounds: string;
};

/**
 * Six featured city cards. Default = cities with the most live listings on
 * 2026-09-09 (every city had at most two, so ties were broken toward the
 * larger metro). Derek may swap. Photo and count come from a live search
 * inside `bounds` at request time.
 */
export const WINTER_CITY_CARDS: WinterCityConfig[] = [
  { slug: "los-angeles", name: "Los Angeles", state: "CA", bounds: "34.24204,-118.144,33.79674,-118.67764" },
  { slug: "phoenix", name: "Phoenix", state: "AZ", bounds: "33.80584,-111.81153,33.33846,-112.36873" },
  { slug: "las-vegas-nv", name: "Las Vegas", state: "NV", bounds: "36.35575,-115.11349,36.11125,-115.41459" },
  { slug: "riverside", name: "Riverside", state: "CA", bounds: "34.0306,-117.28247,33.84568,-117.50387" },
  { slug: "portland", name: "Portland", state: "OR", bounds: "45.65554,-122.4818,45.41836,-122.81814" },
  { slug: "virginia-beach", name: "Virginia Beach", state: "VA", bounds: "36.9401,-75.83001,36.61896,-76.22827" },
];

/** Katy's pool tour (existing homepage video, tap to play). */
export const KATY_VIDEO_ID = "jJF_OyufFQs";
export const ACADEMY_CLASS_COUNT = 193;
export const SWITCH_FROM_SWIMPLY_URL =
  "/p/elearning-academy-migrating-from-swimply-to-prnm-complete-switch-guide";
