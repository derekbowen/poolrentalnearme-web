# EAST release tooling: one fresh-web SHA, five EAST-only files kept

`east_seo_release.py` ships one fresh-web commit to EAST (`/home/ubuntu/fresh-web`,
pm2 `fresh-web` as `ubuntu`). It keeps the five files that exist only on EAST exactly
as they are:

```
src/components/home-page.tsx   src/routes/__root.tsx   src/server/listing-sync.server.ts
src/server/sharetribe.server.ts   src/lib/listing-slug.ts (untracked)
```

The release itself is gated by the release's own `ops/deploy-east.sh` (fresh-web
`seo/07-release-tracking`: `8229cee`, `8f7c105` and `c9fd110`, the build-copy and
proven-restart commit). That script:
- accepts a **pinned allowlist**: a dirty file is tolerated only if the pin file lists it
  and its sha256 equals the pin. Every pinned file must be dirty, every dirty file must be
  pinned, and the build stamp must list exactly that set. Without a pin file it behaves as
  before. `check:deployed-sha` and `check:production-drift` take the same exact set
  through `TOLERATED_DIRTY_FILES`, which `deploy-east.sh` exports.
- **builds in a copy** of the tree (`/home/ubuntu/fresh-web.build`), never in the live
  `dist/`. vite empties its output directory first, and `serve.mjs` reads every static
  file from `dist/` on each request, so the old in-place build left the live site without
  its JS and CSS (and the running server without its lazily imported route chunks) for the
  whole build. Now the live `dist/` changes only at step 5, by two renames, right before
  the restart.
- **carries the previous build's hashed assets** into the new `dist/` (one generation,
  listed in `dist/.own-assets`), because Cloudflare holds `/` and `/p/*` HTML that names
  them for 600 s.
- **proves every restart**: pm2 must report `fresh-web` online with a new pid/uptime.
  The live stamp cannot prove it, because `serve.mjs` reads `__build.json` from disk.
- restarts with plain `pm2 restart fresh-web`, **not `--update-env`**, so the deploy
  shell's variables never merge into the live process (and `dump.pm2` stays true).

Nothing here has run on EAST. It has been tested only against the local simulation in
`test/`.

## Before you run it

1. The release branch (`seo/release-2026-11`) is merged and pushed to the public repo
   `derekbowen/fresh-web-702e04c3`. It must contain the current `seo/07-release-tracking`
   (the allowlist, the build copy and the proven restart in `ops/deploy-east.sh`). The
   script refuses a release whose `deploy-east.sh` lacks any of the three.
2. Edit the constants at the top of a **copy** of the script:
   - `RELEASE_SHA`: the full 40-hex tip of the release branch.
   - `RELEASE_BRANCH`: `seo/release-2026-11`.
   - `MODE`: `PLAN` first, then `GO`. `ROLLBACK` is only for after a GO.

   The committed file has placeholders and refuses to run as PLAN or GO.
   `CURRENT_SHA` is `7702845…`, the commit EAST runs today. After one release, set it
   to that release's SHA for the next one.
3. Each GO is its own approval item. A PLAN run changes nothing.

## Run

The script is larger than one SSM command (9,500 characters), so it is shipped with
`ship.py`, not `east_runx.py`. `ship.py` gzips and base64-encodes it, sends it as a few
small "write part n" steps, then one loader step that reassembles it, checks its sha256
(a missing or altered part is an ABORT and nothing runs), and runs it. Every step is an
ordinary run of `ops/runners/_runner_common.run`, the same code `east_runx.py` uses. The
loader declares the script's `RUNNER_TIMEOUT`, passes the remaining budget on, forwards
SIGTERM and exits with the script's exit code.

From a machine with the `PRNM_AWS_*` credential (see `ops/runners/_runner_common.py`):

```
cp ops/east/seo-release-2026-11/east_seo_release.py /tmp/rel.py   # then edit the constants
python3 ops/east/seo-release-2026-11/ship.py /tmp/rel.py          # MODE = "PLAN"
```

PLAN should finish within a minute or two (one anonymous fetch and a few git commands).
Then set `MODE = "GO"` and start it **in the background**, because a build takes several
minutes, longer than one interactive tool call:

```
python3 ops/east/seo-release-2026-11/ship.py /tmp/rel.py > /tmp/rel-go.log 2>&1 &
grep "command id" /tmp/rel-go.log                 # one id per step; the LAST one is the run
python3 ops/runners/east_runx.py --result <command-id>   # re-read status/output at any time
```

