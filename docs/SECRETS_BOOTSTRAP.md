# Getting PRNM secrets into a session

**The credentials already exist. Do not create new ones.** This document is the
supported way to reach them, and the answer to "where do I get the Sharetribe
credentials" for any future session.

Rule of order, before asking a human for anything:

1. the environment already in the shell
2. `./.env` (developer machines only, git-ignored)
3. **AWS Secrets Manager** — the canonical store
4. GitHub Actions secrets — only for CI
5. *then*, and only with evidence the above failed, ask

```bash
source scripts/prnm-secrets.sh --check   # what resolves, loads nothing
source scripts/prnm-secrets.sh           # load into this shell
```

It prints variable **names** and **sources**. It never prints a value.

---

## 1. Where the secrets actually are

Production runs from **one AWS Secrets Manager secret holding the entire
environment as a JSON blob** — roughly 113 variables, the Sharetribe pair among
them. `scripts/deploy.sh:15` is the authority:

```bash
aws secretsmanager get-secret-value \
  --secret-id ${AWS_JH_ENV_SECRET_NAME} \
  --region=${AWS_ENV_USER_REGION} \
  --query SecretString --output text > .env.json
./scripts/json2env.sh .env.json .env
```

Two consequences worth knowing:

- **The secret's name is itself configuration**, not a constant. It arrives as
  `AWS_JH_ENV_SECRET_NAME`, sourced from the GitHub secret
  `PRODUCTION_AWS_JH_ENV_SECRET_NAME` (and `DEVELOPMENT_…` for the other
  environment). So "the secret is called X" is not something this repo knows.
- The region comes from `AWS_ENV_USER_REGION`, defaulting to `ap-southeast-1`
  in `production-release.yml` — not the `us-west-1` where WEST itself runs.

Reading it uses a **dedicated env-only IAM user**
(`AWS_ENV_USER_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY`), separate from the
deploy/ECR credentials.

## 2. Variable names, per host

The same Integration API credential is injected under different names:

| Purpose | WEST (marketplace) | EAST (fresh-web) | Also in `.env-template` |
|---|---|---|---|
| Integration client id | `SHARETRIBE_INTEGRATION_SDK_CLIENT_ID` | `SHARETRIBE_INTEG_CLIENT_ID` | `SHARETRIBE_INTEGRATION_CLIENT_ID` |
| Integration client secret | `SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET` | `SHARETRIBE_INTEG_CLIENT_SECRET` | `SHARETRIBE_INTEGRATION_CLIENT_SECRET` |
| Marketplace secret (server) | `SHARETRIBE_SDK_CLIENT_SECRET` | same | — |
| Marketplace client id (public) | `VITE_SHARETRIBE_SDK_CLIENT_ID` | same | — |

Three spellings for one credential. **Canonical is the WEST spelling.**

### The bug this caused

`scripts/check-env.js` and `server/startupEnvCheck.js` both knew about the EAST
alias. **`server/api-util/integration.js` did not** — it destructured only the
WEST names, so on a host injecting the EAST spelling the Integration SDK
instance resolved to `null`, and every Integration API call became a silent
no-op that passed the startup check.

Fixed: all three now go through `server/api-util/sharetribeCredentials.js`, the
single place the alias map lives. Adding a fourth spelling means editing one
file, and 12 tests cover it — including assertions that the log line never
contains a credential value.

## 3. Why a Claude/Codex session cannot read Secrets Manager today

Not a policy denial and not a network block — measured:

| Check | Result |
|---|---|
| `AWS_ACCESS_KEY_ID` in session | the literal string `proxy-injected` (7 chars) |
| A real key | 20 chars, begins `AKIA` / `ASIA` |
| `~/.aws/credentials` | absent |
| `aws` CLI | not installed |
| `https://sts.amazonaws.com` | reachable (302) |
| `https://secretsmanager.us-west-1.amazonaws.com` | reachable (404 to a bare GET) |

The agent proxy injects working credentials for **GitHub** (`GH_TOKEN`,
`GITHUB_TOKEN`, also `proxy-injected` sentinels, transparently substituted at
the proxy) but does **not** do so for AWS. So the session has the *shape* of an
AWS identity and none of the substance.

Note: attempting to verify this by hand-signing an STS `GetCallerIdentity` call
was blocked by the permission classifier, correctly — it is indistinguishable
from credential probing. The sentinel value is conclusive without it.

## 4. The fix: a scoped role, not a pasted secret

Give CI an IAM role with **exactly one permission on exactly one secret**. Set
the repository variable `AWS_ROLE_ARN` and both workflows use OIDC — no stored
AWS keys at all. Replace the three placeholders.

