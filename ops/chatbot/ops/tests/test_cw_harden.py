# Run: python3 ops/chatbot/ops/tests/test_cw_harden.py   (needs PyYAML; the last checks need the docker CLI with compose v2)
# Local harness for ops/chatbot/ops/cw_harden.py. No docker daemon, no server: subprocess.run is replaced
# by a fake that answers the script's commands; the compose file is a synthetic copy of EAST's structure
# (same services, keys, YAML anchor; fake secrets). Substitutions: DRY, IMAGE, CF_MD5, D, backup dir,
# statvfs path, sleep. The written compose + env files are then validated with the real `docker compose config`.
import hashlib, json, os, re, runpy, shutil, subprocess, sys, tempfile, time

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))
H = tempfile.mkdtemp(prefix="prnm-ops-test-")  # all fake boxes live here
SCRIPT = REPO + "/ops/chatbot/ops/cw_harden.py"
SKB = "f" * 64 + "e" * 64  # fake secrets
PGP = "FakePgPassw0rdFakePgPassw0rd1234"
COMPOSE = """services:
  postgres:
    image: pgvector/pgvector:pg16
    restart: unless-stopped
    environment:
      POSTGRES_PASSWORD: %(pg)s
    volumes:
      - cw_pg:/var/lib/postgresql/data
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - cw_redis:/data
  rails:
    image: chatwoot/chatwoot:latest
    restart: unless-stopped
    depends_on: [postgres, redis]
    environment: &cwenv
      SECRET_KEY_BASE: %(skb)s
      FRONTEND_URL: https://chat.13.56.113.85.nip.io
      RAILS_ENV: production
      INSTALLATION_ENV: docker
      POSTGRES_HOST: postgres
      POSTGRES_USERNAME: postgres
      POSTGRES_PASSWORD: %(pg)s
      REDIS_URL: redis://redis:6379
      ACTIVE_STORAGE_SERVICE: local
      DEFAULT_LOCALE: en
      ENABLE_ACCOUNT_SIGNUP: "true"
      RAILS_LOG_TO_STDOUT: "true"
    entrypoint: docker/entrypoints/rails.sh
    command: ["bundle", "exec", "rails", "s", "-p", "3000", "-b", "0.0.0.0"]
    ports:
      - "127.0.0.1:3009:3000"
    volumes:
      - cw_storage:/app/storage
  sidekiq:
    image: chatwoot/chatwoot:latest
    restart: unless-stopped
    depends_on: [postgres, redis]
    environment: *cwenv
    command: ["bundle", "exec", "sidekiq", "-C", "config/sidekiq.yml"]
    volumes:
      - cw_storage:/app/storage
volumes:
  cw_pg:
  cw_redis:
  cw_storage:
""" % {"pg": PGP, "skb": SKB}
DIG = {"postgres": "pgvector/pgvector@sha256:" + "a" * 64, "redis": "redis@sha256:" + "b" * 64,
       "rails": "chatwoot/chatwoot@sha256:13ca92b8711a9fface0ed9f82e752d947b4ea690f39a554ad1e0b759f9cf7637"}
IMG = {"pgvector/pgvector:pg16": "postgres", "redis:7-alpine": "redis", "chatwoot/chatwoot:latest": "rails"}


def parse_env_file(p):  # compose v2 semantics for KEY='value' lines (literal, quotes stripped)
    out = {}
    for line in open(p).read().splitlines():
        k, v = line.split("=", 1)
        out[k] = v[1:-1] if v.startswith("'") and v.endswith("'") else v
    return out


