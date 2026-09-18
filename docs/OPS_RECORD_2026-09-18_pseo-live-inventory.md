# Ops record — 2026-09-18 — live marketplace inventory on pSEO city pages

Deployed to EAST `fresh-web` as commit **`24d14a99`** (branch
`ops/deploy-sha-enforcement`, built clean with `dirty 0`).
`npm run verify:production` **passed** after deploy.

---

## 1. Inventory source discovered

The architecture asked for already existed. One link was broken.

```
Sharetribe ──listing-sync.server.ts (EXISTED, NEVER INVOKED)──> synced_listings [0 rows]
                                                                      ↓ not wired
content_pages[host_acq_city] ──p.$slug.tsx──> host-acq-city.tsx ──> LiveInventory
                                                      ↑
                                 listings-snapshot.json — 98 records, frozen 2026-08-10
```

- `synced_listings` is purpose-built for this (city, state_code, **city_slug**,
  lat/lng, price, amenities[], capacity, image_urls[], primary_image_url,
  state, is_deleted, last_synced_at) and held **0 rows**.
- `listing_sync_log` held **0 rows** — the sync had never run once, and no cron
  referenced it on either box.
- Pages were therefore rendering a build-time JSON snapshot: 98 of the
  marketplace's 199 listings, five weeks stale.

**No second ingestion path was built.** The existing sync was run and fixed.

## 2. Definition of "active inventory"

One canonical predicate, defined once in `city-inventory.functions.ts::eligible()`
and used by both tiers:

```
state = 'published'  AND  is_deleted = false
AND primary_image_url IS NOT NULL      -- at least one usable image
AND slug IS NOT NULL AND sharetribe_id IS NOT NULL  -- linkable public URL
```

Of 199 synced listings: **124 eligible**, 51 closed, 23 in other states, 30
without an image. Closed listings disappear on the next sync.

## 3. Files changed

| file | change |
|---|---|
| `src/server/city-inventory.functions.ts` | **new** — the one reusable inventory query |
| `src/server/listing-sync.server.ts` | derive city + spelled-out state from the formatted address |
| `src/components/live-inventory.tsx` | shared `PoolCard`; new `CityInventorySection`; **fixed a live price bug** |
| `src/components/templates/host-acq-city.tsx` | consume loader inventory; section moved above the editorial body |
| `src/routes/p.$slug.tsx` | fetch inventory in the loader (server-rendered), pass it through |

Mirrored into this repo at `ops/east/pseo-inventory/`.

### Live defect fixed in passing

The existing card rendered the **literal string** `${(l.price / 100).toFixed(0)}/hr`
— a JSX brace-escaping error (`{"{"}` … `{"}"}`). It was visible on `/riverside`,
`/phoenix` and every city page that showed inventory. Now renders `$79/hr`, and
a missing price renders nothing rather than a fake `$0`.

## 4. Database / index changes

**None applied.** Proposed only, in `ops/east/pseo-inventory/PROPOSED_INDEXES.sql`:
partial indexes on `(state_code, city_slug)` and `(latitude, longitude)` matching
the eligibility predicate. At 199 rows Postgres sequential-scans regardless and
they change nothing measurable, so per the brief they are proposed rather than
applied. Apply at roughly 5–10k rows.

The only data written was by the existing sync into `synced_listings`.

## 5. Matching strategy

1. **Exact** — normalized `city_slug` + `state_code`. Casing, punctuation and
   spacing collapse through `normalizeCityKey()`, which mirrors the sync's
   `slugify()`, so `Riverside, CA` / `riverside` / `RIVERSIDE` are one identity.
   No substring matching anywhere.
2. **Nearby** — only when exact < 3. Bounding box on lat/lng, then exact
   haversine, sorted by distance, **60-mile radius**, de-duplicated against the
   exact set.

Caps: **8 cards total** initially; nearby only fills the remainder.

### Why the geo tier carries most of the weight

Sharetribe `publicData` rarely stores a discrete city. Measured on the eligible
set: **56 of 124** had a city string, **123 of 124** had coordinates. Parsing the
formatted address in the sync raised city coverage to **121 of 124** (city+state
119), across **109 distinct cities**. Even so, no city has more than **2** exact
listings, so nearly every page legitimately shows a nearby section.

**Nearby pools are never described as being in the target city.** They render
under their own `More pools near {City}` heading, with the explicit line
"These are nearby pools, not inside {City} itself", and each card carries
"N miles from {City}".

## 6. Page placement

Order is now: H1 + hero → **inventory** → editorial body → nearby cities → FAQ →
related links. Verified in the HTML: inventory at byte 41,452 vs the prose body
at 53,655.

## 7. Test cities

| case | URL | result |
|---|---|---|
| several pools | `/p/become-a-swimming-pool-host-los-angeles-ca` | 2 exact + 6 nearby, **8** real `/l/` links |
| one or two | `/p/become-a-swimming-pool-host-riverside-ca` | 2 exact + 6 nearby, **8** links, distances 10 mi / 13 mi |
| zero exact | `/p/riverside-ct` | truthful empty state, **0** listing cards, no skeleton |

