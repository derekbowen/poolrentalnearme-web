# Homepage baseline — fall/winter 2026

Captured **2026-09-04**, before any redesign work. Read-only: every number below
comes from fetching the live production homepage or its assets. Nothing was
deployed, and no homepage code was changed.

`/` is the strongest SEO URL on the property, so this file exists to make any
regression provable rather than arguable.

---

## 0. Blocker found while capturing this — read first

**The live homepage source code is in neither GitHub repository.** Both copies
are stale, and both would cause damage if built and shipped.

| | `derekbowen/fresh-web` | `derekbowen/fresh-web-702e04c3` | **LIVE** |
|---|---|---|---|
| last push | 2026-05-06 | 2026-07-16 | — |
| homepage `noindex` | **`noindex: true`** (`src/routes/index.tsx:29`) | no (comment warns against it) | indexable |
| host fee copy | — | **"10% flat host fee"** (`home-page.tsx:199`) | 0% host fees |
| insurance copy | **"$2M liability insurance for the host"** (`home-page.tsx:27`) | **"$2M Hartford-backed insurance"** (`home-page.tsx:199,245`) | *"does not provide or arrange insurance"* |
| vanity stats | **"★ 4.8 average rating · 50,000+ guests booked"** (`home-page.tsx:195`) | same shape | none |
| H1 | older | older | "Rent a pool you'll fall in love with." |

Live is **correct** on all four counts. The repos are wrong on all four.

Proof the live page descends from fresh-web and not the marketplace app:
production serves `/fw-assets/*.js`, matching `fresh-web/vite.config.ts:30`
(`assetsDir: "fw-assets"`). Proof it is ahead of both repos: the live headings
`Host Fees — Now Permanent` and `Love notes 💌` appear in **neither** repo,
while `Any excuse is a good one to dive in` appears only in `fresh-web-702e04c3`.

This is the EAST equivalent of the WEST `/home/ubuntu/build` drift already
documented in `CLAUDE.md` — a loose working copy on the box has become the real
source, and git has fallen behind. Consequence for this project: **any homepage
change built on either GitHub copy would ship a `noindex` on `/`, a false $2M
insurance claim, a 10% host fee, and a fabricated 4.8 rating / 50,000-guest
statistic.** Phase 1 must not start until the authoritative source is recovered
from EAST.

---

## 1. Identity and SEO surface (live)

| | Value |
|---|---|
| URL | `https://www.poolrentalnearme.com/` |
| Serving app | fresh-web (EAST, pm2), nginx/1.18.0 |
| Title | `Pool Rental Near Me — Rent a Pool by the Hour \| Private Pools Near You` |
| H1 | `Rent a pool you'll fall in love with.` (1 × `h1`) |
| Canonical | `https://www.poolrentalnearme.com/` (self) |
| Robots meta | none present → indexable |
| Description | "Rent a pool near you by the hour — private backyard pools, heated pools & hot tubs from real hosts. 0% host fees, hosts keep 100%. Book a private pool rental in minutes." |
| Structured data | `Organization`, `WebSite` + `SearchAction`, `FAQPage` (7 Q/A), `ContactPoint` |
| Headings | 16 × `h2`, 21 × `h3` |

The H1 already matches the direction proposed for the redesign, so that is a
preservation task, not a change.

### Current FAQ (schema-backed, 7 questions)

1. How do I rent a pool near me?
2. How much does it cost to rent a pool?
3. Is the pool host insured if a guest gets hurt?
4. How do I contact a pool owner before booking?
5. Can strangers really swim in my private pool safely?
6. Is it free for kids and families?
7. How does Pool Rental Near Me make money?

The insurance answer currently reads *"Pool Rental Near Me does not provide or
arrange insurance. Every booking requires a signed guest waiver, and we do not
verify whether hosts…"*. **This wording is founder-owned** (`CLAUDE.md` rule 8)
and must be carried across verbatim, not paraphrased, softened, or re-derived.

### Current section order (live `h2`s)

