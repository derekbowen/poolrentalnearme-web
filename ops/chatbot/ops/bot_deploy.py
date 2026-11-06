"""EAST: install/upgrade the PRNM chatbot as pm2 "chatbot" on 127.0.0.1:3120 (ops/chatbot/ops/README.md).
Pinned manifest + per-file sha256, tests on the box, atomic current/ swap, health checks, rollback.
DRY=True: fetch, verify and run the tests in a temp dir only.
"""
import hashlib, hmac, json, os, pwd, re, shlex, shutil, subprocess, sys, tempfile, time, urllib.request

DRY = True
SHA = "REPLACE_WITH_COMMIT"           # commit holding ops/chatbot; fill both with pin_bot.py
MANIFEST_SUM = "REPLACE_WITH_SHA256"  # sha256 of ops/chatbot/ops/bot_manifest.sha256 at SHA
RAW = "https://raw.githubusercontent.com/derekbowen/poolrentalnearme-web/%s/ops/chatbot/" % SHA
B = "/home/ubuntu/chatbot"
ENVF = B + "/.env"
PORT = "3120"
NEED = ("CHATWOOT_BOT_TOKEN", "CHATWOOT_WEBHOOK_SECRET", "CHATWOOT_ACCOUNT_ID", "CHATWOOT_DEREK_USER_ID",
        "CHATWOOT_BRANDON_USER_ID")
PM2 = 'env -i HOME=/home/ubuntu PATH="$PATH" PM2_HOME=/home/ubuntu/.pm2 pm2 '  # no secrets reach dump.pm2


def sh(c, t=300):
    r = subprocess.run(c, shell=True, capture_output=True, text=True, timeout=t, executable="/bin/bash")
    return r.returncode, (r.stdout + r.stderr).strip()


def ub(c, t=300):  # cd: pm2 must not inherit an unreadable cwd
    return sh("cd /home/ubuntu && sudo -u ubuntu bash -lc " + shlex.quote(c), t)


def get(p):
    return urllib.request.urlopen(RAW + p, timeout=60).read()


def curl(a):
    return sh("curl -s -o /dev/null -w '%%{http_code}' -m 5 %s" % a)[1]


if "REPLACE" in SHA + MANIFEST_SUM:
    sys.exit("refusing: SHA/MANIFEST_SUM not filled in (pin_bot.py)")
man = get("ops/bot_manifest.sha256")
if hashlib.sha256(man).hexdigest() != MANIFEST_SUM:
    sys.exit("ABORT: manifest sha256 mismatch")
files = {}
for line in man.decode().splitlines():
    s, p = line.split("  ", 1)
    if not re.match(r"[A-Za-z0-9_][A-Za-z0-9_./-]*$", p) or ".." in p or p.startswith(("ops/", "data/")):
        sys.exit("ABORT: bad path %r" % p)
    files[p] = get(p)
    if hashlib.sha256(files[p]).hexdigest() != s:
        sys.exit("ABORT: sha256 mismatch on " + p)
pkg = json.loads(files.get("package.json", b"{}"))
entry, test = pkg.get("main"), (pkg.get("scripts") or {}).get("test")
bad = [] if entry in files and test else ['package.json needs "main" (a listed file) and scripts.test']
if pkg.get("dependencies"):
    bad.append("bot must have no dependencies")
env = {}
if os.path.exists(ENVF):
    st = os.stat(ENVF)
    env = dict(x.split("=", 1) for x in open(ENVF).read().splitlines() if "=" in x and x[0] != "#")
    if st.st_mode & 0o077 or st.st_uid != pwd.getpwnam("ubuntu").pw_uid:
        bad.append(ENVF + " not 600/ubuntu")
miss = [k for k in NEED if not env.get(k)]
if miss or env.get("HOST") != "127.0.0.1" or env.get("PORT") != PORT:
    bad.append("%s: missing %s or HOST:PORT not 127.0.0.1:%s" % (ENVF, miss, PORT))
nv = ub("node -v")[1]  # --env-file needs >= 20.6 (EAST: v20.20.2)
cur = os.path.realpath(B + "/current") if os.path.islink(B + "/current") else None
print("%d files %s | %s | %r | node %s | current %s | :%s %s" % (
    len(files), SHA[:12], entry, test, nv, cur, PORT, sh("ss -ltnH 'sport = :%s'" % PORT)[1] or "free"))


def stage(d):
    for p, data in files.items():
        os.makedirs(os.path.dirname(os.path.join(d, p)), exist_ok=True)
        with open(os.path.join(d, p), "wb") as f:
            f.write(data)
    sh("chown -R ubuntu:ubuntu %s && chmod -R go-w %s" % (d, d))


