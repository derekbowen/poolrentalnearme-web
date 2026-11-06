# Chatbot ops: self-hosted Chatwoot + the scripted PRNM assistant (EAST)

Nothing here has been run against a server except the read-only DRY gates noted under "Evidence". Every
script defaults to `DRY = True`. Each `DRY=False` run needs Derek's explicit GO, one script at a time.

Zero recurring cost: no AI/LLM, no SMS, no SMTP, no subscription, no trial, no new AWS resource. Chatwoot
Community Edition, nginx, certbot (Let's Encrypt), pm2 and node already run on EAST. Push notifications to
the official Chatwoot app go through Chatwoot's free relay; browser push goes straight to the browser vendor.

| File | Runs on | What it does |
|---|---|---|
| `cw_harden.py` | EAST via `ops/runners/east_runx.py` | Backs up `/home/ubuntu/chatwoot` (tarball) and `pg_dump`s the DB. Rewrites the md5-gated compose: env moves to `.env` (rails+sidekiq) and `postgres.env` (mode 600); compose is mode 600 and holds no secrets; `ENABLE_ACCOUNT_SIGNUP=false`, `FRONTEND_URL=https://chat.poolrentalnearme.com`, `FORCE_SSL=true`, `ENABLE_PUSH_RELAY_SERVER=true`, `DISABLE_TELEMETRY=true`; every image pinned by digest; `extra_hosts` pins `chat.poolrentalnearme.com` to EAST's public IP (read from instance metadata). `docker compose up -d`, verifies, restores on failure. |
| `cw_setup.py` + `cw_setup.rb` | EAST | Idempotent `rails runner`: account "Pool Rental Near Me"; Derek Bowen (super admin) and Brandon Elias as administrators with random passwords nobody sees; website inbox "PRNM Website"; both as inbox members; push flags; labels; conversation attributes; agent bot "PRNM Assistant (automated)" attached to the inbox; installation onboarding closed. Writes the bot token and webhook secret only to `/home/ubuntu/chatbot/.env` (600, ubuntu). Prints ids, the public website token and, once the public URL answers, one-time reset links (6 h). |
| `cw_nginx.py` | EAST | Refuses unless `chat.poolrentalnearme.com` already routes to EAST (DNS resolves and a nonce request appears in EAST's access log). Port-80 stub, `certbot certonly --nginx`, full vhost (TLS, ActionCable websocket upgrade, `/prnm-bot/` to the bot, super admin/monitoring/onboarding closed to the public), `nginx -t`, reload, verify. `fresh-web`, `intl.conf`, `nginx.conf` and the Cloudflare real-IP snippet are md5-gated and re-checked after certbot. |
| `bot_deploy.py` | EAST | Fetches `ops/chatbot/ops/bot_manifest.sha256` from this repo at a pinned commit (sha256-pinned) and every file it lists (sha256 each), writes a release dir, runs the bot's tests with EAST's node, swaps `/home/ubuntu/chatbot/current`, starts pm2 `chatbot` as ubuntu on 127.0.0.1:3120, `pm2 save`, health-checks, rolls back to the previous release on failure. |
| `cw_status.py` | EAST | Read-only report: containers, version/edition, env flags (secrets as set/unset only), signup/onboarding, account/users/inbox/bot, push devices, handoff counts, notifications, pm2 `chatbot`, TLS, capacity, backups. |
| `cw_push_test.py` | EAST | DRY: lists each founder's registered devices. DRY=False: sends Chatwoot's own test push to every device of Derek and Brandon. No customer involved. |
| `east_widget.py` + `east/chatwoot-widget.tsx` | EAST | Installs the widget on every non-admin fresh-web page (see "EAST deploy"). |
| `pin_bot.py` | here | Writes the manifest from a commit and pins `SHA`/`MANIFEST_SUM` in `bot_deploy.py`. |
| `selfcheck.py` | here | Syntax, `DRY = True`, runner payload size, embedded Ruby == `cw_setup.rb`, CSS identical on WEST/EAST, `east_widget.py` md5 + anchors against `tests/fixtures/east__root.tsx`. |
| `tests/` | here | Harnesses that run the real scripts against fake boxes (see "Evidence"). |

Marketplace (WEST) side, in this repo: `src/components/ChatwootWidget/` (loader + mount + tests), mounted in
`src/routing/AppRouter.jsx` `RootRoute`; CSP entries in `server/csp.js`; `VITE_CHATWOOT_WEBSITE_TOKEN` in
`.env.example`.

## Order (each DRY first; DRY=False only with Derek's GO)

1. `python3 ops/chatbot/ops/selfcheck.py` (local).
2. `cw_harden.py`. Choose `IMAGE` first (see decision 2).
3. `cw_setup.py`. Prints the website token and ids; no reset links yet (the public URL is not up).
4. Cloudflare DNS (Derek, not scripted): `A chat -> 3.222.110.146`, proxied. SSL mode must be Full (strict).
5. `cw_nginx.py`.
6. `cw_setup.py` again (idempotent): now prints the two reset links. They are credentials: give each person
   theirs privately; single use; 6 hours. Each founder sets a password, then turns on 2FA in Profile Settings.
7. Bot: commit the bot, `pin_bot.py manifest HEAD`, commit and push the manifest, `pin_bot.py pin <that commit>`,
   then `bot_deploy.py`.
8. Each founder installs the free "Chatwoot" app, enters `chat.poolrentalnearme.com`, logs in, allows
   notifications. Then `cw_push_test.py` (DRY, then DRY=False), then the end-to-end test it prints.
9. EAST widget: commit `east/chatwoot-widget.tsx`, set `SHA`/`SUM` in `east_widget.py`, run it.
10. WEST widget: add `VITE_CHATWOOT_WEBSITE_TOKEN=<token from step 3>` to WEST's `.env` (the Dockerfile copies
    `grep ^VITE_ .env` into the build; a process env var does not reach the client bundle, verified), then a
    normal gated release per CLAUDE.md, mirrored into this repo.
11. `cw_status.py` any time.

## Decisions and deviations (with evidence)

1. **Bot webhook URL is the public HTTPS name, not the docker host gateway.** The computed task asked for the
   gateway IP. Chatwoot 4.16.2 posts agent-bot webhooks through `SafeFetch` (`lib/webhooks/trigger.rb` ->
   `lib/safe_fetch.rb`), which rejects private and loopback addresses unless
   `SAFE_FETCH_ALLOW_PRIVATE_NETWORK=true`. The gateway (`chatwoot_default`, 172.18.0.1) is private, so every
   webhook would fail and Chatwoot would dump each conversation to "open" with no push. Turning the filter off
   would let visitor-supplied avatar URLs reach internal services, including the instance metadata endpoint.
   Instead `cw_harden.py` pins `chat.poolrentalnearme.com` to EAST's public IP inside rails+sidekiq; the IP is
   read from instance metadata (3.222.110.146 today), not hardcoded, and cross-checked. Hairpin works:
   sidekiq -> 3.222.110.146:443 answered 302 (probe, 2026-11-06).
2. **Image.** The running image is the Enterprise build (`CW_EDITION=ee`) on the free plan. The request says
   Community Edition, so `IMAGE = "ce"` (default) switches to `chatwoot/chatwoot:v4.16.2-ce@sha256:7ee85a20...`
   (same release; index digest checked on Docker Hub; about 718 MB compressed; needs >= 4.0 GB free, EAST has
   4.6). The DB is empty, so the switch carries no data. `IMAGE = "running"` pins the exact running bits,
   `chatwoot/chatwoot@sha256:13ca92b8...` (still pullable from Docker Hub), with no download. Derek's choice.
3. **FORCE_SSL=true.** Every local caller sends `X-Forwarded-Proto: https` (the bot does by default; the
   scripts do).
4. **Client IP.** EAST's `nginx.conf` already includes `snippets/cloudflare-real-ip.conf` (22 Cloudflare ranges,
   `real_ip_header CF-Connecting-IP`), so the vhost relies on it and overwrites `X-Forwarded-For` with the
   visitor IP, keeping Rack::Attack's per-IP widget limits per visitor.
