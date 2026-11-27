# Ops record — 2026-11-15 — HTTP status for listing load failures, `/l`, `/confirm`

**Nothing in this record is deployed.** It is a branch (`seo/west-status-and-robots`)
with code, tests and this note. No image was built for production, no nginx or
Cloudflare setting was touched, nothing was written to any database, and no message
was sent to anyone. Production still behaves as the "Before" column says.

Scope: the marketplace app only (WEST, `server/` + `src/`). Follows the read-only audit
of 2026-11-14/15 (findings F9a, F9b, F9c, F11). The robots.txt work (F12) is a separate
record: `OPS_RECORD_2026-11-15_robots-txt-versioned.md`.

Owner's instructions this implements: *"Distinguish missing listings from temporary
loading failures before choosing 404 versus 503."* and *"Do not redirect unrelated
missing pages to the homepage."*

## 1. What was found (re-verified live, 2026-11-15, plain GET/HEAD, no login)

### F9a — "Error in loading the listing" pages answer 200 and are indexable — CONFIRMED

All six URLs from the audit were fetched again. Every one answered **HTTP 200**, with
`<meta name="robots" content="index, follow, …">`, a self-referencing canonical and the
title "Error in loading the listing".

| URL | Linked from |
|---|---|
| `/l/francisville-ky` | `/p/francisville-ky` |
| `/l/fargo-nd` | `/p/fargo` |
| `/l/naperville-illinois` | `/p/naperville` |
| `/l/rocky-point-ny` | `/p/rocky-point-ny` |
| `/l/roseville-ca` | `/p/roseville` |
| `/l/wayne-nj` | `/p/wayne-nj` |

**Which error it is** was read from the server-rendered `window.__PRELOADED_STATE__`
(`ListingPage.showListingError`), not guessed. It is the same for all six:

```
status 400, code "validation-invalid-value", source { path: ["id"], type: "query" },
details: (not (instance? java.util.UUID "fargo-nd"))
```

So these are **not** closed, draft or banned listings and not an API outage. They are
not listings at all: `/l/<x>` is the `/l/:id` route, the page asks the Marketplace API
for listing id `fargo-nd`, and the API rejects the request because that is not a UUID.
No retry can ever succeed — a permanent miss, i.e. a 404.

Why the existing guard missed them: `isMalformedEntityPath` (2026-09-02) checked the id
only on three-segment paths (`/l/<slug>/<id>`) and waved every two-segment `/l/<x>`
through, because `/l/new` has that shape.

Control requests on the same day:

| Request | Status | API error in page state | Body |
|---|---|---|---|
| `/l/some-pool/00000000-0000-0000-0000-000000000000` | 404 + `X-Robots-Tag: noindex, follow` | 404 `not-found` | "Page not found", `noindex, nofollow` |
| `/l/00000000-0000-0000-0000-000000000000` | 404 + `X-Robots-Tag: noindex, follow` | 404 `not-found` | "Page not found" |
| `/l/some-pool/abc` | 404 + `X-Robots-Tag: noindex, follow` | 400 `validation-invalid-value` on `id` | **"Error in loading the listing", meta `index, follow`** |

The last row is a smaller version of the same defect: right status (the September path
check), wrong page.

**Not reproduced live** (there is no safe way to make the production API fail on
request): a 5xx, a 429, a network failure, a 403. What the code does with them was
established by rendering the real pages against a scripted API (§4): before this change
every one of them is an HTTP 200.

### F9b — `/confirm` — CONFIRMED

`GET /confirm` → 200, `index, follow`, canonical `/confirm`, title "List Your Pool Free —
0% Host Fees | Pool Rental Near Me": the signup page under a second URL. `/login`
already carries `noindex, follow`; `/signup` is `index, follow`.

What the route is for: the last step of a social (identity-provider) signup.
`server/api/auth/loginWithIdp.js` sets a 15-minute `st-authinfo` cookie when the
provider login has no marketplace account yet and sends the browser to `/confirm`;
`AuthenticationPage` (tab `confirm`) then shows a form pre-filled from that cookie.
Without the cookie there is nothing to confirm.

