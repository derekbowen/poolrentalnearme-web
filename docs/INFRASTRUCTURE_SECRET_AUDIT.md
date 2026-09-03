# Infrastructure & secret dependency audit

Generated 2026-09-03 by a recursive scan of the marketplace repository
(1582 files, 508 directories). Variable **names** only —
no value, fingerprint or partial secret appears in this file or in any file it references.

**Scope note.** This repository is the WEST marketplace (Sharetribe template, Docker).
The EAST marketing site (`fresh-web`) is a separate tree that is not in this repo; where a
variable is known to differ there it is called out. Nothing in this audit was deployed.

**Headline: 0 of 139 variables are present in the execution environment this audit ran in.**
That is the whole reason sessions keep breaking — see CANONICAL SECRET ARCHITECTURE at the end.

Status values: `OK` `MISSING` `DUPLICATE` `STALE` `MISNAMED` `UNKNOWN` `SECURITY RISK`.
`MISSING` here means *absent from the environment this audit ran in* — most of these do exist
on the production hosts; the point is that nothing in the repo can prove it.

## Stripe

| Variable | Used By | Required Env | Expected Storage | Present? | Status | Notes |
|---|---|---|---|---|---|---|
| `STRIPE_SECRET_KEY` | .env-template (+3) | REQUIRED | Production secret store -> container env | **no** | MISSING | production-critical. |
| `VITE_STRIPE_PUBLISHABLE_KEY` | .env-template (+1) | REQUIRED | Build-time: baked into the client bundle | **no** | MISSING | production-critical. |
| `STRIPE_IDENTITY_RENTAL_FLOW_ID` | server/api/create-verification-session.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `STRIPE_WEBHOOK_SECRET` | .env-template | optional | Production secret store -> container env | **no** | STALE | documented/declared but no code path reads it |

## Sharetribe

| Variable | Used By | Required Env | Expected Storage | Present? | Status | Notes |
|---|---|---|---|---|---|---|
| `SHARETRIBE_INTEGRATION_SDK_CLIENT_ID` | scripts/backfill-guest-bands.js (+3) | REQUIRED | Production secret store -> container env | **no** | MISSING | production-critical. |
| `SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET` | scripts/backfill-guest-bands.js (+3) | REQUIRED | Production secret store -> container env | **no** | MISSING | production-critical. |
| `SHARETRIBE_SDK_CLIENT_SECRET` | .env-template (+3) | REQUIRED | Production secret store -> container env | **no** | MISSING | production-critical. |
| `VITE_SHARETRIBE_SDK_CLIENT_ID` | .env-template (+7) | REQUIRED | Build-time: baked into the client bundle | **no** | MISSING | production-critical. |
| `VITE_SHARETRIBE_USING_SSL` | server/api-util/rootURL.js (+6) | REQUIRED | Build-time: baked into the client bundle | **no** | MISSING | production-critical. |
| `SHARETRIBE_INTEGRATION_CLIENT_ID` | .env-template | optional | Production secret store -> container env | **no** | STALE | documented/declared but no code path reads it |
| `SHARETRIBE_INTEGRATION_CLIENT_SECRET` | .env-template | optional | Production secret store -> container env | **no** | STALE | documented/declared but no code path reads it |
| `VITE_SHARETRIBE_SDK_ASSET_CDN_BASE_URL` | server/api-util/sdk.js (+2) | optional | Build-time: baked into the client bundle | **no** | MISSING |  |
| `VITE_SHARETRIBE_SDK_BASE_URL` | server/api-util/sdk.js (+4) | optional | Build-time: baked into the client bundle | **no** | MISSING |  |
| `VITE_SHARETRIBE_SDK_LOGIN_AS_BASE_URL` | src/config/settings.js | optional | Build-time: baked into the client bundle | **no** | MISSING |  |
| `VITE_SHARETRIBE_SDK_TRANSIT_VERBOSE` | server/api-util/sdk.js (+3) | optional | Build-time: baked into the client bundle | **no** | MISSING |  |

## Supabase

