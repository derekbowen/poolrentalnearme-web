# EAST release tooling: one fresh-web SHA, five EAST-only files kept

`east_seo_release.py` ships one fresh-web commit to EAST (`/home/ubuntu/fresh-web`,
pm2 `fresh-web` as `ubuntu`). It keeps the five files that exist only on EAST exactly
as they are:

```
src/components/home-page.tsx   src/routes/__root.tsx   src/server/listing-sync.server.ts
src/server/sharetribe.server.ts   src/lib/listing-slug.ts (untracked)
```

The release itself is gated by the release's own `ops/deploy-east.sh` (fresh-web
commit `8229cee` on `seo/07-release-tracking`, plus wording fix `8f7c105`). That
script now accepts a **pinned allowlist**: a dirty file is tolerated only if the pin
file lists it and its sha256 equals the pin. Every pinned file must be dirty, every
dirty file must be pinned, and the build stamp must list exactly that set. Without a
pin file it behaves as before. `check:deployed-sha` and `check:production-drift`
take the same exact set through `TOLERATED_DIRTY_FILES`, which `deploy-east.sh`
exports.

Nothing here has run on EAST. It has been tested only against the local simulation in
`test/`.

## Before you run it

1. The release branch (`seo/release-2026-11`) is merged and pushed to the public repo
   `derekbowen/fresh-web-702e04c3`. It must contain `8229cee` (the allowlist). The
   script refuses a release whose `deploy-east.sh` lacks it.
2. Edit the constants at the top of a **copy** of the script:
   - `RELEASE_SHA`: the full 40-hex tip of the release branch.
   - `RELEASE_BRANCH`: `seo/release-2026-11`.
   - `MODE`: `PLAN` first, then `GO`. `ROLLBACK` is only for after a GO.

   The committed file has placeholders and refuses to run as PLAN or GO.
   `CURRENT_SHA` is `7702845…`, the commit EAST runs today. After one release, set it
   to that release's SHA for the next one.
3. Each GO is its own approval item. A PLAN run changes nothing.

## Run

From a machine with the `PRNM_AWS_*` credential (see `ops/runners/_runner_common.py`):

```
cp ops/east/seo-release-2026-11/east_seo_release.py /tmp/rel.py   # then edit the constants
python3 ops/runners/east_runx.py /tmp/rel.py                      # MODE = "PLAN"
```

PLAN should finish within a minute (one anonymous fetch and a few git commands). Then set `MODE = "GO"` and start it **in the
background**, because a build takes several minutes, longer than one interactive
tool call:

```
python3 ops/runners/east_runx.py /tmp/rel.py > /tmp/rel-go.log 2>&1 &
grep "command id" /tmp/rel-go.log                 # the SSM command id is on stderr
python3 ops/runners/east_runx.py --result <command-id>   # re-read status/output at any time
```

`RUNNER_TIMEOUT = 3600` is declared in the script, so `east_runx.py` gives SSM 3600 s
and refuses a shorter override. The script gives `deploy-east.sh` that budget minus
8 minutes (at least 10 minutes), so that it still has time to recover. Output is kept
under about 6 KB: only the `deploy-east.sh` step lines, the verdict, and on failure the
last 15 lines. SSM truncates output past about 24 KB.

The SSM payload limit is tight: the shipped command is 9,323 of 9,500 characters.
After any edit to the script, run `test/run_tests.py`. Its `payload_fits_ssm` check
fails if the script no longer fits.

## What each mode does

**PLAN** (read-only):
- **Preflight checks:**
  - The repo exists.
  - HEAD == `CURRENT_SHA`.
  - `git status` shows exactly the five files as dirty, under both of EAST's filters
    (`deploy-east.sh` step 1 and `stamp-build.mjs`).
  - It records their sha256 (it prints 16 hex characters, never the contents).
  - pm2 `fresh-web` is online. `pm2 jlist` is parsed, never printed, because it carries
    the process environment.
  - It reports MemAvailable, SwapFree, free disk and the size of `dist/`.
  - The live stamp and the `dist/` stamp both equal HEAD.
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
  - RAM + swap is below 3000 MB.
  - Free disk is less than 3 × the size of `dist/` + 1 GB.

**GO** runs everything PLAN runs, then:
1. It fetches the verified commit from the throwaway repo into the real repo (FETCH_HEAD
   only, no refs).
2. It writes the pin file `/home/ubuntu/fresh-web.east-only.sha256` (`<sha256>  <path>`,
   mode 644, outside the tree). This file is also `deploy-east.sh`'s default pin path,
   so later plain `deploy-east.sh` runs keep tolerating exactly these five.
3. It copies `dist/` to `/home/ubuntu/fresh-web-release-backup/dist-<prev12>`. It writes
   the state file `/home/ubuntu/fresh-web.release-state.json`, which holds:
   - the previous sha and branch
   - the release sha
   - the pins
   - the backup path
   - the previous `.deployed-sha`
4. It runs `git checkout -B <RELEASE_BRANCH> <RELEASE_SHA>`. Git carries the five local
   files over and refuses rather than merging. The script then re-checks HEAD and the
   five hashes.
5. It runs the release's `ops/deploy-east.sh` as `ubuntu`, with
   `NODE_OPTIONS=--max-old-space-size=3072`, `EAST_ONLY_SHA256=<pin file>`, `REPO_DIR` and
   `BASE_URL`. The run is wrapped in `timeout`. `deploy-east.sh` applies that heap to the
   typecheck and the build only, and unsets it before the smoke server and the
   `pm2 restart --update-env`. Its gates, unchanged:
   - typecheck
   - build
   - stamp sha == HEAD, with dirty == exactly the pinned set (pins re-verified)
   - smoke on :3005
   - pm2 restart
   - live stamp == HEAD
   - verify:production
   - check:price-variants (with `.env`)
   - pins re-verified, then the `.deployed-sha` attestation (now listing `eastOnlyFiles`)
   - check:production-drift
