# Build-time vs runtime environment split

Generated from `.env.example`, which CI keeps in step with the code via
`scripts/check-env-documented.js`. Names only.

**The distinction that matters.** `VITE_`-prefixed variables are compiled into the browser
bundle by Vite at `bun run build`. They are public by construction — anyone can read them in
the shipped JavaScript — and, critically, Vite reads them **only from `.env` files**, never
from `process.env` or `--build-arg` (`vite.config.mjs:13` calls `loadEnv` and never
`define`s them). Everything else is runtime configuration and never needs to touch an image.

That split is the whole fix: the build stage receives `.env.build` (the `VITE_` half, public);
the runtime stage receives nothing and is handed secrets by `docker run --env-file` at start.

| Variable | Build-Time | Runtime | Secret | Consumer | Required |
|---|---|---|---|---|---|
| `STRIPE_SECRET_KEY` | no | yes | **yes** | Stripe | **REQUIRED** |
| `VITE_STRIPE_PUBLISHABLE_KEY` | yes | no | no | Stripe | **REQUIRED** |
| `STRIPE_IDENTITY_RENTAL_FLOW_ID` | no | yes | no | Stripe | optional |
| `SHARETRIBE_INTEGRATION_SDK_CLIENT_ID` | no | yes | no | Sharetribe | **REQUIRED** |
| `SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET` | no | yes | **yes** | Sharetribe | **REQUIRED** |
| `SHARETRIBE_SDK_CLIENT_SECRET` | no | yes | **yes** | Sharetribe | **REQUIRED** |
| `VITE_SHARETRIBE_SDK_CLIENT_ID` | yes | no | no | Sharetribe | **REQUIRED** |
| `VITE_SHARETRIBE_USING_SSL` | yes | yes | no | Sharetribe | **REQUIRED** |
| `VITE_SHARETRIBE_SDK_ASSET_CDN_BASE_URL` | yes | no | no | Sharetribe | optional |
| `VITE_SHARETRIBE_SDK_BASE_URL` | yes | no | no | Sharetribe | optional |
| `VITE_SHARETRIBE_SDK_LOGIN_AS_BASE_URL` | yes | no | no | Sharetribe | optional |
| `VITE_SHARETRIBE_SDK_TRANSIT_VERBOSE` | yes | no | no | Sharetribe | optional |
| `SUPABASE_SERVICE_ROLE_KEY` | no | yes | **yes** | Supabase | **REQUIRED** |
| `SUPABASE_URL` | no | yes | no | Supabase | **REQUIRED** |
| `TWILIO_ACCOUNT_SID` | no | yes | no | Twilio / SMS | **REQUIRED** |
| `TWILIO_AUTH_TOKEN` | no | yes | **yes** | Twilio / SMS | **REQUIRED** |
| `TWILIO_PHONE_NUMBER` | no | yes | no | Twilio / SMS | **REQUIRED** |
| `BLAST_DRY_RUN` | no | yes | no | Twilio / SMS | optional |
| `BLAST_THROTTLE_MS` | no | yes | no | Twilio / SMS | optional |
| `CAMPAIGN_FORWARD_TO` | no | yes | no | Twilio / SMS | optional |
| `FOUNDER_WELCOME_BODY` | no | yes | no | Twilio / SMS | optional |
| `FOUNDER_WELCOME_DELAY_MS` | no | yes | no | Twilio / SMS | optional |
| `FOUNDER_WELCOME_ENABLED` | no | yes | no | Twilio / SMS | optional |
| `FOUNDER_WELCOME_MAX_AGE_MS` | no | yes | no | Twilio / SMS | optional |
| `FOUNDER_WELCOME_QUIET_END` | no | yes | no | Twilio / SMS | optional |
| `FOUNDER_WELCOME_QUIET_START` | no | yes | no | Twilio / SMS | optional |
| `FOUNDER_WELCOME_SWEEP_MS` | no | yes | no | Twilio / SMS | optional |
| `FOUNDER_WELCOME_TABLE` | no | yes | no | Twilio / SMS | optional |
| `FOUNDER_WELCOME_USERTYPE` | no | yes | no | Twilio / SMS | optional |
| `ONBOARD_NUDGE_ENABLED` | no | yes | no | Twilio / SMS | optional |
| `PAYOUT_SMS_ENABLED` | no | yes | no | Twilio / SMS | optional |
| `REPLY_TO_ACCEPT_ENABLED` | no | yes | no | Twilio / SMS | optional |
| `SMS_ALARM_PHONE` | no | yes | no | Twilio / SMS | optional |
| `SMS_ALLOWLIST` | no | yes | no | Twilio / SMS | optional |
| `SMS_NOTIFICATIONS_ENABLED` | no | yes | no | Twilio / SMS | optional |
| `SMS_POLL_INTERVAL_MS` | no | yes | no | Twilio / SMS | optional |
| `TWILIO_INBOUND_URL` | no | yes | no | Twilio / SMS | optional |
| `TWILIO_MESSAGING_SERVICE_SID` | no | yes | no | Twilio / SMS | **REQUIRED** |
| `TWILIO_VALIDATE_SIGNATURE` | no | yes | no | Twilio / SMS | optional |
| `WEEKLY_DRY` | no | yes | no | Twilio / SMS | optional |
| `ENCRYPTED_JWT_PRIVATE_KEY` | no | yes | **yes** | JWT / signing keys | optional |
| `RSA_PRIVATE_KEY` | no | yes | **yes** | JWT / signing keys | optional |
| `RSA_PUBLIC_KEY` | no | yes | **yes** | JWT / signing keys | optional |
| `VITE_ENCRYPTED_JWT_PUBLIC_KEY` | yes | no | no | JWT / signing keys | optional |
| `VITE_ENV` | yes | yes | no | Marketplace core | **REQUIRED** |
| `VITE_MARKETPLACE_ROOT_URL` | yes | yes | no | Marketplace core | **REQUIRED** |
| `ANDROID_APP_PACKAGE_NAME` | no | yes | no | Marketplace core | optional |
| `ANDROID_APP_SHA_256_FINGERPRINT` | no | yes | no | Marketplace core | optional |
| `APPLE_BUNDLE_ID` | no | yes | no | Marketplace core | optional |
| `APPLE_TEAM_ID` | no | yes | no | Marketplace core | optional |
| `AUTH_TOKEN` | no | yes | **yes** | Marketplace core | optional |
| `BASE` | no | yes | no | Marketplace core | optional |
| `CURRENT_AWS_INSTANCE_URL` | no | yes | no | Marketplace core | optional |
| `NODE_ENV` | no | yes | no | Marketplace core | optional |
| `OTP_TIME_STEP` | no | yes | no | Marketplace core | optional |
| `PORT` | no | yes | no | Marketplace core | optional |
| `PREVENT_DATA_LOADING_IN_SSR` | no | yes | no | Marketplace core | optional |
| `PROFILE_SCHEMA_BASE_URL` | no | yes | no | Marketplace core | optional |
| `SERVER_SHARETRIBE_CONSOLE_URL` | no | yes | no | Marketplace core | optional |
| `SERVER_SHARETRIBE_TRUST_PROXY` | no | yes | no | Marketplace core | optional |
| `SITEMAP_DISABLED` | no | yes | no | Marketplace core | optional |
| `VITE_CSP` | yes | no | no | Marketplace core | optional |
| `VITE_DEV_API_SERVER_PORT` | yes | no | no | Marketplace core | optional |
| `VITE_HERO_BACKGROUND_VIDEO_URL` | yes | no | no | Marketplace core | optional |
| `VITE_HOST_PREVIEW_OPERATOR_IDS` | yes | no | no | Marketplace core | optional |
| `VITE_INTERCOM_APP_ID` | yes | no | no | Marketplace core | optional |
| `VITE_JH_WISHLIST_FEATURE_ENABLE_BOOKMARK_OWN_LISTING` | yes | no | no | Marketplace core | optional |
| `VITE_JH_WISHLIST_FEATURE_ENABLE_USER_NAV_ITEM` | yes | no | no | Marketplace core | optional |
| `VITE_MARKETPLACE_NAME` | yes | no | no | Marketplace core | optional |
| `VITE_OTP_WINDOW` | yes | no | no | Marketplace core | optional |
| `VITE_PORT` | yes | no | no | Marketplace core | optional |
| `AWS_ACCOUNT_ID` | no | yes | no | AWS (deploy) | optional |
| `AWS_ECR_REGION` | no | yes | no | AWS (deploy) | optional |
| `AWS_ECR_REPO_URL` | no | yes | no | AWS (deploy) | optional |
| `AWS_ENV_USER_ACCESS_KEY_ID` | no | yes | no | AWS (deploy) | optional |
| `AWS_ENV_USER_REGION` | no | yes | no | AWS (deploy) | optional |
| `AWS_ENV_USER_SECRET_ACCESS_KEY` | no | yes | **yes** | AWS (deploy) | optional |
| `AWS_INSTANCE_URL` | no | yes | no | AWS (deploy) | optional |
| `AWS_INSTANCE_URLS` | no | yes | no | AWS (deploy) | optional |
| `AWS_JH_ENV_SECRET_NAME` | no | yes | **yes** | AWS (deploy) | optional |
| `AWS_PRIVATE_KEY_PATH` | no | yes | **yes** | AWS (deploy) | optional |
| `CONCIERGE_INBOUND_URL` | no | yes | no | Concierge (Chatwoot) | optional |
| `CONCIERGE_PAUSE_FILE` | no | yes | no | Concierge (Chatwoot) | optional |
| `CONCIERGE_STOP_FILE` | no | yes | no | Concierge (Chatwoot) | optional |
| `LEGACY_INBOUND_URL` | no | yes | no | Concierge (Chatwoot) | optional |
| `FACEBOOK_APP_SECRET` | no | yes | **yes** | Social sign-in (IdP) | optional |
| `GOOGLE_CLIENT_SECRET` | no | yes | **yes** | Social sign-in (IdP) | optional |
| `VITE_APPLE_CLIENT_ID` | yes | no | no | Social sign-in (IdP) | optional |
| `VITE_FACEBOOK_APP_ID` | yes | no | no | Social sign-in (IdP) | optional |
| `VITE_GOOGLE_CLIENT_ID` | yes | no | no | Social sign-in (IdP) | optional |
| `VITE_LINKED_IN_CLIENT_ID` | yes | no | no | Social sign-in (IdP) | optional |
| `VITE_TWITTER_CLIENT_ID` | yes | no | no | Social sign-in (IdP) | optional |
| `NOMINATIM_MIN_INTERVAL_MS` | no | yes | no | Geocoding / Maps | optional |
| `NOMINATIM_TIMEOUT_MS` | no | yes | no | Geocoding / Maps | optional |
| `NOMINATIM_URL` | no | yes | no | Geocoding / Maps | optional |
| `VITE_GOOGLE_MAPS_API_KEY` | yes | no | no | Geocoding / Maps | optional |
| `VITE_MAPBOX_ACCESS_TOKEN` | yes | no | no | Geocoding / Maps | optional |
| `ANTHROPIC_API_KEY` | no | yes | **yes** | Anthropic | optional |
| `ANTHROPIC_LISTING_MODEL` | no | yes | no | Anthropic | optional |
| `RABBITMQ_MARKETPLACE_SUBSCRIBER_HOST` | no | yes | no | RabbitMQ | optional |
| `RABBITMQ_MARKETPLACE_SUBSCRIBER_PASSWORD` | no | yes | **yes** | RabbitMQ | optional |
| `RABBITMQ_MARKETPLACE_SUBSCRIBER_PORT` | no | yes | no | RabbitMQ | optional |
| `RABBITMQ_MARKETPLACE_SUBSCRIBER_USERNAME` | no | yes | no | RabbitMQ | optional |
| `RABBITMQ_MARKETPLACE_SUBSCRIBER_VHOST` | no | yes | no | RabbitMQ | optional |
| `RABBITMQ_MESSAGE_PREFETCH` | no | yes | no | RabbitMQ | optional |
| `INTERCOM_TOKEN` | no | yes | **yes** | Intercom | optional |
| `ICAL_FEED_ALLOWLIST` | no | yes | no | iCal sync | optional |
| `ICAL_FEED_ENABLED` | no | yes | no | iCal sync | optional |
| `ICAL_FEED_SECRET` | no | yes | **yes** | iCal sync | optional |
| `SWIMPLY_RESYNC_ENABLED` | no | yes | no | Swimply import | optional |
| `SWIMPLY_RESYNC_INTERVAL_MS` | no | yes | no | Swimply import | optional |
| `VITE_FACEBOOK_PIXEL_ID` | yes | no | no | Analytics / monitoring | optional |
| `VITE_GOOGLE_ANALYTICS_ID` | yes | no | no | Analytics / monitoring | optional |
| `VITE_PLAUSIBLE_DOMAINS` | yes | no | no | Analytics / monitoring | optional |
| `VITE_SENTRY_DSN` | yes | no | no | Analytics / monitoring | optional |
| `BASIC_AUTH_PASSWORD` | no | yes | **yes** | Server hardening | optional |
| `BASIC_AUTH_USERNAME` | no | yes | **yes** | Server hardening | optional |
| `CSP_REPORT_URL` | no | yes | no | Server hardening | optional |
| `BRANDON_PHONE` | no | yes | no | Staff routing | optional |
| `PRNM_BRANDON_PHONE` | no | yes | no | Staff routing | optional |
| `KEY_ID` | no | yes | no | Found by scripts/check-env-documented.js (2026-09-03) | optional |
| `MARKETPLACE_ID` | no | yes | no | Found by scripts/check-env-documented.js (2026-09-03) | optional |
| `MAX_SOCKETS` | no | yes | no | Found by scripts/check-env-documented.js (2026-09-03) | optional |
| `TOMORROW_IO_API_KEY` | no | yes | **yes** | Found by scripts/check-env-documented.js (2026-09-03) | optional |
| `PRNM_STRICT_ENV` | no | yes | no | Operational flags added 2026-09-03 | optional |
| `SHARETRIBE_INTEG_CLIENT_ID` | no | yes | no | Operational flags added 2026-09-03 | optional |
| `SHARETRIBE_INTEG_CLIENT_SECRET` | no | yes | **yes** | Operational flags added 2026-09-03 | optional |

**127 variables — 31 build-time (public, in the bundle), 22 secret, 15 production-critical.**

## D. Unused / legacy

Documented in the old `.env-template` but read by no code path: the Meta, Bing and Google Ads
credentials, `STRIPE_WEBHOOK_SECRET` (there is no Stripe webhook route in this repository),
and the LinkedIn IdP pair. `.env-template` should be deleted in favour of `.env.example`.
See `INFRASTRUCTURE_SECRET_AUDIT.md`.
