# Run: python3 ops/chatbot/ops/tests/test_cw_setup_nginx.py   (needs ruby for the syntax check; a local `ubuntu` user)
# Offline harness for cw_setup.py and cw_nginx.py: subprocess.run is replaced by a fake that answers their
# commands; paths are redirected to a temp dir. Nothing touches docker, nginx, certbot or a server.
import hashlib, json, os, pwd, re, runpy, shutil, subprocess, sys, tempfile
from io import StringIO

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))  # ops/chatbot/ops
H = tempfile.mkdtemp(prefix="prnm-ops-test-")
fails = 0


def check(n, c):
    global fails
    print(("  ok   " if c else "  FAIL ") + n)
    fails += 0 if c else 1


def execute(path, fake):
    real, so, buf = subprocess.run, sys.stdout, StringIO()
    subprocess.run, sys.stdout = fake, buf
    code = None
    try:
        runpy.run_path(path, run_name="__main__")
    except SystemExit as e:
        code = e.code
    finally:
        subprocess.run, sys.stdout = real, so
    return code, buf.getvalue()


UNHANDLED = []


def cp(rc, out):
    if out.startswith("UNHANDLED"):
        UNHANDLED.append(out)
    return subprocess.CompletedProcess("", rc, out, "")


# ------------------------------------------------------------------ cw_setup
TOKEN, SECRET = "BotTok" + "Q" * 18, "Secr" + "Z" * 20
OUT = {"account_id": 1, "inbox_id": 1, "website_token": "WebsiteTok1234567890abc", "bot_id": 1,
       "bot_url": "https://chat.poolrentalnearme.com/prnm-bot/webhook", "derek_id": 1, "brandon_id": 2,
       "push_flags": [["push_conversation_creation"], ["push_conversation_creation"]]}


def setup_case(name, dry, public=True, resolve="3.222.110.146", runner_rc=0):
    c = H + "/setup-" + name
    shutil.rmtree(c, ignore_errors=True)
    os.makedirs(c)
    s = open(REPO + "/cw_setup.py").read()
    for a, b in [("DRY = True\n", "DRY = %s\n" % dry), ('BD = "/home/ubuntu/chatbot"', 'BD = "%s/chatbot"' % c)]:
        assert s.count(a) == 1
        s = s.replace(a, b)
    p = c + "/cw_setup.test.py"
    open(p, "w").write(s)
    seen = []

    def fake(cmd, shell=True, capture_output=True, text=True, timeout=None, executable=None, input=None):
        seen.append((cmd, input))
        if "printenv FRONTEND_URL" in cmd:
            return cp(0, "https://chat.poolrentalnearme.com")
        if "getent hosts" in cmd:
            return cp(0, "%s chat.poolrentalnearme.com" % resolve)
        if "ruby -c" in cmd:
            r = real_run(["ruby", "-c"], input=input, capture_output=True, text=True)
            return cp(r.returncode, r.stdout + r.stderr)
        if "psql" in cmd:
            return cp(0, "0|0|0|")
        if "redis-cli" in cmd:
            return cp(0, "1")
        if "https://chat.poolrentalnearme.com/api" in cmd:
            return cp(0, '{"version":"4.16.2"}' if public else "")
        if "rails runner -" in cmd:
            o = dict(OUT)
            if "PRNM_LINKS=1" in cmd:
                o["links"] = [["derek@poolrentalnearme.com", "https://chat.poolrentalnearme.com/app/auth/password/edit?reset_password_token=AAA"],
                              ["brandon@poolrentalnearme.com", "https://chat.poolrentalnearme.com/app/auth/password/edit?reset_password_token=BBB"]]
                o["expires_utc"] = "2026-11-06T10:00:00Z"
            return cp(runner_rc, "I, [log] INFO -- : booting\nPRNM_OUT " + json.dumps(o) if runner_rc == 0 else "boom")
        if "cat /tmp/prnm_bot.json" in cmd:
            return cp(0, json.dumps({"token": TOKEN, "secret": SECRET}))
        if "rm -f /tmp/prnm_bot.json" in cmd:
            return cp(0, "")
        if "installation/onboarding" in cmd:
            return cp(0, "302")
        return cp(99, "UNHANDLED " + cmd)

    code, out = execute(p, fake)
    return c, code, out, seen


real_run = subprocess.run
print("== cw_setup DRY")
c, code, out, seen = setup_case("dry", True)
check("DRY exit, ruby syntax checked inside the container", isinstance(code, str) and code.startswith("DRY RUN")
      and any("ruby -c" in x[0] for x in seen))
check("runner not called, no env file", not any("rails runner" in x[0] for x in seen) and not os.path.exists(c + "/chatbot"))
check("no unhandled command", not UNHANDLED)

