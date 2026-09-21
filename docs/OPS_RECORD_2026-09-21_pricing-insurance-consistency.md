# Ops record — 2026-09-21 — pricing/insurance copy consistency

Deployed: EAST `fresh-web` **`a870a846`**, `dirty 0`, `verify:production` PASS.
Pushed to `origin/ops/deploy-sha-enforcement`.

**Pricing: fixed and deployed. Insurance: NOT changed, escalated to Derek.**

---

## 1. Pricing — the brief's premise was inverted

The brief expected the homepage to over-promise ("the price you see is the price
you pay") while checkout added 15% on top. **The implementation is the opposite.**

`src/util/currency.js` in the marketplace repo:

> *"Guests pay a mandatory booking fee on top of the host's price. California
> SB 478 requires that fee to be INCLUDED in the displayed/advertised price, not
> added only at checkout."*

`priceWithBookingFee()` (×1.15) is applied in **every** marketplace price surface:
`ListingCard` (search), `OrderPanel`, `ListingPageCarousel`, `SearchMapPriceLabel`.
The EAST homepage does the same via `CuratedListing.allInCents`.

Verified live: Bronson Way Hideaway, base `4500` → listing page shows **$51.75**.
The Orange Grove Lagoon, base `35000` → **$402.50**. Homepage cards show
$172.50 / $63.25 / $74.75 / $97.75 — all ×1.15.

So the homepage claims are **true** and were left alone. Removing them would have
made the site inaccurate *and* pushed it toward an SB 478 problem by advertising
that fees are added at checkout when they are included.

### The real defect (mine, from 2026-09-18)

The pSEO city cards rendered `synced_listings.price_amount` raw — the host's
**base** rate. Live before this fix:

| pool | city card | listing page |
|---|---|---|
| Bronson Way Hideaway | **$45/hr** | $51.75 |
| The Orange Grove Lagoon | **$350/hr** | $402.50 |

Same class of defect as the stale 10% multiplier in CLAUDE.md. Fixed: cards now
render the all-in figure with cents, matching the listing page to the penny.
Verified live, desktop and mobile: `$51.75` `$402.50` `$46` `$57.50` `$69`
`$74.75` `$688.85`.

**No pricing, fee or checkout logic changed** — display only; the fee is computed
server-side in Sharetribe line items.

### Files changed

| file | change |
|---|---|
| `src/lib/pricing.ts` | **new** — `CUSTOMER_BOOKING_FEE_PCT` + `allInCents()`, client-safe |
| `src/server/city-inventory.functions.ts` | return all-in price |
| `src/components/live-inventory.tsx` | format cents so cards match to the penny |
| `src/server/sharetribe.server.ts` | import + re-export the shared constant instead of a second copy |

`home-page.tsx` still has an inline `1.15`; left alone to keep this surgical.

## 2. Insurance — NOT CHANGED. Needs Derek's decision.

There is an authoritative source and it says **do not publish**.

`src/config/insurance.config.js` (marketplace repo) is the designated single
source of truth, created after a June incident in which unsupported insurance
claims propagated across 6,386 Supabase rows and took three phases to remediate.
Its publish gate:

```js
verified: false,
named_insured: null,                                  // BLOCKED
named_insured_endorsement_status: 'requested_not_received',
insuranceIsPublishable = () => verified === true && !!named_insured;   // → false
```

The file's own rationale: the declarations issue the policy to the trade name
**"Pool Rental Near Me"**, not the contracting entity (**PRNM Corp**, per ToS §1),
and *"a named insured that does not match the entity in the contract is the kind
of gap that gets argued at claim time, so nothing renders until this is endorsed."*

A real policy exists — Spinnaker Insurance Company, via Coterie, `CSG-00536699-00`,
BOP, bound 2026-08-17, $2M occurrence / $4M aggregate. The gate is shut on the
named-insured mismatch alone, not on whether coverage exists.

### The live contradiction

| surface | says |
|---|---|
| **Homepage** (`HOMEPAGE_FAQS`, `home-page.tsx:54`, rendered by the live `WinterHomePage`) | *"$2M Commercial Liability Coverage… Pool Rental Near Me carries commercial general liability insurance with limits of $2 million per occurrence and $4 million aggregate."* — also emitted as FAQ JSON-LD |
| `p.how-it-works.tsx:114` | *"**No.** Pool Rental Near Me does not provide or arrange insurance… we do not verify whether the host carries insurance."* |
| `p.peerspace-vs-pool-rental-near-me-in-{$city}.tsx:95` | *"does not provide or arrange insurance"* |
| `lib/page-faqs.ts:175, 196` | *"Pool Rental Near Me does not provide insurance."* — applied across event-guide (787) and swim-instructor (350) pSEO pages |
| Marketplace app | renders **nothing** — the gate is shut |

Git history shows `home-page.tsx` previously carried the "does not provide or
arrange insurance" line (`.bak-noins-20260817`, `.bak-ins2`, `.bak-seo-20260902`);
the $2M claim was added after the 2026-08-17 bind date.

**A third entity name:** the live About page describes the operator as
**10,000 Solutions LLC**, a California LLC. So three names are in play — the
declarations' "Pool Rental Near Me", the ToS's "PRNM Corp, a Delaware
corporation", and About's "10,000 Solutions LLC". That is directly material to
the named-insured question.

### Why I changed nothing

CLAUDE.md hard rule 8: insurance goes to Derek — *"being right about coverage is
not permission to speak for him about it."* The brief likewise says not to deploy
unsupported insurance language and to stop rather than invent coverage terms.

Deciding **which** of the two contradictory stories survives *is* the insurance
decision: pulling the $2M claim has commercial consequences, and keeping it
publishes exactly what the company's own gate blocks. Either way it needs Derek
and the agent, not me. No insurance copy was touched or deployed.

### What Derek needs to decide

1. Has the **named-insured endorsement** (PRNM Corp, or whichever entity is
   correct) been received? If yes, the gate can be flipped and the $2M language
   becomes supportable.
2. If not, should the homepage `$2M Commercial Liability Coverage` FAQ be pulled
   until it is? It is currently live, including in structured data.
3. Which entity is the contracting party — PRNM Corp, 10,000 Solutions LLC, or
   the trade name? The About page and ToS disagree.
4. Once (1)–(3) settle, the ~1,140 pSEO pages carrying *"does not provide
   insurance"* need the same story applied.

I did not modify Terms of Service or Privacy Policy, and did not review them for
conflict beyond noting the ToS §1 entity name quoted in the insurance config.

## 3. City counts — audit only, unchanged

- **Source**: `WINTER_CITY_CARDS` in `src/config/winter-home.ts` — a hand-curated
  list of cities, each with a hard-coded `bounds` bounding box.
- **Count**: `searchListings({ bounds, perPage: 1 }).total` in
  `getWinterHomeData` — a **live Sharetribe search per card**, so the number is
  dynamic, **metro bounding-box based (not exact city)**, and published-only
  (closed/draft are excluded by the search API).
- **Rendering**: `home-page-winter.tsx:641` — `{card.count > 0 && …}`, so a zero
  hides the count entirely.

**Probable bug, not fixed (audit only):** the live homepage renders city cards
(Phoenix, Los Angeles, Austin, Atlanta, Las Vegas, Riverside all present) but
**zero count strings** — every `card.count` is 0. Each lookup is wrapped in
`safe(withTimeout(...), fallback { total: 0 })`, so a failing or timing-out
search is indistinguishable from a city that genuinely has no pools. Given the
marketplace has 124 eligible published listings including several in these metros,
all-zero is more consistent with the fallback firing than with real emptiness.

Worth a separate look; the design weakness is that the fallback silently
substitutes 0 rather than hiding the card or surfacing the failure. Methodology
left untouched per instruction.

## 4. Tests

| command | result |
|---|---|
| `npx tsc --noEmit` | **5 errors, all pre-existing** in `p.pool-party-rentals`, `p.pool-rental-app`, `p.pool-rental-permits-by-state` ×2, `p.private-pool-rental` (typed-route literals). 0 in any file I touched |
| `npm run build` | success, `dirty 0` |
| `npm run verify:production` | **PASS** — `check:deployed-sha`, homepage shape, tools hub, homepage cities, dev hostnames, emitted URLs (506 canonical 200, 0 broken) |

One self-inflicted build failure along the way: importing `@/server/sharetribe.server`
into `city-inventory.functions.ts` tripped TanStack's import-protection plugin
(server module reachable from a client component). Resolved by moving the constant
to the client-safe `src/lib/pricing.ts`. A follow-on `TS2304` — `export { X } from`
re-exports without creating a local binding, and that module uses the constant
locally — was caught by typecheck and fixed before deploy. Production served the
previous bundle throughout both.

## 5. Live verification

| URL | result |
|---|---|
| `/p/become-a-swimming-pool-host-riverside-ca` (desktop) | 200 — `$51.75` `$402.50` `$46` `$57.50` `$69` `$74.75` `$688.85` |
| same (iPhone UA) | 200 — identical prices, responsive grid classes present |
| `/l/bronson-way-hideaway-…` | 200 — **$51.75, unchanged** |
| `/` | 200 — prices unchanged ($172.50 / $63.25 / $74.75 / $97.75); both pricing claims still present and **true** |
| `/p/about-our-company` | 200 |
| `/p/how-it-works` | 200 — insurance line unchanged (flagged) |
| `/p/riverside-ct` | 200 — empty state intact |

Stale-phrase check: `"The price you see is the price you pay"` and
`"All-in hourly pricing — no fees at checkout"` are **still live and were
deliberately kept** — both are accurate. `$2M Commercial Liability` is still live,
**unchanged and flagged**.
