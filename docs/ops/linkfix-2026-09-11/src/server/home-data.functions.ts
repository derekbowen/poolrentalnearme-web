import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  searchListings,
  fetchShareListing,
  fetchListingsByIds,
  type CuratedListing,
} from "@/server/sharetribe.server";
import type { ListingSummary } from "@/server/sharetribe.functions";

const JAN_LISTING_ID = "6a1a4c13-02fe-458e-89ba-e33b5fc7612b";

// Homepage inventory row: hand-picked spa-first and indoor listings (verified
// 2026-09-09). Order here is display order. Only published listings render, and
// every field on the card (title, photo, city/state, guest limit, price, first
// amenity) is read from the live marketplace record at request time.
const CURATED_LISTING_IDS = [
  "69da42df-c2c8-4d20-ac98-889e5e0af82c", // Luxury Indoor Pool (indoor, hot tub add-on)
  "69fb6104-fdb3-44a3-97b5-026928bb6d90", // Tropical Oasis — Patio, Pool & Spa
  "6a90f031-5164-4945-af2e-f79cb199e3f9", // Fillmore's Exclusive Tropical Resort Living
  "685ed1bc-d63b-4004-9123-aa3e41dc8fd7", // Private Heated Saltwater Oasis w/ hot tub
  "687891ff-95ed-432b-8e91-125fd5095786", // Tropical Paradise Heated Pool and Spa
  "6a713580-85d9-43eb-8f84-35a431128c2f", // The Backyard Oasis (indoor)
  "68816fa0-2ddf-40c7-9cc9-fe673a156a9a", // Indoor NYC Pool (indoor)
  "68bbb61e-990d-4147-8244-c61db6ad9a30", // Tiki Oasis (spa add-on)
];
import { WINTER_CITY_CARDS, WINTER_FEATURED_LISTING_IDS } from "@/config/winter-home";
import {
  ACADEMY_SLUGS,
  ACADEMY_OCCASION_SLUGS,
  classifyAcademyHealth,
  type AcademyHealth,
} from "@/lib/academy-config";

export type HomeCity = {
  slug: string;
  name: string;
  state_code: string;
};

export type HomeCategory = {
  slug: string;
  name: string;
  icon: string | null;
};

export type HomeData = {
  cities: HomeCity[];
  cityCount: number;
  categories: HomeCategory[];
  listings: ListingSummary[];
  nearby: {
    city: string | null;
    region: string | null;
    count: number;
    /** Distance in miles to the nearest pool from the visitor location. */
    nearestMiles: number | null;
  };
  /** Slugs of academy pages that currently have published, non-empty content. */
  academyAvailable: string[];
  /**
   * Per-slug content-health for each academy page the homepage may link to.
   * - "missing":   no row, unpublished, or empty/near-empty body (<200 chars)
   * - "short":     published but body is thin (200–799 chars) — usable but
   *                low quality; UI may still link but should not feature.
   * - "published": published with substantial content (≥800 chars)
   */
  academyHealth: Record<string, AcademyHealth>;
  /** Jan's TheSwimpark featured-pool card data (hero image only). */
  /** Jan's TheSwimpark featured-pool card data (hero image only). */
  janFeatured?: { heroImage: string | null } | null;
  /** Hand-picked spa / heated / indoor listings for the homepage inventory row, in display order. */
  curated?: CuratedListing[];
};

const emptyListingResult = { total: 0, listings: [], page: 1, totalPages: 0 };

const EMPTY_HOME_DATA: HomeData = {
  cities: [],
  cityCount: 0,
  categories: [],
  listings: [],
  nearby: { city: null, region: null, count: 0, nearestMiles: null },
  academyAvailable: [],
  academyHealth: Object.fromEntries(
    ACADEMY_SLUGS.map((s) => [s, "missing" as const]),
  ) as Record<string, "missing" | "short" | "published">,
  janFeatured: null,
};

function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3958.7613; // Earth radius in miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}


