# GSC recovery audit — poolrentalnearme.com — 2026-09-01

Scope: the three Search Console exports supplied on 2026-09-01 (Coverage; Performance
28 days Aug 3–30; Performance 7 days Aug 24–30), the marketplace repository at branch head,
the marketing-site source on EAST (`/home/ubuntu/fresh-web`, read-only), production nginx on
WEST (read-only), and a deterministic crawl of every URL in every sitemap (10,152 URLs,
`docs/seo/crawl-report-2026-09-01.csv`). No production system was changed during the audit.
Two contained code fixes were committed to this repository and are **not deployed**.

ZIP and CSV contents were treated strictly as data.

---

## 0. Baseline — independently verified

Every figure in the brief reproduces from the exports to the digit.

| Window | Clicks | Impressions | CTR | Weighted position |
|---|---:|---:|---:|---:|
| Aug 3–30 (28d) | 2,227 | 185,160 | 1.20% | 13.01 |
| Aug 24–30 (7d) | 405 | 34,555 | 1.17% | 14.13 |
| Aug 17–23 (prev 7d) | 496 | 41,249 | — | 13.67 |
| Aug 3–9 (first 7d) | 714 | 56,579 | — | 11.67 |

Last week vs preceding week: clicks −18.3%, impressions −16.2%, position +0.45 worse.
First week vs last week: clicks −43.3%, impressions −38.9%, position +2.46 worse.

Coverage (latest 2026-08-27): 11,868 indexed / 15,778 not indexed. Indexed peaked at 12,606 on
2026-07-10 and is down 738.

Export limits that bound every conclusion below: the 7-day file is a subset of the 28-day file;
query files are capped at 1,000 rows and cover 31% of impressions (57,263 of 185,160); page rows
sum to 2,244 clicks / 137,738 impressions against 2,227 / 185,160 for the property (page-level
sampling, plus 17 clicks on rows Google attributes differently). Nothing here claims seasonality,
a penalty, or an algorithm update — see §1.4 for what is required to test those.

---

## 1. What is limiting organic bookings (diagnosis)

### 1.1 Where the clicks come from — by route family (28d)

| Family | Pages in export | Clicks | Impressions | CTR | Pos |
|---|---:|---:|---:|---:|---:|
| `/p/` marketing pages (all shapes) | 288 | 831 | 31,628 | 2.63% | 15.2 |
| Homepage | 1 | 494 | 12,997 | 3.80% | 10.0 |
| Public-pool detail | 379 | 445 | 60,393 | 0.74% | 10.8 |
| Public-pool city | 101 | 161 | 15,146 | 1.06% | 15.0 |
| Public-pool state/root | 107 | 124 | 2,820 | 4.40% | 12.6 |
| Search `/s?address=…` | 69 | 82 | 537 | 15.27% | 7.9 |
| Listing `/l/…` | 20 | 40 | 676 | 5.92% | 11.6 |
| `/p/` host-acquisition / jobs shapes | 12 | 38 | 1,912 | 1.99% | 10.5 |
| `/p/how-it-works`, `/p/neighbors`, `/p/learningacademy` | 3 | 1 | 6,927 | 0.01% | 8.8 |
| `/p/` city comparisons | 9 | 11 | 803 | 1.37% | 9.8 |
| Bare `/s` | 1 | 1 | 2,972 | 0.03% | 14.8 |

Two facts dominate:

1. **The money queries land on the homepage, not on a discovery page.** The 227 queries in the
   "rent a pool" cluster (`pool rentals near me`, `rent a pool near me`, `pools for rent near
   me`, `private pool rental`…) produced 674 clicks / 19,992 impressions at position 9.95 over
   28 days — ~168 clicks/week, the majority of all non-brand clicks — and their landing page
   is `/`. Position slipped 9.95 → 10.67 in the last week; `pool rentals near me` went
   7.2 → 7.9, `private pool rental` 9.3 → 10.3. Small, but it is the number that pays.
2. **Real supply is nearly invisible.** Listing pages (`/l/`) have the best non-homepage CTR
   (5.9%) on 676 impressions. Public-pool detail pages have 60,393 impressions at 0.74%.
   The site's search visibility is a directory of pools nobody can book, while the 124 pools
   people *can* book get 0.4% of impressions.

