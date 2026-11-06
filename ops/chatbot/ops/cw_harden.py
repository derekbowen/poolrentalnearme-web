"""EAST: harden self-hosted Chatwoot before it is public (ops/chatbot/ops/README.md).
DRY=True: read-only. DRY=False: backup, pull, rewrite the md5-gated compose (secrets and the new 2FA encryption keys go
to mode-600 env files), migrate (rails+sidekiq stopped), up -d, verify; any failure restores the compose and, after a
migration, the DB from the fresh pg_dump.
Long run (pull ~750 MB + 46 migrations): RUNNER_TIMEOUT below; start it in the background.
"""
import base64, hashlib, json, os, re, secrets, string, subprocess, sys, time
import yaml

DRY = True
RUNNER_TIMEOUT = 5400  # a ceiling: the change window (migrate, up, verify, rollback) needs < RESERVE of it
RESERVE = 4000  # refuse to start the change with less than this left of the runner budget
IMAGE = "ce"  # "ce": official CE 4.19.1 (security fixes since 4.16.2, see README); "running": pin the running 4.16.2 EE
CE = "chatwoot/chatwoot:v4.19.1-ce@sha256:04895c7bd0550d9e74b45b7202787b56f7ee4e891ebbde0c429c8c32901b97cf"
CE_SRI = "sha384-NMOiMrdTUxTmFY1l+sFGdJGBULpsENmHiq+1biXcN6oREUhlYB9ij9AFbm5/I3Xr"  # its public/packs/js/sdk.js
FROM_V, FROM_SCHEMA = "4.16.2", "20260718000000"  # what runs now
CE_V, CE_SCHEMA = "4.19.1", "20261019143116"  # after db:chatwoot_prepare
WANT = CE_V if IMAGE == "ce" else FROM_V
D = "/home/ubuntu/chatwoot"
CF = D + "/docker-compose.yml"
CF_MD5 = "c9e8f0054a9503299ebdd27ecd694b34"
HOST = "chat.poolrentalnearme.com"
EXPECT_IP = "3.222.110.146"  # cross-check only; the IP written is read from instance metadata
# Widget throttles (Rack::Attack, free), lowered from the 4.19.1 defaults. They do NOT restore 4.16.2: it allowed 6
# conversations per 12 h and 5 cookie-less /widget loads (each makes a contact) per hour per IP; 4.17+ counts
# conversations per minute (2/min = 1440 per 12 h) and loads 200/h. The engine's D3 caps and nginx do the rest.
SET = {"ENABLE_ACCOUNT_SIGNUP": "false", "FRONTEND_URL": "https://" + HOST, "FORCE_SSL": "true",
       "ENABLE_PUSH_RELAY_SERVER": "true", "DISABLE_TELEMETRY": "true", "RATE_LIMIT_WIDGET_CONVERSATIONS": "2",
       "RATE_LIMIT_WIDGET_MESSAGES": "20", "RATE_LIMIT_WIDGET_LOAD": "20"}
# 2FA needs all three on rails + sidekiq (config/application.rb). Generated on the box (32 alphanumerics, as
# `rails db:encryption:init`), only into the mode-600 .env, never printed; never regenerated if present.
AR = ("ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY", "ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY",
      "ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT")
API = "curl -s -m 10 -H 'X-Forwarded-Proto: https' http://127.0.0.1:3009/api"
PSQL = "docker exec chatwoot-postgres-1 psql -U postgres -d %s -Atc "
SCHEMA = PSQL % "chatwoot_production" + "'select max(version) from schema_migrations'"


def sh(c, t=120):
    try:
        r = subprocess.run(c, shell=True, capture_output=True, text=True, timeout=t, executable="/bin/bash")
    except subprocess.TimeoutExpired:
        return 124, "TIMEOUT after %d s" % t
    return r.returncode, (r.stdout + r.stderr).strip()


def q(c, t=120):
    return sh(c, t)[1]


