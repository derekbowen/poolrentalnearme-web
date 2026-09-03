# First canonical release — procedure

**Status: NOT READY. Two hard blockers, both listed in §0.**
No deployment has been performed. This document is the plan, not a record.

---

## 0. Blockers, before anything below runs

**B1 — Production drift is still unmeasured.** The reconciliation this plan depends on
(inventory WEST, classify the 149 differences, capture production-only fixes) could not be
performed: there is no access path from the agent environment to WEST. Verified 2026-09-03 —
`AWS_ACCESS_KEY_ID` is the placeholder string `prox…ted`, STS returns `InvalidClientTokenId`
in both regions, `~/.ssh` is empty, and port 22 on `13.56.113.85` is unreachable. Only port
443 (the public site) responds.

Until someone with access runs the inventory, **Git cannot become the source of truth**,
because nobody knows what production would lose.

**B2 — The CI files are not GitHub Actions workflows.** See §5. They cannot simply be moved.

What *is* settled: the fee math, the highest-risk item in the drift. It matches, and it is
structurally incapable of drifting. See `FEE_MATH_RECONCILIATION.md`.

---

## 1. Snapshot current production

On WEST, before touching anything. Record to `docs/PRODUCTION_STATE_SNAPSHOT.md`:

```
hostname; date -u
docker ps --format '{{.Names}} {{.Image}} {{.Status}} {{.Ports}}'
docker inspect poolrentalnearme-production --format '{{.Config.Image}} {{.Created}}'
docker inspect poolrentalnearme-production --format '{{range .Config.Env}}{{println .}}{{end}}' | cut -d= -f1 | sort   # NAMES ONLY
ls -la /home/ubuntu/build | head -40
cd /home/ubuntu/build && git rev-parse HEAD 2>&1 || echo 'not a git checkout'
nginx -T 2>/dev/null | grep -E 'server_name|proxy_pass|location' | head -60
crontab -l; sudo -u ubuntu crontab -l
systemctl list-units --type=service --state=running | head -20
ls -la /home/ubuntu/switchy/ /home/ubuntu/*.env 2>/dev/null   # names only, never cat
```

Never `cat` an env file. Names only.

## 2. Reconcile drift

```
# on WEST, read-only
cd /home/ubuntu/build
find . -type f -not -path './node_modules/*' -not -path './dist/*' -not -path './.git/*' \
  -exec md5sum {} + | sort -k2 > /tmp/prod-manifest.txt
```

Ship the same manifest from a clean checkout of this repo, diff **on the box** (SSM truncates
past ~24KB), then pull only the divergent files back as a chunked, md5-verified tarball.
Classify every one into `docs/PRODUCTION_DRIFT_AUDIT.md`:

| Class | Meaning | Action |
|---|---|---|
| A | legitimate production fix | reproduce in source on the reconciliation branch |
| B | generated/build output (`dist/`, assets) | ignore, must not be in git |
| C | configuration | move to the secret store or `.env.example` |
| D | stale/abandoned | delete from production |
| E | unknown | manual review — **blocks the release** |

Read the actual diff for every code file. A filename count is not a classification.

## 3. Merge production fixes

Branch `production-reconciliation-2026-09` off this branch. One logical commit per fix, each
explaining why it existed only on production. Add a test where the fix is behavioural.
**Never copy the production tree over the repo** — that destroys history and silently adopts
class B and D files.

Prioritise anything touching: pricing, fees, Stripe, Stripe Connect, Sharetribe transitions,
booking acceptance/expiry, payouts, refunds, Twilio, host notifications, concierge, auth,
Supabase writes, listing publication, SEO routes, cron/poller behaviour. For each, state
PRODUCTION DOES / REPOSITORY DOES / USER IMPACT / WHICH WINS / WHY before writing code.

## 4. Verify secrets

```
aws secretsmanager describe-secret --secret-id "$AWS_JH_ENV_SECRET_NAME" --region "$AWS_ENV_USER_REGION"
aws secretsmanager get-secret-value --secret-id "$AWS_JH_ENV_SECRET_NAME" --query SecretString \
  | python3 -c 'import json,sys; print("\n".join(sorted(json.loads(json.load(sys.stdin)).keys())))'
```

The second command prints **key names only** — never pipe it anywhere that logs. Compare the
names against `.env.example` and `scripts/check-env.js`. Report: secret name, region, exists,
last modified, variable names contained, expected-but-missing names.

This is the step that finally distinguishes *production is missing credentials* from *the
agent environment merely lacks them*. Right now nobody knows which is true.

