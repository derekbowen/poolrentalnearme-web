# Deployment flow, drift risk, and the path to Git as source of truth

Written 2026-09-11 after the broken-link repair, which was deployed under the
current flow and exposed its weaknesses.

## The current flow (as actually practised)

```
 local/agent  --ship.py (base64 over SSM)-->  EAST /home/ubuntu/fresh-web  (LOOSE WORKING COPY)
                                                     |
                                                     |  npm run build
                                                     v
                                               dist/  --serve.mjs (pm2 "fresh-web")--> :3000
                                                     ^
 repo (GitHub) <--mirrored AFTERWARDS, by hand-------/
```

**Production is edited first; Git is updated afterwards, by hand, as copies.**

### What this means today

| | |
|---|---|
| Authority | The EAST filesystem. Not the repo. |
| Repo relationship | `docs/ops/<change>/` holds **copies** of changed files, not the tree itself. The repo cannot build or deploy `fresh-web`. |
| EAST git | There *is* a git repo at `/home/ubuntu/fresh-web` (branch `winter-home`, HEAD `a607629d`) but it carries **225 uncommitted files** and is not connected to any push workflow. |
| Drift detection | None automatic. Drift is found only when someone hashes the tree and diffs it by hand. |
| Precedent | The WEST build tree drifted 149 files before anyone noticed, including the landing page and the 15% fee math. |

### Concrete risks

1. **A disk loss on EAST loses production code.** The repo holds copies of the
   files *someone remembered to mirror*, not the tree.
2. **Two agents/people editing EAST overwrite each other silently.** `ship.py`
   is a blind overwrite; there is no lock and no merge.
3. **The repo can look correct while production is different.** Nothing compares
   them.
4. **Rollback depends on `/root/east-backups/`**, which lives on the same box as
   the thing it protects.
5. **`.bak` files accumulate in the source tree** (`tools.tsx.bak-seo-20260902`,
   `home-page.tsx.bak-*`, dozens more), because backup-in-place is the only
   safety net. They are then scanned by tooling and confuse greps.

## Cleanest path to Git authority

Ordered by value per unit of disruption. Each step is independently useful.

### Step 1 — Make EAST's git checkout honest (half a day, no behaviour change)

- Commit the 225 uncommitted files on EAST to a branch (`east-live-2026-09-11`)
  so the running tree is *recorded* somewhere before anything else changes.
- Add a `.gitignore` for `dist/`, `.output/`, `node_modules/`, `*.bak-*`.
- Push that branch to GitHub. Now the real production tree exists off-box.

This alone removes risk 1 and gives a baseline for diffing.

### Step 2 — Drift detector (a few hours, high value)

A scheduled job that hashes every tracked file on EAST, compares to the pushed
branch, and reports any difference. Modelled on the WEST drift check already
described in CLAUDE.md (hash on the box, ship a manifest, diff **there**, because
SSM truncates output past ~24KB).

Run it daily. Drift becomes visible in a day instead of 149 files later.

### Step 3 — Reverse the arrow: deploy *from* Git (1-2 days)

Replace "ship file, build on box" with:

```
 GitHub (authoritative)
    |  push to main
    v
 GitHub Actions: install, typecheck, build, run verify:production against a
                 preview, then publish the built dist/ as an artifact
    |
    v
 EAST: git fetch && git reset --hard origin/main && npm ci && npm run build
       && npm run verify:production && pm2 restart fresh-web
```

The important property is that `git reset --hard` becomes *safe* — which it is
only once Step 1 and Step 2 prove the box carries nothing unique.

**Do not attempt Step 3 before Step 1.** A `git reset --hard` on the current
EAST tree would destroy 225 uncommitted files, including the winter homepage work
and every live fix from 2026-09-09 onward.

### Step 4 — Delete the side door

Once Step 3 is live, `ship.py` should refuse to write into
`/home/ubuntu/fresh-web/src`. Hot-patching production is then a deliberate,
logged exception rather than the normal path.

## Interim rule while the current flow persists

Every production change must, in the same session:

1. back up the touched files to `/root/east-backups/<change>-<stamp>/`
2. pass the gate (build → typecheck vs baseline → smoke on `:3005` with `.env`
   loaded → restart → verify)
3. run `npm run verify:production`
4. mirror the changed files into `docs/ops/<change>/` in this repo, and push

Steps 1-3 protect production. Step 4 is the only thing protecting the code, and
it is manual, which is exactly the weakness this document exists to remove.

---

## 2026-09-11 — what was actually done, and what blocked

### Preservation (Phase 1)

EAST's live tree was committed locally: branch
`ops/east-production-snapshot-2026-09-11`, commit **`32743686`** — 90 source/config
files of 236 changed; 146 excluded (in-place `.bak` backups, build output, a
`dist-server-bak-*` directory, `.env`). Classification per file:
`docs/ops/east-production-snapshot-2026-09-11.csv`.

**It could not be pushed.** EAST has no GitHub credential (`could not read
Username for 'https://github.com'`), no `gh`, no `GH_TOKEN`, no
`~/.git-credentials`. Relaying the tree out through SSM is not viable either: the
tracked tree is 8,506 files / 180 MB and SSM truncates past ~24 KB per call.

What is preserved remotely instead: the **diff** of the snapshot commit, gzipped,
at `docs/ops/east-snapshot/east-snapshot.patch.gz` (379 KB raw, 98 KB gz, verified
to contain zero secret-shaped tokens). That restores the 90 changed files but
**not** the full 8,506-file tree.

**To close this properly:** put a deploy key or fine-grained PAT on EAST with push
access to `derekbowen/fresh-web-702e04c3`, then
`git push -u origin ops/east-production-snapshot-2026-09-11`. Until then the full
live tree exists only on that disk.