6. After a success, it prints the live stamp and runs the tracker's `regression` group
   from a `/tmp` copy, so its reports never land in the repo tree. It ends with one
   `RESULT: RELEASED …` line and exits 0. The dist backup is kept for ROLLBACK.

**ROLLBACK** reads the state file and checks two things:
- HEAD is the release or the previous commit.
- The five files still match their pins.

Then:
- If `dist-prev-deploy` exists, it runs the release's `deploy-east.sh` with
  `ROLLBACK=1`.
- Otherwise it restores `dist/` from the backup.
- It checks out the previous commit, by its branch (`ops/deploy-sha-enforcement`), and
  keeps the five files.
- It runs `pm2 restart fresh-web` and waits up to 120 s for the live stamp to report the
  previous sha.
- It restores the previous `.deployed-sha`, or removes it if there was none.

ROLLBACK does not need the constants filled in.

## What each failure leaves behind

| Failure | Repo / dist / live afterwards | Files written |
|---|---|---|
| Placeholders, HEAD mismatch, dirty set wrong, pm2 not online, live/dist stamp mismatch, GO gate | untouched | none |
| Fetch fails, branch moved, not a descendant, touches/adds a five file, lockfile change, old `deploy-east.sh` | untouched; the real repo is not even fetched into | none (the `/tmp` throwaway repo is deleted) |
| `git checkout` refuses | untouched | pin file, state file, dist backup (harmless; reused next GO) |
| `deploy-east.sh` fails at step 1 (e.g. a five file changed after preflight) or 1b (typecheck) | HEAD back on the previous commit; dist and live never touched | as above |
| Build fails, stamp wrong, a five file changed during the build, smoke fails | `deploy-east.sh` restores `dist-prev-deploy` and restarts; the script checks out the previous commit | as above |
| Live never reports the release, verify:production / price-variants / drift fails | `deploy-east.sh` restores dist and restarts; the script checks out the previous commit and confirms the live stamp is the previous sha | `.deployed-sha` restored to what it was |
| `deploy-east.sh` killed by the timeout (exit 124), e.g. mid-build with `dist/` emptied | the script restores `dist/` from its own backup, restarts, waits for the live stamp | as above |

Every failure ends with `RESULT: FAILED, <why>. live <sha>; …` and exit 1. If a five
file was changed on the box during the run, the tool leaves it as found and says
`BUT … check by hand`. It never reverts that file. If the run says
`NOT FULLY RECOVERED`, run ROLLBACK, then check by hand.

If SSM itself kills the whole run (it should not: there is an 8-minute margin), run
ROLLBACK. The state file and the dist backup are written before anything moves.

Cleanup after a release has been accepted:

```
rm -rf /home/ubuntu/fresh-web-release-backup/dist-<prev12>
```

That removes the backup, which takes about one `dist/` of disk. Keep the pin file. It
is what lets the next `deploy-east.sh` run accept the five.

## Known limits

- `deploy-east.sh` builds in place, as every earlier EAST deploy did. If vite empties
  `dist/` at the start of a build, the live process (which serves static files from
  disk) is missing its assets until the build finishes or is restored. This has not been
  measured on EAST. Building into a separate directory would be a larger change to
  `deploy-east.sh`, and it is not part of this tooling.
- The script trusts `CURRENT_SHA` and the pins it records at preflight. It does not
  decide whether the five EAST-only files are correct. It only keeps them byte-for-byte.
- Cloudflare: the live stamp is read through `www.poolrentalnearme.com`. `serve.mjs`
  serves `__build.json` as `no-store`, and the polls add a cache-buster.

## Tests

```
python3 ops/east/seo-release-2026-11/test/run_tests.py            # about 3 min, 30 scenarios, 183 checks
python3 ops/east/seo-release-2026-11/test/run_tests.py --only happy_path --show --keep
```

The harness simulates EAST under the session scratchpad (`release-test/sim`, or
`$RELEASE_TEST_DIR`). It uses:
- a local bare repo standing in for GitHub, with the release commit under test (default:
  fresh-web `seo/07-release-tracking`) and `bad/*` branches
- a clone at `7702845` with the five files modified
- a local HTTP server standing in for `BASE`, which serves the stamp from `dist/` on
  disk, as `serve.mjs` does
- shims in `test/fakebin/` for `sudo -u`, `pm2`, `npm`, `node` and `sleep`

The real code under test:
- all of `east_seo_release.py`, with its constants rewritten the way an operator fills
  them in
- the release's `deploy-east.sh` end to end, including the smoke test against the real
  `serve.mjs`, the live-SHA polling and `restore_dist`
- `stamp-build.mjs`, `check-deployed-sha.mjs` and `check-production-drift.mjs`

The stubs are `tsc`, vite, the other `verify:production` checks and
`check-price-variants`.

Each scenario asserts the end state:
- HEAD and branch
- the five sha256 values
- the live stamp
- the `dist/` stamp and its presence
- `.deployed-sha`
- the pin and state files
- no leftover `dist-prev-deploy`
- the exit code
- output below 20 KB, with a sentinel secret from `.env`/pm2 never printed

The scenarios:
- happy path
- ROLLBACK after a release, and a re-release afterwards
- ROLLBACK through `deploy-east.sh ROLLBACK=1`
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
- the deploy is killed mid-build
- a leftover `dist-prev-deploy`
- direct `deploy-east.sh` checks:
  - no pin file (old rule)
  - a wrong pin
  - a malformed pin file, a path that escapes the repo, a duplicate pin
  - a stale pin
  - a sixth dirty file that only the real stamp sees
- the SSM payload size
