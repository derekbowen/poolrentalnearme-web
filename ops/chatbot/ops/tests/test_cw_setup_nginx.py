# Run: python3 ops/chatbot/ops/tests/test_cw_setup_nginx.py   (needs ruby and a local `ubuntu` user; the vhost
# behaviour part needs an nginx binary and openssl, and is skipped without nginx)
# Offline harness for cw_setup.py (+ the real cw_setup.rb, run under plain ruby against tests/fixtures/
# cw_setup_stub.rb) and cw_nginx.py: subprocess.run is replaced by a fake box that answers their commands; paths
# are redirected to a temp dir. Then the generated vhost runs in a throwaway local nginx in front of fake
# Chatwoot/bot upstreams. Nothing touches docker, the live nginx, certbot or a server.
import base64, hashlib, http.client, json, os, pwd, re, runpy, shlex, shutil, socket, ssl, subprocess, sys, tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import StringIO

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))  # ops/chatbot/ops
STUB = os.path.join(REPO, "tests", "fixtures", "cw_setup_stub.rb")
H = tempfile.mkdtemp(prefix="prnm-ops-test-")
HOST = "chat.poolrentalnearme.com"
SDK = b"/* fake sdk.js */" + b"x" * 22000
SDK_SRI = "sha384-" + base64.b64encode(hashlib.sha384(SDK).digest()).decode()
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
real_run = subprocess.run


def cp(rc, out):
    if isinstance(out, str) and out.startswith("UNHANDLED"):
        UNHANDLED.append(out)
    return subprocess.CompletedProcess("", rc, out, "" if isinstance(out, str) else b"")


# ------------------------------------------------------------------ cw_setup (+ the real cw_setup.rb)
TOKEN, SECRET = "BotTok" + "Q" * 18, "Secr" + "Z" * 20


AR = {"ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY": "P" * 32, "ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY": "D" * 32,
      "ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT": "S" * 32}  # what cw_harden.py puts in the rails env


def setup_case(name, dry, public=True, resolve="3.222.110.146", runner_rc=0, link_for="", seed="", keys=3, keep="",
               old=False, seedkeep=False):
    c = H + "/setup-" + name
    shutil.rmtree(c, ignore_errors=True)
    os.makedirs(c)
    s = open(REPO + "/cw_setup.py").read()
    for a, b in [("DRY = True\n", "DRY = %s\n" % dry), ('BD = "/home/ubuntu/chatbot"', 'BD = "%s/chatbot"' % c),
                 ('LINK_FOR = ""  #', 'LINK_FOR = "%s"  #' % link_for), ('KEEP_PENDING = ""  #', 'KEEP_PENDING = "%s"  #' % keep)]:
        assert s.count(a) == 1, a
        s = s.replace(a, b)
    p = c + "/cw_setup.test.py"
    open(p, "w").write(s)
    seen, state = [], {}

    def fake(cmd, shell=True, capture_output=True, text=False, timeout=None, executable=None, input=None):
        seen.append((cmd, input))
        if not text:
            return cp(0, SDK if "packs/js/sdk.js" in cmd else b"")
        if "printenv FRONTEND_URL" in cmd:
            return cp(0, "https://chat.poolrentalnearme.com")
        if "ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY:+k" in cmd:  # sh expands ${X:+k} in the container: presence only
            r = real_run(["sh", "-c", cmd.split("sh -c ", 1)[1].strip("'")], capture_output=True, text=True,
                         env=dict(os.environ, **dict(list(AR.items())[:keys])))
            return cp(0, r.stdout.strip())
        if "pkill -f 'rails runner -'" in cmd:
            return cp(0, "")
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
            return cp(0, '{"version":"4.19.1"}' if public else "")
        if "rails runner -" in cmd:
            if runner_rc == 124:  # cw_setup.rb wrote the secret file, then hung past the timeout
                open(c + "/prnm_bot.json", "w").write(json.dumps({"token": TOKEN, "secret": SECRET}))
                raise subprocess.TimeoutExpired(cmd, timeout)
            if runner_rc:
                return cp(runner_rc, "boom")
            env = dict(os.environ, FRONTEND_URL="https://" + HOST, PRNM_TEST_DIR=c, PRNM_TEST_SEED=seed, **AR,
                       PRNM_TEST_OLD="1" if old else "", PRNM_TEST_KEEP="1" if seedkeep else "")
            env.update((k, v.strip("'")) for k, v in re.findall(r"-e (\w+)=(\S*)", cmd))
            r = real_run(["ruby", "-r", STUB, "-"], input=input, capture_output=True, text=True, env=env)
            t = [x for x in r.stdout.splitlines() if x.startswith("PRNM_TEST ")]
            state.update(json.loads(t[-1][10:]) if t else {"stderr": r.stderr[-800:]})
            return cp(r.returncode, "I, [log] INFO -- : booting\n" + r.stdout + r.stderr)
        if "cat /tmp/prnm_bot.json" in cmd:
            f = c + "/prnm_bot.json"
            out = open(f).read() if os.path.exists(f) else ""
            if os.path.exists(f):
                os.remove(f)
            return cp(0, out)
        if "installation/onboarding" in cmd:
            return cp(0, "302")
        return cp(99, "UNHANDLED " + cmd)

    code, out = execute(p, fake)
    return c, code, out, seen, state


def runner_cmd(seen):
    return [x[0] for x in seen if "rails runner" in x[0]]


print("== cw_setup DRY")
c, code, out, seen, st = setup_case("dry", True)
check("DRY exit, ruby syntax checked inside the container", isinstance(code, str) and code.startswith("DRY RUN")
      and any("ruby -c" in x[0] for x in seen))
check("runner not called, no env file", not runner_cmd(seen) and not os.path.exists(c + "/chatbot"))
check("D1: sdk.js SRI of the running container printed", "sdk.js SRI: " + SDK_SRI in out)
check("no unhandled command", not UNHANDLED)

print("== cw_setup real, fresh install, public URL up, LINK_FOR = \"\"")
c, code, out, seen, st = setup_case("ok", False)
envf = c + "/chatbot/.env"
fst = os.stat(envf) if os.path.exists(envf) else None
env = dict(l.split("=", 1) for l in open(envf).read().splitlines()) if fst else {}
check("exit ok (DONE printed)", code is None and "DONE." in out)
check(".env mode 600, owner ubuntu; dirs 700", fst and oct(fst.st_mode & 0o777) == "0o600" and fst.st_uid == pwd.getpwnam("ubuntu").pw_uid
      and oct(os.stat(c + "/chatbot").st_mode & 0o777) == "0o700" and oct(os.stat(c + "/chatbot/data").st_mode & 0o777) == "0o700")
want = {"HOST", "PORT", "CHATWOOT_URL", "CHATWOOT_FORWARDED_PROTO", "CHATWOOT_PUBLIC_URL", "SITE_URL", "CHATWOOT_ACCOUNT_ID",
        "CHATWOOT_INBOX_ID", "CHATWOOT_BOT_ID", "CHATWOOT_DEREK_USER_ID", "CHATWOOT_BRANDON_USER_ID", "CHATWOOT_BOT_TOKEN",
        "CHATWOOT_WEBHOOK_SECRET", "BOT_DATA_DIR"}
check("env keys match the bot's server.js names", set(env) == want and env["CHATWOOT_BOT_TOKEN"] == TOKEN
      and env["PORT"] == "3120" and env["HOST"] == "127.0.0.1" and env["CHATWOOT_URL"] == "http://127.0.0.1:3009")
check("token and secret never printed", TOKEN not in out and SECRET not in out)
check("real cw_setup.rb: widget flags = emoji_picker only (2): no attachments, no end_conversation",
      st.get("feature_flags") == 2 and '"feature_flags": 2' in out and "WARN" not in out)
check("real cw_setup.rb: attachment limit row = 1 MB", st.get("max_upload") == 1 and '"max_upload_mb": 1' in out)
check("real cw_setup.rb: D3 + engine labels exist", {"handoff", "urgent", "handoff-capped", "handoff-overflow",
                                                      "topic-payouts", "role-host"} <= set(st.get("labels", [])))
check("real cw_setup.rb: Derek is the SuperAdmin, Brandon a User; onboarding key deleted; bot active",
      st.get("users", {}).get("derek@poolrentalnearme.com", {}).get("type") == "SuperAdmin"
      and st["users"]["brandon@poolrentalnearme.com"]["type"] == "User" and st.get("onboarding_deleted")
      and st.get("bot_inbox_status") == "active")
