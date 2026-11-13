# WEST release c208-chat-widget

This release ships the PRNM chat launcher (`#prnm-chat-launcher`) to the marketplace. Chatwoot's `sdk.js` loads only when a visitor clicks the launcher, or when they already have a `cw_conversation` cookie, and the script is pinned with SRI. The release is modelled on `ops/west/c207/patch_c207.py` and follows the CLAUDE.md deploy ritual: patch the build tree, run a memory-capped build, gate on :3000, and only then flip.

**Nothing here has been run for real.** Every script defaults to `DRY = True`. `patch_c208.py` and `scripts_c208.py` also refuse to run while any `REPLACE_*` placeholder is left.

## Files

| File | Runs where | What it does |
|---|---|---|
| `patch_c208.py` | WEST, via `ops/runners/ssm_runx.py` | **Step 1.** Patches `/home/ubuntu/build`: replaces `src/routing/AppRouter.jsx` and `server/csp.js`, adds the 3 `src/components/ChatwootWidget/` files, and appends the 2 public `VITE_CHATWOOT_*` lines to the build tree's `.env`. |
| `scripts_c208.py` | WEST, via `ssm_runx.py` | **Step 2.** Writes `/home/ubuntu/{build,gate,flip}-c208.sh` from the c207 scripts, using exact-anchor replacements. |
| `gate_c208_block.sh` | fetched by step 2 | The new c208 gate checks. It is fetched at the pinned commit and sha256-checked. |
| `flip_c208_block.sh` | fetched by step 2 | The new c208 flip checks and the abort that returns traffic to MAIN. Fetched at the pinned commit and sha256-checked, like the gate block. |
| `launch_c208.py` | WEST, via `ssm_runx.py` | `DRY = True` prints where the release stands: each step's `.done`, log size and age, and the running c208 scripts. `DRY = False` starts the next step (build, then gate, then flip) outside the SSM command and confirms it is running. |
| `pin_c208.py` | local only | Fills in `SHA`, every sha256 (5 files and 2 blocks), and optionally `TOKEN`/`SRI`, from a commit. |
| `test_c208.py` | local only | 56 tests. They run the scripts against a throwaway fake box and run the gate block under `sh` with curl/docker stubs. The whole generated `flip-c208.sh` also runs under `sh` against a simulated nginx, docker and curl, including aborts at each stage. |
| `fixtures/c207/` | – | Byte-exact copies of the c207 scripts on WEST, md5-verified, with 0 secret-pattern hits. |
| `fixtures/csp_*.txt` | – | The live c207 `/login` CSP header, and the header the new `server/csp.js` renders. |

## What the read-only probes found on WEST (2026-11-06)

**Build tree matches the repo.** `/home/ubuntu/build` matches the repo before the change (`a0761c8`):
- `AppRouter.jsx` md5 `c30d1847…` and `server/csp.js` md5 `f8c3beae…` are pinned.
- `src/components/ChatwootWidget/` does not exist.
- The 5 files the widget imports are byte-identical to the repo: `routeConfigurationContext.js`, `ui.duck.js`, `useMediaQuery.js`, `util/routes.js` and `routeConfiguration.js`. All 12 route names that the hide rules use exist. The probe checked 11; `PayoutDashboardPage`, added since, is in the same `routeConfiguration.js`, which is md5-pinned byte-identical to the box.
- React is 18.2, so `useSyncExternalStore` is available.

**Where the build reads `VITE_*` from: only the build tree's `.env`.**
- The build tree's `Dockerfile` is not the repo's. It uses bun 1.2.4, its build stage runs `COPY . .` then `bun run build`, and `vite.config.mjs` calls `loadEnv()`.
- The Dockerfile declares no `ARG`, so `--build-arg` never reaches the build. The c207 build log says so: `[Warning] One or more build-args [VITE_SHARETRIBE_USING_SSL] were not consumed`.
- `.env` (mode 600) already holds the other 17 `VITE_` names and no `VITE_CHATWOOT_*`.
- No `.env.local`, `.env.production` or `.env.production.local` exists. The patch refuses if one appears, because it would override `.env`.
- The packaging stage also `COPY .env .env` into the runtime image. That was already true before c208; this release leaves it alone.

**Release scripts:**
- `build/gate/flip-c207.sh` exist, with md5s `fddf1ce1…`, `1b70e733…` and `f1940a80…`. These md5s are pinned in `scripts_c208.py`.
- No `*-c208*` file or `backup-c208` exists yet.
- MAIN runs c207 on :4000, which is where nginx `upstream web` points. The rollback container runs c206 on :3000. So the gate runs on :3000, as in c207.