def api():
    try:
        return json.loads(q(API))
    except ValueError:
        return {}


def free_gb():
    vfs = os.statvfs("/var/lib/docker")
    return vfs.f_bavail * vfs.f_frsize / 2**30


T0 = time.time()
raw = open(CF, "rb").read()
bad = [] if hashlib.md5(raw).hexdigest() == CF_MD5 else ["drift: compose md5 " + hashlib.md5(raw).hexdigest()]
S = yaml.safe_load(raw)["services"]
env = dict(S["rails"]["environment"])
pgenv = dict(S["postgres"]["environment"])
if sorted(S) != ["postgres", "rails", "redis", "sidekiq"] or S["sidekiq"]["environment"] != env:
    bad.append("unexpected services, or rails/sidekiq env differ")
if any(c in str(v) for v in list(env.values()) + list(pgenv.values()) for c in "'\n$#"):
    bad.append("an env value contains a quote/newline/$/#")
if "SAFE_FETCH_ALLOW_PRIVATE_NETWORK" in env:
    bad.append("SAFE_FETCH_ALLOW_PRIVATE_NETWORK is set (SSRF filter must stay on)")
have_ar = [k for k in AR if env.get(k)]
if have_ar and len(have_ar) < 3:
    bad.append("only %s of the 2FA encryption keys set: fix by hand, never regenerate" % have_ar)
bad += [f + " already exists" for f in (".env", "postgres.env") if os.path.exists(D + "/" + f)]
tok = q("curl -s -m 3 -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60'")
ip = q("curl -s -m 3 -H 'X-aws-ec2-metadata-token: %s' http://169.254.169.254/latest/meta-data/public-ipv4" % tok)
if ip != EXPECT_IP:
    bad.append("IMDS public IPv4 %r, expected %s" % (ip[:40], EXPECT_IP))
pins = {}
for svc in ("postgres", "redis", "rails"):
    rd = json.loads(q("docker image inspect %s --format '{{json .RepoDigests}}'" % S[svc]["image"]) or "null") or []
    run = q("docker inspect chatwoot-%s-1 --format '{{.Image}}'" % svc)
    if len(rd) == 1 and rd[0].endswith("@" + run):
        pins[svc] = rd[0]
    else:
        bad.append("%s runs %s, not the single digest of %s %s" % (svc, run, S[svc]["image"], rd))
if api().get("version") != FROM_V:
    bad.append("Chatwoot API not healthy on 127.0.0.1:3009 (or not %s)" % FROM_V)
schema = q(SCHEMA)
if schema != FROM_SCHEMA:
    bad.append("schema_migrations max %r, expected %s (4.16.2)" % (schema[:40], FROM_SCHEMA))
gb = free_gb()
if IMAGE not in ("ce", "running") or (IMAGE == "ce" and gb < 4.0):
    bad.append("IMAGE=%r (ce needs >= 4.0 GB free, have %.1f)" % (IMAGE, gb))

new = yaml.safe_load(raw)
N = new["services"]
img = CE if IMAGE == "ce" else pins.get("rails")
for s in ("rails", "sidekiq"):
    del N[s]["environment"]
    N[s].update(image=img, env_file=[".env"], extra_hosts=["%s:%s" % (HOST, ip)])
del N["postgres"]["environment"]
N["postgres"].update(image=pins.get("postgres"), env_file=["postgres.env"])
N["redis"]["image"] = pins.get("redis")
appenv = dict(env, **SET)
text = ("# Managed by ops/chatbot/ops/cw_harden.py. Secrets: .env and postgres.env (mode 600).\n"
        + yaml.safe_dump(new, sort_keys=False, default_flow_style=False))
print("== planned compose (no secrets in it):\n" + text + "".join("env %s: %r -> %r\n" % (k, env.get(k), v) for k, v in SET.items())
      + "env ACTIVE_RECORD_ENCRYPTION_* (2FA): %s\n" % ("kept from the compose" if have_ar else "3 generated at the change, "
                                                        "into .env only, never printed"))
