# HOST UX INVESTIGATION — "Shawn & Chris" report (2026-08-01)

Measure-first audit of the four issues reported by host "Shawn & Chris" via SMS.
Everything below is verified against live Flex data, live Stripe responses, the
production box source tree, and this repo. **No deploys were made.** All patches
are on branch `claude/marketplace-repo-verify-v8h67k`, held for Derek's go.

Scope note: the live marketplace runs from the WEST box tree (release
`current134-publishconfirm`, flipped 2026-07-30 18:02Z), which is ahead of this
repo. As part of this work the `HostDashboardPage` container (js/duck/css) was
ported into the repo **byte-identical** to production (md5-verified) and wired
into routing, so the patches here are genuinely mergeable and the repo/server
divergence (#107) shrinks.

---

## ISSUE 0 — the live "someone wants to swim": FOUND

The host is **Shawn Gray** (display name; listing **"Paradise on Paradise"**,
email `grayline6@juno.com`, Flex user `69fbf9d8-d388-40e0-aaee-1e70fb122bc8`,
`stripeConnected: true`).

The pending item is **NOT a booking request — it is a message-only inquiry**:

- Transaction: `6a6915ea-622d-407b-b6ae-2e4d539e951b`
- Process: `default-booking` **v9**, last transition `transition/inquire`
  @ 2026-07-28 20:49Z (created same moment). No payment, no booking object.
- Guest: **Jessica** (`jessica90banda@gmail.com`) — the SAME guest whose paid
  booking just completed ($225.75 in / $215.00 to Shawn, swam 7/28, transition/complete 7/31).
- Her ask (verbatim): *"hello is it to late to add on the bbq"* / *"or are we
  aloud to bring our own?"*
- Shawn never replied in that thread. Instead, 52 minutes later, he answered her
  BBQ question **inside the old completed-booking thread**: *"I can't get it to
  work. Can you just bring a twenty for the BBQ?"* — direct evidence he could
  not find/open the inquiry.

**For Derek:** nothing to rescue commercially (Jessica got her answer, the swim
already happened, and she was even promised "a discount code for your next
booking" — see Issue 4). The inquiry thread still shows unanswered, which is
what keeps the dashboard nagging him.

## ISSUE 1 — mobile-web nav Dashboard link

**Verified facts**

- The live box tree's `TopbarMobileMenu.js` **already contains** a Dashboard
  link (`dashboardLinkMaybe`, added 7/30 07:30Z), and the running container's
  server bundle (`dist/server/assets/TopbarContainer-DwBjtjPv.js`) contains it —
  so production mobile web **since 7/30 18:02Z** shows: Dashboard, Inbox, Your
  Listings, Profile Settings, Account Settings, My Wishlist + custom links.
- Gate: `showCreateListingsLink = showCreateListingLinkForUser(config, user) || !!currentUser`
  → true for every logged-in user. Not Shawn's blocker.
- Shawn's quoted menu ("it says **more**, which has list your pool homepage,
  find a pool, download our app, google play locations, list your space, my
  wish list and inbox") matches either (a) the pre-7/30 bundle (stale tab; the
  c117 self-heal only reloads on chunk errors, it can't refresh an old open
  tab), or (b) the Flutter app's **"More"** bottom-nav tab — the web menu is a
  hamburger with no "More" label. If it's (b), it's out of scope per the
  Journey Horizon custody freeze, and one more reason hosts should live on
  mobile web.
- **This repo had none of it** — no HostDashboardPage, no route, no links.

**Patch (this branch)**

- Ported `src/containers/HostDashboardPage/` (3 files, byte-identical to prod)
  + `/dashboard` route (auth-gated) into the repo.
- `TopbarDesktop.js`: Dashboard in avatar menu + topbar (parity with box).
- `TopbarMobileMenu.js`: host links now lead the menu in the order
  **Dashboard → Inbox → Your Listings → Payouts** → Profile → Account →
  Wishlist → marketing links. (Box order today is Inbox-first and has no
  Payouts link — the reorder + Payouts link are the net-new improvement to
  ride the next bundle.)
- Effort S · Risk low (nav markup only). Before/after screenshots pending a
  build — blocked in this sandbox (see Phase 2 note); can be captured at
  next-bundle staging.

**Why marketing links outrank utility links:** they are Console-configured
`customLinks` rendered wholesale after the account block; nobody ever curated
the logged-in ordering. The patch fixes ordering in code; pruning the link
*list* (e.g. "download our app" while the app is frozen) is a 2-minute Console
edit Derek can do himself.

## ISSUE 2 — "someone wants to swim" dead-end: ROOT-CAUSED

This is **not an email/SMS** — no notification template on the box contains the
phrase. It is the **HostDashboardPage headline** talking past its own page:

- Headline counts `needsAction + inquiries` → for Shawn (0 requests, 1 inquiry):
  **"Hi Shawn — someone wants to swim! 🎉"**
- The section literally titled **"Someone wants to swim! 🏊"** renders only
  `needsAction` → for Shawn it showed **"🌴 All quiet right now."**
- The big CTA (`firstRequest = needsAction[0]`) → undefined → **no button**.
- Jessica's inquiry actually lives two sections lower under "People saying
  hello 👋" — a label nobody connects to "someone wants to swim".

So the page told him someone wants to swim, showed him "all quiet" in the
matching section, and hid the actual item under a different heading. His SMS —
*"It says someone wants to swim, but I don't see it"* — is exactly this code.

Inbox routing itself is fine: `/inbox` redirects to the **sales** tab
(routeConfiguration line 263), so hosts do land on the seller side.

**Patch (this branch, `HostDashboardPage.js`)**

1. Headline says "wants to swim" only for real booking requests; for
   inquiries-only it says "**{Guest} sent you a message 👋**".
2. Big CTA falls back to the first inquiry: "**New message! 👋 Reply to
   {Guest} →**" (links to the thread, same as the hello-section Reply pill).
3. The swim section's empty state, when inquiries exist, points at them
   instead of claiming "all quiet".

Effort S · Risk low (copy + existing links, no data changes). Untested residual:
whether the transaction page renders an inquiry-state thread well on a phone —
needs one login-repro (Shawn said "I can't get it to work" about replying).

## ISSUE 3 — "add where to send my money": FALSE PROMPT, ROOT-CAUSED & MEASURED

**Shawn's real Stripe state** (measured live with the production key):

- Connected account `acct_1TWQvLRPNlf16pZ8`
- `GET /v1/balance` → **200** ($0.00 available / $0.00 pending — correct,
  money already left)
- `GET /v1/payouts` → **200** — **$215.00, status `paid`, 2026-07-31** ✅ he
  was genuinely paid
- `GET /v1/accounts/{acct}` → **403 Permission denied** — the platform's
  `STRIPE_SECRET_KEY` is a **restricted key** (`rk_live_…Do1Cjx`) missing
  **"Basic Business Contact Information Read"** (`accounts_kyc_basic_read`)

**Root cause chain:** `/api/payouts/summary` runs `Promise.all([balance,
accounts])`; the 403 rejects the whole summary → client `.catch` maps ANY error
to `payoutState = 'none'` ("never set up") → the dashboard renders **"Let's get
your pool paying you 🎉 / Add where to send my money"** — to a fully connected,
already-paid host. Because the key permission is missing platform-wide, **every
Stripe-connected host currently sees this false prompt** on the dashboard's
money section. (The /account/payouts page itself is unaffected — its list/
activity endpoints don't touch `/v1/accounts`.)

So Stripe's progressive-verification theory is disproven for the prompt itself;
we additionally cannot SEE his `requirements.currently_due` until the key is
fixed — no evidence of any dues, and payouts demonstrably flow.

**Fix — two parts**

1. **Patch (this branch):** `server/api/payouts.js` — the `/accounts` read is
   now best-effort (`.catch(() => null)`; `payoutsEnabled: null` = unknown,
   `accountDetailsAvailable` flag). `HostDashboardPage.js` — fetch errors map
   to a new `'error'` state rendering "We couldn't load your payout numbers
   just now — your account is fine" instead of the setup prompt. Setup prompt
   now shows only on a true `stripeAccount: null`. Effort S · Risk low.
2. **DEREK (1 click, no deploy):** Stripe Dashboard → the restricted key
   `rk_live_…Do1Cjx` → edit permissions → enable **"Basic Business Contact
   Information Read"** (Stripe's error also suggested "Accounts Read"
   `connected_account_read` for listing). The 403 error message even included
   the direct edit URL for platform acct `acct_1PZNAWINbjTdiZ9I`. Once flipped,
   real `payouts_enabled` + `requirements_currently_due` light up and we can
   write honest copy for any genuinely-due verification items.

## ISSUE 4 — host one-time discount codes (feature gap)

- **Derek's promos technical document: NOT FOUND** — searched this repo (docs,
  *.md), and the WEST box home dirs (`*promo*`, `*discount*`, `*coupon*`; only
  the 0%-fee SMS-campaign artifacts exist). The only spec on record is Derek's
  spoken params from 7/29 (task #119): **cap 50%** (vs Swimply's 75%), unique
  per host, dedicated Promos button/UX with history/tracking/share.
- Live demand proof, same week: Shawn texted Jessica *"leave us a review and we
  will send you a discount code for your next booking"* — hosts are already
  promising this feature.

**Architecture verified against the codebase:**

- `ext/transaction-processes/default-booking/process.edn`: **every
  payment-initiating transition is already privileged**
  (`:privileged? true` + `:action/privileged-set-line-items` on
  `transition/request-payment`, `request-payment-after-inquiry`, offer flows).
  → **No .edn change needed** for discount line items. (Confirmed ADJACENT to,
  not part of, the separate additional-charge/release-1 work.)
- `server/api-util/lineItems.js` computes line items server-side, commissions
  as percentage line items — a validated negative line item
  (`line-item/host-discount`) drops straight into `transactionLineItems`.
- Repo precedent for the storage/endpoint pattern: `server/api/dealstore.js`,
  `create-deal.js`, `accept-deal.js` (Custom Offers MVP).

**v1 proposal (build only on Derek's GO):**

| Piece | Shape | Effort |
|---|---|---|
| Storage | Supabase `promo_codes` (code, host_id, listing_id nullable, pct ≤ **50**, one_time, expires_at, redeemed_by, redeemed_tx, created_at, revoked_at) | S |
| Server | `POST /api/promos/create` (auth host), `GET /api/promos/mine`, validation inside privileged line-item calc; discount = negative `line-item/host-discount` | M |
| Commission | **Post-discount** (commission on what the guest actually pays). Moot at 0% promo through 2026; revisit copy in 2027. Rationale: charging a host commission on money never collected is how you lose the host. | — |
| Redemption integrity | Mark `redeemed_pending(tx)` at line-item calc; **finalize on `transition/confirm-payment`**, release on expire/decline (poller already watches transitions). Abandoned checkout → code auto-releases. Atomic via single-row `UPDATE … WHERE redeemed_by IS NULL` | M |
| Host UI | "Promos" section on Host Dashboard: % selector (5–50), Create → copyable/sharable code + history list w/ redeemed status | M |
| Guest UI | Code field at checkout + updated breakdown line "Host discount −$X" | M |

Total: a focused bundle (~1 WEST release + 1 Supabase migration), no process
migration, no Stripe changes. Full detail can move to #119 on GO.

## PHASE 2 — host mobile walkthrough

Sandbox limitation, stated plainly: this remote environment's HTTPS goes
through an interception proxy whose CA headless Chromium won't fully accept
without disabling TLS verification (which I won't do), so **live phone-viewport
screenshots could not be captured here**. SSR checks ran via curl
(`/dashboard` → 200, auth-gated client-side; `/inbox` → sales tab). The
friction ranking below is from this week's *measured* host incidents — every
row has a named host and a verified cause.

Top 10 host-journey friction points, ranked by revenue impact:

1. **Booking-request discoverability** — dashboard headline/section mismatch
   (Shawn; Issue 2). Requests are the revenue moment. *Patched.*
2. **False payout-setup prompt** shakes payment trust for every connected host
   (Shawn; Issue 3). *Patched + 1-click Derek key fix.*
3. **Guest SMS replies dead-end** in the PRNM inbox — hosts never see them
   (Vashti→Tiara, 7/31). *#141 bridge approved, queued.*
4. **iOS app hijacks web links** for anyone with the frozen app installed
   (Lauren, Marco) — AASA excludes core paths now; app custody still the root
   issue.
5. **Mobile nav utility links buried under marketing links** (Shawn; Issue 1).
   *Patched (order), Console link-pruning open for Derek.*
6. **Wizard publish silence** — fixed in c134 (confirmation banner + telemetry),
   watch the beacons for stragglers.
7. **Photo upload failures** (nginx cap #96 fixed; Galaxy add-photo #63 needs
   one repro).
8. **Address field on signup/wizard** (Kevin/Cindy/Ernnie — c133 Census
   geocoder fix live; monitor).
9. **No promo codes** while competitors have them and hosts promise them
   (Shawn; Issue 4 / #119).
10. **Sharing requires hand-holding** (Jan/Stephanie/Roody) — Marketing Kit
    button (#82) + FBMP instructions pattern.

## Deliverables & status

- Branch: `claude/marketplace-repo-verify-v8h67k` (this repo)
  - Port: `src/containers/HostDashboardPage/*` (prod-identical) + route
  - Issue 1: `TopbarDesktop.js`, `TopbarMobileMenu.js` (parity + order + Payouts)
  - Issue 2: `HostDashboardPage.js` (headline/CTA/empty-state truthing)
  - Issue 3: `server/api/payouts.js` + `HostDashboardPage.js` error state
  - All files parse-checked (Babel). **Not deployed. No schema/process changes.**
- Box riders staged conceptually for next bundle (c135): mobile-menu reorder +
  Payouts link, dashboard Issue-2/3 edits (exact-string, backups, gated flip).
- **Derek actions:** (1) Stripe restricted-key permission (Issue 3, 1 click);
  (2) optional Console customLinks pruning; (3) GO/no-GO on shipping this as
  the next WEST bundle; (4) GO on promo-codes v1 (#119).