check("no link printed; PRNM_LINK_FOR passed empty", "reset_password_token" not in out
      and "-e PRNM_LINK_FOR='' " in runner_cmd(seen)[0] and "none outstanding" in out)
check("D1 SRI in the DONE line", "VITE_CHATWOOT_SDK_SRI=%s (from the running image)" % SDK_SRI in out)
check("bot URL passed to the runner is the public HTTPS URL",
      "PRNM_BOT_URL=https://chat.poolrentalnearme.com/prnm-bot/webhook" in runner_cmd(seen)[0])
check("secret file removed from the container", any("rm -f /tmp/prnm_bot.json" in x[0] for x in seen))
PUSH = ["push_conversation_creation", "push_conversation_mention", "push_conversation_assignment",
        "push_assigned_conversation_new_message"]
check("real cw_setup.rb: push flags for both founders = creation, mention, assignment, assigned new message; "
      "participating_conversation_new_message OFF", [v.get("push") for v in st.get("users", {}).values()] == [PUSH, PUSH]
      and "participating" not in out)
check("2FA: keys checked by presence only (3/3, values never printed), available, nobody enrolled yet",
      "2FA keys 3/3" in out and '"mfa_available": true' in out and "2FA available: True | enforced: True | on for derek, "
      "brandon: [False, False]" in out and not any(v in out for v in AR.values()))
check("real cw_setup.rb: 2FA required for the account (4.19 enforce_mfa, reported); KEEP_PENDING \"\" passed empty and "
      "the account left at Chatwoot's default (open on bot failure)", st.get("account") == {"enforce_mfa": True,
      "keep_pending": None} and '"mfa_enforced": true' in out and "-e PRNM_KEEP_PENDING='' " in runner_cmd(seen)[0]
      and "keep chats with the bot when its webhook fails: False" in out)

print("== cw_setup real, LINK_FOR = \"derek\", both founders hold an older outstanding token")
c, code, out, seen, st = setup_case("derek", False, link_for="derek", seed="tokens")
links = re.findall(r"reset_password_token=(\S+)", out)
u = st.get("users", {})
check("exactly one link, Derek's, nothing for Brandon", len(links) == 1 and "LINK for derek@poolrentalnearme.com" in out
      and "brandon@poolrentalnearme.com\nhttps" not in out)
check("printed token is the one now stored for Derek (old one replaced)",
      links and u.get("derek@poolrentalnearme.com", {}).get("token") == hashlib.sha256(links[0].encode()).hexdigest())
check("Brandon's outstanding token revoked", u.get("brandon@poolrentalnearme.com", {}).get("token") is None
      and "revoked this run (nobody can use an older link): brandon@poolrentalnearme.com" in out)
check("the warning is true to 4.19.1: no 6 h promise, revoke instruction", "stays valid until used or revoked" in out
      and 'LINK_FOR = ""' in out and "expire" not in out.replace("expiry", ""))
check("the 2FA step it prints is the enforced one (sign in, Chatwoot asks for the setup; then the app) and the "
      "per-founder state is reported (Derek on, Brandon off)", "he signs in at https://%s/app/login and Chatwoot makes him "
      "set up 2FA there (2FA is required for this account): scan the QR code" % HOST in out and "only then the mobile app"
      in out and "Profile Settings" not in out and "on for derek, brandon: [True, False]" in out)

print("== cw_setup real on the 4.16.2 image (IMAGE = \"running\"): no enforce_mfa setting exists")
c, code, out, seen, st = setup_case("old", False, link_for="derek", seed="tokens", old=True)
check("runs (respond_to? guard), 2FA reported not enforced, and the printed step is the optional one",
      code is None and "DONE." in out and '"mfa_enforced": false' in out and "enforced: False" in out
      and "he turns on 2FA: Profile Settings > Security, enable two-factor: scan the QR code" in out
      and st.get("account", {}).get("enforce_mfa") is None)

print("== cw_setup KEEP_PENDING (Derek decides): \"true\" sets it, \"\" leaves it, \"false\" clears it")
c, code, out, seen, st = setup_case("keep-true", False, keep="true")
check("\"true\": the account keeps chats with the bot when its webhook fails, and says so",
      st.get("account", {}).get("keep_pending") is True and "-e PRNM_KEEP_PENDING=true " in runner_cmd(seen)[0]
      and '"keep_pending": true' in out and "keep chats with the bot when its webhook fails: True" in out)
c, code, out, seen, st = setup_case("keep-unchanged", False, seed="tokens", seedkeep=True)
check("\"\": an earlier choice (true) is left as it is", st.get("account", {}).get("keep_pending") is True
      and "webhook fails: True" in out)
c, code, out, seen, st = setup_case("keep-false", False, seed="tokens", seedkeep=True, keep="false")
check("\"false\": cleared (Chatwoot opens the chat on bot failure)", st.get("account", {}).get("keep_pending") is False
      and "webhook fails: False" in out)
c, code, out, seen, st = setup_case("keep-bad", False, keep="yes")
check("a bad KEEP_PENDING aborts before the runner", isinstance(code, str) and "KEEP_PENDING" in code
      and not runner_cmd(seen))

print("== cw_setup real, LINK_FOR = \"\" after the founders set passwords: revoke every printed copy")
c, code, out, seen, st = setup_case("revoke", False, seed="tokens")
check("no link, both tokens cleared", "reset_password_token" not in out and all(
      v.get("token") is None for v in st.get("users", {}).values()) and len(st.get("users", {})) == 2
      and "derek@poolrentalnearme.com, brandon@poolrentalnearme.com" in out)

print("== cw_setup real, LINK_FOR = \"brandon\" but the public URL is not up yet")
c, code, out, seen, st = setup_case("nolinks", False, public=False, link_for="brandon")
check("no link requested or printed, and it says why", "-e PRNM_LINK_FOR='' " in runner_cmd(seen)[0]
      and "reset_password_token" not in out and "does not answer 4.19.1 yet" in out)

print("== cw_setup refuses a bad LINK_FOR, a private/gateway IP inside sidekiq, a foreign install")
c, code, out, seen, st = setup_case("badlink", False, link_for="stephen")
check("ABORT on LINK_FOR", isinstance(code, str) and "LINK_FOR must be" in code and not runner_cmd(seen))
c, code, out, seen, st = setup_case("private", False, resolve="172.18.0.1")
check("ABORT, runner never called", isinstance(code, str) and "ABORT" in code and not runner_cmd(seen))
c, code, out, seen, st = setup_case("foreign", False, seed="foreign")
check("real cw_setup.rb refuses a non-fresh install it did not create", isinstance(code, str) and code.startswith("FAILED")
      and "not a fresh install" in code and not os.path.exists(c + "/chatbot/.env"))

print("== cw_setup refuses when cw_harden.py did not set all three 2FA encryption keys")
c, code, out, seen, st = setup_case("nokeys", False, keys=1)
check("ABORT names it, runner never called", isinstance(code, str) and "2FA unavailable: 1 of 3" in code
      and not runner_cmd(seen))
print("== cw_setup runner hangs after writing the secret file")
c, code, out, seen, st = setup_case("hang", False, runner_rc=124)
cmds = [x[0] for x in seen]
i_run = [i for i, x in enumerate(cmds) if "rails runner -" in x and "pkill" not in x]
i_kill = [i for i, x in enumerate(cmds) if "pkill -f 'rails runner -'" in x]
i_rm = [i for i, x in enumerate(cmds) if "rm -f /tmp/prnm_bot.json" in x]
check("FAILED (rc 124), no traceback; runner stopped, then the secret file read and removed; nothing printed or written",
      isinstance(code, str) and code.startswith("FAILED (rc 124)") and i_run and i_kill and i_rm
      and i_run[0] < i_kill[0] < i_rm[0] and not os.path.exists(c + "/prnm_bot.json")
      and not os.path.exists(c + "/chatbot/.env") and TOKEN not in out + code and SECRET not in out + code)
print("== cw_setup runner failure")
c, code, out, seen, st = setup_case("fail", False, runner_rc=1)
check("FAILED exit, env file not written, secret file still removed", isinstance(code, str) and code.startswith("FAILED")
      and not os.path.exists(c + "/chatbot/.env") and any("rm -f /tmp/prnm_bot.json" in x[0] for x in seen))
check("no unhandled command (setup)", not UNHANDLED)

