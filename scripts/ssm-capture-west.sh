#!/usr/bin/env bash
#
# Capture WEST over AWS Systems Manager. No SSH, no private key, no PEM.
#
#   bash scripts/ssm-capture-west.sh [output-dir]
#
# Why this exists: the deploy path inherited from TurtleCI reaches WEST with a
# long-lived EC2 private key stored as a GitHub secret (PRODUCTION_ENCODED_PEM).
# WEST already runs the SSM agent — the marketplace has been administered through
# `AWS-RunShellScript` for months — so a persistent key in CI is avoidable
# entirely. This path uses whatever AWS credentials the caller already has,
# which in CI means a short-lived OIDC role.
#
# READ-ONLY. It sends the capture script to the box, runs it, retrieves the small
# evidence set, and deletes what it left behind. It starts, stops and restarts
# nothing, and never deploys.
#
# Requires: aws CLI, and IAM permission for ssm:SendCommand +
# ssm:GetCommandInvocation on the instance.
#
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

OUT_DIR="${1:-./production-reconciliation}"
REGION="${WEST_AWS_REGION:-us-west-1}"
REMOTE_OUT="/tmp/prnm-recon-$$"
# SSM caps StandardOutputContent at 24,000 characters; stay well under it.
CHUNK=18000

log() { printf '  %s\n' "$*"; }
die() { printf 'ssm-capture: %s\n' "$*" >&2; exit 1; }

command -v aws >/dev/null || die "aws CLI not found"

# ------------------------------------------------------------ instance id
INSTANCE="${WEST_INSTANCE_ID:-}"
if [ -z "$INSTANCE" ]; then
  IP="${WEST_PUBLIC_IP:-13.56.113.85}"
  log "resolving the instance from public IP $IP"
  INSTANCE=$(aws ec2 describe-instances --region "$REGION" \
    --filters "Name=ip-address,Values=$IP" "Name=instance-state-name,Values=running" \
    --query 'Reservations[0].Instances[0].InstanceId' --output text 2>/dev/null)
  [ "$INSTANCE" = "None" ] && INSTANCE=""
fi
[ -n "$INSTANCE" ] || die "could not determine the WEST instance id (set WEST_INSTANCE_ID)"
log "instance: $INSTANCE"

# Confirm SSM can actually see it before sending anything.
PING=$(aws ssm describe-instance-information --region "$REGION" \
  --filters "Key=InstanceIds,Values=$INSTANCE" \
  --query 'InstanceInformationList[0].PingStatus' --output text 2>/dev/null)
[ "$PING" = "Online" ] || die "SSM reports the instance as '${PING:-unavailable}' — the agent is not reachable"
log "SSM agent: Online"

# --------------------------------------------------------------- run helper
send() {
  local cmd="$1" timeout="${2:-600}"
  local id
  id=$(aws ssm send-command --region "$REGION" \
        --instance-ids "$INSTANCE" \
        --document-name AWS-RunShellScript \
        --timeout-seconds "$timeout" \
        --parameters "commands=[\"$(printf '%s' "$cmd" | sed 's/\\/\\\\/g; s/"/\\"/g')\"]" \
        --query 'Command.CommandId' --output text 2>/dev/null) || return 1
  [ -n "$id" ] || return 1
  local status
  for _ in $(seq 1 "$((timeout / 3))"); do
    sleep 3
    status=$(aws ssm get-command-invocation --region "$REGION" \
      --command-id "$id" --instance-id "$INSTANCE" \
      --query 'Status' --output text 2>/dev/null)
    case "$status" in
      Success) aws ssm get-command-invocation --region "$REGION" --command-id "$id" \
                 --instance-id "$INSTANCE" --query 'StandardOutputContent' --output text 2>/dev/null
               return 0 ;;
      Failed|Cancelled|TimedOut)
               aws ssm get-command-invocation --region "$REGION" --command-id "$id" \
                 --instance-id "$INSTANCE" --query 'StandardErrorContent' --output text 2>/dev/null >&2
               return 1 ;;
    esac
  done
  return 1
}

# ------------------------------------------------------- ship + run capture
log "sending the capture script"
SCRIPT_B64=$(base64 -w0 scripts/capture-production-state.sh 2>/dev/null || base64 scripts/capture-production-state.sh | tr -d '\n')
send "mkdir -p $REMOTE_OUT && echo '$SCRIPT_B64' | base64 -d > $REMOTE_OUT/capture.sh && echo shipped" 120 >/dev/null \
  || die "could not deliver the capture script over SSM"

log "running the capture (read-only)"
send "cd $REMOTE_OUT && AWS_INSTANCE_DEPLOY_SCRIPT='${AWS_INSTANCE_DEPLOY_SCRIPT:-}' AWS_JH_ENV_SECRET_NAME='${AWS_JH_ENV_SECRET_NAME:-}' AWS_ENV_USER_REGION='${AWS_ENV_USER_REGION:-}' OUT=$REMOTE_OUT/production-reconciliation bash $REMOTE_OUT/capture.sh 2>&1 | tail -20" 900 \
  | sed 's/^/    /'

# -------------------------------------------------------------- retrieve
# Only the small evidence set travels back through command output. The full
# source tree stays on the box: it is not needed to answer the injection
# question, and SSM output is not a file transfer channel.
log "packaging the evidence"
PACK="state.json deploy-script-analysis.json west-deploy-script.sh deploy-script-findings.txt file-manifest.txt secret-names.txt"
SIZE=$(send "cd $REMOTE_OUT/production-reconciliation 2>/dev/null && tar czf $REMOTE_OUT/evidence.tgz $(echo $PACK) 2>/dev/null; base64 -w0 $REMOTE_OUT/evidence.tgz > $REMOTE_OUT/evidence.b64 2>/dev/null; wc -c < $REMOTE_OUT/evidence.b64" 300) || SIZE=""
SIZE=$(printf '%s' "$SIZE" | tr -dc '0-9')
[ -n "$SIZE" ] && [ "$SIZE" -gt 0 ] 2>/dev/null || die "the capture produced no retrievable evidence"
CHUNKS=$(( (SIZE + CHUNK - 1) / CHUNK ))
log "retrieving $SIZE base64 bytes in $CHUNKS chunk(s)"

rm -rf "$OUT_DIR"; mkdir -p "$OUT_DIR"
: > /tmp/prnm-evidence.b64
for i in $(seq 1 "$CHUNKS"); do
  START=$(( (i - 1) * CHUNK + 1 ))
  part=$(send "cut -c${START}-$(( START + CHUNK - 1 )) $REMOTE_OUT/evidence.b64" 120) || die "chunk $i failed"
  printf '%s' "$part" | tr -d '\n\r ' >> /tmp/prnm-evidence.b64
  log "  chunk $i/$CHUNKS"
done

base64 -d /tmp/prnm-evidence.b64 > /tmp/prnm-evidence.tgz 2>/dev/null \
  || die "the retrieved evidence did not decode"
tar xzf /tmp/prnm-evidence.tgz -C "$OUT_DIR" 2>/dev/null \
  || die "the retrieved evidence did not extract"
rm -f /tmp/prnm-evidence.b64 /tmp/prnm-evidence.tgz

# ------------------------------------------------------------- leave clean
log "removing what we left on the box"
send "rm -rf $REMOTE_OUT" 60 >/dev/null

log "captured $(find "$OUT_DIR" -type f | wc -l) evidence files into $OUT_DIR"
exit 0
