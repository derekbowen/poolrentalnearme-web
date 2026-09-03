#!/usr/bin/env bash
#
# Gated release flip for the WEST marketplace container.
#
# This exists because the flip procedure has, until now, lived only in whatever
# scratch directory the current session happened to have. Containers get
# recycled; the procedure got rebuilt from memory each time. It belongs in the
# repository.
#
# The ritual (CLAUDE.md): patch the build tree -> build image cNNN-name -> run
# the new image on :4000 and re-verify every prior release's markers -> only
# then move production. An abort leaves production untouched.
#
# Usage, on the WEST box:
#   scripts/flip-release.sh gate  c196-canonical-404
#   scripts/flip-release.sh flip  c196-canonical-404
#   scripts/flip-release.sh rollback
#
# 'gate' is safe to run any time: it starts a parallel container on :4000 and
# touches nothing that serves traffic.
set -euo pipefail

CONTAINER=poolrentalnearme-production
GATE=release-gate
GATE_PORT=4000
ENVFILE=/tmp/release-flip.env

usage() { sed -n '2,22p' "$0"; exit 1; }
[ $# -ge 1 ] || usage
ACTION=$1
IMAGE=${2:-}

# Carry the exact environment production is running with. The image is a build
# artifact; secrets arrive as environment at run time and are never baked in.
capture_env() {
  docker inspect "$CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | sed '/^$/d' > "$ENVFILE"
  echo "  carried $(wc -l < "$ENVFILE") environment variables (names not shown)"
}

wait_healthy() {
  local url=$1 tries=${2:-30}
  for _ in $(seq 1 "$tries"); do
    if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$url")" = "200" ]; then
      return 0
    fi
    sleep 3
  done
  return 1
}

case "$ACTION" in
gate)
  [ -n "$IMAGE" ] || usage
  docker rm -f "$GATE" >/dev/null 2>&1 || true
  capture_env
  docker run -d --name "$GATE" --env-file "$ENVFILE" \
    -p "127.0.0.1:${GATE_PORT}:3000" "${IMAGE}:latest" >/dev/null
  echo "  gate started on :${GATE_PORT}"
  wait_healthy "http://127.0.0.1:${GATE_PORT}/" || { echo "  GATE UNHEALTHY"; exit 1; }

  echo
  echo "=== route parity (3000 = live, ${GATE_PORT} = candidate) ==="
  for p in / /s /l/new /signup /listings /account/payments /terms-of-service /privacy-policy; do
    a=$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 "http://127.0.0.1:3000$p")
    b=$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 "http://127.0.0.1:${GATE_PORT}$p")
    flag=""; [ "$a" != "$b" ] && flag="   <-- DIFFERS"
    printf "  %-22s live=%s candidate=%s%s\n" "$p" "$a" "$b" "$flag"
  done

  echo
  echo "=== payment + privileged endpoints must answer, never 5xx ==="
  for p in /api/transaction-line-items /api/initiate-privileged; do
    printf "  %-32s %s\n" "$p" \
      "$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 -X POST \
         -H 'content-type: application/json' -d '{}' "http://127.0.0.1:${GATE_PORT}$p")"
  done

  echo
  echo "  Review the table above. Nothing has changed for users."
  echo "  To promote:  $0 flip $IMAGE"
  ;;

flip)
  [ -n "$IMAGE" ] || usage
  docker image inspect "${IMAGE}:latest" >/dev/null 2>&1 || {
    echo "  image ${IMAGE}:latest not found"; exit 1; }
  capture_env

  docker rm -f "${CONTAINER}-rollback" >/dev/null 2>&1 || true
  docker stop "$CONTAINER" >/dev/null
  docker rename "$CONTAINER" "${CONTAINER}-rollback"
  echo "  previous release retained as ${CONTAINER}-rollback"

  docker run -d --name "$CONTAINER" --restart unless-stopped \
    --env-file "$ENVFILE" -p 127.0.0.1:3000:3000 "${IMAGE}:latest" >/dev/null

  if wait_healthy "http://127.0.0.1:3000/"; then
    echo "  ${IMAGE} is live and healthy"

    # Health is not proof of configuration: the app serves 200s perfectly well
    # with every integration silently disabled. Ask the container itself, using
    # the module the server runs at boot. Names only, no values.
    missing=$(docker exec "$CONTAINER" bun -e '
      import("./server/startupEnvCheck.js")
        .then(m => { console.log(m.missingRequired().map(x => x.name).join(",")); process.exit(0); })
        .catch(e => { console.log("CHECK_FAILED:" + e.message); process.exit(0); })
    ' 2>/dev/null | tr -d '\r')
    case "$missing" in
      CHECK_FAILED:*) echo "  WARNING: in-container config check did not run (${missing#CHECK_FAILED:})" ;;
      "")             echo "  runtime configuration verified inside the container" ;;
      *)
        echo "  ROLLING BACK: container started without production-critical config: $missing"
        docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
        docker rename "${CONTAINER}-rollback" "$CONTAINER"
        docker start "$CONTAINER" >/dev/null
        wait_healthy "http://127.0.0.1:3000/" && echo "  rolled back, production healthy"
        exit 1
        ;;
    esac

    docker rm -f "$GATE" >/dev/null 2>&1 || true
  else
    echo "  NOT HEALTHY — rolling back automatically"
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
    docker rename "${CONTAINER}-rollback" "$CONTAINER"
    docker start "$CONTAINER" >/dev/null
    wait_healthy "http://127.0.0.1:3000/" && echo "  rolled back, production healthy" \
                                          || echo "  ROLLBACK ALSO UNHEALTHY — page a human"
    exit 1
  fi
  ;;

rollback)
  docker inspect "${CONTAINER}-rollback" >/dev/null 2>&1 || {
    echo "  no ${CONTAINER}-rollback container to restore"; exit 1; }
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker rename "${CONTAINER}-rollback" "$CONTAINER"
  docker start "$CONTAINER" >/dev/null
  wait_healthy "http://127.0.0.1:3000/" && echo "  rolled back, production healthy" \
                                        || { echo "  UNHEALTHY after rollback"; exit 1; }
  ;;

*) usage ;;
esac
