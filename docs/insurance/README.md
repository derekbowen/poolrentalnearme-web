# Insurance source documents

`src/config/insurance.config.js` is the only place insurance values exist in the
application. This directory holds the documents those values were copied from,
so the trace can be checked without going back to the PDFs.

| File | What it is |
|---|---|
| `policy-facts.json` | Facts extracted from policy CSG-00536699-00 (bound 2026-08-17). Every value in `insurance.config.js` traces to a field here. |
| `APPROVED-LANGUAGE.md` | The allowlist of host- and guest-facing sentences, and the banned-strings list. Reproduced verbatim in `APPROVED_COPY` in the config, and the banned list is enforced by `scripts/check-insurance-language.sh`. |

Nothing in this directory is imported by the app. Changing a file here changes
nothing on the site — the config has to be edited too, and `npm run
check:insurance` has to pass.

## The publish gate is currently SHUT

`verified: false` and `named_insured: null`. No insurance copy renders anywhere
on the site until both change, and both should only change when the corrected
named-insured endorsement is in hand.

The declarations issue the policy to the trade name **Pool Rental Near Me**. The
Terms of Service, the host agreement, and the Stripe platform account are all
**PRNM Corp, a Delaware corporation** (a subsidiary of 10,000 Solutions LLC). A
named insured that does not match the entity named in the contracts is the kind
of gap that gets argued at claim time rather than at binding time, so nothing
publishes until the endorsement corrects it. See
`broker-request-named-insured.md`.

## Three facts that constrain all copy

1. **Liability only.** `CTF CW FREE 03 23` deletes Section I – Property in full.
   There is no property, contents, or business-income coverage for anyone.
2. **Hosts are not insureds.** The blanket additional-insured forms
   (`CTF CW AIMPB 08 23` and siblings) reach parties who lease or rent premises
   **to PRNM** under a written agreement executed **before** the loss. Listing a
   pool on the marketplace does not meet that trigger.
3. **"Excess" is narrower than it sounds.** The declarations describe the
   business as excess over property-owner or sharing-platform liability
   insurance. The operative condition, Section III H.2, makes Business Liability
   excess only over (a) insurance for direct physical loss or damage, or
   (b) other primary insurance covering premises or operations for which PRNM has
   been added as an additional insured. A host's homeowners policy is neither.
   `CTF CW ANTISTCK 03 21` then replaces H.2 outright with anti-stacking language
   between Coterie-issued policies. Do not describe this policy as sitting behind
   a host's own policy without asking the broker which clause is operative.