### F9c — `/u/<uuid>` — CONFIRMED, documented only (§5)

### F11 — `/l` ↔ `/l/` loop — CONFIRMED, and it has two contributors

```
GET /l    → 301  Location: https://www.poolrentalnearme.com/l/   Content-Type: text/html      (no Cache-Control)
GET /l/   → 301  Location: /l                                     Content-Type: text/plain, 36 bytes, Cache-Control: public, max-age=86400
```

- The **`/l/` → `/l`** hop is this app. Relative `Location`, `text/plain`, a 36-byte body
  ("Moved Permanently. Redirecting to /l" is 36 bytes) and the `Cache-Control` value are
  exactly what `server/renderer.js` sends for an alternate spelling. Mechanism: the `/l`
  route rendered `RedirectToLandingPage`, which draws nothing on the server; an empty
  page is still "a page that rendered", so the trailing-slash rule 301ed `/l/` to `/l`.
  Rendering the HEAD tree offline gives the same answer (§4).
- The **`/l` → `/l/`** hop is **not** this app: absolute `Location`, `text/html`, no
  `Cache-Control`, and the app answers a bare `/l` with a 200 (see below), never a
  redirect. That is the signature of nginx adding a slash for a `location /l/ { proxy_pass … }`
  block. **Inferred, not read** — the nginx configuration is not in git. A Cloudflare
  redirect rule would look similar from outside. `nginx -T | grep -n 'location'` on WEST
  settles it.
- What a bare `/l` does if it reaches the app (cannot be observed live because of the hop
  above; from the offline render of HEAD): HTTP 200, an empty shell with no robots meta,
  and the browser is then sent to the homepage — the "missing page redirected to the
  homepage" pattern.

`/u` shows that last behaviour live today: `GET /u` → 200, empty title, no robots meta
(then the client goes to `/`). `GET /u/` → 404, 9-byte body `not found`, no
`Content-Type` — that response does not come from this app (which service answers it is
unknown; same `nginx -T`).

## 2. What changed

| File | Change |
|---|---|
| `server/api-util/ssrStatus.js` | `classifyListingLoadError` (missing vs temporarily unavailable); `isUnavailableLocals` + `UNAVAILABLE_HEADERS`; `resolveRenderStatus` takes a third argument (503); `isMalformedEntityPath` now covers `/l/<not-a-uuid>` and bare `/l`; `resolveRenderOutcome` — the whole status / redirect / header decision as one pure function |
| `server/renderer.js` | calls `resolveRenderOutcome` instead of deciding inline. Same order of precedence as before, plus the 503 |
| `src/context/ssrSignalContext.js` | the per-request signal gains `unavailable` |
| `src/containers/ListingPage/ListingPage.shared.js` | `ErrorPage` is `noindex, follow` and raises the signal (`unavailable`, or `notFound` for an invalid listing); `isListingNotFoundError` |
| `src/containers/ListingPage/ListingPageCarousel.js`, `ListingPageCoverPhoto.js` | a "not found"-class error renders `NotFoundPage` (was: only an API 404); the anonymous-403 → signup redirect now applies only on a private marketplace |
| `src/routing/routeConfiguration.js` | `/l` renders `NotFoundPage` instead of redirecting to the landing page |
| `src/containers/AuthenticationPage/AuthenticationPage.js` | `/confirm` is `noindex, follow` (same `shouldIndex` prop `/login` uses) |
| `server/api-util/ssrStatus.test.js` | +43 tests |
| `scripts/ssr-status-harness/` | new: renders the real pages against a scripted API, offline (§4) |

It follows the existing channel, not a new one: pages write to the per-request
`ssrSignal` object while rendering (as `NotFoundPage` already did), `entry-server.jsx`
puts that object on `res.locals`, and the renderer reads it once the shell is ready.

### The rule for a failed listing fetch (`classifyListingLoadError`)