| Variable | Used By | Required Env | Expected Storage | Present? | Status | Notes |
|---|---|---|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | scripts/switchy/weekly_stats.js (+11) | REQUIRED | Production secret store -> container env | **no** | MISSING | production-critical. |
| `SUPABASE_URL` | scripts/switchy/weekly_stats.js (+11) | REQUIRED | Production secret store -> container env | **no** | MISSING | production-critical. |

## Twilio / SMS

| Variable | Used By | Required Env | Expected Storage | Present? | Status | Notes |
|---|---|---|---|---|---|---|
| `TWILIO_ACCOUNT_SID` | server/extensions/common/config/sms.js | REQUIRED | Production secret store -> container env | **no** | MISSING | production-critical. |
| `TWILIO_AUTH_TOKEN` | server/concierge/lib/webhook.js (+3) | REQUIRED | Production secret store -> container env | **no** | MISSING | production-critical. |
| `TWILIO_PHONE_NUMBER` | server/extensions/common/config/sms.js | REQUIRED | Production secret store -> container env | **no** | MISSING | production-critical. |
| `BLAST_DRY_RUN` | server/extensions/sms-messaging/mod/notify/betablast.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `BLAST_THROTTLE_MS` | server/extensions/sms-messaging/mod/notify/betablast.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `CAMPAIGN_FORWARD_TO` | server/config/staff.js (+2) | optional | Production secret store -> container env | **no** | MISSING |  |
| `FOUNDER_WELCOME_BODY` | server/extensions/sms-messaging/mod/notify/welcome.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `FOUNDER_WELCOME_DELAY_MS` | server/extensions/sms-messaging/mod/notify/welcome.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `FOUNDER_WELCOME_ENABLED` | server/extensions/sms-messaging/mod/notify/welcome.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `FOUNDER_WELCOME_MAX_AGE_MS` | server/extensions/sms-messaging/mod/notify/welcome.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `FOUNDER_WELCOME_QUIET_END` | server/extensions/sms-messaging/mod/notify/welcome.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `FOUNDER_WELCOME_QUIET_START` | server/extensions/sms-messaging/mod/notify/welcome.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `FOUNDER_WELCOME_SWEEP_MS` | server/extensions/sms-messaging/mod/notify/welcome.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `FOUNDER_WELCOME_TABLE` | server/extensions/sms-messaging/mod/notify/welcome.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `FOUNDER_WELCOME_USERTYPE` | server/extensions/sms-messaging/mod/notify/welcome.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `ONBOARD_NUDGE_ENABLED` | server/extensions/sms-messaging/mod/notify/poller.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `PAYOUT_SMS_ENABLED` | server/extensions/sms-messaging/mod/notify/poller.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `REPLY_TO_ACCEPT_ENABLED` | server/extensions/sms-messaging/mod/notify/replyactions.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `SMS_ALARM_PHONE` | server/extensions/sms-messaging/mod/notify/poller.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `SMS_ALLOWLIST` | server/extensions/sms-messaging/mod/notify/poller.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `SMS_NOTIFICATIONS_ENABLED` | server/extensions/sms-messaging/mod/notify/poller.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `SMS_POLL_INTERVAL_MS` | server/extensions/sms-messaging/mod/notify/poller.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `TWILIO_INBOUND_URL` | server/extensions/sms-messaging/mod/notify/inbound.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `TWILIO_MESSAGING_SERVICE_SID` | server/extensions/sms-messaging/mod/notify/twsend.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `TWILIO_VALIDATE_SIGNATURE` | server/extensions/sms-messaging/mod/notify/inbound.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `WEEKLY_DRY` | scripts/switchy/weekly_stats.js | optional | Production secret store -> container env | **no** | MISSING |  |

## AWS (deploy)

