# Sharetribe dependency audit — PRNM

Reconnaissance only. No code changed, nothing migrated. Audited 2026-09-13 across
all four repos on disk.

| Repo | Tracked files | Files touching Sharetribe | Role |
|---|---|---|---|
| `poolrentalnearme-web` | 1,548 | 129 | Marketplace (WEST). Sharetribe Web Template v8.5.0 fork |
| `fresh-web-702e04c3` | 886 | 95 | Marketing/pSEO (EAST) — current, last commit 2026-07-16 |
| `fresh-web` | 401 | 27 | Marketing/pSEO — older snapshot, last commit 2026-05-06 |
| `poolrentalnearme-app` | 986 | 454 | Flutter mobile (`sharetribe_horizon`) |

Marketplace ID: `672444e2-9969-433a-b885-743775a6824c`.

**Open question before any work starts:** CLAUDE.md names `fresh-web` as the EAST
deployment, but `fresh-web-702e04c3` is two months newer, has 175 routes vs 109,
and holds all six Sharetribe server modules plus the entire `st_*` mirror.
Only one of these is live. This audit treats `-702e04c3` as current.

---

## 1. Sharetribe SDK / API usage

Two npm packages, one patched:

```
sharetribe-flex-sdk             ^1.21.1   + patches/sharetribe-flex-sdk@1.21.1.patch
sharetribe-flex-integration-sdk ^1.10.0
```

The patch rewrites the package to ship an `.mjs` build (`main`/`browser` both
repointed) so Vite can bundle it. A replacement client has to satisfy the same
ESM/CJS dual-consumption shape.

**Instantiation points — the whole surface funnels through five files:**

| File | Function | Credential | Purpose |
|---|---|---|---|
| `server/api-util/sdk.js:98` | `getSdk(req,res)` | `VITE_SHARETRIBE_SDK_CLIENT_ID` | Per-request, cookie token store |
| `server/api-util/sdk.js:121` | `getTrustedSdk(req)` | + `SHARETRIBE_SDK_CLIENT_SECRET` | Token exchange → privileged transitions |
| `server/api-util/integration.js:34` | module singleton | `SHARETRIBE_INTEGRATION_SDK_CLIENT_ID/SECRET` | Integration API, rate-limited |
| `src/entry-server.jsx:68` | `createInstance` | client id | SSR instance → `configureStore` |
| `src/util/sdkLoader.js` | re-export | client id | Browser instance |

**The single most important architectural fact:** `src/store.js:13` injects the SDK
as the redux-thunk extra argument:

```js
const middlewares = [thunk.withExtraArgument(sdk), ...];
```

Every client-side Sharetribe call therefore arrives as `(dispatch, getState, sdk)`.
25 files consume it across 15 containers: `CheckoutPage`, `EditListingPage`,
`TransactionPage`, `SearchPage`, `ListingPage`, `ManageListingsPage`, `InboxPage`,
`ProfilePage`, `ProfileSettingsPage`, `ContactDetailsPage`, `PasswordChangePage`,
`PasswordRecoveryPage`, `PaymentMethodsPage`, `StripePayoutPage`,
`HostDashboardPage`.

That injection point is the migration seam. It is one line, and everything
downstream speaks one interface: `sdk.<resource>.<method>(params, opts)`.

**Distinct Marketplace API endpoints in use — 50:**

- *Listings:* `listings.query`, `listings.show`, `listings.publish`, `listings.open`
- *Own listings:* `ownListings.query/show/create­Draft/publishDraft/discardDraft/update/open/close`
- *Transactions:* `transactions.initiate`, `initiateSpeculative`, `transition`, `transitionSpeculative`, `query`, `show`
- *Users:* `currentUser.create/show/updateProfile/changeEmail/changePassword/verifyEmail/sendVerificationEmail/createWithIdp/delete`, `users.show`, `users.query`
- *Auth:* `login`, `logout`, `authInfo`, `exchangeToken`, `passwordReset.request`, `passwordReset.reset`
- *Availability:* `timeslots.query`, `availabilityExceptions.query/create/delete`
- *Messaging:* `messages.send`, `messages.query`
- *Reviews:* `reviews.query`
- *Stock:* `stock.compareAndSet`
- *Stripe:* `stripeAccount.create/fetch/update`, `stripeAccountLinks.create`, `stripeCustomer.create/addPaymentMethod/deletePaymentMethod`, `stripeSetupIntents.create`
- *Meta:* `marketplace.show`, `processTransitions.query`, `images.upload`
- *Assets:* `assetsByAlias`, `assetsByVersion`

Serialization is `application/transit+json` throughout, with a custom type handler
swapping Sharetribe's `BigDecimal` for `decimal.js` (`server/api-util/sdk.js:24`,
mirrored in `src/util/api.js:29` — the comment says keep them in sync).
`server/apiRouter.js:52-71` deserializes Transit on every local API request.

## 2. Marketplace API usage

Server-side, via `getSdk` / `getTrustedSdk`, in 31 files under `server/api/`.
The privileged set (requires client secret) is the money path:

| Route | SDK calls | What breaks without it |
|---|---|---|
| `POST /api/transaction-line-items` | `listings.show` + `fetchCommission` | Price quote on listing + checkout |
| `POST /api/initiate-privileged` | `trustedSdk.transactions.initiate` / `initiateSpeculative` | **All new bookings** |
| `POST /api/transition-privileged` | `trustedSdk.transactions.transition` / `transitionSpeculative` | Accept / decline / complete |
| `POST /api/accept-offer` | `fetchCommission` + trusted transition | Host package-deal acceptance |
| `POST /api/accept-deal` | `processAlias: 'default-booking/release-1'` | Deal-link checkout |
| `POST /api/additional-charge/*` | `additional-charge/release-1` process | Post-booking extra charges |
| `GET /api/payouts/*` | `sdk.stripeAccount.fetch()` | Host payout dashboard |
| `GET /api/resume-listing` | `ownListings.query` | Draft-resume + abandoned-draft links |
| `GET /api/initiate-login-as`, `/api/login-as` | Console OAuth + `exchangeToken` | Operator impersonation |

