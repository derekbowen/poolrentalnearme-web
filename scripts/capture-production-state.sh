#!/usr/bin/env bash
#
# Capture the state of the WEST production host into one portable artifact.
#
# Run this ONCE on the production box. It is strictly read-only: it starts,
# stops and restarts nothing, writes only inside its own output directory, and
# never records a secret VALUE — only variable names.
#
#   curl -fsSL <raw-url>/scripts/capture-production-state.sh -o capture.sh
#   bash capture.sh
#
# or, from a checkout on the box:
#
#   bash scripts/capture-production-state.sh
#
# Produces ./production-reconciliation/ and a matching .tar.gz:
#
#   state.json          host, time, docker, git, deployment mechanism
#   file-manifest.txt   md5 of every source file in the build tree
#   source/             the build tree's source files (secrets excluded)
#   services.txt        docker, systemd, pm2, cron, nginx
#   secret-names.txt    env + AWS Secrets Manager variable NAMES only
#   nginx.txt           resolved nginx configuration
#
# Copy the tarball back, drop it in the repo root, and run:
#   node scripts/reconcile-production.js ./production-reconciliation
#
set -uo pipefail

BUILD_DIR="${BUILD_DIR:-/home/ubuntu/build}"
CONTAINER="${CONTAINER:-poolrentalnearme-production}"
OUT="${OUT:-./production-reconciliation}"

# Never capture these, whatever else matches.
SECRET_GLOBS=( ".env" ".env.*" "*.pem" "*.key" "*.p12" "*.pfx" "credentials.json" "id_rsa*" "*.jks" )

say() { printf '  %s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

rm -rf "$OUT"
mkdir -p "$OUT/source"
echo "Capturing production state -> $OUT"

# ------------------------------------------------------------------ services
{
  echo "=== docker ps ==="
  docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null
  echo
  echo "=== docker ps -a (includes rollback containers) ==="
  docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}' 2>/dev/null
  echo
  echo "=== docker images (recent) ==="
  docker images --format '{{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.CreatedSince}}\t{{.Size}}' 2>/dev/null | head -25
  echo
  echo "=== systemd running services ==="
  systemctl list-units --type=service --state=running --no-pager --no-legend 2>/dev/null | head -40
  echo
  echo "=== pm2 (as ubuntu) ==="
  sudo -u ubuntu PM2_HOME=/home/ubuntu/.pm2 pm2 list --no-color 2>/dev/null | head -30
  echo
  echo "=== crontab: root ==="
  crontab -l 2>/dev/null
  echo
  echo "=== crontab: ubuntu ==="
  sudo -u ubuntu crontab -l 2>/dev/null
  echo
  echo "=== listening sockets ==="
  (ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null) | head -30
} > "$OUT/services.txt" 2>&1
say "services.txt"

# --------------------------------------------------------------------- nginx
{
  echo "=== nginx -T (directives only; no cert bodies) ==="
  nginx -T 2>/dev/null | grep -vE '^\s*(ssl_certificate|ssl_certificate_key|ssl_trusted)' \
    | grep -E 'server_name|listen|location|proxy_pass|root|alias|return|rewrite|include|add_header|map ' \
    | head -300
  echo
  echo "=== sites-enabled ==="
  ls -la /etc/nginx/sites-enabled/ 2>/dev/null
  echo
  echo "=== snippets ==="
  ls -la /etc/nginx/snippets/ 2>/dev/null
} > "$OUT/nginx.txt" 2>&1
say "nginx.txt"

# -------------------------------------------------------------- secret NAMES
{
  echo "# Variable NAMES only. No values are recorded by this script."
  echo
  echo "=== container environment (names) ==="
  docker inspect "$CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
    | sed '/^$/d' | cut -d= -f1 | sort -u
  echo
  echo "=== build-tree .env (names) ==="
  if [ -f "$BUILD_DIR/.env" ]; then
    grep -oE '^[A-Za-z_][A-Za-z0-9_]*' "$BUILD_DIR/.env" 2>/dev/null | sort -u
  else
    echo "(no $BUILD_DIR/.env)"
  fi
  echo
  echo "=== AWS Secrets Manager (names) ==="
  if have aws && [ -n "${AWS_JH_ENV_SECRET_NAME:-}" ]; then
    aws secretsmanager describe-secret --secret-id "$AWS_JH_ENV_SECRET_NAME" \
      --region "${AWS_ENV_USER_REGION:-ap-southeast-1}" \
      --query '{name:Name,lastChanged:LastChangedDate}' --output json 2>/dev/null
    aws secretsmanager get-secret-value --secret-id "$AWS_JH_ENV_SECRET_NAME" \
      --region "${AWS_ENV_USER_REGION:-ap-southeast-1}" \
      --query SecretString --output text 2>/dev/null \
      | (have jq && jq -r 'keys[]' 2>/dev/null || echo "(jq unavailable — names not extracted)")
  else
    echo "(aws CLI unavailable or AWS_JH_ENV_SECRET_NAME unset)"
  fi
} > "$OUT/secret-names.txt" 2>&1
# Belt and braces: if anything that looks like a live credential slipped in, strip it.
sed -i -E 's/(sk|rk|pk)_(live|test)_[A-Za-z0-9]+/\1_\2_REDACTED/g; s/AC[0-9a-f]{32}/AC_REDACTED/g; s/eyJ[A-Za-z0-9_-]{20,}/JWT_REDACTED/g' "$OUT/secret-names.txt" 2>/dev/null
say "secret-names.txt"

