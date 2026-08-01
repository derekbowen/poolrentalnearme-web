# HOMEPAGE CONVERSION AUDIT — poolrentalnearme.com (2026-08-01)

Measured live at 375×667 (iPhone SE class) with a real Chromium from the box,
plus curl at the edge and source-level greps. **No files were changed.**

## THE HEADLINE FINDING (read this first)

**The homepage is NOT the marketplace app.** nginx `location = /` proxies to
the EAST marketing server (fresh-web, `home-page.tsx`); the Sharetribe app only
serves `/s`, `/l/*`, `/dashboard`, checkout, etc. Consequence: **the hero/CTA
fixes staged earlier today in `current136-landing` (WEST) edit a landing page
that visitors never see at `/`.** The c135 dashboard/menu fixes in that same
image are unaffected and still fully valid — but the real homepage hero work
must be done in EAST `src/components/home-page.tsx` (a much lighter ship:
build + pm2 restart, no container flip). Everything below audits the page
traffic actually sees.

Second headline: **the fee story on the homepage is CLEAN.** Zero stale
host-fee claims (table E). The 0% weapon exists on the page — the problem is
placement and packaging, not truth.

---

## A) SECTION-BY-SECTION INVENTORY (top → bottom, mobile 375×667; fold = 667px)

| # | px top | Section | Headline (exact) | Key copy / CTA | CTA destination | Above fold? |
|---|---|---|---|---|---|---|
| 0 | 0 | Review ticker (rotating) | — | "…zero host fees!!" — Katherine · "Rock on, Derek…" etc. | none | **YES** |
| 1 | 56 | Topbar + hamburger | — | menu: Find a pool, Learn with Fred, How it works, Neighbors, **iOS app, Google Play**, Sign up, Log in, "List your space now" | mixed | **YES** |
| 2 | 109 | HERO | "Find the pool you'll fall in love with." | sub: "Rent a private pool by the hour, anywhere in America — real neighbors, real backyards, booked in minutes." · CTA1 button "Find a pool near me →" · CTA2 text "Have a pool? List it in 10 minutes →" · CTA3 text "Get the pool rental app →" | /s · /p/hosting · /p/pool-rental-app | **YES** (CTA3 at 463px) |
| 3 | 531 | Host-love band | — | "We love pool hosts — it's why this marketplace is what it is. ❤️ **0% host fees. Hosts keep every dollar.**" + listing ticker | none | **YES** (bottom third) |
| 4 | 663 | 100 DAYS OF SUMMER promo | "0% HOST FEES — ALL OF 2026" (10% struck through) | "You keep 100% of every booking. List your pool free." · button "List Your Pool →" (at 1061px) · small print incl. guest-fee disclaimer | /l/draft/…/new/details (straight into wizard) | edge of fold |
| 5 | 1292 | Two ways | "Two ways to fall for summer." | "…list your private pool and earn $3K–$10K/month" · card "I'm going swimming" · card "I'm sharing my pool" | /s · /p/hosting | no |
| 6 | 2046 | Occasions grid | "Any excuse is a good one to dive in." | Bachelorette/Birthday/Family/Swim Lesson/Pool Party/Just Tuesday tiles | /s?event=… | no |
| 7 | 2698 | Stats strip 1 | — | "Booked in 2 taps · 0% host fees" | none | no |
| 8 | 2998 | Stats strip 2 | — | "$2M Insurance per booking · 0% Host fees through 2026 · 40+ U.S. states · 24/7 Live human support" | none | no |
| 9 | 3439 | Press band | "AS FEATURED IN" | EIN Presswire · National Law Review · Eagle Country · KBEW | external links | no |
| 10 | 3584 | Love notes (reviews) | "Love notes 💌" | real host/guest quotes (Demarco, Katherine, Esther…) | none | no |
| 11 | 4322 | Featured pool video | "Tour Katy's Staycation Saltwater Getaway" | video + "Book this pool →" + "Browse all pools" | /l/katy… · /s | no |
| 12 | 5030 | Academy | "Learn with Fred — the only Pool Host Academy on the internet." | 193 free classes; course tiles incl. **"Switching from Swimply to PRNM"**, "Cross-listing on PRNM, Swimply & Peerspace" | /p/learningacademy, /p/course/* | no |
| 13 | 6364 | Pools near you | "Pools near you" | real listing cards w/ prices ("Book now →") | /l/* | no |
| 14 | 11863 | FAQ | "Questions? We've thought of everything." | insurance, contact-host, etc. | — | no |
| 15 | 12863 | Host advocacy | "Host smarter, host legally." | state law/permit/HOA guides | /p/* | no |
| 16 | 13819 | Pool types | "Browse by pool type" | saltwater/heated/etc. | /p|/s | no |
| 17 | 15368 | City directory | "Pool rentals in 592+ U.S. cities" | city links | /p/* | no |
| 18 | 16590 | Host CTA closer | "Got a pool? Turn it into income." | "Top hosts earn $3,000–$10,000 per month… Free to list, insured" · "List your pool →" | /l/draft/… wizard | no |
| 19 | 16886 | Text Derek + footer | "Stuck on anything? Text Derek." | founder SMS + socials + footer | sms: | no |
| — | fixed | **Sticky bottom bar** (61px) | — | "Find a pool" (white) + "List your space" (blue) | /s · /l/draft/… wizard | **YES, always** |

Page is **20,005px tall** on mobile — a ~30-screen scroll.

## B) HOST CONVERSION PATH

Fastest path (exists today, and it's actually good):
1. Tap **"List your space"** in the sticky bar (visible from second one) → lands on `/l/draft/00000000…/new/details` — the listing wizard.
2. Auth wall → Sign up (email/password form) → back in wizard.
3. Wizard steps → publish.
**= 1 tap to wizard intent, 2 taps + one form to actively building a listing.** Structurally strong.

The **hero** host path is the weak one: "Have a pool? List it in 10 minutes →" is a **20px-tall gray-white text link** (below the 44px tap minimum) → `/p/hosting` (marketing page) → "List your space now" → wizard → auth. That's 3 taps + form, starting from a link most thumbs will miss.

- **First "0% host fees":** host-love band at **531px — above the fold** on 375×667 (and comfortably above on modern 812–930px phones). The rotating ticker at 0px also surfaces "zero host fees!!" intermittently. So the weapon IS above the fold — **but it is never attached to a host CTA above the fold.** The words and the button live in different places.
- **Dollar math vs. competitors:** **absent.** "$3K–$10K/month" appears (twice) but nowhere does the page say the one sentence that flips a Swimply host: *"Swimply keeps 15–30% of that. We keep 0%."* The 10%→0% strikethrough compares us to *our own old fee*, not to Swimply's.
- **Copy for already-renting hosts:** exists but buried at ~6,000px (Academy tiles: "Switching from Swimply to PRNM", "Cross-listing"). Above the fold, the page speaks only to first-timers ("List it in 10 minutes").

## C) GUEST CONVERSION PATH

1. Tap "Find a pool near me →" (hero) or "Find a pool" (sticky) → `/s` (map + list, geolocates).
2. Tap a listing → listing page.
3. Pick date/time/party size (2–3 taps) → Request to book → checkout.
**≈ 5–6 taps homepage → payment screen.** No location/zip input above the fold — the CTA dumps straight to `/s` and relies on its geolocation. Acceptable; a zip field in the hero is a test idea, not a defect. Occasion tiles (`/s?event=…`) are a nice intent shortcut but sit at 2,046px.

## D) FULL CTA TABLE (visible, in order; fold = 667px)

| px top | Text | Style | Size (w×h) | Destination | Notes |
|---|---|---|---|---|---|
| 363 | Find a pool near me → | BUTTON, sky blue #0EA5E9 | 229×56 | /s | primary, good |
| 431 | Have a pool? List it in 10 minutes → | text link, white/95 | 226×**20** ❌ | /p/hosting | **the host CTA, as a whisper** |
| 463 | Get the pool rental app → | text link, white/90 | 159×**20** ❌ | /p/pool-rental-app | third competing CTA, for the frozen app |
| fixed | Find a pool | button, white | 173×44 | /s | sticky bar |
| fixed | List your space | button, blue | 171×44 | /l/draft/… wizard | sticky bar — best host CTA on page |
| 1061 | List Your Pool → | button, white on blue bg | 194×56 | /l/draft/… wizard | inside 100-days promo |
| 1456/1736 | I'm going swimming / I'm sharing my pool | big cards | 343×260 | /s · /p/hosting | good |
| 2146+ | Occasion tiles ×6 | tiles | 160×160 | /s?event=… | good |
| 3463+ | Press links ×4 | text links | h **24** ❌ | external | minor |
| 4855 | Book this pool → / Browse all pools | buttons | 343×48/50 | /l/… · /s | good |
| 5836 | Learn with Fred — 193 free classes → | button | 328×48 | /p/learningacademy | good |
| 6564+ | Listing cards ("Book now →") | cards | 343×358+ | /l/* | good |
| 16590 | List your pool → | button | — | wizard | closer |
| menu | iOS app / Google Play | menu links | 48h | app stores | **remove while app is frozen** |

**Above-fold competing CTAs: 5** (3 hero + 2 sticky) — flag, spec says >2 is too many. Two of the five are 20px text links. No vague "Learn more" CTAs anywhere — copy specificity is good.

## E) FEE CLAIM TABLE

| Location (px) | Exact string | Matches 0% position? |
|---|---|---|
| 0 (ticker) | "That is amazing that there are zero host fees!!" | ✅ |
| 531 | "0% host fees. Hosts keep every dollar." | ✅ |
| 845/876 | "~~10%~~ 0% HOST FEES — ALL OF 2026" | ✅ (strikethrough = our old fee, promo framing) |
| 977 | "You keep 100% of every booking. List your pool free." | ✅ |
| 1141 | "0% host fees valid through Dec 31, 2026 on all bookings. Guest service fee applies at checkout…" | ✅ (guest fee = allowed disclosure) |
| 1235 | "0% host fees through 2026 · $2M Hartford-backed insurance · 100% US-based support" | ✅ |
| 1851 | "…$2M Hartford-backed insurance, 0% host fees through 2…" | ✅ |
| 2698/2939 | "Booked in 2 taps · 0% host fees" | ✅ |
| 3130–3190 | "0% Host fees through 2026 / Hosts keep every dollar" | ✅ |
| 5900 | "100% free · English & Español" (Academy — not a fee claim) | n/a |

**Verdict: 100% consistent. Zero stale host-fee claims on the homepage.**

## F) TECHNICAL FINDINGS

- **Server-rendered: YES, verified** — `curl` returns the full `<h1>Find the pool…` and content without JS.
- **Hero image:** `love-hero-CxQHMi2R.jpg` — **174,771 B JPEG, 1024×1024**, preloaded with `fetchPriority=high`, immutable cache. Under the 200KB bar but (a) JPEG not webp/avif (~half the bytes possible), (b) it's a square portrait being cover-cropped, and (c) **it's the wrong subject** (see G-1).
- **🔴 993,423 B JPEG (`hero-family-pool-B63SS9RY.jpg`) is ALSO preloaded `fetchpriority=high`** — for a 190px-tall card far below the fold. On 4G this ~1MB download competes head-to-head with the real hero for bandwidth. Worst single technical fact on the page.
- **LCP estimate:** hero img; ~1.5–2s on wifi, **~3–4.5s on 4G** (dragged by the 1MB co-preload). Measured full networkidle from a wired box: 3.1s.
- Render-blocking: one stylesheet (normal); `/tools/home.js` + `/tools/cta.js` injected `async` (non-blocking). Four image preloads total — two too many.
- nginx `sub_filter` is patching "135 free classes"→"193" at the edge — works, but means the EAST source still says 135 (drift to clean up whenever EAST ships).

## G) TOP 10 CONVERSION PROBLEMS — ranked by impact on HOST signups

1. **The hero sells a man's face, not a pool — and not hosting.** The product shot (the pool) is a blurry strip behind a portrait; the headline sits on his forehead. A Swimply host landing here sees nothing about money or fees in the visual field. *Fix:* swap to the real "Paradise on Paradise" dusk photo (string lights, glowing water — already selected and staged, just on the wrong server); re-target the fix to EAST `home-page.tsx`, export as ~150KB webp.
2. **The above-fold host CTA is a 20px whisper with no money in it.** "Have a pool? List it in 10 minutes" — no 0%, no dollars, sub-tap-size, goes to a marketing page instead of the wizard. Meanwhile the best host CTA on the page (sticky "List your space" → wizard) says nothing about 0% either. *Fix:* promote to a real secondary button: **"Have a pool? Earn with 0% host fees →"** and send it to the wizard draft URL like the sticky bar does; consider "0% fees" micro-badge on the sticky button.
3. **No Swimply dollar math anywhere.** Our only weapon never fires at the competitor. The strikethrough compares to our own 10%. *Fix:* one line under the 100-days promo or in TwoWays: "On a $1,000 month: Swimply hosts keep ~$700–850. PRNM hosts keep **$1,000**." (Their fee range is public; keep the claim conservative and sourced.)
4. **Nothing above ~6,000px speaks to the already-renting host** — the exact target. The switch-from-Swimply content exists (Academy tiles) but is nine screens deep. *Fix:* a slim "Already hosting on Swimply or Facebook Marketplace?" strip in the top three screens linking to the switch guide + cross-listing course + wizard. This is the audience-match fix; it costs one section.
5. **993KB below-fold image preloaded at high priority** slows the first paint that all conversion depends on. *Fix:* drop the preload, lazy-load the card, compress the asset (source is 993KB in repo; a 190px card needs ~30KB).
6. **"Get the pool rental app" is the #3 CTA above the fold — for a frozen, broken app** that has been hijacking our own booking links all week (AASA firefighting, Lauren, Marco). Every host or guest who taps it risks the broken path; the topbar menu also carries iOS/Google Play store links. *Fix:* remove from hero + menu until the Journey Horizon custody question resolves.
7. **Five competing CTAs above the fold.** Guest button + 2 text links + 2 sticky buttons. *Fix:* falls out of #2 + #6 — one guest button, one host button, sticky bar.
8. **Press band leads with EIN Presswire** (a paid wire — savvy hosts recognize it) and omits the strongest brands. AP News / USA Today network / Nexstar syndication is not cited anywhere on the homepage. *Fix:* if we have those placements, name them; if we can't verify a live URL for them, keep the band as-is (facts rule) — but move National Law Review first and cut EIN Presswire.
9. **"Top hosts earn $3,000–$10,000/month" is not backed by our own data yet** (93 pools, 1–3 bookings/day). It's an industry-plausible claim, but it's exactly the kind of number a burned Swimply host will challenge, and "is this legit?" is our #1 objection. *Fix:* either ground it ("hosts like Katy charge $55/hr — 8 bookings a weekend is $440") or soften to "pools like yours rent for $40–$75/hr near you." Real math converts skeptics better than big ranges.
10. **Scrim is bottom-weighted while the text sits high** — `rgba(11,39,51)` gradient hits 0.82 only at the bottom; the headline/subhead ride the 0.28-and-thinner zone over a busy photo. Legibility is genuinely marginal over the trees. *Fix:* one-line gradient change (mid-stop ~0.45), already drafted.

Not problems (worth saying): fee-claim hygiene is perfect; the page is properly SSR'd; the sticky dual-CTA bar is the best thing on the page; reviews are real quotes; there's no horizontal overflow; the wizard-direct draft URL is a genuinely fast host on-ramp.

## H) QUICK WINS (<30 min each, all on EAST = build + pm2 restart, no flip)

1. Hero secondary CTA → real button, copy "Have a pool? Earn with 0% host fees →", target the wizard draft URL. (~10 min)
2. Remove "Get the pool rental app" from hero; remove iOS/Google Play from topbar menu. (~5 min)
3. Kill the 993KB `hero-family-pool` preload + lazy-load that card. (~5 min)
4. Scrim gradient mid-stop 0.28→0.45. (1 line)
5. Hero photo swap to Paradise-on-Paradise dusk (webp, ~150KB) — asset already chosen; re-cut for EAST. (~15 min)
6. Add the one-sentence Swimply math line under the 100-days promo. (~10 min, copy above)
7. Fix the "135 free classes" source drift so nginx sub_filter can retire. (~5 min)

Items 1–6 are, together, the honest version of the Opus critique — aimed at the
page users actually see. **None applied. Awaiting your go, and your call on
the $3K–$10K claim (G-9) and press-band naming (G-8).**
