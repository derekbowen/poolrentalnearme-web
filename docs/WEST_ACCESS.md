# How CI reaches WEST — and how it should

Traced from the deployment scripts, not assumed.

**Summary: the stored private key is avoidable, but not yet avoided.** WEST runs the SSM
agent and has been administered through `AWS-RunShellScript` for months — by an operator's own
AWS credentials. GitHub Actions has no AWS identity in this repository at all, so today neither
access path works. One AWS-side setup step is unavoidable; §"What it needs" gives the exact
policy JSON.

---

## The two inherited secrets

### `PRODUCTION_AWS_INSTANCE_URL`

**What produced it:** a human, when TurtleCI was set up. It is not derived from anything.

**Where it is consumed:** `scripts/deploy.sh:78` — the SSH destination.

```bash
ssh -o StrictHostKeyChecking=no -i "${AWS_PRIVATE_KEY_PATH}" ${AWS_INSTANCE_URL} "IMAGE_URL=… ${AWS_INSTANCE_DEPLOY_SCRIPT}"
```

`scripts/set_environment.sh:68` refuses to continue when neither `AWS_INSTANCE_URL` nor
`AWS_INSTANCE_URLS` is set and `USE_SSH_DEPLOYMENT=TRUE`.

**What the value is:** an SSH destination of the form `user@host` for the WEST marketplace
box — `13.56.113.85` per CLAUDE.md, user `ubuntu` (every path on that host is
`/home/ubuntu/…`). Not a secret in any meaningful sense: the IP is public and in the repo's
own documentation. It is a *secret* only because TurtleCI stored it as one.

### `PRODUCTION_ENCODED_PEM`

**What produced it:** base64 of the EC2 key-pair private key for the WEST instance, produced
once by whoever created that key pair. AWS shows a key pair's private half exactly once at
creation, so this value cannot be re-derived — only replaced by rotating the key pair, which is
explicitly out of scope here.

**Where it is consumed:** `scripts/deploy.sh:36-37`.

```bash
echo ${ENCODED_PEM} | base64 --decode >${AWS_PRIVATE_KEY_PATH}
chmod 400 ${AWS_PRIVATE_KEY_PATH}
```

`AWS_PRIVATE_KEY_PATH` is `./${TEMPORARY_SESSION_NAME}.pem` where the session name is a
`uuidgen` (`set_environment.sh:76`). The file is deleted at the end of the run
(`deploy.sh:93`).

**What it corresponds to:** the SSH key pair attached to the WEST EC2 instance, giving root-
equivalent shell as `ubuntu`. It is the single most powerful credential in the deployment
chain, and the architecture asks for it to sit permanently in a CI secret store.

**A bug worth knowing about.** `set_environment.sh:66`:

```bash
set_env_var "ENCODED_PEM" "TRUE"
```

If `ENCODED_PEM` is unset, this defaults it to the literal string `TRUE`, which
base64-decodes to three bytes of garbage. The deploy then writes a corrupt key file and fails
at the SSH step with a confusing permissions error rather than saying the key is missing. The
access probe checks for the variable directly and reports it by name instead.

**Do these exist as GitHub secrets today?** Unknown, and not knowable from here. They were
TurtleCI secrets, and TurtleCI never executed under GitHub — `.turtleci/*.yml` was never a
GitHub Actions workflow. They may never have been created in this repository. The probe answers
this definitively on the first run.

---

## The replacement: SSM

**Already proven on WEST.** The marketplace has been operated for months through
`ssm:SendCommand` with `AWS-RunShellScript` against instance `i-0a711c88043788b2b` in
`us-west-1` — image builds, gated flips, nginx inspection, log reads. The SSM agent is
installed, running and registered. This is not a migration to something new; it is using the
channel that is already the primary one.