print("== cw_setup real, public URL up")
c, code, out, seen = setup_case("ok", False)
envf = c + "/chatbot/.env"
st = os.stat(envf) if os.path.exists(envf) else None
env = dict(l.split("=", 1) for l in open(envf).read().splitlines()) if st else {}
check("exit ok (DONE printed)", code is None and "DONE." in out)
check(".env mode 600, owner ubuntu; dirs 700", st and oct(st.st_mode & 0o777) == "0o600" and st.st_uid == pwd.getpwnam("ubuntu").pw_uid
      and oct(os.stat(c + "/chatbot").st_mode & 0o777) == "0o700" and oct(os.stat(c + "/chatbot/data").st_mode & 0o777) == "0o700")
want = {"HOST", "PORT", "CHATWOOT_URL", "CHATWOOT_FORWARDED_PROTO", "CHATWOOT_PUBLIC_URL", "SITE_URL", "CHATWOOT_ACCOUNT_ID",
        "CHATWOOT_INBOX_ID", "CHATWOOT_BOT_ID", "CHATWOOT_DEREK_USER_ID", "CHATWOOT_BRANDON_USER_ID", "CHATWOOT_BOT_TOKEN",
        "CHATWOOT_WEBHOOK_SECRET", "BOT_DATA_DIR"}
check("env keys match the bot's server.js names", set(env) == want and env["CHATWOOT_BOT_TOKEN"] == TOKEN
      and env["PORT"] == "3120" and env["HOST"] == "127.0.0.1" and env["CHATWOOT_URL"] == "http://127.0.0.1:3009")
check("token and secret never printed", TOKEN not in out and SECRET not in out)
check("reset links printed with expiry + warning", "reset_password_token=AAA" in out and "credentials" in out
      and "2026-11-06T10:00:00Z" in out)
check("bot URL passed to the runner is the public HTTPS URL",
      any("PRNM_BOT_URL=https://chat.poolrentalnearme.com/prnm-bot/webhook" in x[0] for x in seen))
check("secret file removed from the container", any("rm -f /tmp/prnm_bot.json" in x[0] for x in seen))
open(envf, "a").write("BOT_EXTRA=keep-me\n")
c2 = c
code, out2 = execute(c + "/cw_setup.test.py", lambda *a, **k: None) if False else (None, None)

print("== cw_setup real, public URL not up yet")
c, code, out, seen = setup_case("nolinks", False, public=False)
check("no links requested or printed", not any("PRNM_LINKS=1" in x[0] for x in seen) and "reset_password_token" not in out)

print("== cw_setup refuses when HOST resolves to a private/gateway IP inside sidekiq")
c, code, out, seen = setup_case("private", False, resolve="172.18.0.1")
check("ABORT, runner never called", isinstance(code, str) and "ABORT" in code and not any("rails runner" in x[0] for x in seen))

print("== cw_setup runner failure")
c, code, out, seen = setup_case("fail", False, runner_rc=1)
check("FAILED exit, env file not written, secret file still removed", isinstance(code, str) and code.startswith("FAILED")
      and not os.path.exists(c + "/chatbot/.env") and any("rm -f /tmp/prnm_bot.json" in x[0] for x in seen))

