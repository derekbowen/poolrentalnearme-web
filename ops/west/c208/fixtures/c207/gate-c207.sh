#!/bin/sh
LOG=/home/ubuntu/gate-c207.log; exec >"$LOG" 2>&1
rm -f /home/ubuntu/gate-c207.done
NEW=c207-no-intercom:latest; ENVF=/home/ubuntu/prod-clone-c207.env
FB=poolrentalnearme-production-c207gate; MAIN=poolrentalnearme-production
# NOTE: ports are MIRRORED vs flip-c189. MAIN currently sits on :4000 with nginx
# pointing there, so the gate runs on :3000.
abort(){ echo "!!! ABORT: $1"; docker rm -f "$FB" 2>/dev/null; shred -u "$ENVF" 2>/dev/null||rm -f "$ENVF"; echo ABORTED > /home/ubuntu/gate-c207.done; exit 1; }
echo "=== c207 GATE $(date -u) ==="
docker image inspect "$NEW" >/dev/null 2>&1 || abort "image missing"
# env cloned from the RUNNING MAIN so the gate has byte-identical config
docker inspect "$MAIN" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E '.=' > "$ENVF" || abort "env clone"
grep -q '^STRIPE_SECRET_KEY=rk_live_' "$ENVF" || abort "stripe key missing"
grep -q '^VITE_SHARETRIBE_USING_SSL=true' "$ENVF" || abort "c158 env lost"
grep '^EMAILIT_API_KEY=.' /home/ubuntu/nginx-smoke.env | head -1 >> "$ENVF" || abort "emailit key source missing"
chmod 600 "$ENVF"
echo "env names cloned: $(cut -d= -f1 "$ENVF" | wc -l)"
docker rm -f "$FB" 2>/dev/null||true
# :3000 is held by the previous rollback container; MAIN on :4000 is untouched
docker rm -f poolrentalnearme-production-rollback 2>/dev/null||true
docker run --name="$FB" --env-file "$ENVF" -d -p 127.0.0.1:3000:3000 "$NEW" || abort "gate run"
ok=0; for i in $(seq 1 40); do c=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ 2>/dev/null); [ "$c" = "200" ] && { ok=1; echo " gate healthy try$i"; break; }; sleep 2; done
[ "$ok" = 1 ] || abort "gate unhealthy"
echo "--- env preflight: candidate env must match running MAIN (names only) ---"
python3 /home/ubuntu/env_preflight.py --main-container "$MAIN" --candidate-container "$FB" || abort "env preflight failed"

echo "--- c204 carried forward: one listing URL, /l/<title slug>/<id> ---"
SITE=https://www.poolrentalnearme.com
chk(){ r=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "http://127.0.0.1:3000$1"); echo "  $1 -> $r"
  st=${r%% *}; loc=${r#* }; [ "$st" = "$2" ] || abort "$1 status $st want $2"
  [ -z "$3" ] || [ "$loc" = "http://127.0.0.1:3000$3" ] || abort "$1 location '$loc' want $3"; }
meta(){ H=$(curl -s --max-time 25 "http://127.0.0.1:3000$1")
  C=$(printf '%s' "$H" | grep -oE 'rel="canonical" href="[^"]*"' | head -1 | sed 's/.*href="//;s/"$//')
  O=$(printf '%s' "$H" | grep -oE 'property="og:url" content="[^"]*"' | head -1 | sed 's/.*content="//;s/"$//')
  echo "  $1 canonical=$C og:url=$O"
  [ "$C" = "$SITE$2" ] || abort "canonical '$C' want $SITE$2"
  [ "$O" = "$SITE$2" ] || abort "og:url '$O' want $SITE$2"
  printf '%s' "$H" | grep -q "\"url\":\"$SITE$2\"" || abort "schema offer url != canonical on $1"; }
