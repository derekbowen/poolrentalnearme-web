# SEO phase 2 — evidence tables and proposals (no production changes)

2026-09-25. Nothing in this record has been deployed. Every table is a proposal
awaiting Derek's decision. Full per-URL data is in `docs/seo/*.csv`.

## 1. Search Console comparison data — blocked on an export

There is no programmatic GSC access: the fresh-web `gsc-sync` needs Lovable's connector
gateway keys (not set anywhere on EAST or WEST, nor in any backup), no Google service
account exists on either box, and Zapier has no Search Console app. The comparison has to
come from the GSC UI:

1. Performance → Search results → Date → **Compare** → "Last 28 days" vs "Previous period"
   → Apply → Export → Download CSV. The zip contains Queries, Pages, Countries, Devices,
   Search appearance and Dates, each with both periods side by side.
2. Same again with **Compare → "Compare last 28 days year over year"** (GSC keeps 16
   months, so this exists if the property is older than September 2025).
3. Indexing → Pages → click each reason → Export: **Not found (404)**, **Server error
   (5xx)**, **Page with redirect** (plus "Crawled – currently not indexed" if convenient).

Then: `python3 ops/seo/gsc_compare.py <export.zip>` splits the click change into demand,
ranking, CTR/SERP, query mix, lost/new queries and (for Pages) indexation/URL change, and
lists the top losers with their class. Tested on a synthetic export with known answers.
The UI exports top 1000 rows only; the script reports what share of the change the rows cover.

Durable option (needs Derek): create a Google Cloud service account, add its email in GSC
as a restricted user, and the comparison can be pulled on demand without exports.

## 2. Public-pools feature URLs — `docs/seo/feature_url_candidates.csv`

916 distinct `/public-pools/<state>/<city>/feature/<feature>/` URLs were requested in the
last 14 days or appear in GSC. All currently 301 to the city hub (nginx
`feature-interim-301`; pp-ssr never had a feature route — the pages came from the
Lovable-era app). Matching pools = published pools in that city whose amenities/pool_type
match the feature; "indexable" = present in the live public-pools sitemap.

| Class | URLs | GSC clicks (3 mo) | GSC impr (3 mo) | Googlebot (14 d) | Rule |
|---|---:|---:|---:|---:|---|
| REBUILD | 9 | 22 | 443 | 1 | ≥3 matching pools that are indexable today, hub indexable, and GSC clicks ≥1 or impressions/AI impressions ≥50 |
| CONSOLIDATE | 767 | 216 | 7,386 | 312 | some demand or crawl interest but <3 indexable matches — keep the 301 to the hub (to the state page where the hub is noindex) |
| RETIRE | 140 | 0 | 0 | 126 | no demand signal and ≤1 matching pool (or no city record) — 410 |

The highest-demand feature URLs are thin: Oklahoma City "heated" (453 impr), Beaverton
"lazy river" (416), Seattle "heated" (290) each have exactly one matching pool. Rebuilding
them would recreate thin pages; they stay consolidated.

REBUILD candidates: Virginia Beach lap-swimming (3/3 pools, 75 impr), Deltona lap-swimming
(3/3, 71), Naples lap-swimming (3/3, 71), Mooresville lap-swimming (3/3, 63), Arlington VA
kiddie-pool (3/3, 57), Irving lap-swimming (3/3, 36), Richardson lap-swimming (4/4, 33),
Pflugerville lap-swimming (3/3, 22), Garden City NY lap-swimming (3/3, 15).

Internal links: none. No current page links to a feature URL; the referrers in the logs are
the redirect's own echo and the retired Lovable per-state sitemap
(`/pools-directory-sitemap.xml?state=…`) that crawlers still remember. Backlinks: no
backlink data source is connected (no Ahrefs/Semrush/GSC Links export); external-referrer
hits in 14 days of logs are in the CSV as a weak proxy (50 total).

## 3. Wrong-audience city redirects — `docs/seo/city_redirect_map.csv`

The URL family (`/p/<city>-<st>` from the July cutover) is 169 URLs — 4 fewer than the
earlier estimate of 173, whose regex also caught non-city slugs. Live today: 38 return 200
(real pages, keep), 93 redirect, 38 404. **77 redirect to a host-acquisition page**; 16 go
to `/p/pool-rentals` or `/`.

Key finding: there are almost no guest-intent city landing pages on `/p/`. Pages titled
"Pool Rental in <City>, <ST>" (`host_acq_city` template) render the H1 "Rent your <City>
pool by the hour. 0% host fees. Keep 100%." — host recruitment — and the `resource` city
pages (`/p/akron` etc.) are mixed host/guest copy led by "Why host in <City>". A destination
was accepted as a guest city page only if its H1 is guest-intent and names the same city and
state; only `/p/riverside` qualifies.