**Round-2 read-only probe (2026-11-06):**
- `/etc/nginx/conf.d/main-web.conf` is byte-identical to `/home/ubuntu/fallback-web.conf` (md5 `4ad4a50c…`, `127.0.0.1:4000`), and `/home/ubuntu/main-web.conf` points at `127.0.0.1:3000`. So swapping `fallback-web.conf` back restores exactly the pre-flip nginx state.
- MAIN and the rollback container have `restart=unless-stopped`. The gate's `docker run` (carried forward from c207) has no restart policy, so the flip gives the gate one (see below).
- How an SSM command is contained: it runs in its own process group (pgid differs from pid), under the agent's session, in the cgroup of `snap.amazon-ssm-agent.amazon-ssm-agent.service`, which is `KillMode=process`. A step started in its own session (`setsid`) is outside both the process group SSM kills on timeout and the agent's own restart. Agent 3.3.4793.0 (classic snap, refreshes up to 4 times a day).
- Ubuntu 22.04.2, systemd 249: `systemd-run --collect` is available for the fallback. `setsid`, `sudo` and `shred` exist.
- No `*c208*` file, no `backup-c208`, no `build/.env.c208tmp`, and no c207/c208 script is running. The c207 scripts still have the pinned md5s.

**Dry runs on the box:**
- A DRY copy of step 2 with fake public values applied every anchor to the real c207 scripts: `DRY RUN: checks passed, nothing written`.
- A DRY copy of step 1 failed only where it was expected to:
  - the five sha256 checks, because the pins are for the not-yet-committed files;
  - `sdk.js`, because `chat.poolrentalnearme.com` does not resolve yet.
- That copy reported no drift, no dependency drift, no `.env` problem and no existing backup.
- The real scripts refuse on the box: `placeholders remain: SHA, TOKEN, SRI`.
- Round 2: the new flip anchors (the block insert, `BACK=1`, `BACK=0`) are applied in the tests to `fixtures/c207/`, which the round-2 probe re-confirmed are md5-identical to the scripts on the box. The new `launch_c208.py` ran DRY on the box and listed every step as `done=-, no log` with no c208 script running.

## Order (each step only after the previous one passed, and only on Derek's go)

**0. Before WEST.**
- The EAST Chatwoot side must be public: `cw_setup`, `cw_nginx` (which sends `Access-Control-Allow-Origin: *` on `/packs/js/sdk.js`) and `east_widget.py`.
- That work prints the website token and the SRI, and both are public.
- The widget files must be committed and pushed.

**1. Pin locally:**
```
python3 ops/west/c208/pin_c208.py <commit> --token <website token> --sri <sha384-…>
python3 ops/west/c208/test_c208.py
```
`pin_c208.py` recomputes every sha256 from `git show <commit>:<path>`, then you commit the pinned scripts. They contain only public values.

**2. Dry runs.** Each must print `DRY RUN: checks passed`:
```
python3 ops/runners/ssm_runx.py ops/west/c208/patch_c208.py
python3 ops/runners/ssm_runx.py ops/west/c208/scripts_c208.py
```
`patch_c208.py` also checks that the live public `sdk.js` hashes to the SRI and sends CORS. If it does not, every visitor would get the "Email us" fallback.

**3. Real runs.** Use a copy with `DRY = False`: first `patch_c208.py`, then `scripts_c208.py`.
- Backups go to `/home/ubuntu/backup-c208/` (mode 700): the old `AppRouter.jsx`, `csp.js` and `.env`, plus `NEW_FILES`.
- Token and SRI values are never printed.

**4. Build, gate, flip.** Run `launch_c208.py` with `DRY = False` and `STEP = "build"`. Poll it with `DRY = True` until `build-c208.done` reads `OK`. Then do the same with `STEP = "gate"`, then `STEP = "flip"`.
- The launcher refuses to start a step out of order, while any c208 script is still running, or a second time.
- After starting a step it waits up to 10 s and prints the pid. It aborts if the script is neither running nor has written a `.done`.
- **First real start (`STEP = "build"`):** poll with `DRY = True` within a minute, after the SSM command has ended. The build pid must still be listed under `running c208 scripts`, and `build-c208.log` must show a small "last written" age.
- If the pid is gone and there is no `build-c208.done`, the SSM session reaped the step, which setsid is not expected to allow (see the probe). In that case set `HOW = "systemd-run"` and start the step again. It then runs once as the transient unit `prnm-c208-<step>` (`systemd-run --unit=prnm-c208-<step> --collect`). That unit is not a schedule and does not run again. Disclose the unit name to Derek in the same message, per CLAUDE.md rule 4, and check it with `systemctl status prnm-c208-<step>`.
- A flip that already ran, even one that aborted, is never re-run automatically. After an abort that printed `nginx back on 127.0.0.1:4000`, production is in its pre-flip state. A re-run is still a manual decision: read `flip-c208.log`, then remove `flip-c208.done`.

## What the generated scripts do

Each generated script is the c207 script plus only the changes below. The tests check this by undoing the c208 changes and comparing byte for byte.

**`build-c208.sh`:**
- Same memory caps (`DOCKER_BUILDKIT=0 docker build --memory=2500m --memory-swap=2500m`, tests at 1200m), and the same rollback stop during the build.
- New: a guard that fails the build if the build tree is not patched.
- New: `chatwootLoader.test.js` added to the build-stage `bun test` list. It passes under bun 1.2.4, the build stage's version (28 pass with the current file, run locally; it imports nothing else).
- Tags: `c208-chat-widget-buildstage` and `c208-chat-widget:latest`.