5. **Widget "reply time"** is set to "in a day", the least promising of Chatwoot's three options. It must never
   promise minutes. Derek may change it in the inbox settings.
6. **Website token.** It is public (it ships in every page) but stays out of source. WEST: `.env` at build.
   EAST: `east_widget.py` reads it from the local Chatwoot DB and writes `fresh-web/.env.production.local`
   (read by Vite at build time only; the node runtime reads `.env`), so later EAST builds keep the widget.
7. **Position bottom-left** on both sites (Chatwoot SDK `position: 'left'`; `#prnm-cta` owns bottom-right).
   Below 1025px the launcher moves up to 80px to clear the 58px BottomNav and 61-70px sticky bars; at
   <=480px it is 48px at left 12px so it never sits under `#prnm-cta` (cta.js: right 10px, bottom 88px,
   max-width min(78vw, 300px)); `#prnm-cta` is hidden while the chat is open. WEST hides the widget on
   card/payout forms always and on fixed-bar pages at <=1024px, and while any Modal is open.
8. **Attachments off** (inbox flag + SDK): the assistant cannot read files, and it keeps ID and card photos out.
9. **EAST deploy** (`east_widget.py`): live `dist` is never built into. A staging copy is made with only
   `node_modules` hard-linked (everything else copied, because the TanStack router plugin rewrites
   `src/routeTree.gen.ts` in place, which would write through a hard link into the live tree; `dist` and the
   old `dist.bak*` copies are left out). After a good build the old hashed chunks are linked in, `dist` is
   exchanged atomically (`renameat2(RENAME_EXCHANGE)`), pm2 restarts fresh-web, pages are verified; any failure
   exchanges back. Live `src` changes only after success. The pm2 restart of a fork-mode app still leaves a
   gap of a few seconds; the long outage the old in-place builds caused (empty `dist` during the build) is gone.