## 3. Integration API usage

Base `https://flex-integ-api.sharetribe.com/v1/integration_api`, token at
`/v1/auth/token` (form-encoded, `scope=integ`). Rate limiters are wired from the
SDK's own `prodQueryLimiterConfig` / `prodCommandLimiterConfig`
(`server/api-util/integration.js:12-28`).

25 files call it. Grouped by what they do:

**Operator / support**
- `server/extensions/common/middlewares/authenticateLoggedInAsUser.js:45` — `users.show`
- `server/extensions/socials-sign-in/api/auth/loginAs/callback.js:12` — `users.show`
- `server/api/accept-tx-via-operator.js` — `transactions.show` + `transactions.transition`

**Calendar / availability (writes)**
- `server/api/calendar-apply-exceptions.js:52,97,113` — `availabilityExceptions.delete/create`, `listings.update`
- `server/api/sync-ical.js:201,260` — Swimply .ics → exceptions
- `server/extensions/sms-messaging/mod/notify/swimply-resync.js:203,236` — create-only resync
- `server/api/ical-feed.js`, `ical-link.js`, `ical-regenerate.js` — `listings.show/update`, `availabilityExceptions.query`

**Pricing / promos (writes to `publicData`)**
- `server/api/promo-codes.js:31` — `listings.update({publicData:{promoCodes}})`
- `server/api/go-redirect.js:24` — `listings.query`
- `server/extensions/wishlist/mod/wishlist/sharetribeExtendedData/{add,remove}.js` — `listings.update` + `users.updateProfile`

**SMS engine (the busiest consumer)**
- `server/extensions/sms-messaging/mod/notify/poller.js` — `events.query`, `transactions.show/query`, `messages.query`, `listings.query`, `users.show`
- `.../replyactions.js:80` — `transactions.transition` (host replies to a text to accept a booking)
- `.../welcome.js:99,181` — `users.show`

**Off-session payments**
- `server/extensions/off-session-payment/**` — `transactions.show/updateMetadata`, `users.show`

**Marketing site (`fresh-web-702e04c3`)** — its own client in
`src/server/sharetribe.server.ts` (`integrationGet`/`integrationPost`), consumed by
`sharetribe-mirror.server.ts`, `listing-sync.server.ts`, `host-drip.server.ts`,
`renter-drip.server.ts`, `affiliate-sync.server.ts`, `home-data.functions.ts`,
`availability.functions.ts`, `sharetribe-prune.functions.ts`,
`marketplace-console.functions.ts`.

## 4. Authentication dependencies

Sharetribe is the **identity provider**. There is no PRNM user table for
marketplace accounts.

- `src/ducks/auth.duck.js:199,222,242,260` — `sdk.authInfo()`, `sdk.login()`, `sdk.logout()`, `sdk.currentUser.create()`
- Sessions live in Sharetribe-issued tokens in cookies keyed `st-<clientId>-*`,
  managed by `tokenStore.expressCookieStore` (`server/api-util/sdk.js:105`)
- `VITE_SHARETRIBE_USING_SSL` is **build-time** and controls the `Secure` flag;
  both `src/config/settings.js` and `server/api-util/sdk.js:10-13` default it on in
  production after the c158 incident
- Password reset is entirely Sharetribe: `passwordReset.request` / `.reset`
- Email verification: `currentUser.verifyEmail`, `sendVerificationEmail`
- Social login (`server/extensions/socials-sign-in/`, 30 files) wraps Passport
  strategies for Google / Facebook / Apple / LinkedIn / Twitter, but each ends at
  Sharetribe's `loginWithIdp` / `createUserWithIdp`. `sdk.marketplace.show()` is
  called first as a connectivity probe (`.../common/loginWithIdp.js:34`)
- An OpenID Connect proxy is exposed for Sharetribe's benefit:
  `server/wellKnownRouter.js` + `server/extensions/socials-sign-in/api/openIdConnect/*`
- Operator impersonation is Sharetribe **Console** OAuth:
  `SERVER_SHARETRIBE_CONSOLE_URL` (default `https://console.sharetribe.com`),
  PKCE, cookies `st-<clientId>-oauth2State` / `-pkceCodeVerifier`
- JWT issuer for the app's own extensions is `urn:journeyhorizon:sharetribehorizont`
  (`server/extensions/common/config/jwt.js:5`)

## 5. User / profile dependencies

`src/ducks/user.duck.js` is the only source of current-user state.
Profile data lives in Sharetribe extended data (`publicData` / `protectedData` /
`privateData`) — including the wishlist (`server/extensions/wishlist/`), phone
verification state, and Stripe linkage. `configUser.js` + the hosted
`/users/user-fields.json` asset define the schema.

Account deletion is `trustedSdk.currentUser.delete`
(`server/extensions/account-deletion/api/delete.js`).

## 6. Listing creation / editing / search dependencies

**Production runs exactly one listing type.** `src/config/configListing.js:381`:

```js
listingType: 'hourly-pool',
transactionType: { process: 'default-booking', alias: 'default-booking/release-1', unitType: 'hour' },
availabilityType: 'oneSeat',
```

`enforceValidListingType = true`, so search always filters `pub_listingType`.
This is the single biggest simplifier in the whole migration: one type, one
process, one unit, one currency (USD).