export const getHomeData = createServerFn({ method: "GET" }).handler(async (): Promise<HomeData> => {
  try {
    let cf: { city?: string; region?: string; latitude?: string; longitude?: string } = {};
    try {
      const req = getRequest() as Request & {
        cf?: { city?: string; region?: string; latitude?: string; longitude?: string };
      };
      cf = req.cf ?? {};
    } catch (err) {
      console.error("homepage getRequest failed:", err);
    }

    const visitorCity = cf.city ?? null;
    const visitorRegion = cf.region ?? null;
    const origin =
      cf.latitude && cf.longitude ? `${cf.latitude},${cf.longitude}` : undefined;

    const safe = async <T>(p: Promise<T>, label: string, fallback: T): Promise<T> => {
      try {
        return await p;
      } catch (err) {
        console.error(`homepage ${label} failed:`, err);
        return fallback;
      }
    };

    const [cities, cityCountRes, categories, featuredResult, nearbyResult, academyRes, janListing, curated] = await Promise.all([
      safe(
        Promise.resolve(
          supabaseAdmin
            .from("cities")
            .select("slug, name, state_code")
            .eq("is_published", true)
            .order("name")
            .limit(150),
        ),
        "cities query",
        { data: [] as HomeCity[] } as { data: HomeCity[] | null },
      ),
      safe(
        Promise.resolve(
          supabaseAdmin
            .from("cities")
            .select("*", { count: "exact", head: true })
            .eq("is_published", true),
        ),
        "city count query",
        { count: 0 } as { count: number | null },
      ),
      safe(
        Promise.resolve(
          supabaseAdmin
            .from("categories")
            .select("slug, name, icon")
            .eq("is_published", true)
            .order("name"),
        ),
        "categories query",
        { data: [] as HomeCategory[] } as { data: HomeCategory[] | null },
      ),
      safe(searchListings({ perPage: 24 }), "searchListings (featured)", emptyListingResult),
      origin
        ? safe(searchListings({ perPage: 5, origin }), "searchListings (nearby)", emptyListingResult)
        : Promise.resolve(emptyListingResult),
      safe(
        (async () => {
          const { data } = await supabaseAdmin
            .from("content_pages")
            .select("slug, body_markdown")
            .in("slug", ACADEMY_SLUGS)
            .eq("status", "published");
          return (data ?? []) as { slug: string | null; body_markdown: string | null }[];
        })(),
        "academy availability query",
        [] as { slug: string | null; body_markdown: string | null }[],
      ),
      safe(fetchShareListing(JAN_LISTING_ID), "Jan featured listing", null),
      safe(fetchListingsByIds(CURATED_LISTING_IDS), "curated listings", [] as CuratedListing[]),
    ]);

    // Strip listings missing a real image — they render as a blank "no image"
    // card on the homepage and look like a broken/placeholder listing.
    const filteredFeatured = featuredResult.listings.filter(
      (l) => typeof l.imageUrl === "string" && l.imageUrl.length > 0,
    );
    const listingsResult = {
      ...featuredResult,
      listings: filteredFeatured.slice(0, 12),
    };

    // Annotate every featured listing with approximate distance from the
    // visitor (Cloudflare-resolved lat/lng). Powers the "X mi away" badge
    // on listing cards without exposing host street addresses.
    let visitorLat: number | null = null;
    let visitorLng: number | null = null;
    if (cf.latitude && cf.longitude) {
      const lat = Number(cf.latitude);
      const lng = Number(cf.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        visitorLat = lat;
        visitorLng = lng;
      }
    }
    if (visitorLat !== null && visitorLng !== null) {
      for (const l of listingsResult.listings) {
        if (l.geolocation) {
          l.distanceMiles = haversineMiles(
            visitorLat,
            visitorLng,
            l.geolocation.lat,
            l.geolocation.lng,
          );
        }
      }
    }

    let nearestMiles: number | null = null;
    if (visitorLat !== null && visitorLng !== null && nearbyResult.listings.length > 0) {
      for (const l of nearbyResult.listings) {
        if (l.geolocation) {
          const d = haversineMiles(visitorLat, visitorLng, l.geolocation.lat, l.geolocation.lng);
          if (nearestMiles === null || d < nearestMiles) nearestMiles = d;
        }
      }
    }

    const academyHealth: Record<string, AcademyHealth> = Object.fromEntries(
      ACADEMY_SLUGS.map((s) => [s, "missing" as const]),
    );
    for (const r of academyRes) {
      if (!r.slug || !ACADEMY_SLUGS.includes(r.slug)) continue;
      academyHealth[r.slug] = classifyAcademyHealth(
        (r.body_markdown ?? "").trim().length,
      );
    }
    const academyAvailable: string[] = ACADEMY_SLUGS.filter(
      (s) => academyHealth[s] !== "missing",
    );

    // Track regressions: log a structured event whenever the homepage academy
    // block would hide or render in a degraded state. Picked up by Cloudflare
    // Worker logs / server-function-logs and easily greppable by `tag`.
    const missingSlugs = ACADEMY_SLUGS.filter((s) => academyHealth[s] === "missing");
    const shortSlugs = ACADEMY_SLUGS.filter((s) => academyHealth[s] === "short");
    const healthyOccasionCount = ACADEMY_OCCASION_SLUGS.filter(
      (s) => academyHealth[s] === "published",
    ).length;
    const hubsHealthy =
      academyHealth["learning-academy"] === "published" ||
      academyHealth["host-training-academy"] === "published";
    const sectionHidden = healthyOccasionCount < 2 || !hubsHealthy;
    if (sectionHidden || missingSlugs.length > 0 || shortSlugs.length > 0) {
      console.warn(
        JSON.stringify({
          tag: "academy_health",
          sectionHidden,
          healthyOccasionCount,
          hubsHealthy,
          missing: missingSlugs,
          short: shortSlugs,
          totalTracked: ACADEMY_SLUGS.length,
        }),
      );
    }

    // A city is linked only when its /p/<slug> page exists, is published and does
    // not redirect. Fails closed: a broken link is worse than a shorter grid.
    let cityList = (cities.data ?? []) as HomeCity[];
    try {
      cityList = await selectEligibleCities(cityList, 60);
    } catch (err) {
      console.error("homepage city eligibility filter failed:", err);
      cityList = [];
    }
    return {
      cities: cityList,
      cityCount: cityCountRes.count ?? cityList.length,
      categories: (categories.data ?? []) as HomeCategory[],
      listings: listingsResult.listings,
      nearby: {
        city: visitorCity,
        region: visitorRegion,
        count: origin ? nearbyResult.total : 0,
        nearestMiles,
      },
      academyAvailable,
      academyHealth,
      janFeatured: janListing ? { heroImage: janListing.heroImage } : null,
      curated,
    };
  } catch (err) {
    console.error("homepage getHomeData fatal failure, returning empty data:", err);
    return EMPTY_HOME_DATA;
  }
});