# ------------------------------------------------------------------ cw_nginx
def nginx_case(name, dry, routed=True, certbot_rc=0, certbot_touches=False, verify_ok=True, have_cert=False):
    c = H + "/nginx-" + name
    shutil.rmtree(c, ignore_errors=True)
    os.makedirs(c + "/sites-enabled")
    os.makedirs(c + "/live")
    keep = {}
    for n, body in (("nginx.conf", "http {}\n"), ("fresh-web", "server { listen 80 default_server; }\n"),
                    ("intl.conf", "server { server_name x; }\n"), ("cloudflare-real-ip.conf", "real_ip_header CF-Connecting-IP;\n")):
        p = c + "/" + n
        open(p, "w").write(body)
        keep[p] = hashlib.md5(body.encode()).hexdigest()
    log = c + "/access.log"
    open(log, "w").write("old line\n")
    cert = c + "/live/fullchain.pem"
    if have_cert:
        open(cert, "w").write("x")
    s = open(REPO + "/cw_nginx.py").read()
    s = s.replace("DRY = True\n", "DRY = %s\n" % dry)
    s = s.replace('VH = "/etc/nginx/sites-enabled/chat-prnm.conf"', 'VH = "%s/sites-enabled/chat-prnm.conf"' % c)
    s = s.replace('CERT = "/etc/letsencrypt/live/%s/fullchain.pem" % HOST', 'CERT = "%s"' % cert)
    s = re.sub(r"KEEP = \{.*?\}\n", "KEEP = %r\n" % keep, s, count=1, flags=re.S)
    s = s.replace('"/var/log/nginx/access.log"', '"%s"' % log).replace("/home/ubuntu/backup-cw-nginx-", c + "/bk-")
    s = s.replace("time.sleep(2)", "time.sleep(0)")
    p = c + "/cw_nginx.test.py"
    open(p, "w").write(s)
    seen = []

    def fake(cmd, shell=True, capture_output=True, text=True, timeout=None, executable=None, input=None):
        seen.append(cmd)
        if cmd == "nginx -t":
            return cp(0, "ok")
        if "127.0.0.1:3009/api" in cmd:
            return cp(0, '{"version":"4.16.2"}')
        if cmd.startswith("getent ahosts"):
            return cp(0, "104.21.84.187 STREAM chat.poolrentalnearme.com\n" if routed else "")
        if "acme-challenge/prnm-route-probe-" in cmd:
            if routed:
                open(log, "a").write('1.2.3.4 - - "GET /.well-known/acme-challenge/%s HTTP/1.1" 404\n' % cmd.split("/")[-1])
            return cp(0, "")
        if "nginx -t && systemctl reload nginx" in cmd:
            return cp(0, "reloaded")
        if cmd.startswith("certbot certonly"):
            if certbot_touches:
                open(c + "/nginx.conf", "a").write("# certbot leftover\n")
            if certbot_rc == 0:
                open(cert, "w").write("cert")
            return cp(certbot_rc, "certbot output")
        if cmd.startswith("openssl x509"):
            return cp(0, "notAfter=Feb  4 00:00:00 2027 GMT")
        if "curl -s -m 12 --resolve" in cmd and cmd.endswith("/api"):
            return cp(0, '{"version":"4.16.2"}' if verify_ok else "502")
        if "-w '%{http_code}'" in cmd:
            if "Host: www.poolrentalnearme.com" in cmd:
                return cp(0, "200")
            if "co.uk" in cmd:
                return cp(0, "302")
            if "/super_admin" in cmd or "/installation/onboarding" in cmd:
                return cp(0, "404")
            if "Host: chat.poolrentalnearme.com" in cmd:
                return cp(0, "301")
            if "/prnm-bot/healthz" in cmd:
                return cp(0, "403")
            if "/cable" in cmd:
                return cp(28, "101")
            if cmd.endswith("https://chat.poolrentalnearme.com/api"):
                return cp(0, "200")
        return cp(99, "UNHANDLED " + cmd)

    code, out = execute(p, fake)
    return c, code, out, seen, keep


print("== cw_nginx DRY, name not routed here")
c, code, out, seen, keep = nginx_case("unrouted", True, routed=False)
check("ABORT: does not route here", isinstance(code, str) and "does not route here" in code)
print("== cw_nginx DRY, routed")
c, code, out, seen, keep = nginx_case("dry", True)
check("DRY exit, vhost printed, nothing written", isinstance(code, str) and code.startswith("DRY RUN")
      and "proxy_pass http://127.0.0.1:3009;" in out and not os.listdir(c + "/sites-enabled"))
check("no unhandled command", not UNHANDLED)
print("== cw_nginx real: stub, certbot, full vhost, verify")
c, code, out, seen, keep = nginx_case("ok", False)
vh = c + "/sites-enabled/chat-prnm.conf"
check("exit 0 DONE", code == 0 and "DONE." in out)
check("full vhost written (443 + upgrade map + bot location)", os.path.exists(vh) and "listen 443 ssl;" in open(vh).read()
      and "map $http_upgrade $prnm_cw_connection" in open(vh).read() and "location /prnm-bot/" in open(vh).read())
check("order: stub reload, certbot, reload", [x.split()[0] for x in seen if x.startswith(("certbot", "nginx -t &&"))]
      == ["nginx", "certbot", "nginx"])
check("protected files untouched", all(hashlib.md5(open(p, "rb").read()).hexdigest() == m for p, m in keep.items()))
print("== cw_nginx real: certbot fails")
c, code, out, seen, keep = nginx_case("certfail", False, certbot_rc=1)
check("exit 1, vhost removed, reloaded", code == 1 and not os.path.exists(c + "/sites-enabled/chat-prnm.conf")
      and sum(x.startswith("nginx -t &&") for x in seen) == 2)
print("== cw_nginx real: certbot leaves a change in nginx.conf")
c, code, out, seen, keep = nginx_case("certtouch", False, certbot_touches=True)
check("exit 1, nginx.conf restored byte-for-byte, vhost removed", code == 1
      and all(hashlib.md5(open(p, "rb").read()).hexdigest() == m for p, m in keep.items())
      and not os.path.exists(c + "/sites-enabled/chat-prnm.conf"))
print("== cw_nginx real: vhost verify fails (Chatwoot not answering through TLS)")
c, code, out, seen, keep = nginx_case("verifyfail", False, verify_ok=False, have_cert=True)
check("exit 1, vhost removed, certbot not run (cert existed)", code == 1 and not os.path.exists(
    c + "/sites-enabled/chat-prnm.conf") and not any(x.startswith("certbot") for x in seen))

print("\nharness:", "ALL OK" if not fails else "%d FAIL(S)" % fails)
sys.exit(1 if fails else 0)
