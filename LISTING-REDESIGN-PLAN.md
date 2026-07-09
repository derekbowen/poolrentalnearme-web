# Listing Page Redesign — Build Plan

**Post-Sprint · Slot #2 · WEST marketplace**
Turn the generic template listing page into a conversion-focused, trust-forward
page that surfaces everything shipped this week — offers, party size, share, and
proven-host reputation. Checkout & money path untouched.

> Reconstructed from the live-page teardown + PRNM brand + features now live.
> The original 7/8 scope was given in chat (not saved), so confirm the section
> order + open decisions before building each phase.

---

## 1 · What's live today

Active layout is the `carousel` / product variant (`ListingPageCarousel.js`): a
two-column shell — a scrolling main column and a sticky `OrderPanel` booking box
on the right. Honest but generic; the stock Sharetribe stack that buries trust.

- **Gallery** up top, then title, then a wall of description text.
- **Amenities** (`CustomListingFields`) render as a plain list, low on the page.
- **Reviews** and **host** near the bottom — a young marketplace leads with its
  thinnest content.
- No home for what we just built: proven-host reputation, minimal share, party
  size only in the booking box, and custom offers with zero listing discovery.

Current main-column order: Gallery → title → Description → CustomListingFields
(amenities) → Map → Reviews → Author. Sticky right: OrderPanel.

## 2 · Goals

- **Book faster.** Sticky booking card that's obvious on mobile, with price,
  party size, and one clear CTA.
- **Lead with trust.** Proven-host reputation, review score, verified badges
  above the fold — so an empty native-review shelf isn't the first impression.
- **Scannable, not a text wall.** Amenities as an icon grid; description as a
  tight ingress + "read more".
- **Show the new capabilities.** Discoverable share, party-size clarity, offer hook.
- **On-brand.** PRNM blue `#0EA5E9` / gold `#F5B301` / Manrope.

## 2 · Proposed layout (before → after, main column)

| Now | After |
|---|---|
| Gallery | Gallery (full-bleed, share overlay) — *moved* |
| Title + basic meta | **Title bar: name · location · ★ score · Proven-Host badge** — *new* |
| Description (full text wall) | **Trust strip: verified · reputation · capacity** — *new* |
| Amenities (plain list) | Description (ingress + read-more) |
| Map | Amenities (icon grid) — *moved* |
| Reviews | **"Ask the host / request a custom deal" hook** — *new* |
| Host | Map |
|  | Reviews (with reputation module) — *moved* |
|  | Host |

Sticky right (both): booking card. After = restyled (price · dates · **party
size** · CTA · reassurance line).

## 3 · Section-by-section — mapped to real files

| Piece | File(s) | Work |
|---|---|---|
| **Booking card** — restyle, sticky-on-mobile, "authorized not charged" reassurance | `OrderPanel.js` + CSS | Restyle |
| **Title bar** — name, location, ★ score, Proven-Host badge, share | new `SectionListingHeader.js` | New |
| **Trust strip** — verified host, external reputation, capacity | new `SectionTrustStrip.js` (uses the external-reputation spec) | New |
| **Amenities grid** — icons instead of a list | `CustomListingFields.js` / `SectionDetailsMaybe` | Restyle |
| **Gallery** — full-bleed, share overlaid | `SectionGallery.js` | Restyle |
| **Description** — ingress + read-more clamp | `SectionTextMaybe` | Restyle |
| **Reviews + reputation** | `SectionReviews` + trust module | Restyle |
| **Map / Host** | `SectionMapMaybe` / `SectionAuthorMaybe` | Reuse |
| **Page shell** — new order + responsive grid | `ListingPageCarousel.js` + module CSS | Restyle |

## 4 · Phased build — shippable increments

Same rhythm as the sprint: each phase is its own blue-green deploy with rollback
+ a staged SSR proof, so nothing lands as one giant risky swap.

### PHASE 1 — Structure & booking card + reputation above the fold  (~½ day)
- New section order in `ListingPageCarousel.js`; responsive 2-col grid; sticky
  booking card reachable on mobile.
- Restyle `OrderPanel`: price hierarchy, party-size clarity, one clear CTA, the
  "authorized not charged" reassurance line.
- Reputation / trust module placed **above the fold** (native review score +
  Proven-Host/verified; external-reputation slot wired, dormant until that data
  feature populates `publicData.extRep`).
- Highest conversion lift for least surface area. **No checkout/data changes.**

### PHASE 2 — Trust & scannability  (~1 day)
- Full title bar + trust strip build-out.
- Amenities → icon grid; description → ingress + read-more.
- Wire the external-reputation module end-to-end (the empty-shelf fix).

### PHASE 3 — Polish & hooks  (~½ day)
- Prominent share on the gallery; "request a custom deal / ask the host" hook
  (ties to Custom Offers).
- Micro-polish: spacing, hover states, gallery full-bleed, reduced-motion,
  dark-mode parity.

## Guardrails

- **Zero** changes to the checkout transaction flow, pricing, or Stripe
  capture/refund — presentation only. Party-size + offers already live, untouched.
- Every phase staged on `:4000` with an SSR render proof before any swap.
- **Phase 1 holds at staging** until the Host Loop phone test (which runs
  through the live listing page) closes; Phase 1 is the first GO after.

## Open decisions

- **A · Reputation prominence:** above-the-fold trust strip (recommended — the
  empty-shelf fix) vs. down by reviews. → *Decided: above the fold.*
- **B · Phase 1 scope:** ship Phase 1 alone first for a fast phone test, then
  GO 2 & 3. → *Decided: build Phase 1 first, hold at staging.*

---

_Reconstructed from the live `ListingPageCarousel.js` teardown, PRNM brand
tokens, and features shipped this session (Twilio signature, Custom Offers,
Party-Size)._
