# c208 flip block: ops/west/c208/flip_c208_block.sh, put after the env preflight by scripts_c208.py
# (sha256-pinned there). Uses the flip's FB and redefines its abort(). scripts_c208.py also sets
# BACK=1 just before step 1 touches nginx and BACK=0 just before step 2 removes MAIN, so an abort
# (or a TERM/HUP/INT) in that window first returns traffic to the untouched MAIN on :4000.
NGX=/etc/nginx/conf.d/main-web.conf; BACK=0
back(){ [ "$BACK" = 1 ] || return 0; BACK=0; trap '' HUP INT TERM
  echo "  abort before step 2: returning traffic to MAIN on :4000 (fallback-web.conf)"
  if sudo cp /home/ubuntu/fallback-web.conf "$NGX" && sudo nginx -t >/dev/null 2>&1 && sudo systemctl reload nginx; then sleep 3
    echo "  nginx back on $(grep -o '127.0.0.1:[0-9]*' "$NGX"); live /login -> $(curl -s -o /dev/null --max-time 25 -w '%{http_code}' https://www.poolrentalnearme.com/login)"
  else echo "  !!! SWAP-BACK FAILED: live may still be on the gate (:3000). Run the README traffic rollback now."; fi; }
abort(){ echo "!!! ABORT: $1"; back; echo ABORTED > /home/ubuntu/flip-c208.done; exit 1; }
trap 'abort "flip stopped by a signal"' HUP INT TERM
echo "--- step 0b: nginx must be on fallback-web.conf (:4000), so an abort before step 2 can restore it exactly ---"
cmp -s /home/ubuntu/fallback-web.conf "$NGX" || abort "nginx is not on fallback-web.conf (:4000); production untouched"
grep -q '127.0.0.1:3000' /home/ubuntu/main-web.conf || abort "main-web.conf does not point at :3000"
docker update --restart unless-stopped "$FB" >/dev/null || abort "could not give the gate a restart policy"
echo "  gate $FB restarts after a reboot (it serves live traffic from step 1 to step 3)"
echo "--- step 0b: module entry the gated c208 serves; live /login must serve it after steps 1 and 3 ---"
IX(){ curl -s --max-time 25 "$1/login" | grep -oE 'src="/assets/index-[A-Za-z0-9_-]+\.js"' | head -1; }
IDX=$(IX http://127.0.0.1:3000); [ -n "$IDX" ] || abort "no module entry on the gated /login"
docker exec "$FB" sh -c "grep -rq 'prnm-chat-launcher' dist/client/assets/" || abort "gated image lacks the chat launcher"
echo "  gated /login entry: $IDX"
live_idx(){ for t in 1 2 3; do L=$(IX https://www.poolrentalnearme.com); echo "  live /login entry, try $t: ${L:-none}"
  [ "$L" = "$IDX" ] && return 0; [ "$t" = 3 ] || sleep 5; done; abort "live /login not served by c208 $1"; }
