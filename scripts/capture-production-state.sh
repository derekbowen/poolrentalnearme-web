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

# ------------------------------------------- the on-box deploy script
#
# THE question this capture exists to answer: does the script that actually runs
# `docker run` pass --env-file? scripts/deploy.sh now delivers the runtime env to
# this host and exports ENV_FILE, but the on-box script lives outside the
# repository and has never been read. If it ignores ENV_FILE, a secret-free image
# starts with no configuration at all.
DEPLOY_CANDIDATES=(
  "${AWS_INSTANCE_DEPLOY_SCRIPT:-}"
  "/home/ubuntu/deploy.sh"
  "/home/ubuntu/scripts/deploy.sh"
  "/home/ubuntu/build/deploy.sh"
  "/opt/prnm/deploy.sh"
  "/usr/local/bin/prnm-deploy.sh"
)
DEPLOY_PATH=""
for c in "${DEPLOY_CANDIDATES[@]}"; do
  [ -z "$c" ] && continue
  # AWS_INSTANCE_DEPLOY_SCRIPT is often relative, e.g. ./deploy.sh
  case "$c" in
    ./*) cand="/home/ubuntu/${c#./}" ;;
    *)   cand="$c" ;;
  esac
  if [ -f "$cand" ]; then DEPLOY_PATH="$cand"; break; fi
done

# Redact anything credential-shaped before the content is written anywhere.
redact() {
  sed -E 's/(sk|rk|pk)_(live|test)_[A-Za-z0-9]+/\1_\2_REDACTED/g;
          s/AC[0-9a-f]{32}/AC_REDACTED/g;
          s/SK[0-9a-f]{32}/SK_REDACTED/g;
          s/eyJ[A-Za-z0-9_-]{20,}/JWT_REDACTED/g;
          s/AKIA[0-9A-Z]{16}/AKIA_REDACTED/g;
          s/(PASSWORD|SECRET|TOKEN|KEY)=[^ ]+/\1=REDACTED/g'
}

jbool() { [ "$1" = "1" ] && echo true || echo false; }

if [ -n "$DEPLOY_PATH" ]; then
  cp "$DEPLOY_PATH" "$OUT/west-deploy-script.raw" 2>/dev/null
  redact < "$DEPLOY_PATH" > "$OUT/west-deploy-script.sh" 2>/dev/null
  rm -f "$OUT/west-deploy-script.raw"
  D_EXISTS=1
  D_SHA=$( (sha256sum "$DEPLOY_PATH" 2>/dev/null || shasum -a 256 "$DEPLOY_PATH" 2>/dev/null) | awk '{print $1}' )
  D_PERMS=$(stat -c '%a %U:%G' "$DEPLOY_PATH" 2>/dev/null || stat -f '%Lp %Su:%Sg' "$DEPLOY_PATH" 2>/dev/null)
  C=$(cat "$OUT/west-deploy-script.sh")
  echo "$C" | grep -qE 'docker[[:space:]]+run'                 && D_RUN=1     || D_RUN=0
  echo "$C" | grep -qE 'docker[- ]compose'                     && D_COMPOSE=1 || D_COMPOSE=0
  echo "$C" | grep -qE '\-\-env-file'                          && D_ENVFLAG=1 || D_ENVFLAG=0
  echo "$C" | grep -qE 'ENV_FILE'                              && D_ENVVAR=1  || D_ENVVAR=0
  echo "$C" | grep -qE '(^|[^A-Za-z])(source|\.)[[:space:]]+[^ ]*\.env|--mount|-v[[:space:]]+[^ ]*\.env' && D_MOUNT=1 || D_MOUNT=0
  echo "$C" | grep -qE 'docker[[:space:]]+(start|restart)|systemctl[[:space:]]+(start|restart)' && D_RESTART=1 || D_RESTART=0
  # Injection is only proven when a docker invocation carries --env-file.
  if [ "$D_RUN" = "1" ] && [ "$D_ENVFLAG" = "1" ]; then D_VERIFIED=1; else D_VERIFIED=0; fi
  {
    echo "=== resolved deploy script: $DEPLOY_PATH ==="
    echo "--- docker invocations ---"
    echo "$C" | grep -nE 'docker[[:space:]]+(run|start|restart|compose)|docker[- ]compose' || echo "(none)"
    echo "--- env-file / ENV_FILE references ---"
    echo "$C" | grep -nE '\-\-env-file|ENV_FILE|\.env' || echo "(none)"
  } > "$OUT/deploy-script-findings.txt"
else
  D_EXISTS=0; D_SHA=""; D_PERMS=""; D_RUN=0; D_COMPOSE=0; D_ENVFLAG=0; D_ENVVAR=0
  D_MOUNT=0; D_RESTART=0; D_VERIFIED=0
  echo "(no on-box deploy script found in any known location)" > "$OUT/deploy-script-findings.txt"
fi

cat > "$OUT/deploy-script-analysis.json" <<JSON
{
  "deploy_script_path": "${DEPLOY_PATH}",
  "searched": "$(printf '%s ' "${DEPLOY_CANDIDATES[@]}" | sed 's/ $//')",
  "exists": $(jbool "$D_EXISTS"),
  "permissions": "${D_PERMS}",
  "sha256": "${D_SHA}",
  "docker_run_detected": $(jbool "$D_RUN"),
  "docker_compose_detected": $(jbool "$D_COMPOSE"),
  "env_file_flag_detected": $(jbool "$D_ENVFLAG"),
  "env_file_variable": "ENV_FILE",
  "env_file_variable_referenced": $(jbool "$D_ENVVAR"),
  "dotenv_mounted_or_sourced": $(jbool "$D_MOUNT"),
  "restart_mechanism_detected": $(jbool "$D_RESTART"),
  "runtime_env_injection_verified": $(jbool "$D_VERIFIED"),
  "content_file": "west-deploy-script.sh",
  "content_redacted": true
}
JSON
say "deploy-script-analysis.json (injection verified: $( [ "$D_VERIFIED" = "1" ] && echo YES || echo NO ))"

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
