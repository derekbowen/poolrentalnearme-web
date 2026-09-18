/**
 * ONE reusable inventory query for every pSEO city page.
 *
 * Source of truth is `synced_listings` — the normalized mirror written by
 * `listing-sync.server.ts`. Nothing here talks to Sharetribe at request time.
 *
 * Matching order (deterministic, no loose substring matching):
 *   1. exact normalized city_slug + state_code
 *   2. geographic fallback around the city centroid, clearly separated
 *
 * Measured 2026-09-18: of 124 eligible listings only 56 carried a discrete
 * city string while 123 carried coordinates, so the geo tier is not a nicety —
 * it is how most inventory becomes reachable at all. Exact matches are still
 * returned first and are the ONLY ones labelled as being in the city.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type InventoryListing = {
  id: string;
  slug: string;
  title: string;
  city: string | null;
  stateCode: string | null;
  price: number | null;
  currency: string | null;
  img: string | null;
  capacity: number | null;
  amenities: string[];
  mi?: number;
};

export type CityInventory = {
  exact: InventoryListing[];
  nearby: InventoryListing[];
  /** Why these results were returned — surfaced for debugging and verification. */
  matchReason: "exact_city" | "exact_plus_nearby" | "nearby_only" | "none";
  radiusMi: number | null;
};

export const EMPTY_INVENTORY: CityInventory = {
  exact: [],
  nearby: [],
  matchReason: "none",
  radiusMi: null,
};

/** Cards shown before we top up with nearby supply. */
const MIN_EXACT = 3;
/** Hard cap on the initial render so we never dump 40 images on a page. */
const MAX_TOTAL = 8;
const NEARBY_RADIUS_MI = 60;

const SELECT_COLS =
  "sharetribe_id, slug, title, city, state_code, price_amount, price_currency, " +
  "primary_image_url, capacity, amenities, latitude, longitude";

/**
 * Canonical eligibility for customer-facing inventory. Defined once so the
 * city pages, and anything added later, cannot drift apart.
 *   published · not deleted · has a usable image · has a linkable public URL
 */
function eligible(q: any) {
  return q
    .eq("state", "published")
    .eq("is_deleted", false)
    .not("primary_image_url", "is", null)
    .not("slug", "is", null)
    .not("sharetribe_id", "is", null);
}

/**
 * Normalize a city name to the same key shape `listing-sync.server.ts` writes
 * into `city_slug`, so "Riverside, CA" / "riverside" / "RIVERSIDE" collapse to
 * one identity. Mirrors slugify() in the sync on purpose.
 */
export function normalizeCityKey(city: string | null | undefined): string | null {
  if (!city) return null;
  const key = city
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return key || null;
}

function toListing(r: any): InventoryListing {
  return {
    id: r.sharetribe_id,
    slug: r.slug,
    title: r.title ?? "Pool rental",
    city: r.city ?? null,
    stateCode: r.state_code ?? null,
    price: typeof r.price_amount === "number" ? r.price_amount : null,
    currency: r.price_currency ?? null,
    img: r.primary_image_url ?? null,
    capacity: typeof r.capacity === "number" ? r.capacity : null,
    amenities: Array.isArray(r.amenities) ? r.amenities.slice(0, 3).map(String) : [],
  };
}

const toRad = (d: number) => (d * Math.PI) / 180;
function miles(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 3958.8;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export async function loadCityInventory(input: {
  cityName: string | null;
  stateCode: string | null;
  lat: number | null;
  lng: number | null;
}): Promise<CityInventory> {
  const sb = supabaseAdmin as any;
  const cityKey = normalizeCityKey(input.cityName);
  const st = input.stateCode ? input.stateCode.toUpperCase() : null;

  // ---- tier 1: exact normalized city + state -------------------------------
  let exact: InventoryListing[] = [];
  if (cityKey && st) {
    const { data } = await eligible(sb.from("synced_listings").select(SELECT_COLS))
      .eq("city_slug", cityKey)
      .eq("state_code", st)
      .limit(MAX_TOTAL);
    exact = (data ?? []).map(toListing);
  }

  if (exact.length >= MIN_EXACT) {
    return {
      exact: exact.slice(0, MAX_TOTAL),
      nearby: [],
      matchReason: "exact_city",
      radiusMi: null,
    };
  }

  // ---- tier 2: geographic fallback around the city centroid ----------------
  const { lat, lng } = input;
  if (lat == null || lng == null) {
    return {
      exact,
      nearby: [],
      matchReason: exact.length ? "exact_city" : "none",
      radiusMi: null,
    };
  }

  // Bounding box first so Postgres can use a range scan, then exact haversine.
  const dLat = NEARBY_RADIUS_MI / 69;
  const cos = Math.cos(toRad(lat));
  const dLng = NEARBY_RADIUS_MI / (69 * (Math.abs(cos) < 0.01 ? 0.01 : Math.abs(cos)));
  const { data: box } = await eligible(sb.from("synced_listings").select(SELECT_COLS))
    .gte("latitude", lat - dLat)
    .lte("latitude", lat + dLat)
    .gte("longitude", lng - dLng)
    .lte("longitude", lng + dLng)
    .limit(200);

  const seen = new Set(exact.map((l) => l.id));
  const nearby = (box ?? [])
    .filter((r: any) => r.latitude != null && r.longitude != null)
    .map((r: any) => ({ ...toListing(r), mi: miles(lat, lng, r.latitude, r.longitude) }))
    .filter((l: InventoryListing) => !seen.has(l.id) && (l.mi as number) <= NEARBY_RADIUS_MI)
    .sort((a: InventoryListing, b: InventoryListing) => (a.mi as number) - (b.mi as number))
    .slice(0, Math.max(0, MAX_TOTAL - exact.length));

  const matchReason: CityInventory["matchReason"] =
    exact.length && nearby.length
      ? "exact_plus_nearby"
      : exact.length
        ? "exact_city"
        : nearby.length
          ? "nearby_only"
          : "none";

  return { exact, nearby, matchReason, radiusMi: nearby.length ? NEARBY_RADIUS_MI : null };
}

export const getCityInventory = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z
      .object({
        cityName: z.string().nullable(),
        stateCode: z.string().nullable(),
        lat: z.number().nullable(),
        lng: z.number().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<CityInventory> => {
    try {
      return await loadCityInventory(data);
    } catch {
      return EMPTY_INVENTORY;
    }
  });
