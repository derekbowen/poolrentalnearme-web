"""EAST: harden self-hosted Chatwoot before it is public (ops/chatbot/ops/README.md).
DRY=True: read-only. DRY=False: backup, rewrite the md5-gated compose, up -d, verify; restore on failure.
"""
import hashlib, json, os, subprocess, sys, time
import yaml

DRY = True
IMAGE = "ce"  # "ce": official CE of the running release (~720 MB pull); "running": pin the running EE build
CE = "chatwoot/chatwoot:v4.16.2-ce@sha256:7ee85a208147a86188ffc0e7fafafd2e1c0403b4ad6aea9e31f566662cce1d2f"
D = "/home/ubuntu/chatwoot"
CF = D + "/docker-compose.yml"
CF_MD5 = "c9e8f0054a9503299ebdd27ecd694b34"
HOST = "chat.poolrentalnearme.com"
EXPECT_IP = "3.222.110.146"  # cross-check only; the IP written is read from instance metadata
SET = {"ENABLE_ACCOUNT_SIGNUP": "false", "FRONTEND_URL": "https://" + HOST, "FORCE_SSL": "true",
       "ENABLE_PUSH_RELAY_SERVER": "true", "DISABLE_TELEMETRY": "true"}
API = "curl -s -m 10 -H 'X-Forwarded-Proto: https' http://127.0.0.1:3009/api"


def sh(c, t=600):
    r = subprocess.run(c, shell=True, capture_output=True, text=True, timeout=t, executable="/bin/bash")
    return r.returncode, (r.stdout + r.stderr).strip()


def q(c, t=600):
    return sh(c, t)[1]


def api():
    try:
        return json.loads(q(API))
    except ValueError:
        return {}


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
if api().get("version") != "4.16.2":
    bad.append("Chatwoot API not healthy on 127.0.0.1:3009")
vfs = os.statvfs("/var/lib/docker")
gb = vfs.f_bavail * vfs.f_frsize / 2**30
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
print("== planned compose (no secrets in it):\n" + text + "".join("env %s: %r -> %r\n" % (k, env.get(k), v) for k, v in SET.items()))
print("public IP %s | free %.1f GB | %s" % (ip, gb, q("free -m | sed -n 2p")))
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


def up():
    print("compose up:", sh("cd %s && docker compose up -d 2>&1 | tail -6" % D, 900))
    for _ in range(48):
        time.sleep(5)
        j = api()
        if j.get("version") == "4.16.2" and j.get("data_services") == j.get("queue_services") == "ok":
            return True
    return False


def verify():
    ok = up()
    r = q("curl -s -o /dev/null -w '%{http_code}' -m 10 http://127.0.0.1:3009/api")
    print("healthy:", ok, "| plain http (FORCE_SSL => 301):", r)
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
       "-d chatwoot_production -Fc > {0}/cw.dump && chmod 600 {0}/*".format(BK))[0]
n = q("docker exec -i chatwoot-postgres-1 pg_restore -l < %s/cw.dump | grep -c 'TABLE DATA'" % BK)
print("backup", BK, "| rc", r, "| tables in dump:", n)
if r or not n.isdigit() or int(n) < 50:
    sys.exit("ABORT: backup failed; nothing changed")
if IMAGE == "ce":
    rc, o = sh("docker pull " + CE, 900)
    v = q("docker run --rm --entrypoint sh %s -c 'grep -m1 version config/app.yml; echo ed=$CW_EDITION'" % CE)
    print("pull rc", rc, o[-150:], "|", v)
    if rc or "4.16.2" not in v or "ed=ee" in v:
        sys.exit("ABORT: CE image check failed; nothing changed")
put(D + "/.env", "".join("%s='%s'\n" % kv for kv in appenv.items()))
put(D + "/postgres.env", "".join("%s='%s'\n" % kv for kv in pgenv.items()))
put(CF, text)
if verify():
    if IMAGE == "ce":
        print("old image:", q("docker image rm chatwoot/chatwoot:latest 2>&1 | tail -1"), "|", q("df -h / | tail -1"))
    print("DONE. backup:", BK)
    sys.exit(0)
print("FAILED -> restoring the original compose (copy in %s)" % BK)
with open(CF, "wb") as f:
    f.write(raw)
os.chmod(CF, 0o644)
for f in (".env", "postgres.env"):
    os.remove(D + "/" + f)
print("rollback healthy:", up())
sys.exit(1)