| The API said | Meaning | Answer | Evidence |
|---|---|---|---|
| 404 | no such listing | **404**, NotFoundPage | live; unchanged rule |
| 400, `validation-invalid-value` on `id` | the id in the URL is not a UUID | **404**, NotFoundPage | live — all six URLs |
| 410 | gone | **404**, NotFoundPage | by definition of the status; never observed |
| 403 carrying the Marketplace API error code `forbidden` | the API will not show this listing to this viewer | **404**, NotFoundPage | **code only, not observed live** — see §6 decision 1 |
| 403 **without** that code (no API error body: HTML or empty, as from an edge, a WAF, a suspended client credential or plan) | something in front of the API, or the app's own access, refused the request; says nothing about the listing | **503**, friendly error page | scripted render only (review fix, §9) |
| 5xx, 429, 401, 409, any other 4xx, a 400 that is not about the id, no status at all (network error, timeout), anything unrecognised | the fetch broke; says nothing about the listing | **503**, friendly error page | scripted render only |

Two deliberate choices in that table:

- **Unknown means "try again", never "gone".** A wrong 503 costs a crawler one retry; a
  wrong 404 costs the page its place in the index.
- **A 400 that is not about the id is a 503.** If a release ever breaks the query this
  app builds, every listing would answer 400; that must not read as "all listings were
  removed".
- **A 403 is a 404 only when the API itself says `forbidden`.** A 403 with no API error
  body would hit every listing at once (an edge block, a suspended credential); as a 404
  that would de-index the whole catalogue. The anonymous-signup and no-viewing-rights
  403 paths are handled before this rule, in `EnhancedListingPage`.

A listing that loads but has no `listingType` / `transactionProcessAlias` / `unitType`
("invalid listing") cannot be shown or booked until someone repairs its data. It keeps
its specific message (more use to its host than "Page not found") and now answers **404**
with `noindex` instead of an indexable 200.

No failed or missing listing is redirected anywhere — not to the homepage, not to `/s`,
not to a canonical spelling. `resolveRenderOutcome` only considers a redirect when the
status is 200.

## 3. Behaviour table — before / after

"Before": production on 2026-11-15 where marked *live*; otherwise the HEAD tree
(`98f368f`) rendered offline. "After": this branch rendered offline (§4). `index` is
short for `index, follow, max-snippet:-1, max-video-preview:-1, max-image-preview:large`.