`RUNNER_TIMEOUT = 3600` is declared in the script, so the run step gets 3600 s from SSM.
The script keeps `RECOVER_S = 900` s of that for recovery and gives `deploy-east.sh` the
rest (it refuses to start if that is under `DEPLOY_MIN_S = 600`). Every recovery step has
its own bounded timeout so that recovery fits in what was kept. Output is kept small:
only the `deploy-east.sh` step lines, the verdict, and on failure the last 15 lines. SSM
truncates output past about 24 KB.

## What each mode does

**PLAN** (read-only):
- **Preflight checks:**
  - The repo exists.
  - HEAD == `CURRENT_SHA`.
  - `git status` shows exactly the five files as dirty, under both of EAST's filters
    (`deploy-east.sh` step 1 and `stamp-build.mjs`).
  - It records their sha256 (it prints 16 hex characters, never the contents).
  - pm2 `fresh-web` is online. `pm2 jlist` is parsed, never printed, because it carries
    the process environment. Only its pid/restart count/uptime and the NAMES of its env
    variables (as a hash and a count) are kept.
  - It reports MemAvailable, SwapFree, free disk and the size of `dist/`.
  - The live stamp and the `dist/` stamp both equal HEAD.
  - Each of the five files' mtime is printed and compared with the live build's
    `builtAt`. A file changed after the live build holds content production does not
    run, so it would ship unreviewed: GO refuses until someone has read the change and
    sets `ALLOW_EAST_ONLY_NEWER = True` in the copy. (mtime, not ctime: ctime also moves on
    a chown or chmod. A deliberately back-dated mtime is not caught.)
- **Fetch and inspect:** it fetches `refs/heads/<RELEASE_BRANCH>` anonymously from
  GitHub into a **throwaway** `/tmp` repo that borrows the real repo's objects. The real
  repo is not written. Then it checks:
  - The branch tip == `RELEASE_SHA` (a moved branch is refused).
  - The release descends from HEAD.
  - The changed files are printed.
  - None of the five files is touched or added.
  - The release adds no path that exists untracked on the box.
  - There is no lockfile or dependency change. This tool never runs `npm install`;
    `ALLOW_LOCKFILE_CHANGE = True` is the explicit override.
  - The release's `deploy-east.sh` has the allowlist.
- **GO gates:** PLAN reports whether GO would refuse:
  - `dist-prev-deploy` is left over from an unfinished deploy.
  - a five file changed after the live build (above).
  - `MemAvailable` is below `MIN_AVAIL_MB = 2048` (swap does not count).
  - there is no `systemd-run` with the cgroup v2 memory controller, so the build could
    not be memory-capped.
  - Free disk is less than 3 × the size of `dist/` + 1 GB.
  - the SSM budget minus `RECOVER_S` leaves less than `DEPLOY_MIN_S` for the deploy.
  - It prints the memory cap GO would use.

**GO** runs everything PLAN runs, then:
1. It fetches the verified commit from the throwaway repo into the real repo (FETCH_HEAD
   only, no refs).
2. It writes the pin file `/home/ubuntu/fresh-web.east-only.sha256` (`<sha256>  <path>`,
   mode 644, outside the tree). This file is also `deploy-east.sh`'s default pin path,
   so later plain `deploy-east.sh` runs keep tolerating exactly these five.
3. It copies `dist/` to `/home/ubuntu/fresh-web-release-backup/dist-<prev12>` and the five
   files to `east-only-<prev12>.tar` beside it (mode 600; for a human, the tool never
   restores them). It writes the state file `/home/ubuntu/fresh-web.release-state.json`,
   which holds:
   - the previous sha and branch
   - the release sha
   - the pins
   - the backup path
   - the previous `.deployed-sha`
   - pm2's pid/restart count/uptime and env-name hash at preflight
   - the deadline after which only recovery may run
4. It runs `git checkout -B <RELEASE_BRANCH> <RELEASE_SHA>`. Git carries the five local
   files over and refuses rather than merging. The script then re-checks HEAD and the
   five hashes.
5. It runs the release's `ops/deploy-east.sh` as `ubuntu`, with
   `NODE_OPTIONS=--max-old-space-size=3072`, `EAST_ONLY_SHA256=<pin file>`, `REPO_DIR` and
   `BASE_URL`, wrapped in `timeout`, inside a **memory-capped systemd scope**:
   `systemd-run --scope -p MemoryMax=<MemAvailable − 512> MB -p MemorySwapMax=<≤1536> MB`.
   If the build needs more, the kernel kills it inside the scope (the deploy fails and
   recovers) instead of pushing the live fresh-web or Chatwoot out of memory. On its first
   output line the script checks that every deploy process it can read is in that scope
   (so a PAM session that moved `sudo` out of it is caught), else it stops the deploy and
   recovers. It prints the scope's memory peak at the end. `deploy-east.sh` applies the
   heap to the typecheck and the build only. Its gates:
   - build copy at `/home/ubuntu/fresh-web.build` (pins re-verified in the copy)
   - typecheck (in the copy)
   - build (in the copy; the live `dist/` is untouched)
   - stamp sha == HEAD, with dirty == exactly the pinned set (pins re-verified)
   - smoke on :3005 of the copy's `serve.mjs`
   - carry the previous build's assets over, swap `dist/` by rename, `pm2 restart fresh-web`
     (no `--update-env`), restart proven
   - live stamp == HEAD
   - verify:production
   - check:price-variants (with `.env`)
   - pins re-verified, then the `.deployed-sha` attestation (now listing `eastOnlyFiles`)
   - check:production-drift
