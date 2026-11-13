"""EAST: vhost chat.poolrentalnearme.com -> Chatwoot :3009, /prnm-bot/ -> bot :3120 (ops/chatbot/ops/README.md).
Refuses until cw_harden.py + cw_setup.py are done and the name routes here. DRY=False: stub :80, Let's Encrypt cert,
vhost, reload, verify; a failure restores the md5-gated files and removes the vhost.
"""
import hashlib, ipaddress, os, re, shutil, subprocess, sys, time

DRY = True
RUNNER_TIMEOUT = 900  # certbot (240 s) + verify + rollback
DNS = "proxied"  # "proxied" (recommended) | "dns-only" (publishes EAST's IP)
VERSION = "4.19.1"  # cw_harden.py's image
HOST = "chat.poolrentalnearme.com"
EAST_IP = "3.222.110.146"  # webhook hairpin source (extra_hosts); checked with IMDS
SE = "/etc/nginx/sites-enabled/"
VH = SE + "zz-chat-prnm.conf"  # after intl.conf: never the :443 default (= bot_deploy.py, cw_status.py VH)
OLD = SE + "chat-prnm.conf"
CERT = "/etc/letsencrypt/live/%s/fullchain.pem" % HOST
CFIP = "/etc/nginx/snippets/cloudflare-real-ip.conf"
LOG = "/var/log/nginx/access.log"
KEEP = {"/etc/nginx/nginx.conf": "baaf5df982d6c08499a7d55c23f9c0f9",
        "/etc/nginx/sites-enabled/fresh-web": "ccaa26f223325427b378db2ff5c14947",
        "/etc/nginx/sites-enabled/intl.conf": "a513d7df19da7e7b9b55b6b5587701a5",
        "/etc/nginx/snippets/cloudflare-real-ip.conf": "10a1bda86422285f1d6186fce50b38af"}