for row in "689d6690-2fad-40ab-bf82-f89b07771533 the-orange-grove-lagoon the-orange-grove-lagoon-689d6690" \
           "68352d4d-cdd0-4572-9a64-f84519c8916a jones-backyard-oasis jones-backyard-oasis-68352d4d" \
           "68432dcd-183e-4a7c-808c-d30e84706f25 kc-north-private-event-pool kc-north-private-event-pool-68432dcd"; do
  set -- $row; ID=$1; CAN="/l/$2/$1"; OLD="/l/$3/$1"
  chk "$CAN" 200 ""
  chk "/l/$ID" 301 "$CAN"
  chk "$OLD" 301 "$CAN"
  chk "$OLD?ref=host-share" 301 "$CAN?ref=host-share"
  chk "$CAN/" 301 "$CAN"
  meta "$CAN" "$CAN"
  meta "$CAN?ref=host-share&utm_source=fb" "$CAN"
  G=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "http://127.0.0.1:3000/go/$3"); echo "  /go/$3 -> $G"
  [ "$G" = "302 http://127.0.0.1:3000$CAN?ref=host-share" ] || abort "/go/ share link not one hop to canonical"
done
chk "/l/no-such-pool/00000000-0000-0000-0000-000000000000" 404 ""
V=$(curl -s -o /dev/null -w '%{redirect_url}' "http://127.0.0.1:3000/l/the-orange-grove-lagoon/689d6690-2fad-40ab-bf82-f89b07771533/draft"); echo "  draft variant -> '$V'"
[ "$V" = "http://127.0.0.1:3000/l/the-orange-grove-lagoon/689d6690-2fad-40ab-bf82-f89b07771533" ] && abort "owner draft variant redirected to public page"
SC=$(curl -s --max-time 25 "http://127.0.0.1:3000/s?address=Lancaster%2C%20PA&utm_source=x" | grep -oE 'rel="canonical" href="[^"]*"' | head -1); echo "  /s $SC"
printf '%s' "$SC" | grep -q 'address=' || abort "/s canonical lost its address"
printf '%s' "$SC" | grep -q 'utm_source' && abort "/s canonical kept a tracking param"

