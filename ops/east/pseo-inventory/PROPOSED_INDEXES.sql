-- PROPOSED, NOT APPLIED. 2026-09-18.
--
-- The city-page inventory lookup (`ops/east/pseo-inventory/city-inventory.functions.ts`)
-- issues exactly two queries per city page:
--
--   1. exact  : where state='published' and is_deleted=false
--                 and primary_image_url is not null
--                 and city_slug = $1 and state_code = $2
--   2. nearby : the same eligibility predicate plus a latitude/longitude
--               bounding box, then haversine-sorted in JS
--
-- At the current size (199 rows in synced_listings, 124 eligible) Postgres will
-- sequential-scan regardless and these indexes change nothing measurable — the
-- measured lookup cost is ~25-40ms of the ~560ms page TTFB. They are written
-- here rather than applied because the brief asked for the minimum safe
-- migration to be proposed first, and because an index on a 199-row table is
-- not yet justified.
--
-- Apply them when synced_listings passes roughly 5-10k rows, or sooner if the
-- nearby bounding-box scan shows up in slow-query logs.
--
-- Both are partial indexes matching the canonical eligibility predicate, so
-- they stay small and are only consulted for customer-facing inventory.
-- CONCURRENTLY keeps them non-blocking; run each statement on its own (they
-- cannot run inside a transaction block).

CREATE INDEX CONCURRENTLY IF NOT EXISTS synced_listings_city_lookup_idx
  ON public.synced_listings (state_code, city_slug)
  WHERE state = 'published'
    AND is_deleted = false
    AND primary_image_url IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS synced_listings_geo_idx
  ON public.synced_listings (latitude, longitude)
  WHERE state = 'published'
    AND is_deleted = false
    AND primary_image_url IS NOT NULL;

-- Rollback:
--   DROP INDEX CONCURRENTLY IF EXISTS public.synced_listings_city_lookup_idx;
--   DROP INDEX CONCURRENTLY IF EXISTS public.synced_listings_geo_idx;