The comment at `configListing.js:378-380` is the catch: *"production listing types
are managed in the Sharetribe Console (`listing-types.json` asset); this local
config is the dev fallback."* Same for listing fields and search config.

**Search schema** is Sharetribe's indexed extended data. Locally declared fields:
`poolType` (enum), `maxGuests` (long), `poolAmenities` (multi-enum), `vibe`
(multi-enum) — each `indexForSearch: true`.

**Search query shape** (`src/containers/SearchPage/SearchPage.duck.js`) uses
Sharetribe-specific parameters that have no generic equivalent:
`bounds`, `origin` (distance sort), `pub_listingType`, `pub_*` filters,
`availability: 'time-partial'` / `'time-full'`, `sort`, `perPage`.
Geo search, full-text keyword search, and availability-aware filtering are all
server-side Sharetribe features.

**Editing** — `src/containers/EditListingPage/EditListingPage.duck.js` (11 SDK
refs) drives the whole wizard: `createDraft`, `update`, `publishDraft`,
`discardDraft`, `open`, `close`, plus `images.upload` and availability exceptions.

**A listing is also used as a CMS record.** `src/ducks/hostedAssets.duck.js:133`
queries `pub_listingType: 'config'` to read `publicData.advantages` for the
landing page. It sits inside the same `Promise.all` as the config assets.

## 7. Availability dependencies

- `availabilityPlan` (weekly entries + IANA timezone) is a Sharetribe listing
  attribute, read in 12 places for timezone alone
- `sdk.timeslots.query` computes bookable slots — this is a server-side
  Sharetribe computation over plan − exceptions − existing bookings
- `availabilityExceptions` CRUD from both Marketplace and Integration SDKs
- `action/create-pending-booking` in the process definition is the **atomic
  double-booking guard**. Nothing in PRNM code prevents overlap; Sharetribe does
- iCal in/out (`server/api/calendar/ical-export.js`, `ical-import.js`,
  `ical-feed.js`, `sync-ical.js`) reads and writes through Sharetribe
- `availability_cache` and `fetchAvailableTimeSlots` in
  `fresh-web-702e04c3` mean the marketing site shows availability too

## 8. Booking / transaction process dependencies

Two live custom processes, defined in `ext/transaction-processes/` and deployed to
Sharetribe via Sharetribe CLI (they are *reference copies* here —
`ext/transaction-processes/README.md` says the active ones live in Console):

- `default-booking/release-1` (`ext/transaction-processes/default-booking/process.edn`, 13KB)
- `additional-charge/release-1` (`server/api/additional-charge-initiate.js:10`)

The client mirror is `src/transactions/transactionProcessBooking.js` — 31
transitions, 15 states. (Verified against the `.edn` in `server/shadow/`: 31/31
transitions and 31/31 graph edges match, zero drift. An earlier version of this
document said 38; that came from counting keys rather than reading the
definition.) The header comment is explicit: *"These strings must sync
with values defined in Marketplace API."*

**Engine actions Sharetribe executes, with occurrence counts from the `.edn`:**

| Action | × | Replacing it means |
|---|---|---|
| `stripe-create-payment-intent` | 5 | PaymentIntent creation bound to state |
| `stripe-capture-payment-intent` | 4 | Capture on accept |
| `stripe-refund-payment` | 5 | Refund on decline/cancel/expire |
| `stripe-create-payout` | 2 | Transfer to connected account |
| `stripe-confirm-payment-intent` | 1 | 3DS confirm |
| `create-pending-booking` | 5 | **Atomic availability reservation** |
| `accept-booking` / `decline-booking` / `cancel-booking` | 4 / 7 / 1 | Booking lifecycle |
| `privileged-set-line-items` | 5 | Server-authoritative pricing |
| `calculate-full-refund` | 5 | Refund math |
| `post-review-by-*` / `publish-reviews` | 4 / 4 | Double-blind review release |
| `update-protected-data` | 7 | Per-transition data writes |

**Sharetribe also runs a durable scheduler.** These are automatic transitions with
no PRNM equivalent anywhere:

| Timer | Fires |
|---|---|
| `PT15M` after request-payment | `expire-payment` |
| `P3D` after an offer is sent | `expire-offer` |
| min(entered + `P6D`, bookingStart + `P1D`, bookingEnd) | `expire` / `expire-no-payment` — the **earliest** of three, and for PRNM's hourly bookings bookingEnd always wins |
| `booking-end + P2D` | `complete` |
| `booking-end + P7D` | `expire-review-period` (×3 variants) |
| `booking-start − P1D`, `booking-end + P6D` | Review reminders |

## 9. Stripe / payment / payout dependencies

**The good news, and it is substantial.** `server/api/payouts.js:5-11`:

> *Our Stripe connected accounts are Sharetribe-managed CUSTOM accounts, so there
> is no Stripe-hosted dashboard — we read the data with the platform secret key
> and render it ourselves.*

PRNM calls `https://api.stripe.com/v1` directly with `STRIPE_SECRET_KEY` and a
`Stripe-Account` header. That only works for accounts connected to **PRNM's own
platform**. `.env-template:7` confirms the direction of trust: *"You also need to
set Stripe secret key in Sharetribe Console."* PRNM gave Sharetribe its key, not
the other way round.

**So the Stripe platform account, every connected account, and all host KYC are
PRNM-owned assets that survive a Sharetribe exit.**

What Sharetribe currently does *with* that access, and must be rebuilt:

- Connected-account onboarding — `sdk.stripeAccount.create/update`, `sdk.stripeAccountLinks.create`
- Customer + payment-method vaulting — `sdk.stripeCustomer.create/addPaymentMethod/deletePaymentMethod`, `sdk.stripeSetupIntents.create`
- The PaymentIntent lifecycle bound to transaction state (the 5 Stripe actions above)
- `src/ducks/stripe.duck.js`, `stripeConnectAccount.duck.js`, `paymentMethods.duck.js` on the client

