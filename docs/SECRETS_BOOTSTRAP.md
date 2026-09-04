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
