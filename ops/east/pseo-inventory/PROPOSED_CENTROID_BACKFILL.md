# Proposed: city centroid backfill — NOT EXECUTED

Prepared 2026-09-21. Nothing below has been run. No coordinate has been written,
guessed, or substituted.

## Why this matters more than it first looks

The nearby-inventory tier needs a centroid for the target city. Without one a
page can only ever show **exact** city matches, and exact matches exist for just
109 city slugs against 124 eligible listings.

Measured today:

| measure | value |
|---|---|
| `cities` rows total | 598 |
| `cities` rows missing latitude/longitude | **163** (162 of them `is_published`) |
| Published `host_acq_city` pages | 4,008 |
| …that match a `cities` row by derived slug | **632** |
| …whose matched city has **no** coordinates | **216** |
| …with **no `cities` row at all** | **3,376 (84%)** |
| Inventory city slugs with a `cities` row | **24 of 109** |

So the real ceiling is not "163 cities need coordinates". It is that roughly
**3,592 of 4,008 pages have no usable centroid** — 3,376 because no city row
exists, plus 216 whose row has null coordinates. Those pages fall back to
parsing the slug for a display name, which is enough for an exact-city match but
not for the geographic tier.

## Source of truth: US Census Bureau Gazetteer — Places

`https://www2.census.gov/geo/docs/maps-data/data/gazetteer/<year>_Gazetteer/<year>_gaz_place_national.zip`

Chosen because it is authoritative, free, needs no API key or account, is a
single national file, and — critically — ships `INTPTLAT` / `INTPTLONG`, the
Census **internal point**: a coordinate guaranteed to fall inside the place
polygon. That is exactly the "centre of the city" semantic the nearby copy
claims. Columns used: `USPS` (state), `NAME` (place name), `INTPTLAT`,
`INTPTLONG`.

Rejected alternatives: GeoNames (needs account, mixes administrative levels and
has duplicate/ambiguous entries); any geocoding API (rate limits, cost, and it
returns a *geocode* of a string rather than a definitive place centroid);
`pp_cities` alone (covers only 13 of the 163 — see below).

## Matching rules — deliberately strict

Match on **normalized place name + state code**, both sides normalized the same
way (lowercase; strip `city|town|village|borough|CDP` suffixes that Census
appends; collapse punctuation and whitespace).

Three rules, all of which exist to avoid the failure mode you called out:

1. **Exactly one candidate → write it.**
2. **More than one candidate in the same state → write nothing, log it.**
   (Census legitimately has e.g. multiple "Riverside" entries per state across
   place types.)
3. **Zero candidates → write nothing, log it.**

Never substitute a different city, never fall back to a county or state
centroid, never take "closest name". A page with no confident centroid keeps
its current truthful empty state.

`pp_cities` is used **first** where it already agrees — it covers 13 of the 163
by exact name+state and is internal data we already trust — then Census fills
the remainder.

## Handling the 3,376 pages with no `cities` row

Backfilling coordinates does nothing for these until a `cities` row exists.
Two options, in order of preference:

1. **Create the missing `cities` rows** from the page slugs (`parseCitySlug`
   already derives name + state, and the app relies on it today), then run the
   centroid backfill over the enlarged table. This also fixes the separate
   `content_pages.city_id` gap (currently NULL on all 4,008).
2. Leave them and accept exact-match-only on those pages.

I recommend (1), but it is a larger change than a coordinate backfill and is
**not** included in this proposal — it would materially change what 3,376 live
pages render, and that deserves its own approval.

## Execution shape (when approved)

1. Download the Gazetteer file to EAST, checksum it, keep it under
   `/home/ubuntu/geo/` for reproducibility.
2. Build the candidate set **into a scratch table**, not `cities`:
   `city_centroid_candidates(slug, name, state_code, lat, lng, source, confidence, candidate_count)`.
3. **Report before writing**: counts per rule, plus the full ambiguous and
   unmatched lists for review.
4. Apply only rule-1 rows, in one transaction, with a recorded backup:
   ```sql
   create table cities_coord_backup_20260921 as
     select id, slug, latitude, longitude from cities where latitude is null;
   update cities c set latitude = x.lat, longitude = x.lng, updated_at = now()
   from city_centroid_candidates x
   where x.slug = c.slug and x.confidence = 'exact'
     and (c.latitude is null or c.longitude is null);
   ```
5. Verify: sample 10 written rows against an independent lookup; confirm no row
   that already had coordinates was modified.

Rollback:
```sql
update cities c set latitude = b.latitude, longitude = b.longitude
from cities_coord_backup_20260921 b where b.id = c.id;
```

## Expected outcome

Upper bound is the 163 currently-null rows, of which 13 are already covered
internally. I will not predict the Census hit rate before running step 3 — the
point of that step is to report it rather than estimate it.
