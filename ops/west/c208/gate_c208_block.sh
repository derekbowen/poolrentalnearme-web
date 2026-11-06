# c208 gate block: ops/west/c208/gate_c208_block.sh, put before the PASSED line by scripts_c208.py
# (sha256-pinned there, which also fills in the website token, the SDK SRI and the sdk.js URL).
# Uses the gate's FB and abort().
echo "--- c208 THE FIX: chat launcher (sdk.js only on click, SRI-pinned) + CSP ---"
for m in prnm-chat-launcher @TOKEN@ @SRI@; do docker exec "$FB" sh -c "grep -rqF -- '$m' dist/client/assets/" || abort "client bundle lacks $m"; done
echo "  client bundle has the launcher, the website token and the SDK SRI"
for u in /login /; do P8=$(curl -s --max-time 25 "http://127.0.0.1:3000$u"); [ -n "$P8" ] || abort "$u empty"
  printf '%s' "$P8" | grep -qE 'packs/js/sdk\.js|prnm-chat-launcher' && abort "chat in $u server HTML (must load on click)"
  printf '%s' "$P8" | grep -qiE 'widget\.intercom\.io|nuuc4281|intercomSettings|messenger-js-sdk' && abort "Intercom back on $u"; done
echo "  /login and /: no sdk.js, launcher or Intercom in server HTML"
CSP=$(curl -s -I --max-time 20 http://127.0.0.1:3000/login | grep -i '^content-security-policy' | head -1 | tr -d '\r')
[ -n "$CSP" ] || abort "no CSP on /login"
CD=$(printf '%s\n' "${CSP#*:}" | tr ';' '\n' | grep -F 'chat.poolrentalnearme.com' | awk '{print $1}' | sort | tr '\n' ' ')
[ "$CD" = "connect-src frame-src script-src " ] || abort "CSP names the chat host in '$CD' (want connect-src frame-src script-src)"
for d in script-src frame-src connect-src; do
  printf '%s\n' "${CSP#*:}" | tr ';' '\n' | awk -v d=$d '$1==d' | tr ' ' '\n' | grep -qx 'https://chat.poolrentalnearme.com' || abort "$d lacks https://chat.poolrentalnearme.com"; done
printf '%s' "$CSP" | grep -qiE '(wss|http)://chat\.poolrentalnearme' && abort "wss:/http: chat source in CSP"
echo "  CSP: https://chat.poolrentalnearme.com only in $CD"
python3 - '@SRI@' <<'PY' || abort "public sdk.js does not match the pinned SRI, or has no CORS"
import base64, hashlib, sys, urllib.request as u
r = u.urlopen(u.Request("@SDK@", headers={"Origin": "https://www.poolrentalnearme.com"}), timeout=25)
b, a = r.read(), r.headers.get("Access-Control-Allow-Origin")
s = "sha384-" + base64.b64encode(hashlib.sha384(b).digest()).decode() == sys.argv[1]
print("  public sdk.js %d B, SRI match %s, CORS %r" % (len(b), s, a))
sys.exit(0 if s and a in ("*", "https://www.poolrentalnearme.com") else 1)
PY
