# First canonical release

**Status: one human action outstanding.** Nothing is deployed. c196 is not flipped.

The whole procedure is now four commands and one button. If a step below reads like
homework, it is a bug in the tooling — say so and it gets automated.

---

## The operator path

```
# 1. once, on the WEST box — read-only, ~30 seconds
bash scripts/capture-production-state.sh

# 2. copy the tarball back into the repo root, extract, then:
node scripts/reconcile-production.js ./production-reconciliation --write-report

# 3. review ONLY what it flags HIGH RISK, merge those into the repo

# 4. release: GitHub -> Actions -> "Production release" -> Run workflow
#    paste the commit SHA, type RELEASE
```

Everything else — preflight, secret retrieval, build, deploy, smoke tests, rollback — runs
inside the workflow. There is no step where anyone types a credential into a form.

---

## What each piece does

| Command | What it does | Fails how |
|---|---|---|
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

## Known issue this plan does not fix

`Dockerfile` line 24 is `COPY .env .env` — the runtime secrets are baked into the image layer,
so anyone with ECR pull access has every production credential. That contradicts the canonical
architecture ("no secret is read from a file inside a container image") and it is worth fixing.

It is **not** fixed here on purpose: `VITE_*` variables must be present at build time, so
removing the copy without restructuring the build would silently strip `Secure` from session
cookies — the exact failure that aborted release c158. It needs a production test, which needs
WEST access. Flagged, not guessed at.

---

## Rollback

```
scripts/flip-release.sh rollback
```

The previous container is retained as `poolrentalnearme-production-rollback`. `flip` also rolls
back automatically if the new container fails its health check.