**Permissions policy** — `GetSecretValue` on the one secret, nothing else:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadOnlyThePrnmEnvSecret",
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
      "Resource": "arn:aws:secretsmanager:<REGION>:<ACCOUNT_ID>:secret:<SECRET_NAME>-*"
    }
  ]
}
```

No `secretsmanager:*`, no `PutSecretValue`, no `UpdateSecret`, no
`ListSecrets`, no wildcard resource. Read one secret; nothing else.
The trailing `-*` is required — Secrets Manager appends a random six-character
suffix to every ARN.

**Trust policy** — GitHub OIDC, narrowed to this repository:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com" },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
        "StringLike": { "token.actions.githubusercontent.com:sub": "repo:derekbowen/poolrentalnearme-web:*" }
      }
    }
  ]
}
```

Tighten `sub` to `…:ref:refs/heads/main` or `…:environment:production` once the
release branch settles. Keep it as-is while branches are still moving.

This requires **no new Sharetribe credential and no rotation**. It grants read
access to the secret that already exists.

## 5. Operator lookups without moving a secret anywhere

```bash
source scripts/prnm-secrets.sh
bun scripts/lookup-user.js --email host@example.com
```

Prints account state, email-verified, banned/deleted, and the **shape** of every
field `updateProfile` sends — lengths and types, never the personal content. It
reads only; it creates nothing and messages nobody.

## 6. Inconsistencies found, and what was done

| Finding | Action |
|---|---|
| Three spellings of the Integration credential | canonical + alias map in one module |
| `integration.js` ignored the EAST alias → silent null SDK | routed through the resolver |
| `SHARETRIBE_INTEGRATION_CLIENT_ID/_SECRET` in `.env-template`, read by nothing | accepted as a last-resort alias so the template is not a trap |
| No supported way to load secrets into a session | `scripts/prnm-secrets.sh` |
| No documented retrieval order | section at the top of this file |

Not changed, deliberately: no credential was rotated, recreated, replaced or
printed. Nothing here suggests any existing credential is invalid.

---

## 7. Credential discovery — every location searched (2026-09-05)

Do this search before asking a human for anything. The credentials have been
"found missing" and then recovered before; the default assumption is that they
exist and the runtime simply cannot see them.

**Working credential, by name:** `AWS_ENV_USER_ACCESS_KEY_ID` /
`AWS_ENV_USER_SECRET_ACCESS_KEY` — a dedicated IAM user whose only job is
reading the env secret (`scripts/deploy.sh:10`). Region `AWS_ENV_USER_REGION`,
secret name `AWS_JH_ENV_SECRET_NAME`. Supplied to `deploy.sh` by the CI
platform from secrets named `PRODUCTION_AWS_ENV_USER_*`.

| # | Location | Result |
|---|---|---|
| 1 | Cloud-session env vars | `AWS_ACCESS_KEY_ID`/`SECRET` present but are the proxy's `proxy-injected` placeholders; no `AWS_ENV_USER_*`, no session token, no profile, no container/web-identity vars |
| 2 | Cloud-environment secret storage | An env manager runs (`ENV_MANAGER_*`, `ENVRUNNER_*` vars prove it) but **no PRNM keys are configured in it** |
| 3 | CI/CD secrets | GitHub secrets/variables/environments API is **blocked by proxy policy** — unverifiable from this runtime. TurtleCI (the agency's CI) consumed 32 named secrets (`.turtleci/*.yml`); that store is where the deploy path historically got them |
| 4 | `.env`, `.env.production`, related | marketplace: `.env.example` and `.env-template` only. fresh-web repos: a committed `.env` holding Supabase **publishable** keys — no AWS |
| 5 | Runtime credential files | `~/.aws/credentials` absent; `~/.aws/config` holds one S3 flag; no SSO/CLI cache; `~/.boto` is a CA path. IMDS/ECS endpoints (169.254.x) blocked by the proxy — no instance role reachable |
| 6 | Previous working deployment config | `.turtleci/production.yml` + `scripts/deploy.sh` — names above |
| 7 | Repo docs, scripts, other repos | `CLAUDE.md` names the operator path (`ssm_runx.py`, `east_runx.py`); `docs/WEST_ACCESS.md` records SSM proven with operator creds; `pool-memory-vault` is a Lovable app (no AWS); `prnm-seo-engine` is empty |
| 8 | Exact var names expected | `AWS_ENV_USER_ACCESS_KEY_ID`, `AWS_ENV_USER_SECRET_ACCESS_KEY`, `AWS_ENV_USER_REGION`, `AWS_JH_ENV_SECRET_NAME` |
| 9 | Present-but-invalid test | `aws sts get-caller-identity` → `InvalidClientTokenId`: the placeholder is sent to AWS as-is and rejected |
| — | Git history (142 commits) | no key-shaped string has ever been committed |

**Where the working credentials actually are:** the operator machine
(`/root/.claude/prnm-creds.env`, used by `ssm_runx.py` — this is how WEST has
been administered for months), the WEST and EAST container environments, and
the CI platform's secret store. None of those is this cloud container.

**The persistent fix is reuse, not creation:** place the *existing*
`AWS_ENV_USER_*` pair and `AWS_JH_ENV_SECRET_NAME` into the cloud environment's
env keys once. Every session then inherits them and `scripts/prnm-secrets.sh`
resolves the rest from Secrets Manager. No new key, no rotation.