| Variable | Used By | Required Env | Expected Storage | Present? | Status | Notes |
|---|---|---|---|---|---|---|
| `AWS_ACCOUNT_ID` | scripts/deploy.sh (+1) | optional | CI secret store (see CANONICAL ARCHITECTURE) | **no** | MISSING |  |
| `AWS_ECR_REGION` | scripts/deploy.sh (+1) | optional | CI secret store (see CANONICAL ARCHITECTURE) | **no** | MISSING |  |
| `AWS_ECR_REPO_URL` | scripts/deploy.sh (+1) | optional | CI secret store (see CANONICAL ARCHITECTURE) | **no** | MISSING |  |
| `AWS_ENV_USER_ACCESS_KEY_ID` | scripts/deploy.sh | optional | CI secret store (see CANONICAL ARCHITECTURE) | **no** | MISSING |  |
| `AWS_ENV_USER_REGION` | scripts/deploy.sh (+1) | optional | CI secret store (see CANONICAL ARCHITECTURE) | **no** | MISSING |  |
| `AWS_ENV_USER_SECRET_ACCESS_KEY` | scripts/deploy.sh | optional | CI secret store (see CANONICAL ARCHITECTURE) | **no** | MISSING |  |
| `AWS_INSTANCE_URL` | scripts/deploy.sh (+1) | optional | CI secret store (see CANONICAL ARCHITECTURE) | **no** | MISSING |  |
| `AWS_INSTANCE_URLS` | scripts/deploy.sh (+1) | optional | CI secret store (see CANONICAL ARCHITECTURE) | **no** | MISSING |  |
| `AWS_JH_ENV_SECRET_NAME` | scripts/deploy.sh | optional | CI secret store (see CANONICAL ARCHITECTURE) | **no** | MISSING |  |
| `AWS_PRIVATE_KEY_PATH` | scripts/deploy.sh (+1) | optional | CI secret store (see CANONICAL ARCHITECTURE) | **no** | MISSING |  |

## JWT / signing keys

| Variable | Used By | Required Env | Expected Storage | Present? | Status | Notes |
|---|---|---|---|---|---|---|
| `ENCRYPTED_JWT_PRIVATE_KEY` | server/extensions/common/config/jwt.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `RSA_PRIVATE_KEY` | server/wellKnownRouter.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `RSA_PUBLIC_KEY` | server/wellKnownRouter.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `VITE_ENCRYPTED_JWT_PUBLIC_KEY` | server/extensions/common/config/jwt.js (+1) | optional | Build-time: baked into the client bundle | **no** | MISSING |  |

## Marketplace core