### 1.2 The three zero-click core pages

`/p/how-it-works` (2,318 impr, 1 click, pos 9.0), `/p/neighbors` (2,280, 0, 8.6),
`/p/learningacademy` (2,329, 0, 8.8). Position ~9 with 0.0% CTR means these rank for queries
whose intent their title does not answer. The exports cannot say which queries (no page-filtered
query data). **This is the single most valuable GSC export still missing** — see §8.

### 1.3 What the decline correlates with (evidence, not causation)

| Date | Event | Source |
|---|---|---|
| 2026-08-10 17:06–17:26 UTC | 1,967 pages rewritten in one 20-minute pass (775 event guides, 447 resources, 350 swim-instructor, 276 untyped, 60 academy…). Their sitemap `lastmod` moved to Aug 10. Process not identifiable — EAST pm2 logs rotated. | `content_pages.updated_at` |
| 2026-08-20 | `JobPosting` schema removed from all host-acquisition pages (deliberate, documented in `lib/host-acq-schemas.ts`). Job-listing search appearance: 1,798 impr / 31 clicks (28d) → 63 impr / 0 clicks (7d). | EAST source |
| 2026-09-01 03:00:00 UTC | **4,452 pages re-stamped in a single statement** — the monthly pg_cron job `refresh-related-slugs-monthly` (`0 3 1 * *`) rewrites `related_slugs` on every `host_acq_city` and `host_acq_city_es` row; the `trg_content_pages_updated_at` trigger bumps `updated_at`; `lib/sitemap.ts:197` emits `updated_at` as `<lastmod>`. Every host-acquisition page is advertised to Google as modified on the 1st of every month. | migrations + sitemap.ts |
| ongoing | 193 sitemap URLs (`/sitemap-pages-courses.xml`, all of it) are 301 redirects; 14 more redirecting URLs sit in other sub-sitemaps. | crawl |

What the data supports: the first week of August was the strongest week and the decline is
monotonic through the month; Google's index count fell 738 from the July 10 peak; 2,463 URLs
have a Google-chosen canonical and 1,956 are crawled-not-indexed. The mass rewrites and the
monthly fake-freshness event are consistent with Google re-evaluating a large templated corpus
and trusting less of it. That is a **hypothesis**. The JobPosting removal is a **known cause**
of the job-appearance drop and nothing else.

### 1.4 What cannot be known from these files

- Whether August 2026 is seasonal. Needs the previous-28-day and the same-28-days-last-year
  exports (property level and by page).
- Whether an algorithm update landed. Needs the two comparisons above plus a page-level
  before/after; a same-week decline across *every* family (it is: −19% to −37% by family)
  is consistent with either a site-wide reassessment or seasonality.
- Which queries the three zero-click core pages rank for.

---

## 2. Route-family / indexability matrix

Contract: **Indexable** (should be in sitemaps, self-canonical, 200), **Conditional**,
**Noindex**, **Redirect**, **404/410**. "Today" is what the crawl and probes measured.