Listing IDs returned for Riverside CA include `6a012639-0f99-44ec-8959-c6d9c6019027`
(Bronson Way Hideaway, exact) and `689d6690-2fad-40ab-bf82-f89b07771533`
(The Orange Grove Lagoon, exact); nearby included `68a27d86…` (Hilltop Tropical
Oasis) and `6a94fb19…` (Private Resort in Orange Hills).

Match reason is returned on every lookup (`exact_city` / `exact_plus_nearby` /
`nearby_only` / `none`) for debugging.

Generated `/l/{slug}-{id8}/{id}` URLs were confirmed to return **200** on the
marketplace. Canonicals were not touched and remain self-referential; no
`robots` meta is emitted, so nothing was noindexed for low inventory.

## 8. Performance

| page | before | after |
|---|---|---|
| `…riverside-ca` | 133,745 B | 147,448 B (**+13.7 KB, ~+10%**) |
| `riverside-ct` | 109,034 B | 109,897 B (**+0.9 KB**) |

- **Queries per page: at most 2** — one exact lookup, plus one bounding-box
  query only when exact < 3. No N+1, no per-card query, no Sharetribe call at
  request time.
- Origin TTFB after: 0.560s (Riverside CA), 0.420s (LA), 0.208s (Riverside CT).
  The pre-change figure of 1.466s was measured through the edge on a cache miss,
  so it is not a like-for-like comparison — treat the after-numbers as the
  baseline going forward.
- **Images**: first three cards `loading="eager"` (LCP), the rest `lazy`, all
  with explicit `width`/`height` to avoid CLS. Images are existing imgix URLs
  already sized to 400px wide — no full-resolution originals are shipped.
- Core Web Vitals risk: low. Cards are static server-rendered markup with fixed
  aspect ratios; no client JS was added.

## 9. Freshness

`POST /api/public/hooks/sync-listings` (hook-authorized) upserts on
`sharetribe_id` and marks absent listings. Published / closed / deleted / moved
all flow through on the next run. **No cron was installed** — a cadence is
proposed separately for approval, per instruction. Until then inventory is
refreshed only when that hook is invoked manually.

City pages read the table per request, so they hold no copies of listings.
Editorial copy and inventory are separate layers; nothing regenerates page copy
when a pool opens or closes.

## 10. Analytics — deliberately not added

Step 11 was conditional on existing infrastructure. There is a
`track-city-click` endpoint writing `city_link_clicks`, but **no page-view
analytics of any kind** (no gtag, plausible or posthog anywhere in
`src/lib` or `src/components`). Adding "city page viewed" would mean introducing
new tracking infrastructure, which the brief ruled out, so nothing was added.
Integration point if wanted later: `src/routes/api/public/track-city-click.ts`.

## 11. Data-quality problems discovered

1. **`content_pages.city_id` is NULL on all 4,008 city pages**, and `state_code`
   is NULL too. City identity is recoverable only from the slug/title. The
   loader compensates via `cityForContentPage() ?? page.slug` → `parseCitySlug`.
   Populating `city_id` would make this robust instead of derived.
2. **`is_published` is false on all 4,008** — `status='published'` is the real
   gate. Anything filtering on `is_published` silently returns nothing.
3. **163 of 598 `cities` rows have no coordinates** (including `riverside-ct`
   and `riverside-il`). Those pages can never show a nearby fallback — this is
   exactly why `/p/riverside-ct` renders the empty state rather than CT/NY
   inventory. Backfilling city centroids is the single highest-value fix for
   inventory coverage.
4. **Sharetribe rarely stores a discrete city** — worked around in the sync, but
   the listing wizard could capture city/state as structured fields instead.
5. **Apparent duplicate listing**: "Swim & Relax in Style……Personal Oasis" at
   Rocky Point NY 11778 appears twice in the eligible set.
6. **Only 1 of 199 listings has a capacity value**, so the guest-capacity chip
   almost never renders. Amenities are similarly sparse.
7. The corpus is heterogeneous: some `host_acq_city` pages are
   "Become a Pool Host in Riverside, OH", others "Pool Rental in Riverside, CT".

## 12. Coverage

All **4,008** `host_acq_city` pages (3,943 in sitemap) now execute the inventory
lookup. How many display cards depends on supply and on city coordinates:
124 eligible listings spread over 109 cities, with 435 of 598 cities carrying
the coordinates needed for the nearby tier.

## 13. Not done / follow-ups

- **No cron for the sync** — proposed separately, awaiting approval.
- Indexes proposed, not applied.
- `riverside.tsx` / `phoenix.tsx` still read the old build-time snapshot. They
  were left alone to limit blast radius; they now share the fixed card, so the
  price bug is gone there too.
- The `fresh-web` commit could **not be pushed** — no GitHub credentials on EAST
  (`could not read Username for 'https://github.com'`). The commit exists
  locally on the box; it needs pushing from somewhere with credentials or the
  work lives only on that disk.
