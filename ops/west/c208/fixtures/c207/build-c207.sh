#!/bin/sh
LOG=/home/ubuntu/build-c207.log; exec >"$LOG" 2>&1
rm -f /home/ubuntu/build-c207.done
cd /home/ubuntu/build || exit 1
echo "=== c207 build $(date -u) === (memory-capped: 2026-10-04 OOM took MAIN down)"
docker stop poolrentalnearme-production-rollback 2>/dev/null || true
free -m
DOCKER_BUILDKIT=0 docker build --memory=2500m --memory-swap=2500m --build-arg VITE_SHARETRIBE_USING_SSL=true --target build -t c207-no-intercom-buildstage . || { echo BUILD-STAGE-FAIL; echo FAIL > /home/ubuntu/build-c207.done; exit 1; }
echo "--- tests in build stage ---"
docker run --rm --memory=1200m --memory-swap=1200m c207-no-intercom-buildstage bun test src/templates/templatePrivacy.test.js src/util/accountLinks.test.js server/api-util/payoutStatus.test.js server/api-util/conversationSeen.test.js server/api-util/ical-build.test.js server/api-util/ssrStatus.test.js server/api-util/listingSlug.test.js server/api-util/calendarExceptions.test.js server/api-util/durationTiers.test.js server/api/health-booking.test.js || { echo TEST-FAIL; echo FAIL > /home/ubuntu/build-c207.done; exit 1; }
DOCKER_BUILDKIT=0 docker build --memory=2500m --memory-swap=2500m --build-arg VITE_SHARETRIBE_USING_SSL=true -t c207-no-intercom:latest . || { echo FINAL-FAIL; echo FAIL > /home/ubuntu/build-c207.done; exit 1; }
docker image inspect c207-no-intercom:latest --format '{{.Id}} {{.Created}}'
echo OK > /home/ubuntu/build-c207.done
