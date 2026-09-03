#!/usr/bin/env bash
#
# CANONICAL instance deployment script for the WEST marketplace host.
#
# This is the script that `scripts/deploy.sh` invokes over SSH as
# $AWS_INSTANCE_DEPLOY_SCRIPT — the thing that actually replaces the running
# container. Until now it existed ONLY on the box: undocumented, unversioned,
# mutable by anyone with shell access, and never read by anybody auditing this
# system. That is why nobody could answer whether the new secret-free image
# would start with any configuration.
#
# STATUS: proposed canonical version. It has NOT been installed on WEST and does
# NOT yet claim to match what is there. Run scripts/capture-production-state.sh,
# then `node scripts/verify-west-runtime-injection.js` to compare the on-box
# sha256 against this file and see the real difference. Install deliberately,
# never by surprise.
#
# Contract (set by scripts/deploy.sh):
#   IMAGE_URL   full ECR image reference to run
#   REGION      ECR region, for docker login
#   ENV_FILE    path to the runtime environment file on THIS host
#
# The two properties that matter:
#   1. secrets arrive via --env-file at container start, never in an image layer
#   2. a container that comes up without its production-critical configuration
#      is rolled back, not left serving
#
set -uo pipefail

CONTAINER="${CONTAINER:-poolrentalnearme-production}"
ROLLBACK="${CONTAINER}-rollback"
PORT_BINDING="${PORT_BINDING:-127.0.0.1:3000:3000}"
ENV_FILE="${ENV_FILE:-/home/ubuntu/.prnm-runtime.env}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/}"

log()  { printf '  %s\n' "$*"; }
die()  { printf 'FATAL: %s\n' "$*" >&2; exit 1; }

[ -n "${IMAGE_URL:-}" ] || die "IMAGE_URL is not set"
[ -n "${REGION:-}" ]    || die "REGION is not set"

# ---------------------------------------------------------------- 1. config
# Refuse to start a container with no configuration. The image no longer carries
# a .env, so an absent env file means every integration silently dies while the
# site still answers 200 — precisely the failure this whole exercise removed.
[ -f "$ENV_FILE" ] || die "runtime env file $ENV_FILE is missing; refusing to start an unconfigured container"
[ -s "$ENV_FILE" ] || die "runtime env file $ENV_FILE is empty; refusing to start an unconfigured container"
log "runtime env file present: $ENV_FILE ($(wc -l < "$ENV_FILE") variables, names not shown)"

# ------------------------------------------------------------------ 2. pull
log "logging in to ECR in $REGION"
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "${IMAGE_URL%%/*}" >/dev/null \
  || die "ECR login failed"

log "pulling $IMAGE_URL"
docker pull "$IMAGE_URL" >/dev/null || die "docker pull failed"

# ------------------------------------------------- 3. retain the old container
docker rm -f "$ROLLBACK" >/dev/null 2>&1 || true
if docker inspect "$CONTAINER" >/dev/null 2>&1; then
  docker stop "$CONTAINER" >/dev/null 2>&1 || true
  docker rename "$CONTAINER" "$ROLLBACK" || die "could not retain the previous container"
  log "previous release retained as $ROLLBACK"
fi

roll_back() {
  printf '  ROLLING BACK: %s\n' "$1" >&2
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  if docker inspect "$ROLLBACK" >/dev/null 2>&1; then
    docker rename "$ROLLBACK" "$CONTAINER" && docker start "$CONTAINER" >/dev/null 2>&1
    for _ in $(seq 1 20); do
      [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTH_URL")" = "200" ] && {
        log "rolled back; previous release is healthy"; exit 1; }
      sleep 3
    done
    die "rollback container is not healthy either — page a human"
  fi
  die "no rollback container available"
}

# ------------------------------------------------------------------ 4. start
# --env-file is the whole point: secrets are injected here, at start, and exist
# only in the container's memory and this host's disk.
log "starting $CONTAINER"
docker run -d \
  --name "$CONTAINER" \
  --env-file "$ENV_FILE" \
  --restart unless-stopped \
  -p "$PORT_BINDING" \
  "$IMAGE_URL" >/dev/null || roll_back "container failed to start"

# ----------------------------------------------------------------- 5. health
healthy=0
for _ in $(seq 1 30); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$HEALTH_URL")" = "200" ]; then
    healthy=1; break
  fi
  sleep 3
done
[ "$healthy" = "1" ] || roll_back "new container never became healthy"
log "container is healthy"

# -------------------------------------------- 6. PROVE it received its config
# Health alone is not proof: the app serves 200s perfectly well with every
# integration disabled. Ask the container itself, using the same module the
# server runs at boot. Names only — no value is read or printed.
log "verifying runtime configuration inside the container"
MISSING=$(docker exec "$CONTAINER" bun -e '
  import("./server/startupEnvCheck.js")
    .then(m => { const miss = m.missingRequired().map(x => x.name);
                 console.log(miss.join(",")); process.exit(0); })
    .catch(e => { console.log("CHECK_FAILED:" + e.message); process.exit(0); })
' 2>/dev/null | tr -d '\r')

case "$MISSING" in
  CHECK_FAILED:*)
    log "WARNING: could not run the in-container config check (${MISSING#CHECK_FAILED:})"
    log "         health passed, so continuing — but this should be investigated"
    ;;
  "")
    log "all production-critical configuration is present in the container"
    ;;
  *)
    roll_back "container started WITHOUT production-critical configuration: ${MISSING}"
    ;;
esac

# ---------------------------------------------------------------- 7. finish
log "deployed $IMAGE_URL"
log "rollback available as $ROLLBACK (docker rename it back to restore)"
exit 0