print("public IP %s | free %.1f GB | schema %s | %s -> %s%s | %s" % (ip, gb, schema, FROM_V, WANT, " (db:chatwoot_prepare "
      "with rails+sidekiq stopped)" if WANT != FROM_V else "", q("free -m | sed -n 2p")))
if bad:
    sys.exit("ABORT, nothing changed: " + "; ".join(bad))
print("gates OK")
if DRY:
    sys.exit("DRY RUN: nothing changed")


def put(p, s):
    fd = os.open(p + ".tmp", os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.write(fd, s.encode())
    os.close(fd)
    os.replace(p + ".tmp", p)


def up(v):
    print("compose up:", sh("cd %s && docker compose up -d 2>&1 | tail -6" % D, 300))
    for _ in range(48):
        time.sleep(5)
        j = api()
        if j.get("version") == v and j.get("data_services") == j.get("queue_services") == "ok":
            return True
    return False


def stop():  # also removes a one-off migration container a timeout left behind
    print("stop rails+sidekiq:", sh("cd %s && docker compose stop -t 30 rails sidekiq 2>&1 | tail -3; docker ps -q --filter "
          "label=com.docker.compose.project=chatwoot --filter label=com.docker.compose.oneoff=True | xargs -r docker rm -f"
          % D, 180))


def migrate():
    stop()
    rc, o = sh("cd %s && docker compose run --rm --no-deps -T rails bundle exec rails db:chatwoot_prepare" % D, 600)
    v = q(SCHEMA)
    log = [x for x in o.splitlines() if re.search(r"^==|aborted|rror|cancel|TIMEOUT", x)]  # not the entrypoint's set -x
    print("db:chatwoot_prepare rc %d | schema %s -> %s | %d migration lines, last:" % (rc, FROM_SCHEMA, v, len(log)),
          "\n".join(log[-6:]))
    return rc == 0 and v == CE_SCHEMA


def restore_db():
    stop()
    sh(PSQL % "postgres" + "\"select pg_terminate_backend(pid) from pg_stat_activity where datname="
       "'chatwoot_production' and pid <> pg_backend_pid()\"")
    rc, o = sh("docker exec -i chatwoot-postgres-1 pg_restore -U postgres -C --clean --if-exists -d postgres < %s/cw.dump"
               % BK, 300)
    v = q(SCHEMA)
    print("DB restore from %s/cw.dump rc %d | schema %s |" % (BK, rc, v), o[-300:])
    return rc == 0 and v == FROM_SCHEMA


def sri():  # D1: VITE_CHATWOOT_SDK_SRI must equal this (east_widget.py / WEST .env)
    try:
        b = subprocess.run("docker exec chatwoot-rails-1 cat /app/public/packs/js/sdk.js", shell=True,
                           capture_output=True, timeout=60, executable="/bin/bash").stdout
    except subprocess.TimeoutExpired:
        b = b""
    return "sha384-" + base64.b64encode(hashlib.sha384(b).digest()).decode() if len(b) > 1000 else None


def verify():
    if WANT != FROM_V and not migrate():
        return False
    ok = up(WANT)
    r = q("curl -s -o /dev/null -w '%{http_code}' -m 10 http://127.0.0.1:3009/api")
    print("healthy %s:" % WANT, ok, "| plain http (FORCE_SSL => 301):", r)
    ok = ok and r == "301"
    for c in ("chatwoot-rails-1", "chatwoot-sidekiq-1"):
        have = dict(x.split("=", 1) for x in q("docker exec %s env" % c).splitlines() if "=" in x)  # never printed
        miss = sorted(k for k, v in appenv.items() if have.get(k) != v)
        res = q("docker exec %s getent hosts %s" % (c, HOST)).split()[:1]
        im = q("docker inspect %s --format '{{.Config.Image}}'" % c)
        print(c, "| env keys not as planned:", miss, "|", HOST, "->", res, "|", im)
        ok = ok and not miss and res == [ip] and im == img and "SAFE_FETCH_ALLOW_PRIVATE_NETWORK" not in have
    print(q("cd %s && docker compose ps --format '{{.Name}} {{.State}}'" % D))
    return ok


BK = "/home/ubuntu/chatwoot-backups/harden-" + time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
os.makedirs(BK)
os.chmod(os.path.dirname(BK), 0o700)
r = sh("tar czf {0}/chatwoot-dir.tgz -C /home/ubuntu chatwoot && docker exec chatwoot-postgres-1 pg_dump -U postgres "
       "-d chatwoot_production -Fc > {0}/cw.dump && chmod 600 {0}/*".format(BK), 300)[0]
n = q("docker exec -i chatwoot-postgres-1 pg_restore -l < %s/cw.dump | grep -c 'TABLE DATA'" % BK)
print("backup", BK, "| rc", r, "| tables in dump:", n)
if r or not n.isdigit() or int(n) < 50:
    sys.exit("ABORT: backup failed; nothing changed")
if IMAGE == "ce":
    rc, o = sh("docker pull " + CE, 720)
    v = q("docker run --rm --entrypoint sh %s -c 'grep -m1 version config/app.yml; echo ed=$CW_EDITION'" % CE)
    print("pull rc", rc, o[-150:], "|", v, "| free after pull %.1f GB" % free_gb())
    if rc or CE_V not in v or "ed=ce" not in v or free_gb() < 1.0:
        sys.exit("ABORT: CE image check failed (or < 1 GB left); nothing changed")
left = int(os.environ.get("PRNM_RUNNER_TIMEOUT", RUNNER_TIMEOUT)) - (time.time() - T0)
if left < RESERVE:
    sys.exit("ABORT: %d s of the runner budget left, the change needs %d; nothing changed (image pulled)" % (left, RESERVE))
for k in AR:
    appenv[k] = appenv.get(k) or "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(32))
FP = hashlib.sha256("".join(appenv[k] for k in AR).encode()).hexdigest()[:12]  # cw_status.py prints the same
put(D + "/.env", "".join("%s='%s'\n" % kv for kv in appenv.items()))
put(D + "/postgres.env", "".join("%s='%s'\n" % kv for kv in pgenv.items()))
put(CF, text)
if verify():
    s = sri()
    print("D1: VITE_CHATWOOT_SDK_SRI=%s%s" % (s, "" if IMAGE != "ce" or s == CE_SRI else " (WARN: expected %s)" % CE_SRI))
    if IMAGE == "ce":
        print("old image:", q("docker image rm chatwoot/chatwoot:latest 2>&1 | tail -1"), "|", q("df -h / | tail -1"))
    print("2FA keys fingerprint %s. BACK THEM UP OFF-BOX NOW (lost keys = 2FA users locked out, encrypted columns "
          "unreadable): in an interactive shell on EAST, not this runner (it logs output), run sudo grep "
          "^ACTIVE_RECORD_ENCRYPTION_ %s/.env and keep the 3 lines in Derek's password manager." % (FP, D))
    print("DONE. backup:", BK)
    sys.exit(0)
print("FAILED -> restoring the original compose (copy in %s)" % BK)
with open(CF, "wb") as f:
    f.write(raw)
os.chmod(CF, 0o644)
for f in (".env", "postgres.env"):
    os.remove(D + "/" + f)
db_ok = WANT == FROM_V or restore_db()
print("rollback healthy:", up(FROM_V), "| DB restored:", db_ok)
if not db_ok:
    print("ROLLBACK INCOMPLETE: restore the DB by hand: docker compose stop rails sidekiq; docker exec -i "
          "chatwoot-postgres-1 pg_restore -U postgres -C --clean --if-exists -d postgres < %s/cw.dump" % BK)
sys.exit(1)