# ------------------------------------------------------- source + manifest
FIND_PRUNE=( -name node_modules -o -name .git -o -name dist -o -name build -o -name coverage -o -name .cache )
EXCL=()
for g in "${SECRET_GLOBS[@]}"; do EXCL+=( ! -name "$g" ); done

if [ -d "$BUILD_DIR" ]; then
  ( cd "$BUILD_DIR" && find . \( "${FIND_PRUNE[@]}" \) -prune -o -type f "${EXCL[@]}" -print0 \
      | xargs -0 md5sum 2>/dev/null | sort -k2 ) > "$OUT/file-manifest.txt"
  say "file-manifest.txt ($(wc -l < "$OUT/file-manifest.txt") files)"

  # Copy the source itself so the diff can be computed off-box. Text files only,
  # under 1MB, with the secret globs excluded above.
  ( cd "$BUILD_DIR" && find . \( "${FIND_PRUNE[@]}" \) -prune -o -type f "${EXCL[@]}" -size -1M -print0 \
      | while IFS= read -r -d '' f; do
          case "$f" in
            *.js|*.jsx|*.mjs|*.cjs|*.ts|*.tsx|*.json|*.md|*.yml|*.yaml|*.sh|*.css|*.html|*.edn|*.py|*.txt|*.conf|Dockerfile*)
              mkdir -p "$OLDPWD/$OUT/source/$(dirname "$f")" 2>/dev/null
              cp -p "$f" "$OLDPWD/$OUT/source/$f" 2>/dev/null ;;
          esac
        done )
  say "source/ ($(find "$OUT/source" -type f 2>/dev/null | wc -l) files)"
else
  echo "(build dir $BUILD_DIR not found)" > "$OUT/file-manifest.txt"
  say "WARNING: $BUILD_DIR does not exist"
fi

# ---------------------------------------------------------------- state.json
GIT_SHA=$( (cd "$BUILD_DIR" 2>/dev/null && git rev-parse HEAD 2>/dev/null) || echo "" )
GIT_BRANCH=$( (cd "$BUILD_DIR" 2>/dev/null && git rev-parse --abbrev-ref HEAD 2>/dev/null) || echo "" )
GIT_DIRTY=$( (cd "$BUILD_DIR" 2>/dev/null && git status --porcelain 2>/dev/null | wc -l) || echo "" )
IMAGE=$(docker inspect "$CONTAINER" --format '{{.Config.Image}}' 2>/dev/null || echo "")
STARTED=$(docker inspect "$CONTAINER" --format '{{.State.StartedAt}}' 2>/dev/null || echo "")
ENVCOUNT=$(docker inspect "$CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | sed '/^$/d' | wc -l)

cat > "$OUT/state.json" <<JSON
{
  "captured_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "hostname": "$(hostname)",
  "kernel": "$(uname -r)",
  "build_dir": "$BUILD_DIR",
  "build_dir_exists": $( [ -d "$BUILD_DIR" ] && echo true || echo false ),
  "build_dir_is_git_checkout": $( [ -d "$BUILD_DIR/.git" ] && echo true || echo false ),
  "git_sha": "$GIT_SHA",
  "git_branch": "$GIT_BRANCH",
  "git_uncommitted_files": "$GIT_DIRTY",
  "container": "$CONTAINER",
  "container_image": "$IMAGE",
  "container_started_at": "$STARTED",
  "container_env_var_count": $ENVCOUNT,
  "deployment_mechanism": "docker image from ECR, deployed over SSH by scripts/deploy.sh; runtime .env baked into the image by the Dockerfile",
  "process_manager": "docker (marketplace) / pm2 as ubuntu (marketing, EAST only)",
  "capture_script_version": "1"
}
JSON
say "state.json"

TARBALL="production-reconciliation-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
tar czf "$TARBALL" "$OUT" 2>/dev/null
echo
echo "Done."
echo "  artifact : $TARBALL"
echo "  contains : no secret values, names only"
echo
echo "Next: copy that file to the repo root, extract it, and run"
echo "  node scripts/reconcile-production.js ./production-reconciliation"
