#!/bin/bash
# Weekly host stats + post-your-link nudge. Thursdays (cron: 0 20 * * 4).
# Kill switch: touch /home/ubuntu/switchy/WEEKLY_STOP
#
# c195 (2026-09-02): weekly_stats.js now reads /go/ share-link clicks from
# Supabase (the same numbers the host dashboard shows) and builds the host list
# from published listings. No Switchy key, host_links.json or click_history are
# copied in any more.
set -e
C=poolrentalnearme-production
[ -f /home/ubuntu/switchy/WEEKLY_STOP ] && { echo "$(date -u) WEEKLY_STOP present"; exit 0; }
[ -f /home/ubuntu/switchy/STOP ] && { echo "$(date -u) switchy STOP present"; exit 0; }
docker cp /home/ubuntu/smsctl/host_suppress.json $C:/tmp/host_suppress.json >/dev/null 2>&1 || true
docker cp /home/ubuntu/switchy/weekly_stats.js   $C:/tmp/weekly_stats.js >/dev/null
docker exec -e WEEKLY_DRY="${WEEKLY_DRY:-0}" -w /home/bun/app $C bun /tmp/weekly_stats.js
