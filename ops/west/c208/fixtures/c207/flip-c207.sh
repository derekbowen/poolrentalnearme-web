#!/bin/sh
LOG=/home/ubuntu/flip-c207.log; exec >"$LOG" 2>&1
rm -f /home/ubuntu/flip-c207.done
NEW=c207-no-intercom:latest; OLD=c206-ceo-cal-health:latest; ENVF=/home/ubuntu/prod-clone-c207.env
FB=poolrentalnearme-production-c207gate; MAIN=poolrentalnearme-production
RB=poolrentalnearme-production-rollback
abort(){ echo "!!! ABORT: $1"; echo ABORTED > /home/ubuntu/flip-c207.done; exit 1; }
echo "=== c207 FLIP $(date -u) ==="
[ -f "$ENVF" ] || abort "env clone missing"
docker ps --format '{{.Names}}' | grep -q "^$FB$" || abort "gate container gone"
echo "before: $(docker ps --format '{{.Names}} {{.Image}} {{.Ports}}' | grep poolrental)"
echo "nginx before: $(grep -o '127.0.0.1:[0-9]*' /etc/nginx/conf.d/main-web.conf) pid $(cat /run/nginx.pid)"

echo "--- step 0: gate must have PASSED and env preflight must pass, before nginx is touched ---"
[ "$(cat /home/ubuntu/gate-$(basename "$0" .sh | sed 's/^flip-//').done 2>/dev/null)" = "OK" ] || abort "gate did not pass"
python3 /home/ubuntu/env_preflight.py --main-container "$MAIN" --candidate-container "$FB" || abort "env preflight failed"
echo "--- step 1: move traffic to the gated c207 on :3000 (reload, never restart) ---"
sudo cp /home/ubuntu/main-web.conf /etc/nginx/conf.d/main-web.conf && sudo nginx -t >/dev/null 2>&1 && sudo systemctl reload nginx || abort "nginx -> 3000"
sleep 3
for u in /login /s /terms-of-service; do c=$(curl -s -o /dev/null -w '%{http_code}' "https://www.poolrentalnearme.com$u"); echo "  live $u -> $c"; [ "$c" = 200 ] || abort "live $u after step 1"; done

echo "--- step 2: replace MAIN on :4000 with c207 (keeps the name the crons exec into) ---"
docker rm -f "$MAIN" || abort "rm MAIN"
docker run --name="$MAIN" --env-file "$ENVF" --restart unless-stopped -d -p 127.0.0.1:4000:3000 "$NEW" || abort "MAIN run"
ok=0; for i in $(seq 1 40); do c=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4000/ 2>/dev/null); [ "$c" = 200 ] && { ok=1; echo "  MAIN healthy try$i"; break; }; sleep 2; done
[ "$ok" = 1 ] || abort "MAIN unhealthy"

echo "--- step 3: move traffic back to :4000 ---"
sudo cp /home/ubuntu/fallback-web.conf /etc/nginx/conf.d/main-web.conf && sudo nginx -t >/dev/null 2>&1 && sudo systemctl reload nginx || abort "nginx -> 4000"
sleep 3
for u in /login /s /terms-of-service; do c=$(curl -s -o /dev/null -w '%{http_code}' "https://www.poolrentalnearme.com$u"); echo "  live $u -> $c"; [ "$c" = 200 ] || abort "live $u after step 3"; done
LI=$(curl -s -o /dev/null -w '%{http_code}' -X POST https://www.poolrentalnearme.com/api/sms/inbound -d 'From=%2B15555550100&Body=test'); echo "  live unsigned inbound -> $LI (want 403)"; [ "$LI" = 403 ] || abort "inbound not fail-closed live"

echo "--- step 4: retire the gate, restore a rollback container on :3000 (previous image) ---"
docker rm -f "$FB" || abort "rm gate"
docker rm -f "$RB" 2>/dev/null||true
docker run --name="$RB" --env-file "$ENVF" --restart unless-stopped -d -p 127.0.0.1:3000:3000 "$OLD" >/dev/null 2>&1 || echo "  (rollback container not started; image $OLD still available)"
shred -u "$ENVF" 2>/dev/null||rm -f "$ENVF"

echo "--- final state ---"
docker ps --format '{{.Names}} {{.Image}} {{.Ports}}' | grep poolrental
echo "nginx after: $(grep -o '127.0.0.1:[0-9]*' /etc/nginx/conf.d/main-web.conf) pid $(cat /run/nginx.pid)"
echo "=== c207 FLIP DONE $(date -u) ==="
echo OK > /home/ubuntu/flip-c207.done
