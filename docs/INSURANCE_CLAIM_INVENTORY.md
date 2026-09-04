# Insurance claim inventory

Read-only. **No insurance wording was written, rewritten, softened or removed.**
House rule: insurance language is Derek's. This file only says where the
statements are and which ones disagree with the authoritative sources.

Captured 2026-09-04.

---

## The two authoritative sources, both already in this repo

**1. `src/config/insurance.config.js`** — describes itself as *"the ONLY place
insurance values exist in this codebase"*, created after a June incident in which
unverified claims propagated across 6,386 Supabase rows, 7 generator prompts, 9
Console strings, Intercom articles, ToS language and press pitches.

Its publish gate is **shut**:

```js
verified: false,
verified_date: null,
verified_against: null,
```

The file's own rule: *"a missing or unverified field means the component does not
render. Never a fallback string, never a default, never 'coverage available.'"*
The gate is held shut by one field — `named_insured` — because the declarations
issue the policy to the trade name "Pool Rental Near Me" while the ToS, the host
agreement and the Stripe platform account are all **PRNM Corp**
(`named_insured_endorsement_status: 'requested_not_received'`).

It also records the carrier: **Spinnaker Insurance Company**, administered by
**Coterie Insurance Agency, LLC**, policy `CSG-00536699-00`, bound 2026-08-17.

**2. Terms of Service 2026.3** (`src/containers/TermsOfServicePage/terms-2026-1.js`),
effective 2026-05-06, last updated 2026-08-17:

> "PRNM is **not** a property owner, lessor, real estate broker, travel agency,
> **insurance carrier**, or party to any rental…"

> "**PRNM is not an insurance company, broker, or agent, and PRNM does not
> provide, arrange, underwrite, or guarantee insurance of any kind to Hosts,
> Renters, or their guests.**"

> "PRNM does not request, collect, review, or verify Host insurance…"

> "Nothing on the Platform, in any Listing, or in any PRNM communication should
> be read as a promise that a Booking is insured…"

A code comment in the same file adds: *"PRNM's own commercial policy insures PRNM
only."*

---

## What production actually serves today

The live homepage app bundle is **clean**. Counting occurrences across
`/fw-assets/index-Dbzl3FRr.js` and `/fw-assets/index-DqTt9-Fr.js`:

| Pattern | Hits |
|---|---|
| `Hartford` | **0** |
| `$2M` | **0** |
| `10% flat` | **0** |
| `0% host` | 37 |
| `does not provide or arrange` | **8** |

The only two `$2 million` strings describe **Giggster's** certificate-of-insurance
requirement on a competitor-comparison page — a factual statement about another
company, not a PRNM claim.

So EAST has already been corrected. That matters for sequencing: this is not a
sprawling cleanup, it is **one line**.

### The single live contradiction

`/tools/cta.js` line 16 — an on-box script, not part of the app bundle — injects
`Organization` JSON-LD **on every page**:

> `"description": "U.S. marketplace for renting private swimming pools by the
> hour. 0% host fees through 2026; every booking includes $2M liability
> protection via The Hartford."`

Against the two authorities this is wrong three ways:

1. it asserts PRNM provides coverage, which ToS 2026.3 explicitly denies;
2. it publishes a `$2M` figure while `insurance.config.js` has `verified: false`;
3. it names **The Hartford**, while the policy record in this repo names
   **Spinnaker / Coterie**.

Meanwhile the visible `FAQPage` schema on the same page says PRNM *"does not
provide or arrange insurance."* Both are served to Google, on the strongest URL,
in the same response.

---

## Full inventory

| # | Location | Statement | Against the authorities |
|---|---|---|---|
| 1 | **LIVE** `/tools/cta.js:16` (Organization JSON-LD, every page) | "every booking includes $2M liability protection via The Hartford" | **Contradicts.** Wrong carrier, unverified figure, denied by ToS |
| 2 | **LIVE** homepage `FAQPage` + visible copy | "does not provide or arrange insurance… we do not verify whether hosts…" | **Consistent** |
| 3 | **LIVE** app bundle | no PRNM insurance claim | **Consistent** |
| 4 | ToS 2026.3 | "not an insurance company… does not provide, arrange, underwrite, or guarantee" | **Authority** |
| 5 | `src/config/insurance.config.js` | `verified: false` — nothing may render | **Authority** |
| 6 | `fresh-web` (May) `home-page.tsx:27` | "$2M liability insurance for the host" | Contradicts |
| 7 | `fresh-web` (May) `home-page.tsx:195` | "★ 4.8 · 50,000+ guests · $2M insurance included" | Contradicts, plus fabricated stats |
| 8 | `fresh-web-702e04c3` (July) `home-page.tsx:40` | "$2M liability insurance for the host" | Contradicts |
| 9 | `fresh-web-702e04c3` `home-page.tsx:199` | "10% flat host fee · $2M Hartford-backed insurance" | Contradicts + wrong carrier + wrong fee |
| 10 | `fresh-web-702e04c3` `home-page.tsx:245` | "$2M Hartford-backed insurance and 10% flat fees" | Contradicts + wrong carrier + wrong fee |
| 11 | `fresh-web-702e04c3` `home-page.tsx:292` | "$2M" trust statistic | Contradicts |
| 12 | `fresh-web-702e04c3` `index.tsx:29` **meta description** | "Swimming pool rental with $2M liability insurance included." | Contradicts — and this one is indexable |
| 13 | `fresh-web-702e04c3` `home-page.tsx:35` | "PRNM bookings include built-in liability coverage" | Contradicts |

Rows 6–13 are **not live**. They would become live the moment anyone builds the
homepage from either GitHub copy — which is the reason the winter homepage must
not be implemented against them.

Not checked, because this session cannot reach them: Sharetribe Console strings,
Intercom articles, outbound email templates, and the mobile app. The June
incident touched all four, so they are worth a pass before this is called closed.

---

## What this means for the winter homepage

The winter homepage carries **no insurance claim at all**. That is not a
placeholder or an omission — with `insurance.config.js` gated shut, rendering any
insurance value would violate the file's own fail-closed rule.

The trust row uses four things that are verifiable without touching insurance:
secure booking, direct host messaging, guest waivers, human support. Guest
waivers are supported by ToS ("Every booking requires a signed guest waiver").

**One decision for Derek**, and it is only a decision — no wording is proposed
here: the JSON-LD line in `/tools/cta.js` and the homepage FAQ currently say
opposite things to Google. The FAQ matches ToS and the policy record; the JSON-LD
does not.
