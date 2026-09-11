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