6. After a success, it prints the live stamp and runs the tracker's `regression` group
   from a `/tmp` copy, so its reports never land in the repo tree. It compares pm2's env
   variable names with preflight (names only). It ends with one `RESULT: RELEASED …` line
   and exits 0. The dist backup is kept for ROLLBACK.

Any exception, `die()` or SIGTERM after the state file is written stops the running deploy
(every process in its tree) and runs the recovery. A SIGKILL cannot be handled: run
ROLLBACK.

**ROLLBACK** reads the state file and checks two things:
- HEAD is the release or the previous commit.
- The five files still match their pins.

Then:
- If `dist/` is not the previous build, it puts the previous build back: `dist-prev-deploy`
  if its stamp is the previous sha, otherwise its own backup.
- It checks out the previous commit, by its branch (`ops/deploy-sha-enforcement`), and
  keeps the five files.
- It **always** runs `pm2 restart fresh-web` and requires proof (pm2: online, new
  pid/uptime), then waits up to 120 s for the live stamp to report the previous sha. A
  restart that fails, or that pm2 reports but that did not happen, makes it
  `ROLLBACK INCOMPLETE`, even though the stamp on disk already reads the previous sha.
- It restores the previous `.deployed-sha`, or removes it if there was none.

ROLLBACK does not need the constants filled in.

## What each failure leaves behind

| Failure | Repo / dist / live afterwards | Files written |
|---|---|---|
| Placeholders, HEAD mismatch, dirty set wrong, pm2 not online, live/dist stamp mismatch, GO gate | untouched | none |
| Fetch fails, branch moved, not a descendant, touches/adds a five file, lockfile change, old `deploy-east.sh` | untouched; the real repo is not even fetched into | none (the `/tmp` throwaway repo is deleted) |
| `git checkout` refuses | untouched | pin file, state file, dist backup (harmless; reused next GO) |
| `deploy-east.sh` fails before step 5: a five file changed after preflight or during the build, typecheck, build, stamp, smoke; or it is killed there (timeout, SIGTERM, the deploy left its memory scope) | HEAD back on the previous commit; the live `dist/` and the running process were never touched (the build was in the copy, which is removed) | as above |
| Fails from step 5 on: the restart cannot be proven, the live stamp never reports the release, verify:production / price-variants / drift fails | `deploy-east.sh` moves the previous `dist/` back and restarts (proven, or its ABORT says it is not). The script checks out the previous commit, restores `dist/` from its backup if needed, and restarts again whenever pm2 restarted since preflight (the release may be loaded in memory), with proof | `.deployed-sha` restored to what it was |

Every failure ends with `RESULT: FAILED, <why>. live <sha>; pm2 <status>; …` and exit 1.
"Back on the previous build" is printed only when the restart was proven and the live
stamp reads the previous sha. If a five
file was changed on the box during the run, the tool leaves it as found and says
`BUT … check by hand`. It never reverts that file. If the run says
`NOT FULLY RECOVERED`, run ROLLBACK, then check by hand.

If SSM itself kills the whole run with SIGKILL (it should not: `RECOVER_S` is kept back),
run ROLLBACK. The state file and the dist backup are written before anything moves.

Cleanup after a release has been accepted:

```
rm -rf /home/ubuntu/fresh-web-release-backup/dist-<prev12>
```

That removes the backup, which takes about one `dist/` of disk. Keep the pin file. It
is what lets the next `deploy-east.sh` run accept the five.

## Known limits

- Between the `dist/` swap and the end of the restart (a few seconds) the old process
  still runs: a route chunk it has not imported yet, or a static file of the old build
  the new one lacks, can fail in that window. The previous build's client assets are
  carried over, so old HTML keeps working after the restart.