| Variable | Used By | Required Env | Expected Storage | Present? | Status | Notes |
|---|---|---|---|---|---|---|
| `VITE_ENV` | .env-template (+14) | REQUIRED | Build-time: baked into the client bundle | **no** | MISSING | production-critical. |
| `VITE_MARKETPLACE_ROOT_URL` | .env-template (+14) | REQUIRED | Build-time: baked into the client bundle | **no** | MISSING | production-critical. |
| `ANDROID_APP_PACKAGE_NAME` | server/wellKnownRouter.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `ANDROID_APP_SHA_256_FINGERPRINT` | server/wellKnownRouter.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `APPLE_BUNDLE_ID` | server/wellKnownRouter.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `APPLE_TEAM_ID` | server/wellKnownRouter.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `AUTH_TOKEN` | server/concierge/lib/webhook.js (+1) | optional | Production secret store -> container env | **no** | MISNAMED | name does not match what the code reads |
| `BASE` | server/config/server.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `CURRENT_AWS_INSTANCE_URL` | scripts/deploy.sh | optional | Production secret store -> container env | **no** | MISSING |  |
| `MARKETPLACE_ROOT_URL` | server/api/ical-link.js | optional | Production secret store -> container env | **no** | STALE | documented/declared but no code path reads it |
| `NODE_ENV` | server/api-util/sdk.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `OTP_TIME_STEP` | server/extensions/phone-number-verification/config/otp.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `PORT` | server/config/server.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `PREVENT_DATA_LOADING_IN_SSR` | server/config/server.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `PROFILE_SCHEMA_BASE_URL` | scripts/validate-profilepage-schema.mjs | optional | Production secret store -> container env | **no** | MISSING |  |
| `REACT_APP_ENV` | server/resources/robotsTxt.js (+1) | optional | Production secret store -> container env | **no** | STALE | documented/declared but no code path reads it |
| `REACT_APP_MARKETPLACE_ROOT_URL` | server/api/ical-link.js | optional | Production secret store -> container env | **no** | STALE | documented/declared but no code path reads it |
| `SERVER_SHARETRIBE_CONSOLE_URL` | server/api/initiate-login-as.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `SERVER_SHARETRIBE_TRUST_PROXY` | server/config/server.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `SITEMAP_DISABLED` | server/resources/sitemap.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `VITE_CSP` | server/config/csp.js (+1) | optional | Build-time: baked into the client bundle | **no** | MISSING |  |
| `VITE_DEV_API_SERVER_PORT` | server/api-util/idToken.js (+8) | optional | Build-time: baked into the client bundle | **no** | MISSING |  |
| `VITE_HERO_BACKGROUND_VIDEO_URL` | src/extensions/hero/config.js | optional | Build-time: baked into the client bundle | **no** | MISSING |  |
| `VITE_HOST_PREVIEW_OPERATOR_IDS` | src/containers/HostOnboardingPage/previewAccess.js | optional | Build-time: baked into the client bundle | **no** | MISSING |  |
| `VITE_INTERCOM_APP_ID` | src/extensions/intercom/config/intercom.js | optional | Build-time: baked into the client bundle | **no** | MISSING |  |
| `VITE_JH_WISHLIST_FEATURE_ENABLE_BOOKMARK_OWN_LISTING` | server/extensions/wishlist/common/config/wishlist.js (+1) | optional | Build-time: baked into the client bundle | **no** | MISSING |  |
| `VITE_JH_WISHLIST_FEATURE_ENABLE_USER_NAV_ITEM` | src/extensions/wishlist/config/configWishlist.js | optional | Build-time: baked into the client bundle | **no** | MISSING |  |
| `VITE_LEGACY_BROWSER_SUPPORT` | .env-template | optional | Build-time: baked into the client bundle | **no** | STALE | documented/declared but no code path reads it |
| `VITE_MARKETPLACE_NAME` | src/config/configDefault.js | optional | Build-time: baked into the client bundle | **no** | MISSING |  |
| `VITE_OTP_WINDOW` | server/extensions/phone-number-verification/config/otp.js (+1) | optional | Build-time: baked into the client bundle | **no** | MISSING |  |
| `VITE_PORT` | server/config/server.js | optional | Build-time: baked into the client bundle | **no** | MISSING |  |

## Concierge (Chatwoot)

| Variable | Used By | Required Env | Expected Storage | Present? | Status | Notes |
|---|---|---|---|---|---|---|
| `CONCIERGE_INBOUND_URL` | server/concierge/lib/webhook.js (+1) | optional | Production secret store -> container env | **no** | MISSING |  |
| `CONCIERGE_PAUSE_FILE` | server/concierge/config.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `CONCIERGE_STOP_FILE` | server/concierge/config.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `LEGACY_INBOUND_URL` | server/concierge/lib/webhook.js | optional | Production secret store -> container env | **no** | MISSING |  |

## Social sign-in (IdP)

| Variable | Used By | Required Env | Expected Storage | Present? | Status | Notes |
|---|---|---|---|---|---|---|
| `FACEBOOK_APP_SECRET` | .env-template (+2) | optional | Production secret store -> container env | **no** | MISSING |  |
| `GOOGLE_CLIENT_SECRET` | .env-template (+2) | optional | Production secret store -> container env | **no** | MISSING |  |
| `LINKED_IN_CLIENT_SECRET` | server/extensions/socials-sign-in/README.md | optional | Production secret store -> container env | **no** | STALE | documented/declared but no code path reads it |
| `LINKED_IN_IDP_ID` | server/extensions/socials-sign-in/README.md | optional | Production secret store -> container env | **no** | STALE | documented/declared but no code path reads it |
| `VITE_APPLE_CLIENT_ID` | src/containers/AuthenticationPage/AuthenticationPage.js (+1) | optional | Build-time: baked into the client bundle | **no** | MISSING |  |
| `VITE_FACEBOOK_APP_ID` | .env-template (+6) | optional | Build-time: baked into the client bundle | **no** | MISSING |  |
| `VITE_GOOGLE_CLIENT_ID` | .env-template (+5) | optional | Build-time: baked into the client bundle | **no** | MISSING |  |
| `VITE_LINKED_IN_CLIENT_ID` | server/extensions/socials-sign-in/README.md (+2) | optional | Build-time: baked into the client bundle | **no** | MISSING |  |
| `VITE_TWITTER_CLIENT_ID` | src/containers/AuthenticationPage/AuthenticationPage.js (+1) | optional | Build-time: baked into the client bundle | **no** | MISSING |  |