1. Already renting your pool on Swimply or Facebook Marketplace?
2. Host Fees — Now Permanent
3. Two ways to fall for summer.
4. Any excuse is a good one to dive in.
5. Love notes 💌
6. Tour Katy's Staycation Saltwater Getaway
7. Learn with Fred — the only Pool Host Academy on the internet.
8. Rent a pool near you
9. Questions?
10. Host smarter, host legally.
11. How to rent a pool
12. Browse by pool type
13. Pool rentals in …
14. Got a pool? Turn it into income.
15. Stuck on anything? Text Derek.
16. Swim with us everywhere 💙

Note the ordering problem the redesign is meant to fix: **host-acquisition and
Swimply-comparison content occupies positions 1–2, above any renter search or
inventory.** The renter's own entry points ("Rent a pool near you", "How to rent
a pool") sit at positions 8 and 11.

---

## 2. Weight and structure (measured)

| Metric | Value | Note |
|---|---|---|
| SSR HTML | **126 KB** (129,449 bytes) | |
| JS transferred | **920 KB** across 4 files | `/fw-assets/index-Dbzl3FRr.js`, `/fw-assets/index-DqTt9-Fr.js`, `/tools/home.js`, `/tools/cta.js` |
| CSS transferred | **213 KB** (1 file) | `/fw-assets/styles-Bkw4jYX1.css` |
| Images | **3,101 KB** across 37 measured | dominant payload |
| **Total measured** | **≈ 4.26 MB** | |
| SSR element count | 843 | |
| `<img>` tags | 38 | |
| **`<img>` without width/height** | **33 of 38** | primary CLS risk |
| `<img loading="lazy">` | 33 | |
| `<script>` tags | 8 | |
| `<a href>` | 203 (150 distinct internal) | |

**The image payload is the performance story**: 3.1 MB of images against 920 KB
of JS. Any redesign that adds more photography without responsive `srcset` and
explicit dimensions will make this materially worse. Conversely, fixing the 33
undimensioned images is the single highest-leverage CLS win available and is
worth doing independent of the redesign.

### Not captured — and why

| Metric | Status |
|---|---|
| LCP, CLS, INP (real) | **not captured.** Chromium is installed here but cannot complete TLS through the session's egress proxy (`ERR_CONNECTION_RESET`), and the public PageSpeed Insights API returned `Quota exceeded` for the shared unauthenticated project. Needs either a PSI API key or the Search Console Core Web Vitals report. |
| GSC clicks, impressions, CTR, avg position | **not captured.** No Search Console access from this session, and `list_projects` on the Supabase connector returns empty, so the `admin.gsc-import` data in fresh-web is also unreachable. |
| Position for "pool rental near me" | not captured (same reason) |
| Homepage → search / listing / host-CTA CTR | **not captured.** No analytics events for these exist yet — instrumenting them is Phase 1 work, so there is no historical series to baseline against. This is a genuine gap, not an omission: the "before" number will have to be the first week after instrumentation ships. |

These gaps are real and I am not going to estimate around them. Two of the three
are unblocked by a single PSI API key plus Search Console access.

---

## 3. Destination inventory — what the redesign can actually link to

Checked live, HTTP status:

| Path | Status | Usable as a destination? |
|---|---|---|
| `/s` (Sharetribe search) | 200 | yes — fallback only |
| `/p/pool-rentals` | 200 | yes |
| `/p/all-locations` | 200, indexable | yes — full city directory, **6,146 city links** |
| `/p/heated-pool-rentals` | **200** | **yes — the heated winter card has a real home** |
| `/p/indoor-pool-rentals` | **404** | **no** |
| `/p/indoor-pools` | 404 | no |
| `/p/heated-pools` | 404 | no |
| `/p/winter-pool-rentals` | 404 | no |

**Flagged, per the "do not create junk links" rule: there is no indoor-pool
destination page.** The fall/winter block can ship its *heated* card today; its
*indoor* and *winter-birthday* cards have nowhere to point. Either those pages
get built first, or the block ships with the one card that is real.

City pages use the shape `/p/<city-slug>` (`/p/akron`, `/p/agoura-hills-ca`),
with a small number of legacy bare-root cities (`/phoenix`, `/riverside`).

### Sitemap coverage — a Phase 2 prerequisite that is currently unmet

`/sitemap.xml` indexes **14** sub-sitemaps: static, comparisons, host-acquisition
(×4 pages), event-guides, articles, academy, advocacy, spanish, swim-instructor,
blog, public-pools. `/sitemap-static.xml` carries **74** URLs.

