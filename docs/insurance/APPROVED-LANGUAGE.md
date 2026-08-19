---
priority: P0
audience: Cody (Claude Code), Brandon, any generator prompt writing insurance copy
scope: poolrentalnearme.com, Sharetribe Console strings, Supabase-generated pSEO pages, host emails, Intercom macros, PDFs
---

# Insurance Language Allowlist — CSG-00536699-00

Every insurance string on the platform must trace to `policy-facts.json`. If a claim cannot be sourced to a field in that file, it does not ship. This file exists because the last remediation pass had to strip false carrier claims out of 6,386 Supabase rows, 7 generator prompt files, and 9 Console strings.

## The three facts that constrain everything

1. **This is a liability-only policy.** `CTF CW FREE 03 23` deletes Section I – Property in full. There is no property, contents, or business-income coverage on this policy for anyone.
2. **It sits excess, not primary.** The declarations describe the business as *"excess over any property owner or sharing platform liability insurance."* It backstops PRNM's own liability. It does not replace a host's homeowners policy.
3. **Hosts are not automatically additional insureds.** `CTF CW AIMPB 08 23` is blanket, but it only reaches parties who lease or rent premises **to PRNM** under a written agreement executed **before** the loss. A host listing a pool on the marketplace does not meet that trigger without a signed agreement structured to meet it.

## Approved strings

| Context | Approved copy |
|---|---|
| Trust badge | "PRNM carries $2M per-occurrence commercial general liability through Spinnaker Insurance Company." |
| Trust page | "Pool Rental Near Me maintains a Businessowners Policy underwritten by Spinnaker Insurance Company and administered by Coterie Insurance Agency, LLC. Limits: $2,000,000 per occurrence / $4,000,000 aggregate." |
| Host FAQ — what this covers | "This is Pool Rental Near Me's own commercial liability policy. It covers the platform's operations. It is not a substitute for your homeowners or landlord policy, and it does not insure your property." |
| Host FAQ — what hosts should carry | "Hosts are responsible for their own coverage. We recommend confirming with your carrier that short-term pool rental is permitted under your policy before you accept bookings." |
| Certificate requests | "We can request a certificate of insurance from our broker. Additional insured status requires a written agreement executed before any loss and is reviewed case by case." |

## Banned strings — never generate these

- ❌ Any carrier name other than **Spinnaker Insurance Company** (underwriter) or **Coterie Insurance Agency, LLC** (administrator). Hartford, Lloyd's, Chubb, "our A-rated carrier," etc. — none of these are on this policy.
- ❌ "Hosts are covered," "you're protected," "every booking is insured," "$2M host protection," "guest protection guarantee." Hosts are not insureds.
- ❌ "Property damage to your pool or home is covered." Section I is deleted.
- ❌ "Covers injuries from pool water, illness, or contamination." Communicable disease, fungi/bacteria, and total pollution are all excluded.
- ❌ "Covers incidents involving minors" framed as protection. The abuse or molestation exclusion is absolute and includes negligent supervision.
- ❌ "Your data is insured" / breach-response claims. Cyber, data-related liability, and data-privacy-law exclusions all apply.
- ❌ Any dollar figure not present in `policy-facts.json`.
- ❌ Implying primary coverage. Primary and noncontributory status under `BP 14 88 07 13` requires a specific written contract and additional-insured status.

## Generator rule for Cody

```
INSURANCE_FACTS = load('policy-facts.json')   # config only, zero DB writes
- No template may hardcode a carrier name, limit, or coverage claim.
- Any insurance token in a pSEO template resolves from INSURANCE_FACTS or fails the build.
- Add a CI grep for the banned terms above across templates, prompts, and Console strings.
- Host-facing copy renders from the "Approved strings" table only.
```

## Open items to verify before any expansion of claims

- Whether the host agreement can be structured to trigger `CTF CW AIMPB 08 23` — that is a broker + counsel question for Josh Dunmire, not an assumption to build on.
- Whether a separate host-facing product (participant accident, host liability) is needed to make any "host protection" claim truthful. Today, no such claim is supportable.