Proposed for the 131 non-live URLs: guest city page 1, indexable public-pools city hub 47,
search `/s?address=<City>, <ST>` 78, leave 404 5 (not a US-city URL, e.g. a monitor probe).
The redirects are `content_pages` rows (`template_type='redirect'` / `redirect_to`), so the
change is a data update on EAST, not a deploy.

Observation for Derek (not changed): `/p/akron` and similar pages carry the byline
"By Derek Bowen, founder of Pool Rental Near Me and author of 7 books on pool hosting".
I cannot verify "7 books"; if it is not accurate it falls under hard rule 1.

## 4. Lost articles — `docs/seo/lost_article_ranking.csv`

731 `/p/` article-like URLs in the 404 log (excluding city, host, Spanish-host, comparison
and scanner junk); 668 still 404/410. Score = 404-log hits + 5×Googlebot(14 d) + 20×GSC
clicks + GSC impressions/10 + 3×external referrers. None of the top 25 appears in GSC's
top-1000 pages for the window, so their value is residual demand and links, not current
rankings. Automatic similarity matching proved unreliable (it paired
"increase-pool-rental-income" with a tax page), so the top 25 were decided by hand against
live, verified destinations (`curated_*` columns).

Result for the top 25: REDIRECT 17, 410 4, HOLD for Derek 2 (insurance topics, hard rule 8),
RESTORE 0 — no original content rows exist in `content_pages` for them, and restoring
would mean writing new copy, which needs Derek/Brandon approval. Nothing redirects to the
homepage.

## 5. Withheld public-pools pages with demand — `docs/seo/withheld_demand_pages.csv`

20 URLs (the "19" plus `/public-pools/clothing-optional/`, now 404). **None is ready to
release**:

- 16 pool pages have 0–1 of the gate's four signals (photo, hours, rating with ≥10 reviews,
  price). The gate is doing its job: e.g. Keith Family YMCA (552 impr) has a photo only;
  Dorothy Heroy (168 impr) has 159 reviews but no photo, hours or price.
- Tulsa hub (672 impr): zero pools in the database — a soft 404 by definition.
- `concord-community-pool`: no matching pool record (renamed or removed) — investigate.
- `swimply-backyard-pool-oasis` (Las Vegas): a Swimply private listing inside the public
  pools corpus — should be removed, not released.

Recommended path, gate unchanged: enrich these specific records (hours, price, photo,
rating via the existing `enrich.py`, about 16 Places lookups) and ingest Tulsa's public
pools; they then pass the existing gate on their own merits.

## 6. Static asset retention — proposal

Evidence: every retired bundle Google requested in the last 14 days (e.g.
`/assets/ProfileSettingsPage.duck-sj1xVcSm.js`, `routes-C_UhYRTo.js`, `index-CGRVfBhm.js`)
exists only in images c193/c194 (built 2026-08-30, retired 2026-09-02) — Google's renderer
was still asking three weeks later.

Design:
- **Archive** `/var/www/prnm-asset-archive/{assets,fw-assets}/` on WEST (flat, content-hashed
  names, so files never collide) plus `releases/<release>.txt` manifests.
- **Fill** at every WEST flip (new step in the flip template, after step 3): `docker cp` the
  retiring MAIN's `dist/client/assets/.` into the archive with no-clobber and write its
  manifest. The EAST build script does the same for `dist/client/fw-assets` into an archive
  on EAST before `npm run build`.
- **Serve** only as a fallback: the existing `/assets/` location already has
  `proxy_intercept_errors on; error_page 404 = @assets_fallback_amenity`; point that at an
  archive location with `try_files $uri =404`, `Cache-Control: public, max-age=31536000,
  immutable` and `X-Robots-Tag: noindex`. EAST nginx gets the same for `/fw-assets/`. The
  current build is always tried first, so it stays authoritative.
- **No stale HTML**: the fallback only matches hashed filenames
  (`-[A-Za-z0-9_-]{8}\.(js|css|woff2?|png|svg|webp)$`); HTML, `index.html`, manifests and
  unhashed files are never archived or served from it.
- **Retention**: a file is deleted once every release that contained it has been retired
  for more than 45 days (30 days proved too short by the evidence above) and it is not in
  the last 3 retired releases. A daily prune job — disclosed when created (hard rule 4).
- **Disk bound**: 13 MB of assets per WEST build and ~335 files per EAST build; unchanged
  chunks share names, so 45 days at the current release rate is well under 250 MB on WEST
  (65 GB free) and under 150 MB on EAST (4.8 GB free). The prune job also enforces a hard cap.
