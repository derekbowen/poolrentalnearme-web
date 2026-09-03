# First canonical release

**Status: one human action outstanding.** Nothing is deployed. c196 is not flipped.

One button verifies, one button releases. If a step below reads like homework, it is
a bug in the tooling — say so and it gets automated.

---

## The operator path

**One action.** GitHub → Actions → **Verify WEST** → Run workflow.

It connects to WEST, captures state read-only, brings the artifact back, verifies
runtime env injection, compares the on-box deploy script against the canonical one,
generates a corrective patch if needed, and prints this in the run summary:

```
WEST ACCESS: PASS/FAIL
DEPLOY SCRIPT FOUND: YES/NO
RUNTIME ENV INJECTION: PASS/FAIL
PRODUCTION DRIFT CAPTURED: YES/NO
CANONICAL SCRIPT MATCH: YES/NO
PATCH REQUIRED: YES/NO

SAFE TO DEPLOY: YES/NO
```

with the single remaining blocker in plain English when the answer is NO. Nothing to
copy, download, paste or interpret. It also commits the small evidence files back to
the branch, which is what unblocks release gate 5.

Terminal equivalent, if you would rather: `bash scripts/verify-west.sh`. Same verdict —
both call `scripts/west-verdict.js`, so they cannot disagree.

Then, when it says SAFE TO DEPLOY: YES —
GitHub → Actions → **Production release** → Run workflow, paste the SHA, type RELEASE.

**Verify WEST deploys nothing.** It copies one script to `/tmp`, runs it, retrieves the
result and deletes what it copied. It never builds, pushes, pulls or starts an image,
and shares no step with the release workflow.

---

## What each piece does

| Command | What it does | Fails how |
|---|---|---|
| **Verify WEST** workflow | one click: SSH to WEST, capture, retrieve, verify, patch, verdict | read-only; deploys nothing |
| `scripts/verify-west.sh` | terminal equivalent of the above | same verdict engine |
| `scripts/capture-production-state.sh` | snapshots WEST into `production-reconciliation/`: state, file manifest, source, services, nginx, cron, env + AWS secret **names only** | never writes to production |
| `scripts/reconcile-production.js` | classifies every difference into SOURCE / CONFIG / GENERATED / STALE / UNKNOWN and flags money, booking, auth, notification and SEO files as HIGH RISK | never overwrites anything, never assumes production is right |
| `npm run check-env` | required vs optional, grouped by service, accepts EAST's alias names | exit 1 on any production-critical gap |
| `npm run preflight` | env, AWS secret metadata, git SHA pin, credential shape and live/test coherence, migrations, build | exit 1, before anything ships |
| `npm run smoke-test` | public routes, sitemap, true 404s, listing retrieval, canonical, **fee invariant**, and with credentials: Sharetribe, Supabase, Stripe, Twilio, notification path | exit 1 |
| `scripts/flip-release.sh` | gated container flip on the box, with automatic rollback | leaves production untouched on abort |

The fee invariant is the one worth knowing: it calls the live line-item calculator, asserts
15% customer commission, asserts **no** provider-commission line item, and checks the arithmetic
to the cent. It creates no booking and charges no card. Verified today on two separate
listings: `$45.00 × 2h + 15% = $103.50` and `$30.00 × 2h + 15% = $69.00`.

---

## Deployment gate — all seven must pass

Production deploys only when every one of these is green. Each is enforced by a
workflow step that exits non-zero, not by anyone remembering.

| # | Gate | Enforced by | Status today |
|---|---|---|---|
| 1 | Production drift reconciled | `scripts/reconcile-production.js` — zero unreviewed HIGH RISK | **blocked**: needs the WEST capture |
| 2 | Secret names verified | `scripts/preflight-production.js` (Secrets Manager metadata) | blocked: needs AWS auth |
| 3 | Image secret audit PASS | `scripts/audit-image-secrets.sh`, inside `deploy.sh` between build and push | ready |
| 4 | Cookie regression PASS | `server/api-util/secureCookies.test.js`, workflow step | **passing**, 12 tests |
| 5 | Runtime injection verified PASS | `scripts/verify-west-runtime-injection.js`, workflow step | **blocked**: needs the WEST capture |
| 6 | Startup env check PASS | `server/startupEnvCheck.js`, asserted in-container after start by `west-instance-deploy.sh` and `flip-release.sh`; rolls back if config is missing | ready |
| 7 | Preflight PASS | `scripts/preflight-production.js`, workflow step | blocked: needs AWS auth |

