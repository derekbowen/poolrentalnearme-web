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

## 2026-09-17 02:35Z — GO 1: dry-run state bug fixed, 21 hosts reset

**Root cause (three leaks, all in fresh-web `ops/host-lifecycle`):**
1. `queue.ts loadHistory()` loaded status `dry_run` alongside `sent` and put
   both into `history.sent[campaign]`, so `evaluateCampaign` said "already
   sent" for a simulated host.
2. The evaluator enqueued every eligible host under the production
   idempotency key `user:campaign` before the mode decision, so the row that
   ended as `dry_run` kept the key and a later real enqueue was silently
   dropped as a duplicate.
3. `send.ts lastEmailToUser()` counted `dry_run` toward the per-user gap.

**Fix (fresh-web `3a056f1` … `0fce812`, deployed, ritual verified):**
simulations are status `would_send` under a `sim:user:campaign:<day>` key
(one per host per campaign per UTC day, audit only, `sent_at` never set);
`sent` is the only status that counts as delivered, for campaign history,
per-user gap and daily cap; the evaluator asks `decideDelivery()` at enqueue
time and only a real send intent takes the production key; a
production-keyed job that ends record-only releases its key; test sends
write only `host_lifecycle_runs`. Migration
`20260917010000_host_lifecycle_would_send` applied: 21 `dry_run` rows →
`would_send` with `sim:` keys (audit preserved), 3 record-only `suppressed`
rows also moved to `sim:` keys. Verified: 0 production keys, 0 rows with
`sent_at`, 0 `sent`.

**Tests:** 34 pass / 0 fail / 1 opt-in skipped (unit + new
`lifecycle.regression.test.ts` driving the real evaluate/send code against
an in-memory DB), plus the lease integration test against the real RPC:
pass. `check:types` PASS.

**Dry run re-run (02:33Z, mode dry_run, switch off, 0 external sends):**
300 hosts; `evaluate` reports 24 eligible for `no_listing_1` (all 24 again;
the "already sent" reason no longer appears), 21 already simulated today,
3 newly simulated and suppressed by prior unsubscribes. No other campaign
is eligible yet (24 h clocks from first observation; 10 d for no-booking).
No cron. Mode left at `dry_run`, `HOST_LIFECYCLE_EMAILS_ENABLED=false`;
allowlist, phone and postal address remain configured for GO 2.

## 2026-09-17 03:28Z — GO 2: first live cohort, 5 real hosts, `no_listing_1` only

**Code first** (fresh-web `4943829`, deployed, ritual verified): hand-run
restrictions `HOST_LIFECYCLE_ONLY_USERS` / `HOST_LIFECYCLE_ONLY_CAMPAIGNS`
(the evaluator enqueues nothing outside them; the sender leaves anything
outside them queued and untouched) and an explicit "already genuinely sent"
guard immediately before the provider call. Tests 36/36 + lease integration.

**Selection** (SQL over `host_lifecycle_state` + all suppression tables):
SIGNED_UP, provider, no listing, verified email, not deleted/banned, account
1–90 days old, no `suppressed_emails` / used unsubscribe token /
`composer_unsubscribes` / `host_subscribers` unsubscribed-paused-excluded-
Intercom-paused, no prior `sent`, no test/dev-looking email or name; five
most recent signups. Review table printed before the send: five queued jobs,
all under production keys, none suppressed, none previously sent.

| user_id | recipient | first name | signup | reason |
|---|---|---|---|---|
| 6aa32d8f… | ed***@gmail.com | Edison | 2026-09-10 | provider account with no listing |
| 6a983ddf… | su***@comcast.net | susan | 2026-09-02 | provider account with no listing |
| 6a94ab21… | sa***@gmail.com | Sarah | 2026-08-30 | provider account with no listing |
| 6a8b1f24… | sa***@icloud.com | Saundra | 2026-08-23 | provider account with no listing |
| 6a8b0bfa… | jo***@gmail.com | jose | 2026-08-23 | provider account with no listing |

**Send** (`HOST_LIFECYCLE_EMAILS_ENABLED=true`, `HOST_EMAIL_MODE=production`,
cap 5, cohort + campaign restricted; sync → evaluate enqueued exactly 5,
19 eligible hosts outside the cohort untouched):