def make_fake(D, healthy=True):
    calls = []

    def fake(c, shell=True, capture_output=True, text=True, timeout=None, executable=None, input=None):
        calls.append(c)
        out, rc = "", 0
        if m := re.search(r"docker image inspect (\S+) --format", c):
            out = json.dumps([DIG[IMG[m.group(1)]]])
        elif m := re.search(r"docker inspect chatwoot-(\w+)-1 --format '\{\{\.Image\}\}'", c):
            out = DIG[m.group(1)].split("@")[1]
        elif "api/token" in c:
            out = "imds-token"
        elif "public-ipv4" in c:
            out = "3.222.110.146"
        elif "127.0.0.1:3009/api" in c and "X-Forwarded-Proto" in c:
            out = '{"version":"4.16.2","queue_services":"ok","data_services":"ok"}' if healthy or not calls_up(calls) else "{}"
        elif "-w '%{http_code}'" in c and "3009/api" in c:
            out = "301" if os.path.exists(D + "/.env") else "200"
        elif c.startswith("free -m") or c.startswith("df -h"):
            out = "Mem: 3831 1704 ..."
        elif "pg_restore -l" in c:
            out = "123"
        elif c.startswith("tar czf") or c.startswith("chmod"):
            os.makedirs(c.split()[2].rsplit("/", 1)[0], exist_ok=True) if c.startswith("tar") else None
            out = ""
        elif c.startswith("docker pull"):
            out = "Status: Downloaded newer image"
        elif c.startswith("docker run --rm"):
            out = "version: '4.16.2'\ned=ce"
        elif "docker compose up -d" in c:
            out = "Container chatwoot-rails-1 Started"
        elif m := re.search(r"docker exec (chatwoot-\w+-1) env$", c):
            env = parse_env_file(D + "/.env") if os.path.exists(D + "/.env") else {}
            out = "\n".join("%s=%s" % kv for kv in env.items()) + "\nHOME=/root"
        elif "getent hosts" in c:
            out = "3.222.110.146   chat.poolrentalnearme.com"
        elif "--format '{{.Config.Image}}'" in c:
            import yaml
            out = yaml.safe_load(open(D + "/docker-compose.yml"))["services"]["rails"]["image"]
        elif "docker compose ps" in c:
            out = "chatwoot-rails-1 running"
        elif c.startswith("docker image rm"):
            out = "Untagged: chatwoot/chatwoot:latest"
        else:
            out, rc = "UNHANDLED " + c, 99
        return subprocess.CompletedProcess(c, rc, out, "")

    def calls_up(cs):
        return any("docker compose up -d" in x for x in cs)

    return fake, calls


def run_case(name, dry, image="ce", healthy=True):
    c = H + "/harden-" + name
    shutil.rmtree(c, ignore_errors=True)
    D = c + "/chatwoot"
    os.makedirs(D)
    open(D + "/docker-compose.yml", "w").write(COMPOSE)
    orig = open(D + "/docker-compose.yml", "rb").read()
    s = open(SCRIPT).read()
    for a, b in [("DRY = True\n", "DRY = %s\n" % dry), ('IMAGE = "ce"', 'IMAGE = "%s"' % image),
                 ('CF_MD5 = "c9e8f0054a9503299ebdd27ecd694b34"', 'CF_MD5 = "%s"' % hashlib.md5(orig).hexdigest()),
                 ('D = "/home/ubuntu/chatwoot"', 'D = "%s"' % D),
                 ('"/home/ubuntu/chatwoot-backups/harden-"', '"%s/backups/harden-"' % c),
                 ('os.statvfs("/var/lib/docker")', 'os.statvfs("/")'), ("time.sleep(5)", "time.sleep(0)")]:
        assert s.count(a) == 1, a
        s = s.replace(a, b)
    p = c + "/cw_harden.test.py"
    open(p, "w").write(s)
    fake, calls = make_fake(D, healthy)
    real = subprocess.run
    subprocess.run = fake
    from io import StringIO
    buf, so = StringIO(), sys.stdout
    sys.stdout = buf
    code = None
    try:
        runpy.run_path(p, run_name="__main__")
    except SystemExit as e:
        code = e.code
    finally:
        subprocess.run = real
        sys.stdout = so
    return c, D, orig, code, buf.getvalue(), calls


fails = 0


def check(n, cond):
    global fails
    print(("  ok   " if cond else "  FAIL ") + n)
    fails += 0 if cond else 1


print("== dry")
c, D, orig, code, out, calls = run_case("dry", True)
check("DRY RUN exit", isinstance(code, str) and code.startswith("DRY RUN"))
check("compose untouched, no env files", open(D + "/docker-compose.yml", "rb").read() == orig
      and not os.path.exists(D + "/.env"))