# ------------------------------------------------------------------ cw_nginx
EAST = "3.222.110.146"
LAN = "172.31.5.6"
CF_SNIPPET = ("set_real_ip_from 104.16.0.0/13;\nset_real_ip_from 172.64.0.0/13;\nset_real_ip_from 2606:4700::/32;\n"
              "real_ip_header CF-Connecting-IP;\n")
CF_DNS = ("104.21.84.187 STREAM chat.poolrentalnearme.com\n104.21.84.187 DGRAM\n172.67.195.185 STREAM\n"
          "2606:4700:3036::6815:54bb STREAM\n")
GOOD_ENV = "FRONTEND_URL=https://chat.poolrentalnearme.com\nENABLE_ACCOUNT_SIGNUP=false\nFORCE_SSL=true\nSECRET_KEY_BASE=zzz"
CO_UK = "subject=CN = poolrentalnearme.co.uk"


def nginx_case(name, dry, dns=CF_DNS, routed=True, certbot_rc=0, certbot_touches=False, verify_ok=True, have_cert=False,
               mode="proxied", rails_env=GOOD_ENV, sidekiq_env=GOOD_ENV, db="1|2|0", onb="0", signup="false",
               extra_sites=(), shift=False, hairpin_src=EAST, edge_ray=True, upv="403", events="404 " * 11 + "429 " * 4,
               loads="404 " * 11 + "429 " * 4, bot_up=False, bot_down="500", bot_up_code=None, writes="403",
               contact_get="404", w20k="413"):
    c = H + "/nginx-" + name
    shutil.rmtree(c, ignore_errors=True)
    os.makedirs(c + "/sites-enabled")
    os.makedirs(c + "/live")
    keep = {}
    for n, body in (("nginx.conf", "http {}\n"), ("sites-enabled/fresh-web", "server { listen 80 default_server; }\n"),
                    ("sites-enabled/intl.conf", "server { listen 443 ssl; server_name x; }\n"),
                    ("cloudflare-real-ip.conf", CF_SNIPPET)):
        p = c + "/" + n
        open(p, "w").write(body)
        keep[p] = hashlib.md5(body.encode()).hexdigest()
    for n in extra_sites:
        open(c + "/sites-enabled/" + n, "w").write("# extra\n")
    log = c + "/access.log"
    open(log, "w").write("old line\n")
    cert = c + "/live/fullchain.pem"
    if have_cert:
        open(cert, "w").write("x")
    s = open(REPO + "/cw_nginx.py").read()
    for a, b in [("DRY = True\n", "DRY = %s\n" % dry), ('DNS = "proxied"  #', 'DNS = "%s"  #' % mode),
                 ('SE = "/etc/nginx/sites-enabled/"', 'SE = "%s/sites-enabled/"' % c),
                 ('CERT = "/etc/letsencrypt/live/%s/fullchain.pem" % HOST', 'CERT = "%s"' % cert),
                 ('CFIP = "/etc/nginx/snippets/cloudflare-real-ip.conf"', 'CFIP = "%s/cloudflare-real-ip.conf"' % c),
                 ('LOG = "/var/log/nginx/access.log"', 'LOG = "%s"' % log),
                 ("/home/ubuntu/backup-cw-nginx-", c + "/bk-")]:
        assert s.count(a) == 1, a
        s = s.replace(a, b)
    s = re.sub(r"KEEP = \{.*?\}\n", "KEEP = %r\n" % keep, s, count=1, flags=re.S)
    s = s.replace("time.sleep(2)", "time.sleep(0)")
    p = c + "/cw_nginx.test.py"
    open(p, "w").write(s)
    seen = []
    vh = c + "/sites-enabled/zz-chat-prnm.conf"

    def tls_subject():  # what an unknown name gets on :443; shift = the chat vhost became the implicit default
        return "subject=CN = " + HOST if shift and os.path.exists(vh) and "listen 443" in open(vh).read() else CO_UK

    def fake(cmd, shell=True, capture_output=True, text=False, timeout=None, executable=None, input=None):
        seen.append(cmd)
        if cmd == "nginx -t":
            return cp(0, "ok")
        if "127.0.0.1:3009/api" in cmd:
            return cp(0, '{"version":"4.19.1"}')
        if "docker exec chatwoot-rails-1 env" in cmd:
            return cp(0, rails_env)
        if "docker exec chatwoot-sidekiq-1 env" in cmd:
            return cp(0, sidekiq_env)
        if "psql" in cmd and "feature_flags & 5" in cmd:
            return cp(0, db)
        if "redis-cli EXISTS" in cmd:
            return cp(0, onb)
        if "127.0.0.1:3009/app/login" in cmd:
            return cp(0, "<script>window.chatwootConfig = { signupEnabled: '%s', isEnterprise: 'false' }</script>" % signup)
        if "api/token" in cmd:
            return cp(0, "imds-token")
        if cmd.endswith("meta-data/public-ipv4"):
            return cp(0, EAST)
        if cmd.endswith("meta-data/local-ipv4"):
            return cp(0, LAN)
        if cmd.startswith("getent ahosts"):
            return cp(0, dns if routed else "")
        if "acme-challenge/prnm-route-probe-" in cmd:
            if routed:
                open(log, "a").write('1.2.3.4 - - "GET /.well-known/acme-challenge/%s HTTP/1.1" 404\n' % cmd.split("/")[-1])
            return cp(0, "")
        if "nginx -t && systemctl reload nginx" in cmd:
            return cp(0, "reloaded")
        if cmd.startswith("certbot certonly"):
            if certbot_rc == 124:
                raise subprocess.TimeoutExpired(cmd, timeout)
            if certbot_touches:
                open(c + "/nginx.conf", "a").write("# certbot leftover\n")
            if certbot_rc == 0:
                open(cert, "w").write("cert")
            return cp(certbot_rc, "certbot output")
        if cmd.startswith("openssl x509"):
            return cp(0, "notAfter=Feb  4 00:00:00 2027 GMT")
        if "openssl s_client" in cmd:
            return cp(0, tls_subject())
        if "curl -s -m 12 --resolve" in cmd and cmd.endswith("/api"):
            return cp(0, '{"version":"4.19.1"}' if verify_ok else "502")
        if "-D -" in cmd and "/packs/js/sdk.js" in cmd:
            return cp(0, "HTTP/1.1 200 OK\r\naccess-control-allow-origin: *\r\nvary: Origin\r\n")
        if "-D -" in cmd and cmd.endswith("https://%s/api" % HOST):
            return cp(0, "HTTP/2 200\r\ncontent-type: application/json\r\n" + ("cf-ray: 9a1b-IAD\r\n" if edge_ray else ""))
        if "head -c 1100000 /dev/zero" in cmd:
            return cp(0, "413")
        if "head -c 20000 /dev/zero" in cmd and "/api/v1/widget/messages" in cmd:
            return cp(0, w20k)
        if cmd.startswith("for i in $(seq 15)") and "/api/v1/widget/events.json" in cmd:
            return cp(0, events)
        if cmd.startswith("for i in $(seq 15)") and "/widget?website_token=prnm-verify&cw_conversation=x" in cmd:
            return cp(0, loads)
        if cmd == "ss -ltnH 'sport = :3120'":
            return cp(0, "LISTEN 0 511 127.0.0.1:3120 0.0.0.0:*" if bot_up else "")
        if "-w '%{http_code}'" in cmd:
            if "--path-as-is -X POST" in cmd and "direct_uploads" in cmd:
                return cp(0, upv)
            if "-X PUT -d x" in cmd and "/rails/active_storage/disk/" in cmd:
                return cp(0, "403")
            if "Host: www.poolrentalnearme.com" in cmd:
                return cp(0, "200")
            if "co.uk" in cmd or "prnm-unknown.invalid" in cmd:
                return cp(0, "302")
            if "/super_admin" in cmd or "/installation/onboarding" in cmd:
                return cp(0, "404")
            if "Host: chat.poolrentalnearme.com" in cmd:
                return cp(0, "301")
            if "/prnm-bot/hairpin-" in cmd:  # passes nginx: the bot's own 404, or nginx's code for a dead bot
                open(log, "a").write('%s - - "POST /prnm-bot/%s HTTP/1.1" 404\n' % (hairpin_src, cmd.split("/prnm-bot/")[1]))
                return cp(0, "403" if hairpin_src != EAST else bot_up_code or "404" if bot_up else bot_down)
            if "/prnm-bot/" in cmd:
                if "-X POST" not in cmd or ":443:%s " % LAN in cmd:
                    return cp(0, "403")
                return cp(0, bot_up_code or "401" if bot_up else bot_down)  # unsigned: the bot's 401; dead: nginx's
            if re.search(r"/api/v1/widget/(contact|labels|conversations/set_custom_attributes)", cmd):
                return cp(0, writes if " -X " in cmd else contact_get)
            if "/api/v1/widget/direct_uploads" in cmd or "-F a=b" in cmd:
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
print("== cw_nginx DRY, routed through Cloudflare (proxied, the recommendation)")
c, code, out, seen, keep = nginx_case("dry", True)
check("DRY exit, vhost printed, nothing written", isinstance(code, str) and code.startswith("DRY RUN")
      and "proxy_pass http://127.0.0.1:3009;" in out and not os.path.exists(c + "/sites-enabled/zz-chat-prnm.conf"))
