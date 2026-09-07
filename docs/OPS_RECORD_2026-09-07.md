# Ops record — 2026-09-07

Executed from a Claude Code session after a read-only survey of WEST and EAST and
Derek's written approval with constraints. Every batch ran in isolation with
pre/post evidence and a scripted rollback; one batch (D) auto-rolled-back once on a
probe bug and was re-run. No secret value was printed at any point; secrets were
compared by SHA-256 fingerprint only.

## P0

**Exposed OpenAI key.** A names-only listing of `/home/ubuntu/.env.bak-keyfix-1785452821`
on EAST printed a bare key line (no `NAME=` prefix) into the session transcript.
Findings, by fingerprint (sha256 first 16: `129cd806125e9170`):

- It is the **same key** as `OPENAI_API_KEY` in `/home/ubuntu/fresh-web/.env`, and it was
  still valid (`GET /v1/models` → 200).
- Copies on EAST: the backup file, the live `.env`, `/home/ubuntu/.bash_history`
  (mode 600), and the SSM agent log (root-only) which captured the earlier command output.
  Not in `dump.pm2`, pm2 logs, or any built bundle. None on WEST by pattern scan.
- **Nothing on EAST reads it**: zero references to `OPENAI_API_KEY` in `dist/server`,
  `serve.mjs`, `gen_pages.mjs` or `src`. Revoking it breaks nothing.
- Rotation could not be done from the boxes: there is no OpenAI admin credential
  anywhere on them, and key management is dashboard-only. **Derek: revoke the key in the
  OpenAI dashboard.** No replacement is needed unless something off-box uses it.
- Containment done: the backup file is now `root:root 600`.

**Stuck payouts** (read-only Integration API query inside the production container, no SMS):

| tx | process | booking end | payin / payout | listing / provider | customer | notes |
|---|---|---|---|---|---|---|
| `69f6fae7-6c6a-4493-afaf-adb0039d9ba0` | default-booking v7, last `transition/operator-accept` 2026-05-03 | 2026-05-04 03:00Z | $22 / $18 | "Bxbrim Pool" (**closed**) / bxbrim | Jaydin rowe | line items: 1 hr $20, provider commission −$2, customer commission $2. Booking state `accepted`. The scheduled `transition/complete` never fired. This is the "1 stuck" the watchdog texts daily. |
| `6a6adeb8-58d1-4989-8a09-251afeaecab1` | default-booking v9, `transition/operator-accept` 2026-07-30 | 2026-08-08 01:00Z | $289 / $280 | listing and provider records return null (deleted) | Billie | the known $289 chargeback the watchdog deliberately skips |

Three further accepted bookings are upcoming (ends 2026-09-13, 2026-09-19, 2026-11-02) and
are not stuck. Completing `69f6fae7` is a Console action for Derek.

## Batch A — EAST runtime credentials persisted

Finding that changed the plan: the running `fresh-web` process holds the Supabase project
`qbzpjsiahqgyoazjurqy` (the same content DB WEST uses; 6,712 `content_pages`), while
`.env` pointed at `ptfjspcphskifoseidut`, which does not respond at all. Node gives the
process environment precedence over `--env-file`, so the site only worked because pm2
had kept the June values in memory; a reboot or `pm2 restart --update-env` would have put
the marketing site on a dead database.

Done: `.env` rewritten from the live process (12 names: six Supabase values corrected,
`PORT`, `SUPABASE_SERVICE_ROLE_KEY`, `EMAILIT_API_KEY`, `SHARETRIBE_CLIENT_ID`,
`SHARETRIBE_INTEG_CLIENT_ID`, `SHARETRIBE_INTEG_CLIENT_SECRET` added), `pm2 save`, both
files mode 600. Parity proven: `node --env-file=.env` in a clean environment yields the same
SHA-256 for all 12 names as the live process. Backups: `/root/east-backups/` (root, 600).
fresh-web was **not** restarted.

Follow-up: the Sep 2 build inlined the dead `ptfj…` URL as a string in the bundles (9 hits
in `dist/server`, 2 in `dist/client`); the next `vite build` will inline the corrected value.

## Batch B — funnel analytics

