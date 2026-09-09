# Ops record — 2026-09-09 (evening): live homepage improvements on EAST + WEST edge

Direction from Derek: improve the live homepage, no redesign (v4 winter branch and the
Magic Patterns export are parked). Scope came from the "spa inventory and implementation
handoff" document; every claim in it was re-verified against production before acting.

## EAST — `fresh-web` (3.222.110.146), live 21:44Z and 21:53Z

Source edits were exact-anchor (46 anchors, each required to match an exact count),
type-checked against the pre-existing baseline (5 `tsc` errors before and after), built,
smoke-tested on `:3005` before the live process was touched, then `pm2 restart fresh-web`.
The first attempt aborted itself on the smoke test (two host links still pointed at the
draft URL from `site-footer-defaults.ts`) and restored source, assets and `dist/` without a
restart. Second attempt passed. A second pass added a city/state fallback for cards.

| | |
|---|---|
| Files | `src/components/home-page.tsx`, `src/server/home-data.functions.ts`, `src/server/sharetribe.server.ts`, `src/components/site-layout.tsx`, `src/lib/site-footer-defaults.ts`; assets `fred-avatar.png`, `fred.png`, `love-hero.jpg`, `love-friends.jpg` |
| Backups (root, EAST) | `/root/east-backups/homepage-20260909T214223Z/` (5 sources + `assets/` originals + full served `dist/`), `/root/east-backups/homepage-pass2-20260909T215115Z/` (sharetribe.server.ts + dist) |
| Diff | `docs/ops/east-homepage-2026-09-09.diff` (683 lines, the five sources) |
| EAST git | committed locally as `ca5f47e6` (only these 9 paths; the other 227 pre-existing uncommitted files untouched). Not pushed — no push credential on the box was used. |
| Rollback | copy the five sources and `assets/*` back from the backup dir, `rm -rf dist && cp -a <backup>/dist dist`, `sudo -u ubuntu PM2_HOME=/home/ubuntu/.pm2 pm2 restart fresh-web` |

### What changed

- **Inventory row.** The 11 generic newest-listing cards (base rate, whole dollars) are
  replaced by 9 hand-picked spa-first / indoor listings fetched by id at request time
  (`fetchListingsByIds` in `sharetribe.server.ts`, `CURATED_LISTING_IDS` in
  `home-data.functions.ts`). Each card shows title, photo, city/state, guest limit, the
  first amenity when it is a spa ("Spa add-on +$25", host-listed amount) or the
  indoor/heated category, and the marketplace display price: host price × 1.15 rounded to
  the cent, "from" when the listing has price variants — the same math as the marketplace
  `ListingCard`. Unpublished ids drop out; if the fetch fails the row falls back to the
  generic listings with the same all-in math. Excluded on purpose: "family fun in the sun"
  (pricing ambiguity per handoff), Cypress River Oasis (James Martin, do-not-contact),
  Ancaster (Canada). Mobile is a horizontal snap row; desktop keeps the 3-up grid.
- **Links.** Every host CTA goes straight to `/wizard/` (the draft URL was a 302 hop).
  Four academy tiles link to `/p/elearning-academy-…` (were `/p/course/…` 301s). Footer
  Terms → `/terms-of-service`, Host Pro Tools → `/p/pool-host-tools`, Public Pools →
  `/public-pools/`. Eagle Country (404) and KBEW (host does not resolve) removed from the
  press strip; National Law Review stays. City grid drops slugs whose `content_pages` row
  has `redirect_to` (8 of the first 72) and duplicate labels (Boston twice); heading is
  count-free ("Pool rentals by city"); phones show 24 of 60.
- **Filters that filter.** Pool-type tiles and occasion tiles used `pub_category=` /
  `event=` params the marketplace ignores (every one returned all 124 pools). They now use
  keyword searches that narrow (verified counts: birthday 39, party 28, family 69, lesson 4,
  bachelorette 3, saltwater 16, heated 34, resort 28, lap 3, hot tub 36, kitchen 9, fire
  pit 44, pet 13, theater 3) and the indoor category (`pub_categoryLevel2=indoorpools`, 5).
  Infinity (0 results) and wheelchair-accessible (1) tiles removed. Pool types are a
  horizontal row on phones.
- **Copy.** "Two ways to fall for a pool." (was "…for summer"); "this summer" dropped; FAQ
  intro no longer says "five" for seven questions; the broken fee sentence now reads "one
  clear service fee guests pay at checkout, which covers payment processing and 24/7
  support". Insurance FAQ question and answer are byte-identical before and after
  (verified in page copy and FAQPage JSON-LD, 7 questions).
- **Images.** Fred avatar 497 KB → 3 KB (now inlined, no longer preloaded ahead of the
  hero); Fred full 919 KB → 106 KB; scrapbook photos 175/337 KB → 80/83 KB; width/height
  on cards, tiles and scrapbook images (33 → 3 images without dimensions).

### Measured (390×844 phone, Chromium)

| | before | after |
|---|---|---|
| Page height | 21,770 px (25.8 screens) | 15,145 px (17.9 screens) |
| "Rent a pool near you" | 5,645 px | 765 px |
| Browse by pool type | 1,606 px | 448 px |
| Pool rentals by city | 1,334 px | 798 px |
| Desktop height | 12,498 px | 12,160 px |

## WEST — nginx edge + `/tools/cta.js`, 21:49Z

- `gzip_types` for css/js/json/svg/xml, `gzip_vary on`, `gzip_proxied any`, level 5
  (`/etc/nginx/nginx.conf`; backup `/root/nginx-bak/nginx.conf.bak-20260909T214930Z`).
  EAST's bundle on the wire: 925 KB → 273 KB; stylesheet 219 KB → 32 KB. Note: WEST
  proxies to EAST over HTTP/1.0, so EAST's own gzip never applies to browser traffic —
  compression has to live on WEST.
- `cta.js`: "0% host fees through 2026" (Organization JSON-LD description) → "0% host
  fees, permanently."; three "0% fees through 2026" badges → "0% host fees". Backup
  `/var/www/prnm-tools/cta.js.bak-20260909T214930Z`; repo copy `ops/east/tools/cta.js`
  matches (sha256 34605dcd…). The Clint quote and the Salty em dash line are unchanged.

## Not done / Derek's call

- Salty line 210 in `cta.js` still has the em dash (pending his word).
- The floating "Own a pool? Earn money hosting" popup (cta.js) still goes to `/p/hosting`
  with UTM tags, unlike every other host CTA (→ `/wizard/`).
- Insurance FAQ and the Clint insurance quote in the ticker: untouched by rule 8.
- "Video Chat Support" → meetn.com in the footer defaults (WEST strips it on `/` via
  `kill-meetn.conf`; other pages still show it).
- "My Backyard Oasis" (Riverside, CA) has an app screenshot as its first listing photo, so
  its card shows that instead of the pool. Host-side fix.
- EAST commit `ca5f47e6` is local only.
