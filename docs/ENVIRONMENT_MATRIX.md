# Environment matrix

Where each variable is expected to exist. `PRESENT` / `MISSING` / `UNKNOWN` / `N/A` only —
never a value.

Only the **Local** column is verified: it is the environment this audit ran in. Every other
column is `UNKNOWN` and will stay that way until there is one secret store that can be
queried. That unverifiability is itself the finding.

| Variable | Local | Dev | Staging | Production | GitHub Actions | AWS | Cloudflare | Supabase | Other |
|---|---|---|---|---|---|---|---|---|---|
| `STRIPE_IDENTITY_RENTAL_FLOW_ID` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `STRIPE_SECRET_KEY` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `STRIPE_WEBHOOK_SECRET` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | stale — remove |
| `VITE_STRIPE_PUBLISHABLE_KEY` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `SHARETRIBE_INTEGRATION_CLIENT_ID` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | stale — remove |
| `SHARETRIBE_INTEGRATION_CLIENT_SECRET` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | stale — remove |
| `SHARETRIBE_INTEGRATION_SDK_CLIENT_ID` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A | EAST uses SHARETRIBE_INTEG_* |
| `SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A | EAST uses SHARETRIBE_INTEG_* |
| `SHARETRIBE_SDK_CLIENT_SECRET` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `VITE_SHARETRIBE_SDK_ASSET_CDN_BASE_URL` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `VITE_SHARETRIBE_SDK_BASE_URL` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `VITE_SHARETRIBE_SDK_CLIENT_ID` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `VITE_SHARETRIBE_SDK_LOGIN_AS_BASE_URL` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `VITE_SHARETRIBE_SDK_TRANSIT_VERBOSE` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `VITE_SHARETRIBE_USING_SSL` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `SUPABASE_SERVICE_ROLE_KEY` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | UNKNOWN |  |
| `SUPABASE_URL` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | UNKNOWN |  |
| `BLAST_DRY_RUN` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `BLAST_THROTTLE_MS` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `CAMPAIGN_FORWARD_TO` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `FOUNDER_WELCOME_BODY` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `FOUNDER_WELCOME_DELAY_MS` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `FOUNDER_WELCOME_ENABLED` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `FOUNDER_WELCOME_MAX_AGE_MS` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `FOUNDER_WELCOME_QUIET_END` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `FOUNDER_WELCOME_QUIET_START` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `FOUNDER_WELCOME_SWEEP_MS` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `FOUNDER_WELCOME_TABLE` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `FOUNDER_WELCOME_USERTYPE` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `ONBOARD_NUDGE_ENABLED` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `PAYOUT_SMS_ENABLED` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `REPLY_TO_ACCEPT_ENABLED` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `SMS_ALARM_PHONE` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `SMS_ALLOWLIST` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `SMS_NOTIFICATIONS_ENABLED` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `SMS_POLL_INTERVAL_MS` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `TWILIO_ACCOUNT_SID` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `TWILIO_AUTH_TOKEN` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `TWILIO_INBOUND_URL` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `TWILIO_MESSAGING_SERVICE_SID` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `TWILIO_PHONE_NUMBER` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `TWILIO_VALIDATE_SIGNATURE` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `WEEKLY_DRY` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `AWS_ACCOUNT_ID` | MISSING | UNKNOWN | N/A | UNKNOWN | UNKNOWN | UNKNOWN | N/A | N/A |  |
| `AWS_ECR_REGION` | MISSING | UNKNOWN | N/A | UNKNOWN | UNKNOWN | UNKNOWN | N/A | N/A |  |
| `AWS_ECR_REPO_URL` | MISSING | UNKNOWN | N/A | UNKNOWN | UNKNOWN | UNKNOWN | N/A | N/A |  |
| `AWS_ENV_USER_ACCESS_KEY_ID` | MISSING | UNKNOWN | N/A | UNKNOWN | UNKNOWN | UNKNOWN | N/A | N/A |  |
| `AWS_ENV_USER_REGION` | MISSING | UNKNOWN | N/A | UNKNOWN | UNKNOWN | UNKNOWN | N/A | N/A |  |
| `AWS_ENV_USER_SECRET_ACCESS_KEY` | MISSING | UNKNOWN | N/A | UNKNOWN | UNKNOWN | UNKNOWN | N/A | N/A |  |
| `AWS_INSTANCE_URL` | MISSING | UNKNOWN | N/A | UNKNOWN | UNKNOWN | UNKNOWN | N/A | N/A |  |
| `AWS_INSTANCE_URLS` | MISSING | UNKNOWN | N/A | UNKNOWN | UNKNOWN | UNKNOWN | N/A | N/A |  |
| `AWS_JH_ENV_SECRET_NAME` | MISSING | UNKNOWN | N/A | UNKNOWN | UNKNOWN | UNKNOWN | N/A | N/A |  |
| `AWS_PRIVATE_KEY_PATH` | MISSING | UNKNOWN | N/A | UNKNOWN | UNKNOWN | UNKNOWN | N/A | N/A |  |
| `ENCRYPTED_JWT_PRIVATE_KEY` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `RSA_PRIVATE_KEY` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `RSA_PUBLIC_KEY` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `VITE_ENCRYPTED_JWT_PUBLIC_KEY` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `ANDROID_APP_PACKAGE_NAME` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `ANDROID_APP_SHA_256_FINGERPRINT` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `APPLE_BUNDLE_ID` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `APPLE_TEAM_ID` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `AUTH_TOKEN` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `BASE` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `CURRENT_AWS_INSTANCE_URL` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `MARKETPLACE_ROOT_URL` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | stale — remove |
| `NODE_ENV` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `OTP_TIME_STEP` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `PORT` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `PREVENT_DATA_LOADING_IN_SSR` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `PROFILE_SCHEMA_BASE_URL` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `REACT_APP_ENV` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | stale — remove |
| `REACT_APP_MARKETPLACE_ROOT_URL` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | stale — remove |
| `SERVER_SHARETRIBE_CONSOLE_URL` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `SERVER_SHARETRIBE_TRUST_PROXY` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `SITEMAP_DISABLED` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `VITE_CSP` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `VITE_DEV_API_SERVER_PORT` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `VITE_ENV` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `VITE_HERO_BACKGROUND_VIDEO_URL` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `VITE_HOST_PREVIEW_OPERATOR_IDS` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `VITE_INTERCOM_APP_ID` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `VITE_JH_WISHLIST_FEATURE_ENABLE_BOOKMARK_OWN_LISTING` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `VITE_JH_WISHLIST_FEATURE_ENABLE_USER_NAV_ITEM` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `VITE_LEGACY_BROWSER_SUPPORT` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | stale — remove |
| `VITE_MARKETPLACE_NAME` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `VITE_MARKETPLACE_ROOT_URL` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `VITE_OTP_WINDOW` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `VITE_PORT` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `CONCIERGE_INBOUND_URL` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `CONCIERGE_PAUSE_FILE` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `CONCIERGE_STOP_FILE` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `LEGACY_INBOUND_URL` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `FACEBOOK_APP_SECRET` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `GOOGLE_CLIENT_SECRET` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `LINKED_IN_CLIENT_SECRET` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | stale — remove |
| `LINKED_IN_IDP_ID` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | stale — remove |
| `VITE_APPLE_CLIENT_ID` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `VITE_FACEBOOK_APP_ID` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `VITE_GOOGLE_CLIENT_ID` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `VITE_LINKED_IN_CLIENT_ID` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `VITE_TWITTER_CLIENT_ID` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `NOMINATIM_MIN_INTERVAL_MS` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `NOMINATIM_TIMEOUT_MS` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `NOMINATIM_URL` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `VITE_GOOGLE_MAPS_API_KEY` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `VITE_MAPBOX_ACCESS_TOKEN` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `ANTHROPIC_API_KEY` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `ANTHROPIC_LISTING_MODEL` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `RABBITMQ_MARKETPLACE_SUBSCRIBER_HOST` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `RABBITMQ_MARKETPLACE_SUBSCRIBER_PASSWORD` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `RABBITMQ_MARKETPLACE_SUBSCRIBER_PORT` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `RABBITMQ_MARKETPLACE_SUBSCRIBER_USERNAME` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `RABBITMQ_MARKETPLACE_SUBSCRIBER_VHOST` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `RABBITMQ_MESSAGE_PREFETCH` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `INTERCOM_TOKEN` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `ICAL_FEED_ALLOWLIST` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `ICAL_FEED_ENABLED` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `ICAL_FEED_SECRET` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `SWIMPLY_RESYNC_ENABLED` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `SWIMPLY_RESYNC_INTERVAL_MS` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `VITE_FACEBOOK_PIXEL_ID` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `VITE_GOOGLE_ANALYTICS_ID` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `VITE_PLAUSIBLE_DOMAINS` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `VITE_SENTRY_DSN` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `BASIC_AUTH_PASSWORD` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `BASIC_AUTH_USERNAME` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `CSP_REPORT_URL` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `BRANDON_PHONE` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `PRNM_BRANDON_PHONE` | MISSING | UNKNOWN | N/A | UNKNOWN | N/A | N/A | N/A | N/A |  |
| `TOMORROW_IO_API_KEY` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | stale — remove |
| `BING_ACCOUNT_ID` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | stale — remove |
| `BING_CUSTOMER_ID` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | stale — remove |
| `BING_DEVELOPER_TOKEN` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | stale — remove |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | stale — remove |
| `GOOGLE_ADS_MCC_ID` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | stale — remove |
| `GOOGLE_ADS_REFRESH_TOKEN` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | stale — remove |
| `META_ACCESS_TOKEN` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | stale — remove |
| `META_AD_ACCOUNT_ID` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | stale — remove |
| `META_APP_SECRET` | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | stale — remove |

Notes:

- **Staging does not exist.** `.turtleci/development.yml` and `production.yml` are the only
  two environments ever declared, and neither runs (see the audit's CRITICAL section).
- **Cloudflare: N/A everywhere.** No Cloudflare reference exists anywhere in this repository —
  no `wrangler.toml`, no Workers, no `CLOUDFLARE_*` variable. DNS is Hostinger per CLAUDE.md.
- **Supabase** holds its own service-role key; the marketplace reads it from container env.
- `VITE_*` are **build-time**: baked into the client bundle at `vite build`. Setting one only
  in the container does nothing. This already caused an aborted release (c158,
  `VITE_SHARETRIBE_USING_SSL`).