Already PRNM-owned and Sharetribe-independent: `GET /api/payouts/summary|list|activity`,
Stripe Identity (`create-verification-session.js`, `check-verification-status.js`,
`STRIPE_IDENTITY_RENTAL_FLOW_ID`), and boost purchase.

**The 15% guest fee is not in this codebase.** It is the Sharetribe hosted asset
`transactions/commission.json`, fetched by `fetchCommission()`
(`server/api-util/sdk.js:160`). Five endpoints call it; all throw
`"Insufficient pricing configuration set."` on failure — with no fallback:
`transaction-line-items.js`, `initiate-privileged.js`, `accept-offer.js`,
`accept-deal.js`, `additional-charge-initiate.js`.

## 10. Messaging dependencies

Sharetribe owns the message store. `st_messages` mirrors it read-only.

- `sdk.messages.send` — `src/containers/ListingPage/ListingPage.duck.js:452`
- `sdk.messages.query` + `transactions.query` with `include: ['messages']` — Inbox / TransactionPage
- `integrationSdk.messages.query` — `poller.js:208` (SMS relay)
- Messages are transaction-scoped; there is no standalone thread model

**Notification email is Sharetribe's too.** `ext/transaction-processes/default-booking/templates/`
holds 13 template directories (`booking-new-request`, `booking-accepted-request`,
`booking-money-paid`, `booking-review-*`, …), each a `-subject.txt` + `-html.html`
rendered and delivered by Sharetribe's notification engine. There is no Emailit
call anywhere in `poolrentalnearme-web`.

## 11. Mobile / API dependencies

`poolrentalnearme-app` is a Journey Horizon white-label Sharetribe client. The
melos workspace is literally named `sharetribe_horizon`.

- **221 Dart files** import `package:sharetribe_sdk`
- The SDK is a **private vendor repo**: `git@github.com:journeyhorizon/dart_sharetribe_sdk.git` (`app/pubspec.yaml:19-21`) — not in this audit's scope and not PRNM-owned
- Three more private JH modules: `sharetribe_horizon_{account_deletion,socials_sign_in,wishlist}_module`
- Sharetribe coupling spans 23 features. Heaviest: `edit_listing` (38 files), `transaction` (18), `listing` (18), `checkout` (15), `stripe` (9)
- Known constraints from CLAUDE.md: the app's unit-type enum is `{item, hour, day, night, inquiry}`; `supportedProcess` omits `default-negotiation`; wrong listing type ⇒ *"Outdated listing!"* and the host cannot edit

This is the single largest rebuild in the programme and it is gated on a vendor.

## 12. Environment variables and credentials

**Read by `poolrentalnearme-web`:**

