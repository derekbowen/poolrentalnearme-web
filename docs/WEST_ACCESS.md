# How CI reaches WEST — and how it should

Traced from the deployment scripts, not assumed.

**Summary: the stored private key is avoidable.** WEST already runs the SSM agent and has
been administered through `AWS-RunShellScript` for months. `Verify WEST` prefers that path and
falls back to SSH only if AWS access is unavailable.

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

### What it needs

One repository variable — **`AWS_ROLE_ARN`** — naming an IAM role that trusts this repository
through GitHub's OIDC provider, with permission to:

```
ssm:SendCommand                on the WEST instance and the AWS-RunShellScript document
ssm:GetCommandInvocation       (resource *)
ssm:DescribeInstanceInformation
ec2:DescribeInstances          only to resolve the instance from its public IP
```

That is strictly less privilege than the PEM grants today: command execution that is logged
per-invocation, rather than an interactive root-equivalent shell.

Optional variables, both with working defaults: `WEST_INSTANCE_ID` (otherwise resolved from
the public IP), `WEST_PUBLIC_IP` (default `13.56.113.85`), `WEST_AWS_REGION` (default
`us-west-1`).

With `AWS_ROLE_ARN` set, **`PRODUCTION_ENCODED_PEM` is no longer required for verification.**

### What SSM does not replace yet

`scripts/deploy.sh` still uses `scp` and `ssh` to deliver the runtime env file and invoke the
on-box deploy script. Moving *deployment* to SSM is a larger change that touches the release
path, and it is not attempted here — this document and the probe cover the read-only
verification path only. The natural follow-up is to have `deploy.sh` deliver the env file
through SSM or S3 and invoke the deploy script with `SendCommand`, at which point the PEM
leaves the architecture entirely.

**No key was generated, rotated or overwritten in producing any of this.**
