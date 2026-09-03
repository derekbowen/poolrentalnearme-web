# Service dependency map

Feature → module → external service → environment variables → runtime.

Generated 2026-09-03 from a full scan of the marketplace repository. Names only, no values.
Companion to `INFRASTRUCTURE_SECRET_AUDIT.md` (the full variable table) and
`ENVIRONMENT_MATRIX.md` (where each is meant to live).

**Two hosts, one estate.** WEST runs this repository (Docker container
`poolrentalnearme-production`). EAST runs `fresh-web`, a separate tree that is not in this
repo. Where a feature spans both, the EAST half is marked and its variable names differ —
that difference is itself a finding.

---

## Money

**Booking payment and payout**
→ Sharetribe transaction engine (`ext/transaction-processes/default-booking/process.edn`)
→ **Sharetribe Marketplace API → Stripe Connect**
→ `VITE_SHARETRIBE_SDK_CLIENT_ID`, `SHARETRIBE_SDK_CLIENT_SECRET`
→ production backend

The marketplace does **not** charge cards with its own Stripe key. Sharetribe holds the
Stripe connection and fires `action/stripe-create-payout` at booking end + 2 days
(`transition/complete`). `STRIPE_SECRET_KEY` is not in this path. A host with incomplete
Stripe Connect onboarding produces the checkout error
`CheckoutPage.destinationAccountNotCompleteStripeError`.

**Payout history and summary endpoints**
→ `server/api/payouts.js`
→ **Stripe REST API** (direct)
→ `STRIPE_SECRET_KEY`
→ production backend — *degrades silently*: the module returns early when the key is unset,
so the dashboard shows an empty payout history rather than an error.

**Identity verification**
→ `server/api/create-verification-session.js`, `server/api/check-verification-status.js`
→ **Stripe Identity**
→ `STRIPE_SECRET_KEY`, `STRIPE_IDENTITY_RENTAL_FLOW_ID`
→ production backend — module-level `const stripe = KEY ? require('stripe')(KEY) : null`

**Guest and host fee display**
→ `src/config/businessFacts.js` (no external service)
→ 15% guest fee, 0% host fee, sourced from ToS 2026.3 §4.1
→ enforced at build time by `server/api-util/businessFacts.test.js`

---

## Supply and operations

**Listing read/write, host lookup, bulk scripts**
→ `server/api-util/integration.js`, `scripts/backfill-guest-bands.js`, `server/api/promo-codes.js`,
  `server/api/calendar-apply-exceptions.js`, `server/api/additional-charge-request.js`
→ **Sharetribe Integration API**
→ `SHARETRIBE_INTEGRATION_SDK_CLIENT_ID`, `SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET`
→ production backend
→ **EAST calls the same credential `SHARETRIBE_INTEG_CLIENT_ID` / `_SECRET`.**
   `.env-template` documents a third spelling, `SHARETRIBE_INTEGRATION_CLIENT_ID`, that no
   code reads.

**Host share links and click tracking**
→ `server/api/go-redirect.js` → `server/api/share-link-stats.js` →
  `src/containers/HostDashboardPage/SharePoolCard.js`
→ **Sharetribe Integration API** (resolve slug → listing) + **Supabase** (log the click)
→ `SHARETRIBE_INTEGRATION_SDK_*`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
→ production backend — *degrades silently*: `if (!U || !K) return;` drops the click, and
  `share-link-stats` returns `{total: 0, last7: 0}`, so a host sees a truthful-looking zero.

**iCal availability sync**
→ `server/api/ical-link.js`, `server/api-util/icalToken.js`, `server/api-util/icalFlag.js`
→ internal (token signing)
→ `ICAL_FEED_SECRET`, `ICAL_FEED_ENABLED`, `ICAL_FEED_ALLOWLIST`,
  `MARKETPLACE_ROOT_URL` / `REACT_APP_MARKETPLACE_ROOT_URL` (two legacy names, both read)