`/home/ubuntu/analytics/reports` and `listing-city.json` were root-owned; the cron runs as
ubuntu, so every daily write since 2026-07-19 failed (57 errors) and the Monday email
step, which runs after the write, never executed. `chown ubuntu:ubuntu` both; validation
run as ubuntu wrote `reports/2026-09-07.md`, exit 0.

## Batch C — cta.js (a WEST change)

`/tools/cta.js` is served by **WEST** nginx from `/var/www/prnm-tools/`, not by EAST.
Deployed the repo copy (`ops/east/tools/cta.js`, sha256 `02366c84…8037`) over the live
file (previous sha256 `fd410e49…00d2`, kept as `cta.js.bak-20260907T070047Z`).
`node --check` passed; public file hashes to the repo file; "Hartford" count 0 on disk,
via nginx, and publicly; `/p/hosting` still injects the tag; executing the public file in a
jsdom copy of `/p/hosting` adds an Organization JSON-LD whose description is
"U.S. marketplace for renting private swimming pools by the hour. 0% host fees through
2026." and no "Hartford" exists in the rendered document.

Noted for Derek, not changed: EAST's own JSON-LD on `/p/hosting` (a FAQPage and an
EducationalOrganization block) still contains the word "insurance".

## Batch D — c196 promoted blue/green

See `docs/seo/changes-2026-09-02.md` §1 "Flip status" for the full account. Summary:
gate re-run in full and passed; the 7 hardcoded `proxy_pass http://127.0.0.1:3000` lines
now read `proxy_pass http://web` (every block already sets `Host` explicitly, so upstream
naming changes nothing); `conf.d/main-web.conf` switched to `127.0.0.1:4000`; 32 public
probes passed; c194 still running on :3000. Soak checks showed zero 5xx from c196.

Backups: `/root/nginx-bak/default.bak-20260907T070132Z` (pre-wiring),
`main-web.conf.bak-20260907T070132Z` (the :3000 upstream = rollback file).

**Container rename (07:16:20Z, no restarts):** after verifying every caller against
c196 (see "Callers" below), `docker rename` moved c194 to
`poolrentalnearme-production-rollback` and c196 (`c196-gate`) to
`poolrentalnearme-production`. Container IDs (`4202c5030d36` = c194, `6b4c959d2193` =
c196) and `StartedAt` timestamps are unchanged; both keep `--restart unless-stopped`.
nginx still points `upstream web` at :4000, which is c196. `docker exec
poolrentalnearme-production hostname` now returns c196's ID. c194 stays up on :3000 as
the rollback until at least one normal automation cycle has completed against c196.
Name rollback: `docker rename poolrentalnearme-production c196-gate-tmp && docker rename
poolrentalnearme-production-rollback poolrentalnearme-production && docker rename
c196-gate-tmp c196-gate`; traffic rollback is the `main-web.conf` swap above.

**Callers of the container name (scheduled), classified.** Every one copies a script
into the container and runs it with bun; none transitions a Sharetribe transaction or
edits a listing.

| Caller | Schedule | Class | Notes |
|---|---|---|---|
| warm-digest | 16:00Z daily | notifications (founders) + DB mutation | auto-resolves `sms_reply_ctx` rows, logs to `sms_log`, texts Derek/Brandon |
| stuck-detector | */15 | notifications (founders, daytime) + DB mutation | writes air-file rows; `STUCK_DRY=1` supported |
| cart-recovery | */15 | notifications (guests) + DB (`sms_log`) | one founder-voice text per expired checkout, 14:00–02:00Z window |
| lead-nudge | :15 hourly | notifications (hosts) + DB (`sms_log`) | 9am–7pm PT window |
| review-nudge (cron.d) | */30 | notifications (guests) + DB (`supastore`, heartbeat) | queries completed transactions only; quiet hours 03:00–16:00Z |
| restricted-sweep (cron.d) | 15:35Z | payout/financial monitoring + notification (Derek) + DB (`email_send_log`) | Sharetribe `users.show` + Stripe account GET; POSTs only to Supabase and Twilio |
| payout watchdog (root) | 15:00Z | payout/financial monitoring + notification (Derek) | read-only against Sharetribe |
| allie-pitch watch (root) | :40 hourly | notification (Derek) | writes a DONE marker in `/tmp/host` inside the container |
| switchy jobs / stats | */30, */5 | notifications (hosts) | host link sends, stats replies, outreach queue; quiet-hour and dedupe guards in-script |
| switchy click snapshot | */6h | read-only | Switchy GraphQL → `click_history.jsonl` on the host |
| switchy weekly | Thu 20:00Z | notifications (all hosts) | held by `WEEKLY_STOP` since Aug 7 |
| sms-extras | */5 | notifications (guests) | booking confirm/decline texts, state file round-trips through the container |
| photo-concierge | 16:05Z | notifications (hosts) | copies `tzfence.js` into `/home/bun/app` |
| future-season | Mon in March | notification (Derek) | dormant until March |
| db-watchdog | */5 | notification (Derek), conditional | only execs into the container to send when the content DB is down |