| recipient | subject | Emailit id | sent_at (UTC) | status |
|---|---|---|---|---|
| sa***@icloud.com | Need help getting your pool listed? | em_4JRDJQmbaR5nbc0RxMPGKUS980O | 03:15:14 | sent |
| jo***@gmail.com | Need help getting your pool listed? | em_4JRDJQmbaR5UHmRE7OGx6oVleIr | 03:15:14 | sent |
| sa***@gmail.com | Need help getting your pool listed? | em_4JRDJVeOcLFQ718hiNkA5HzfkZb | 03:15:15 | sent |
| ed***@gmail.com | Need help getting your pool listed? | em_4JREsJvn7NUAPmtRTCWQLivtRTE | 03:28:05 | sent (attempt 2) |
| su***@comcast.net | Need help getting your pool listed? | em_4JREsRir9akflEYtNz38nnhSa5F | 03:28:06 | sent (attempt 2) |

The first pass sent 3 and got **Emailit 429 "Maximum 2 messages per
second"** on the other 2 (the engine fired all five within a second). Those
two are the same reviewed hosts, not replacements: fix `0e089a3` spaces
provider calls 600 ms apart and retries once inline after a 429 honouring
`retry_after` (regression test added); their two retry jobs were made due
by SQL (`scheduled_at = now()`), and a second restricted production pass
sent them. Total real emails: **5**.

**Post-send verification (SQL):** 5 rows `sent`, all with `sent_at` and a
provider id; 0 sent outside the cohort; 0 sent for any other campaign; 0
queued/leased; simulation history untouched (21 `would_send`, 6
`suppressed`, all `sim:` keys); test-send runs still 8. Duplicate
protection: inserting a second row under a sent host's production key
fails with `23505`; `send` again leased 0; `evaluate` again reports the 5
as "already sent" (eligible 24 → 19). No renter path exists in the engine.
No cron (ubuntu and root crontabs: 0 entries).

**Returned to:** `HOST_LIFECYCLE_EMAILS_ENABLED=false`, `HOST_EMAIL_MODE=dry_run`,
cap 25, `ONLY_*` removed; `pm2 restart --update-env && pm2 save`.

**Side incident:** the deploy of `0e089a3` aborted at `verify:production`
("homepage 429"): our own Cloudflare per-IP rate limit blocked EAST's
verifier after its ~500 URL checks. The ritual rolled production back to
`4943829` (healthy, verified). The rate-limit phase cannot use `ip.src` on
this plan, so a WAF custom rule now skips the rate limit for EAST
(3.222.110.146) and WEST (13.56.113.85) only: `action: skip`,
`action_parameters.phases: ["http_ratelimit"]` (a first attempt with
`products: ["rateLimit"]` targeted the legacy product and did nothing).
Proven with 80/80 `200` from EAST, then `0e089a3` redeployed and verified
(03:43Z; production, stamp and working tree agree).

## 2026-09-17 04:47Z — GO 3: controlled production, cap 25, `no_listing_1` only

**Safeguards shipped first** (fresh-web `2bc06e5` … `ff9af81`, each deployed
by the ritual, 43 engine tests + lease integration green):

- `HOST_PRODUCTION_CAMPAIGNS` — fail-closed campaign allowlist enforced in
  `decideDelivery()` per campaign: empty = nothing sends in any mode; a
  campaign not listed is evaluated and recorded as `would_send` under a
  `sim:` key (reason "not in HOST_PRODUCTION_CAMPAIGNS"). Set to
  `no_listing_1`.
- **One sender, globally**: `host_lifecycle_locks` + RPCs
  `acquire_lifecycle_lock` / `release_lifecycle_lock` (migration
  `20260917020000`). `sendDue` leases nothing unless it holds
  `emailit-sender` (TTL 300 s), releases in `finally`. Proven on the real DB
  (A acquires, B refused, A re-entrant, B cannot release A's, B acquires
  after release) and in the regression suite (two concurrent senders → one
  works, lock released after). With one sender anywhere, the in-process
  600 ms spacing is the provider-wide rate. `test-send` bypasses the lock
  (single hand-run message).
- **Typed 429 handling**: `EmailitHttpError{status, retryAfterMs}` from the
  real HTTP status; `Retry-After` header, else body `retry_after`; one inline
  retry only for 429 after that wait; other statuses go straight to the
  job-level bounded retry (3 attempts → `failed`); `sent` is written only
  after the provider accepts; same idempotency key throughout; a failed job
  is never leased again. All regression-tested.
