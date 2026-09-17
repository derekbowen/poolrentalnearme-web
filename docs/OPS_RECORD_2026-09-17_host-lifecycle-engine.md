# Ops record — 2026-09-17 — host lifecycle email engine (sending OFF)

Follows `docs/AUDIT_2026-09-16_outbound-comms.md`. Authorised scope: retire the
Lovable-era email automation, build the replacement host lifecycle engine, deploy
it with sending disabled, dry-run over production data. **Not authorised, not
done:** any real host, renter or outreach email; reactivating legacy drip jobs;
turning production sending on.

**PRODUCTION HOST EMAILS SENT: 0.** Kill switch `HOST_LIFECYCLE_EMAILS_ENABLED=false`,
`HOST_EMAIL_MODE=dry_run`, no cron installed.

## What shipped

fresh-web `ops/deploy-sha-enforcement`, deployed SHA `3cd0a68` (verified
2026-09-17T00:01:41Z by `ops/deploy-east.sh`; production stamp, build stamp,
`.deployed-sha` and working tree all agree; drift check PASS).

- Retired and archived: host drip, renter drip, auto-outreach, SMS blast,
  email-queue, content-batch workers, their 7 hook routes, 7 admin pages, 3
  orphan renter templates, the Edge Function source, and the Lovable SMS
  gateway call (`sendSms()` now refuses). Templates kept under
  `docs/archive/outbound-comms-legacy/templates/` with a README explaining
  each retirement. Their 8 `cron.job` rows were deleted (migration
  `20260917000000_host_lifecycle_engine_and_retire_lovable_workers`); only
  job 6 `refresh-related-slugs-monthly` remains.
- New engine: `ops/host-lifecycle/` (CLI) + `src/lib/host-lifecycle/` (state
  machine, 8 campaigns, templates, URLs), tables `host_lifecycle_state`,
  `communication_jobs`, `host_lifecycle_runs`, RPC `lease_communication_jobs`
  (`FOR UPDATE SKIP LOCKED`). Operator doc: fresh-web `docs/HOST_LIFECYCLE.md`.
- Admin: `/admin/host-lifecycle` (read-only overview + template preview; no
  send button; unauthenticated → 307 to sign-in). Old drip nav entries removed.
- Tests on EAST: 27 unit pass (1 opt-in skipped), lease integration test
  against the real RPC pass (two concurrent workers → one lease; duplicate
  idempotency key rejected). `check:types` PASS.

## Dry-run over production data (2026-09-17 00:05Z)

Sync: 1,196 Sharetribe users → 300 hosts, 199 listings, 87 booking-bearing
transactions.

| state | hosts | email verified |
|---|---|---|
| SIGNED_UP (provider, no listing) | 127 | 72 |
| STRIPE_CONNECTED (live, Stripe, no booking yet) | 84 | 77 |
| CLOSED | 31 | 21 |
| PUBLISHED (no Stripe) | 17 | 7 |
| ACTIVE_HOST | 12 | 12 |
| ADDRESS_ADDED (draft, no photos) | 12 | 4 |
| FIRST_BOOKING | 10 | 9 |
| LISTING_STARTED | 7 | 4 |

Evaluate: 24 eligible, all `no_listing_1` (provider account, no listing,
verified email, account 1–90 days old). Send (dry_run, two passes): 24 leased,
**21 recorded as `dry_run` with rendered HTML, 3 suppressed** (2 from
`host_subscribers.unsubscribed`, 1 from `suppressed_emails` unsubscribe),
0 sent, 0 failed. Every dry-run row carries
`suppressed_reason = "kill switch: HOST_LIFECYCLE_EMAILS_ENABLED is not true"`.

Why nothing else fired yet: every non-`no_listing` campaign anchors on
`state_entered_at`, which was first observed at this sync, so the 24-hour
minimum (10 days for `no_booking_1`) starts now. Expected once the clocks run,
before suppression: `incomplete_photos` ≤ 4, `incomplete_info` ≤ 4,
`stripe_1` ≤ 7, `no_booking_1` ≤ 77 (spread by the 25/day cap). 47 provider
accounts with no listing are older than 90 days and are skipped as dormant.