check("vhost: /prnm-bot/ allows EAST + 127.0.0.1 only; its zone is a runaway ceiling (300r/s, burst 600)",
      "allow 3.222.110.146;\n        allow 127.0.0.1;\n        deny all;" in out
      and "limit_req_zone $binary_remote_addr zone=prnm_bot:1m rate=300r/s;" in out
      and "limit_req zone=prnm_bot burst=600 nodelay;" in out and out.count("limit_req_status 429;") == 1)
check("vhost: per-visitor zones on the webhook amplifiers (1r/s), all widget calls (10r/s), /widget loads (10/min)",
      "zone=prnm_wamp:2m rate=1r/s;" in out and "zone=prnm_widget:2m rate=10r/s;" in out
      and "zone=prnm_wload:2m rate=10r/m;" in out
      and "location ~ ^/api/v1/widget/(events|messages/[^/]+)(\\.|/|$) {\n        limit_req zone=prnm_wamp burst=10 nodelay;"
      in out and "location ~ ^/widget(\\.|/|$) {\n        limit_req zone=prnm_wload burst=10 nodelay;" in out
      and out.count("limit_req zone=prnm_widget burst=40 nodelay;") == 3)
check("vhost: visitor contact / labels / custom-attribute writes denied (GET only), placed before the other widget "
      "regex (first match wins)", "location ~ ^/api/v1/widget/(contact|labels|conversations/(set|destroy)_custom_attributes)"
      "(\\.|/|$) {\n        limit_except GET { deny all; }" in out
      and out.index("(contact|labels|") < out.index("(events|messages/") < out.index("location /api/v1/widget/ {"))
check("vhost: a dead or hung bot answers 500 (Chatwoot retries 429/500 only; a 502 opens the chat silently), "
      "nginx gives up at 3 s, under Chatwoot's 5 s", "error_page 502 503 504 =500 @prnm_bot_down;" in out
      and "location @prnm_bot_down { return 500; }" in out and "proxy_read_timeout 3s;" in out
      and "proxy_connect_timeout 2s;" in out)
check("vhost: widget bodies 16k, storage/bot 1m, uploads prefix-blocked, storage GET only, multipart 403, sdk.js ACAO",
      out.count("client_max_body_size 16k;") == 2 and out.count("client_max_body_size 1m;") == 2
      and "location ^~ /api/v1/widget/direct_uploads { return 403; }" in out
      and "location ^~ /rails/active_storage/direct_uploads { return 403; }" in out
      and re.search(r"location \^~ /rails/active_storage/ \{[^\n]*\n        limit_except GET \{ deny all; \}", out)
      and "location = " not in out.replace("location = /packs/js/sdk.js", "")
      and 'if ($http_content_type ~* "^multipart/") { return 403; }' in out
      and 'add_header Access-Control-Allow-Origin "*" always;' in out)
check("baseline includes the unknown-SNI / no-SNI cert subject", out.count(CO_UK) == 2)
check("no unhandled command", not UNHANDLED)
print("== cw_nginx DRY: DNS-only record (EAST's IP published) while DNS = \"proxied\"")
c, code, out, seen, keep = nginx_case("dnsonly-refused", True, dns="3.222.110.146 STREAM chat.poolrentalnearme.com\n")
check("ABORT: proxied means Cloudflare addresses only", isinstance(code, str) and "does not route here as DNS='proxied'" in code)
print("== cw_nginx DRY: DNS = \"dns-only\" with EAST's IP is accepted")
c, code, out, seen, keep = nginx_case("dnsonly-ok", True, dns="3.222.110.146 STREAM chat.poolrentalnearme.com\n",
                                      mode="dns-only")
check("DRY exit", isinstance(code, str) and code.startswith("DRY RUN"))
print("== cw_nginx DRY: refuses to go public before cw_harden / cw_setup")
c, code, out, seen, keep = nginx_case("unhardened", True, rails_env="FRONTEND_URL=https://chat.13.56.113.85.nip.io\n"
                                      "ENABLE_ACCOUNT_SIGNUP=true", db="0|0|-1", onb="1", signup="true")
check("ABORT lists FRONTEND_URL, signup, FORCE_SSL, accounts/users/flags, onboarding", isinstance(code, str)
      and all(x in code for x in ("rails FRONTEND_URL=", "rails ENABLE_ACCOUNT_SIGNUP='true'", "rails FORCE_SSL=None",
                                  "'0|0|-1', want 1|2|0", "onboarding key '1'", "effective signup 'true'")))
c, code, out, seen, keep = nginx_case("safefetch", True, sidekiq_env=GOOD_ENV + "\nSAFE_FETCH_ALLOW_PRIVATE_NETWORK=true")
check("ABORT when SAFE_FETCH_ALLOW_PRIVATE_NETWORK is set in sidekiq", isinstance(code, str) and "SAFE_FETCH" in code)
c, code, out, seen, keep = nginx_case("endconv", True, db="1|2|4")
check("ABORT when the widget still has end_conversation", isinstance(code, str) and "'1|2|4'" in code)
c, code, out, seen, keep = nginx_case("signupdb", True, signup="true")
check("ABORT when the DB row keeps signup on although env says false", isinstance(code, str) and "effective signup 'true'" in code)
print("== cw_nginx DRY: :443 default-server ordering")
c, code, out, seen, keep = nginx_case("oldname", True, extra_sites=("chat-prnm.conf",))
check("ABORT: the old chat-prnm.conf name exists", isinstance(code, str) and "chat-prnm.conf exists" in code)
c, code, out, seen, keep = nginx_case("sortslast", True, extra_sites=("zzz-other.conf",))
check("ABORT: a file sorts after zz-chat-prnm.conf", isinstance(code, str) and "zzz-other.conf" in code)

print("== cw_nginx real: stub, certbot, full vhost, verify")
c, code, out, seen, keep = nginx_case("ok", False)
vh = c + "/sites-enabled/zz-chat-prnm.conf"
check("exit 0 DONE", code == 0 and "DONE." in out)
check("full vhost written as zz-chat-prnm.conf (sorts after intl.conf)", os.path.exists(vh)
      and sorted(os.listdir(c + "/sites-enabled"))[-1] == "zz-chat-prnm.conf" and "listen 443 ssl;" in open(vh).read()
      and "map $http_upgrade $prnm_cw_connection" in open(vh).read() and "location /prnm-bot/" in open(vh).read())
check("order: stub reload, certbot, reload", [x.split()[0] for x in seen if x.startswith(("certbot", "nginx -t &&"))]
      == ["nginx", "certbot", "nginx"])
check("verify ran every check (lan POST 403; bot not deployed yet: local and hairpin POST get nginx's 500, not 502; "
      "hairpin from EAST, 413s, ACAO once)",
      all(x in out for x in ("'bot POST from lan': '403'", "'bot POST local': '500'", "'bot POST hairpin': '500'",
                              "'widget 20KB': '413'", "'storage 1.1MB': '413'", "'widget multipart': '403'",
                              "bot listening: False", "hairpin source logged: ['3.222.110.146']",
                              "sdk.js ACAO: ['access-control-allow-origin: *']")))
wr = [x for x in seen if x.startswith("curl") and re.search(r"-X \w+ --resolve \S+ https://\S+/api/v1/widget/(contact|labels|conv)", x)]
check("verify: PATCH contact, POST labels, POST set_custom_attributes -> 403; GET contact still reaches Chatwoot (404 "
      "without a token); 15 junk-cookie /widget loads cut after the burst",
      "'widget writes': '403 403 403'" in out and [x.split()[9] for x in wr] == ["PATCH", "POST", "POST"]
      and "'contact GET': '404'" in out and "'loads x15': ['404'," in out and out.count("'429']") == 2)