## Geocoding / Maps

| Variable | Used By | Required Env | Expected Storage | Present? | Status | Notes |
|---|---|---|---|---|---|---|
| `NOMINATIM_MIN_INTERVAL_MS` | server/api-util/geoUpstream.js (+1) | optional | Production secret store -> container env | **no** | MISSING |  |
| `NOMINATIM_TIMEOUT_MS` | server/api-util/geoUpstream.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `NOMINATIM_URL` | server/api-util/geoUpstream.js (+2) | optional | Production secret store -> container env | **no** | MISSING |  |
| `VITE_GOOGLE_MAPS_API_KEY` | server/api/geocode.js (+1) | optional | Build-time: baked into the client bundle | **no** | MISSING |  |
| `VITE_MAPBOX_ACCESS_TOKEN` | .env-template (+1) | optional | Build-time: baked into the client bundle | **no** | MISSING |  |

## Anthropic

| Variable | Used By | Required Env | Expected Storage | Present? | Status | Notes |
|---|---|---|---|---|---|---|
| `ANTHROPIC_API_KEY` | .env-template (+5) | optional | Production secret store -> container env | **no** | MISSING |  |
| `ANTHROPIC_LISTING_MODEL` | server/api/ai-generate-listing.js | optional | Production secret store -> container env | **no** | MISSING |  |

## RabbitMQ

| Variable | Used By | Required Env | Expected Storage | Present? | Status | Notes |
|---|---|---|---|---|---|---|
| `RABBITMQ_MARKETPLACE_SUBSCRIBER_HOST` | server/extensions/event-handler/common/config/rabbitmq.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `RABBITMQ_MARKETPLACE_SUBSCRIBER_PASSWORD` | server/extensions/event-handler/common/config/rabbitmq.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `RABBITMQ_MARKETPLACE_SUBSCRIBER_PORT` | server/extensions/event-handler/common/config/rabbitmq.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `RABBITMQ_MARKETPLACE_SUBSCRIBER_USERNAME` | server/extensions/event-handler/common/config/rabbitmq.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `RABBITMQ_MARKETPLACE_SUBSCRIBER_VHOST` | server/extensions/event-handler/common/config/rabbitmq.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `RABBITMQ_MESSAGE_PREFETCH` | server/extensions/event-handler/common/config/rabbitmq.js | optional | Production secret store -> container env | **no** | MISSING |  |

## Intercom

| Variable | Used By | Required Env | Expected Storage | Present? | Status | Notes |
|---|---|---|---|---|---|---|
| `INTERCOM_TOKEN` | server/extensions/intercom-sync/config/intercom.js | optional | Production secret store -> container env | **no** | MISSING |  |

## iCal sync

| Variable | Used By | Required Env | Expected Storage | Present? | Status | Notes |
|---|---|---|---|---|---|---|
| `ICAL_FEED_ALLOWLIST` | server/api-util/icalFlag.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `ICAL_FEED_ENABLED` | server/api-util/icalFlag.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `ICAL_FEED_SECRET` | server/api-util/icalToken.js | optional | Production secret store -> container env | **no** | MISSING |  |

## Swimply import

| Variable | Used By | Required Env | Expected Storage | Present? | Status | Notes |
|---|---|---|---|---|---|---|
| `SWIMPLY_RESYNC_ENABLED` | server/extensions/sms-messaging/mod/notify/swimply-resync.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `SWIMPLY_RESYNC_INTERVAL_MS` | server/extensions/sms-messaging/mod/notify/swimply-resync.js | optional | Production secret store -> container env | **no** | MISSING |  |

## Analytics / monitoring