**`gate-c208.sh`:** every c207 check is carried forward unchanged, including:
- the promo math (`CUSTOMER_BOOKING_FEE_PCT = 15`);
- the payment endpoints;
- the c207 Intercom block.

The new c208 block runs before `GATE PASSED` and checks:
- the client bundle contains `prnm-chat-launcher`, the website token and the SRI, which proves `.env` was read;
- the server HTML of `/login` and `/` has no `sdk.js`, no launcher and no Intercom;
- the `/login` CSP names `https://chat.poolrentalnearme.com` in exactly `connect-src`, `frame-src` and `script-src`, with no `wss:` or `http:` source for it. `connect-src` is needed because the SDK `fetch()`es `/audio/widget/ding.mp3` from the page;
- the live `sdk.js` still matches the SRI and sends CORS.

**`flip-c208.sh`:** `OLD` is now c207. The new `flip_c208_block.sh` is inserted after the env preflight, before nginx is touched (step 0b), and does the following:
- **Precondition.** `/etc/nginx/conf.d/main-web.conf` must be byte-identical to `fallback-web.conf` (:4000), and `main-web.conf` must point at :3000. Otherwise the flip aborts with production untouched.
- **Restart policy for the gate.** `docker update --restart unless-stopped` on the gate container, which serves live traffic from step 1 to step 3. If the box reboots in that window, the upstream comes back instead of returning 502.
- **Which container serves.** It reads the `assets/index-<hash>.js` entry that the gated c208 serves on `/login`, and checks that the gated image contains `prnm-chat-launcher`. After step 1 and after step 3, live `https://www.poolrentalnearme.com/login` must serve that same entry, with 3 tries 5 s apart. This is the CLAUDE.md "prove which container serves" check. `/login` is `cf-cache-status: DYNAMIC`, so Cloudflare does not cache it.
- **Abort returns traffic.** `abort()` is redefined. `BACK=1` is set just before step 1 copies `main-web.conf`, and `BACK=0` just before step 2 removes MAIN. Any abort in that window, whether from the c207 status checks, `nginx -t`, the index check, or a TERM/HUP/INT (trapped), first copies `fallback-web.conf` back, runs `nginx -t` and reloads. It then prints the port and the live `/login` status, and writes `ABORTED`. Signals are ignored while it swaps back. If the swap-back itself fails, it says so loudly.

## Rollback

**Traffic:**
- After the flip, the rollback container runs c207 on :3000.
- To send traffic back, run `sudo cp /home/ubuntu/main-web.conf /etc/nginx/conf.d/main-web.conf && sudo nginx -t && sudo systemctl reload nginx`. This is a reload, with no 502 window.
- Then follow the CLAUDE.md ritual so that the container named `poolrentalnearme-production` runs the image you intend, because the crons exec into it.
- What a flip abort leaves. Read `flip-c208.log` and decide by hand:
  - **In step 0 or 0b:** production is untouched. The gate may have been given a restart policy.
  - **From step 1 until step 2 starts:** traffic is returned automatically to MAIN (c207, :4000), which was never touched, and the log says `nginx back on 127.0.0.1:4000`. If it says `SWAP-BACK FAILED` instead, run `sudo cp /home/ubuntu/fallback-web.conf /etc/nginx/conf.d/main-web.conf && sudo nginx -t && sudo systemctl reload nginx` by hand.
  - **From step 2 until step 3 moves nginx:** live traffic is on the gated c208 (:3000), which now restarts after a reboot. MAIN may be gone or not yet healthy. Nothing is swapped automatically.
  - **After step 3:** live traffic is on the new MAIN (c208, :4000). What may be left is the inbound check and step 4 (retire the gate, start the c207 rollback container on :3000).
- A `SIGKILL` or a power loss cannot be trapped. If `flip-c208.done` is missing and no c208 script is running, read the log and the `nginx before`/`after` lines to see which state applies.

**Build tree:** copy `AppRouter.jsx`, `server/csp.js` and `.env` back from `/home/ubuntu/backup-c208/`, keeping `.env` at mode 600. Then delete the paths listed in `NEW_FILES`, the empty `ChatwootWidget/` directory, and `/home/ubuntu/build/.env.c208tmp` if a crashed run left it.
- `patch_c208.py` refuses while `backup-c208/` or `build/.env.c208tmp` exists.
- It creates the temporary `.env` (O_EXCL) before it changes any build-tree file, so a clash there stops the run with nothing patched.

**There is no runtime off switch.** The `VITE_` values are compiled in at build time. If Chatwoot's `sdk.js` changes, the SRI fails and the launcher falls back to "Email us". Any Chatwoot image change needs a new SRI and a rebuild of both WEST and EAST.

## Payload

The scripts are measured in the plain `ssm_runx.py` form, with a 40-character SHA, a 64-character token, the SRI and `DRY = False` filled in. The limit is 9,500.

| Script | Size |
|---|---|
| `patch_c208.py` | 8,788 |
| `scripts_c208.py` | 8,720 |
| `launch_c208.py` | 5,008 |

A single script doing both steps would have been about 16,000. So the work is split in two, both blocks are fetched (sha256-pinned), and `ship_big.py` is not needed.