echo "--- c205 carried forward 1: calendar exceptions reconciled, server-owned tracking ---"
docker exec "$FB" sh -c "grep -q 'prnmCalendarExceptionIds' server/api-util/calendarExceptions.js" || abort "c206 reconcile module missing"
docker exec "$FB" sh -c "grep -q 'reconcileListing' server/api/calendar-apply-exceptions.js" || abort "c206 endpoint not using reconcile"
docker exec "$FB" sh -c "grep -rq 'Some blocked times didn' dist/client/assets/" || abort "c206 panel bundle missing"
CE=$(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:3000/api/calendar-apply-exceptions -H 'Content-Type: application/json' -d '{"listingId":"6a5db0ae-61bf-4e2d-abd6-42918180c738"}'); echo "  anon calendar-apply -> $CE"
[ "$CE" = 403 ] || [ "$CE" = 401 ] || abort "calendar-apply not owner-gated ($CE)"
docker cp /home/ubuntu/gate_c206_cal.js "$FB":/tmp/gate_c206_cal.js || abort "cp cal check"
CL=$(docker exec "$FB" bun /tmp/gate_c206_cal.js); echo "$CL"
printf '%s' "$CL" | grep -q '^CAL-OK' || abort "calendar plan check failed"
docker exec "$FB" sh -c "grep -q 'allowRawResponse: true }' server/api-util/calendarExceptions.js" || abort "c206 raw-response fix missing"
echo "--- c205 carried forward 2: duration tiers enforced server-side (real listings) ---"
docker cp /home/ubuntu/gate_c206_price.js "$FB":/tmp/gate_c206_price.js || abort "cp price check"
PR=$(docker exec "$FB" bun /tmp/gate_c206_price.js); echo "$PR"
printf '%s' "$PR" | grep -q '^PRICE-OK' || abort "tier pricing check failed"
echo "--- c206 THE FIX: CEO page + form, booking health, bounded calendar tracking ---"
docker exec "$FB" sh -c "grep -q 'PRIVATE_DATA_BUDGET' server/api-util/calendarExceptions.js" || abort "c206 bounded tracking missing"
docker exec "$FB" sh -c "grep -q 'a.end > nowMs' server/api-util/calendarExceptions.js" || abort "c206 ended-block guard missing"
docker exec "$FB" sh -c 'test -n "$EMAILIT_API_KEY"' || abort "EMAILIT_API_KEY not in candidate env"
echo "  EMAILIT_API_KEY present (name only)"
P=$(curl -s --max-time 25 http://127.0.0.1:3000/operating-ceo)
printf '%s' "$P" | grep -q 'Operating CEO for 2027' || abort "/operating-ceo did not render"
printf '%s' "$P" | grep -oiE '<meta[^>]*robots[^>]*>' | grep -qi noindex || abort "/operating-ceo is indexable"
echo "  /operating-ceo renders, noindex"
C=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:3000/api/ceo-application)
[ "$C" = 400 ] || abort "ceo-application empty submission -> $C (want 400)"
HP=$(curl -s -X POST -H 'Content-Type: application/json' -d '{"website2":"x"}' http://127.0.0.1:3000/api/ceo-application)
[ "$HP" = '{"ok":true}' ] || abort "ceo-application honeypot -> $HP"
echo "  ceo-application: empty -> 400, honeypot -> silent ok (nothing sent)"
HB=$(curl -s -w ' %{http_code}' http://127.0.0.1:3000/api/health/booking)
[ "$HB" = '{"ok":true} 200' ] || abort "health/booking -> $HB"
echo "  /api/health/booking -> $HB"
echo "--- c202 carried forward: Payment Methods tab on every account page ---"
docker exec "$FB" sh -c "grep -q 'paymentTabsFor' src/util/userHelpers.js" 2>/dev/null && echo "  userHelpers uses paymentTabsFor" || echo "  (src not in runtime image; covered by build-stage test accountLinks.test.js)"
for u in /account/contact-details /account/payment-methods /account/payouts /account/payments; do c=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:3000$u"); echo "  $u -> $c"; [ "$c" = 200 ] || [ "$c" = 302 ] || [ "$c" = 401 ] || abort "$u broke ($c)"; done

echo "--- c201 carried forward: payout warning only when Stripe reports missing info ---"
docker exec "$FB" sh -c "grep -q 'statusFields(account)' server/api/payouts.js" || abort "c201 payouts.js not tri-state"
docker exec "$FB" sh -c "grep -rq 'action_required' dist/client/assets/" || abort "c201 page not keyed on action_required"
ST=$(docker exec "$FB" bun -e "const {statusFields}=require('./server/api-util/payoutStatus');fetch('https://api.stripe.com/v1/accounts/acct_1Rq4f2RKtMYnUwQV',{headers:{Authorization:'Bearer '+process.env.STRIPE_SECRET_KEY}}).then(async r=>{const a=r.ok?await r.json():null;console.log(r.status+' '+statusFields(a).accountStatus)})")
echo "  Ledyard host account read -> $ST"
case "$ST" in "403 unknown"|"200 enabled"|"200 action_required") ;; *) abort "unexpected payout status '$ST'";; esac

echo "--- c200 carried forward: real per-user conversation read state ---"
docker exec "$FB" sh -c "grep -q 'convSeen_' server/api-util/conversationSeen.js" || abort "c200 read-state module not in image"
docker exec "$FB" sh -c "grep -rq 'conversations/unread' dist/client/assets/" || abort "c200 dashboard not calling unread endpoint"
docker exec "$FB" sh -c "grep -rq 'conversations/seen' dist/client/assets/" || abort "c200 transaction page not marking seen"
UC=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/conversations/unread); echo "  anon GET /api/conversations/unread -> $UC"
[ "$UC" = 401 ] || [ "$UC" = 403 ] || abort "unread endpoint not auth-gated ($UC)"
SC=$(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:3000/api/conversations/seen -H 'Content-Type: application/json' -d '{}'); echo "  POST /api/conversations/seen {} -> $SC"
[ "$SC" = 400 ] || abort "seen endpoint did not reject empty body ($SC)"
SA=$(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:3000/api/conversations/seen -H 'Content-Type: application/json' -d '{"transactionId":"6888401b-7fa7-4ba0-9c9d-95e529fcf533"}'); echo "  anon POST seen -> $SA"
[ "$SA" = 401 ] || [ "$SA" = 403 ] || abort "seen endpoint not auth-gated ($SA)"