| Variable | Used By | Required Env | Expected Storage | Present? | Status | Notes |
|---|---|---|---|---|---|---|
| `VITE_FACEBOOK_PIXEL_ID` | src/util/includeScripts.js | optional | Build-time: baked into the client bundle | **no** | MISSING |  |
| `VITE_GOOGLE_ANALYTICS_ID` | src/config/configAnalytics.js (+1) | optional | Build-time: baked into the client bundle | **no** | MISSING |  |
| `VITE_PLAUSIBLE_DOMAINS` | src/config/configAnalytics.js | optional | Build-time: baked into the client bundle | **no** | MISSING |  |
| `VITE_SENTRY_DSN` | server/log.js (+1) | optional | Build-time: baked into the client bundle | **no** | MISSING |  |

## Server hardening

| Variable | Used By | Required Env | Expected Storage | Present? | Status | Notes |
|---|---|---|---|---|---|---|
| `BASIC_AUTH_PASSWORD` | server/config/server.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `BASIC_AUTH_USERNAME` | server/config/server.js | optional | Production secret store -> container env | **no** | MISSING |  |
| `CSP_REPORT_URL` | server/config/csp.js | optional | Production secret store -> container env | **no** | MISSING |  |

## Staff routing

| Variable | Used By | Required Env | Expected Storage | Present? | Status | Notes |
|---|---|---|---|---|---|---|
| `BRANDON_PHONE` | server/concierge/config.js | optional | Production secret store -> container env | **no** | DUPLICATE | two names for one value |
| `PRNM_BRANDON_PHONE` | server/config/staff.js | optional | Production secret store -> container env | **no** | DUPLICATE | two names for one value |

## Weather

| Variable | Used By | Required Env | Expected Storage | Present? | Status | Notes |
|---|---|---|---|---|---|---|
| `TOMORROW_IO_API_KEY` | .env-template (+1) | optional | Production secret store -> container env | **no** | STALE | documented/declared but no code path reads it |

## Ad platforms

| Variable | Used By | Required Env | Expected Storage | Present? | Status | Notes |
|---|---|---|---|---|---|---|
| `BING_ACCOUNT_ID` | .env-template | optional | Production secret store -> container env | **no** | STALE | documented/declared but no code path reads it |
| `BING_CUSTOMER_ID` | .env-template | optional | Production secret store -> container env | **no** | STALE | documented/declared but no code path reads it |
| `BING_DEVELOPER_TOKEN` | .env-template | optional | Production secret store -> container env | **no** | STALE | documented/declared but no code path reads it |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | .env-template | optional | Production secret store -> container env | **no** | STALE | documented/declared but no code path reads it |
| `GOOGLE_ADS_MCC_ID` | .env-template | optional | Production secret store -> container env | **no** | STALE | documented/declared but no code path reads it |
| `GOOGLE_ADS_REFRESH_TOKEN` | .env-template | optional | Production secret store -> container env | **no** | STALE | documented/declared but no code path reads it |
| `META_ACCESS_TOKEN` | .env-template | optional | Production secret store -> container env | **no** | STALE | documented/declared but no code path reads it |
| `META_AD_ACCOUNT_ID` | .env-template | optional | Production secret store -> container env | **no** | STALE | documented/declared but no code path reads it |
| `META_APP_SECRET` | .env-template | optional | Production secret store -> container env | **no** | STALE | documented/declared but no code path reads it |
---

# CRITICAL

Things capable of breaking production, or already doing so.

### C1. The deploy pipeline has never run