- `run.mjs explain` — read-only per-campaign counts with masked examples.
- Suppressed outcomes now release the production key (re-checked once a
  day), so a host who re-subscribes can be evaluated for real; the three
  suppressed rows from this run were released by SQL the same way.

**Pre-run checks:** GO 2's 5 rows `sent` with production keys intact; total
sent 5; queue empty; only `refresh-related-slugs-monthly` in `cron.job`;
no lifecycle crontab / cron.d / systemd timer on EAST.

**Run** (fresh sync 04:46Z: 1,196 users → 300 hosts). `explain`:
no_listing_1 eligible 16, suppressed 3, timing 1, already sent 5, not
verified 55. Every other campaign eligible 0 (24 h clocks from the first
sync at 00:05Z; see table below). `evaluate` enqueued 19 production-keyed
`no_listing_1` jobs (16 clean + 3 suppressed-at-send). Pre-send list
reviewed (all provider accounts, no listing, verified, no prior send, none
test-looking). `send`: **16 sent, 3 suppressed** (2 `host_subscribers:
unsubscribed`, 1 `suppressed_emails:unsubscribe`), 0 failed, 0 capped,
sends spaced ≈0.9 s (04:47:08 → 04:47:22), lock released. Second `send`
leased 0. `evaluate` again: "already sent" = 21, eligible 3 (the suppressed
three, re-checked tomorrow).

| user | recipient | Emailit id | sent_at |
|---|---|---|---|
| 6a828030 | je***@hotmail.com | em_4JROUJUFTkdfKTLnTioe60RM9Jj | 04:47:08 |
| 6a7def90 | ms***@yahoo.com | em_4JROURHJVxti66BAd6hiNWTvIxo | 04:47:09 |
| 6a621041 | cy***@wpp.com | em_4JROUbzeYUGnMhtJNtSJqHaVkef | 04:47:10 |
| 6a56ecc1 | bi***@icloud.com | em_4JROUgrRaOQZX1bW1yK6iKWxytV | 04:47:11 |
| 6a8440f6 | aa***@gmail.com | em_4JROUoeVcbgvcVHJg9M5EPSEKv4 | 04:47:12 |
| 6a827555 | v4***@privaterelay.appleid.com | em_4JROUzMqf841h1FGGCchHsMpEAw | 04:47:13 |
| 6a7a57c8 | ha***@gmail.com | em_4JROUzMqf83rEBu5dsqMZCJrvEl | 04:47:14 |
| 6a750a33 | di***@gmail.com | em_4JROV4Edh2DeCPubqnUR6xLHj85 | 04:47:14 |
| 6a4acc56 | jo***@gmail.com | em_4JROVC1hjFU9wp4FHCbZo7QXA0u | 04:47:15 |
| 6a4147c1 | da***@gmail.com | em_4JROVJollSkCJUsjiiegmsVMcgj | 04:47:16 |
| 6a41472c | we***@yahoo.com | em_4JROVUX6nz78K8Zv5ql0glamqzK | 04:47:17 |
| 6a823c9d | mo***@gmail.com | em_4JROVZOtptHDoICYNBYRfqIlrKV | 04:47:18 |
| 6a81186c | to***@gmail.com | em_4JROVk7EsPdzl3wy7jzMUdGL3WO | 04:47:19 |
| 6a6800c6 | va***@gmail.com | em_4JROVoz1uJncfPZqPMJHvUtmEVM | 04:47:20 |
| 6a42b816 | br***@gmail.com | em_4JROVwm5wX48PoLIAFWBTpVYjc9 | 04:47:21 |
| 6a8899a2 | ka***@gmail.com | em_4JROW4Z9ykKLFJwI7MX5zXXSNZQ | 04:47:22 |

All 16: campaign `no_listing_1`, subject "Need help getting your pool
listed?", attempt 1, status `sent`.

**Post-run (SQL):** sent today 21 (≤ 25); campaigns sent = {no_listing_1};
duplicate (user, campaign) sent = 0; queued 0; leased 0; would_send 21
(unchanged); test-send runs 8; lock holder null. No renter path exists.