echo "--- c199 carried forward: calendar feed = every Sharetribe hold, as UTC instants ---"
docker exec "$FB" sh -c "grep -q 'DTSTART:\${fmtUtc(start)}' server/api-util/ical-build.js" || abort "c199 UTC builder not in image"
docker exec "$FB" sh -c "test -f server/api-util/ical-sources.js" || abort "c199 paged sources not in image"
python3 /home/ubuntu/verify_ical.py http://127.0.0.1:3000 "$FB" "$ENVF" || abort "c199 feed != Sharetribe (see lines above)"
echo "  feeds match Sharetribe exactly, all UTC"

echo "--- c197 THE FIX: public location is city-level, never a street ---"
docker exec "$FB" sh -c "grep -q 'BARE_STREET_TYPES' src/util/address.js" 2>/dev/null || echo "  (src not shipped in image; checking behaviour instead)"
L=$(curl -sL --max-time 25 "http://127.0.0.1:3000/l/ophir-oasis/6a728317-8b62-400e-8e5c-0d506ece36fe")
printf '%s' "$L" | grep -q 'Auburn' || abort "listing location label lost"
for t in "Skylark" "Nicholas Dr" "Catherine St" "Temple City Blvd" "Park Creek" "Cardinet" "Harper St" "Humbert" "Quasar" "Catskill"; do
  printf '%s' "$L" | grep -q "$t" && abort "street token '$t' on listing page"; done
echo "  listing page renders a city label and no street token"


echo "--- c198 THE FIX 1: amenity cards only when poolAmenities confirms them ---"
LED=$(curl -s --max-time 25 "http://127.0.0.1:3000/l/backyard-oasis-ct/6888401b-7fa7-4ba0-9c9d-95e529fcf533")
printf '%s' "$LED" | grep -q 'Backyard Oasis' || abort "Ledyard listing did not render"
printf '%s' "$LED" | grep -q 'Comfortable water even on cooler days' && abort "Ledyard still shows Heated pool card"
printf '%s' "$LED" | grep -q 'Lifeguard on duty' && abort "lifeguard claim rendered"
echo "  Ledyard: no Heated pool / Lifeguard card"
echo "--- c198 THE FIX 2: currency always valid, page == checkout ---"
printf '%s' "$LED" | grep -q '\$57\.50' || abort "Ledyard all-in \$57.50 not rendered"
printf '%s' "$LED" | grep -Eq '\$[0-9,]+\.[0-9]([^0-9]|$)' && abort "one-decimal currency on Ledyard"
SP=$(curl -s --max-time 25 "http://127.0.0.1:3000/s")
printf '%s' "$SP" | grep -Eq '\$[0-9,]+\.[0-9]([^0-9]|$)' && abort "one-decimal currency on /s"
echo "  Ledyard shows \$57.50; no one-decimal currency on Ledyard or /s"