| Family | Example | Owner | Contract | Today | User value / intent |
|---|---|---|---|---|---|
| Homepage | `/` | EAST | Indexable | 200, self-canonical, 1 H1 | Core "rent a pool near me" intent |
| Listing | `/l/:slug/:id` | WEST | Indexable when published | 200; **dead id → 200 + noindex (soft 404)** — fixed in repo, undeployed | The only bookable inventory |
| Listing variants | `/l/:slug/:id/:variant`, `/l/new`, edit/checkout | WEST | Noindex / auth | robots disallow + noindex | Host/renter flows |
| Search hub | `/s` | WEST | **Indexable — one discovery entry point** | 200, index,follow, **no H1** (fixed in repo, undeployed) | Generic discovery |
| Search located | `/s?address=…` | WEST | **Conditional** (see §4) | `noindex,follow` from BOTH nginx map and app | Location intent; 82 clicks @ 15% CTR |
| Search paginated/filtered | `/s?…&page=`, `/s?pub_…` | WEST | Noindex + robots disallow for `&page=` | as designed | none |
| Profiles | `/u/:id` | WEST | Noindex (thin) | **index,follow, 2 H1s**; www robots does not disallow `/u/` (EAST's robots file does, but www's robots is served by WEST) | none for search |
| City marketing (renter) | `/p/new-york-ny`, `/p/queens` | EAST `host_acq_city` | Indexable | 200; **renter `<title>` on a host-acquisition template + H1 "Rent your NYC pool… Earn $X/mo"** — mixed intent on 274 pages | Renter city intent |
| Host-acquisition city | `/p/become-a-swimming-pool-host-…` (3,943 in sitemap) | EAST | Conditional | 200; 11 advertised rows redirect; 464 pages carry 2 H1s; earnings band in H1 is a formula (rate×8×4 … ×18×4), not data | Host intent |
| Public-pool detail | `/public-pools/st/city/pool/` (2,000 crawled of 2,529) | WEST :3100 | Indexable | 200, self-canonical, FAQ + AggregateRating on every page | Public pool hours/prices; must link to nearby private inventory only where it exists |
| Public-pool city/state | `/public-pools/st/city/` | WEST :3100 | Indexable | 200 | Local aggregation |
| Comparisons | `/p/<competitor>-vs-pool-rental-near-me-in-<city>` (1,091) | EAST | Conditional | 200; 96 redirecting ones removed from sitemap 2026-08-31 | Competitor-comparison intent |
| Academy | `/p/elearning-academy-*` (207) | EAST | Indexable | 200; **193 of 200 have 2 H1s**; sitemap is a static July-20 file on WEST | Host education |
| Courses legacy | `/p/course/*` (193) | nginx map | **Redirect** | 301 → academy; **entire sub-sitemap is redirects** | none |
| Event guides | 787 | EAST | Conditional | 200; 38 with 2 H1s; 775 rewritten Aug 10 | Event planning intent |
| Articles / blog | 434 + 52 | EAST | Conditional | 200; 2 redirecting entries | Informational |
| Spanish host-acq | 446 | EAST | Conditional | 200 | Host intent, es |
| Swim instructor | 349 | EAST | Conditional | 200 | Instructor intent |
| Advocacy | 52 | EAST | Indexable | 200 | Policy content |
| ccTLD twins | `/p/*-uk`, `-canada`, `-australia` | EAST | Cross-canonical to ccTLD | canonical → ccTLD (intended); still in www sitemaps | Country intent |
| Pool-pros directory | `/p/pool-pros*` | EAST | Noindex | noindex; **still in sitemap-static** | none |
| `heater.poolrentalnearme.com` | subdomain | Hostinger Horizons app | Out of scope | 232 impr @ pos 68 | not ours |
| Auth/account/admin/API | `/account…`, `/inbox`, `/admin`, `/api/` | both | Noindex + robots disallow | as designed | — |
| Unknown routes | anything else | WEST | 404 | **404** (c194 works — verified with the real status code, every UA, every encoding) | — |
| Capitalised known routes | `/P/How-It-Works` | WEST | 404 or single 301 | **200 + noindex (soft 404)** — fixed in repo, undeployed | — |

---

## 3. Crawl and index cleanup — URL-level findings

Full CSV: `docs/seo/crawl-report-2026-09-01.csv` (10,152 rows; status, redirect chain, final
URL, X-Robots-Tag, meta robots, canonical + self check, title, H1 count, JSON-LD types, bytes,
placeholder flags; `placeholder_flags` values `nan`/`todo` are regex noise — ignore; `{{`, `}}`,
`undefined`, `null` are real).