## 5. Configure GitHub Actions — with a correction

`.turtleci/production.yml` and `development.yml` **are not GitHub Actions workflows.** They
interpolate `${{ secrets.* }}` like Actions, but the job schema is TurtleCI's:

| Their key | GitHub Actions requires |
|---|---|
| `builder: [ubuntu, docker, aws]` | `runs-on: ubuntu-latest` |
| `uses: checkout` | `uses: actions/checkout@v4` |
| *(absent)* | `permissions:` |

Moving the files would produce a workflow GitHub cannot parse. They must be **ported**, not
relocated.

**Their triggers, which must change:**

| File | Trigger today | Deploys to |
|---|---|---|
| `production.yml` | `push` to branch `production` | production |
| `development.yml` | `push` to branch `main` | development |

Ported as-is, **every push to `main` would auto-deploy**. That is exactly the surprise deploy
to avoid. Production must instead require an intentional release path:

```yaml
on:
  workflow_dispatch:          # a human starts it
    inputs:
      sha: { description: 'Commit SHA to release', required: true }
  push:
    tags: ['v*']              # or a signed release tag
```

with `environment: production` so GitHub enforces a required reviewer.

**Required GitHub secrets, by name only** (16 per environment, `PRODUCTION_*` and
`DEVELOPMENT_*` prefixes):

```
AWS_ACCESS_KEY_ID              AWS_ENV_USER_ACCESS_KEY_ID     AWS_INSTANCE_DEPLOY_SCRIPT
AWS_SECRET_ACCESS_KEY          AWS_ENV_USER_SECRET_ACCESS_KEY AWS_INSTANCE_URL
AWS_ACCOUNT_ID                 AWS_ENV_USER_REGION            USE_SSH_DEPLOYMENT
AWS_ECR_REGION                 AWS_ECR_TAG_NAME               ENCODED_PEM
AWS_ECR_REPO_NAME              AWS_PROFILE_PARAM              ENV_FILE_PATH
AWS_JH_ENV_SECRET_NAME
```

Prefer OIDC (`permissions: id-token: write` + `aws-actions/configure-aws-credentials`) over
the two long-lived AWS key pairs. That removes eight stored secrets and the rotation burden.

## 6. Preflight

```
node scripts/preflight-production.js --expect-sha <release-sha>
```

Exits non-zero on any production-critical gap: missing env, unreadable AWS secret, dirty tree,
wrong SHA, malformed or mode-mismatched Stripe keys, missing build-time `VITE_SHARETRIBE_USING_SSL`,
failed build. Never prints a value.

## 7. Build the artifact

Tag it `cNNN-<name>` to match the existing convention. `VITE_*` variables must be present
**at build time** — they are compiled into the client bundle. Setting one only in the running
container does nothing; that is what aborted c158.

## 8. Deploy

Use the gated flip, never a direct replacement:

```
scripts/flip-release.sh gate cNNN-name    # candidate on :4000, production untouched
# review route parity and the payment endpoints
scripts/flip-release.sh flip cNNN-name    # promote, auto-rollback if unhealthy
```

## 9. Health check

`/`, `/s`, a real `/l/<slug>/<uuid>`, `/signup`, `/sitemap.xml` all 200; `/api/transaction-line-items`
and `/api/initiate-privileged` answer (400 on an empty body is correct, 5xx is not).

## 10. Transaction smoke test

Against the **live** release, read-only — the same method used for the fee audit:

```
POST /api/transaction-line-items  {isOwnListing:false, listingId:<published>, orderData:{bookingStart, bookingEnd}}
```

Assert: `line-item/hour` present; `customer-commission` percentage is **15**; **no**
`provider-commission`; payin = base + 15%; the listing page's displayed all-in equals that
total to the penny. This creates no transaction and touches no Stripe state.

## 11. Notification smoke test

Confirm the poller actually started — the failure mode is silence, not an error:

```
docker logs poolrentalnearme-production --since 10m | grep -iE 'poller|DISABLED|SUPABASE'
```

`DISABLED — SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set` means every host notification is
off while the site looks healthy. Then send one SMS to a staff number only. Anything to a real
host or guest needs Derek's fresh explicit GO — approval for one send never carries to the next.

## 12. Rollback

```
scripts/flip-release.sh rollback
```

Restores the previous container, which `flip` retained as `poolrentalnearme-production-rollback`.
`flip` also rolls back automatically if the new container fails its health check. Confirm with
the §9 checks. If a release reached production and was rolled back, record what drifted, so
this document does not have to be rewritten from memory next time.
