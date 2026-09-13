# Justice For Pools — seven price tiers that were never offered

Listing `6a8905c7-2607-48ae-8935-3ea6a62b53c3`, `importedFrom: swimply:10961`,
created 2026-08-22.

## Root cause, at the line that decides the price

`server/api-util/lineItems.js` on WEST, ~line 375:

```js
const unitPrice =
  …
    : isBookable && priceVariationsEnabled && isPriceInSubunitsValid
      ? new Money(priceInSubunits, currency)   // the selected tier
      : <the listing's base price>
```

`publicData.priceVariationsEnabled` is a **required conjunct**. The listing had
seven `priceVariants` ($200 → $500/hr) but the flag was never written at import
time, so `OrderPanel`'s `isPriceVariationsInUse = !!publicData?.priceVariationsEnabled`
was false, the tiers were never offered, and **every booking billed at the $200
base** — up to $300/hr under-billed on a 41-50 guest booking.

Verified empirically before changing anything: a control listing with the flag
(`6a0271d5…`, 18 tiers) serialises `priceVariationsEnabled\":true` into its page
state; Justice For Pools did not contain the key at all.

## The fix

One field, via the Integration API:

```
PUT publicData.priceVariationsEnabled = true
```

Before / after, captured in `jfp-before-after.json`:

| field | before | after |
|---|---|---|
| `priceVariationsEnabled` | *(absent)* | `true` |
| `price` | `{20000, USD}` | **unchanged** |
| `priceVariants` (all 7) | 20000/25000/30000/35000/40000/45000/50000 | **unchanged** |
| `state`, `title` | published | **unchanged** |

Allison's amounts were not touched. The base price already equalled the lowest
tier (both 20000), which is the same relationship every one of the 88 correct
tiered listings has, so enabling the flag does not change the entry price.

Verified live afterwards: the listing page now serialises
`priceVariationsEnabled\":true` and all seven tier names render.

## Blast radius — the whole marketplace, all states

Queried `published`, `draft`, `pendingApproval` and `closed`:

- listings with **more than one** `priceVariants` entry: **89**
- of those, missing `priceVariationsEnabled: true`: **1** — this listing, and only this listing

Nothing else was touched, and no bulk fix was needed. The current wizard already
writes `priceVariationsEnabled: !0` (true) on publish, so this was a one-off
legacy defect from an import script that predated it, not an ongoing source of
new breakage.

## Regression coverage

`scripts/check-price-variants.mjs` in `fresh-web` locks the invariant: more than
one price variant requires the flag. It runs against live listings through the
Integration API, because the defect was in **data**, not code — the code was
always correct. Wired into `verify:deploy` and into the deploy gate as step 7b,
so a violation aborts a deploy.

Proof it passes now, run on EAST with real credentials:

```
check:price-variants — states published,draft,pendingApproval,closed
  listings with >1 priceVariants        : 89
  missing priceVariationsEnabled:true   : 0
PASS — every tiered listing actually offers its tiers.
```

The negative case is the incident itself: the same query run before the fix
returned exactly 1 violation, this listing. The check was not re-proven by
re-breaking a live listing.

CI has no Integration API credentials, so there the check exits 0 and reports
that it skipped, rather than failing a job for the wrong reason. That is a
documented gap: the invariant is enforced on the deploy path, not in CI.

## What was deliberately left alone

Nothing else. This was the only violation in the marketplace.