- The build copy needs everything the build reads from the tree. It takes the whole
  working tree, ignored files included, except `.git`, `node_modules` (linked), `dist*`,
  backups and logs. If EAST's tree holds another large or build-relevant directory,
  check what step 1a prints (the copy's size) on the first PLAN-then-GO.
- The memory cap relies on `sudo` keeping the scope's cgroup. Ubuntu's `sudo` PAM stack
  (`common-session-noninteractive`) does not load `pam_systemd`, so it should; the script
  checks it on the first output line and stops the deploy if not. The scope's peak memory
  has never been measured on the t3.medium: the first GO reports it. If the build is
  killed inside its cap, production is untouched; the options are then more swap or a
  temporary resize for the build window (the owner's decision).
- The script trusts `CURRENT_SHA` and the pins it records at preflight. It does not
  decide whether the five EAST-only files are correct. It only keeps them byte-for-byte,
  and refuses ones changed after the live build (by mtime).
- Cloudflare: the live stamp is read through `www.poolrentalnearme.com`. `serve.mjs`
  serves `__build.json` as `no-store`, and the polls add a cache-buster.

## Tests

```
python3 ops/east/seo-release-2026-11/test/run_tests.py            # about 5 min, 42 scenarios, 310 checks
python3 ops/east/seo-release-2026-11/test/run_tests.py --only happy_path --show --keep
```

The harness simulates EAST under the session scratchpad (`release-test/sim`, or
`$RELEASE_TEST_DIR`). It uses:
- a local bare repo standing in for GitHub, with the release commit under test (default:
  fresh-web `seo/07-release-tracking`) and `bad/*` branches
- a clone at `7702845` with the five files modified
- a local HTTP server standing in for `BASE`, which serves the stamp from `dist/` on
  disk, as `serve.mjs` does
- shims in `test/fakebin/` for `sudo -u`, `pm2`, `npm`, `node`, `sleep` and
  `systemd-run`. The `pm2` shim has state: a restart that really happens bumps pm2's
  pid/uptime and copies the on-disk stamp into `control/loaded`, the build the process
  has loaded. Failing, no-op and env-merging restarts can be injected. Every end-state
  check reads `control/loaded`, because the live stamp (read from disk) cannot show
  whether a restart happened.

The real code under test:
- all of `east_seo_release.py`, with its constants rewritten the way an operator fills
  them in
- the release's `deploy-east.sh` end to end, including the smoke test against the real
  `serve.mjs`, the live-SHA polling and `restore_dist`
- `stamp-build.mjs`, `check-deployed-sha.mjs` and `check-production-drift.mjs`
- `ship.py`'s steps, each run through `bash` exactly as SSM runs the command

The stubs are `tsc`, vite, the other `verify:production` checks and
`check-price-variants`.

Each scenario asserts the end state:
- HEAD and branch
- the five sha256 values
- the live stamp
- the `dist/` stamp and its presence
- `.deployed-sha`
- the pin and state files
- the build the process has loaded, and the restart count
- no leftover `dist-prev-deploy` or build copy
- the exit code
- output below 20 KB, with a sentinel secret from `.env`/pm2 never printed

The scenarios:
- happy path (also: the live `dist/` untouched during the build, the old assets carried
  over, no `--update-env`, one memory-capped scope, the peak reported)
- ROLLBACK after a release, and a re-release afterwards
- ROLLBACK using `dist-prev-deploy`
- ROLLBACK when pm2 restart fails, and when pm2 says ok but nothing restarted
- a post-restart gate fails and deploy-east's own restore cannot restart (recover() must),
  and pm2 stays broken (never reported as recovered)
- the release touches or adds a five file
- a lockfile change
- a release without the allowlist
- the branch moved after the SHA was pinned
- the fetch fails
- an extra dirty file
- a missing five file
- HEAD is not `CURRENT_SHA`
- pm2 is not online
- a five file changes after preflight
- a five file changes during the build
- the typecheck fails
- the build fails
- the live stamp never reports the release
- a post-restart gate fails
- the deploy is killed mid-build by its timeout, and by a SIGTERM to the script (the hung
  build process is stopped)
- the budget is too small, MemAvailable too low, no memory cgroup, the deploy escapes its
  scope
- a five file edited after the live build (PLAN reports, GO refuses, the override lifts it)
- two releases in a row carry exactly one generation of old assets
- a leftover `dist-prev-deploy`
- direct `deploy-east.sh` checks:
  - no pin file (old rule)
  - a wrong pin
  - a malformed pin file, a path that escapes the repo, a duplicate pin
  - a stale pin
  - a restart pm2 reports but that did not happen, and `ROLLBACK=1` with nothing to restore
  - a sixth dirty file that only the real stamp sees
- `ship.py`: every step fits one SSM command, the parts reassemble into the exact script,
  an altered part is refused before anything runs, the exit code and remaining budget come
  through, and it targets `east_runx.py`'s instance
