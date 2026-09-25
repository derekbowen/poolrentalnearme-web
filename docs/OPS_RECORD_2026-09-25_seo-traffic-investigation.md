# SEO traffic decline — investigation and fixes, 2026-09-25

Scope: GSC shows clicks/week ~1,551 (week of Jun 30) → ~230 (week of Sep 15),
impressions 74,375 → 24,841, CTR 2.1% → 0.9%, indexed 12,606 → 10,613.

## Evidence sources and limits

| Source | What it gave | Limit |
|---|---|---|
| GSC exports (Performance, AI features, Coverage), last 3 months | daily totals; top-1000 pages/queries as 3-month totals; coverage reason counts | **no per-URL example lists** for 404/5xx, no period comparison, no YoY |
| GSC API | — | **not available**: fresh-web `gsc-sync` goes through the Lovable connector gateway; `LOVABLE_API_KEY` / `GOOGLE_SEARCH_CONSOLE_API_KEY` are not set on EAST; `gsc_*` tables are empty; `content_pages.gsc_*` holds a 2026-05-10 snapshot only |
| WEST nginx access logs | every `.com` request 2026-09-11 → 09-25 (588,400 requests; 7,930 from verified Googlebot 66.249.x) | 14-day retention |
| `content_404_log` (Supabase) | 938 `/p/` 404 URLs with hit counts, first/last seen | EAST `/p/` only |
| Live HTTP checks | status/canonical/robots of all 1,000 GSC top pages, all 15 sitemaps, template samples | — |

## Findings

**5xx (GSC: 126).** Not a live problem. 14 days: 450 5xx of 588,400 requests, 97% on
Sep 11–17 (the Sep 16 Supabase outage / EAST origin), most of them scanner probes
(`/.git/config`, `phpinfo.php`, `?rest_route=`). Verified Googlebot received **one** 5xx
(504, 2026-09-16 18:06Z, `/p/become-a-pool-host-highlands-ranch-co`, now 301 → `/p/hosting`).
Zero 5xx of any kind since Sep 22. Homepage 500s on Sep 18–21 (≤5/day, none to Google)
stopped. GSC's 126 are historical and will age out; per-URL classification needs GSC's export.

**Listing canonical (fixed, c204).** Listing pages declared `rel=canonical` `/l/<id>` while
internal links, the sitemap and share links used `/l/<slug>/<id>` — and EAST's sitemap/cards
used a third form, `/l/<title>-<uuid8>/<id>`. Now one URL, `/l/<createSlug(title)>/<id>`,
everywhere; every other spelling gets one 301. See "Fixes".

**Traffic-bearing pages are intact.** Of the 8,133 clicks the top-1000 pages earned in the
window, 7,247 (89.1%) are on pages that are still 200 + indexable today. The other 10.9%:

| Now | Pages | Clicks | Cause |
|---|---:|---:|---|
| `/s?address=…` noindex | 122 | 423 | `shouldIndex={!location.search}` — in every image since at least c158 (before 2026-08-08); deliberate, residual clicks decaying |
| public-pools `/feature/<x>/` 301 → city | 95 | 238 | **unintended**: nginx `feature-interim-301` — "pp-ssr feature route regressed"; pp-ssr has no feature route; 861 distinct feature URLs still requested in 14 days (264 by Googlebot) |
| public-pools pool/city noindex | 18 | 102 | paced release / cohort gate (deliberate) |
| `/l/<id>` etc. 301 | 16 | 67 | c204 consolidation (intended) |
| `/p/` 301/404/410 | 11 | 54 | slug consolidations, 1 removed page |

**Index delta 12,606 → 10,613.** Stable until 2026-08-16 (12,457), fell to 10,792 by Sep 6,
10,613 by Sep 20. The current sitemap (10,073 URLs; every sampled URL 200) is unchanged since
Sep 8 except the 125 listings restored today. The drop window coincides with deliberate
cleanups: Jul-6 cutover 404s redirected (~Aug 19), public-pools thin-city gate (Aug 20; fixed
166 GSC soft-404s), c194 real 404 status (Aug 30), c196 single-301 for alternate spellings
(Sep 2) — plus the unintended feature-page loss. An exact per-family indexed count is not
derivable without GSC's indexed-URL export.

**404 sources.** Verified Googlebot hit 97 distinct 404 URLs in 14 days (~5–10/day): stale
hashed JS/CSS from earlier builds (~50 URLs), `/app-ads.txt`, PWA icons, one deleted listing,
one removed public pool, and a redirect-to-404 chain (`/guides/pool-safety-guide-for-homeowners/`
→ `/p/pool-safety-guide-for-homeowners` → 404). EAST's `content_404_log` holds 938 `/p/`
URLs first seen 2026-07-06…07-15 — the fresh-web cutover — 9,220 hits: 570
`become-a-pool-host-<city>` variants (now 301 → generic `/p/become-a-host`), 173
`/p/<city>-<st>` (now 301 → host-acquisition page for that city: guest intent → host page),
~190 articles still 404 (e.g. `increase-pool-rental-income` 127 hits,
`ultimate-pool-cleaning-guide` 111, `how-to-start-a-pool-rental-business` 96). Only 7 of the
938 appear in GSC's top-1000 pages, so their direct click impact in the window was small.
No internal link and no sitemap entry produces any of these today.