→ production backend — `ICAL_FEED_SECRET` defaults to `''`, which signs tokens with an
  empty secret rather than refusing.

**Swimply import resync**
→ `server/extensions/sms-messaging/mod/notify/swimply-resync.js`
→ **Supabase**
→ `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SWIMPLY_RESYNC_ENABLED`, `SWIMPLY_RESYNC_INTERVAL_MS`
→ production backend — **hardcodes the production Supabase project URL as a fallback** and
  defaults the key to `''`; it then logs `sweeps will run UNAUDITED` and continues.

---

## Messaging

**Outbound SMS (all of it)**
→ `server/extensions/common/config/sms.js` → `mod/sms/instance.js` → `mod/notify/twsend.js`
→ **Twilio**
→ `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`,
  `TWILIO_PHONE_NUMBER`
→ production backend. US-only by design: `twsend` skips non-US numbers.

**Inbound SMS and reply routing**
→ `mod/notify/inbound.js`, `mod/notify/routing.js`, `mod/notify/routectl.js`
→ **Twilio webhooks** + **Supabase** (`sms_reply_ctx`)
→ `TWILIO_AUTH_TOKEN` (signature validation), `TWILIO_VALIDATE_SIGNATURE`,
  `TWILIO_INBOUND_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
→ production backend — routing falls back to Derek when Supabase is unreachable.

**Concierge / Chatwoot bridge**
→ `server/concierge/route.js`, `server/concierge/lib/webhook.js`
→ **Twilio** + **Chatwoot (EAST)**
→ `CONCIERGE_INBOUND_URL`, `LEGACY_INBOUND_URL`, `TWILIO_AUTH_TOKEN` **or** `AUTH_TOKEN`
→ production backend — `AUTH_TOKEN` is a second, dangerously generic name for the Twilio
  token.

**Notification poller, welcome SMS, campaign blasts**
→ `mod/notify/poller.js`, `welcome.js`, `betablast.js`, `consent.js`, `exclude.js`
→ **Sharetribe Integration API** + **Supabase** + **Twilio**
→ `SMS_NOTIFICATIONS_ENABLED`, `SMS_POLL_INTERVAL_MS`, `SMS_ALLOWLIST`, `SMS_ALARM_PHONE`,
  `FOUNDER_WELCOME_*` (9 flags), `BLAST_DRY_RUN`, `BLAST_THROTTLE_MS`,
  `ONBOARD_NUDGE_ENABLED`, `PAYOUT_SMS_ENABLED`, `REPLY_TO_ACCEPT_ENABLED`,
  `CAMPAIGN_FORWARD_TO`
→ production backend — the poller logs
  `DISABLED — SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set` and returns. **A missing
  key silently stops every host notification**, which looks identical to a quiet week.

**Weekly host click-stats cron**
→ `scripts/switchy/weekly_stats.js`, `run_weekly_stats.sh` (deployed to `/home/ubuntu/switchy/`)
→ **Supabase** + **Twilio** + Sharetribe Integration API
→ `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WEEKLY_DRY`
→ **cron on WEST**, `0 20 * * 4`. Kill switch: `/home/ubuntu/switchy/WEEKLY_STOP`.

---

## Web and identity

**Session cookies**
→ `src/config/settings.js`, `server/api-util/sdk.js`
→ `VITE_SHARETRIBE_USING_SSL` — **build-time**; both files now default it on in production so
  a missing variable cannot silently drop `Secure` from every session cookie.

**Social sign-in**
→ `src/containers/AuthenticationPage/`, `server/extensions/socials-sign-in/`
→ **Google, Facebook, Apple, Twitter, LinkedIn OAuth**
→ `VITE_GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`, `VITE_FACEBOOK_APP_ID` +
  `FACEBOOK_APP_SECRET`, `VITE_APPLE_CLIENT_ID`, `VITE_TWITTER_CLIENT_ID`,
  `VITE_LINKED_IN_CLIENT_ID`
→ browser bundle + production backend

**Login-as (operator impersonation)**
→ `server/api/initiate-login-as.js`, `server/extensions/common/config/jwt.js`,
  `server/wellKnownRouter.js`
→ internal JWT/JWKS
→ `ENCRYPTED_JWT_PRIVATE_KEY`, `VITE_ENCRYPTED_JWT_PUBLIC_KEY`, `RSA_PRIVATE_KEY`,
  `RSA_PUBLIC_KEY`, `SERVER_SHARETRIBE_CONSOLE_URL`
→ production backend. See CLAUDE.md rule 7 — never persist an impersonation token.

**AI listing generation**
→ `server/api/ai-generate-listing.js`, `server/api/generate-listing.js`
→ **Anthropic API**
→ `ANTHROPIC_API_KEY`, `ANTHROPIC_LISTING_MODEL`
→ production backend — returns HTTP 500 `AI listing generation is not configured` when unset.
  This is the *good* pattern: loud, not silent.

**Geocoding / search by city**
→ `server/api/geocode.js`, `server/api/geocodeSuggest.js`, `server/api-util/geoUpstream.js`
→ **Nominatim (OSM)**, **Google Maps**, **US Census**
→ `NOMINATIM_URL`, `NOMINATIM_MIN_INTERVAL_MS`, `NOMINATIM_TIMEOUT_MS`,
  `VITE_GOOGLE_MAPS_API_KEY`
→ production backend. The public Nominatim instance has rate-limited WEST before (429s broke
  city search); `NOMINATIM_MIN_INTERVAL_MS` is the throttle.

**Event handler**
→ `server/extensions/event-handler/common/config/rabbitmq.js`
→ **RabbitMQ**
→ `RABBITMQ_MARKETPLACE_SUBSCRIBER_{HOST,PORT,USERNAME,PASSWORD,VHOST}`,
  `RABBITMQ_MESSAGE_PREFETCH`
→ production backend — **no evidence a broker is actually running**; treat as dormant until
  confirmed.

---

## Deployment

**Container build and ship**
→ `scripts/deploy.sh`, `Dockerfile`, `.turtleci/production.yml`
→ **AWS ECR + EC2 + Secrets Manager**
→ `AWS_ENV_USER_ACCESS_KEY_ID`, `AWS_ENV_USER_SECRET_ACCESS_KEY`, `AWS_ENV_USER_REGION`,
  `AWS_ACCOUNT_ID`, `AWS_ECR_REGION`, `AWS_ECR_REPO_URL`, `AWS_JH_ENV_SECRET_NAME`,
  `AWS_INSTANCE_URL(S)`, `AWS_PRIVATE_KEY_PATH`, `ENCODED_PEM`, `ENV_FILE_PATH`
→ **CI — which does not run.** `.turtleci/*.yml` uses GitHub Actions `${{ secrets.* }}`
  syntax but sits outside `.github/workflows/`, so GitHub never executes it. Every deploy is
  therefore manual on the box. See the CRITICAL section of the audit.

`AWS_JH_ENV_SECRET_NAME` is the important one: it names an **AWS Secrets Manager secret that
holds the real runtime `.env`**. That is the closest thing PRNM already has to a canonical
production secret store, and it is what the canonical architecture recommendation builds on.

---

## Services with no dependency in this repository

Searched for and **not found anywhere**: Cloudflare (no `wrangler.*`, no Workers, no
`CLOUDFLARE_*`), SendGrid, Vercel, Netlify, Redis, direct PostgreSQL (Postgres is reached
only through Supabase's REST API), Terraform, serverless framework.

**Emailit** — the transactional email provider named in CLAUDE.md — has **no reference in this
repository at all**: no API key variable, no client, no send call. All Emailit sending happens
on EAST. Any claim that this repo can send email is wrong.