def tests(d):  # no .env: tests need no secrets
    rc, o = ub('cd %s && env -i HOME=/home/ubuntu PATH="$PATH" NODE_ENV=test %s' % (d, test), 280)
    print("tests rc", rc, o[-1200:])
    return rc == 0


if bad:
    sys.exit("ABORT, nothing changed: " + "; ".join(bad))
if DRY:
    tmp = tempfile.mkdtemp(prefix="prnm-chatbot-dry-")
    os.chmod(tmp, 0o755)
    try:
        stage(tmp)
        ok = tests(tmp)
    finally:
        shutil.rmtree(tmp)
    sys.exit("DRY RUN: tests %s; nothing changed" % ("passed" if ok else "FAILED"))

REL = "%s/releases/%s-%s" % (B, time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()), SHA[:12])
os.makedirs(REL)
stage(REL)
if not tests(REL):
    shutil.rmtree(REL)
    sys.exit("ABORT: tests failed on the box; release removed")
shutil.rmtree(REL + "/data", ignore_errors=True)
os.symlink(B + "/data", REL + "/data")  # logs and drafts outlive releases


def point(t):
    sh("ln -sfn {0} {1}/cur.tmp && chown -h ubuntu:ubuntu {1}/cur.tmp && mv -T {1}/cur.tmp {1}/current".format(t, B))


def start():
    ub(PM2 + "delete chatbot")
    rc, o = ub(PM2 + "start %s/current/%s --name chatbot --cwd %s/current --node-args=--env-file=%s "
               "--max-memory-restart 200M --time && %ssave" % (B, entry, B, ENVF, PM2))
    sh("chmod 600 /home/ubuntu/.pm2/dump.pm2")
    print("pm2 rc", rc, o[-300:])
    time.sleep(6)


def healthy():
    lis = sh("ss -ltnH 'sport = :%s'" % PORT)[1].split()[3:4]
    body, ts = '{"event":"prnm_deploy_check"}', str(int(time.time()))
    sig = hmac.new(env["CHATWOOT_WEBHOOK_SECRET"].encode(), (ts + "." + body).encode(), "sha256").hexdigest()
    hz = curl("http://127.0.0.1:%s/healthz" % PORT)
    signed = curl("-H 'Content-Type: application/json' -H 'X-Chatwoot-Timestamp: %s' -H 'X-Chatwoot-Signature: "
                  "sha256=%s' -H 'X-Chatwoot-Delivery: prnm-deploy-%s' -d '%s' http://127.0.0.1:%s/webhook"
                  % (ts, sig, ts, body, PORT))
    unsigned = curl("-d '%s' http://127.0.0.1:%s/webhook" % (body, PORT))
    leak = env["CHATWOOT_BOT_TOKEN"] in open("/home/ubuntu/.pm2/dump.pm2", errors="replace").read()
    j = ub(PM2 + "jlist")[1]
    st = [(p["pm2_env"]["status"], p["pm2_env"]["restart_time"]) for p in json.loads(j.splitlines()[-1])
          if p["name"] == "chatbot"]
    print("healthz", hz, lis, "| signed", signed, "unsigned", unsigned, "| leak", leak, st)
    ok = hz == "200" and lis == ["127.0.0.1:" + PORT] and signed[:1] == "2" and unsigned in ("401", "403")
    ok = ok and not leak and st[:1] and st[0][0] == "online"
    if ok and os.path.exists("/etc/nginx/sites-enabled/chat-prnm.conf"):
        # Chatwoot's own path: sidekiq -> public IP (extra_hosts) -> nginx -> bot; unsigned must be refused
        rb = ("require 'net/http'; puts Net::HTTP.post(URI('https://chat.poolrentalnearme.com/prnm-bot/webhook'), "
              "'{}', 'Content-Type' => 'application/json').code")
        via = sh("docker exec chatwoot-sidekiq-1 ruby -e " + shlex.quote(rb), 60)[1][-3:]
        print("sidekiq->nginx->bot unsigned:", via)
        ok = via in ("401", "403")
    return ok


point(REL)
start()
if healthy():
    for old in sorted(os.listdir(B + "/releases"))[:-3]:
        if os.path.join(B, "releases", old) != cur:
            shutil.rmtree(os.path.join(B, "releases", old))
    print("DONE. current ->", REL)
    sys.exit(0)
print("FAILED -> rolling back to", cur)
if cur:
    point(cur)
    start()
    print("previous release healthy:", healthy())
else:
    ub(PM2 + "delete chatbot && %ssave" % PM2)
    os.remove(B + "/current")
shutil.rmtree(REL)
sys.exit(1)