HDR = "# chat.poolrentalnearme.com: Chatwoot + PRNM bot. Managed by ops/chatbot/ops/cw_nginx.py.\n"
P80 = """server {
    listen 80;
    server_name %s;
    location / { return 301 https://$host$request_uri; }
}
""" % HOST
FULL = HDR + """# Visitor = IPv4 or IPv6 /64 of $remote_addr (cloudflare-real-ip.conf), as an address (2001:db8:0:0:: = 2001:db8::/64):
# zone key and XFF (Rack::Attack). nginx compresses the first longest 2+ zero run to "::": one rule per place.
map $remote_addr $prnm_visitor {
    ~\\. $remote_addr;
    ~^([^:]+:[^:]+:[^:]+:[^:]+): $1::;
    ~^([^:]+:[^:]+:[^:]+):: $1:0::;
    ~^([^:]+:[^:]+):: $1:0:0::;
    "~^([^:]+)::([^:]+)(:[^:]+){4}$" $1:0:0:$2::;
    ~^([^:]+):: $1:0:0:0::;
    "~^::([^:]+:[^:]+)(:[^:]+){4}$" 0:0:$1::;
    "~^::([^:]+)(:[^:]+){4}$" 0:0:0:$1::;
    default 0:0:0:0::;
}
map $http_upgrade $prnm_cw_connection { default upgrade; '' close; }
# wamp: widget calls that post a bot webhook; widget: all widget API; wload: what makes a contact
limit_req_zone $prnm_visitor zone=prnm_wamp:2m rate=1r/s;
limit_req_zone $prnm_visitor zone=prnm_widget:2m rate=10r/s;
limit_req_zone $prnm_visitor zone=prnm_wload:2m rate=10r/m;
# Webhooks all come from EAST's IP: one bucket, a runaway ceiling.
limit_req_zone $binary_remote_addr zone=prnm_bot:1m rate=300r/s;
""" + P80 + """server {
    listen 443 ssl;
    server_name %(h)s;
    ssl_certificate /etc/letsencrypt/live/%(h)s/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/%(h)s/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    client_max_body_size 10m;  # dashboard (login); attachments 1 MB (cw_setup.rb)
    # Locations set no proxy headers: all inherit these.
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $prnm_cw_connection;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $prnm_visitor;
    proxy_redirect off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    limit_req_status 429;
    # super admin sign-in has no 2FA
    location ~ ^/(super_admin|monitoring|installation)(/|$) { return 404; }
    # Hairpin + local; the bot checks the HMAC. Dead/hung bot -> 500 within 3 s (< Chatwoot's 5 s): Chatwoot retries a
    # 500 (3 tries) but opens the chat silently on a 502.
    location /prnm-bot/ {
        allow %(ip)s;
        allow 127.0.0.1;
        deny all;
        limit_except POST { deny all; }
        limit_req zone=prnm_bot burst=600 nodelay;
        client_max_body_size 1m;
        proxy_connect_timeout 2s;
        proxy_read_timeout 3s;
        error_page 502 503 504 =500 @prnm_bot_down;
        proxy_pass http://127.0.0.1:3120/;
    }
    location @prnm_bot_down { return 500; }
    # No visitor files. Prefix: Rails also routes .json and a slash.
    location ^~ /api/v1/widget/direct_uploads { return 403; }
    location ^~ /rails/active_storage/direct_uploads { return 403; }
    # GET only: a write sets a contact's avatar_url (15 MB stored), a label or chat attributes. First regex wins.
    location ~ ^/api/v1/widget/(contact|labels|conversations/(set|destroy)_custom_attributes)(\\.|/|$) {
        limit_except GET { deny all; }
        limit_req zone=prnm_widget burst=40 nodelay;
        proxy_pass http://127.0.0.1:3009;
    }
    location ~ ^/api/v1/widget/(events|messages/[^/]+)(\\.|/|$) {
        limit_req zone=prnm_wamp burst=10 nodelay;
        limit_req zone=prnm_widget burst=40 nodelay;
        client_max_body_size 16k;
        proxy_pass http://127.0.0.1:3009;
    }
    location /api/v1/widget/ {  # 16k: the bot reads 1,500 chars
        limit_req zone=prnm_widget burst=40 nodelay;
        client_max_body_size 16k;
        if ($http_content_type ~* "^multipart/") { return 403; }
        proxy_pass http://127.0.0.1:3009;
    }
    # Each makes a contact: /widget with no valid cw_conversation, any config POST (the 4.19.1 widget never sends one).
    location ~ ^/(widget|api/v1/widget/config)(\\.|/|$) {
        limit_req zone=prnm_wload burst=10 nodelay;
        client_max_body_size 16k;
        proxy_pass http://127.0.0.1:3009;
    }
    # D6 links use PUT; an anonymous POST replaces a founder's unused reset token.
    location ~ ^/auth/password(\\.|/|$) {
        limit_except PUT { deny all; }
        proxy_pass http://127.0.0.1:3009;
    }
    location ^~ /rails/active_storage/ {  # a PUT to disk/<token> stores bytes
        limit_except GET { deny all; }
        client_max_body_size 1m;
        proxy_pass http://127.0.0.1:3009;
    }
    # D1: exactly one ACAO, also on a copy cached without Origin.
    location = /packs/js/sdk.js {
        proxy_hide_header Access-Control-Allow-Origin;
        add_header Access-Control-Allow-Origin "*" always;
        proxy_pass http://127.0.0.1:3009;
    }
    location / { proxy_pass http://127.0.0.1:3009; }
}
""" % {"h": HOST, "ip": EAST_IP}
LOC = "--resolve %s:443:127.0.0.1 https://%s" % (HOST, HOST)
UPV = ("/api/v1/widget/direct_uploads.json", "/api/v1/widget/direct_uploads/", "/api/v1/widget/direct_uploads%2Ejson",
       "/api/v1/widget%2Fdirect_uploads", "/api/v1//widget/./direct_uploads", "/rails/active_storage/direct_uploads.json")
CABLE = ("--http1.1 -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' "
         "-H 'Sec-WebSocket-Key: cHJubS1jaGF0d29vdC0xMg==' -H 'Origin: https://%s' -m 4 " % HOST)


def sh(c, t=300):  # a timeout is rc 124, never an exception that skips the rollback
    try:
        r = subprocess.run(c, shell=True, capture_output=True, text=True, timeout=t, executable="/bin/bash")
    except subprocess.TimeoutExpired:
        return 124, "TIMEOUT after %d s" % t
    return r.returncode, (r.stdout + r.stderr).strip()


def code(args):
    return sh("curl -s -o /dev/null -m 12 -w '%%{http_code}' %s" % args)[1][-3:]


