# 0% HOST FEES → PERMANENT — Step 1 Scope Report
*2026-08-01 · Measured across EAST source, WEST app + messaging, and the
content database. **Nothing changed yet.** Sweep starts on your GO.*

## THE HEADLINE NUMBERS

| Surface | Scope |
|---|---|
| Content DB (pSEO pages) | **~4,600 EN pages** with "through 2026" in the body (3,931 host-city + 446 resource + 221 event-guide) + **374 ES pages** ("durante 2026") + **1,366 meta descriptions** + 80 "promotional" + 375 "promocional" |
| EAST source | **86× "through 2026" across 31 files** (hosting page, all comparison pages, FAQs, earnings calculator, advocacy template, homepage) + the 100 DAYS block + strikethrough-10% |
| WEST app | 2 signup schema/meta strings in translations (**needs a container rebuild+flip**) |
| Outbound templates | 1 live email drip (10 emails, several "through 2026", **one that promises fees RETURN**), 4 SMS/email campaign scripts, 1 affiliate coaching template still saying "keep 90%" |
| JSON-LD | Clean of fee expiry. (JobPosting `validThrough` on host-city pages is job-posting freshness markup, not fee expiry — recommend keep.) |
| ToS | **Clean** — live ToS has zero fee/2026 language. No legal edit needed (one decision item below is legal-adjacent). |

Estimated total: **~5,100 DB pages + ~35 source files + 1 WEST bundle string-pair + 6 messaging templates.**

---

## 🚨 MOST URGENT ITEM (time-sensitive, flagging before everything else)

**The cold-email drip (live, ~1,088 sends logged since 7/21) contains an email
that says the OPPOSITE of the new policy:**

> *"Straight talk: 0% host fees run through December 2026. **After that,
> standard pricing kicks in for new bookings.**"* (day-27 email, "The 0%
> window won't last forever")

By the drip's day-offsets, the earliest cohort becomes eligible for this email
**around mid-August** — I believe it has not sent yet, but it's armed. Under
the new policy this email's entire premise (scarcity window) is dead.
**Recommend fixing/pulling this one email immediately, ahead of the main
sweep** — say the word and I'll do just that one tonight. (Kill switch also
available: `touch /home/ubuntu/email-drip/STOP` pauses the whole drip.)

---

## A · CONTENT DATABASE (the big one)

| Pattern | Body rows | Meta rows | Replacement |
|---|---|---|---|
| "0% host fee through 2026" + variants ("(through 2026)", "our low 0% host fee through 2026") | ~4,600 | 1,366 | "0% host fees — hosts never pay a fee" (variant-by-variant regex family, like the July sweep) |
| "promotional" (EN) | 80 | 23 | drop the word; permanent phrasing |
| "durante 2026" / "promocional" / "promoción" (ES) | ~377 / 375 / 389 | 14 | "0% de comisión para anfitriones — los anfitriones nunca pagan comisión" |
| "hasta 2026" | 19 | 2 | same ES treatment |
| "limited time" | 41 | 0 | inspect each — some may be event copy, not fees |
| "10%" | 1,154 | 133 | **needs classification, not blind replace**: (a) "down from 10%" self-comparisons → delete per your rule; (b) competitor-fee mentions → keep; (c) unrelated (e.g. "10% discount ideas" in guides) → keep. I'll classify in the dry-run and show you the split before applying. |
| "90%" | 291 | 15 | same classification (most are "Swimply hosts keep ~85–90%"-type competitor math → keep; any "you keep 90%" → fix) |
| "keep 90" | 0 | 0 | already clean ✓ |

Awkward-phrasing alert: hundreds of DB pages say things like *"our **low** 0%
host fee through 2026"* — a straight substring swap leaves "our low 0% host
fee," which reads odd. The regex family will rewrite the full phrase, same
method as July's 6-pass sweep. Full backups before writing, as always.

**⚠️ Re-seeding risk (must be in scope):** the page-generator scripts
(`gen-host-pages`, `host-city-tail-fix`, `backfill-content-pages`,
`auto-outreach`, `admin-quick-page`) contain the old fee copy in their
templates. If we sweep the DB but not the generators, the next generated city
page reintroduces "through 2026." They're in the sweep plan.

## B · EAST SOURCE (31 files; the load-bearing ones)

| File | What's there | Replacement |
|---|---|---|
| `home-page.tsx` | 100 DAYS OF SUMMER block (eyebrow, "ALL OF 2026" headline, ~~10%~~ strikethrough, "valid through Dec 31, 2026" small print), stats strip "0% Host fees through 2026", host card copy | Retire seasonal framing → permanent policy block: "0% HOST FEES" / "Hosts never pay a fee — you keep 100% of every booking." Delete strikethrough. Keep Swimply math line. Small print becomes the trust paragraph. |
| `p.hosting.tsx` (12×) | title tag "0% Host Fees All of 2026", meta, FAQ answers, "We charge 0% through all of 2026" | Rewritten by hand (titles/meta need sense, not find-replace) + **the trust paragraph added** |
| 4 comparison pages (Swimply/Peerspace/Giggster/fees-compared + city variants, ~22×) | "0% through 2026" vs competitor tables; Swimply page says "(down from 10%)" | Permanent language; delete "(down from 10%)"; **trust paragraph added**; competitor fees untouched |
| `p.la-saltwater-featured.tsx` | **"Flat host fee: 10%"** — genuinely stale, July sweep missed it | → "Host fee: 0% — never" |
| `lib/page-faqs.ts` (4×) + `p.start-hosting.tsx` (4×) | FAQ answers with 2026 framing | Permanent answers + trust paragraph on the FAQ |
| `earnings-calculator` (route + component) | "With 0% host fees through 2026, your net equals your gross" | "With 0% host fees, your net equals your gross — hosts never pay a fee." Math already correct (0%). |
| `advocacy.tsx` template (2×) | CTA footer line | permanent phrasing |
| `p.pool-rental-app.tsx` (3×), event/city templates (~6×) | scattered 2026 lines | permanent phrasing |
| `email-static/host-drip/_shared.ts` | welcome-drip email subject **"…keep 90%"** (stale, pre-0%) | "…keep 100%" |
| `lib/affiliate-coaching-templates.ts` | suggested social copy "**I keep 90%** of every booking" | "I keep 100%" |
| Homepage guest-fee small print | "Guest service fee applies at checkout. **Promotional guest fee valid for a limited time.**" | ⚠️ DECISION #1 below |

