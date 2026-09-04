#!/usr/bin/env bash
# Load PRNM production secrets into the CURRENT shell, from the canonical store.
#
#   source scripts/prnm-secrets.sh            # load everything
#   source scripts/prnm-secrets.sh --check    # report what resolves, load nothing
#
# WHY: the Sharetribe Integration credentials already exist in AWS Secrets
# Manager and are injected into the WEST container at deploy time. They should
# never be pasted into a chat, a file, or a new IAM user. This script is the one
# supported way to get them into a session.
#
# RESOLUTION ORDER — first hit wins, and each step is announced by NAME only:
#   1. Already in the environment (a shell that inherited the container env).
#   2. A local .env (git-ignored; developer machines only).
#   3. AWS Secrets Manager, using whatever AWS identity the caller already has.
#
# It prints variable NAMES and resolution SOURCES. It never prints a value, not
# even truncated. `set -x` is explicitly disabled for that reason.
set -uo pipefail
set +x

CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1

# The canonical secret is one JSON blob holding the whole environment. Its NAME
# is itself configuration (AWS_JH_ENV_SECRET_NAME) because it differs per
# environment — production vs development.
SECRET_NAME="${AWS_JH_ENV_SECRET_NAME:-}"
REGION="${AWS_ENV_USER_REGION:-${AWS_REGION:-ap-southeast-1}}"

# The credentials this script exists to provide. Canonical names only; the
# aliases are handled in code by server/api-util/sharetribeCredentials.js.
WANTED=(
  SHARETRIBE_INTEGRATION_SDK_CLIENT_ID
  SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET
  SHARETRIBE_SDK_CLIENT_SECRET
  VITE_SHARETRIBE_SDK_CLIENT_ID
)

have() { command -v "$1" >/dev/null 2>&1; }
present() { [ -n "${!1:-}" ]; }

report() { printf '  %-44s %s\n' "$1" "$2"; }

echo "PRNM secrets — resolving (names and sources only, never values)"

# ---- 1. already in the environment ----------------------------------------
missing=()
for v in "${WANTED[@]}"; do
  if present "$v"; then report "$v" "already in environment"; else missing+=("$v"); fi
done
[ ${#missing[@]} -eq 0 ] && { echo "All required secrets already present."; return 0 2>/dev/null || exit 0; }

# ---- 2. local .env ---------------------------------------------------------
if [ -f .env ]; then
  # shellcheck disable=SC2046
  set -a; . ./.env; set +a
  still=()
  for v in "${missing[@]}"; do
    if present "$v"; then report "$v" "loaded from ./.env"; else still+=("$v"); fi
  done
  missing=("${still[@]}")
  [ ${#missing[@]} -eq 0 ] && { echo "Resolved from ./.env."; return 0 2>/dev/null || exit 0; }
fi

# ---- 3. AWS Secrets Manager ------------------------------------------------
if ! have aws; then
  echo "  aws CLI not installed — cannot reach Secrets Manager."
  echo "  Install it, or run this on a host that already has the container env."
  return 1 2>/dev/null || exit 1
fi
if [ -z "$SECRET_NAME" ]; then
  echo "  AWS_JH_ENV_SECRET_NAME is not set — the secret's NAME is configuration,"
  echo "  not a constant, so it must be supplied. See docs/SECRETS_BOOTSTRAP.md."
  return 1 2>/dev/null || exit 1
fi
if ! aws sts get-caller-identity >/dev/null 2>&1; then
  echo "  No usable AWS identity. Configure one (SSO, profile, or an assumed role)"
  echo "  with secretsmanager:GetSecretValue on the PRNM env secret only."
  return 1 2>/dev/null || exit 1
fi

if [ "$CHECK_ONLY" = "1" ]; then
  aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region "$REGION" \
    --query '{name:Name,changed:LastChangedDate}' --output text 2>/dev/null \
    && echo "  secret is readable — rerun without --check to load" \
    || echo "  secret NOT readable with the current identity"
  return 0 2>/dev/null || exit 0
fi

tmp="$(mktemp)"; chmod 600 "$tmp"
trap 'rm -f "$tmp"' EXIT
if ! aws secretsmanager get-secret-value --secret-id "$SECRET_NAME" --region "$REGION" \
      --query SecretString --output text >"$tmp" 2>/dev/null; then
  echo "  Could not read $SECRET_NAME in $REGION with the current identity."
  return 1 2>/dev/null || exit 1
fi

# The blob is JSON; reuse the same converter the deploy path uses.
env_file="$(mktemp)"; chmod 600 "$env_file"
trap 'rm -f "$tmp" "$env_file"' EXIT
./scripts/json2env.sh "$tmp" "$env_file" >/dev/null 2>&1
set -a; . "$env_file"; set +a

for v in "${missing[@]}"; do
  present "$v" && report "$v" "loaded from Secrets Manager" || report "$v" "STILL MISSING"
done
echo "Done. Values are in this shell only — nothing was written to disk or printed."