> **Correction, 2026-09-03.** I first described these as "GitHub Actions workflows in the wrong
> directory". That was wrong in a way that changes the fix. They interpolate
> `${{ secrets.* }}` like Actions, but the job schema is **TurtleCI's**: `builder: [ubuntu,
> docker, aws]` where Actions requires `runs-on:`, and `uses: checkout` where Actions requires
> `actions/checkout@v4`. Moving the files to `.github/workflows/` would produce a workflow
> GitHub cannot parse. They must be **ported**, not relocated. See
> `FIRST_CANONICAL_RELEASE.md` §5.

`.turtleci/production.yml` and `.turtleci/development.yml` call `./scripts/deploy.sh` and carry
every AWS deployment credential the project defines. They belong to TurtleCI, a CI provider
that is evidently no longer running, and nothing else executes them: this repository's
`.github/` contains exactly one file, `ISSUE_TEMPLATE/bug_report.md`.

So every AWS deployment credential the project defines — ECR, EC2, the SSH `ENCODED_PEM`, and
`AWS_JH_ENV_SECRET_NAME` (the Secrets Manager entry holding the real runtime `.env`) — is
wired to a pipeline that cannot fire. Consequences, all of them already observed:

- every release is hand-built on the box, which is how `/home/ubuntu/build` forked from this
  repo by 149 files (the "including the fee math" part of that note is now disproven — see
  `FEE_MATH_RECONCILIATION.md`: the commission rate lives in a Sharetribe hosted asset, in
  neither tree, and production computes 15%/0% exactly as the repo states);
- the canonical runtime `.env` in Secrets Manager is never read by anything automated, so
  nobody can say what production actually holds;
- deployment depends on credentials that exist only wherever a human happens to be sitting.

**This is the root cause of "it breaks every session."** Not any single missing key.

### C2. A production database URL is hardcoded as a fallback

`server/extensions/sms-messaging/mod/notify/swimply-resync.js:45`

```
const SUPA = process.env.SUPABASE_URL || 'https://<project-ref>.supabase.co';
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
```

With no environment, this module points at the live project with an empty key, logs
`WARNING: SUPABASE_SERVICE_ROLE_KEY missing — sweeps will run UNAUDITED`, and keeps going.
A project ref is not itself a secret, but pinning production into source removes the ability
to point a non-production run anywhere else, and the `|| ''` converts a configuration error
into silent unaudited behaviour.

### C3. Related, and already open

The separate finding that the live PII Supabase project is fully open (83/83 tables) with its
anon key published in two public GitHub repositories remains outstanding. This audit does not
supersede it.

---

# HIGH

Configuration problems likely to break deployment or an integration.

### H1. One credential, three names

| Name | Where |
|---|---|
| `SHARETRIBE_INTEGRATION_SDK_CLIENT_ID` / `_SECRET` | what this repo's code actually reads |
| `SHARETRIBE_INTEG_CLIENT_ID` / `_SECRET` | what EAST (`fresh-web`) reads |
| `SHARETRIBE_INTEGRATION_CLIENT_ID` / `_SECRET` | what `.env-template` documents — **read by nothing** |

A developer following the repo's own template configures a variable no code path consumes,
then sees the Integration API fail with no missing-variable error. `scripts/check-env.js`
accepts the first two as aliases; the third should be deleted.

### H2. `AUTH_TOKEN` is a second name for the Twilio auth token

`server/concierge/route.js:14` and `lib/webhook.js:36`:
`process.env.TWILIO_AUTH_TOKEN || process.env.AUTH_TOKEN`. A name that generic will
eventually collide with something else's auth token and silently sign webhooks with the wrong
secret. Pick `TWILIO_AUTH_TOKEN` and drop the fallback.

### H3. Missing configuration disables features silently

These return early and look like a quiet day rather than an outage:

| Module | Behaviour when unset |
|---|---|
| `mod/notify/poller.js:542` | logs `DISABLED … Poller not started` — **all host notifications stop** |
| `api/share-link-stats.js:14` | returns `{total: 0, last7: 0}` — a host sees a real-looking zero |
| `api/go-redirect.js:41` | `if (!U || !K) return;` — the click is dropped, redirect still works |
| `api/payouts.js:51` | empty payout history |
| `api-util/icalToken.js:5` | `SECRET = ''` — feed tokens signed with an empty secret |
| `swimply-resync.js:46` | sweeps run unaudited |

The counter-example to copy is `api/ai-generate-listing.js:103`, which returns HTTP 500
`AI listing generation is not configured` and names the variable. Loud beats silent. This
pattern already caused a real incident: a failed lookup read as a genuine zero and sent a
host the harshest "nobody has seen your pool" message while her link had 2 clicks.

### H4. `.gitignore` does not cover keys or certificates

`.env` and `.env.*` are covered. `*.pem`, `*.key`, `*.p12`, `*.pfx`, `credentials.json` and
`id_rsa` were not — and `.turtleci` expects an `ENCODED_PEM`, so `.pem` files are part of the
workflow. Nothing matching those patterns is currently tracked or on disk, so adding them is
safe; this commit adds them.

### H5. Three generations of the same variable

`VITE_MARKETPLACE_ROOT_URL` (current, 15 refs) · `REACT_APP_MARKETPLACE_ROOT_URL` (CRA-era) ·
`MARKETPLACE_ROOT_URL` (bare). `server/api/ical-link.js:9-10` reads the two legacy names and
falls through. Same story with `REACT_APP_ENV` vs `VITE_ENV`, and `BRANDON_PHONE` vs
`PRNM_BRANDON_PHONE` in `server/config/staff.js`.

---

# CLEANUP

Dead or stale configuration. None of it is dangerous; all of it is misleading.

> **Correction, 2026-09-03.** `scripts/check-env-documented.js`, written after this section,
> immediately found four variables this audit got wrong: `MARKETPLACE_ID`, `MAX_SOCKETS` and
> `KEY_ID` were classified as false positives but are genuine `process.env` reads (`KEY_ID` via
> a destructuring rename in `server/wellKnownRouter.js`), and `TOMORROW_IO_API_KEY` was called
> stale but is read by `server/services/weather.js`. All four are now in `.env.example`, and
> the checker runs in CI so this class of mistake cannot recur — including mine.

- **19 variables are declared but never read.** `.env-template` documents `META_ACCESS_TOKEN`,
  `META_AD_ACCOUNT_ID`, `META_APP_SECRET`, `BING_ACCOUNT_ID`, `BING_CUSTOMER_ID`,
  `BING_DEVELOPER_TOKEN`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_MCC_ID`,
  `GOOGLE_ADS_REFRESH_TOKEN`, `TOMORROW_IO_API_KEY` and `VITE_LEGACY_BROWSER_SUPPORT`; a README
  documents `LINKED_IN_CLIENT_SECRET` and `LINKED_IN_IDP_ID`. No code path consumes any of them.
