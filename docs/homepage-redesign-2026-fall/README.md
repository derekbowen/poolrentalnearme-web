# Homepage redesign — fall/winter 2026

**Status: design chosen, Phase 1 logic written and tested, NOT wired into the app.**
Nothing here is deployed. See §4 for the one thing blocking the port.

Baseline this is measured against: `docs/HOMEPAGE_BASELINE_2026_FALL.md`.

---

## 1. The design direction

Generated in Magic Patterns — [editor](https://www.magicpatterns.com/c/v84sp65hxpgx4wj2j37tv2).
Both jobs reported `isGenerating` for ~70 minutes before completing; that was a
Magic Patterns delay, not a failure.

**Palette** (`tokens.css`): deep water teal `#062A2C → #1B787C`, warm sand
neutrals `#FCFAF6 → #E3D8C7`, a single coral `#E0603C` reserved for primary CTAs
only, ink greys for type. No blue SaaS gradient, no glassmorphism, no blobs, no
water icons. The photography carries the page; chrome stays quiet.

**Section order** — Peerspace's routing intelligence, Swimply's restraint, none
of Giggster's sprawl:

| # | Section | Note |
|---|---|---|
| 1 | Hero + structured search | search card overlaps the photo; location dominates on mobile |
| 2 | Pools near you | horizontal scroll on mobile, 3-up grid on desktop |
| 3 | What are you planning? | six occasion tiles, 2-col mobile |
| 4 | **Keep swimming when summer ends** | cooler, moodier treatment so it reads as seasonal |
| 5 | How it works + trust | three steps, four understated trust items |
| 6 | Popular markets | ~12 scored cities + "Browse all cities" |
| 7 | Host block | one band, "Keep 100% of what you charge" |
| 8 | Social proof | designed to look right with as few as three reviews |
| 9 | Learn with Fred | dark band, course count is a token |
| 10 | FAQ | accordion, renter-commercial |
| 11 | Footer + city directory | |

This inverts today's order, where host acquisition and the Swimply comparison
occupy positions 1–2 and the renter's own entry point sits at position 8.

---

## 2. What is actually built here

| File | What it is | Verified |
|---|---|---|
| `resolveDestination.ts` | the pSEO-first search resolver | **11/11 tests pass** (`bun test`) |
| `resolveDestination.test.ts` | its test suite | includes the two traps below |
| `beacon.ts` | the ten homepage events, on the **existing** first-party beacon | typed event union |
| `components/SearchCard.tsx` | hero search, wired to resolver + beacon | |
| `components/Hero.tsx` | hero, H1 preserved verbatim | |
| `components/SeasonalBlock.tsx` | fall/winter block, **refuses to render dead links** | |
| `data/home.ts` | data contracts, **sanitised** — see §3 | |
| `tokens.css` | the palette | |

### The resolver, and the two traps it avoids

```
location entered
  → exact canonical PRNM city page?      → that page        (pseo)
  → ZIP → nearest viable market page?    → that page        (pseo)
  → otherwise                            → /s?address=...   (sharetribe)
```

**Trap 1 — never derive a slug by pattern.** `/p/all-locations` carries 6,143
slugs. A naive `-(al|ak|…|me|…)$` state-suffix regex reads
`airbnb-vs-pool-rental-near-me` as **Maine**. Same family as the `%melbourne%`
bug that swept in Melbourne FL. Matching is against a curated table only, and
there is a test asserting exactly this.

**Trap 2 — canonical collisions are real.** `/p/arlington` *and* `/p/arlington-va`
both exist; so do `/p/aurora` and `/p/aurora-il`. A bare city name resolves only
when exactly one candidate exists — otherwise it falls through to Sharetribe
rather than sending half those users to the wrong state.

Also enforced: a city page with **zero live inventory is never routed to**, so
the resolver cannot deliver a searcher to an empty market. And every path ends
somewhere usable — there is no branch that produces a 404.

### Analytics rides what already exists

`/tools/cta.js` (module `prnm-a`) already beacons to `/tools/cta-beacon` via
`navigator.sendBeacon`. There is no Plausible, GA, PostHog or Segment anywhere
in fresh-web, so that endpoint **is** the existing analytics architecture. All
ten events use it. No second stack.

---

## 3. What was removed from the generated design, and why

The generation returned realistic-looking placeholder content. It is stripped,
not carried forward:

| Removed | Why |
|---|---|
| Three invented guest reviews ("Marisol, Tampa FL" …) | House rule 1: never invent a testimonial. A placeholder that reads as real is precisely how the "Stephen, Founder" email shipped to 21 hosts. |
| Invented star ratings (4.9 / 24 reviews, 4.8 / 11) | Invented statistics. `rating` stays optional and the card is designed to balance without it. |
| Invented pool counts (Phoenix 12 in one list, 41 in another) | Invented statistics — and mutually inconsistent. Counts now come from the synced mirror or are omitted entirely. |

`data/home.ts` ships every array **empty on purpose**. Each section must render
its real empty state rather than sample data.

**The generated design carries no insurance claim anywhere** — the trust row is
Secure booking / Direct host messaging / Guest waivers / Human support, and the
FAQ has no insurance question. That is the safe default and it is deliberate.

⚠️ **But the live homepage today has an insurance FAQ whose wording is
founder-owned, and it is indexed in `FAQPage` schema.** Dropping it is a schema
change, not a copy tweak. It must be carried across **verbatim** from production
or explicitly retired by Derek — not re-derived, not softened. Separately, see
§6 of the baseline doc: production is currently serving a *contradictory*
insurance claim in injected `Organization` JSON-LD. That contradiction is
Derek's to resolve; nothing here touches it.

---

## 4. What blocks the port

The live homepage source is **in neither GitHub repo** (baseline §0). Both
copies would ship a `noindex` on `/`, a false `$2M` insurance claim, a 10% host
fee and a fabricated 4.8 rating. Porting these components onto either base
would carry all four into production.

**The one authorization needed: read-only access to EAST (`3.222.110.146`) to
capture the authoritative `fresh-web` working tree** — or that tree pushed to
GitHub. Everything else for Phase 1 is written and tested.

## 5. Known gaps to close during the port

1. **No indoor destination page.** `/p/heated-pool-rentals` is 200; every indoor
   and winter candidate 404s. `SeasonalBlock` filters `href === null`, so today
   it would render one card. Build the pages or ship the one real card.
2. **Occasion tiles have unverified destinations.** Same rule applies.
3. **Images need dimensions and `srcset`.** 33 of 38 live images ship without
   width/height; images are 3.1 MB against 920 KB of JS. The redesign must
   reduce that number, not add to it.
4. **`/tools/home.js` rewrites the H1 after hydration.** It will rewrite the new
   one too unless it is updated in the same change.
5. **A city sitemap should ship before the homepage city list is cut** — the
   ~6,143 city pages are in no sitemap at all today.
6. **Market scoring needs GSC data**, which is not reachable from this session.
   Until it is, "popular markets" can only be ordered by live inventory.
