#!/usr/bin/env bash
#
# One command. Connects to WEST, captures its state, brings the artifact back,
# verifies runtime env injection, compares the on-box deploy script against the
# canonical one, generates a patch if needed, prints the verdict.
#
#   bash scripts/verify-west.sh
#
# Terminal equivalent of the "Verify WEST" GitHub Actions workflow — press Run
# workflow there and you never touch a shell at all. Both print the same verdict,
# because both call scripts/west-verdict.js.
#
# Configuration, from the environment or a local .env:
#   WEST_SSH_TARGET   e.g. ubuntu@13.56.113.85   (or AWS_INSTANCE_URL)
#   WEST_SSH_KEY      path to the .pem           (or ENCODED_PEM, base64)
#
# READ-ONLY. Copies one script to /tmp on the box, runs it, retrieves the result,
# removes what it copied. Starts, stops and restarts nothing. Never deploys.
#
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

TARGET="${WEST_SSH_TARGET:-${AWS_INSTANCE_URL:-}}"
KEYFILE="${WEST_SSH_KEY:-}"
CLEANUP_KEY=0

# Fall back to a local .env for these two, so the usual case is zero arguments.
if [ -z "$TARGET" ] && [ -f .env ]; then
  TARGET=$(grep -E '^(WEST_SSH_TARGET|AWS_INSTANCE_URL)=' .env 2>/dev/null | head -1 | cut -d= -f2-)
fi

if [ -z "$KEYFILE" ] && [ -n "${ENCODED_PEM:-}" ]; then
  KEYFILE=$(mktemp); echo "$ENCODED_PEM" | base64 --decode > "$KEYFILE"; chmod 400 "$KEYFILE"
  CLEANUP_KEY=1
fi

fail_verdict() {
  cat <<VERDICT

WEST ACCESS: FAIL
DEPLOY SCRIPT FOUND: NO
RUNTIME ENV INJECTION: FAIL
PRODUCTION DRIFT CAPTURED: NO
CANONICAL SCRIPT MATCH: NO
PATCH REQUIRED: YES

SAFE TO DEPLOY: NO

Remaining blocker:
  $1
VERDICT
  [ "$CLEANUP_KEY" = "1" ] && rm -f "$KEYFILE"
  exit 1
}

[ -n "$TARGET" ]  || fail_verdict "No WEST target. Set WEST_SSH_TARGET (e.g. ubuntu@13.56.113.85)."
[ -n "$KEYFILE" ] || fail_verdict "No SSH key. Set WEST_SSH_KEY to a .pem path, or ENCODED_PEM to its base64."
[ -f "$KEYFILE" ] || fail_verdict "SSH key not found at $KEYFILE."

SSH="ssh -o StrictHostKeyChecking=no -o ConnectTimeout=20 -i $KEYFILE"
SCP="scp -o StrictHostKeyChecking=no -i $KEYFILE"

echo "Connecting to $TARGET ..."
$SSH "$TARGET" 'echo ok' >/dev/null 2>&1 \
  || fail_verdict "Could not SSH to $TARGET. Check the key, the target and any security-group rule."

echo "Capturing production state (read-only) ..."
$SCP scripts/capture-production-state.sh "$TARGET:/tmp/prnm-capture.sh" >/dev/null 2>&1 \
  || fail_verdict "Could not copy the capture script to $TARGET."

$SSH "$TARGET" "cd /tmp && AWS_INSTANCE_DEPLOY_SCRIPT='${AWS_INSTANCE_DEPLOY_SCRIPT:-}' AWS_JH_ENV_SECRET_NAME='${AWS_JH_ENV_SECRET_NAME:-}' AWS_ENV_USER_REGION='${AWS_ENV_USER_REGION:-}' OUT=/tmp/production-reconciliation bash /tmp/prnm-capture.sh" \
  || echo "  (capture returned non-zero; collecting whatever it produced)"

echo "Retrieving the artifact ..."
rm -rf production-reconciliation capture.tar.gz
$SSH "$TARGET" 'tar czf /tmp/prnm-capture.tar.gz -C /tmp production-reconciliation' >/dev/null 2>&1
$SCP "$TARGET:/tmp/prnm-capture.tar.gz" ./capture.tar.gz >/dev/null 2>&1 \
  || fail_verdict "The capture produced nothing retrievable on $TARGET."

# Leave the box exactly as we found it.
$SSH "$TARGET" 'rm -rf /tmp/prnm-capture.sh /tmp/production-reconciliation /tmp/prnm-capture.tar.gz /tmp/production-reconciliation-*.tar.gz' >/dev/null 2>&1
[ "$CLEANUP_KEY" = "1" ] && rm -f "$KEYFILE"

tar xzf capture.tar.gz
[ -d production-reconciliation ] || mv tmp/production-reconciliation . 2>/dev/null
rm -rf tmp capture.tar.gz

echo "Verifying ..."
node scripts/verify-west-runtime-injection.js ./production-reconciliation >/dev/null 2>&1
node scripts/reconcile-production.js ./production-reconciliation --write-report >/dev/null 2>&1

node scripts/west-verdict.js ./production-reconciliation
verdict=$?

echo "Full capture: ./production-reconciliation/"
if [ -f production-reconciliation/west-deploy-script.patch ]; then
  echo "Generated correction: production-reconciliation/proposed-west-deploy-script.sh"
  echo "Reviewable patch:     production-reconciliation/west-deploy-script.patch"
fi
exit $verdict