10. **Sidekiq during the EAST build** is stopped only if MemAvailable < 1536 MB (it was ~1950 MB with Chatwoot
    running, so normally it is not). If it is stopped, a one-off transient systemd timer is created, disclosed
    here and in the script output per CLAUDE.md rule 4: **name** `prnm-sidekiq-guard`, **schedule** once,
    20 minutes after the stop, **runs** `/usr/bin/docker start chatwoot-sidekiq-1`. The script restarts
    sidekiq itself in a `finally` and cancels the timer; the timer only matters if the script is killed.
11. **Reset links** print only once the public URL answers, because they expire after 6 hours. Re-running
    `cw_setup.py` makes new ones and invalidates the old ones.

## Contract with the bot (`ops/chatbot/server.js`)

`/home/ubuntu/chatbot/.env` (written by `cw_setup.py`, read by `node --env-file`): `HOST=127.0.0.1`,
`PORT=3120`, `CHATWOOT_URL=http://127.0.0.1:3009`, `CHATWOOT_FORWARDED_PROTO=https`, `CHATWOOT_PUBLIC_URL`,
`SITE_URL`, `CHATWOOT_ACCOUNT_ID`, `CHATWOOT_INBOX_ID`, `CHATWOOT_BOT_ID`, `CHATWOOT_DEREK_USER_ID`,
`CHATWOOT_BRANDON_USER_ID`, `CHATWOOT_BOT_TOKEN`, `CHATWOOT_WEBHOOK_SECRET`, `BOT_DATA_DIR=/home/ubuntu/chatbot/data`.
The bot serves `GET /healthz` and `POST /webhook` (nginx maps `/prnm-bot/webhook` to it), answers 401 to an
unsigned request and 2xx to a correctly signed one. `package.json` has `main`, `scripts.test` and no
dependencies. pm2 is started with `env -i`, so no secret reaches `dump.pm2`. Each release's `data` is a
symlink to `/home/ubuntu/chatbot/data`, so logs survive upgrades. Draft additions: run
`node tools/draft-additions.js --log /home/ubuntu/chatbot/data/events.jsonl --out /home/ubuntu/chatbot/data/drafts`
from `current/` (drafts only; nothing is published).

