# Insurance claims + homepage city counts — 2026-09-22

Two defects with the same shape: a page stating as fact something no system had
established. Approved by Derek, deployed, verified live.

| | |
|---|---|
| Marketplace commit | `c4e2243` (branch `claude/marketplace-repo-verify-v8h67k`) |
| EAST commits | `f602e8b6`, then `a962224e` |
| Deployed EAST SHA | `a962224e`, `dirty 0`, tree `7e1cbdab` |
| `verify:production` | 7/7 PASS against the live site |

## Insurance

### What was wrong

`src/config/insurance.config.js` is this repo's deliberate publish gate, built
after the June incident. It is shut today and stays shut: the policy was issued
to the trade name rather than to the contracting entity, and the corrected
named-insured endorsement is **requested, not received**. Nothing in the
repository shows it has been received, so nothing was changed to say otherwise.

fresh-web has no insurance fact layer — on purpose, it publishes nothing — and
published anyway:

* the homepage FAQ asserted `$2M Commercial Liability Coverage` with both limits
  and an "added protection for bookings" line, and the JSON-LD carried it into
  search results;
* nine files still carried the pre-policy denial, *"Pool Rental Near Me does not
  provide or arrange insurance"*, including `lib/page-faqs.ts`, which fans out to
  roughly 1,140 generated event-guide and swim-instructor pages;
* `backfill-content-pages.server.ts` and `admin-tools.functions.ts` instructed
  the generator to keep minting that denial into every new page.

### What was done

While the gate is shut there is **no marketing insurance block at all**. Omission,
not a denial, and not the approved wording hardcoded past the gate. What survives
on those pages is still true and says nothing about PRNM's own policy: a waiver is
signed on every booking, we do not verify whether hosts carry insurance, and most
homeowner policies exclude paid rentals.

Derek's canonical wording lives in `APPROVED_COPY` in `insurance.config.js` —
`marketing_heading` and `marketing_body` — and therefore renders only through
`insuranceIsPublishable()`. It is stored verbatim rather than tokenised, because
`{perOccurrence}` would print `$2,000,000` and change the words he supplied.
`test-insurance-gate.mjs` asserts the sentence and the declarations still state
the same limits, so a limit change fails the build instead of quietly diverging.

### The policy number

`policy_number` is now `null` in the config. "Internal record only, never
rendered publicly" was a property of the *caller*, not of the value:
`insurance.config.js` is imported by `InsuranceDisclosure`, a client component,
so every literal in `CONFIG` was one `render` away from the browser bundle. The
number stays in `docs/insurance/policy-facts.json`, which is never bundled, and
the 2026-09-21 ops record no longer repeats it.

Verified absent from: rendered production HTML on every checked page, EAST's
`dist/client`, WEST's container bundle, and the marketplace build tree.

### Guards

Both are extensions of what already existed — no competing source of truth.

* `scripts/check-insurance-language.sh` (marketplace) gains the
  universal-coverage phrasings and a **shape-matched** policy-number scan over
  `src/`, `server/`, `public/`. The number itself is not written into the guard.
* `scripts/check-insurance-claims.mjs` (EAST, new, wired into
  `verify:production`) fails on prohibited or stale language and on anything
  shaped like a policy number — **in source and in live production HTML**.

The first pass missed six occurrences because a line-based grep cannot see a
sentence the formatter has wrapped across JSX lines. They were one line in the
built bundle and still rendering. The guards now match across whitespace, and
the live-HTML scan is what caught them.

The stale denial is banned in **marketing copy only**. ToS §11.1 is exempt and
was not touched — see below.

## Legal entity — discrepancy, reported not rewritten

| Source | Says |
|---|---|
| `src/containers/TermsOfServicePage/terms-2026-1.js` §1 | PRNM Corp "is a **wholly-owned subsidiary of** 10,000 Solutions LLC" |
| `fresh-web/src/routes/p.about-our-company.tsx:111` (live on `/p/about-our-company`) | "PRNM Corp is **sister to** 10,000 Solutions LLC, a California-registered company" |

Subsidiary and sister company are not the same relationship. Both agree PRNM
Corp operates the marketplace, so Derek's remove-condition (10,000 Solutions LLC
described as the *operator*) does not trigger and nothing was edited. Neither
statement was rewritten: there is no authoritative document in the repository
establishing which is correct. **Derek's decision.**

Also: `fresh-web/src/lib/email-templates/_unsubscribe-footer.tsx:25` signs
outbound email "Pool Rental Near Me · 10,000 Solutions LLC" while the operator is
PRNM Corp. Reported, not changed.

ToS §11.1 — *"PRNM does not provide, arrange, underwrite, or guarantee insurance
of any kind to Hosts, Renters, or their guests"* — is **not** stale. PRNM's
policy covers PRNM's operations, hosts are not additional insureds, and Section I
Property is deleted, so the sentence remains accurate. It is counsel's to change.

## Homepage city counts

**Root cause.** The six `WINTER_CITY_CARDS` called
`searchListings({ bounds, perPage: 1 })`. That helper consults our synced mirror
only when a `citySlug`, `city` or `stateCode` filter is present — a bounds-only
call went straight to Sharetribe `/listings/query`, which has been returning 502.
All six cards hit the 5s timeout, `safe()` substituted `{ total: 0 }`, and every
card claimed zero inventory. A failed lookup and a real zero produced the same
output — the same defect class as the Switchy weekly-stats bug, where a failed
lookup read as *"nobody has seen your pool."*

**Fix.** `cityCardInventory()` counts `synced_listings` directly, same metro
bounding boxes, same ranking, nothing reordered. `count` is `number | null`:
`null` means the query failed, and the card omits its count rather than asserting
zero. Failures are logged server-side and never surfaced to the visitor.
`home-page-winter.tsx` guards on `typeof card.count === "number"`.

Live after deploy: all seven cards render a real count (Albuquerque 2, Los
Angeles 3, Phoenix 3, Las Vegas 2, Riverside 2, Portland 2, Virginia Beach 2),
no `[city card]` failures in a freshly flushed log, and no literal "0 pools".

## Pricing — unchanged, and proved so

No file in the pricing path was touched. Verified live against the mirror:

| Listing | Host base | All-in rendered | Bare base rendered |
|---|---|---|---|
| Ultra-Luxury Resort | $85 | **$97.75/hr** | no |
| Best Pool Party Ever | $150 | **$172.50/hr** | no |
| Splish Splash | $65 | **$74.75/hr** | no |
| Friends and Trends | $75 | **$86.25/hr** | no |

`a870a846` preserved. "The price you see is the price you pay" and "All-in hourly
pricing — no fees at checkout" are still on the homepage and still accurate.
"A 15% booking fee is added at checkout" was **not** added anywhere — it would
contradict the implementation.