// ───────────────────────── Winter homepage (/?preview=winter) ─────────────────────────
// Phase 1 of the 2026-09-09 rebuild brief. Config lives in src/config/winter-home.ts.

export type WinterListing = CuratedListing;

export type WinterCityCard = {
  slug: string;
  name: string;
  state: string;
  bounds: string;
  /** Live count of published listings inside `bounds` (0 hides the count). */
  count: number;
  /** Primary photo of one live listing inside `bounds`, or null. */
  imageUrl: string | null;
};

export type WinterHomeData = {
  featured: WinterListing[];
  cityCards: WinterCityCard[];
  /** Same city-link list as the current homepage (rule 7: every link survives). */
  cities: HomeCity[];
};

/**
 * A city may only be linked from the homepage when its /p/<slug> page actually
 * exists and is servable.
 *
 * The grid is sourced from the `cities` table, but each card links to /p/<slug>,
 * which is a `content_pages` page. Those two sets are not the same: on
 * 2026-09-11, 73 of 200 published cities had no `content_pages` row at all, and
 * six of them were inside the rendered 60, shipping dead links on the homepage.
 * The previous filter only dropped rows that HAD a row carrying `redirect_to`,
 * so a city with no page at all sailed through.
 *
 * Eligibility (all must hold):
 *   - a content_pages row exists for the slug
 *   - its status is "published" (NOT the legacy `is_published` column, which is
 *     false on every row in this table and means nothing)
 *   - it carries no redirect_to
 *
 * Duplicate "City, ST" labels are dropped, then the list is capped. One database
 * round-trip -- never a per-render HTTP check of each link.
 */