## Rollback

- `cw_harden.py`: restores automatically. Manual: `/home/ubuntu/chatwoot-backups/harden-<ts>/chatwoot-dir.tgz`
  (original compose), `cw.dump` (DB), then `docker compose up -d`.
- `cw_nginx.py`: restores automatically. Manual: `rm /etc/nginx/sites-enabled/chat-prnm.conf && nginx -t &&
  systemctl reload nginx`. Copies of the protected files are in `/home/ubuntu/backup-cw-nginx-<ts>/`.
- `bot_deploy.py`: rolls back automatically. Manual: point `current` at an older `releases/` dir, then
  `pm2 delete chatbot` and start it again as the script does. To take the bot out of Chatwoot entirely:
  inbox settings -> Bot configuration -> none (conversations then go straight to the founders).
- `east_widget.py`: rolls back automatically. Manual: copy `backup-east-chatwoot-widget-<ts>/__root.tsx`
  back, remove `src/components/chatwoot-widget.tsx` and `.env.production.local`, exchange `dist` with
  `dist-prev` from the backup (or rebuild, heap 3072), `pm2 restart fresh-web` as ubuntu.
- WEST: the widget is a no-op without `VITE_CHATWOOT_WEBSITE_TOKEN`; remove the line and release.

## Evidence (2026-11-06)

- Read-only DRY runs on EAST: `cw_harden.py` all gates OK (compose md5 c9e8f005..., services, env, IMDS IP
  3.222.110.146, image digests, API 4.16.2, 4.6 GB free) and printed the planned compose; `cw_setup.py`,
  `cw_nginx.py` aborted as designed (harden not done; `chat.poolrentalnearme.com` has no DNS record);
  `bot_deploy.py`, `east_widget.py` refuse until pinned; `cw_status.py` and `cw_push_test.py` (DRY) ran.
- The proposed vhost passed `nginx -t` on EAST's nginx 1.28.3 in a throwaway prefix together with the real
  `fresh-web`, `intl.conf` and Cloudflare snippet (live nginx untouched).
- `tests/test_east_widget.py`: 31 checks (DRY, success, re-run refusal, build failure, verify failure with
  exchange back, low-memory sidekiq path, live `node_modules` inode/content unchanged, in-place writer kept out
  of live `src`).
- `tests/test_cw_harden.py`: DRY, success for `ce` and `running`, rollback; the written compose and env files
  are accepted by the real `docker compose config`, which resolves every value exactly.
- `tests/test_cw_setup_nginx.py`: setup DRY/real/no-links/private-IP refusal/runner failure; nginx unrouted,
  DRY, success, certbot failure, certbot leftover restored, verify failure.
- `tests/test_bot_deploy_local.py`: with the real bot code and pm2 7.0.1: DRY, manifest and per-file sha256
  tampering, first deploy (healthz 200, bound to 127.0.0.1:3120, signed 200 / unsigned 401, no token in
  `dump.pm2`), upgrade, failed start rolled back, failing tests aborted before any swap.
- Widget CSS against Chatwoot 4.16.2's SDK CSS and the live `#prnm-cta` CSS in headless Chromium: 81 checks at
  12 viewports, 320 to 1440 px.

## Open items

- Cloudflare zone settings for `chat` (SSL mode Full (strict); Bot Fight Mode does not matter for webhooks,
  which bypass Cloudflare via `extra_hosts`).
- EAST's security group must keep allowing 443 from EAST's own public IP (it allows 443 from anywhere today).
- Mobile app button labels for "assign to me" were not checked.
- Backups of the Chatwoot DB after go-live: a nightly local `pg_dump` cron is a separate change, to be disclosed
  under rule 4 when created.