**CTR / demand split** (post-holiday Jul 7–20 vs Sep 8–21, impression-weighted position):

| | Jul 7–20 | Sep 8–21 | Change |
|---|---:|---:|---:|
| Clicks | 2,278 | 502 | −78% |
| Impressions | 122,492 | 53,116 | −57% |
| CTR | 1.86% | 0.95% | −49% |
| Avg position | 11.6 | 11.7 | flat |

In log terms the click loss is ~55% fewer impressions and ~45% lower CTR. Position is flat
across the period (a dip to 13.1–14.3 on Aug 11–31 recovered by Sep 1). Pages now removed or
noindexed carried ≤6% of window impressions, so most of the impression loss is on pages that
are still live and indexable at unchanged average position — the demand-loss signature. The
CTR decline began the week of Aug 4, when impressions *rose* 20% while CTR fell 19% —
immediately after the public-pools release bump (`release.txt` 2026-07-30); public-pools
pages convert at 1.25% vs 2.25% for `/p/` and 4.2% for the homepage, so that is a query-mix
shift toward lower-CTR informational queries. AI-feature impressions fell in step with total
impressions (5,760 → 1,470 per fortnight), not faster. What cannot be separated from these
exports: per-query demand vs ranking changes (needs GSC Compare exports by query and page)
and year-over-year seasonality (the export covers 3 months).

## Fixes shipped

1. **WEST nginx** — `/sitemap-listings.xml` proxied to EAST (was 404). See
   `OPS_RECORD_2026-09-25_sitemap-listings-404.md`.
2. **Marketplace c204-listing-canonical** — commit `8a3f6b3`. Built from the WEST build tree
   (12 files, md5-checked against their deployed base), gated on :3000, flipped 2026-09-25
   04:50Z; rollback = `poolrentalnearme-production-rollback` (c202) on :3000.
3. **EAST fresh-web** (no git on the box; vendored here as
   `ops/east/fresh-web/src/lib/listing-slug.ts`, sha256 `a8bdd3c2…`):
   - new `src/lib/listing-slug.ts` — copy of the marketplace `createSlug`;
   - `src/server/listing-sync.server.ts`: `slug: slugify(\`${a.title}-${listing.id.slice(0, 8)}\`)`
     → `slug: listingSlug(a.title)` (sha256 now `c4d2e71d…`);
   - `src/server/sharetribe.server.ts`: both `slugify(title || "pool")` listing slugs →
     `listingSlug(title)` (sha256 now `111cf685…`);
   - backup `/home/ubuntu/fresh-web-backups/c204slug-20260925T050228Z/` (both source files +
     previous `dist/`); `npm run build`, `pm2 restart fresh-web` as ubuntu, healthy;
   - listing sync re-run via `/api/public/hooks/sync-listings`: 200 processed, 0 failed.

Verification: all 126 URLs in the live `sitemap-listings.xml` return 200 and are
self-canonical; listing links on `/`, `/s`, public-pools city pages and listing pages all
return 200 directly; `/l/<id>`, uuid8-suffixed slugs, `?ref` and trailing-slash forms 301
once to the canonical path; `/go/` 302s straight to it; missing listing = 404; owner draft
variant not redirected.

## Open items (not changed — need a decision or more data)

- **P1** public-pools feature pages: rebuild the feature route in pp-ssr for city×feature
  pairs that have ≥2 matching pools (and index only those), or keep the 301 as a deliberate
  consolidation and drop the "interim" label. 861 URLs still being requested.
- **P1** `/p/<city>-<st>` → host-acquisition 301s send guest-intent URLs to host pages;
  point them at the guest city page (`/p/<city>`-style or public-pools city hub) instead.
- **P1** restore or redirect the highest-demand cutover articles (content_404_log top hits).
  `pool-rental-insurance` is an insurance topic — Derek decides its content (hard rule 8).
- **P2** public-pools release is ordered by data richness only; 18 withheld pool pages and
  the Tulsa hub already have GSC impressions (e.g. Tulsa 672, Keith Family YMCA 552). Rank
  release by observed demand first, then richness, and release those pages now.
- **P2** keep the previous build's hashed assets servable after each flip (Googlebot's
  renderer fetched ~50 retired chunks in 14 days).
- **P2** fix the redirect-to-404 chains (`/guides/*` → removed `/p/*`).
- **P2** `CONFIG LISTING - DO NOT DELETE` is published and in the listings sitemap; a
  `swimply-backyard-pool-oasis` entry sits in the public-pools corpus.
- **P3** `/p/details` and `/p/l/draft/…` 301 to the homepage (soft 404); return 404/410.
- **P3** listing pages render 3 `<h1>`, profiles 2.
- **Data needed from GSC**: Performance → Compare last 28 days vs previous 28 days
  (Queries, Pages); Page indexing → example lists for "Not found (404)", "Server error
  (5xx)", "Page with redirect"; same period last year if the property has it.