def md5(p):
    return hashlib.md5(open(p, "rb").read()).hexdigest() if os.path.exists(p) else None


def logged(nonce):  # access-log lines with a nonce (field 1 = client address)
    time.sleep(2)
    with open(LOG, "rb") as f:
        f.seek(max(0, os.path.getsize(LOG) - 4000000))
        return [x.decode(errors="replace") for x in f.read().splitlines() if nonce.encode() in x]


def tls(arg):  # subject of the certificate nginx presents on :443
    return sh("timeout 10 openssl s_client -connect 127.0.0.1:443 %s </dev/null 2>/dev/null | openssl x509 -noout "
              "-subject 2>/dev/null" % arg)[1] or "none"


def others():  # must not change: fresh-web, a ccTLD, an unknown name / no SNI on :443
    return (code("-H 'Host: www.poolrentalnearme.com' http://127.0.0.1/"),
            code("--resolve www.poolrentalnearme.co.uk:443:127.0.0.1 https://www.poolrentalnearme.co.uk/"),
            code("-k --resolve prnm-unknown.invalid:443:127.0.0.1 https://prnm-unknown.invalid/"),
            tls("-servername prnm-unknown.invalid"), tls("-noservername"))


def envof(c):  # never printed
    return dict(x.split("=", 1) for x in sh("docker exec %s env" % c)[1].splitlines() if "=" in x)


def cloudflare(a, nets):
    try:
        return any(ipaddress.ip_address(a) in n for n in nets)
    except ValueError:
        return False


bad = ["drift: %s md5 %s" % (p, md5(p)) for p, m in KEEP.items() if md5(p) != m]
prev = open(VH).read() if os.path.exists(VH) else None
if prev not in (None, FULL):
    bad.append(VH + " differs")
if os.path.exists(OLD):
    bad.append(OLD + " exists (it would take over unknown names on :443)")
later = sorted(f for f in os.listdir(SE) if f > os.path.basename(VH))
if later:
    bad.append("%s sort after %s" % (later, os.path.basename(VH)))
if sh("nginx -t")[0]:
    bad.append("nginx -t fails")
if '"version":"%s"' % VERSION not in sh("curl -s -m 9 -H 'X-Forwarded-Proto: https' http://127.0.0.1:3009/api")[1]:
    bad.append("Chatwoot %s unhealthy (cw_harden.py)" % VERSION)
R, K = envof("chatwoot-rails-1"), envof("chatwoot-sidekiq-1")
need = {"FRONTEND_URL": "https://" + HOST, "ENABLE_ACCOUNT_SIGNUP": "false", "FORCE_SSL": "true"}
bad += ["rails %s=%r, want %r (cw_harden.py)" % (k, R.get(k), v) for k, v in need.items() if R.get(k) != v]
if "SAFE_FETCH_ALLOW_PRIVATE_NETWORK" in R or "SAFE_FETCH_ALLOW_PRIVATE_NETWORK" in K:
    bad.append("SAFE_FETCH_ALLOW_PRIVATE_NETWORK is set")
db = sh("docker exec chatwoot-postgres-1 psql -U postgres -d chatwoot_production -Atc \"select (select count(*) from "
        "accounts)||'|'||(select count(*) from users)||'|'||(select coalesce(max(feature_flags & 5), -1) from "
        "channel_web_widgets)\"")[1]
if db != "1|2|0":
    bad.append("accounts|users|widget attachments+end_conversation flags %r, want 1|2|0 (cw_setup.py)" % db)
onb = sh("docker exec chatwoot-redis-1 redis-cli EXISTS alfred:CHATWOOT_INSTALLATION_ONBOARDING")[1]
m = re.search(r"signupEnabled: '([^']*)'", sh("curl -s -m 10 -H 'X-Forwarded-Proto: https' http://127.0.0.1:3009/app/login")[1])
signup = m.group(1) if m else None
if onb != "0" or signup != "false":
    bad.append("onboarding key %r (want 0) / effective signup %r (want 'false') (cw_setup.py)" % (onb, signup))
tok = sh("curl -s -m 3 -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60'")[1]
md = "curl -s -m 3 -H 'X-aws-ec2-metadata-token: %s' http://169.254.169.254/latest/meta-data/" % tok
pub, lan = sh(md + "public-ipv4")[1], sh(md + "local-ipv4")[1]
if pub != EAST_IP or not re.match(r"^\d+\.\d+\.\d+\.\d+$", lan):
    bad.append("IMDS public %r / local %r, expected %s" % (pub[:40], lan[:40], EAST_IP))