| Check | Result |
|---|---|
| Sitemap URLs | 10,152 distinct (12,788 entries: `public-pools.xml` is advertised twice — sitemap index and robots) |
| Final status | 9,945 × 200 · **207 × 301** (0 × 4xx/5xx from this crawl) |
| Redirects advertised in sitemaps | **193** `/p/course/*` (whole `sitemap-pages-courses.xml`) + 11 `host_acq_city` rows with `redirect_to` (2 of them → `/s`) + `/p/terms-of-service` + `/p/opening-pool-for-summer` + one `underscore_slug` — full list `docs/seo/sitemap-redirect-sources-2026-09-01.txt` |
| Noindex in sitemap | 1: `/p/pool-pros` |
| Canonical elsewhere | 57, **all** intended ccTLD cross-canonicals |
| H1 ≠ 1 | 843 pages: host-acq 464×2 + 9×0, academy 193×2, cms 130×2 + 2×0, event guides 38×2, comparisons 4, swim 3 |
| Real placeholders | 5: `become-a-swimming-pool-host-lexington-sc` (`}}`), `elearning-academy-fighting-city-hall…` (`undefined`), `guide-to-family-reunion-pool-rental-pensacola-fl` (`{{ }}`), `/p/learningacademy` (`}}`), `/public-pools/texas/austin/aquatic-division-office/` (`null`) |
| Duplicate titles | 196 "301 Moved Permanently" (the course redirects); a handful of same-city-name collisions (Belmont, Danville, Derby, Fairview) |
| Sitemap index byte-stable | **No** — `sitemap-static.xml` and `sitemap-pages-comparisons.xml` index entries carry `lastmod: new Date()` |
| Content-Type | `application/xml` everywhere except `sitemap-pages-academy.xml` (`text/xml`, static file `/var/www/prnm-tools/sitemap-academy-full.xml`, dated Jul 20, 207 URLs vs 70 typed + 139 untyped academy rows in the DB) |
| Schema on every page | `AggregateRating` 9,413 × (Organization, hardcoded `5.0 / 10 reviews / 2026-05-30` in `lib/brand-rating.ts`), `FAQPage` 9,185 ×, `HowTo` 3,679 × |

GSC's 130 × 5xx, 20 redirect errors and 29 other-4xx did not reproduce on any sitemap URL in
this crawl; the coverage export contains counts only, not URLs. Those need the URL-level
coverage export (§8). The Aug 30 incident audit's 58 → 0 5xx fix is the likely explanation for
their disappearance, but that is inference.

**"Google chose different canonical" (2,463)** — grouped by pattern from what is visible: the
193 course URLs (canonical is the academy page), the ccTLD twins (57), the comparison redirects
removed 2026-08-31 (96), untyped pages that duplicate a typed sibling (139 `NULL`-template rows
including 20 `elearning-academy-*`), and pagination/filter variants of `/s`. The rest needs
the URL-level export.

**"Crawled — currently not indexed" (1,956)** — candidates from the crawl: the 2,529 public-pool
detail pages with near-identical template text and one line of local data; 3,943 host-acq pages
of which 274 carry renter titles; 464 double-H1 host pages; 8 thin/empty pages.

---

## 4. The search route — do not blanket-noindex

Today every `/s?…` is `noindex, follow` twice over: nginx `snippets/s-noindex-map.conf`
(`~^/s\?` → `X-Robots-Tag`) **and** `Page.js` (`shouldIndex={!location.search}` in both
`SearchPageWithMap.js:565` and `SearchPageWithGrid.js:373`). The 82 clicks at 15% CTR came
from URLs Google indexed before or despite that.

The qualified parameter shape is exactly one: `?address=<City, ST>` with no other params.
Every one of the top 12 clicked variants is that shape (Lancaster PA, Augusta GA, Staten Island
NY, Johnson City TN, Ontario CA, Beaverton OR, Dover DE, Lakeville MN, East Providence RI…).
Pagination (`&page=`), filters (`pub_*`, `price`, `dates`) and `bounds=` produce nothing and
should stay noindexed.

Recommendation (needs approval — it is a migration): keep bare `/s` as the **one** indexable
discovery entry point; stop the double noindex on the plain `?address=` shape only; and, for
markets with real inventory, mint clean city URLs that render the same results server-side
and 301 the `?address=` form to them, preserving `ref`/`utm`. Markets with zero bookable
listings must not get a city page — that is how the public-pool directory ended up as the
face of the site.

---

## 5. Business-claim contradiction matrix

Authority is the Terms of Service 2026.3 (`src/containers/TermsOfServicePage/terms-2026-1.js`),
effective 2026-05-06, updated 2026-08-17. Rule 5 applied: anything without an unambiguous
authority is **P0 – owner decision**, not a copy edit.