**There is no city sitemap.** The ~6,146 city pages are not in any sitemap; they
are reachable through `/p/all-locations` (which is indexable) and through the
homepage's own 102 city links.

This directly constrains Phase 2. The brief says the full directory must remain
crawlable before the homepage city dump is removed — `/p/all-locations` does
satisfy that today, but with no city sitemap the homepage links are a meaningful
second discovery path. **A city sitemap should ship before, not after, the
homepage city list is cut.**

---

## 4. Re-running this capture

Everything above is reproducible with `curl` plus the two commands recorded in
this file's git history. When the redesign lands, capture the same table and
diff it. The specific numbers that must not regress:

- JS transferred ≤ 920 KB
- image payload ≤ 3,101 KB
- SSR element count ≤ 843 (+10%)
- `<img>` without dimensions: must go **down** from 33
- canonical, single `h1`, `FAQPage` + `Organization` + `WebSite` schema all still present
- `/` still has no robots `noindex`

---

## 5. Two live-only scripts that are not in any repo

The homepage loads `/tools/home.js` (1.1 KB) and `/tools/cta.js` (14.8 KB). Neither
exists in either GitHub repository, and both mutate the page after hydration.

### `/tools/home.js` — a post-hydration DOM patch

It walks the text nodes of the rendered page and rewrites content the deployed
build got wrong:

```js
var COURSES = "193";
... n.nodeValue.replace(/135 free classes/g, COURSES + " free classes")
... if (/Rent a private pool by the hour/i.test(h1s[j].textContent))
      h1s[j].textContent = "Support what you love, 0% Host fees";
... links[i].setAttribute("href", "/p/pool-host-tools")
```

So the course count, an `h1`, and at least one internal link are being corrected
in the browser because the deployed bundle is stale. This is the "193 courses"
hardcode the brief warns about, and it is a *third* place the number lives —
after the bundle's own "135" and whatever the authoritative source says. It also
means the H1 Google sees on first paint can differ from the H1 a user sees.

Anything the redesign does to the hero must account for this patch, or the patch
will rewrite the new H1 too.

### `/tools/cta.js` — injected schema, a floating CTA, and the analytics we already have

Four modules: `prnm-org` (Organization JSON-LD on every page), `prnm-edu`
(Course JSON-LD), `prnm-a` (**first-party funnel beacons — pageviews and SPA
navigation**), a floating host CTA, and `prnm-quotes` (a homepage host-quotes
ticker).

**This answers the "use the existing analytics architecture" requirement.** There
is no Plausible, GA, PostHog or Segment anywhere in fresh-web. The only analytics
on the homepage is this first-party beacon:

```
navigator.sendBeacon("/tools/cta-beacon?e=" + ev + "&f=" + fam)
fetch('/tools/cta-beacon?e=q-' + st, { method: 'POST', keepalive: true })
```

The Phase 1 events (`homepage_search_started`, `homepage_search_submitted`,
`homepage_search_to_pseo`, …) should ride `/tools/cta-beacon`, not a new stack.
Where that endpoint writes to is on EAST and could not be inspected from here.

---

## 6. FOR DEREK — an insurance contradiction that is live right now

I am not making a judgement about the coverage itself and I have not touched it.
Reporting it because the two statements are on the same page and disagree.

`/tools/cta.js` line 16 injects `Organization` JSON-LD, **on every page**, whose
`description` reads:

> "U.S. marketplace for renting private swimming pools by the hour. 0% host fees
> through 2026; **every booking includes $2M liability protection via The
> Hartford**."

The visible `FAQPage` schema and on-page copy on that same homepage read:

> "Pool Rental Near Me **does not provide or arrange insurance**. Every booking
> requires a signed guest waiver, and we do not verify whether hosts…"

So the machine-readable claim and the human-readable claim contradict each other
on the strongest URL on the property. Both are live today.

Per the house rule, insurance wording is yours. I have not edited either one, and
I am not proposing wording. You decide which is correct and tell me the exact
words; those words will be the entire change.

Related: the stale `$2M`/Hartford claims in both GitHub repos (§0) are the same
family of copy, which suggests the schema line is a survivor from that era rather
than a deliberate current statement — but that is a guess, and it is your call,
not mine.