| # | Case | Before: status · headers · meta robots · page | After: status · headers · meta robots · page |
|---|---|---|---|
| 1 | Healthy listing on `/l/<slug>/<id>` (with or without a query) | 200 · — · `index` · listing | **identical** (body, head tags and preloaded state byte-for-byte) |
| 2 | Healthy listing by `/l/<id>` or a stale slug | 301 → `/l/<slug>/<id>` · `Cache-Control: public, max-age=86400` | **identical** |
| 3 | Closed listing the API still returns | 200 · — · `index` · listing | **identical** |
| 4 | Missing listing (API 404) | 404 · `X-Robots-Tag: noindex, follow` · `noindex, nofollow` · Page not found *(live)* | **identical** |
| 5 | `/l/<city-slug>` — the six linked URLs (API 400 on the id) | **200** · — · **`index`** · "Error in loading the listing" *(live)* | **404** · `X-Robots-Tag: noindex, follow` · `noindex, nofollow` · Page not found |
| 6 | `/l/<slug>/<not-a-uuid>` | 404 · `X-Robots-Tag: noindex, follow` · **`index`** · "Error in loading the listing" *(live)* | 404 · same header · `noindex, nofollow` · Page not found |
| 7 | API 403 `forbidden`, anonymous visitor (public marketplace) | **200** · — · no robots meta · empty shell, then the browser goes to `/signup` | **404** · `X-Robots-Tag: noindex, follow` · `noindex, nofollow` · Page not found |
| 8 | API 403 `forbidden`, logged-in visitor who is not the author | 200 · — · `index` · "Error in loading the listing" | 404 · `X-Robots-Tag: noindex, follow` · `noindex, nofollow` · Page not found |
| 9 | API 5xx / 429 / network failure / unknown error / a 403 with no API error body — any spelling of the URL | **200** · — · **`index`** · "Error in loading the listing" | **503** · `Retry-After: 120`, `Cache-Control: no-store`, `X-Robots-Tag: noindex` · `noindex, follow` · same page, same bytes |
| 10 | Invalid listing (no listing type / process / unit) | 200 · — · `index` · "Error in loading the listing" | 404 · `X-Robots-Tag: noindex, follow` · `noindex, follow` · same page, same bytes |
| 11 | Owner or operator: own draft on `/l/<slug>/<id>/draft`, own pending on `/pending-approval`, own closed listing | 200 · — · `index` · listing | **identical** (body, head tags and preloaded state byte-for-byte) |
| 12 | Owner on `/draft` while the API is down | 200 · error page | 503 · row 9's headers · same page (honest status; nothing else changes for them) |
| 13 | Someone else's `/pending-approval` link (own-listing fetch 403) | 200 · empty shell, client goes to the public listing URL | **identical** (template behaviour, left alone) |
| 14 | Private marketplace, anonymous 403 (not production's mode) | 200 · empty shell, client goes to `/signup` | **identical** |
| 15 | `/l` | *live:* 301 → `/l/` (not this app), then row 16 → **loop**. The app itself: 200, empty shell, browser sent to the homepage | app: **404** · `X-Robots-Tag: noindex, follow` · `noindex, nofollow` · Page not found. Through today's nginx: `/l` → 301 `/l/` → 404 (one hop, ends) |
| 16 | `/l/` | **301 → `/l`** · `Cache-Control: public, max-age=86400` *(live)* | **404** · `X-Robots-Tag: noindex, follow` · `noindex, nofollow` · Page not found |
| 17 | `/l/new` | 200 · empty shell (client goes to the listing wizard) | **identical** |
| 18 | `/confirm`, anonymous direct visit | 200 · — · **`index`** *(live)* | 200 · — · **`noindex, follow`** · body byte-identical |
| 19 | `/signup` | 200 · — · `index` | **identical** |
| 20 | `/login` | 200 · — · `noindex, follow` | **identical** |
| 21 | `/u/<uuid>` profile | 200 · — · `index` *(live)* | **identical** (documented only) |
| 22 | `/u/<uuid>`, no such user | 404 · `X-Robots-Tag: noindex, follow` · Page not found | **identical** |
| 23 | Unknown route; `/s` | 404; 200 | **identical** |
| 24 | Render (shell) error | 500 · static error page | **identical** — a 500 outranks 404 and 503 |

Precedence, in one place (`resolveRenderOutcome`): 500 > 404 > 503 > one 301 > 200.

## 4. How it was tested

All commands were run in the worktree on 2026-11-15. `jest` is not a dependency of this
repo; the binary used is the one in the machine's npm cache
(`/root/.npm/_npx/…/node_modules/.bin/jest`, v30.5.2), which is what `npx jest` resolves to.

| Command | Result |
|---|---|
| `jest server` (the jest half of `yarn test-server`) | 19 suites, **319 tests passed** (276 before this change; +43 in `ssrStatus.test.js`). After the review fixes (§9): see §9 |
| `bun test server/api-util/currency.test.js server/api-util/lineItemHelpers.test.js server/api-util/durationTiers.test.js server/api/health-booking.test.js` (the bun half) | 49 pass, 0 fail |
| `bun scripts/ssr-status-harness/run.mjs` (now also `yarn test-ssr-status`) | **56 of 56** scenarios match the behaviour table (58 of 58 after §9) |
| `eslint` on every changed and new file | **0 new problems.** The touched files carry pre-existing ones (6 / 15 / 0 / 26 / 23 / 12 / 1 / 1 / 22 before and after, compared per rule + source line); the harness files are clean |
| `NODE_ENV=production vite build --outDir <tmp>/client` | built in 17 s, exit 0 |
| `NODE_ENV=production vite build --ssr src/entry-server.jsx --outDir <tmp>/server` | built in 6 s, exit 0 |

The two builds are `bun run build` with the output directed outside the worktree. The
classifier is CommonJS (so `jest` covers it) and is imported by a client page; in the
client build it lands only in the lazy `ListingPage.shared` chunk (8.4 KB), not in the
main bundle.

**What `ssrStatus.test.js` covers:** every row of the classifier table, including the
live 400 body; malformed error objects; the 503 header set; precedence (500 > 404 > 503);
that a failed or missing listing is never given a redirect target; that owner variants
and healthy listings get 200 with `Content-Type` only; the six city slugs by name; and a
walk of the redirect chain from `/l` and `/l/` through a model of the observed nginx hop,
which must terminate in a 404.

**What the harness covers, and why it exists.** The component tests under `src/` cannot
run (jest has no JSX/ESM transform here — `jest src/containers/NotFoundPage` fails at
parse time), so nothing proved that the React pages raise the signals the server rules
read. `scripts/ssr-status-harness/run.mjs` builds the app's real server entry with one
alias (`sharetribe-flex-sdk` → a fake that opens no connection), renders each route
through the app's own `renderApp` — real route table, real loaders, real pages, both
listing-page variants — against a scripted API, and applies `resolveRenderOutcome` at the
moment the renderer does. It asserts status, redirect, headers, robots meta and which
page was drawn, and fails on any SDK call it was not told about.

**Before/after proof for "healthy pages are untouched".** The same scenarios were
rendered from a clean export of HEAD (`98f368f`) and from this branch, and status,
redirect, headers, HTML body, head tags and preloaded state were compared (one
run-to-run timestamp, `currentUserShowTimestamp`, normalised — it differs between two
runs of the *same* tree). 54 scenarios: **31 identical in every respect** — every
healthy, closed and owner-variant listing in both page variants, `/signup`, `/login`,
`/u/…`, `/s`, the unknown route — and **23 changed, each one a row of §3 that was meant
to change**. The HEAD render also reproduced what production answered live for
`/l/fargo-nd` (200, `index`), `/l/some-pool/abc` (404 with an indexable error page) and
`/l/` (301 → `/l`), which is the check that the harness models production.

**Not tested, and why:**

- **The Express layer itself** (`res.set`, `res.status`, the stream). `server/renderer.js`
  scans `dist/client` at import and needs a built app and a live API, so it was not
  executed; it was read, built, and its decision is the tested pure function. The release
  gate on `:4000` is the first place the real headers can be seen.
- **Real API failures.** A 5xx/429/403 from the Marketplace API cannot be provoked from
  outside. The scripted error objects have the shape `storableError` produces; the 400 is
  copied from production.
- **`src/` jest tests** — not runnable in this repo, so `AuthenticationPage.test.js` was
  not extended; `/confirm`, `/signup` and `/login` are harness scenarios instead.

### Probes for the release gate (candidate on `:4000`, before nginx moves)

Before building the image, in the repo: `yarn test-server` **and `yarn test-ssr-status`**
(the render harness). `ssrStatus.test.js` only tests the pure decision with hand-made
locals; the harness is the only check that the React pages still raise `notFound` /
`unavailable`. If it is not green, do not build.

```
/l/fargo-nd                                   → 404, X-Robots-Tag: noindex, follow, title "Page not found"
/l/some-pool/abc                              → 404, body "Page not found" (not "Error in loading the listing")
/l/some-pool/00000000-0000-0000-0000-000000000000 → 404 (unchanged)
/l      and  /l/   (straight at the container) → 404 each, no Location header
/l/new                                         → 200 (unchanged)
/confirm                                       → 200, <meta name="robots" content="noindex, follow">
/signup                                        → 200, index, follow   (unchanged)
/login                                         → 200, noindex, follow (unchanged)
any live listing, canonical path               → 200, index, follow, no Retry-After, no X-Robots-Tag, Cache-Control unchanged
the same listing by /l/<id>                    → one 301 to /l/<slug>/<id> (unchanged)
```

A 503 cannot be probed on a healthy gate. To see one, block the container's route to
`flex-api.sharetribe.com` for a single request on the gate only — never on MAIN.

## 5. `/u/<uuid>` — what the code does today (documented, not changed)

Decision deferred by the owner; nothing about profile indexing was touched.

- **Status.** 200 when the user loads. 404 + `X-Robots-Tag: noindex, follow` when the API
  answers 404 (`ProfilePage.js` renders `NotFoundPage`) and for a non-UUID id
  (`isMalformedEntityPath`, before render).
- **Robots.** `ProfilePage.js` renders `<Page title schema …>` with no `shouldIndex`
  prop, so `Page`'s default applies: `index, follow, max-snippet:-1, …`. No
  `X-Robots-Tag`. Confirmed live.
- **Canonical.** `Page` builds it from the route: `https://www.poolrentalnearme.com/u/<uuid>`,
  self-referencing. Confirmed live.
- **Schema.** `ProfilePage` JSON-LD when a person entity can be built, else `WebPage`.
- **Where a `noindex` would go.** One prop on that `<Page>` near the end of
  `ProfilePageComponent` in `src/containers/ProfilePage/ProfilePage.js`:
  `shouldIndex={false}` for every profile, or a condition (for example "has at least one
  published listing", using the `listings` prop the component already receives).
  `shouldFollow` stays true so the listing links on the profile are still followed. The
  listing page's "hosted by" link and the review avatars are where the 130 linked
  profiles come from; a `noindex` does not require removing those links.
- **Seen while documenting, not fixed (same deferral):**
  - a profile whose fetch fails with a 5xx renders a profile shell with the title
    " | Pool Rental Near Me" at **HTTP 200, `index, follow`** — the same defect class as
    F9a. The 503 signal added here fits it in one line once profile work is approved.
  - bare **`/u` still answers 200 with an empty shell and sends the browser to the
    homepage** (live). It was left alone on purpose: `Avatar` links banned and deleted
    users to that route, so turning it into a 404 changes what those avatars lead to.

## 6. Decisions for the owner

1. **A 403 `forbidden` on a listing is treated as "not viewable" → 404.** This is the one
   rule in §2 not backed by a live observation. (A 403 without that API error code is a
   503 since the review, §9.) Basis: the template's own handling — a 403 from the
   listing endpoints is its "not yours to see" answer (someone else's `/pending-approval`
   link; private-marketplace mode). Before this change an anonymous 403 answered 200 with
   an empty page and pushed the visitor to `/signup`. The alternative is to class 403 as
   temporary (503): delete the `status === 403 && isApiForbiddenError(error)` branch in
   `classifyListingLoadError` and adjust the tests that expect 404 for it. What would settle it: an anonymous
   GET of a known draft or pending-approval listing's public URL, on the gate.
2. **An invalid listing (no type / process / unit) → 404** rather than an indexable 200.
   It keeps its message. Say so if a 200 + `noindex` is preferred.
3. **The six `/p/` pages still link to `/l/<city-slug>`.** After release those links lead
   to a 404 instead of an indexable error page, which is honest but still a dead link.
   The pages are EAST content (`content_pages`); repointing or removing the links is a
   content change in another system and was not made.
4. **Bare `/u`** — make it a 404 like `/l` (and choose where banned/deleted avatars
   should lead), or leave it.
5. **Profile indexing** (F9c) and the profile 5xx soft error — §5.
6. **`Retry-After: 120`** is a fixed two minutes. Fine for a blip; a long API outage
   would be re-probed often. Raise it if preferred.

## 7. Needs server access (not done; none of it was attempted)

1. **nginx, `/l`.** Today a bare `/l` gets a 301 to `/l/` before the app sees it. After
   this release the chain is `/l` → 301 `/l/` → 404: no loop, one hop. To make it zero
   hops, add an exact-match location that hands `/l` to the marketplace upstream with the
   same proxy settings as the existing `/l/` block, e.g.

   ```nginx
   location = /l { proxy_pass http://web; }   # plus the proxy_set_header lines the /l/ block uses
   ```

   Do **not** widen the prefix to `location /l` — that would also capture `/login`,
   `/listings`, `/lessons`, `/llms.txt`. First confirm the hop really is nginx
   (`nginx -T | grep -n 'location'`); if it is a Cloudflare redirect rule instead, remove
   that rule. Either way `nginx -t` + reload, and re-probe `/l` and `/l/`.
2. **Find what answers `/u/`** with a bare 9-byte `not found` (same `nginx -T`).
3. **Release.** Mirror these files into the WEST build tree, build the image memory-capped,
   run the gate with the probes in §4, then the upstream file swap. Not started.
4. **WEST nginx, once a 503 can occur.** The gate probes the container on `:4000`
   directly, so it cannot show what nginx does to a 503. WEST nginx already intercepts
   errors on `/assets/` (`proxy_intercept_errors on; error_page 404 = @assets_fallback_amenity`,
   `docs/OPS_RECORD_2026-09-25_seo-phase2-evidence.md`). If the marketplace HTML
   locations do the same with an `error_page 50x …`, a failed listing fetch would reach
   the visitor as nginx's generic page, possibly with a rewritten status and without
   `Retry-After` / `no-store`. Before release run
   `sudo nginx -T 2>/dev/null | grep -n 'proxy_intercept_errors\|error_page'` on WEST and
   confirm neither applies to the locations that proxy to `upstream web` (or that any
   `error_page` there keeps the 503 and the upstream headers). Not checked: the nginx
   configuration is not in git.
5. **Cloudflare, once a 503 can occur.** Check that the zone passes an origin 503 through
   with its body and `Retry-After` (no "Always Online" substitute, no custom 5xx page).
   Current setting unknown — it could not be read from here.
6. **One anonymous request for a known draft or pending-approval listing** on the gate, to
   settle decision 1.

## 8. Not done

- Not deployed; not mirrored to `/home/ubuntu/build`.
- No change to checkout, pricing, fees, transactions, auth/session, email or SMS code, and
  none to `ops/west/c207` or `ops/west/c208`.
- Profile pages: documented only.
- The EAST links in decision 3.
- The private-marketplace code paths (signup redirect, loading shell) are unchanged and
  still answer 200 with an empty shell; production is a public marketplace.

## 9. Review fixes (2026-11-15, same branch, not deployed)

A review of this change raised three points about the status-code work. Each was
checked against the code before anything was changed.

1. **A 403 with no Marketplace API error counted as "not found".** Confirmed from the
   code: `classifyListingLoadError({status: 403, apiErrors: []})` returned `not-found`.
   An edge or WAF block, or a suspended client credential, answers every request
   with the same 403. Every healthy listing would then have gone out as a 404 with
   `noindex`, which is the mass de-indexing that "unknown means try again" exists to
   prevent. **Fixed:** a 403 counts as "not found" only when its API errors carry the
   code `forbidden` (the template's own `isForbiddenError` test). Any other 403 is a
   503. New tests in `ssrStatus.test.js` cover an empty `apiErrors`, a different
   code, malformed entries and a missing `apiErrors`, and there is a new harness
   scenario: a 403 with an HTML body renders the friendly error page with a 503 in
   both listing variants. Old code fails both. Rows 7–8 of §3 now read "403
   `forbidden`"; row 9 includes the bare 403.
2. **The render harness was not wired to anything.** Confirmed: no package script ran
   it. **Fixed:** `yarn test-ssr-status` (`bun scripts/ssr-status-harness/run.mjs`) is
   in `package.json`, and §4's release gate now requires it alongside
   `yarn test-server`. `ssrStatus.test.js` asserts that the script exists and that
   this record names it, so removing either fails `jest server`.
3. **WEST nginx error interception was not in the release plan.** Confirmed: the
   `/assets/` location already uses `proxy_intercept_errors`, and the nginx config is
   not in git. **Fixed in the plan:** §7.4 adds the `nginx -T` check before release.
   Nothing was run on the server.

Results after the fixes (worktree, 2026-11-15):

| Command | Result |
|---|---|
| `npx jest server/api-util/ssrStatus.test.js` | 83 passed (80 before the review) |
| `npx jest server` | 19 suites, 322 passed |
| bun half of `yarn test-server` (4 files) | 49 pass, 0 fail |
| `yarn test-ssr-status` (the harness, with a fresh build) | 58 of 58 scenarios match |
| `npx jest src/containers/AuthenticationPage` | 1 suite fails at Babel parse (JSX in the unchanged test file): pre-existing, as noted in §4 |
| `eslint` on the changed files | no new problems in `server/` or `src/` files compared with the change before review (ssrStatus.js 6, ssrStatus.test.js 15, renderer.js 0, the listing and auth files unchanged) |
