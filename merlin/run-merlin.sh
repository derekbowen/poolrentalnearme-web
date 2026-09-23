#!/bin/sh
# Recreate the merlin (host wizard) container. `docker restart` does NOT re-read
# --env-file, so any merlin.env change requires this script, not a restart.
set -e
docker rm -f merlin 2>/dev/null || true
docker run -d --name merlin --restart unless-stopped \
  --env-file /home/ubuntu/merlin/merlin.env \
  -v /home/ubuntu/merlin:/app -w /app \
  -p 127.0.0.1:3099:3099 \
  node:20-alpine node server/index.js
