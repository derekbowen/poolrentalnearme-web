
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

/** City links exactly as the current homepage builds them (72 → drop redirects/dupes → 60). */
async function loadCityLinks(): Promise<HomeCity[]> {
  try {
    const { data } = await supabaseAdmin
      .from("cities")
      .select("slug, name, state_code")
      .eq("is_published", true)
      .order("name")
      .limit(72);
    let cityList = (data ?? []) as HomeCity[];
    const { data: redirected } = await supabaseAdmin
      .from("content_pages")
      .select("slug")
      .in("slug", cityList.map((c) => c.slug))
      .not("redirect_to", "is", null);
    const dead = new Set((redirected ?? []).map((r: { slug: string | null }) => r.slug));
    const seen = new Set<string>();
    cityList = cityList.filter((c) => {
      const label = `${c.name}, ${c.state_code}`;
      if (dead.has(c.slug) || seen.has(label)) return false;
      seen.add(label);
      return true;
    });
    return cityList.slice(0, 60);
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
