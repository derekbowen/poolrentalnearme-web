"""EAST: vhost chat.poolrentalnearme.com -> Chatwoot :3009, /prnm-bot/ -> bot :3120 (ops/chatbot/ops/README.md).
Refuses unless the name already routes here (DNS + a nonce request seen in this box's access log).
DRY=True: read-only. DRY=False: stub :80, certbot certonly --nginx, full vhost, nginx -t, reload, verify;
protected files are md5-gated and any failure restores them and removes the vhost.
"""
import hashlib, os, shutil, subprocess, sys, time

DRY = True
HOST = "chat.poolrentalnearme.com"
VH = "/etc/nginx/sites-enabled/chat-prnm.conf"
CERT = "/etc/letsencrypt/live/%s/fullchain.pem" % HOST
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
FULL = HDR + """# Client IP comes from snippets/cloudflare-real-ip.conf (http level); XFF is overwritten with it
# so Rack::Attack throttles per visitor, not per Cloudflare edge.
map $http_upgrade $prnm_cw_connection { default upgrade; '' close; }
""" + P80 + """server {
    listen 443 ssl;
    server_name %s;
    ssl_certificate /etc/letsencrypt/live/%s/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/%s/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    client_max_body_size 40m;
    # Not public: super admin, sidekiq monitoring, installation onboarding.
    location ~ ^/(super_admin|monitoring|installation)(/|$) { return 404; }
    # Agent-bot webhooks only (the bot also verifies the HMAC signature).
    location /prnm-bot/ {
        limit_except POST { deny all; }
        client_max_body_size 1m;
        proxy_pass http://127.0.0.1:3120/;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_read_timeout 10s;
    }
    location / {
        proxy_pass http://127.0.0.1:3009;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $prnm_cw_connection;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_redirect off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
""" % (HOST, HOST, HOST)
LOC = "--resolve %s:443:127.0.0.1 https://%s" % (HOST, HOST)


def sh(c, t=300):
    r = subprocess.run(c, shell=True, capture_output=True, text=True, timeout=t, executable="/bin/bash")
    return r.returncode, (r.stdout + r.stderr).strip()


def code(args):
    return sh("curl -s -o /dev/null -m 12 -w '%%{http_code}' %s" % args)[1][-3:]


def md5(p):
    return hashlib.md5(open(p, "rb").read()).hexdigest() if os.path.exists(p) else None


def others():  # must not change: fresh-web (default :80) and a ccTLD (:443)
    return (code("-H 'Host: www.poolrentalnearme.com' http://127.0.0.1/"),
            code("--resolve www.poolrentalnearme.co.uk:443:127.0.0.1 https://www.poolrentalnearme.co.uk/"))


bad = ["drift: %s md5 %s" % (p, md5(p)) for p, m in KEEP.items() if md5(p) != m]
prev = open(VH).read() if os.path.exists(VH) else None
if prev not in (None, FULL):
    bad.append(VH + " differs")
if sh("nginx -t")[0]:
    bad.append("nginx -t fails")
if "4.16.2" not in sh("curl -s -m 9 -H 'X-Forwarded-Proto: https' http://127.0.0.1:3009/api")[1]:
    bad.append("Chatwoot unhealthy")
addrs = sorted({x.split()[0] for x in sh("getent ahosts " + HOST)[1].splitlines() if x.strip()})
nonce = "prnm-route-probe-" + os.urandom(8).hex()
sh("curl -s -o /dev/null -m 15 http://%s/.well-known/acme-challenge/%s" % (HOST, nonce))
time.sleep(2)
with open("/var/log/nginx/access.log", "rb") as f:
    f.seek(max(0, os.path.getsize("/var/log/nginx/access.log") - 4000000))
    routed = nonce.encode() in f.read()
if not addrs or not routed:
    bad.append("%s does not route here yet (DNS %s, probe logged: %s)" % (HOST, addrs or "none", routed))
base = others()
print("DNS %s | probe reached here: %s | cert: %s | vhost: %s | other sites %s"
      % (addrs, routed, os.path.exists(CERT), prev is not None, base))
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


def verify():
    ch = [p for p, m in KEEP.items() if md5(p) != m]
    if ch:
        return print("protected files changed:", ch)
    api = sh("curl -s -m 12 %s/api" % LOC)[1]
    c = {"super_admin": code(LOC + "/super_admin"), "onboarding": code(LOC + "/installation/onboarding"),
         "http": code("-H 'Host: %s' http://127.0.0.1/" % HOST), "bot GET": code(LOC + "/prnm-bot/healthz"),
         "cable": code("--http1.1 -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' "
                       "-H 'Sec-WebSocket-Key: cHJubS1jaGF0d29vdC0xMg==' -H 'Origin: https://%s' -m 4 %s/cable" % (HOST, LOC))}
    now = others()
    print("api:", api[:80], "|", c, "| other sites", base, "->", now, "|", sh("openssl x509 -enddate -noout -in " + CERT)[1],
          "| public (info):", code("https://%s/api" % HOST))
    return ('"version":"4.16.2"' in api and c["super_admin"] == c["onboarding"] == "404" and c["http"] == "301"
            and c["bot GET"] == "403" and c["cable"] == "101" and now == base)


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