- **Seed**: back-fill from the 48 retained images (c158–c202) once, so today's stale
  requests resolve immediately.

## 7. Sharetribe integration secret rotation — runbook (do not run without Derek's GO)

Exposed credential: the Integration API client whose secret fingerprint is `4d53d444`
(sha256 prefix; values never printed). A different integration client (`f64da328`), used
by EAST fresh-web, fresh-web-staging and WEST `merlin`, was not exposed and is out of scope.
Git history holds only empty placeholders.

Where `4d53d444` lives (all WEST):
- env files: `/home/ubuntu/pp-ssr/pp-ssr.env` (pp-ssr container + 12 ops scripts),
  `/home/ubuntu/live.env`, `/home/ubuntu/prod-env.env` (2 scripts), `/home/ubuntu/build/.env`;
  stale copies `/home/ubuntu/build/.env.bak-20260808T170731Z`, `/home/ubuntu/c194-restored.env`
- running containers: `poolrentalnearme-production`, `poolrentalnearme-production-rollback`, `pp-ssr`

Consumers: the marketplace server (`server/api-util/integration.js` — `/go/` share links,
calendar feeds, payouts, and more), every cron that `docker exec`s into the production
container (review-nudge, restricted-sweep, stuck-nudge, sms-extras, payouts …), pp-ssr
(private listings on public-pools pages), and about 40 scripts under `/home/ubuntu`.

Zero-downtime procedure:
1. **New credential (Derek)**: Sharetribe Console → Build → Applications → create a new
   Integration API application. The old one keeps working until it is deleted, so both are
   valid during the switch. Derek writes the new client ID and secret into
   `/root/sharetribe-integ.new` (mode 600) through AWS Systems Manager Session Manager —
   never into chat. From here on, scripts only print sha256 fingerprints.
2. **Preflight (read-only)**: token grant with the new pair against
   `https://flex-integ-api.sharetribe.com/v1/auth/token` (form-encoded,
   `grant_type=client_credentials`, `scope=integ`) must return 200, and one
   `listings/query?perPage=1` must return 200.
3. **Env files**: back up each file to a timestamped 0600 copy, replace the two values in
   the four live files, and confirm each now fingerprints to the new secret.
4. **pp-ssr**: start `pp-ssr-next` on `:3101` from the new env, check
   `/pp-ssr/health` (listings=126), move the nginx public-pools upstream to `:3101`
   (`nginx -t`, reload), stop the old container, and rename.
5. **Marketplace**: a gated flip of the *current* image (c204) whose cloned env has the two
   values overridden. The gate already exercises the integration client (`/go/` redirects,
   calendar feed verification against Sharetribe). The rollback container is recreated with
   the new env too.
6. **Verify**: run `verify_ical.py` and one read-only script from `pp-ssr.env`; for 24 hours,
   watch container and cron logs for 401s from `flex-integ-api`.
7. **Revoke (Derek)**: delete the old application in the Console. Confirm a token grant with
   the old pair (fingerprint `4d53d444`) now returns 401.
8. **Clean up**: shred the stale copies (`.env.bak-20260808T170731Z`, `c194-restored.env`)
   and the rotation backups.
- **Rollback, any time before step 7**: restore the backups and re-flip.

## The question: where did the lost clicks come from?

What the current evidence separates (Jul 7–20 vs Sep 8–21; GSC daily totals and the
3-month top-1000 page export):

| Component | Evidence | Share of lost clicks |
|---|---|---|
| URL/template changes | Pages that earned clicks in the window and are now noindex, redirected or 404: `/s?address` noindex 423, feature pages 301 238, gated pool pages 102, listing consolidation 67, other `/p/` 54 (886 clicks over 3 months) | at most ~11% of window clicks; its share of the *decline* needs the per-period Pages export |
| Indexation of pages still live | Indexed count −1,993, concentrated Aug 16–Sep 6 alongside the cleanups; per-URL attribution needs the GSC indexing exports | not quantifiable yet |
| Ranking | Impression-weighted position 11.6 → 11.7 sitewide | no sitewide ranking loss; per-query losses unknown |
| Impressions at the same position | −57% | cannot be split into demand vs per-query rank loss without the comparison export |
| CTR/SERP and query mix | CTR −49% at a flat position; the CTR fall starts the week impressions rose after the public-pools release widened (Jul 30) | mix shift is the leading explanation; unconfirmed without the query export |

Seasonality is **not** claimed. It becomes a finding only if the year-over-year export
shows the same impressions fall at stable positions for the same queries.