| Claim | Authoritative | Live copy | Where | Verdict |
|---|---|---|---|---|
| Host service fee | **0%** (ToS §4.1) | 0% | homepage, host-acq, hosting, advocacy, jobs feed… | consistent |
| Host service fee | 0% | **"We only charge a 10% host fee"** | EAST `lib/email-templates/renter-referral.tsx:25` | **P1 — contradiction, fix** (ToS is unambiguous; the ToS file's own comment records the 10% schedule was abandoned) |
| Host net | keeps 100% | **"Net (after 15% fee)"** | EAST `components/host-tools/tools.tsx:30` | **P1 — contradiction, fix** |
| Renter service fee | **15%** (ToS §4.1), shown all-in before payment | 15% | ToS, checkout | consistent |
| Guest waiver | **required per Swimmer** (ToS §8.1) | "Every booking requires a signed guest waiver" | homepage FAQ, page-faqs | consistent with ToS (enforcement mechanism not in marketplace code — see §8) |
| Payout speed | none in repo, process, or Stripe config readable here | **"Payout speed: 24 hours"**, "24-hour payouts", "Get paid in 24 hours" | EAST `host-acq-city.tsx:331,368,436` → **3,943 pages** | **P0 — owner decision** (needs Stripe Connect payout schedule) |
| Host earnings | none — marketplace lifetime completed GMV is $10,647 | "$1,500–$8,000/mo" (2 pages), "$3,000–$10,000/mo" (3), "$2,000–$10,000/mo", "$3,000–$15,000/**yr**", "$40–$150/hr", city H1 band = `rate×8×4`–`rate×18×4` | EAST private-pool-rental, pool-rental-app, blog, pool-maintenance, pool-party-rentals, earnings-calculator, jobs feed, state pages, every host-acq H1 | **P0 — owner decision**; house rule 1 forbids inventing a statistic; US market data may be cited *as US data* only |
| Cancellation | ToS defers to "the PRNM Cancellation and Refund Policy" — **no such page exists** (`/guest-information/cancellation-and-refund-policy-for-guests` → `/p/how-it-works`); marketplace code has no refund-window logic; listings carry per-listing policy text | "Cancel for a full refund up to 24 hours… day-of 50%" (how-it-works), "free up to 24 hours" (LA saltwater), "free up to 2 hours" (Luke's Lounge), "☐ 24 hours full ☐ <24h 50%" (host tools) | EAST | **P0 — owner decision**: the ToS promises a policy page that does not exist |
| Support | none | "24/7 support line (1-888-940-4247)", "24/7 Support — real humans around the clock" | EAST how-it-works, neighbors, comparisons; WEST `PremiumLandingPage.jsx:943` | **P0 — owner decision** (is the number live and staffed?) |
| Insurance / liability | founder-reviewed only (house rule 8) | "PRNM does not provide, arrange or include insurance…" (page-faqs ×12, homepage FAQ) | EAST | **Surfaced to Derek, not adjudicated here.** Text is internally consistent; whether it is the approved wording is his call |
| Counts | — | "~1,200 cities" (jobs feed comment), "100 cities" (admin) | EAST | P3 — internal comments, not rendered |
| Starting price | Console marketplace title | "Pool Rental Near Me - Starting at $25 hour" | Sharetribe Console page title (renders on `/p/<unknown>` 404) | P2 — verify against live minimum listing price ($35/hr lowest seen in this audit) |

Implemented in this repo: `src/config/businessFacts.js` (typed, cited) and
`server/api-util/businessFacts.test.js` (fails on any non-zero host fee, "net after fee", or
unapproved claim shape in marketplace copy; one live hit allow-listed pending Derek). The
marketing site is a separate tree — proposed patches in `docs/seo/patches-2026-09-01.md`.

---

## 6. Structured data and internal linking

- **JobPosting**: already removed 2026-08-20 on Derek's call; the 1,798 → 63 job-appearance
  drop is that removal, not a defect. No action. Do not reinstate.
- **AggregateRating on 9,413 pages**: an Organization-level rating (hardcoded 5.0 / 10 from GBP,
  snapshot 2026-05-30) is attached to every page including a 404 shell. Google's review-snippet
  policy excludes self-serving reviews on `Organization`; this earns nothing and risks a
  structured-data manual action. **P1: remove from `organizationJsonLd()`** (one file, EAST).
- **FAQPage on 9,185 pages**: eligibility is now limited to authoritative government/health
  sites; it is inert. Harmless but noisy; leave until the template pass.
- **Hierarchy**: national → state → city → listing exists for public pools; for *bookable*
  inventory it does not — the only paths to `/l/` pages are the homepage, `/s`, and three links
  on each public-pool city hub. The `/p/all-locations` dump is the de-facto index. Build state
  and city hubs for markets with inventory before touching that dump.

---

## 7. Prioritised backlog

| P | Item | Family | Evidence | Action | Risk |
|---|---|---|---|---|---|
| P0 | Payout-speed, earnings, cancellation, support-line claims | EAST copy on ~4,000 pages | §5 | **Derek decides**; then one-line template edits | none until decided |
| P0 | ToS references a Cancellation & Refund Policy that does not exist | legal | §5 | Derek + counsel; either publish the page or amend ToS | legal |
| P0 | Page-filtered queries for the three zero-click core pages | GSC | §1.2 | export needed before any title rewrite | — |
| P1 | `sitemap-pages-courses.xml` is 193 redirects | sitemap | crawl | retire the sub-sitemap (generator reads a dead `courses` table) | none |
| P1 | 14 other redirecting sitemap entries | sitemap | crawl | exclude `redirect_to IS NOT NULL` in every generator (the comparisons generator already does) + fix `sitemap-static` | none |
| P1 | Monthly fake `lastmod` on 4,452 pages | sitemap | §1.3 | derive `lastmod` from `content_refreshed_at` (real content change), omit when null; stop `refresh_related_slugs` from bumping `updated_at` | none |
| P1 | Sitemap index not byte-stable | sitemap | crawl | drop `lastmod: new Date()` on the two static entries | none |
| P1 | `AggregateRating` sitewide | schema | §6 | remove from Organization | none |
| P1 | "10% host fee" in the referral email; "Net (after 15% fee)" in host tools | claims | §5 | correct to ToS | none |
| P1 | Listing dead-id / capitalised paths = soft 404 | WEST | probes | **fixed in repo (`f926c34`)**, needs a flip | low |
| P1 | Bare `/s` had no H1 | WEST | probes | **fixed in repo (`f926c34`)**, needs a flip | low |
| P2 | 274 host-acq pages with renter titles (mixed intent) incl. `/p/new-york-ny`, `/p/queens`, `/p/austin-tx` | EAST | §2 | split: renter city page → results with inventory; host page keeps host title | needs the migration plan §9 |
| P2 | 843 pages with ≠1 H1 (academy 193, host-acq 473, cms 132, guides 38) | templates | crawl | template fix in `host-acq-city.tsx` (variant + fallback both emit H1), academy template | low |
| P2 | `/u/` profiles indexable, 2 H1s, thin | WEST | probes | noindex profiles (as EAST's robots already intends) | low |
| P2 | `/p/pool-pros` noindex yet in sitemap-static | sitemap | crawl | remove | none |
| P2 | Academy sitemap is a static July file | sitemap | §3 | generate from DB via TEMPLATE_GROUPS; type the 139 untyped academy rows | low |
| P2 | 5 placeholder pages | content | §3 | fix the 5 | none |
| P3 | `heater.poolrentalnearme.com` (Hostinger app) indexed | DNS | GSC | decide: noindex or keep | — |
| P3 | Duplicate-name cities (Belmont ×3…) share titles | templates | crawl | add state to title | none |

---

## 8. What I still need from you

**Owner decisions (block P0s):** payout timing (Stripe Connect schedule — I cannot read it, the
key is restricted); which earnings statement, if any, is approved and its source; the
cancellation policy (publish a page or amend the ToS reference); whether 1-888-940-4247 is live
and staffed and whether "24/7" stays; whether the insurance FAQ wording is the approved wording;
whether `/s?address=` clean city URLs may be minted for inventory markets (§4, §9).

**GSC exports:** (1) Performance, previous 28 days (Jul 6 – Aug 2), pages + queries;
(2) Performance, same 28 days 2025, pages + queries; (3) Pages report **filtered to each of**
`/p/how-it-works`, `/p/neighbors`, `/p/learningacademy`, `/`, `/s` — the queries tab;
(4) Coverage → each of "Server error (5xx)", "Redirect error", "Blocked due to other 4xx",
"Soft 404", "Duplicate, Google chose different canonical", "Crawled — currently not indexed",
with URLs (the supplied coverage ZIP has counts only); (5) if a read-only GSC API credential
exists, I will pull all of these myself.

---

## 9. Proposed consolidation / migration plan (needs approval — not executed)

Impact table before any bulk change (from the 28-day export):

| Group | URLs | Clicks 28d | Impr 28d | Proposed | Mechanism |
|---|---:|---:|---:|---|---|
| `/p/course/*` | 193 | 0 | 0 | remove sub-sitemap; keep the 301s | generator retired |
| Host-acq rows with `redirect_to` | 11 | 0 | ~0 | drop from sitemap (rows stay, 301s stay) | generator filter |
| Renter-titled host-acq pages | 274 | 231 (city-ST family) | 8,759 | **Phase A** retitle to host intent OR **Phase B** (inventory markets only) convert to renter city pages fed by listings | template + per-row `intent` field; no URL change, so no redirects |
| `/s?address=<City, ST>` with clicks | 69 | 82 | 537 | Phase B: clean `/pools/<city>-<st>` for markets with ≥1 published listing; 301 the parameter form; keep `/s` | new route on WEST; sitemap entry only when inventory > 0 |
| Public-pool detail | 2,529 | 445 | 60,393 | keep; add "private pools near here" block only where a listing exists within 25 mi | template |
| `/p/all-locations` | 1 | — | — | replace only after state/city hubs exist | later |

Nothing above is a mass-noindex or a bulk removal; every step is a generator filter or a
template change, reversible.

---

## 10. Measurement plan

Segment every comparison by route family (the regexes in `scratchpad/crawl_all.py`, §2 table)
and by device (mobile is 79% of clicks at position 9.0; desktop sits at 20.9).

| Metric | Baseline (Aug 3–30) | 7d | 28d | YoY | Owner |
|---|---:|---|---|---|---|
| Core "rent a pool" cluster clicks / position | 674 / 9.95 | weekly | monthly | needs 2025 export | GSC |
| Homepage clicks / CTR | 494 / 3.80% | weekly | monthly | — | GSC |
| Listing `/l/` impressions (the supply-visibility number) | 676 | weekly | monthly | — | GSC |
| Three core pages CTR | 0.01% | after title fix | — | — | GSC |
| Sitemap URLs that are 200 + self-canonical + indexable | 9,944 / 10,152 | every deploy (gate) | — | — | crawl |
| Redirects / noindex in sitemaps | 207 / 1 | every deploy (gate) | — | — | crawl |
| Indexed pages | 11,868 | — | monthly | — | GSC coverage |
| Soft 404 / chosen-other-canonical / crawled-not-indexed | 174 / 2,463 / 1,956 | — | monthly, by pattern | — | GSC URL export |
| Bookings from organic sessions | not instrumented | — | — | — | needs `ref=` on organic → checkout attribution (already have `?ref=host-share` pattern) |

Automated safeguards to add to CI (proposed, not yet wired): every sitemap URL 200 + self-
canonical + no noindex; sitemap byte-stability; exactly one H1 per indexable page; no
`{{`/`undefined`/`null` in rendered text; unknown routes 404; the `businessFacts` gate (done).

---

## 11. What was changed (this repository only; nothing deployed)

- `f926c34` — real HTTP 404 for matched-but-missing pages (dead listing id, missing CMS asset,
  capitalised path) via a per-request SSR signal; bare `/s` gets a real, always-present `<h1>`.
  Tests: `server/api-util/ssrStatus.test.js` (14, +5).
- `74d3c82` — `src/config/businessFacts.js` (approved facts, cited) and
  `server/api-util/businessFacts.test.js` (copy regression gate, 4 tests).
- `docs/seo/` — this report, the 10,152-row crawl, the sitemap-redirect list, and the EAST
  patch proposals.
- Earlier this week and relevant: comparisons sitemap already excludes `redirect_to` rows
  (EAST, 2026-08-31).

Not changed: any EAST file, any nginx rule, any sitemap, any GSC setting, any legal text.