nets = [ipaddress.ip_network(x) for x in re.findall(r"^\s*set_real_ip_from\s+([0-9a-fA-F:./]+);", open(CFIP).read(), re.M)]
addrs = sorted({x.split()[0] for x in sh("getent ahosts " + HOST)[1].splitlines() if x.strip()})
dns_ok = bool(addrs) and (all(cloudflare(a, nets) for a in addrs) if DNS == "proxied" else addrs == [EAST_IP])
nonce = "prnm-route-probe-" + os.urandom(8).hex()
sh("curl -s -o /dev/null -m 15 http://%s/.well-known/acme-challenge/%s" % (HOST, nonce))
routed = bool(logged(nonce))
if DNS not in ("proxied", "dns-only") or not dns_ok or not routed:
    bad.append("%s does not route here as DNS=%r (DNS %s, probe logged: %s; proxied = only Cloudflare addresses, "
               "dns-only = %s alone)" % (HOST, DNS, addrs or "none", routed, EAST_IP))
base = others()
print("DNS %s (%s) | probe reached here: %s | cert: %s | vhost: %s | other sites %s | accounts|users|flags %s | "
      "onboarding %s | signup %s | lan %s" % (addrs, DNS, routed, os.path.exists(CERT), prev is not None, base, db, onb,
                                             signup, lan))
if bad:
    sys.exit("ABORT, nothing changed: " + "; ".join(bad))
if DRY:
    print(FULL)
    sys.exit("DRY RUN: nothing changed (above: the vhost for %s)" % VH)

BK = "/home/ubuntu/backup-cw-nginx-" + time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
os.makedirs(BK)
for p in KEEP:
    shutil.copy2(p, BK + "/" + os.path.basename(p))


def write(s):
    with open(VH + ".tmp", "w") as f:
        f.write(s)
    os.replace(VH + ".tmp", VH)


def reload_ok():
    rc, o = sh("nginx -t && systemctl reload nginx")
    print("nginx reload rc", rc, o[-200:])
    time.sleep(2)
    return rc == 0


def many(n, a):  # codes of n requests in a row
    return sh("for i in $(seq %d); do curl -s -o /dev/null -m 5 -w '%%{http_code} ' %s; done" % (n, a))[1].split()


