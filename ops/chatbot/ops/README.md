# Chatbot ops: self-hosted Chatwoot and the PRNM assistant on EAST

**Status (2026-11-13):** nothing here has been run against a server except read-only probes and DRY gates. EAST still runs the private, empty Chatwoot 4.16.2 EE install, bound to 127.0.0.1:3009, and there is no DNS record for `chat.poolrentalnearme.com`. The last review said **fix first** (see "Open before going public").

Every script defaults to `DRY = True`. A real run uses a copy with `DRY = False`, one script at a time, and only after Derek's explicit GO for that run.

## Cost: zero added recurring or usage cost

- **Software:** everything runs on EAST (t3.medium), which PRNM already pays for. Chatwoot Community Edition is open source. nginx, certbot, pm2 and Node 20 are already on the box. Certificates are free from Let's Encrypt.
- **Not used:** no AI or LLM, no SMS, no SMTP or email provider, no subscription, no trial, no new AWS resource and no bigger instance.
- **Push:** the free official Chatwoot app, through Chatwoot's free push relay (`ENABLE_PUSH_RELAY_SERVER=true`). Browser push goes straight to the browser vendor.
- **Cloudflare:** one more DNS record on the existing Free-plan zone.
- **The one new metered item: the webhook hairpin.** Chatwoot posts every bot webhook to EAST's own public IP. AWS bills data to and from a public IPv4 address at $0.01/GB in each direction. A webhook is a few KB, so 10,000 webhooks (about 50 MB) cost about $0.001, a tenth of a cent. EAST's public IP is an existing charge.
- **Kept off:** Captain AI and the OpenAI key, Firebase keys, SMS/WhatsApp/Twilio inboxes, SMTP, Enterprise billing, and S3/GCS storage. `cw_status.py` shows each of these as set or unset; all must read unset.

## Files

