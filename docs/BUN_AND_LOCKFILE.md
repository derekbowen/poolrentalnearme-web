# Bun version and lockfile — the single source of truth

**Canonical Bun version: `1.3.11`.**
**Canonical lockfile: `bun.lock` (text). `bun.lockb` no longer exists.**
**Installs are frozen everywhere. Dependency resolution never happens during a deploy.**

Every place the version is pinned, and CI fails if any of them drift:

| Where | Pin |
|---|---|
| `Dockerfile` build stage | `oven/bun:1.3.11-slim` |
| `Dockerfile` packaging stage | `oven/bun:1.3.11-slim` |
| `.github/workflows/ci.yml` | `bun-version: '1.3.11'` |
| `.github/workflows/production-release.yml` | `bun-version: '1.3.11'` |
| `.github/workflows/development-deploy.yml` | `bun-version: '1.3.11'` |

The `Bun version is the canonical one everywhere` step in CI re-reads all of these
and fails the build on a mismatch, on a missing `bun.lock`, or if `bun.lockb`
reappears. There is no separate undocumented CI or Docker assumption any more.

---

## What was wrong

`bun.lockb` was a **binary** lockfile, format v0, written by a Bun newer than the
`1.2.4` that both CI and the Dockerfile pinned. Consequences:

- CI's `bun install --frozen-lockfile` failed outright: *"outdated lockfile version:
  failed to parse lockfile"*. CI had never run a test successfully.
- The Dockerfile's plain `bun install` did **not** fail — it warned and re-resolved
  every dependency from the registry. **Every production image was built from
  whatever the registry served that day.** Two builds of the same commit could ship
  different dependency trees, and nothing would report it.

That is the reproducibility hole this closes.

---

## What changed, and what deliberately did not

The lockfile was converted, not regenerated:

```
bun install --frozen-lockfile --save-text-lockfile
```

`--frozen-lockfile` forbids re-resolution; `--save-text-lockfile` rewrites the same
resolved graph in the text format. Verified by a clean-room install — `rm -rf
node_modules && bun install --frozen-lockfile` — and comparing every installed
package version against the tree from the old binary lockfile:

```
packages: 1022 before, 1022 after
VERSION CHANGES: 0
ADDED: 0
REMOVED: 0
```

**Zero drift.** The application gets exactly the dependency tree it had before, now
in a format that is deterministic, diffable in review, and enforceable.

### The upgrade that was NOT applied

A true regeneration — deleting the lockfile and letting Bun re-resolve `package.json`
from scratch — was attempted first, measured, and **discarded**. It produced:

- **372 packages with changed versions**
- 32 packages added, 0 removed
- `package.json` itself untouched — every change came from `^` ranges drifting
  forward roughly a year

That is a mass upgrade wearing a lockfile regeneration's clothes. The changes with
real blast radius:

| Package | Before → after | Why it matters |
|---|---|---|
| `sharetribe-flex-sdk` | 1.21.1 → 1.24.2 | the marketplace SDK: transactions, session token store, cookies |
| `sharetribe-flex-integration-sdk` | 1.10.1 → 1.14.1 | every listing/user read and write |
| `js-cookie` | 2.2.1 → **3.0.8** | major; the 2.x → 3.x API changed |
| `jws` | 3.2.2 → **4.0.1** | major; JWT signing |
| `jwa` | 1.4.1 → **2.0.1** | major; JWT algorithms |
| `decimal.js` | 10.5.0 → 10.6.0 | money arithmetic in line items |
| `twilio` | 5.3.5 → 5.13.1 | ten minor versions; all SMS |
| `axios` | 1.7.7 → 1.20.0 | thirteen minor versions |
| `express` | 4.21.2 → 4.22.2 | request handling |
| `postcss-load-config` | 4.0.2 → **6.0.1** | major, build |
| `picomatch` | 2.3.1 → **4.0.7** | major |
| `fraction.js` | 4.3.7 → **5.3.4** | major |
| `chardet` | 0.7.0 → **2.2.0** | major |
| jest runtime (`expect`, `jest-diff`, …) | 29.x → **30.x** | major, test semantics |

Auth, cookies, money and the marketplace SDK all move at once. None of it is
reviewed, none is required for determinism, and any of it could change behaviour
in ways the current test suite would not catch. It was left alone.

**If you want those upgrades, they are a separate piece of work** with its own
testing — not a side effect of making the build reproducible.

---

## How determinism is enforced

1. `Dockerfile` — both stages run `bun install --frozen-lockfile`. A lockfile that
   does not exactly satisfy `package.json` fails the image build.
2. `ci.yml` — installs frozen, verifies the version pins agree, and **builds the
   real production image** on every push. That build is the proof; it is the check
   that the old setup lacked, and it is why the silent re-resolution went unnoticed
   for so long.
3. `ci.yml` also runs `scripts/audit-image-secrets.sh` against the built image, so
   the no-secrets-in-layers guarantee is checked by machine rather than asserted.

The temporary lockfile-drift *warning* is gone. Drift is now a hard failure.

---

## Changing a dependency, from now on

```bash
# edit package.json, then, with bun 1.3.11:
bun install                 # re-resolves and updates bun.lock
git add package.json bun.lock
```

Commit `bun.lock` with the `package.json` change, always. CI will fail otherwise,
which is the intended behaviour: a dependency change should be a visible, reviewable
diff, not something that happens during a deploy.
