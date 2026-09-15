#!/usr/bin/env bash
# WEST production smoke test — runs every 10 min from ubuntu's crontab via nginx-smoke-alert.py.
# Live copy: /home/ubuntu/nginx-smoke-test.sh. Mirror edits here (ops/monitors/west/) and vice versa.
#
# v2 2026-09-15. Every failure is tagged with a CLASS so the alert says what actually broke:
#   ROUTING  = a path reached the wrong backend (marketplace vs fresh-web swallow)
#   API      = a marketplace API path answered with HTML or a bad status instead of JSON
#   FRONTEND = /s did not return the marketplace app HTML
#   ASSET    = /s HTML has no css/js link, or a referenced asset is not 200 with the right type
#   BACKEND  = an upstream returned 5xx / 000
#   TIMEOUT  = no response within 15s (retried once for /s before failing)
#   LATENCY  = /s answered but first byte took longer than SLOW_S
# v1 (2026-06-20..2026-09-15) reported every failure under a fixed "social/booking endpoint down"
# subject; the 2026-09-15T18:00Z alert was a single 15s /s stall, not routing.
set -u -o pipefail
BASE="${BASE:-https://www.poolrentalnearme.com}"
Q="baseUrl=https%3A%2F%2Fwww.poolrentalnearme.com&defaultReturn=%2F"
SLOW_S="${SLOW_S:-8}"
fail=0
F(){ echo "FAIL [$1] $2"; fail=1; }

# probe URL [curl args...] -> PE (curl exit) PC (http code) PT (ttfb s) PH (headers) PB (body)
probe(){ local u="$1"; shift
  PB=$(curl -sS -D /tmp/smoke_h.$$ --compressed --max-time 15 -w '\n__T=%{time_starttransfer} __C=%{http_code}' "$@" "$u" 2>/dev/null | tr -d '\0'); PE=$?
  PH=$(cat /tmp/smoke_h.$$ 2>/dev/null); rm -f /tmp/smoke_h.$$
  PT=$(sed -n 's/.*__T=\([0-9.]*\).*/\1/p' <<<"${PB##*$'\n'}"); PC=$(sed -n 's/.*__C=\([0-9]*\).*/\1/p' <<<"${PB##*$'\n'}")
  PB=${PB%$'\n'__T=*}; PT=${PT:-0}; PC=${PC:-000}; }
net_fail(){ # $1 path -> returns 0 (and records FAIL) when the probe itself failed
  [ "$PE" = 28 ] && { F TIMEOUT "$1 no response in 15s"; return 0; }
  [ "$PE" != 0 ] && { F BACKEND "$1 curl exit $PE (HTTP $PC)"; return 0; }
  case "$PC" in 5*|000) F BACKEND "$1 HTTP $PC"; return 0;; esac; return 1; }
is_fw(){ grep -qi lovable <<<"$PH"; }   # fresh-web (EAST) stamps its responses; marketplace does not
assert_marketplace(){ probe "$BASE$1"; net_fail "$1" && return; is_fw && F ROUTING "$1 served by fresh-web (want marketplace)"; }
assert_freshweb(){ probe "$BASE$1"; net_fail "$1" && return; is_fw || F ROUTING "$1 NOT fresh-web (carve-out broke)"; }
assert_ct(){ probe "$BASE$1"; net_fail "$1" && return; grep -i '^content-type:' <<<"$PH" | grep -qi "$2" || F FRONTEND "$1 content-type not '$2'"; }

# 1) social login: each provider must 302 to its OAuth screen (marketplace passport routes)
for p in google apple facebook; do
  probe "$BASE/api/socials-sign-in/auth/$p?$Q"; net_fail "social/$p" && continue
  [ "$PC" = 302 ] || { is_fw && F ROUTING "social/$p served by fresh-web" || F API "social/$p HTTP $PC (want 302)"; }
done
# 2) marketplace API (booking/auth) GET: must NOT be served by fresh-web
for p in /api/transaction-line-items /api/initiate-privileged /api/transition-privileged /api/auth/create-user-with-idp /api/auth/google; do
  assert_marketplace "$p"
done
# 2b) booking API POST with an empty body: the marketplace answers 400 application/json.
#     HTML here means a frontend fallback swallowed the route; creates nothing, charges nothing.
for p in /api/transaction-line-items /api/initiate-privileged /api/transition-privileged; do
  probe "$BASE$p" -X POST -H 'Content-Type: application/json' -d '{}'; net_fail "POST $p" && continue
  if grep -qi '^content-type: *application/json' <<<"$PH"; then
    [ "$PC" = 400 ] || [ "$PC" = 401 ] || F API "POST $p HTTP $PC json (want 400/401)"
  else is_fw && F ROUTING "POST $p swallowed by fresh-web (HTML)" || F API "POST $p HTTP $PC non-JSON"; fi
done
# 3) fresh-web /api carve-out: must STILL be fresh-web
assert_freshweb /api/public/hooks.seo-self-test
# 4) marketplace owns /account + host settings (incl. Stripe payout page)
for p in /account /account/payments /account/contact-details /account/payment-methods /account/change-password; do assert_marketplace "$p"; done
# 5) Academy stays fresh-web; 6) jobs sitemap is fresh-web XML
assert_freshweb /account/learning
assert_freshweb /jobs.xml
assert_ct /jobs.xml xml

# 7) /s: marketplace app HTML, current hashed css+js present and served 200 with the right type.
#    One retry on timeout so a single slow SSR render is reported as TIMEOUT, twice, not as a
#    missing stylesheet. (2026-07-03: lovable-primary 502'd all css/js -> site unstyled.)
probe "$BASE/s"; [ "$PE" = 28 ] && { sleep 3; probe "$BASE/s"; }
S_T=$PT
if ! net_fail "/s"; then
  grep -aq 'assets/index-' <<<"$PB" || F FRONTEND "/s did not return the marketplace app ($(head -c 80 <<<"$PB" | tr -d '\n'))"
  css=$(grep -a -oE '/assets/[A-Za-z0-9_.-]+\.css' <<<"$PB" | head -1)
  js=$(grep -a -oE '/assets/index-[A-Za-z0-9_-]+\.js' <<<"$PB" | head -1)
  [ -n "$css" ] || F ASSET "/s HTML has no css link"
  [ -n "$js" ] || F ASSET "/s HTML has no index js link"
  for a in $css $js; do
    probe "$BASE$a"; net_fail "$a" && continue
    case "$a" in *.css) want=text/css;; *) want=javascript;; esac
    { [ "$PC" = 200 ] && grep -i '^content-type:' <<<"$PH" | grep -qi "$want"; } || F ASSET "$a HTTP $PC (want 200 $want)"
  done
  awk -v t="$S_T" -v s="$SLOW_S" 'BEGIN{exit !(t+0>s+0)}' && F LATENCY "/s TTFB ${S_T}s (> ${SLOW_S}s)"
fi
# 8) public-pools directory (proxied :3100) must serve a real page
probe "$BASE/public-pools/pennsylvania/philadelphia/"
if ! net_fail "public-pools"; then
  { [ "$PC" = 200 ] && grep -aqi pool <<<"$PB"; } || F BACKEND "public-pools HTTP $PC without pool content"
fi

[ "$fail" -eq 0 ] && echo "PASS $(date -u +%FT%TZ) all critical + collision routes OK s_ttfb=${S_T}s"
exit $fail