| Variable | Where |
|---|---|
| `VITE_SHARETRIBE_SDK_CLIENT_ID` | `sdk.js:8`, `settings.js`, `initiate-login-as.js:3` |
| `SHARETRIBE_SDK_CLIENT_SECRET` | `sdk.js:9` (token exchange) |
| `SHARETRIBE_INTEGRATION_SDK_CLIENT_ID` / `_SECRET` | `integration.js:8-9` |
| `VITE_SHARETRIBE_USING_SSL` | `sdk.js:10`, `settings.js` — **build-time** |
| `VITE_SHARETRIBE_SDK_BASE_URL` | `sdk.js:18` |
| `VITE_SHARETRIBE_SDK_ASSET_CDN_BASE_URL` | `sdk.js:19` |
| `VITE_SHARETRIBE_SDK_TRANSIT_VERBOSE` | `sdk.js:14` |
| `VITE_SHARETRIBE_SDK_LOGIN_AS_BASE_URL` | login-as flow |
| `SERVER_SHARETRIBE_CONSOLE_URL` | `initiate-login-as.js:5` |
| `SERVER_SHARETRIBE_TRUST_PROXY` | `server/config/server.js:15` |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VITE_STRIPE_PUBLISHABLE_KEY`, `STRIPE_IDENTITY_RENTAL_FLOW_ID` | payouts, boost, identity |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | PostgREST, service-role |

**Read by `fresh-web-702e04c3` / `fresh-web`:** `SHARETRIBE_INTEG_CLIENT_ID`,
`SHARETRIBE_INTEG_CLIENT_SECRET`, `SHARETRIBE_CLIENT_ID`, `SHARETRIBE_PREFIXES`.

**Three naming conventions for one credential pair, and a live drift:**

`.env-template:38-39` declares `SHARETRIBE_INTEGRATION_CLIENT_ID` /
`SHARETRIBE_INTEGRATION_CLIENT_SECRET`. `server/api-util/integration.js:8-9` reads
`SHARETRIBE_INTEGRATION_SDK_CLIENT_ID` / `..._SDK_CLIENT_SECRET`. EAST uses a third
spelling, `SHARETRIBE_INTEG_*`.

Because `integration.js:30-31` returns `null` rather than throwing when the
credentials are absent, provisioning a box from `.env-template` yields a silently
disabled Integration SDK — promo codes 500, iCal answers `{enabled:false}`, the
SMS poller stops, wishlist writes fail. Worth fixing regardless of the migration.

## 13. Webhooks and background jobs

**There are no Sharetribe webhooks. Everything is polled.**

| Job | Mechanism | Cadence |
|---|---|---|
| SMS engine (`poller.js`) | `integrationSdk.events.query` + `startAfterSequenceId` cursor | **12s** (`SMS_POLL_INTERVAL_MS`) |
| `checkHeartbeat`, `sweepNudges` | `setInterval` | 5 min |
| `sweepExpiring` | `setInterval` | 15 min |
| `sweepReminders` (day-before guest) | `setInterval` | 30 min |
| Mirror sync | `GET /api/public/hooks/sync-sharetribe-mirror` | 15 min |
| `poll-sharetribe-hosts`, `poll-sharetribe-renters` | hook routes | drip cadence |
| Weekly host stats SMS | cron `0 20 * * 4` on WEST | Thu 4pm ET |

Event types the poller subscribes to (`poller.js:40`):
`transaction/transitioned, transaction/initiated, message/created, user/created`.

A RabbitMQ event-handler extension exists (`server/extensions/event-handler/`,
`rascal` + `amqplib`, routing keys `<marketplaceId>.sharetribe` /
`.sharetribehorizon` / `.custom`) but the live path is the 12s poll.

**Consequence:** a replacement has to emit an ordered, cursor-addressable event
stream, or the SMS engine and every drip must be rewritten at the same time.

## 14. Data already mirrored into Supabase

This is the most valuable thing already built. `fresh-web-702e04c3` has a working
Sharetribe → Supabase mirror: `supabase/migrations/20260606084607_*.sql`, synced by
`src/server/sharetribe-mirror.server.ts` every 15 minutes, idempotent on
`sharetribe_id`, cursored per resource in `st_sync_state`.

| Table | Notable columns |
|---|---|
| `st_users` | `sharetribe_id` UNIQUE, email, display/first/last name, banned, deleted, email_verified, role, `profile` jsonb, `raw` jsonb |
| `st_listings` | `sharetribe_id`, `author_st_id`, title, description, state, `geolocation` jsonb, city/region/country, `price_amount`, `price_currency`, `photos_count`, `public_data` jsonb, `raw` jsonb |
| `st_transactions` | process_name, last_transition, booking_start/end, `payin_total_cents`, `payout_total_cents`, `provider_commission_cents`, `customer_commission_cents`, state, `transitions` jsonb, `raw` jsonb |
| `st_messages` | transaction_st_id, sender_st_id, content, `scanned` flag |
| `st_sync_state` | per-resource cursor, last run status/error/rows |
| `st_security_alerts` | off-platform / harassment / fraud / safety detection over `st_messages` |

Config: `PER_PAGE=100`, `MAX_PAGES=25`, 30-day lookback on first run, 2-minute
overlap to avoid edge gaps. Every table keeps a full `raw` jsonb payload — so the
mirror is lossless even where the typed columns are partial.

Also present: `availability_cache`, `synced_listings`, `listing_sync_log`,
`sharetribe_test_listings`, `sharetribe_test_sync_runs`,
`affiliate_referrals.sharetribe_user_id`, `renter_subscribers.st_user_id`.

**Not verified:** row counts and mirror freshness. The Supabase account reachable
from this session is `carnival-guardian-prod`, not PRNM's `prnm-content-production`.
Confirming that `st_listings` and `st_transactions` are complete and current is
step one of any plan below.

In `poolrentalnearme-web`, Supabase already holds: `sms_log` (UNIQUE
`(event_sequence_id, recipient_role)` for send idempotency), `sms_poll_cursor`,
`sms_heartbeat`, `sms_reply_ctx` (doubles as the package-deal store via
`kind='host_deal'`, `server/api/dealstore.js`), `sms_opt_out`, `sms_routing`,
`sms_nudge_queue`, `sms_welcome_queue`, `message_receipts`, `email_send_log`.

## 15. What breaks immediately if Sharetribe disappears tonight

Ordered by blast radius.

**P0 — revenue stops**

1. **Every booking.** `initiate-privileged` / `transition-privileged` are the only paths to a transaction.
2. **Every price.** `fetchCommission()` throws with no fallback, so the 15% fee is unknowable and all five pricing endpoints 400. Listing pages cannot quote, checkout cannot load.
3. **Every login and session.** Sharetribe is the IdP; tokens are Sharetribe-issued. Nobody can sign in, and existing sessions fail on `authInfo()`.
4. **Every listing photo.** All images are signed URLs on `sharetribe.imgix.net` (e.g. `.../672444e2-.../6a74ba39-...?...&s=<sig>`), including hardcoded ones in `src/containers/AuthenticationPage/AuthBackdrop.js:11-20` and `SectionPrnmHero.js`. Signatures are tied to Sharetribe's imgix account.
5. **Search.** `sdk.listings.query` with `bounds` / `origin` / `pub_*` / `availability` is the only search backend.

**P1 — in-flight bookings corrupt silently**

6. **The scheduler.** No `expire-payment` at 15 min, no `expire` at 3 days, no `complete` 2 days after booking end ⇒ **no payouts released**, no review windows.
7. **All Stripe orchestration.** Existing PaymentIntents are never captured or refunded. Money sits authorized and expires.
8. **All notification email.** 13 booking templates are rendered by Sharetribe.
9. **The SMS engine.** `events.query` returns nothing ⇒ poller stalls. Note the prior incident: a failed lookup must not read as a real zero.
10. **Availability + double-booking protection.** `timeslots.query` and `create-pending-booking` both gone.

**P2 — degraded but survivable**

11. **App boot config.** `fetchAppAssets` fails ⇒ `.catch` fires ⇒ `entry-server.jsx:104` does `fetchedAppAssets || {}` and falls back to `defaults` in `configDefault.js`. The app *renders*, without hosted translations, branding, footer, topbar, or the `advantages` block. Because all four fetches share one `Promise.all`, the `pub_listingType:'config'` listing failing takes the whole config load down with it.
12. **Mobile app.** Fully dead — 221 files, vendor SDK.
13. **Operator login-as.** Console OAuth gone.
14. **Marketing site.** Public pages fall back to `st_*` only where already wired; `searchListings` / `fetchListing` / `fetchAvailableTimeSlots` hit live Sharetribe.
15. **iCal, promo codes, wishlist, off-session payments, host drips, affiliate attribution.**

---

## A. Dependency map

```
SHARETRIBE SUBSYSTEM              PRNM COMPONENT                                              IF GONE
─────────────────────────────────────────────────────────────────────────────────────────────────────
Auth API                     ──▶  src/ducks/auth.duck.js                                      P0
  login/logout/authInfo           server/api-util/sdk.js  (cookie token store)
  token exchange                  server/extensions/socials-sign-in/**  (30 files)
  loginWithIdp                    server/wellKnownRouter.js  (OIDC proxy)
                                  server/api/{initiate-login-as,login-as}.js
                                  → NO PRNM user table exists

Asset Delivery API           ──▶  src/ducks/hostedAssets.duck.js                              P0/P2
  16 config assets                src/config/configDefault.js:89-111
  transactions/commission.json     server/api-util/sdk.js:160  fetchCommission()              P0
  design/branding.json             server/resources/webmanifest.js
  content/translations.json        → 15% fee lives HERE, not in git

Marketplace API              ──▶  25 files, 15 containers via thunk.withExtraArgument(sdk)    P0
  listings / ownListings          src/containers/{SearchPage,ListingPage,EditListingPage,
  transactions (+speculative)       ManageListingsPage,CheckoutPage,TransactionPage,InboxPage,
  currentUser / users               ProfilePage,ProfileSettingsPage,ContactDetailsPage,...}
  timeslots / availabilityExc.    server/api/*.js  (31 files)
  messages / reviews / images      src/store.js:13  ◀── THE SEAM
  stripeAccount / stripeCustomer

Transaction engine           ──▶  ext/transaction-processes/default-booking/process.edn       P0/P1
  31 transitions, 15 states       ext/transaction-processes/additional-charge/process.edn
  privileged-set-line-items       src/transactions/transactionProcessBooking.js  (mirror)
  create-pending-booking          server/api/{initiate,transition}-privileged.js
  5 Stripe actions                server/api-util/lineItems.js
  durable timers (15m/3d/2d/7d)   → no PRNM scheduler exists anywhere

Integration API              ──▶  server/api-util/integration.js  (25 consumers)              P1
  events.query (cursor)           .../sms-messaging/mod/notify/poller.js   12s poll
  transactions.transition         .../notify/replyactions.js  (SMS accept)
  listings.update                 server/api/{promo-codes,calendar-apply-exceptions,ical-*}.js
  users.show/updateProfile        server/extensions/wishlist/**, off-session-payment/**
                                  fresh-web-702e04c3/src/server/sharetribe.server.ts

imgix CDN                    ──▶  every listing photo; AuthBackdrop.js, SectionPrnmHero.js    P0
  sharetribe.imgix.net            signed URLs, Sharetribe-owned account

Notification engine          ──▶  ext/transaction-processes/*/templates/  (13 for booking)    P1
                                  → no Emailit path in poolrentalnearme-web