uv = [x.split("https://" + HOST, 1)[1] for x in seen if x.startswith("curl") and "--path-as-is -X POST" in x]
check("verify: 6 upload-route variants (.json, slash, %2E, %2F, //./, storage .json) all 403; storage PUT 403; "
      "events flood cut after the burst", "'upload variants': '403 403 403 403 403 403'" in out and uv == [
          "/api/v1/widget/direct_uploads.json", "/api/v1/widget/direct_uploads/", "/api/v1/widget/direct_uploads%2Ejson",
          "/api/v1/widget%2Fdirect_uploads", "/api/v1//widget/./direct_uploads", "/rails/active_storage/direct_uploads.json"]
      and "'storage PUT': '403'" in out and "'events x15': ['404'," in out and "'429']" in out)
check("lan POST went to the private IP", any("--resolve chat.poolrentalnearme.com:443:%s " % LAN in x for x in seen))
check("edge info printed without a warning", "edge (info): api ['200'] | cf-ray True | cable 101\n" in out)
check("protected files untouched", all(hashlib.md5(open(p, "rb").read()).hexdigest() == m for p, m in keep.items()))
check("no unhandled command", not UNHANDLED)
print("== cw_nginx real: certbot fails")
c, code, out, seen, keep = nginx_case("certfail", False, certbot_rc=1)
check("exit 1, vhost removed, reloaded", code == 1 and not os.path.exists(c + "/sites-enabled/zz-chat-prnm.conf")
      and sum(x.startswith("nginx -t &&") for x in seen) == 2)
print("== cw_nginx real: certbot hangs past its timeout")
c, code, out, seen, keep = nginx_case("certhang", False, certbot_rc=124)
check("exit 1 via the rollback (no traceback), stub vhost removed", code == 1 and "certbot rc 124" in out
      and not os.path.exists(c + "/sites-enabled/zz-chat-prnm.conf"))
print("== cw_nginx real: certbot leaves a change in nginx.conf")
c, code, out, seen, keep = nginx_case("certtouch", False, certbot_touches=True)
check("exit 1, nginx.conf restored byte-for-byte, vhost removed", code == 1
      and all(hashlib.md5(open(p, "rb").read()).hexdigest() == m for p, m in keep.items())
      and not os.path.exists(c + "/sites-enabled/zz-chat-prnm.conf"))
print("== cw_nginx real: vhost verify fails (Chatwoot not answering through TLS)")
c, code, out, seen, keep = nginx_case("verifyfail", False, verify_ok=False, have_cert=True)
check("exit 1, vhost removed, certbot not run (cert existed)", code == 1 and not os.path.exists(
    c + "/sites-enabled/zz-chat-prnm.conf") and not any(x.startswith("certbot") for x in seen))
print("== cw_nginx real: unknown SNI now lands on the chat vhost (the :443 default shifted)")
c, code, out, seen, keep = nginx_case("shift", False, have_cert=True, shift=True)
check("exit 1, rolled back: baseline vs after differ in the cert subject", code == 1 and "subject=CN = " + HOST in out
      and not os.path.exists(c + "/sites-enabled/zz-chat-prnm.conf"))
print("== cw_nginx real: the hairpin arrives from another address than EAST's public IP")
c, code, out, seen, keep = nginx_case("hairpin", False, have_cert=True, hairpin_src="172.18.0.2")
check("exit 1, rolled back, the logged source is printed", code == 1 and "hairpin source logged: ['172.18.0.2']" in out
      and not os.path.exists(c + "/sites-enabled/zz-chat-prnm.conf"))
print("== cw_nginx real: an upload-route variant still reaches Chatwoot (the exact-match bug)")
c, code, out, seen, keep = nginx_case("upv", False, have_cert=True, upv="200")
check("exit 1, rolled back", code == 1 and "FAILED -> restoring" in out
      and not os.path.exists(c + "/sites-enabled/zz-chat-prnm.conf"))
print("== cw_nginx real: widget events are not throttled")
c, code, out, seen, keep = nginx_case("events", False, have_cert=True, events="404 " * 15)
check("exit 1, rolled back", code == 1 and not os.path.exists(c + "/sites-enabled/zz-chat-prnm.conf"))
for nm, kw, why in (("botup", dict(bot_up=True), "the bot already runs: its own 401/404 pass through"),):
    print("== cw_nginx real: " + why)
    c, code, out, seen, keep = nginx_case(nm, False, have_cert=True, **kw)
    check("exit 0 DONE, 'bot POST local': '401', hairpin '404', bot listening: True", code == 0 and "DONE." in out
          and "'bot POST local': '401'" in out and "'bot POST hairpin': '404'" in out and "bot listening: True" in out)
for nm, kw, why in (("bot502", dict(bot_down="502"), "a dead bot gets nginx's 502 (Chatwoot would open the chat silently)"),
                    ("bot504", dict(bot_down="504"), "a hung bot gets 504"),
                    ("botup500", dict(bot_up=True, bot_up_code="500"), "the bot listens but answers 500 (hung)"),
                    ("writes", dict(writes="204"), "a visitor can still write contact / labels / custom attributes"),
                    ("contactget", dict(contact_get="403"), "GET contact is blocked too (the widget needs it)"),
                    ("loads", dict(loads="404 " * 15), "junk-cookie /widget loads are not throttled"),
                    ("w20k", dict(w20k="200"), "a 20 KB widget message still reaches Chatwoot")):
    print("== cw_nginx real: " + why)
    c, code, out, seen, keep = nginx_case(nm, False, have_cert=True, **kw)
    check("exit 1, rolled back", code == 1 and "FAILED -> restoring" in out
          and not os.path.exists(c + "/sites-enabled/zz-chat-prnm.conf"))
print("== cw_nginx real: no cf-ray through the edge while DNS = \"proxied\"")
c, code, out, seen, keep = nginx_case("edge", False, have_cert=True, edge_ray=False)
check("still DONE (origin verified), with a Cloudflare WARN", code == 0 and "WARN: check Cloudflare" in out)


# ------------------------------------------------------------------ cw_status (read-only report)
def status_case(name, alert_gb, public_sdk=SDK):
    c = H + "/status-" + name
    os.makedirs(c, exist_ok=True)
    s = open(REPO + "/cw_status.py").read()
    a = "ALERT_GB = 2.0  #"
    assert s.count(a) == 1
    p = c + "/cw_status.test.py"
    open(p, "w").write(s.replace(a, "ALERT_GB = %r  #" % alert_gb))
    seen = []

    def fake(cmd, shell=True, capture_output=True, text=False, timeout=None, executable=None, input=None):
        seen.append(cmd)
        if not text:
            return cp(0, public_sdk if cmd.endswith("'https://%s/packs/js/sdk.js'" % HOST) else SDK)
        if "docker exec chatwoot-rails-1 env" in cmd:
            return cp(0, GOOD_ENV + "\nSMTP_PASSWORD=hunter2hunter2\nRATE_LIMIT_WIDGET_MESSAGES=20\nRATE_LIMIT_WIDGET_LOAD=20\n"
                      + "".join("%s=%s\n" % kv for kv in AR.items()))
        if "-D -" in cmd and "sdk.js" in cmd:
            return cp(0, "HTTP/2 200\r\naccess-control-allow-origin: *\r\n")
        if "psql" in cmd:
            return cp(0, "(rows)")
        return cp(0, "")

    code, out = execute(p, fake)
    return code, out, seen


print("== cw_status")
code, out, seen = status_case("alert", 10.0 ** 6)
check("runs to the end, read-only (no docker/nginx/systemctl change verbs)", code is None and "== backups:" in out
      and not [x for x in seen if re.search(r"\b(rm|restart|reload|stop|start|up -d|update|insert|delete from)\b", x)])
check("secret values never printed, only set/unset", "hunter2" not in out and "SMTP_PASSWORD set" in out
      and "zzz" not in out and "RATE_LIMIT_WIDGET_MESSAGES=20" in out)
check("disk line with the alert threshold", "DISK ALERT:" in out and "(alert under 1000000.0 GB)" in out)
check("2FA: available with all 3 keys, fingerprint = cw_harden.py's formula, key values never printed; 2FA per user "
      "queried; cookie-less load throttle shown", "2FA available (3 of 3 encryption keys set): True | key fingerprint %s "
      % hashlib.sha256("".join(AR.values()).encode()).hexdigest()[:12] in out and not any(v in out for v in AR.values())
      and any("u.otp_required_for_login" in x for x in seen) and "RATE_LIMIT_WIDGET_LOAD=20" in out)
