#!/usr/bin/env bash
#
# Decide how to reach WEST, before anything is attempted.
#
#   bash scripts/west-access-probe.sh
#
# Prints a verdict and, in GitHub Actions, writes `method` and `missing` to
# $GITHUB_OUTPUT. Exits 0 when a usable path exists, 1 when none does.
#
# Order of preference:
#   1. SSM   — AWS credentials + a reachable SSM agent. No stored private key.
#              WEST has been administered this way for months, so this is not a
#              new capability, it is the one already in use.
#   2. SSH   — the inherited TurtleCI path: PRODUCTION_AWS_INSTANCE_URL plus a
#              long-lived EC2 private key in PRODUCTION_ENCODED_PEM.
#
# Touches nothing. Read-only probing only: get-caller-identity,
# describe-instances, describe-instance-information.
#
set -uo pipefail

REGION="${WEST_AWS_REGION:-us-west-1}"
method="none"
missing=""
notes=""

emit() {
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    { echo "method=$method"; echo "missing=$missing"; } >> "$GITHUB_OUTPUT"
  fi
}

say() { printf '  %s\n' "$*"; }

echo "WEST ACCESS PROBE"
echo ""

# ---------------------------------------------------------------- 1. SSM
ssm_ok=0
if command -v aws >/dev/null 2>&1; then
  if aws sts get-caller-identity >/dev/null 2>&1; then
    say "AWS credentials: usable"
    INSTANCE="${WEST_INSTANCE_ID:-}"
    if [ -z "$INSTANCE" ]; then
      IP="${WEST_PUBLIC_IP:-13.56.113.85}"
      INSTANCE=$(aws ec2 describe-instances --region "$REGION" \
        --filters "Name=ip-address,Values=$IP" "Name=instance-state-name,Values=running" \
        --query 'Reservations[0].Instances[0].InstanceId' --output text 2>/dev/null)
      [ "$INSTANCE" = "None" ] && INSTANCE=""
      [ -n "$INSTANCE" ] && say "instance resolved from $IP: $INSTANCE"
    else
      say "instance from WEST_INSTANCE_ID: $INSTANCE"
    fi
    if [ -n "$INSTANCE" ]; then
      PING=$(aws ssm describe-instance-information --region "$REGION" \
        --filters "Key=InstanceIds,Values=$INSTANCE" \
        --query 'InstanceInformationList[0].PingStatus' --output text 2>/dev/null)
      if [ "$PING" = "Online" ]; then
        say "SSM agent: Online"
        ssm_ok=1
      else
        say "SSM agent: ${PING:-not registered}"
        notes="$notes SSM_AGENT=${PING:-unavailable}"
      fi
    else
      say "instance could not be resolved"
      notes="$notes INSTANCE=unresolved"
    fi
  else
    say "AWS credentials: not usable (no OIDC role and no static keys)"
    notes="$notes AWS=unauthenticated"
  fi
else
  say "aws CLI: not installed"
  notes="$notes AWS_CLI=absent"
fi

# ---------------------------------------------------------------- 2. SSH
ssh_ok=0
have_url=0; have_pem=0
[ -n "${AWS_INSTANCE_URL:-}" ] && have_url=1
[ -n "${ENCODED_PEM:-}" ] && have_pem=1
[ "$have_url" = "1" ] && [ "$have_pem" = "1" ] && ssh_ok=1
say "SSH target secret (PRODUCTION_AWS_INSTANCE_URL): $([ "$have_url" = 1 ] && echo present || echo MISSING)"
say "SSH key secret (PRODUCTION_ENCODED_PEM): $([ "$have_pem" = 1 ] && echo present || echo MISSING)"

echo ""

# ------------------------------------------------------------- decision
if [ "$ssm_ok" = "1" ]; then
  method="ssm"
  echo "METHOD: SSM (no private key required)"
  emit
  exit 0
fi

if [ "$ssh_ok" = "1" ]; then
  method="ssh"
  echo "METHOD: SSH (long-lived PEM — see docs/WEST_ACCESS.md for the SSM replacement)"
  emit
  exit 0
fi

# Neither. Name exactly what is missing, by secret name.
[ "$have_url" = "0" ] && missing="$missing PRODUCTION_AWS_INSTANCE_URL"
[ "$have_pem" = "0" ] && missing="$missing PRODUCTION_ENCODED_PEM"
missing="${missing# }"
method="none"
echo "METHOD: none available"
echo ""
echo "SSM is unavailable because:${notes:- no reason recorded}"
if [ -n "$missing" ]; then
  echo "SSH is unavailable because these repository secrets are not set:"
  for m in $missing; do echo "  $m"; done
fi
emit
exit 1