## C · WEST (Sharetribe app + messaging)

| Item | What's there | Action |
|---|---|---|
| `translations/en.json` ×2 | signup page schema title/description: "0% host fees **for 2026**" | Edit + **requires container rebuild & flip** — I'd fold it into the staged c135/c136 image so it ships in the flip you already owe a GO on. Nothing else on WEST needs a flip. |
| `campaign/promo-send.py`, `reopen-ask.js`, `final-copy.txt`, finish-setup SMS | "through ALL of 2026", "0% host fees all of 2026" | permanent phrasing (templates only; past sends are sent) |
| Same SMS templates | claim **"guests just pay a 5% booking fee"** | ⚠️ DECISION #2 below — I will not touch fee numbers without your confirmation |
| Email drip `emails.json` | day-6 subject/body "through 2026"; **day-27 "window won't last forever" (fees-return email)** | rewrite both; day-27 needs a whole new angle (suggest: the trust paragraph as an email — "why free isn't a catch") |
| Live ToS + /host-standards | clean | none ✓ |

## D · SCHEMA & SEO

- **No `priceValidUntil` or fee-related `validThrough` anywhere** — verified in
  source and on live pages. ✓
- `JobPosting.validThrough` (host-city pages) is a rolling 60-day **job-post
  freshness** field required by Google — not a fee claim. Recommend: keep.
- **1,366 DB meta descriptions + ~6 source title/meta tags** contain "2026" —
  these get rewritten (not blind-replaced) so they still read as sentences.
- FAQPage JSON-LD on hosting/start-hosting renders from the same copy being
  fixed, so it inherits the fix. Will verify in Step 4.
- No page's entire premise is the promotion — the closest is the homepage
  100 DAYS block, which you've already ruled on (becomes permanent block).

## E · ⚠️ DECISIONS I NEED FROM YOU (I will not guess on fee language)

1. **The guest-fee small print** on the homepage says *"Promotional guest fee
   valid for a limited time."* That's about the GUEST fee being intro-priced —
   a separate promise from host fees. Under the new rules ("no expiry framing
   whatsoever"), does this stay (it's about guests, accurately promotional) or
   go? If the guest fee's current rate is permanent too, I'll cut it; if the
   guest fee genuinely is intro-priced, it stays and I'll leave it exact.
2. **"Guests just pay a 5% booking fee"** in two SMS templates — is 5% the
   real current guest service fee? Everywhere else we say "a small service
   fee." I'd like to either verify 5% against a live checkout or standardize
   on "a small service fee at checkout." Tell me which.
3. **Two docs I wrote for you tonight** (VA guide + Matthew's 60-day update)
   use "through Dec 31, 2026" framing. If either has already been sent, you
   may want a one-line follow-up ("update: it's permanent now — even better").
   I'll reissue both docs with permanent language after the GO.
4. **Press boilerplate**: the National Law Review piece's syndicated text
   predates even the promo (it mentions the old flat fee). Can't edit
   syndicated press — the parked "0% permanent" press release is the fix, and
   this policy change makes that release stronger. Just connecting the dots.

## F · EXECUTION PLAN (after your GO)

Commit/change groups, in order — each independently verifiable and revertable:
1. **Drip email fix** (the fees-return email — tonight if you want it early)
2. **EAST copy** (homepage block, hosting, comparisons, FAQs, calculator,
   templates, la-saltwater, affiliate/drip templates) + trust paragraph on
   /p/hosting, homepage FAQ, all comparison pages — build + pm2 restart
3. **Generator scripts** (so new pages are born permanent)
4. **DB sweep EN** (regex family, dry-run counts → apply → re-scan; full
   backups) — pattern of the July sweep, ~4,600 pages + 1,366 metas
5. **DB sweep ES** (~390 pages)
6. **"10%"/"90%" classification pass** — I show you the three-way split
   (self-comparison / competitor / unrelated) before touching any of them
7. **WEST translations** — folded into the staged image; ships with the flip
8. **Step 4 verify**: zero-expiry re-grep on all surfaces incl. DB + schema,
   curl of 10 random live pages across 6 template types, contradiction check,
   guest-fee disclosure intact, totals by template type

Effort: EAST same-night; DB sweep is the long pole (the July one took 6
passes to reach zero — this one starts from cleaner ground since I wrote most
of the strings being replaced). No container flip needed except item 7, which
rides the flip already staged.

**Report ends. Awaiting your read + GO, and answers to E1–E2.**