Gate 5 fails closed by design: no committed evidence means no deploy. It unblocks
the moment a capture lands — commit `production-reconciliation/deploy-script-analysis.json`
and the redacted `west-deploy-script.sh` (both small and reviewable; the source tree
does not need committing).

The canonical smoke-test check for `?ref=` in the canonical tag is **expected red**
until c196 ships. That is correct and must not be weakened.

### The on-box deploy script

`scripts/west-instance-deploy.sh` is the canonical version of the script that
actually runs `docker run` on WEST. Until now that script existed only on the box:
unversioned, mutable, and never read by anyone auditing the system — which is why
nobody could say whether the secret-free image would start configured.

The repo copy passes its own verifier: it requires `ENV_FILE`, refuses to start an
unconfigured container, injects secrets with `--env-file`, health-checks, then asks
the container to prove it received its production-critical configuration and rolls
back if it did not.

It has **not** been installed on WEST and does not claim to match what is there.
Capture first, compare `sha256`, install deliberately.

Canonical repo sha256: `0743cfff0d3f8bbc42e246507b3c8356109f547667a69dcdb54dacf5ecd9544b`
On-box sha256: unknown until capture. Difference: unknown until capture.

---

## The workflows

`.github/workflows/production-release.yml` — **`workflow_dispatch` only.** There is no `push:`
trigger, so no branch push can deploy production. It requires the exact SHA and the literal
word `RELEASE`, and runs under `environment: production` so GitHub applies any required
reviewer. Steps: verify the checkout matches the requested SHA → AWS auth → fetch the runtime
env from Secrets Manager → **preflight (fails closed)** → build and push to ECR → deploy →
smoke tests. Rollback is opt-in via the repository variable `ROLLBACK_ON_FAILURE`.

`.github/workflows/development-deploy.yml` — manual dispatch, plus automatic on pushes to a
`develop` branch that does not exist yet. **Deliberately not push-to-main**: TurtleCI's
original fired on every push to `main`, which would turn a docs commit into a deploy. Nothing
depends on that behaviour today, so it was not inherited.

`.github/workflows/ci.yml` — runs on every push and PR, needs no secrets, cannot deploy. Server
tests, the insurance-language gate, workflow validity, and the check that every variable the
code reads is documented in `.env.example`.

---

## Secrets: what GitHub gets

GitHub gets **only enough to authenticate to AWS and fetch the runtime secret**. It never holds
the ~113 application variables — those stay in AWS Secrets Manager and are pulled at deploy
time by `scripts/deploy.sh`, exactly as before.

Set the repository variable **`AWS_ROLE_ARN`** to an IAM role trusting this repository and the
workflow authenticates by OIDC, short-lived, with no stored AWS keys at all. Both workflows
already branch on it; until it is set they fall back to the existing static key secrets, so the
first release does not depend on the IAM work landing first.

| Category | Home |
|---|---|
| Production runtime secrets (~113) | AWS Secrets Manager, fetched at deploy |
| AWS authentication | GitHub OIDC role, or `*_AWS_*` secrets as fallback |
| Local development | `.env`, git-ignored |
| Documentation | `.env.example`, names and comments only |

---

## Secrets are no longer in the image

`Dockerfile` used to carry `COPY .env .env`, so every production credential was an
image layer and ECR pull access was equivalent to the whole secret store. Fixed:

- the runtime stage copies no `.env` at all;
- the build stage receives `.env.build` — the `VITE_`-prefixed half, which Vite
  compiles into the browser bundle and is therefore public by construction. It
  still needs a *file* because `vite.config.mjs` populates `import.meta.env` only
  from `.env` files, never from `process.env` or `--build-arg`. That detail is
  exactly what broke c158;
- `scripts/deploy.sh` splits the two, scp's the full `.env` to the instance at
  mode 600, and passes the path as `ENV_FILE`;
- `.dockerignore` blocks `.env`, `.env.*`, `*.pem`, `*.key`, `credentials.json`
  and `id_rsa` from the build context entirely;
- `scripts/audit-image-secrets.sh` runs inside `deploy.sh` between build and push,
  so a secret-carrying image cannot leave the machine even if someone bypasses CI.

Cookie security no longer depends on any of this: `server/api-util/secureCookies.js`
is the single decision, and in production `Secure` is on unless explicitly disabled.
See `COOKIE_SECURE_ROOT_CAUSE.md`.

---

## Rollback

```
scripts/flip-release.sh rollback
```

The previous container is retained as `poolrentalnearme-production-rollback`. `flip` also rolls
back automatically if the new container fails its health check.