def verify():
    ch = [p for p, m in KEEP.items() if md5(p) != m]
    if ch:
        return print("protected files changed:", ch)
    api = sh("curl -s -m 12 %s/api" % LOC)[1]
    big = "head -c %d /dev/zero | curl -s -o /dev/null -m 12 -w '%%{http_code}' -X %s --data-binary @- " + LOC + "%s"
    hp = "hairpin-" + os.urandom(6).hex()
    W = LOC + "/api/v1/widget/"
    bot = bool(sh("ss -ltnH 'sport = :3120'")[1])  # up: the bot's codes pass; down: 500
    c = {"super_admin": code(LOC + "/super_admin"), "onboarding": code(LOC + "/installation/onboarding"),
         "http": code("-H 'Host: %s' http://127.0.0.1/" % HOST), "bot GET": code(LOC + "/prnm-bot/healthz"),
         "bot POST from lan": code("-X POST --resolve %s:443:%s https://%s/prnm-bot/webhook" % (HOST, lan, HOST)),
         "bot POST local": code("-X POST -d '{}' %s/prnm-bot/webhook" % LOC),
         "bot POST hairpin": code("-X POST -d '{}' --resolve %s:443:%s https://%s/prnm-bot/%s" % (HOST, EAST_IP, HOST, hp)),
         "widget upload": code("-X POST %s/api/v1/widget/direct_uploads" % LOC),
         "upload variants": " ".join(code("--path-as-is -X POST %s%s" % (LOC, p)) for p in UPV),
         "storage PUT": code("-X PUT -d x %s/rails/active_storage/disk/x" % LOC),
         "widget multipart": code("-F a=b %s/api/v1/widget/messages" % LOC),
         "widget 20KB": sh(big % (20000, "POST", "/api/v1/widget/messages"))[1][-3:],
         "storage 1.1MB": sh(big % (1100000, "PUT", "/rails/active_storage/disk/x/y"))[1][-3:],
         "widget writes": " ".join(code("-X %s %s%s" % (m, W, p)) for m, p in (("PATCH", "contact"), ("POST", "labels"),
                                                                                ("POST", "conversations/set_custom_attributes"))),
         "contact GET": code(W + "contact"), "events x15": many(15, "-X POST %sevents.json" % W),
         "loads x15": many(15, LOC + "'/widget?website_token=prnm-verify&cw_conversation=x'"),  # bad token: no contact
         "config x15": many(15, "-X POST --resolve %s:443:%s 'https://%s/api/v1/widget/config?website_token=prnm-verify'"
                            % (HOST, lan, HOST)),  # lan: its own bucket
         "reset": " ".join(code("-X %s -d reset_password_token=prnm-verify %s/auth/password%s" % (m, LOC, x))
                           for m, x in (("POST", ""), ("POST", ".json"), ("PUT", ""))),
         "cable": code(CABLE + LOC + "/cable")}
    src = [x.split()[0] for x in logged(hp)]
    acao = [x.strip() for x in sh("curl -s -o /dev/null -D - -m 12 -H 'Origin: https://www.poolrentalnearme.com' %s"
                                  "/packs/js/sdk.js" % LOC)[1].lower().splitlines() if x.startswith("access-control-allow-origin")]
    now = others()
    print("api:", api[:80], "|", c, "| bot listening:", bot, "| hairpin source logged:", src, "| sdk.js ACAO:", acao,
          "| other sites", base, "->", now, "|", sh("openssl x509 -enddate -noout -in " + CERT)[1])
    b = (c["bot POST local"], c["bot POST hairpin"])
    edge = sh("curl -s -o /dev/null -D - -m 12 https://%s/api" % HOST)[1].lower()
    ecab = code(CABLE + "https://%s/cable" % HOST)
    eok = edge.startswith("http/") and edge.split()[1] == "200" and ecab == "101" and ("cf-ray:" in edge) == (DNS == "proxied")
    print("edge (info): api %s | cf-ray %s | cable %s%s" % (edge.split()[1:2], "cf-ray:" in edge, ecab, "" if eok else
          "  WARN: check Cloudflare (SSL Full (strict), Security Level for chat. essentially off, WebSockets on)"))
    return ('"version":"%s"' % VERSION in api and c["super_admin"] == c["onboarding"] == "404" and c["http"] == "301"
            and c["bot GET"] == c["bot POST from lan"] == "403" and src == [EAST_IP]
            and (all(x not in ("403", "000") and not x.startswith("5") for x in b) if bot else b == ("500", "500"))
            and c["widget upload"] == c["widget multipart"] == c["storage PUT"] == "403"
            and c["upload variants"] == " ".join(["403"] * len(UPV)) and c["widget 20KB"] == c["storage 1.1MB"] == "413"
            and c["widget writes"] == "403 403 403" and c["contact GET"] == "404" and all(
                "429" in c[k] and "429" not in c[k][:10] for k in ("events x15", "loads x15", "config x15"))
            and c["reset"][:8] == "403 403 " and c["reset"][8:] not in ("", "403", "000") and c["reset"][8:9] != "5"
            and c["cable"] == "101" and acao == ["access-control-allow-origin: *"] and now == base)


ok = True
if not os.path.exists(CERT):
    write(HDR + P80)
    ok = reload_ok()
    if ok:
        rc, o = sh("certbot certonly --nginx -d %s --non-interactive --agree-tos --keep-until-expiring "
                   "--deploy-hook 'systemctl reload nginx'" % HOST, 240)
        print("certbot rc", rc, o[-600:])
        ok = rc == 0 and os.path.exists(CERT)
if ok:
    write(FULL)
    ok = reload_ok() and verify()
if ok:
    print("DONE. vhost:", VH, "| backup:", BK)
    sys.exit(0)
print("FAILED -> restoring nginx from", BK)
for p, m in KEEP.items():
    if md5(p) != m:
        shutil.copy2(BK + "/" + os.path.basename(p), p)
if prev is None:
    if os.path.exists(VH):
        os.remove(VH)
else:
    write(prev)
print("rollback reload ok:", reload_ok(), "| other sites", others(), "was", base)
sys.exit(1)