check("contacts count, D3 label counts, bot-failure opens, reset-token flag, upload limit row are queried",
      all(any(k in x for x in seen) for k in ("from contacts", "'handoff-capped'", "error with the agent bot",
                                              "reset_password_token is not null", "MAXIMUM_FILE_UPLOAD_SIZE")))
check("founder alerts are counted from the bot's @mention notes (visitors can preset labels, not write notes); the "
      "account's 2FA enforcement and keep-pending setting and the vhost's round-3 rules are shown",
      "founder alerts = bot notes that @mention Derek and Brandon" in out and "labels do not prove an alert" in out
      and "last 5 founder alerts" in out and any("settings->>" in x and "enforce_mfa" in x and "keep_pending_on_bot_failure" in x for x in seen)
      and "chat vhost has: load zone False | widget contact/labels read-only False | bot down -> 500 False" in out)
STATUS_SQL = [shlex.split(x)[-1] for x in seen if " psql -U postgres -d chatwoot_production -AtF " in x]
check("D1: container sdk.js SRI printed; :3009 and public copies compared", "container file: %s (%d bytes)" % (SDK_SRI, len(SDK))
      in out and "served on :3009: same | public: same" in out and "need exactly one '*'): ['access-control-allow-origin: *']" in out)
code, out, seen = status_case("ok", 0.0, public_sdk=SDK + b"stale")
check("disk OK below the threshold; a stale public copy is shown with its own SRI", "disk OK:" in out
      and "public: sha384-" in out and "(%d bytes) (a public copy" % (len(SDK) + 5) in out)


def real_pg_status():
    """Every query cw_status.py runs, against the 4.19.1 columns it reads (tests/fixtures/cw_status_schema.sql) in a
    throwaway PostgreSQL 16: they all run, and the founder-alert count ignores visitor-set labels and customer text."""
    bins = "/usr/lib/postgresql/16/bin"
    print("== cw_status queries in a real PostgreSQL (%s)" % bins)
    if not os.path.exists(bins + "/initdb") or os.geteuid() != 0:
        return print("  skip: needs root (to run initdb as ubuntu) and PostgreSQL 16 binaries")
    d = tempfile.mkdtemp(prefix="prnm-pg-status-")
    os.chmod(d, 0o777)
    port = "55438"

    def u(c):
        return real_run(["runuser", "-u", "ubuntu", "--", "bash", "-c", c], capture_output=True, text=True)

    def q(x, db="chatwoot_production"):
        return u("psql -h %s -p %s -U postgres -d %s -v ON_ERROR_STOP=1 -AtF ' | ' -c %s" % (d, port, db, shlex.quote(x)))

    try:
        u("%s/initdb -D %s/data -U postgres --auth=trust >/dev/null" % (bins, d))
        u("%s/pg_ctl -D %s/data -o \"-k %s -p %s -c listen_addresses=''\" -w start >/dev/null" % (bins, d, d, port))
        q("create database chatwoot_production", "postgres")
        r = q(open(os.path.join(REPO, "tests", "fixtures", "cw_status_schema.sql")).read())
        ago = "now() - interval '%s'"
        r2 = q("insert into conversations (display_id, status, priority, created_at) values (1, 2, 3, now()), (2, 0, null, "
               "now()), (3, 0, null, now() - interval '3 days'); insert into tags (name) values ('handoff'), ('urgent'); "
               "insert into taggings (tag_id, taggable_type, taggable_id, context, created_at) values (1, 'Conversation', 1, "
               "'labels', now()), (2, 'Conversation', 1, 'labels', now()); insert into messages (content, conversation_id, "
               "message_type, private, sender_type, created_at) values ('see [@x](mention://user/1/x)', 1, 0, false, "
               "'Contact', now()), ('Handoff [@Derek Bowen](mention://user/1/Derek%%20Bowen)', 2, 1, true, 'AgentBot', %s), "
               "('Already flagged earlier in this chat', 2, 1, true, 'AgentBot', now()), ('[@Brandon Elias]"
               "(mention://user/2/Brandon%%20Elias)', 3, 1, true, 'AgentBot', %s)" % (ago % "2 hours", ago % "3 days"))
        res = [q(x) for x in STATUS_SQL]
        bad = [(x[:60], r.stderr.strip()[-160:]) for x, r in zip(STATUS_SQL, res) if r.returncode or r.stderr.strip()]
        n = open(REPO + "/cw_status.py").read().count("\nsql(")
        check("all %d cw_status.py queries (of %d) run on the 4.19.1 columns%s" % (len(STATUS_SQL), n, (": %s" % bad) if bad
              else ""), r.returncode == r2.returncode == 0 and len(STATUS_SQL) == n > 15 and not bad)
        row = dict(zip(STATUS_SQL, (x.stdout.strip() for x in res)))
        al = [v for k, v in row.items() if "count(distinct conversation_id)" in k]
        last = [v for k, v in row.items() if "group by c.id order by 2 desc limit 5" in k]
        check("founder alerts: 1 in 24 h, 2 in 7 d, 2 notes in 2 chats; the visitor-labelled chat 1 and its customer "
              "text with mention markup are not counted (%s; last alerts %s)" % (al, last),
              al == ["1 | 2 | 2 | 2"] and last and [x.split(" | ")[0] for x in last[0].splitlines()] == ["2", "3"])
    finally:
        u("%s/pg_ctl -D %s/data -m immediate -w stop >/dev/null 2>&1" % (bins, d))
        shutil.rmtree(d, ignore_errors=True)


real_pg_status()