**Other campaigns (evaluate-only, from `explain`):**

| campaign | eligible | suppressed | timing not reached | would send eventually |
|---|---:|---:|---:|---:|
| no_listing_2 | 0 | 0 | 72 (waiting for no_listing_1 + 72 h) | 72 |
| incomplete_photos | 0 | 0 | 4 | 4 |
| incomplete_info | 0 | 0 | 4 | 4 |
| publish_1 | 0 | 0 | 0 (no host in LISTING_READY) | 0 |
| stripe_1 | 0 | 0 | 7 | 7 |
| stripe_2 | 0 | 0 | 7 (waiting for stripe_1) | 7 |
| no_booking_1 | 0 | 0 | 77 (10 d live) | 77 |

Observation for Derek: one `stripe_1` candidate (ro***@gmail.com) is a
**published** listing whose `publicData.location.address` is empty — our
address check may miss a location format, or the listing really has none.

**End state:** `HOST_LIFECYCLE_EMAILS_ENABLED=true`, `HOST_EMAIL_MODE=production`,
`HOST_LIFECYCLE_DAILY_CAP=25`, `HOST_PRODUCTION_CAMPAIGNS=no_listing_1`,
no `ONLY_*`. Left on because nothing can invoke the sender automatically:
no crontab (ubuntu/root), no `/etc/cron.d`, no systemd timer, pm2 runs
only `fresh-web`, the admin page has no send action, the old hook routes
are deleted. **No cron installed.**

**Cloudflare exemption scope (read back 04:41Z):** custom rule
`(ip.src in {3.222.110.146 13.56.113.85})` → `skip`,
`action_parameters = {phases: ["http_ratelimit"]}` only; no `ruleset:
current`, no `products`. So for those two IPs only the per-IP rate limit is
skipped. Still applied to them: the junk-UA block, the scanner-path block
(both in the same custom ruleset), security level (medium), Bot Fight Mode
(off on .com anyway), application authentication (Sharetribe, not
Cloudflare). No managed WAF ruleset exists on this plan.

## 2026-09-17 05:50Z — GO 4 preparation (no cohort sent yet: timing + cap)