| File | Runs on | What it does |
|---|---|---|
| `cw_harden.py` | EAST | Backs up `/home/ubuntu/chatwoot` (tarball) and `pg_dump`s the DB. Pulls **Chatwoot CE 4.19.1** pinned by digest. Rewrites the md5-gated compose: secrets move to `.env` and `postgres.env` (mode 600). Generates the 3 Active Record encryption keys 2FA needs (never printed). Sets signup off, `FRONTEND_URL`, `FORCE_SSL`, push relay on, telemetry off and the Rack::Attack widget limits. `extra_hosts` pins `chat.poolrentalnearme.com` to EAST's public IP. Caps every container's log (json-file, `max-size 20m`, `max-file 5`: Docker's default has no cap). Runs `db:chatwoot_prepare` (46 migrations, with rails and sidekiq stopped), starts the stack and verifies it, including each container's log config. Prints the sdk.js SRI and the 2FA key fingerprint. `RUNNER_TIMEOUT = 5400`. |
| `cw_setup.py` + `cw_setup.rb` | EAST | Idempotent `rails runner` (see "Order", step 3, for what it creates). Writes the bot token and webhook secret only to `/home/ubuntu/chatbot/.env` (600, ubuntu). Prints the ids, the public website token and the SRI. Switches: `LINK_FOR` (D6) and `KEEP_PENDING`. |
| `cw_nginx.py` | EAST | Port-80 stub, Let's Encrypt cert (`certbot certonly --nginx`), then the full vhost `/etc/nginx/sites-enabled/zz-chat-prnm.conf`, `nginx -t`, reload and verify. The protected files (`nginx.conf`, `fresh-web`, `intl.conf`, the Cloudflare real-IP snippet) are md5-gated and re-checked. `DNS = "proxied"` is the default. `RUNNER_TIMEOUT = 900`. |
| `pin_bot.py` | here | Writes `bot_manifest.sha256` from a commit (everything under `ops/chatbot/` except `ops/`, `data/`, `bank/drafts/` and dotfiles), then pins `SHA` and `MANIFEST_SUM` in `bot_deploy.py`. |
| `bot_deploy.py` | EAST | Fetches the pinned manifest and every file (sha256 each), runs the bot's tests with EAST's node, swaps `/home/ubuntu/chatbot/current`, and starts pm2 `chatbot` as ubuntu on 127.0.0.1:3120. Health-checks, rolls back on failure, and writes the logrotate entry. `RUNNER_TIMEOUT = 900`. |
| `cw_push_test.py` | EAST | DRY lists Derek's and Brandon's registered devices and push flags. `DRY = False` sends Chatwoot's own test push to every device of both. No customer is involved. |
| `cw_status.py` | EAST | Read-only report: containers, env (secrets as set/unset only), accounts, users and 2FA, inbox, bot, push devices, labels, founder alerts, bot-failure opens, pm2, nginx/TLS/DNS, the sdk.js SRI and CORS, disk, each container's log cap (a `LOG ALERT` when one has none), backups. A command that times out is reported as `TIMEOUT after N s` and the report goes on. |
| `east_widget.py` + `east/chatwoot-widget.tsx` | EAST | Adds the chat launcher to every non-admin fresh-web page. A staged, memory-capped build, then an atomic `dist` swap. `RUNNER_TIMEOUT = 1800`. `TRIAL = True` only measures the build. |
| `selfcheck.py` | here | Syntax, `DRY = True`, and the runner payload of each script as it will really run. Checks that the embedded Ruby equals `cw_setup.rb` (`--embed` rewrites it), that the widget CSS is identical on WEST and EAST, the `east_widget.py` anchors, and that the bot port and the chat vhost path (`VH` in `cw_nginx.py`, `bot_deploy.py` and `cw_status.py`) are each one value everywhere. |
| `tests/` | here | Harnesses that run the real scripts against fake boxes, real nginx and real PostgreSQL (see "Local tests"). |

**WEST side (in this repo):**
- `src/components/ChatwootWidget/`: the loader, the mount and its tests. It is mounted in `src/routing/AppRouter.jsx`.
- `server/csp.js`: the CSP entries.
- `.env.example`: `VITE_CHATWOOT_WEBSITE_TOKEN` and `VITE_CHATWOOT_SDK_SRI`.
- It ships as release c208 (`ops/west/c208/README.md`).

## Running a script

- **Command:** `python3 ops/runners/east_runx.py ops/chatbot/ops/<script>.py` (WEST: `ops/runners/ssm_runx.py`). The runner needs the AWS credential described in `docs/SECRETS_BOOTSTRAP.md`. Never create a new key.
- **Timeouts:** the runner uses the script's own `RUNNER_TIMEOUT` (otherwise 560 s) and refuses anything shorter.
- **Long runs:** a run longer than about 10 minutes outlives an interactive tool call. Start `cw_harden.py`, `east_widget.py` and any run that may pass 10 minutes in the background. The command id goes to stderr, and `east_runx.py --result <id>` re-reads the run.
- **Payload size:** a command over 9,500 characters is sent in a gzip form (EAST only). `selfcheck.py` measures every script with the real pins filled in.
- **Reading the result:** SSM's STATUS says Success even when the script exits 1. Read the script's own `DONE`, `ABORT`, `FAILED`, `DRY RUN` or `TRIAL` line.

## Order

Marks: **[Derek]**, **[Claude via runner, needs Derek's GO]** (DRY first, which changes nothing, then one real run), **[automatic]**. Before the first server step, run the local tests below.

### 1. DNS record [Derek]

- **The record:** in Cloudflare, zone `poolrentalnearme.com`, DNS → Add record:
  - **Type** `A`, **Name** `chat`, **IPv4** `3.222.110.146`, **Proxy status: Proxied** (orange cloud), **TTL** Auto.
  - No AAAA record.
- **When:** any time before step 4. EAST has no vhost for the name until then, and Chatwoot listens only on 127.0.0.1, so nothing of Chatwoot is reachable through the record earlier.
- **Proxied is recommended.** DNS-only would publish EAST's IP, which is the origin of fresh-web and the ccTLD sites. If Derek picks DNS-only, set `DNS = "dns-only"` in `cw_nginx.py`. Webhooks bypass Cloudflare either way (`extra_hosts`).
- **Zone settings:** the zone already uses SSL Full (strict), which this needs.
- **If `cw_nginx.py` aborts with `probe logged: False`** on a proxied record: its plain-HTTP probe of `/.well-known/acme-challenge/` did not reach EAST. The zone has Always Use HTTPS on, and Let's Encrypt's HTTP-01 check uses the same path.
- **Edge warning:** if `cw_nginx.py` prints a Cloudflare WARN, check SSL Full (strict), Security Level for `chat.`, and WebSockets.
- **Rollback:** delete the record.

### 2. `cw_harden.py` [Claude via runner, needs Derek's GO]

- DRY prints the planned compose (with the log caps) and every gate.
- The real run takes long, so start it in the background. It needs at least 4.0 GB free.
- Before the real run, record the running image's digest (`docker image inspect chatwoot/chatwoot:latest --format '{{json .RepoDigests}}'`). The script deletes that image after a successful switch.
- **Right after `DONE`, [Derek]:** back up the 2FA keys off the box. In an interactive shell on EAST (not the runner, which keeps output), run `sudo grep ^ACTIVE_RECORD_ENCRYPTION_ /home/ubuntu/chatwoot/.env` and store the 3 lines in his password manager. Lost keys lock out every 2FA user. `cw_status.py` prints the same 12-character fingerprint as `cw_harden.py`, to match the backup against.
- The SRI it prints for `v4.19.1-ce` is `sha384-NMOiMrdTUxTmFY1l+sFGdJGBULpsENmHiq+1biXcN6oREUhlYB9ij9AFbm5/I3Xr`. The 4.16.2 value seen in earlier dry runs (`sha384-0dPy…`) is obsolete.
- **Rollback [automatic]:** on any failure it restores the compose, removes `.env` and `postgres.env`, restores the DB from the fresh dump if it had migrated, and starts 4.16.2 again.
- **Manual rollback:** the backups are in `/home/ubuntu/chatwoot-backups/harden-<ts>/` (`chatwoot-dir.tgz`, `cw.dump`). After `DONE`, going back to 4.16.2 means stopping rails and sidekiq, `pg_restore` of `cw.dump` (the command is printed on failure), restoring the tarball and pinning the recorded digest. The DB is empty today, so nothing would be lost.
- **One run only:** a second run refuses (`.env exists`).

### 3. `cw_setup.py`, first run [Claude via runner, needs Derek's GO]

- **Settings:** `LINK_FOR = ""`. `KEEP_PENDING` is as Derek decides (see "Decisions for Derek").
- **Refuses until** `cw_harden.py` is done: `FRONTEND_URL` set, all 3 encryption keys present, and sidekiq resolving the name to a public address (cw_harden's `extra_hosts`).
- **What it creates:**
  - The account "Pool Rental Near Me", with 2FA enforced.
  - Derek Bowen (super admin) and Brandon Elias, both administrators, with random passwords nobody sees. Their logins are derek@ / brandon@poolrentalnearme.com; no email is ever sent.
  - Email notification flags: none.
  - Push notification flags (D5): new conversation, mention, assignment, and new message in an assigned chat. "Participating" is off.
  - The website inbox "PRNM Website":
    - auto-assignment, email collect, greeting, CSAT, working hours, pre-chat and email continuity off;
    - attachments and "end conversation" off;
    - a 1 MB upload cap;
    - reply time "in a day";
    - allowed domains: the four PRNM domains.
  - The labels, and the `prnm_*` attribute definitions.
  - The agent bot "PRNM Assistant (automated)", with `outgoing_url https://chat.poolrentalnearme.com/prnm-bot/webhook`.
  - The installation onboarding page is closed.
- **Output:** it writes `/home/ubuntu/chatbot/.env` (600, ubuntu) and prints the website token and the SRI. It prints no reset link yet, because the public URL isn't up.
- **Rollback:** none needed, because nothing is public before step 4. Re-running is safe. To take the bot out of chats at any time: Settings → Inboxes → PRNM Website → Bot configuration → none. Chats then go straight to both founders.

### 4. `cw_nginx.py` [Claude via runner, needs Derek's GO]

- **Refuses until** the DNS record routes to EAST (a nonce request must appear in EAST's access log) and steps 2–3 are done: 1 account, 2 users, attachments and end-conversation off, onboarding closed, signup off.
- **Verify** requires all of the following:
  - super admin, monitoring and onboarding return 404;
  - `/prnm-bot/` takes only the hairpin and loopback, and a dead bot gives 500;
  - every widget write (contact, labels, attributes) and every upload variant returns 403;
  - oversized bodies return 413;
  - a junk-cookie widget-load burst, a widget config-POST burst and an event burst hit 429;
  - a POST to `/auth/password` (and `.json`) returns 403, and the PUT a D6 link sends reaches Chatwoot;
  - the websocket upgrades (101);
  - sdk.js carries exactly one `Access-Control-Allow-Origin: *`;
  - the other sites are unchanged.
- **Rollback [automatic]:** restores the protected files, removes the vhost and reloads.
- **Manual rollback:** `rm /etc/nginx/sites-enabled/zz-chat-prnm.conf && nginx -t && systemctl reload nginx`. Copies of the protected files are in `/home/ubuntu/backup-cw-nginx-<ts>/`. The certificate stays (`certbot delete --cert-name chat.poolrentalnearme.com` removes it).

### 5. One reset link per founder (D6) [Claude via runner, needs Derek's GO]

1. Run `cw_setup.py` with `LINK_FOR = "derek"`. It prints only Derek's link, and only once `https://chat.poolrentalnearme.com/api` answers.
2. **[Derek]** uses it at once: he sets a password, signs in at `https://chat.poolrentalnearme.com/app/login`, and Chatwoot makes him set up 2FA **[automatic]**: scan the QR code and keep the backup codes.
3. Run it with `LINK_FOR = "brandon"`, and Brandon does the same. He gets his link privately, the way Derek decides.
4. Run it with `LINK_FOR = ""`. That revokes any unused copy. Every run revokes every other outstanding reset token.

The link is a credential:
- Chatwoot does not enforce the reset expiry, so a link is live until it is used or revoked.
- nginx answers only PUT on `/auth/password` (what the link's page sends), so nobody can replace an unused link through the forgot-password form. Email resets could not work here anyway: there is no SMTP.
- Whoever uses it first also enrols the 2FA.
- The runner's output is kept by SSM in AWS.

If a link stops working, print a new one (step 5.1 again).

### 6. Chatwoot app [Derek, Brandon]

Do this after 2FA is set up on the web:
1. Install the free "Chatwoot" app.
2. Enter the server URL `https://chat.poolrentalnearme.com`.
3. Log in. The app asks for the 2FA code.
4. Allow notifications.

Browser push (Profile Settings) is optional. Rollback: log out or remove the app.

### 7. Bot release: `pin_bot.py` + `bot_deploy.py` [Claude via runner, needs Derek's GO]

1. Locally: commit the bot, then `python3 ops/chatbot/ops/pin_bot.py manifest HEAD`.
2. Commit and push the manifest.
3. `pin_bot.py pin <that pushed commit>`, then commit that too.
4. `bot_deploy.py`, DRY first. DRY stages the files in a temp dir, runs the tests on the box and checks the logrotate entry.

The real run:
- swaps `current`;
- starts pm2 `chatbot` with `env -i` (no secrets reach `dump.pm2`), using `--env-file`, `--max-memory-restart 200M` and `pm2 save`;
- requires healthz 200, a listener on 127.0.0.1:3120, a signed POST → 2xx, an unsigned POST → 401 or 403, and no token in `dump.pm2`;
- once the chat vhost exists (step 4), also Chatwoot's own path: an unsigned POST from inside `chatwoot-sidekiq-1` to `https://chat.poolrentalnearme.com/prnm-bot/webhook` (public IP, nginx, bot) must get 401 or 403. Without the vhost it prints `not checked`;
- keeps the last 3 releases.

**Rollback [automatic]:** back to the previous release, or with none, the pm2 process is removed.

**Manual rollback:**
- Point `/home/ubuntu/chatbot/current` at an older `releases/` dir, then `pm2 delete chatbot` and start it the way the script does.
- `rm /etc/logrotate.d/prnm-chatbot` removes the rotation.
- Or take the bot out of the inbox (step 3).

### 8. `cw_push_test.py` to BOTH founders [Claude via runner, needs Derek's GO]

DRY must list at least one device for each of Derek and Brandon. `DRY = False` sends one test push to every device of both. **[Derek, Brandon]** each confirm it arrived. Nothing to roll back.

### 9. A test handoff conversation [Derek]

1. In a private browser window, open `https://chat.poolrentalnearme.com/widget?website_token=<token from step 3>`. This works before the site embed; the inbox's allowed domains only limit framing.
2. Type "can I talk to the founder", say what it's about, and pick **Here in chat**.

Expect:
- "I've sent Derek and Brandon the rundown…";
- on **both** phones, a new-conversation push and a mention push.

Then one founder assigns the chat to himself and replies (the bot goes silent), and resolves it. `cw_status.py` should then show 1 founder alert. `bot_deploy.py` already proved the hairpin path with an unsigned POST; this proves a signed webhook end to end. The test uses that browser's D3 allowance for 24 h. Nothing to roll back.

### 10. EAST widget: `east_widget.py` [Claude via runner, needs Derek's GO]

1. Commit and push `east/chatwoot-widget.tsx`.
2. Set `SHA` (the commit) and `SUM` (`git show <commit>:ops/chatbot/ops/east/chatwoot-widget.tsx | sha256sum`) in `east_widget.py`.
3. Run DRY in the background (`RUNNER_TIMEOUT = 1800`).
4. Then a `TRIAL = True` run. It runs only the capped build, prints its time and peak RAM/swap, deletes the stage and never swaps.
5. Then the real run.

The real run:
- builds a staged copy in a memory-capped scope;
- requires the marker, token and SRI in `dist/client`;
- exchanges `dist` atomically;
- restarts fresh-web as ubuntu;
- checks `/` and `/p/how-to-host-a-pool-party`.

Live `src` changes only after success. It writes `VITE_CHATWOOT_WEBSITE_TOKEN` and `VITE_CHATWOOT_SDK_SRI` to `fresh-web/.env.production.local` (600), so later EAST builds keep the widget. It is a one-time install: it refuses once the component exists.

**Rollback [automatic]:** exchanges the previous `dist` back and restarts.

**Manual rollback:**
1. From `/home/ubuntu/backup-east-chatwoot-widget-<ts>/`, copy `__root.tsx` back.
2. Remove `src/components/chatwoot-widget.tsx` and `.env.production.local`.
3. Swap `dist` with the backup's `dist-prev`.
4. `sudo -u ubuntu PM2_HOME=/home/ubuntu/.pm2 pm2 restart fresh-web`.

### 11. WEST release c208 [Claude via runner, needs Derek's GO]

Follow `ops/west/c208/README.md`: `pin_c208.py <commit> --token <website token> --sri <SRI>`, `test_c208.py`, then `patch_c208.py` and `scripts_c208.py` (DRY, then real), then `launch_c208.py` for build, gate and flip. The SRI must be the one from the running 4.19.1 image, the same value EAST uses. Rollback is in that README.

### Any time: `cw_status.py` [Claude via runner, read-only, no GO needed]

### After any later Chatwoot image change

sdk.js changes with the image, so:
1. Take the new SRI.
2. EAST: edit `VITE_CHATWOOT_SDK_SRI` in `.env.production.local` and rebuild.
3. WEST: run a new release.

Until then the launcher falls back to "Email us".

## Scheduled units and timers (CLAUDE.md rule 4)

Each script also prints these when it creates them. Nothing here creates a cron entry. `cw_harden.py`, `cw_setup.py`, `cw_push_test.py` and `cw_status.py` create none.

| Unit | Created by | Schedule | What it runs |
|---|---|---|---|
| `prnm-fw-build-<ts>.scope` | `east_widget.py` (real or TRIAL) | none: a transient scope around one build, gone when the build ends (at most 900 s) | `npm run build` of the staged fresh-web copy, capped at MemAvailable−512 MB RAM and SwapFree−256 MB swap |
| `prnm-sidekiq-guard-<ts>.timer` | `east_widget.py`, only if the RAM cap is under 1,536 MB | once, 1,300 s after it is created. The script cancels it after restarting sidekiq itself. | `/usr/bin/docker start chatwoot-sidekiq-1` |
| `/etc/logrotate.d/prnm-chatbot` (a config file, no new timer) | `bot_deploy.py` | EAST's existing daily `logrotate.timer` | rotates `/home/ubuntu/.pm2/logs/chatbot-*.log` over 20 MB as ubuntu, keeps 3 compressed copies, uses copytruncate |
| cert renewal for `chat.poolrentalnearme.com` (no new timer) | `cw_nginx.py` (certbot) | certbot's existing renewal schedule on EAST | renews the cert, then its deploy hook runs `systemctl reload nginx` |
| pm2 process `chatbot` | `bot_deploy.py` | always on. `pm2 save` adds it to the same saved list as fresh-web. | `node server.js` on 127.0.0.1:3120; pm2 restarts it over 200 MB |
| deferred-handoff sweep (inside the bot) | `server.js` | every 60 s while the bot runs | sends a handoff alert that was logged over the hourly or per-visitor cap, and only once a slot is free; nothing while a cap holds |
| `prnm-c208-<step>` (WEST) | `launch_c208.py`, only with `HOW = "systemd-run"` | once, not a schedule | one of `build/gate/flip-c208.sh` (see `ops/west/c208/README.md`) |

Chatwoot's own internal sidekiq jobs already run in the existing containers; no script adds to them.

## Contract with the bot

- **Env file:** `/home/ubuntu/chatbot/.env`, written by `cw_setup.py`, which keeps any other lines already there:
  - `HOST=127.0.0.1`, `PORT=3120`
  - `CHATWOOT_URL=http://127.0.0.1:3009`, `CHATWOOT_FORWARDED_PROTO=https`, `CHATWOOT_PUBLIC_URL`, `SITE_URL`
  - `CHATWOOT_ACCOUNT_ID`, `CHATWOOT_INBOX_ID`, `CHATWOOT_BOT_ID`
  - `CHATWOOT_DEREK_USER_ID`, `CHATWOOT_BRANDON_USER_ID`
  - `CHATWOOT_BOT_TOKEN`, `CHATWOOT_WEBHOOK_SECRET`
  - `BOT_DATA_DIR=/home/ubuntu/chatbot/data`
- **Layout:** `/home/ubuntu/chatbot/{.env, data/, releases/<ts>-<sha12>/, current}`. Each release's `data` is a symlink to `/home/ubuntu/chatbot/data`, so state and logs survive upgrades.
- **Path:** sidekiq → `https://chat.poolrentalnearme.com/prnm-bot/webhook`, which `extra_hosts` resolves to 3.222.110.146:443. nginx `/prnm-bot/` allows only that IP and 127.0.0.1, POST only, `limit_req` 300 r/s with a burst of 600, a 1 MB body cap, and connect/read timeouts of 2 s / 3 s. It proxies to 127.0.0.1:3120.
- **The bot must:** ack within 3 s and never return 502/503/504 itself. nginx maps a dead or hung bot to 500, which Chatwoot 4.19.1 retries (3 tries, 3 s apart). After that, Chatwoot opens the chat with **no push** unless `KEEP_PENDING = "true"`. `cw_status.py` counts these as bot-failure opens.
- **Security group:** EAST's security group must keep allowing 443 from EAST's own public IP.
- **Alert markup:** `cw_status.py` counts a founder alert as an AgentBot private note containing `(mention://user/`. If the engine changes its mention markup, update `ALERT` there.

## Design notes

- **Webhook URL.** The webhook URL is the public HTTPS name, not the docker gateway. Chatwoot posts agent-bot webhooks through SafeFetch, which refuses private and loopback addresses. `SAFE_FETCH_ALLOW_PRIVATE_NETWORK` must stay unset, because turning it on would let visitor-supplied URLs reach internal services. `cw_harden.py` and `cw_nginx.py` refuse while it is set, and `cw_status.py` shows it.
- **Image.** CE 4.19.1: Community Edition, as the brief asks (the running image is EE on the free plan), and the newest v4 release at review time, with security fixes after 4.16.2. `cw_setup.py` and `cw_nginx.py` require 4.19.1, so `IMAGE = "ce"` is the only path the later steps accept.
- **Proxy headers.** `FORCE_SSL=true`: every local caller sends `X-Forwarded-Proto: https`. The client IP comes from EAST's Cloudflare real-IP snippet. The vhost overwrites `X-Forwarded-For` with the visitor: the IPv4 address, or for IPv6 the /64 written as an address (`2001:db8:0:0::` for any address in `2001:db8::/64`). So Rack::Attack limits apply per visitor, and a client with a whole /64 (any VPS) is still one visitor. Chatwoot therefore records an IPv6 visitor's /64, not the full address. `X-Real-IP` keeps the full address.
- **Throttles.**
  - nginx per visitor (IPv4 address or IPv6 /64, the same key as `X-Forwarded-For`):
    - whatever makes a contact, in one zone: `/widget` loads and `POST /api/v1/widget/config` (which makes a contact on every call; Rack::Attack has no rule for it, and the 4.19.1 web widget never calls it): 10 per minute, burst 10;
    - widget events and message updates: 1 r/s, burst 10;
    - all widget API: 10 r/s, burst 40.
  - `/auth/password` answers PUT only (see step 5).
  - Widget bodies are capped at 16 KB.
  - Rack::Attack: `RATE_LIMIT_WIDGET_CONVERSATIONS=2` (per minute in 4.17+), `RATE_LIMIT_WIDGET_MESSAGES=20`, `RATE_LIMIT_WIDGET_LOAD=20`. These do not restore 4.16.2's 6 per 12 h. The engine's D3 caps bound the founder alerts.
  - Optional defense in depth, not configured by any script: a free Cloudflare rate-limiting rule on `/widget`, `/api/v1/widget/config` and `/api/v1/widget/messages` (Security → WAF → Rate limiting rules). Check the plan's current limits for that rule type in the dashboard first; nginx stays the bound either way.
- **Container logs.** Rails logs every widget request with its params and sidekiq logs each webhook retry, on the `/` that Postgres and fresh-web share. Each container keeps at most 5 files of 20 MB (json-file, set in the compose by `cw_harden.py`), so at most 400 MB for the four.
- **Site widget (D1).**
  - The launcher is PRNM's own `#prnm-chat-launcher`, bottom-left, labelled "Chat". `sdk.js` loads only on click, or on page load for a visitor with a `cw_conversation` cookie.
  - The script tag carries `integrity` (= `VITE_CHATWOOT_SDK_SRI`) and `crossorigin="anonymous"`, from `sdk.js?v=<16 characters of the SRI>`, so a new SRI is a new URL.
  - A missing or malformed token or SRI renders nothing.
  - The launcher is hidden:
    - on checkout, payment and payout pages at all widths;
    - on listing, transaction and listing-editor pages at ≤1024 px;
    - while a modal or the `/s` filters sheet is open;
    - on EAST, while the page scroll is locked.
  - Code: `src/components/ChatwootWidget/` and `east/chatwoot-widget.tsx`.
- **Push (D5).** Each handoff pushes each founder twice:
  - "new conversation", whose body is the first 10 words of the customer's **first** message, unredacted. A card number typed there goes through the push relay.
  - the @mention.

  "Participating" is off, so later messages push nobody until a founder assigns the chat to himself (the note asks him to); after that each new message pushes him. Auto-assignment stays off: it picks only agents shown online in the dashboard. To silence a troll, block the contact.
- **2FA.** It is enforced on the account. Each founder enrols on the web before using the mobile app. The bot token is exempt. `/super_admin` is closed to the public (super admin sign-in has no 2FA).
- **Visitor files are off.** No attachments, a 1 MB upload cap, and direct uploads and Active Storage writes are blocked in nginx.
- **EAST deploy.** The live `dist` is never built into. The staged copy hard-links only `node_modules`, so the router plugin's in-place rewrite of `src/routeTree.gen.ts` can't write through to the live tree. The pm2 restart still leaves a gap of a few seconds.
- **Website token.** It is public (it ships in every page) but stays out of source. WEST reads it from the build tree's `.env` and EAST from `.env.production.local`.

## Local tests

```bash
python3 ops/chatbot/ops/selfcheck.py                        # --embed after editing cw_setup.rb
python3 ops/chatbot/ops/tests/test_cw_harden.py             # real-PostgreSQL part: root + /usr/lib/postgresql/16/bin
python3 ops/chatbot/ops/tests/test_cw_setup_nginx.py        # real-nginx part is skipped without an nginx binary
python3 ops/chatbot/ops/tests/test_east_widget.py
python3 ops/chatbot/ops/tests/test_bot_deploy_local.py --rev <commit>   # pm2 + logrotate; git-archive snapshot
python3 ops/west/c208/test_c208.py
cd ops/chatbot && npm test
```

`test_bot_deploy_local.py` proves the log rotation with signed messages (each logs a line), not with 401s (logged at most once a minute).

**Box facts** (read-only probes, November 2026):
- RAM 3,831 MB, with about 2.1 GB available; 2 GB swap, unused; about 4.6 GB free on `/`.
- Node v20.20.2, pm2 7.0.1, nginx 1.28.3, systemd 259 with cgroup v2, logrotate 3.22.
- Chatwoot uses about 1 GB.
- The sidekiq → public-IP hairpin answered.

## Open before going public (ops and widgets, 2026-11-13 review)

Engine gaps are listed in `../README.md`.

- **IPv6 per /64, not yet seen on EAST:** the vhost keys visitors on the IPv6 /64. The map was tested only in a local nginx 1.24 (EAST runs 1.28.3), with Cloudflare's header faked, never with a real IPv6 client through Cloudflare. Before going public, from a machine with an IPv6 /64 (most VPSs): send 11 loads of `https://chat.poolrentalnearme.com/widget?website_token=prnm-verify&cw_conversation=x` from one of its addresses (`curl -6 --interface <address>`), then one from another address in the same /64. That 12th must get 429, and EAST's access log must show the IPv6 address. A bad token makes no contact.
- **Widget, unread preview:** an unread preview already on screen when the widget hides (going to checkout, a modal, or a listing page at ≤1024 px) is closed, and Chatwoot then marks the reply as seen. Fix: close only the full chat, not the preview.
- **Widget, short screens:** on short landscape screens (1024×768, 667×375) the open card can run under the sticky header.
- **Not re-checked on EAST:** the DRY runs of `cw_harden`, `cw_setup`, `cw_nginx` and `cw_status` were not re-run on EAST after this round's edits (including the 2026-11-13 round-3 fixes: config zone, IPv6 /64 key, reset PUT only, log caps).

## Decisions for Derek

1. **A second urgent report in the same chat within 24 h.** The per-conversation cap (D3) means it gets no new push, even after a resolve. The customer still gets the 911 line, and the chat gets the `urgent` label and priority. Options: allow one extra urgent alert per conversation, or a small separate hourly allowance only for urgent safety alerts.
2. **`KEEP_PENDING`** (`cw_setup.py`). When the bot is down past Chatwoot's retries: `""` (Chatwoot's default) or `"false"` opens the chat with no push; `"true"` keeps it with the bot, which answers the next message, but it doesn't show in the Open view.
3. **DNS:** proxied (recommended) or DNS-only.
4. **GO for the `east_widget.py` TRIAL build** before the real run. The real build on the t3.medium has never been measured.
5. **The container log cap.** `cw_harden.py`'s compose plan now caps each container's log at 5 × 20 MB (free; the DRY plan shows it). The GO for `cw_harden.py` covers it; to leave it out, say so and the `logging` lines come out of the plan.
6. **Chatwoot DB backups after go-live.** A nightly local `pg_dump` would be a new scheduled job, disclosed under rule 4 when created.
7. **Widget reply time** is "in a day", the least promising option. It can be changed in the inbox settings and must never promise minutes.
8. **Behaviour to confirm:**
   - a bare "help" now gets the 911 safety question;
   - accusations and legal threats get a calm, normal-priority handoff (legal threats keep the rule-8 note).
9. **Bank decisions:** "Waiting on Derek" in `../README.md`.