# ------------------------------------------------------------------ the vhost itself, in a real local nginx
class Up(BaseHTTPRequestHandler):  # fake Chatwoot (rack-cors style ACAO on /packs) and fake bot (401 unless signed)
    seen = []
    fired = []  # webhooks fake Chatwoot posted for widget events (AgentBotListener#webwidget_triggered), with status
    hook = None  # (port, ssl context): where fake Chatwoot posts them, by the hairpin source 127.0.0.3
    hang = 0  # seconds the fake bot sleeps before answering a POST (a hung bot)

    def log_message(self, *a):
        pass

    def handle_one(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n:
            self.rfile.read(n)
        Up.seen.append({"port": self.server.server_port, "path": self.path, "h": {k.lower(): v for k, v in self.headers.items()}})
        bot = self.server.server_port == BOT_PORT
        if bot and self.command == "POST" and Up.hang:
            time.sleep(Up.hang)
        if not bot and self.command == "POST" and self.path.startswith("/api/v1/widget/events") and Up.hook:
            try:  # one agent-bot webhook per widget event, as Chatwoot does
                w = http.client.HTTPSConnection("127.0.0.1", Up.hook[0], context=Up.hook[1], timeout=10,
                                                source_address=("127.0.0.3", 0))
                w.request("POST", "/prnm-bot/webhook", b'{"event":"webwidget_triggered"}', {"Host": HOST})
                Up.fired.append(w.getresponse().status)
                w.close()
            except OSError:
                Up.fired.append(0)
        self.send_response((200 if self.headers.get("X-Chatwoot-Signature") else 401) if bot and self.command == "POST" else 200)
        if self.path.startswith("/packs/") and self.headers.get("Origin"):
            self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", "2")
        try:
            self.end_headers()
            self.wfile.write(b"ok")
        except (BrokenPipeError, ConnectionResetError):  # the hung-bot case: nginx gave up at 3 s
            pass

    do_GET = do_POST = do_PUT = do_PATCH = handle_one


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


BOT_PORT = None


def old_limits(v):  # round 1: one 30r/s bot bucket, no per-visitor zones, no bot-down mapping (the controls)
    v = v.replace("rate=300r/s", "rate=30r/s").replace("burst=600", "burst=60")
    v = v.replace("        error_page 502 503 504 =500 @prnm_bot_down;\n", "")
    return re.sub(r"\n *limit_req zone=prnm_w\w+ burst=\d+ nodelay;", "", v)


def real_nginx():
    global BOT_PORT
    print("== the generated vhost in a real nginx (%s)" % (shutil.which("nginx") or "missing"))
    if not shutil.which("nginx") or not shutil.which("openssl"):
        return print("  skip: no nginx/openssl binary")
    ns = {}
    exec(open(REPO + "/cw_nginx.py").read().split("\n\ndef sh(", 1)[0], ns)  # constants only; nothing runs
    d = tempfile.mkdtemp(prefix="prnm-nginx-real-")
    os.chmod(d, 0o755)
    for x in ("tmp", "tmp2", "tmp3", "tmp4", "tmp5"):
        os.makedirs(d + "/" + x)
        os.chmod(d + "/" + x, 0o777)
    real_run("openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=%s -keyout %s/k.pem -out %s/c.pem" % (HOST, d, d),
             shell=True, capture_output=True)
    up, BOT_PORT, p80, p443 = free_port(), free_port(), free_port(), free_port()
    v = ns["FULL"].replace("listen 80;", "listen 127.0.0.1:%d;" % p80).replace("listen 443 ssl;", "listen 127.0.0.1:%d ssl;" % p443)
    v = v.replace("/etc/letsencrypt/live/%s/fullchain.pem" % HOST, d + "/c.pem").replace(
        "/etc/letsencrypt/live/%s/privkey.pem" % HOST, d + "/k.pem")
    v = v.replace("    include /etc/letsencrypt/options-ssl-nginx.conf;\n", "").replace(
        "    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;\n", "")
    v = v.replace("127.0.0.1:3009", "127.0.0.1:%d" % up).replace("127.0.0.1:3120/", "127.0.0.1:%d/" % BOT_PORT)
    v = v.replace("allow %s;" % ns["EAST_IP"], "allow 127.0.0.3;")  # stands in for EAST's public IP (hairpin source)
    open(d + "/vhost.conf", "w").write(v)
    open(d + "/nginx.conf", "w").write(
        "pid %(d)s/nginx.pid;\nerror_log %(d)s/error.log;\nevents { worker_connections 512; }\nhttp {\n"
        " access_log %(d)s/access.log;\n client_body_temp_path %(d)s/tmp;\n proxy_temp_path %(d)s/tmp2;\n"
        " fastcgi_temp_path %(d)s/tmp3;\n uwsgi_temp_path %(d)s/tmp4;\n scgi_temp_path %(d)s/tmp5;\n"
        " include %(d)s/vhost.conf;\n}\n" % {"d": d})
    ngx = ["nginx", "-p", d + "/", "-c", d + "/nginx.conf", "-e", d + "/error.log"]
    r = real_run(ngx[:1] + ["-t"] + ngx[1:], capture_output=True, text=True)
    check("nginx -t accepts the vhost (http-level map + limit_req_zone in the included file)", r.returncode == 0)
    if r.returncode:
        return print(r.stderr[-800:])
    def serve(port):
        srv = ThreadingHTTPServer(("127.0.0.1", port), Up)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        return srv

    def bot_down():  # nothing listens on the bot port any more (pm2 restart, crash)
        servers[1].shutdown()
        servers[1].server_close()

    servers = [serve(up), serve(BOT_PORT)]
    ctx = ssl._create_unverified_context()
    Up.hook = (p443, ctx)

    def start():
        real_run(ngx, capture_output=True)
        time.sleep(0.5)

    def stop():
        real_run(ngx + ["-s", "stop"], capture_output=True)
        time.sleep(0.5)

    def req(method, path, body=None, headers=None, src="127.0.0.1"):
        c = http.client.HTTPSConnection("127.0.0.1", p443, context=ctx, timeout=10, source_address=(src, 0))
        c.request(method, path, body=body, headers=dict({"Host": HOST}, **(headers or {})))
        r = c.getresponse()
        r.read()
        c.close()
        return r.status, r.getheaders()

    def last(path):
        return [x for x in Up.seen if x["path"] == path][-1]["h"]

    def flood(secs=1.5):  # junk widget events from 2 visitors (4 threads each) while Chatwoot posts real webhooks
        n0, res, sig, end = len(Up.fired), [], [], time.time() + secs

        def visitor(src):
            c = None
            while time.time() < end:
                try:
                    c = c or http.client.HTTPSConnection("127.0.0.1", p443, context=ctx, timeout=10, source_address=(src, 0))
                    c.request("POST", "/api/v1/widget/events?website_token=x", b'{"name":"webwidget.triggered"}',
                              {"Host": HOST, "Content-Type": "application/json"})
                    r = c.getresponse()
                    r.read()
                    res.append(r.status)
                    if r.will_close:
                        c = c.close()
                except (OSError, http.client.HTTPException):
                    res.append(0)
                    c = None

        ts = [threading.Thread(target=visitor, args=(s,)) for s in ("127.0.0.21", "127.0.0.22") for _ in range(4)]
        for t in ts:
            t.start()
        while time.time() < end - 0.1:  # signed message_created webhooks by the hairpin, all during the flood
            sig.append(req("POST", "/prnm-bot/webhook", b'{"event":"message_created"}',
                           {"X-Chatwoot-Signature": "sha256=x"}, src="127.0.0.3")[0])
            time.sleep(0.02)
        for t in ts:
            t.join()
        return res, sig, Up.fired[n0:]

    start()
    try:
        st, _ = req("GET", "/api")
        h = last("/api")
        check("/ proxies with Host, X-Forwarded-Proto https, X-Forwarded-For = client, Connection close",
              st == 200 and h.get("host") == HOST and h.get("x-forwarded-proto") == "https"
              and h.get("x-forwarded-for") == "127.0.0.1" and h.get("connection") == "close")
        st, _ = req("GET", "/cable", headers={"Upgrade": "websocket", "Connection": "Upgrade"})
        h = last("/cable")
        check("/cable passes the websocket upgrade", h.get("upgrade") == "websocket" and h.get("connection") == "upgrade")
        for o in ({"Origin": "https://www.poolrentalnearme.com"}, {}):
            st, hd = req("GET", "/packs/js/sdk.js?v=NMOiMrdT", headers=o)
            acao = [v for k, v in hd if k.lower() == "access-control-allow-origin"]
            check("sdk.js: exactly one ACAO '*' %s (upstream's hidden, nginx's added)" % ("with Origin" if o else
                  "without Origin (what a cache may keep)"), st == 200 and acao == ["*"])
        check("no files from visitors: widget direct_uploads, bare direct_uploads, multipart widget message -> 403",
              req("POST", "/api/v1/widget/direct_uploads", b"{}")[0] == req("POST", "/rails/active_storage/direct_uploads", b"{}")[0]
              == req("POST", "/api/v1/widget/messages?website_token=x", b"--b\r\n", {"Content-Type": "multipart/form-data; boundary=b"})[0] == 403)
        upv = ["/api/v1/widget/direct_uploads.json", "/api/v1/widget/direct_uploads/", "/api/v1/widget/direct_uploads%2Ejson",
               "/api/v1/widget%2Fdirect_uploads", "/api/v1//widget/./direct_uploads", "/api/v1/widget/x/../direct_uploads",
               "/api/v1/widget/direct_uploads%2F", "/api/v1/widget/direct_uploads?website_token=x",
               "/rails/active_storage/direct_uploads.json", "/rails/active_storage/direct_uploads/",
               "/rails/active_storage%2Fdirect_uploads", "/rails//active_storage/direct_uploads%2Ejson"]
        got = [req("POST", p, b"{}", {"Content-Type": "application/json"})[0] for p in upv]
        check("every Rails-routable variant of both upload routes -> 403, none reaches Chatwoot: %s" % sorted(set(got)),
              got == [403] * len(upv) and not [x for x in Up.seen if "direct_uploads" in x["path"]])
        check("widget JSON 20 KB -> 413 (16k: the bot reads 1,500 chars), 15 KB -> proxied; message update the same",
              req("POST", "/api/v1/widget/messages", b"x" * 20000, {"Content-Type": "application/json"})[0] == 413
              and req("POST", "/api/v1/widget/messages", b"x" * 15000, {"Content-Type": "application/json"})[0] == 200
              and req("PATCH", "/api/v1/widget/messages/9", b"x" * 20000, src="127.0.0.11")[0] == 413
              and req("POST", "/api/v1/widget/conversations", b"x" * 20000)[0] == 413)
        n0 = len(Up.seen)
        check("active storage: PUT 1.1 MB -> 413, PUT 100 KB / POST -> 403 (never proxied), GET disk + blob -> proxied",
              req("PUT", "/rails/active_storage/disk/k/f", b"x" * 1100000)[0] == 413
              and req("PUT", "/rails/active_storage/disk/k", b"x" * 100000)[0] == 403
              and req("PUT", "/rails/active_storage/disk%2Fk", b"x")[0] == 403
              and req("POST", "/rails/active_storage/disk/k", b"x")[0] == 403
              and req("GET", "/rails/active_storage/disk/k/f.png")[0] == 200
              and req("GET", "/rails/active_storage/blobs/redirect/a/b.png")[0] == 200
              and [x["path"] for x in Up.seen[n0:]] == ["/rails/active_storage/disk/k/f.png",
                                                       "/rails/active_storage/blobs/redirect/a/b.png"])
        check("dashboard path: 5 MB proxied, 11 MB -> 413", req("POST", "/api/v1/accounts/1/conversations/1/messages",
              b"x" * 5000000)[0] == 200 and req("POST", "/api/v1/accounts/1/conversations/1/messages", b"x" * 11000000)[0] == 413)
        check("super_admin, monitoring, installation -> 404", req("GET", "/super_admin")[0] == req("GET", "/monitoring/sidekiq")[0]
              == req("GET", "/installation/onboarding")[0] == 404)
        st = req("POST", "/prnm-bot/webhook", b"{}")[0]
        check("bot: POST from 127.0.0.1 reaches the bot at /webhook", st == 401 and last("/webhook"))
        check("bot: POST from the stand-in EAST IP reaches it", req("POST", "/prnm-bot/webhook", b"{}", src="127.0.0.3")[0] == 401)
        check("bot: POST from any other address -> 403", req("POST", "/prnm-bot/webhook", b"{}", src="127.0.0.2")[0] == 403)
        check("bot: GET -> 403", req("GET", "/prnm-bot/healthz")[0] == 403)
        check("bot: body over 1 MB -> 413", req("POST", "/prnm-bot/webhook", b"x" * 1100000)[0] == 413)
        codes = [req("POST", "/prnm-bot/webhook", b"{}", src="127.0.0.3")[0] for _ in range(150)]
        check("bot: 150 back-to-back webhooks all reach the bot (the zone is only a runaway ceiling)", codes == [401] * 150)
        ev = [req("POST", "/api/v1/widget/events.json", b"{}", src="127.0.0.5")[0] for _ in range(15)]
        check("widget events: one visitor gets 10 + 1, then 429 (%s)" % ev, 429 not in ev[:10] and ev[-1] == 429)
        check("widget events: another visitor is not affected", req("POST", "/api/v1/widget/events", b"{}", src="127.0.0.6")[0] == 200)
        n0 = len(Up.seen)
        wr = [("PATCH", "/api/v1/widget/contact"), ("PUT", "/api/v1/widget/contact"), ("PATCH", "/api/v1/widget/contact.json"),
              ("PATCH", "/api/v1/widget/contact/set_user"), ("POST", "/api/v1/widget/contact/destroy_custom_attributes"),
              ("POST", "/api/v1/widget/contact?_method=PATCH"), ("PATCH", "/api/v1/widget//contact"),
              ("PATCH", "/api/v1/widget/%63ontact"), ("PATCH", "/api/v1//widget/./contact"),
              ("PATCH", "/api/v1/widget/x/../contact?website_token=x"), ("POST", "/api/v1/widget/labels"),
              ("POST", "/api/v1/widget/labels.json"), ("DELETE", "/api/v1/widget/labels/urgent"),
              ("POST", "/api/v1/widget/%6Cabels"), ("POST", "/api/v1/widget/conversations/set_custom_attributes"),
              ("POST", "/api/v1/widget/conversations/set_custom_attributes/"),
              ("POST", "/api/v1/widget/conversations/destroy_custom_attributes.json")]
        got = [req(m, x, b'{"avatar_url":"https://example.com/15mb.png","label":"handoff"}',
                   {"Content-Type": "application/json"}, src="127.0.0.7")[0] for m, x in wr]
        check("visitor writes (contact avatar_url/set_user, labels add/remove, chat attributes; encoded, //, ./, ../, "
              "_method variants) -> 403, none reaches Chatwoot: %s" % sorted(set(got)),
              got == [403] * len(wr) and len(Up.seen) == n0)
        check("GET contact (what the widget itself calls) still reaches Chatwoot",
              req("GET", "/api/v1/widget/contact?website_token=x", src="127.0.0.7")[0] == 200
              and Up.seen[-1]["path"] == "/api/v1/widget/contact?website_token=x")
        mu = [req("PATCH", "/api/v1/widget/messages/12.json", b"{}", src="127.0.0.10")[0] for _ in range(15)]
        check("message update (a webhook amplifier) is throttled like events (%s)" % mu, 429 not in mu[:10] and mu[-1] == 429)
        ld = [req("GET", ("/widget?website_token=t&cw_conversation=junk", "/widget.json?cw_conversation=x", "/widget/",
                          "/%77idget?x=1")[i % 4], src="127.0.0.12")[0] for i in range(15)]
        check("/widget loads with a junk cw_conversation (each would make a contact; Rack::Attack skips them): one "
              "visitor 10 + 1, then 429, whatever the spelling (%s)" % ld, 429 not in ld[:11] and ld[11:] == [429] * 4)
        check("... another visitor still loads it; /widget_tests and /widgets are not in that zone",
              req("GET", "/widget?website_token=t", src="127.0.0.13")[0] == 200
              and [req("GET", x, src="127.0.0.12")[0] for x in ("/widget_tests", "/widgets", "/widgetx")] == [200] * 3)
        wg = [req("GET", "/api/v1/widget/messages?website_token=x", src="127.0.0.9")[0] for _ in range(100)]
        check("widget API: a page's 40-call burst passes, a scripted 100 is cut (%d x 429)" % wg.count(429),
              429 not in wg[:40] and wg.count(429) > 10)
        res, sig, fired = flood()
        check("junk-event flood from 2 visitors for 1.5 s: cut at the visitor edge (%d of %d events passed, %d webhooks "
              "fired)" % (res.count(200), len(res), len(fired)), res.count(429) > 0.8 * len(res) > 200
              and len(fired) < 40 and 429 not in fired)
        check("... and all %d signed message_created webhooks sent meanwhile reach the bot (no 429)" % len(sig),
              len(sig) >= 20 and sig == [200] * len(sig))
        c80 = http.client.HTTPConnection("127.0.0.1", p80, timeout=5)
        c80.request("GET", "/x?y=1", headers={"Host": HOST})
        r80 = c80.getresponse()
        check(":80 -> 301 https", r80.status == 301 and r80.getheader("Location") == "https://%s/x?y=1" % HOST)
        Up.hang = 4
        t0 = time.time()
        st = req("POST", "/prnm-bot/webhook", b"{}", {"X-Chatwoot-Signature": "sha256=x"}, src="127.0.0.3")[0]
        el = time.time() - t0
        Up.hang = 0
        check("bot hung: nginx gives up at 3 s (< Chatwoot's 5 s) and answers 500, which Chatwoot retries (%d in %.1f s)"
              % (st, el), st == 500 and 2.5 < el < 4.5)
        bot_down()
        dn = [req("POST", "/prnm-bot/webhook", b"{}", src=x)[0] for x in ("127.0.0.3", "127.0.0.1", "127.0.0.2")]
        check("bot down (restart, crash): hairpin and local POST -> 500, not 502; other addresses still 403 (%s)" % dn,
              dn == [500, 500, 403])
        servers[1] = serve(BOT_PORT)
        check("bot back: the next webhook reaches it", req("POST", "/prnm-bot/webhook", b"{}", src="127.0.0.3")[0] == 401)
    finally:
        stop()
    open(d + "/vhost.conf", "w").write(old_limits(v))
    start()
    try:
        res, sig, fired = flood()
        check("control, round-1 limits (30r/s bot bucket, no visitor zones): the same flood (%d events, %d webhooks) "
              "429s %d of %d real webhooks" % (len(res), len(fired), sig.count(429), len(sig)),
              sig.count(429) > 0 and 429 not in res)
        time.sleep(2.1)  # let the 30r/s bot bucket drain
        bot_down()
        st = req("POST", "/prnm-bot/webhook", b"{}", src="127.0.0.3")[0]
        check("control, no error_page mapping: the same dead bot gives 502 (Chatwoot: no retry, chat opened silently)",
              st == 502)
    finally:
        stop()
        for srv in servers:
            srv.shutdown()
        shutil.rmtree(d, ignore_errors=True)


real_nginx()
print("\nharness:", "ALL OK" if not fails else "%d FAIL(S)" % fails)
sys.exit(1 if fails else 0)