Console (console.sharetribe.com) ▶ operator login-as; listing-types/search schema editing     P2

Dart SDK (private, JH)       ──▶  poolrentalnearme-app: 221 files, 23 features                P2
```

## B. Functionality PRNM already owns

Fully outside Sharetribe today:

1. **The Stripe platform account + all connected accounts + host KYC.** The
   decisive asset. `payouts.js` proves direct platform access.
2. **Payout dashboard** — `GET /api/payouts/summary|list|activity`, built on raw
   Stripe with `Stripe-Account`.
3. **Stripe Identity verification** — `create-verification-session.js`,
   `check-verification-status.js`.
4. **The Sharetribe → Supabase read mirror** — `st_users`, `st_listings`,
   `st_transactions`, `st_messages`, `st_sync_state`, `st_security_alerts`, with
   lossless `raw` jsonb and a 15-minute cursored sync.
5. **The entire SMS stack** — Twilio send (`twsend`), quiet hours, opt-outs,
   `sms_log` idempotency on `(event_sequence_id, recipient_role)`, inbound
   webhook, reply-to-accept, concierge command layer.
6. **Email infrastructure** — Emailit (`noreply@`, reply-to `support@`),
   `email_send_log`, `suppressed_emails`, `email_unsubscribe_tokens`, host and
   renter drip engines.
7. **Package-deal / offer-link pricing** — `dealstore.js`, price read server-side
   from `sms_reply_ctx` (`kind='host_deal'`), never from the client.
8. **Promo codes** — authored and applied by PRNM (stored in Sharetribe
   `publicData`, but the logic is ours).
9. **Geocoding** — `server/api/geocode.js`, `geocodeSuggest.js`.
10. **AI listing generation** — `ai-generate-listing.js` (Claude vision),
    `generate-listing.js`, `evaluate-host-application.js`.
11. **Weather + water-temp** — `server/services/weather.js`,
    `waterTempEstimator.js`, `calendar/demand-forecast.js`.
12. **iCal construction** — `api-util/ical-build.js`, token auth
    (`icalToken.js`), rotation.
13. **The whole marketing/pSEO platform** — ~10k Supabase-backed pages,
    sitemaps, GSC integration, courses/academy, affiliates, competitor radar,
    help centre. ~90 tables, almost all Sharetribe-free.
14. **Short links** — Switchy + `go.poolrentalnearme.com`.
15. **Wizard telemetry, lead capture, share-link stats.**

## C. Functionality that must be rebuilt

Ordered by difficulty, hardest first.

| # | Capability | Why it is hard |
|---|---|---|
| C1 | **Transaction state machine + durable scheduler** | 31 transitions, 15 states, 2 processes, plus timers at 15m / 3d / booking-end+2d / +7d. Needs exactly-once semantics; a missed `complete` means an unpaid host. |
| C2 | **Stripe orchestration bound to state** | 5 Stripe actions × 17 call sites. Destination charges, capture, partial/full refund, payout. Must be idempotent and replay-safe. |
| C3 | **Mobile app API layer** | 221 Dart files, 23 features, private vendor SDK. Either a Sharetribe-shaped compatibility API or a full client rewrite. |
| C4 | **Identity + sessions** | Signup, login, logout, password reset, email verification, 5 social IdPs, token issuance/refresh, operator impersonation. Plus migrating existing credentials — Sharetribe will not export password hashes. |
| C5 | **Availability + booking engine** | Weekly plans, exceptions, DST-correct timezone math, slot computation, and an atomic overlap guard replacing `create-pending-booking`. |
| C6 | **Search** | Geo radius/bounds, distance sort, keyword relevance, faceted `pub_*` filters, availability-aware filtering, pagination. PostGIS + Postgres FTS covers it, but the query surface is wide. |
| C7 | **Ordered event stream** | Cursor-addressable, monotonic `sequenceId`, matching `events.query` semantics — or the 12s poller, drips and affiliate sync all rewrite simultaneously. |
| C8 | **Image storage + CDN** | Migrate every original off `sharetribe.imgix.net`, re-host, re-sign, backfill URLs, plus a new upload path replacing `images.upload` (which 411s via SDK; `curl -F` works). |
| C9 | **Transactional email** | 13 booking templates → Emailit, with the state machine as trigger. |
| C10 | **Listing CRUD + extended-data model** | `publicData`/`protectedData`/`privateData` scoping, draft lifecycle, open/close. |
| C11 | **Messaging** | Transaction-scoped threads, read state, `message_receipts` already exists. |
| C12 | **Reviews** | Double-blind: both submitted or window expired before publication. |
| C13 | **Config / CMS layer** | Replace 16 hosted assets — listing types, fields, search config, translations, branding, footer, topbar, access control. |
| C14 | **Operator tooling** | Login-as, user/listing/transaction admin, manual transitions. |
| C15 | **Payout-details onboarding** | `stripeAccount.create/update`, `stripeAccountLinks.create` → Stripe Connect onboarding owned directly. |

## D. Recommendation

**Build a separate `prnm-marketplace-core` service and repo. Migrate into it
through the SDK seam.**

These are not really alternatives — the right answer uses both halves. The core
belongs in its own service; the *route* into it is the existing
`thunk.withExtraArgument(sdk)` injection point, which lets the web app switch
backends without rewriting 25 containers.

**Why a separate service:**

1. **Three independent consumers already exist.** `poolrentalnearme-web`,
   `fresh-web-702e04c3`, and the Flutter app each talk to Sharetribe directly. They
   need one shared API, not three in-app reimplementations.
2. **The mobile app makes it non-optional.** It cannot import a Node module. It
   needs a network API regardless.
3. **The state machine needs to be a durable process.** Timers at
   `booking-end + P7D` cannot live in an SSR request path. Mixing a scheduler into
   the Vite/Express render server is how you get a missed payout.
4. **The web repo is the wrong home for money-critical code.** Per CLAUDE.md,
   `/home/ubuntu/build` is a loose working copy, not a git checkout; 149 files had
   drifted from the repo, *including the 15% fee math*. Putting the booking engine
   behind the same gated-flip ritual couples marketplace correctness to frontend
   deploys. A separate service gets its own deploy cadence and its own rollback.
5. **It makes dual-run possible.** A standalone core can shadow Sharetribe —
   ingest the same events, compute the same line items and the same state
   transitions, and diff — with zero production exposure. That is the only honest
   way to gain confidence in C1 and C2 before cutting over.

**Why the SDK seam matters:** every client call is `sdk.<resource>.<method>()`
against one injected object. A `prnm-marketplace-client` that presents the same
~50 methods lets you move resource-by-resource behind a per-resource flag
(`listings` from core, `transactions` still from Sharetribe) with no container
changes. That is a genuine strangler-fig boundary, and it is rare to get one this
clean for free.

**Shape:** `prnm-marketplace-core` — Node/TypeScript, Postgres (Supabase, same
project as the mirror so `st_*` and the new tables can be joined during
migration), PostGIS for geo, pg-boss or equivalent for durable scheduling, Stripe
SDK direct. Expose a REST/JSON API; keep `Money`/`UUID` value semantics so the
compatibility client is thin.

**One caution, stated once.** At roughly $400/month, Sharetribe costs ~$4,800/year.
C1–C15 is a multi-month build for one or two engineers, and C1, C2 and C4 are
exactly the areas where a bug costs real money or locks hosts out. The saving is
real, and a second motive — the mobile app's "Outdated listing!" problem and the
Console's constraints on listing types — argues for ownership on its own merits.
But the case should be made on control, not on $4,800. Phase E is built so you can
stop after any phase and still be better off.

## E. Phased migration plan

Sharetribe stays the system of record until Phase 5. Every phase is independently
shippable and independently reversible.

**Phase 0 — Instrument and verify (no new systems)**
- Confirm `st_*` mirror completeness and freshness against the live Integration
  API; publish a daily parity report (row counts, max `updated_at_st` lag, field-level diffs)
- Fix the `SHARETRIBE_INTEGRATION_CLIENT_ID` vs `..._SDK_CLIENT_ID` drift; make
  `integration.js` fail loudly instead of returning `null`
- Resolve `fresh-web` vs `fresh-web-702e04c3`; retire the dead one
- Inventory scale: listing count, host count, transaction count, total image bytes
- **Exit:** mirror provably complete; one naming convention; known data volumes

**Phase 1 — Own the media (pure addition, zero booking risk)**
- Pull every original image via `/v1/integration_api/images/upload`'s read side,
  store in PRNM object storage + CDN
- Add `st_listings.prnm_image_urls`; backfill; serve from PRNM with
  `sharetribe.imgix.net` as fallback
- Replace hardcoded imgix URLs in `AuthBackdrop.js` and `SectionPrnmHero.js`
- **Exit:** P0 item #4 eliminated. Longest-lead migration de-risked early.

**Phase 2 — Own the read model**
- Promote `st_listings` to the authoritative read source for the marketing site:
  `searchListings`, `fetchListing`, `fetchShareListing` in `fresh-web-702e04c3`
- Build search in Postgres (PostGIS radius/bounds + FTS keywords + `pub_*` facets)
  and diff results against `sdk.listings.query` on live traffic
- Move the 16 hosted config assets into PRNM-owned config, including
  `commission.json` → **give `fetchCommission()` a PRNM-owned source with the 15%
  as a checked-in constant**, Sharetribe as fallback
- **Exit:** P0 items #2 and #5 have a PRNM path. Marketing site Sharetribe-free.

**Phase 3 — Own the event stream and the scheduler**
- `prnm-marketplace-core` v0: ingest `events.query`, re-emit as a PRNM stream with
  its own monotonic cursor
- Point `poller.js` and all drips at the PRNM stream instead of Sharetribe
- Build the durable scheduler and run it in **shadow**: compute every timer
  (`PT15M`, `P3D`, `booking-end+P2D/P7D`) and log what it *would* fire, diffed
  against Sharetribe's actual transitions
- **Exit:** C7 done, C1's timing half proven against production without touching it.

**Phase 4 — Shadow the transaction engine**
- Implement the 31 transitions, 15 states, `privileged-set-line-items`, and
  `calculate-full-refund` in core. The state machine and scheduler model now
  exist in `server/shadow/` — see its README for corrections to this section.
- For every real booking, run the shadow engine in parallel and diff: state,
  line items to the penny, refund amounts. **Alert on any divergence.** The 15%
  fee must equal the checkout total exactly — this is where the stale-10%
  ($77 vs $80.50) class of bug is caught
- Implement Stripe orchestration but leave it **disabled**; assert intended
  PaymentIntent operations against what Sharetribe actually did
- **Exit:** zero divergence over a meaningful booking volume, or you do not proceed.

**Phase 5 — Cut over writes, one surface at a time**
- Identity first, because everything hangs off it: dual-write users, run PRNM
  sessions alongside Sharetribe, force one password reset cycle (hashes will not
  export). Social IdPs move to PRNM-owned OAuth
- Then availability writes, then listing CRUD, then messaging/reviews
- **Bookings last**, behind a per-listing flag, starting with a handful of
  friendly hosts. Stripe orchestration goes live here
- Transactional email moves to Emailit as the state machine takes over triggers
- **Exit:** new bookings on core; Sharetribe carrying only in-flight transactions.

**Phase 6 — Mobile**
- Serve a Sharetribe-shaped compatibility API from core so the existing 221-file
  app keeps working unchanged, or commission a JH rewrite against the new API
- The compatibility shim is almost certainly cheaper and unblocks cancellation sooner
- **Exit:** app on core.

**Phase 7 — Drain and cancel**
- Let in-flight Sharetribe transactions reach terminal states (longest tail is
  `booking-end + P7D`)
- Final export of everything; keep the Integration API read-only until the last
  review window closes
- Cancel

## F. Smallest first implementation slice

**Listing read-model parity on EAST.**

Cut `searchListings` and `fetchListing` in `fresh-web-702e04c3` over from the live
Integration API to `st_listings`, behind a flag, with a parity check that runs
before and after.

Scope:
1. A `listing-read.server.ts` module in `fresh-web-702e04c3` exposing the same
   signatures as `sharetribe.server.ts`'s `searchListings` / `fetchListing`,
   backed by `st_listings` (PostGIS for radius, FTS for keywords)
2. `PRNM_LISTING_READ_SOURCE=sharetribe|mirror|shadow` — default `sharetribe`
3. `shadow` mode: serve Sharetribe, run the mirror query too, log any diff in
   result IDs, ordering, price, or photo count
4. A reconciliation job writing to a `listing_read_parity` table
5. Flip to `mirror` only after the diff is clean

Why this one:
- **It cannot touch a booking.** EAST never writes to Sharetribe, never takes
  payment, never issues a session. Worst case is a wrong listing on a marketing page.
- **Most of it already exists.** `st_listings` and the 15-minute sync are built;
  this slice mostly *uses* them and proves they are trustworthy.
- **It answers Phase 0's open question with working code** rather than a report:
  either the mirror is complete and current, or the diff says exactly where it isn't.
- **It builds the piece every later phase needs.** Search on Postgres (C6) is the
  foundation for the marketplace read path, and you get to develop it against
  production traffic with no risk.
- **It is genuinely small.** One module, one flag, one table, one job — days, not weeks.

Explicitly out of scope for the slice: writes of any kind, the WEST app, auth,
pricing, images, the transaction engine.

---

## Corrections to the operating notes

Two things in CLAUDE.md that this audit contradicts, worth fixing there:

1. **`SHARETRIBE_INTEGRATION_SDK_CLIENT_ID/SECRET` on WEST is right**, but
   `.env-template:38-39` ships `SHARETRIBE_INTEGRATION_CLIENT_ID/SECRET` — the
   spelling the code does *not* read. Anyone provisioning from the template gets a
   silently disabled Integration SDK.
2. **`fresh-web` is named as the EAST deployment**, but `fresh-web-702e04c3` is
   newer by two months, has 66 more routes, and holds the entire `st_*` mirror and
   all six Sharetribe server modules. One of them is stale; the notes should say which.