type CityPageRow = { slug: string; redirect_to: string | null; status: string | null };

async function selectEligibleCities(candidates: HomeCity[], cap: number): Promise<HomeCity[]> {
  if (!candidates.length) return [];
  const { data, error } = await supabaseAdmin
    .from("content_pages")
    .select("slug, redirect_to, status")
    .in(
      "slug",
      candidates.map((c) => c.slug),
    );
  if (error) throw error;
  const rows = (data ?? []) as unknown as CityPageRow[];
  const eligible = new Set(
    rows.filter((r) => r.redirect_to == null && r.status === "published").map((r) => r.slug),
  );
  const seen = new Set<string>();
  const out: HomeCity[] = [];
  for (const c of candidates) {
    if (!eligible.has(c.slug)) continue;
    const label = `${c.name}, ${c.state_code}`;
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(c);
    if (out.length >= cap) break;
  }
  return out;
}

/** City links for the winter preview -- same eligibility rules as the live homepage. */
async function loadCityLinks(): Promise<HomeCity[]> {
  try {
    const { data } = await supabaseAdmin
      .from("cities")
      .select("slug, name, state_code")
      .eq("is_published", true)
      .order("name")
      .limit(150);
    return await selectEligibleCities((data ?? []) as HomeCity[], 60);
  } catch (err) {
    console.error("winter city links failed:", err);
    return [];
  }
}

let winterCache: { at: number; data: WinterHomeData } | null = null;
const WINTER_CACHE_MS = 60_000;

export const getWinterHomeData = createServerFn({ method: "GET" }).handler(
  async (): Promise<WinterHomeData> => {
    // Preview-only response headers: never cache this render, never index it.
    try {
      setResponseHeader("cache-control", "no-store, max-age=0");
      setResponseHeader("x-robots-tag", "noindex, nofollow");
    } catch (err) {
      console.warn("winter preview: could not set response headers:", err);
    }
    if (winterCache && Date.now() - winterCache.at < WINTER_CACHE_MS) return winterCache.data;
    const safe = async <T,>(p: Promise<T>, label: string, fallback: T): Promise<T> => {
      try {
        return await p;
      } catch (err) {
        console.error(`winter homepage ${label} failed:`, err);
        return fallback;
      }
    };
    const [featured, cityCards, cities] = await Promise.all([
      safe(fetchListingsByIds(WINTER_FEATURED_LISTING_IDS), "featured listings", [] as WinterListing[]),
      Promise.all(
        WINTER_CITY_CARDS.map(async (c): Promise<WinterCityCard> => {
          const r = await safe(
            searchListings({ bounds: c.bounds, perPage: 1 }),
            `city card ${c.slug}`,
            { listings: [], total: 0, page: 1, totalPages: 0 },
          );
          return {
            slug: c.slug,
            name: c.name,
            state: c.state,
            bounds: c.bounds,
            count: r.total,
            imageUrl: r.listings[0]?.imageUrl ?? null,
          };
        }),
      ),
      loadCityLinks(),
    ]);
    const data: WinterHomeData = { featured, cityCards, cities };
    if (featured.length > 0) winterCache = { at: Date.now(), data };
    return data;
  },
);