## Environment (EAST `.env`, mode 600)

```
HOST_LIFECYCLE_EMAILS_ENABLED=false
HOST_EMAIL_MODE=dry_run
HOST_LIFECYCLE_DAILY_CAP=25
```

`HOST_LIFECYCLE_SUPPORT_PHONE` is **unset on purpose**: three candidate numbers
exist in the codebase (888-940-4247 site footer / JSON-LD, +1 855-617-8207
homepage "Text Derek", 909-272-8096 Derek's own number used by the WEST
watchdogs). Until Derek picks one, every template renders
`{{DEREK_SUPPORT_PHONE}}`, `productionReady=false`, and the send path blocks.

## Incidents / notes

- I launched `ops/deploy-east.sh` twice within ~2 minutes (a re-run of my
  env script to print the env lines also re-started the ritual). The ritual
  is serialised by its own gates and the end state is verified (one SHA,
  drift PASS, 0 5xx in smoke), but the second launch overwrote the first log.
  Lesson recorded: probe scripts must never share a file with action scripts.
- The engine's Supabase client on Node 20 needs an explicit no-realtime
  transport (supabase-js ≥ 2.108 resolves a WebSocket at construction);
  `ops/host-lifecycle/src/db.ts` `NoRealtimeTransport`.
- `pm2 env 0` does not list the HOST_* vars: fresh-web loads them through
  `node --env-file=.env`, which does not override an existing process env, so
  the file is the source of truth for both the app and the CLI.

## 2026-09-17 02:00Z — Derek's GO: allowlist test

Derek supplied the support phone (909-272-8096) and postal address
(7785 Halbrook Terrace, Riverside, CA 92509) and said GO. Done:

- fresh-web `f2e5c99` deployed (ritual verified, drift PASS): adds
  `run.mjs test-send <template> <to>`, allowed only in allowlist mode, only to
  an allowlisted address, only with the switch on and the phone set; every
  call recorded in `host_lifecycle_runs` (phase `test-send`). 28/28 unit tests.
- EAST `.env`: `HOST_LIFECYCLE_EMAILS_ENABLED=true`, `HOST_EMAIL_MODE=allowlist`,
  `HOST_EMAIL_ALLOWLIST=derekcbowen@outlook.com` (Derek's session identity;
  no other address was given), phone + postal address set, cap 25.
  `pm2 restart --update-env` + `pm2 save` done. **No cron installed.**
- **8 emails sent, all to derekcbowen@outlook.com, subjects prefixed
  `[TEST]`**, Emailit ids `em_4JR56jJ7…` (no_listing_1), `em_4JR56oAu…`
  (no_listing_2), `em_4JR56vxy…` (incomplete_photos), `em_4JR573l2…`
  (incomplete_info), `em_4JR576gJ…` (publish_1), `em_4JR57BY6…` (stripe_1),
  `em_4JR57MGR…` (stripe_2), `em_4JR57R8E…` (no_booking_1).
- Guard proven: a non-allowlisted address is refused before any provider call.
- Real hosts: 0 emails. In allowlist mode every non-allowlisted recipient is
  recorded as `dry_run`.

Open decision before production: the 21 `dry_run` rows from the first run
count as "already sent" for their campaign, so those hosts would never get
`no_listing_1`. Reset them (mark `cancelled`) at production GO, or leave them.

## Next gates (each needs Derek's explicit GO)

1. Support phone chosen → set `HOST_LIFECYCLE_SUPPORT_PHONE`, restart.
2. Allowlist test: `HOST_EMAIL_MODE=allowlist`, `HOST_EMAIL_ALLOWLIST=<Derek's
   addresses>`, `HOST_LIFECYCLE_EMAILS_ENABLED=true`; run `send` once by hand;
   Derek reviews the real emails on his phone.
3. Cron on EAST (disclosed when created): hourly `tick`, every run reported.
4. Production: `HOST_EMAIL_MODE=production`, cap 25/day, one email per host
   per 24 h, one email per campaign ever.