| | SSH + PEM | SSM |
|---|---|---|
| Stored credential | a permanent private key in CI | none |
| If CI is compromised | attacker gets durable shell on WEST | attacker gets whatever the role allows, for the length of one token |
| Revocation | rotate the EC2 key pair, update every consumer | detach the IAM policy |
| Audit trail | sshd logs on the box | CloudTrail, per command, per caller |
| Port 22 | must be reachable | can be closed entirely |

### Current reality, checked 2026-09-04

This repository has **no secrets, no variables and no environments**. So:

- the OIDC step is skipped (`AWS_ROLE_ARN` is unset);
- the static fallback reads secrets that do not exist;
- the SSH fallback's two secrets do not exist either.

`Verify WEST` therefore probes, finds neither path, prints the FAIL report and
captures nothing. That is the designed behaviour, and it is safe — but it means
**one AWS-side setup step is genuinely unavoidable.** Earlier text in this repository
claimed otherwise; it was wrong.

A related correction: "SSM is proven on WEST" is true about the *agent*, and the
proof came from an operator's own AWS credentials — not from GitHub's. The agent
being Online says nothing about whether GitHub Actions can call `SendCommand`.
Those are separate facts and the earlier write-up slid between them.

### What it needs

**Exactly one thing: an IAM role GitHub can assume.** Then set `AWS_ROLE_ARN` as a
repository variable and nothing else is required — no PEM, no static keys.

The account must already have the GitHub OIDC provider registered
(`token.actions.githubusercontent.com`). If it does not, add it once; AWS documents
it as a single IAM console action.

**Trust policy** — replace `<ACCOUNT_ID>`, and narrow the `sub` further if you want
to restrict which branches may assume it:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:derekbowen/poolrentalnearme-web:*"
        }
      }
    }
  ]
}
```

**Permissions policy** — the least privilege `Verify WEST` needs. `SendCommand` is
scoped to the one instance and the one document; the three read-only calls do not
support resource-level scoping, so they take `*`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "RunCommandOnWestOnly",
      "Effect": "Allow",
      "Action": "ssm:SendCommand",
      "Resource": [
        "arn:aws:ec2:us-west-1:<ACCOUNT_ID>:instance/i-0a711c88043788b2b",
        "arn:aws:ssm:us-west-1::document/AWS-RunShellScript"
      ]
    },
    {
      "Sid": "ReadCommandResults",
      "Effect": "Allow",
      "Action": [
        "ssm:GetCommandInvocation",
        "ssm:ListCommandInvocations",
        "ssm:DescribeInstanceInformation"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ResolveInstanceFromPublicIp",
      "Effect": "Allow",
      "Action": "ec2:DescribeInstances",
      "Resource": "*"
    }
  ]
}
```

That grants logged, per-invocation command execution on one instance. The PEM it
replaces grants an interactive root-equivalent shell with no per-action audit trail.

### The shorter path, if the old IAM user still exists

`PRODUCTION_AWS_ENV_USER_ACCESS_KEY_ID` / `_SECRET` named an IAM user that TurtleCI
used to read Secrets Manager. If that user still exists **and** has `ssm:SendCommand`
on the WEST instance, adding those two as repository secrets lights up the SSM path
with no PEM and no new IAM work. Whether it has that permission is unknown from here —
the probe will say on the first run. This is the faster option, not the better one:
it is a long-lived static key, which is what the OIDC role exists to retire.

### Other details

Optional repository variables, all with working defaults: `WEST_INSTANCE_ID` (otherwise
resolved from the public IP), `WEST_PUBLIC_IP` (default `13.56.113.85`), `WEST_AWS_REGION`
(default `us-west-1`).

### What SSM does not replace yet

`scripts/deploy.sh` still uses `scp` and `ssh` to deliver the runtime env file and invoke the
on-box deploy script. Moving *deployment* to SSM is a larger change that touches the release
path, and it is not attempted here — this document and the probe cover the read-only
verification path only. The natural follow-up is to have `deploy.sh` deliver the env file
through SSM or S3 and invoke the deploy script with `SendCommand`, at which point the PEM
leaves the architecture entirely.

**No key was generated, rotated or overwritten in producing any of this.**