Everything else that names the container (deploy-cNN/flip-cNNN/gate-cNNN/stage scripts,
Dockerfiles `FROM poolrentalnearme-production:currentNN-*`, campaign and one-off runners,
`route-swap.sh`, `smsctl`, `/root/restart-container.sh`) is maintenance or historical
and runs only by hand.

**Verified in c196 before the rename:** the modules the callers require
(`api-util/integration.js`, `api-util/sdk.js`, `notify/twsend.js`, `poller.js`,
`messages.js`, `inbound.js`, `routectl.js`, `welcome.js`, `.env`) are byte-identical in
both containers; `sharetribe-flex-integration-sdk` resolves; all ten payload scripts
pass `node --check`; cart-recovery, lead-nudge and review-nudge exit on their window
guards exactly as in c194; stuck-detector `STUCK_DRY=1` computes the same result; the
payout watchdog with its sender stubbed reports the same "1 stuck". The only
caller-relevant module that differs is `notify/exclude.js`: c196 anchors the
test-account probe tokens to a delimited segment of the local part, so ordinary hosts
like `mdupree@` are no longer misclassified as test accounts by review-nudge. That is a
deliberate fix c196 ships, not drift. `node` inside both containers is bun's wrapper.

## Batch E — EAST :3001

Killed pid 2112313 (`node --env-file=.env serve.mjs`, cwd `/home/ubuntu/fresh-web-staging`,
started 2026-07-08 from an SSH shell, parent bash orphaned to PID 1, zero requests ever,
referenced by nothing, unreachable from outside). fresh-web pid 177573 unchanged, www 200.
The 145 MB directory was left in place.

## Batch F — cron and certbot

- Root crontab: the two `0 2 * * * /bin/bash  --cron` lines (empty script path, present in
  the journal since at least 2026-03-12, no generator anywhere on disk, no MTA so never
  mailed) are commented out in place. Backup `/root/crontab.bak-20260907T070542Z`.
- `help.poolrentalnearme.com` (DNS now at a third party, 23.88.122.109) and
  `n.poolrentalnearme.com` (no DNS): certificates deleted, their four one-line nginx
  server blocks removed, nginx reloaded. `snap.certbot.renew.service` now exits 0 instead
  of "All renewals failed" nightly. Backups: `/root/letsencrypt-bak-20260907T070542Z.tgz`,
  `/root/nginx-bak/default.bak-20260907T070542Z`.

## Batch G — deferred

Nothing pruned. Constraints recorded: no Docker image pruning right after the release
(rollback depth matters more than 11 GB), and no deletion of the Aug 1 DB backup `.jsonl`
files without independently verified equivalents. EAST reboot (kernel 1006 → 1012) is now
safe from the env side but still needs a low-traffic window.

## Not changed, by design

- Apex `poolrentalnearme.com → www` 301: explicit in nginx, matches `VITE_MARKETPLACE_ROOT_URL`,
  canonical tags, sitemap and robots. Intentional.
- pm2 "100 restarts": all `SIGINT`/exit 0 on deploy days; zero crashes.
- db-watchdog: its permission errors ended 2026-08-08; healthy.
- `WEEKLY_STOP` on the Switchy weekly SMS: Derek's call.