echo "--- c197 carried forward: public location ---"
echo "--- prior releases (carried forward from the c189 gate) ---"
P=$(curl -s --max-time 25 http://127.0.0.1:3000/host-standards)
printf '%s' "$P" | grep -q 'HOST PREPAREDNESS' || abort "host-standards did not render"
printf '%s' "$P" | grep -q '2026.2' || abort "policy version lost"
docker exec "$FB" sh -c "grep -rq 'every booking is insured' dist/client/assets/" && abort "landing insurance claim back"
docker exec "$FB" sh -c "grep -q 'NumMedia' server/extensions/sms-messaging/mod/notify/inbound.js" || abort "c183 MMS lost"
docker exec "$FB" sh -c "grep -q 'isVip' server/extensions/sms-messaging/mod/notify/inbound.js" || abort "c184 VIP lost"
docker exec "$FB" sh -c "grep -q 'looksCanadian' server/api/geocodeSuggest.js" || abort "c184 canada geocode lost"
CA=$(curl -s --max-time 25 "http://127.0.0.1:3000/api/geocode-suggest?q=100%20King%20Street%20West%20Hamilton%20Ontario")
echo "$CA" | grep -qi 'ontario' || abort "canada geocode regressed"
docker exec "$FB" sh -c "grep -q 'emailUnverified' server/extensions/sms-messaging/mod/notify/poller.js" || abort "c182 poller lost"
docker exec "$FB" sh -c "grep -q 'you earn' server/extensions/sms-messaging/mod/notify/messages.js" || abort "c181 payout lost"
docker exec "$FB" sh -c "grep -rl '15% booking fee' dist/client/assets/ >/dev/null 2>&1" || abort "c161 fee lost"
docker exec "$FB" sh -c "grep -rq 'fetchPriority' dist/client/assets/" || abort "c189 eager cards lost"
S_HTML=$(curl -s --max-time 25 http://127.0.0.1:3000/s)
printf '%s' "$S_HTML" | grep -q 'sharetribe.imgix.net' || abort "c189 imgix preconnect lost"
docker exec "$FB" sh -c "grep -q 'digits.slice(-10)' server/extensions/sms-messaging/mod/notify/twsend.js" || abort "c189 twsend E.164 lost"
curl -s -I --max-time 20 http://127.0.0.1:3000/login | grep -i '^set-cookie' | grep -qi secure || abort "c158 cookie"
IC=$(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:3000/api/sms/inbound -d 'From=%2B15555550100&Body=test'); echo "  unsigned inbound -> $IC"; [ "$IC" = "403" ] || abort "inbound not fail-closed"

echo "--- promo math + payment endpoints ---"
FC=$(docker exec "$FB" sh -c "grep -c 'CUSTOMER_BOOKING_FEE_PCT = 15' dist/server/assets/currency-*.js"); [ "$FC" -ge 1 ] || abort "fee math"
echo "  CUSTOMER_BOOKING_FEE_PCT = 15 present"
for u in / /signup /login /s /terms-of-service "/l/ophir-oasis-with-8-jumping-rock-waterfall-grotto/6a728317-8b62-400e-8e5c-0d506ece36fe"; do
  c=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:3000$u"); echo "  $u -> $c"; [ "$c" = 200 ] || abort "$u regressed"; done
AC=$(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:3000/api/additional-charge/initiate -H 'Content-Type: application/json' -d '{}'); [ "$AC" != 404 ] || abort "payment ep"
echo "  additional-charge endpoint -> $AC"

echo "--- c207 THE FIX: Intercom removed (both boot paths, CSP) ---"
docker exec "$FB" sh -c "grep -rqiE 'widget.intercom.io|nuuc4281|intercomSettings|messenger-js-sdk' dist/client/assets/" && abort "Intercom still in client bundle"
R=$(curl -s --max-time 25 http://127.0.0.1:3000/login); printf '%s' "$R" | grep -qi 'intercom' && abort "intercom in /login HTML"
curl -s -I --max-time 20 http://127.0.0.1:3000/login | grep -i '^content-security-policy' | grep -qi intercom && abort "intercom still in CSP"
L=$(curl -s --max-time 25 http://127.0.0.1:3000/); printf '%s' "$L" | grep -qi 'nuuc4281' && abort "hardcoded app id on landing"
printf '%s' "$L" | grep -q 'Text Derek' && echo "  landing: Text Derek card renders" || echo "  (landing SSR has no Text Derek text; client-only section)"
echo "  no Intercom in bundle, /login, CSP or landing"
echo "=== c207 GATE PASSED $(date -u) — nginx NOT touched, live still on c204 (:4000) ==="
echo OK > /home/ubuntu/gate-c207.done