check("planned compose printed without secrets", "extra_hosts" in out and SKB not in out and PGP not in out)
check("no unhandled command", not [x for x in calls if "UNHANDLED" in x])
print("\n".join("     | " + x for x in out.splitlines()[:60]))

for image in ("ce", "running"):
    print("== real, IMAGE=%s" % image)
    c, D, orig, code, out, calls = run_case("ok-" + image, False, image)
    check("exit 0 DONE", code == 0 and "DONE." in out)
    comp = open(D + "/docker-compose.yml").read()
    env = parse_env_file(D + "/.env")
    check("compose has no secret values", SKB not in comp and PGP not in comp)
    check("compose/.env/postgres.env mode 600", all(oct(os.stat(D + "/" + f).st_mode & 0o777) == "0o600"
                                                    for f in ("docker-compose.yml", ".env", "postgres.env")))
    check(".env values", env["SECRET_KEY_BASE"] == SKB and env["POSTGRES_PASSWORD"] == PGP
          and env["FRONTEND_URL"] == "https://chat.poolrentalnearme.com" and env["ENABLE_ACCOUNT_SIGNUP"] == "false"
          and env["FORCE_SSL"] == "true" and "SAFE_FETCH_ALLOW_PRIVATE_NETWORK" not in env)
    check("postgres.env only POSTGRES_PASSWORD", parse_env_file(D + "/postgres.env") == {"POSTGRES_PASSWORD": PGP})
    want = ("chatwoot/chatwoot:v4.16.2-ce@sha256:7ee85a208147a86188ffc0e7fafafd2e1c0403b4ad6aea9e31f566662cce1d2f"
            if image == "ce" else DIG["rails"])
    check("images pinned (%s)" % want[:40], comp.count(want) == 2 and DIG["postgres"] in comp and DIG["redis"] in comp
          and ":latest" not in comp)
    check("pull only for ce", any(x.startswith("docker pull") for x in calls) == (image == "ce"))
    r = subprocess.run(["docker", "compose", "-f", D + "/docker-compose.yml", "config", "--format", "json"],
                       capture_output=True, text=True, cwd=D)
    ok = r.returncode == 0
    if ok:
        cfg = json.loads(r.stdout)["services"]
        ok = (cfg["rails"]["environment"]["FRONTEND_URL"] == "https://chat.poolrentalnearme.com"
              and cfg["sidekiq"]["environment"]["SECRET_KEY_BASE"] == SKB
              and cfg["postgres"]["environment"] == {"POSTGRES_PASSWORD": PGP}
              and cfg["rails"]["extra_hosts"] in (["chat.poolrentalnearme.com=3.222.110.146"],
                                                  ["chat.poolrentalnearme.com:3.222.110.146"],
                                                  {"chat.poolrentalnearme.com": ["3.222.110.146"]}))
        if not ok:
            print(json.dumps(cfg["rails"].get("extra_hosts")), cfg["rails"]["environment"].get("FRONTEND_URL"))
    else:
        print(r.stderr[-500:])
    check("real `docker compose config` accepts it and resolves env_file values exactly", ok)

print("== real, API never healthy after up -d -> rollback")
c, D, orig, code, out, calls = run_case("rollback", False, "ce", healthy=False)
check("exit 1", code == 1 and "FAILED" in out)
check("original compose restored byte-for-byte, mode 644", open(D + "/docker-compose.yml", "rb").read() == orig
      and oct(os.stat(D + "/docker-compose.yml").st_mode & 0o777) == "0o644")
check("env files removed", not os.path.exists(D + "/.env") and not os.path.exists(D + "/postgres.env"))
check("compose up run twice (new, then original)", sum("docker compose up -d" in x for x in calls) == 2)
check("old image NOT removed on failure", not any(x.startswith("docker image rm") for x in calls))

print("\nharness:", "ALL OK" if not fails else "%d FAIL(S)" % fails)
sys.exit(1 if fails else 0)
