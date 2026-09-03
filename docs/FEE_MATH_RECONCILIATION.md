# Fee math reconciliation — production vs repository

**Date:** 2026-09-03
**Verdict: production fee math MATCHES the repository's stated facts. No drift.**
**Renter fee 15% · host fee 0% · all-in display equals checkout to the penny.**

Obtained without any credential and without creating a transaction, by calling production's
own read-only line-item calculator. Nothing was modified.

---

## 1. The finding that reframes the question

**Neither production nor Git contains the commission percentage.**

`server/api/transaction-line-items.js:11` calls `fetchCommission(sdk)`, which
(`server/api-util/sdk.js:160-162`) resolves to:

```js
sdk.assetsByAlias({ paths: ['transactions/commission.json'], alias: 'latest' })
```

The percentages live in a **Sharetribe-hosted JSON asset**, edited in Console, fetched at
runtime. `server/api-util/lineItems.js` only *applies* whatever that asset returns
(lines 256-271 and 475-490).

The consequence matters for this whole reconciliation: **the commission rate cannot drift
between the production filesystem and Git, because it is in neither.** A stale `/home/ubuntu/build`
could not have changed it. Both trees ask the same asset and get the same answer.

What *can* drift is **display** code that hardcodes a multiplier to show an "all-in" price.
That is what the CLAUDE.md incident actually was: "a stale 10% multiplier once showed $77/hr on
an $80.50 booking" — a display bug, not a commission bug. Section 4 checks for exactly that.

---

## 2. Production's live fee calculation (measured)

Endpoint: `POST https://www.poolrentalnearme.com/api/transaction-line-items`
Listing: `6a713580-85d9-43eb-8f84-35a431128c2f` ("The Backyard Oasis", Coeur d'Alene ID)
Order: 2 hours, booking start +5 days. HTTP 200. Response (transit+json, verbatim):

```
["^ ","~:data",[
  ["^ ","~:code","line-item/hour",
        "~:unitPrice",["~#mn",[4500,"USD"]],
        "~:quantity","~f2",
        "~:includeFor",["customer","provider"],
        "~:lineTotal",["^3",[9000,"USD"]],
        "~:percentage",null,"~:reversal",false],
  ["^ ","^1","line-item/customer-commission",
        "^2",["^3",[9000,"USD"]],
        "^7","~f15",
        "^5",["customer"],
        "^6",["^3",[1350,"USD"]],
        "^4",null,"^8",false]]]
```

Decoded:

| Line item | Base | Percentage | includeFor | Line total |
|---|---:|---:|---|---:|
| `line-item/hour` | $45.00 × 2 | — | customer, provider | **$90.00** |
| `line-item/customer-commission` | $90.00 | **15** | customer **only** | **$13.50** |
| `line-item/provider-commission` | — | — | — | **absent** |

Derived totals:

| Quantity | Value | Formula |
|---|---:|---|
| Renter (customer) fee | **15%** | `customer-commission.percentage` |
| Host (provider) fee | **0%** | no `provider-commission` line item exists |
| Stripe / Sharetribe payin (guest charge) | **$103.50** | 9000 + 1350 |
| Provider payout | **$90.00** | items with `includeFor` containing `provider` |
| Marketplace commission | **$13.50** | payin − payout |
| Host keeps | **100%** of listed price | 9000 of 9000 |

**Rounding.** `9000 × 0.15 = 1350` exactly, so this booking exercises no rounding path.
The rounding rule itself is Sharetribe's, applied server-side inside the Marketplace API —
not implemented in this repository. Line items are integer minor units (cents), so a rate
producing a fraction of a cent is rounded by Sharetribe before it reaches us. An odd-priced
listing should be spot-checked the same way before anyone claims the rule is exercised.

**Taxes.** No tax line item is produced and no tax configuration exists in the repository.

---

## 3. Comparison with the repository

`src/config/businessFacts.js`, sourced to ToS 2026.3 §4.1:

| Fact | Repo says | Production does | Match |
|---|---|---|---|
| `renterServiceFeePercent` | 15 | 15 | **yes** |
| `hostServiceFeePercent` | 0 | 0 (line item absent) | **yes** |
| `hostKeepsPercent` | 100 | 100 ($90.00 of $90.00) | **yes** |
| `allInPricingShownBeforePayment` | true | listing page shows $51.75 | **yes** |

---

## 4. All-in display check (the invariant that actually broke before)

CLAUDE.md: *"Any displayed 'all-in' price must equal the checkout total to the penny."*

Production listing page for the same listing displays **$51.75**.

```
base hourly            $45.00
× 1.15 (15% guest fee) $51.75   <- displayed
checkout, 1 hour:      4500 + 675 = $51.75
```

**The invariant holds.** Verified to the penny.

Repository scan for hardcoded fee multipliers (`* 1.15`, `* 0.15`, `/ 0.85`, `* 1.10`, …)
across `src/` and `server/`: **no hits in any fee path.** Every apparent match was SVG path
data. The one genuine constant is `src/config/hostAcademy.js:144 priceMultiplier: 1.10`, which
prices academy content and never touches a booking.

**Gap worth noting:** nothing imports `src/config/businessFacts.js`. It is a reviewed
reference plus a build-time copy gate (`server/api-util/businessFacts.test.js`), not a runtime
source. That is fine — the runtime source is correctly the Sharetribe asset — but it means the
file cannot prevent a future hardcoded multiplier from appearing in display code. The test gate
is the thing doing that work.

---

## 5. What this does NOT establish

This audit compared **production's runtime behaviour** to **the repository**. It did **not**
compare the production filesystem (`/home/ubuntu/build`) to the repository, because that
requires shell access to WEST, which was unavailable (see the drift report). So:

- Fee **percentages**: proven identical, and structurally incapable of drifting. Closed.
- Fee **display**: proven correct on the live listing page today. Closed for that page.
- Whether `/home/ubuntu/build` contains *other* modified files: **still unknown.** The 149-file
  figure comes from a previous session's finding recorded in CLAUDE.md, not from this audit.

The fee math was the highest-risk item in the drift. It is clean.