### `.env` — checked, not a leak

The **committed** `.env` (6 lines) holds only publishable client-side Supabase
keys, identical to what is on GitHub. `SUPABASE_SERVICE_ROLE_KEY`,
`OPENAI_API_KEY`, `EMAILIT_API_KEY` and `SHARETRIBE_INTEG_CLIENT_SECRET` exist
only in the 15-line on-disk file and were never committed; the containing commit
is on no remote. `.env` is now untracked and gitignored in both repos so that
cannot change. No rotation required on this evidence.

### CI (Phases 2-4)

`derekbowen/fresh-web-702e04c3`, branch `ops/verify-and-drift-2026-09-11`, commit
**`a37784a6`**: the four invariant scripts, `check:production-drift`,
`verify:production`, and `.github/workflows/verify-production.yml` (PR + push to
main + hourly).

**A workflow does not block merges by itself.** "Verify production" must be added
as a **required status check** on the default branch. That is a repository setting
and has not been applied.

`check:production-drift` expects the deploy to stamp `.deployed-sha` in the repo
root. Nothing writes that today, so the check currently reports drift — correctly:
a deploy that does not record what it shipped cannot be verified.

---

## 2026-09-12/13 — the gate is now load-bearing

Both weaknesses this document was written about are closed.

### The deploy path before

```
 agent --ship.py (base64 over SSM)--> EAST /home/ubuntu/fresh-web (loose copy)
                                          npm run build ; pm2 restart
 repo <-- mirrored afterwards, by hand, as copies
```

Nothing recorded a SHA. `verify:production` checked the live site but was
indifferent to which code produced it, so a green run proved nothing about what
was deployed. `check-production-drift.mjs` was not even present on EAST, and
`.deployed-sha` was written by nothing.

### The deploy path after

```
 commit --> push to derekbowen/fresh-web-702e04c3
        --> EAST fetches that commit (tree must be CLEAN)
        --> ops/deploy-east.sh:
              build            (npm postbuild stamps sha+tree+dirty+assets)
              stamp == HEAD && dirty == 0     else abort
              smoke on :3005 with .env loaded else abort + restore dist
              pm2 restart
              poll until production reports THIS sha
              check:deployed-sha EXPECTED_SHA=HEAD else abort + restore
              verify:production                    else abort + restore
              check:price-variants                 else abort + restore
              write .deployed-sha  { sha, tree, verify:"pass", deployedAt }
              check:production-drift               else abort + restore
```

EAST's HEAD is now `ops/deploy-sha-enforcement`, and every commit it runs exists
on GitHub first. Production answers
`GET /fw-assets/__build.json` with the sha, tree, dirty count and asset
fingerprint it was built from.

### The deployed-SHA mechanism

The stamp is written by **npm's `postbuild`**, not by the deploy wrapper. That
placement is the whole point: a deploy that skips `ops/deploy-east.sh` and runs
`npm run build` by hand still produces an honest stamp, and still gets caught.

`.deployed-sha` is separate and is an **attestation** — `ops/deploy-east.sh`
writes it only after `check:deployed-sha` and `verify:production` have both
passed against the live site. Its presence means "this sha was verified in
production", not "someone deployed something".

### Drift is a three-way comparison, failing closed

| leg | source | what it answers |
|---|---|---|
| EXPECTED | `.deployed-sha` | which sha was last *verified* |
| DEPLOYED | `dist/client/fw-assets/__build.json` | what the build output was built from |
| ACTUAL | live `/fw-assets/__build.json` + git HEAD + dirty files | what production serves, and whether the tree moved |

Missing pieces are drift too — no `.deployed-sha`, no stamp, unreachable
endpoint, `sha: "unknown"`, a dirty tree. There is no assume-fine path.

Proven on the box:

| test | result |
|---|---|
| drift on the real matching state | **PASS**, exit 0 |
| drift with `.deployed-sha` sha replaced by `000…0` | **DRIFT**, exit 1, names both mismatches |
| drift with no deploy record at all | **DRIFT**, exit 1 |
| `check:deployed-sha` with a wrong `EXPECTED_SHA` | **FAIL**, exit 1 |

### Production cannot silently advance

- Edit source and rebuild without committing → the stamp records `dirty > 0` and
  lists the files; `check:deployed-sha` and drift both fail.
- Commit and `vite build` + restart, skipping the wrapper → the stamp moves but
  `.deployed-sha` does not, so EXPECTED != DEPLOYED and drift fails.
- Rebuild nothing and hand-edit `dist/` → the asset fingerprint diverges from the
  recorded one and drift fails.

### Remaining bypasses — stated plainly

1. **GitHub required status checks are not configured.** That is a repository
   setting and cannot be set from this session (no branch-protection tool, no
   raw GitHub token). The workflow runs but does not block a merge. The
   enforcement that *does* bite is on the deploy path itself, which is strictly
   stronger for production safety — but a merge to `main` is still unguarded.
2. **`ops/deploy-east.sh` can be bypassed** by running `npm run build` and
   `pm2 restart` by hand. Drift then reports it, but only when drift is run. Run
   it on a schedule to bound the detection window.
3. **A raw `vite build`** (not `npm run build`) skips `postbuild`, leaving a
   stale stamp. Drift catches that as a live-vs-local mismatch.
4. **Hand-editing a file inside `dist/` without renaming it** does not change the
   asset-name fingerprint. Not detected.
5. **WEST's cache holds a year-long entry for the bare
   `/fw-assets/__build.json` URL**, created while the stamp was still being
   served `immutable`. The checks cache-bust every request, so they read through
   it; a human curling that URL without a query string will see a stale stamp
   until WEST's cache is purged for that path.