- **`STRIPE_WEBHOOK_SECRET` is documented but there is no Stripe webhook route in this repo.**
  Either the endpoint lives on EAST or it does not exist. Until someone confirms, an operator
  reading `.env-template` will believe webhook signatures are being verified here. They are not.
- **RabbitMQ** has six variables and a full config module with no evidence a broker exists.
- `.env-template` should be deleted in favour of the generated `.env.example`.

---

# CANONICAL SECRET ARCHITECTURE

The project currently uses **four** conflicting secret systems: AWS Secrets Manager (named by
`AWS_JH_ENV_SECRET_NAME`, unread), CI secrets in a pipeline that never runs, a `.env` file
baked into the container by hand, and an ad-hoc file on an operator's machine. Pick one.

**AWS Secrets Manager is already the intended store.** It is named in the deploy script, it is
in the right account, and it is the only one of the four with an audit trail. Build on it.

| Category | Canonical home | Reaches runtime by |
|---|---|---|
| Production runtime secrets | **AWS Secrets Manager**, one secret per host (WEST, EAST) | `scripts/deploy.sh` fetches it and writes the container `.env` at deploy |
| CI/CD credentials | **GitHub Actions Secrets** | `.github/workflows/*` — once the workflows are moved there |
| Operator/agent access | **Short-lived STS role**, not a long-lived IAM user | assumed per session; no key file on any laptop or container |
| Local development | `.env`, git-ignored, seeded from `.env.example` | never leaves the machine |
| Documentation | `.env.example` (names + comments only) | tracked in git |

Three rules that follow:

1. **A `VITE_*` variable must be present at build time, not run time.** It is compiled into the
   client bundle. This has already aborted one release.
2. **No secret is read from a file inside a container image.** The image is a build artifact;
   secrets arrive as environment at run time.
3. **Missing production-critical configuration fails loudly.** `node scripts/check-env.js`
   runs before the app starts and exits non-zero. Optional features may disable themselves;
   required ones may not.

Nothing here migrates or rotates a secret — that needs explicit approval.
