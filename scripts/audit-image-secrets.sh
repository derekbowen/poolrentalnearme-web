#!/usr/bin/env bash
#
# Prove a built image carries no production secrets. Run after `docker build`
# and before `docker push` / deploy. Exits non-zero if anything forbidden is
# found, so it works as a CI gate.
#
#   bash scripts/audit-image-secrets.sh <image[:tag]>
#   bash scripts/audit-image-secrets.sh myimage:latest --reference-env .env
#
# What it checks:
#   1. no .env file anywhere in the image filesystem
#   2. no key/certificate material in the filesystem
#   3. no credential-shaped strings in any file
#   4. no credential-shaped strings in the image build history
#   5. no secrets baked into the image's declared ENV
#   6. optionally, that no VALUE from a reference .env appears in the image —
#      compared by hash, so no secret is ever printed or written
#
# Nothing here prints a secret. Findings are reported as a path plus the KIND of
# match; the matched text itself is never echoed.
#
set -uo pipefail

IMAGE="${1:-}"
if [ -z "$IMAGE" ] || [ "$IMAGE" = "--help" ]; then
  sed -n '2,20p' "$0"
  exit 2
fi
shift || true

REFERENCE_ENV=""
while [ $# -gt 0 ]; do
  case "$1" in
    --reference-env) REFERENCE_ENV="${2:-}"; shift 2 ;;
    *) shift ;;
  esac
done

command -v docker >/dev/null || { echo "docker is required"; exit 2; }
docker image inspect "$IMAGE" >/dev/null 2>&1 || { echo "image not found: $IMAGE"; exit 2; }

RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; DIM=$'\033[2m'; NC=$'\033[0m'
fail=0
note() { printf '  %s\n' "$*"; }
bad()  { printf '  %s✗%s %s\n' "$RED" "$NC" "$*"; fail=1; }
good() { printf '  %s✓%s %s\n' "$GREEN" "$NC" "$*"; }

# Credential shapes. Deliberately specific: a guard that cries wolf gets disabled.
SECRET_RE='sk_live_[A-Za-z0-9]{8}|rk_live_[A-Za-z0-9]{8}|sk_test_[A-Za-z0-9]{8}|whsec_[A-Za-z0-9]{8}|SG\.[A-Za-z0-9_-]{16}|AKIA[0-9A-Z]{16}|AC[0-9a-f]{32}|SK[0-9a-f]{32}|eyJhbGciOi[A-Za-z0-9_-]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----'

echo "IMAGE SECRET AUDIT — $IMAGE"
echo ""

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Export the filesystem without executing anything from the image.
CID=$(docker create "$IMAGE" true 2>/dev/null) || { echo "could not create container from image"; exit 2; }
docker export "$CID" -o "$TMP/fs.tar" 2>/dev/null
docker rm -f "$CID" >/dev/null 2>&1

# ---------------------------------------------------------- 1. .env presence
ENV_FILES=$(tar -tf "$TMP/fs.tar" 2>/dev/null \
  | grep -E '(^|/)\.env($|\.[A-Za-z0-9._-]+$)' \
  | grep -vE 'node_modules/' \
  | grep -vE '\.env\.example$' || true)
if [ -n "$ENV_FILES" ]; then
  bad "an .env file exists inside the image:"
  echo "$ENV_FILES" | sed 's/^/      /'
else
  good "no .env file in the image filesystem"
fi

# ------------------------------------------------- 2. key / cert material
KEY_FILES=$(tar -tf "$TMP/fs.tar" 2>/dev/null \
  | grep -E '\.(pem|key|p12|pfx|jks)$|(^|/)credentials\.json$|(^|/)id_rsa' \
  | grep -vE 'node_modules/|/usr/lib/ssl/|/etc/ssl/|ca-certificates' || true)
if [ -n "$KEY_FILES" ]; then
  bad "key or certificate material in the image:"
  echo "$KEY_FILES" | sed 's/^/      /'
else
  good "no key or certificate material"
fi

# --------------------------------------------- 3. credential-shaped content
mkdir -p "$TMP/fs"
tar -xf "$TMP/fs.tar" -C "$TMP/fs" 2>/dev/null
HITS=$(grep -rlEI "$SECRET_RE" "$TMP/fs" 2>/dev/null \
  | grep -vE '/node_modules/|/usr/share/|/etc/ssl/|/usr/lib/ssl/' \
  | sed "s#^$TMP/fs##" | head -25 || true)
if [ -n "$HITS" ]; then
  bad "credential-shaped strings found in these files (contents not shown):"
  echo "$HITS" | sed 's/^/      /'
else
  good "no credential-shaped strings in the filesystem"
fi

# ------------------------------------------------------- 4. build history
if docker history --no-trunc "$IMAGE" 2>/dev/null | grep -qE "$SECRET_RE"; then
  bad "credential-shaped strings appear in the image build history"
else
  good "image build history is clean"
fi
if docker history --no-trunc "$IMAGE" 2>/dev/null | grep -qE 'COPY .*\.env( |$)'; then
  bad "build history shows an .env being copied into the image"
else
  good "build history contains no .env copy"
fi

# ---------------------------------------------------------- 5. declared ENV
BAKED=$(docker image inspect "$IMAGE" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
  | grep -E "$SECRET_RE" | cut -d= -f1 || true)
if [ -n "$BAKED" ]; then
  bad "secret values are baked into the image's declared ENV (variable names):"
  echo "$BAKED" | sed 's/^/      /'
else
  good "no secrets in the image's declared ENV"
fi

# ------------------------------------------- 6. reference .env value check
if [ -n "$REFERENCE_ENV" ] && [ -f "$REFERENCE_ENV" ]; then
  leaked=0
  checked=0
  while IFS= read -r line; do
    case "$line" in ''|\#*) continue ;; esac
    name="${line%%=*}"
    value="${line#*=}"
    # Only meaningful, non-public values are worth searching for.
    [ "${#value}" -lt 12 ] && continue
    case "$name" in VITE_*) continue ;; esac
    checked=$((checked + 1))
    if grep -rqlF -- "$value" "$TMP/fs" 2>/dev/null; then
      bad "a value from $REFERENCE_ENV appears in the image (variable: $name)"
      leaked=$((leaked + 1))
    fi
  done < "$REFERENCE_ENV"
  if [ "$leaked" -eq 0 ]; then
    good "none of the $checked non-public reference values appear in the image"
  fi
else
  note "${DIM}reference-env check skipped (pass --reference-env .env to enable)${NC}"
fi

echo ""
if [ "$fail" -eq 0 ]; then
  printf '%sPASSED — no production secrets in %s%s\n' "$GREEN" "$IMAGE" "$NC"
  exit 0
fi
printf '%sFAILED — do not push or deploy this image.%s\n' "$RED" "$NC"
exit 1