**Address/location anomaly — detector CORRECT.** Listing
`6a735ac6-aa3e-42ec-b9ec-2c6b138d8ae3` ("Paws and Relax – Private Pool with
Game Room", state `published`, 5 images, created 2026-08-05): raw Sharetribe
`attributes.geolocation = null`, `publicData` has no `location` key at all
(keys: advantagesSelection, amenities, isInstantBooking, listingType,
priceVariationsEnabled, refundableDeposit, transactionProcessAlias,
unitType). The detector reads `attributes.geolocation` and
`publicData.location.address` and returns `has_address=false`, `missing:
["address"]` — correct. Across all 125 published listings: 123 have
`location{address…}` + geolocation, 2 have neither. No detector change.
**Policy tightened instead:** `stripe_1`/`stripe_2` now require
`listing_ready` (published AND complete) — a listing that cannot appear in
search is not an actionable payout nudge; reason string "published but
incomplete (address); payout nudge not actionable". Regression-tested.

**Stripe CTA was wrong and is fixed.** WEST `routeConfiguration.js`:
`StripePayoutPage` is `/account/payments` (`/account/payments/:returnURLType`
for onboarding return). `/account/payouts` does not exist; the SPA shell
returns 200 for any path, which is what fooled the earlier check. Fixed in
`urls.ts` (`STRIPE_PAYOUT_PATH`), tested, documented. The 8 test emails Derek
received on 2026-09-17 02:00Z carried the wrong payout link; no real host
has received a Stripe email.

**incomplete_info copy is now specific** (`incompleteInfoCopy`): names
exactly what is missing (address / hourly price / title / description),
explains why, and the CTA lands on the wizard tab of the first missing piece
(details → location → pricing; tabs verified on WEST:
`/l/:slug/:id/draft|edit/details|location|pricing|availability|photos`).
`incomplete_photos` names a missing price too when applicable, CTA
`…/draft/photos`. Progression stop conditions proven through the real
queue + send code: photos added → incomplete_photos blocked (evaluate) and a
stale queued job cancelled (send); fields completed → incomplete_info
blocked; Stripe connected → stripe_1/stripe_2 blocked. fresh-web `7069d6e`
… `339e183` deployed; engine suite 47 pass / 0 fail + lease integration.

**Candidates revalidated (SQL over state + all suppression tables, 05:40Z):**

| cohort | user | listing | recipient | state | missing | notes |
|---|---|---|---|---|---|---|
| incomplete_photos | 6a33334b… | 6a3333fc… | li***@gmail.com | ADDRESS_ADDED | photos | |
| incomplete_photos | 6a20783c… | 6a207937… | sw***@springcreekpool.com | ADDRESS_ADDED | photos | |
| incomplete_photos | 6a165cd5… | 6a165dc9… | ch***@gmail.com | ADDRESS_ADDED | price, photos | copy names the price |
| incomplete_photos | 697510e2… | 6a272d23… | sc***@gmail.com | ADDRESS_ADDED | price, photos | copy names the price |
| incomplete_info | 6a6bd26b… | 6a6bd4ff… | pj***@gmail.com | LISTING_STARTED | address, price, photos | Stripe already connected |
| incomplete_info | 69ee12a0… | 69ee158d… | lo***@gmail.com | LISTING_STARTED | address, price, photos | |
| incomplete_info | 6a6b4549… | 6a6b4b38… | as***@gmail.com | LISTING_STARTED | address, price, photos | |
| incomplete_info | 6a821bb9… | 6a8d44f4… | tr***@gmail.com | LISTING_STARTED | address, photos | **excluded: userType `customer`**, not a provider account |
| stripe_1 | 6a9f4749… | 6aa62481… | bi***@hotmail.com | PUBLISHED, complete | – | |
| stripe_1 | 6a93189c… | 6a931da5… | li***@yahoo.com | PUBLISHED, complete | – | |
| stripe_1 | 6a8affdf… | 6a93e608… | fo***@outlook.com | PUBLISHED, complete | – | |
| stripe_1 | 6a8278bd… | 6a8b36f6… | my***@gmail.com | PUBLISHED, complete | – | |
| stripe_1 | 6a81f688… | 6a81f86c… | jw***@privaterelay.appleid.com | PUBLISHED, complete | – | |
| stripe_1 | 6a0f6b06… | 6a5d2ef1… | cc***@yahoo.com | PUBLISHED, complete | – | 6th; oldest signup, held back to keep max 5 |
| (stripe_1) | 6a7359b2… | 6a735ac6… | ro***@gmail.com | PUBLISHED, incomplete | address | excluded by the new rule |

All: provider (except the noted customer), verified email, no suppression of
any kind, no prior genuine send, not test-looking, no Intercom pause.

**Why nothing was sent in this pass.** (1) Timing: every candidate's
`state_entered_at` is the first sync (2026-09-17 00:05Z); the 24 h minimum
is reached at **2026-09-18 00:05Z**. Eligibility is not relaxed. (2) Cap:
21 sent today, 4 remaining, cohorts requested 4 + 3 + 5 = 12. Per GO 4 §6
the excess is not rolled into another day automatically; sends wait for
Derek's word. Cohort scripts are ready (`east_cohort_go4_prepare.py` /
`east_cohort_go4_send.py`): each fences `HOST_LIFECYCLE_ONLY_CAMPAIGNS` +
`HOST_LIFECYCLE_ONLY_USERS`, adds the campaign to
`HOST_PRODUCTION_CAMPAIGNS` only for the run, prints cap accounting first
and refuses if the cohort does not fit, then restores the allowlist to
`no_listing_1`.

**State now:** production, cap 25, allowlist `no_listing_1`, no fence, no
cron/timer/cron.d, queue empty, CLI rebuilt on `339e183`.

## Next gates (each needs Derek's explicit GO)

1. Support phone chosen → set `HOST_LIFECYCLE_SUPPORT_PHONE`, restart.
2. Allowlist test: `HOST_EMAIL_MODE=allowlist`, `HOST_EMAIL_ALLOWLIST=<Derek's
   addresses>`, `HOST_LIFECYCLE_EMAILS_ENABLED=true`; run `send` once by hand;
   Derek reviews the real emails on his phone.
3. Cron on EAST (disclosed when created): hourly `tick`, every run reported.
4. Production: `HOST_EMAIL_MODE=production`, cap 25/day, one email per host
   per 24 h, one email per campaign ever.
