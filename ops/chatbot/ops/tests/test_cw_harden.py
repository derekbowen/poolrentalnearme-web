# Run: python3 ops/chatbot/ops/tests/test_cw_harden.py   (needs PyYAML; the compose checks need the docker CLI with compose v2)
# Local harness for ops/chatbot/ops/cw_harden.py. No docker daemon, no server: subprocess.run is replaced
# by a fake box that answers the script's commands and keeps state (which image runs, the DB schema version,
# whether rails is up), so ordering bugs show up: a 4.19.1 rails on a 4.16.2 schema answers unhealthy, exactly
# like the real thing. The compose file is a synthetic copy of EAST's structure (same services, keys, YAML
# anchor; fake secrets). Substitutions: DRY, IMAGE, CF_MD5, D, backup dir, statvfs path, sleep. The written
# compose + env files are then validated with the real `docker compose config`.
import base64, hashlib, json, os, re, runpy, shutil, subprocess, sys, tempfile, time

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))
H = tempfile.mkdtemp(prefix="prnm-ops-test-")  # all fake boxes live here
SCRIPT = REPO + "/ops/chatbot/ops/cw_harden.py"
SKB = "f" * 64 + "e" * 64  # fake secrets
PGP = "FakePgPassw0rdFakePgPassw0rd1234"
CE = "chatwoot/chatwoot:v4.19.1-ce@sha256:04895c7bd0550d9e74b45b7202787b56f7ee4e891ebbde0c429c8c32901b97cf"
FROM_SCHEMA, CE_SCHEMA = "20260718000000", "20261019143116"
SDK = b"/* fake sdk.js */" + b"x" * 22000
SDK_SRI = "sha384-" + base64.b64encode(hashlib.sha384(SDK).digest()).decode()
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
AR = ("ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY", "ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY",
      "ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT")
KEYED = {k: "Kept%s" % i * 8 for i, k in enumerate(AR)}  # keys already in the compose (32 chars each)


def with_keys(n):  # the synthetic compose with the first n 2FA keys in its env anchor
    return COMPOSE.replace('      RAILS_LOG_TO_STDOUT: "true"\n', '      RAILS_LOG_TO_STDOUT: "true"\n' + "".join(
        "      %s: %s\n" % (k, KEYED[k]) for k in AR[:n]))


DIG = {"postgres": "pgvector/pgvector@sha256:" + "a" * 64, "redis": "redis@sha256:" + "b" * 64,
       "rails": "chatwoot/chatwoot@sha256:13ca92b8711a9fface0ed9f82e752d947b4ea690f39a554ad1e0b759f9cf7637"}
IMG = {"pgvector/pgvector:pg16": "postgres", "redis:7-alpine": "redis", "chatwoot/chatwoot:latest": "rails"}


def parse_env_file(p):  # compose v2 semantics for KEY='value' lines (literal, quotes stripped)
    out = {}
    for line in open(p).read().splitlines():
        k, v = line.split("=", 1)
        out[k] = v[1:-1] if v.startswith("'") and v.endswith("'") else v
    return out


def make_fake(D, healthy=True, schema=FROM_SCHEMA, migrate="ok", restore_rc=0, logcap=True):
    import yaml
    calls = []
    st = {"schema": schema, "image": "chatwoot/chatwoot:latest", "up": True, "logging": {}}  # as each container was created

    def version():
        if not st["up"]:
            return None
        if "v4.19.1-ce" in st["image"]:
            return "4.19.1" if st["schema"] == CE_SCHEMA else None  # new code on the old schema: 500s
        return "4.16.2"

    def fake(c, shell=True, capture_output=True, text=False, timeout=None, executable=None, input=None):
        calls.append(c)
        out, rc = "", 0
        if not text:  # binary reads (sdk.js for the SRI)
            return subprocess.CompletedProcess(c, 0, SDK if "packs/js/sdk.js" in c and st["up"] else b"", b"")
        if m := re.search(r"docker inspect chatwoot-(\w+)-1 --format '\{\{json \.HostConfig\.LogConfig\}\}'$", c):
            lg = st["logging"].get(m.group(1)) or {}  # Docker: the compose's logging, else the daemon default
            out = json.dumps({"Type": lg.get("driver", "json-file"), "Config": (lg.get("options") or {}) if logcap else {}})
        elif m := re.search(r"docker image inspect (\S+) --format", c):
            out = json.dumps([DIG[IMG[m.group(1)]]])
        elif m := re.search(r"docker inspect chatwoot-(\w+)-1 --format '\{\{\.Image\}\}'", c):
            out = DIG[m.group(1)].split("@")[1]
        elif "api/token" in c:
            out = "imds-token"
        elif "public-ipv4" in c:
            out = "3.222.110.146"
        elif "127.0.0.1:3009/api" in c and "X-Forwarded-Proto" in c:
            v = version()
            ok = v and (healthy or not any("docker compose up -d" in x for x in calls[:-1])
                        or st["image"] == "chatwoot/chatwoot:latest")
            out = '{"version":"%s","queue_services":"ok","data_services":"ok"}' % v if ok else "{}"
        elif "-w '%{http_code}'" in c and "3009/api" in c:
            out = "301" if os.path.exists(D + "/.env") else "200"
        elif "select max(version) from schema_migrations" in c:
            out = st["schema"]
        elif "docker compose stop" in c:
            st["up"] = False
            out = "Container chatwoot-rails-1 Stopped"
        elif "db:chatwoot_prepare" in c:
            if migrate == "timeout":
                raise subprocess.TimeoutExpired(c, timeout)
            if "--no-deps" not in c or "-T" not in c.split() or st["up"]:
                out, rc = "BAD MIGRATE INVOCATION (rails must be stopped; --no-deps -T)", 98
            elif migrate == "ok":
                st["schema"] = CE_SCHEMA
                out = "== 20261019143116 AddIndexToArticlesCategoryId: migrated"
            else:
                st["schema"] = "20260901000000"  # half-way
                out, rc = "StandardError: An error has occurred, this and all later migrations canceled", 1
        elif "pg_terminate_backend" in c:
            out = "t"
        elif "pg_restore -U postgres -C --clean --if-exists -d postgres" in c:
            rc = restore_rc
            if rc == 0:
                st["schema"] = FROM_SCHEMA
            out = "" if rc == 0 else "pg_restore: error: could not execute query"
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
            out = "  version: '4.19.1'\ned=ce"
        elif "docker compose up -d" in c:
            svc = yaml.safe_load(open(D + "/docker-compose.yml"))["services"]
            st["image"] = svc["rails"]["image"]
            st["logging"] = {k: v.get("logging") for k, v in svc.items()}  # up -d recreates changed containers
            st["up"] = True
            out = "Container chatwoot-rails-1 Started"
        elif m := re.search(r"docker exec (chatwoot-\w+-1) env$", c):
            env = parse_env_file(D + "/.env") if os.path.exists(D + "/.env") else {}
            out = "\n".join("%s=%s" % kv for kv in env.items()) + "\nHOME=/root"
        elif "getent hosts" in c:
            out = "3.222.110.146   chat.poolrentalnearme.com"
        elif "--format '{{.Config.Image}}'" in c:
            out = st["image"]
        elif "docker compose ps" in c:
            out = "chatwoot-rails-1 running"
        elif c.startswith("docker image rm"):
            out = "Untagged: chatwoot/chatwoot:latest"
        else:
            out, rc = "UNHANDLED " + c, 99
        return subprocess.CompletedProcess(c, rc, out, "")

    return fake, calls, st


def run_case(name, dry, image="ce", budget=None, compose=COMPOSE, **kw):
    c = H + "/harden-" + name
    shutil.rmtree(c, ignore_errors=True)
    D = c + "/chatwoot"
    os.makedirs(D)
    open(D + "/docker-compose.yml", "w").write(compose)
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
    fake, calls, st = make_fake(D, **kw)
    real = subprocess.run
    subprocess.run = fake
    if budget:
        os.environ["PRNM_RUNNER_TIMEOUT"] = str(budget)
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
        os.environ.pop("PRNM_RUNNER_TIMEOUT", None)
    return c, D, orig, code, buf.getvalue(), calls, st


fails = 0


def check(n, cond):
    global fails
    print(("  ok   " if cond else "  FAIL ") + n)
    fails += 0 if cond else 1


def idx(calls, needle):
    return [i for i, x in enumerate(calls) if needle in x]


print("== dry")
c, D, orig, code, out, calls, st = run_case("dry", True)
check("DRY RUN exit", isinstance(code, str) and code.startswith("DRY RUN"))
check("compose untouched, no env files", open(D + "/docker-compose.yml", "rb").read() == orig
      and not os.path.exists(D + "/.env"))
check("planned compose printed without secrets, CE 4.19.1 pinned by digest",
      "extra_hosts" in out and SKB not in out and PGP not in out and out.count(CE) == 2)
check("plan names the version change and the migration", "4.16.2 -> 4.19.1 (db:chatwoot_prepare" in out
      and "schema " + FROM_SCHEMA in out)
check("plan shows the lower widget throttles (conversations 2/min, messages 20/min, cookie-less loads 20/h)",
      "RATE_LIMIT_WIDGET_CONVERSATIONS: None -> '2'" in out and "RATE_LIMIT_WIDGET_MESSAGES: None -> '20'" in out
      and "RATE_LIMIT_WIDGET_LOAD: None -> '20'" in out)
src_h, src_n = open(SCRIPT).read(), open(os.path.join(os.path.dirname(SCRIPT), "cw_nginx.py")).read()
check("the load-throttle comment is true to 4.19.1 (Rack::Attack skips a junk cw_conversation, which still makes a "
      "contact, and has no rule for config POSTs, which always make one) and names the nginx zone that bounds both, at "
      "the rate and key cw_nginx.py really sets", "a junk value is not counted and still makes a contact" in src_h
      and "every POST\n# /api/v1/widget/config (no Rack::Attack rule at all)" in src_h
      and "prnm_wload zone,\n# which holds both paths (10/min per visitor = IPv4 address or IPv6 /64)" in src_h
      and "limit_req_zone $prnm_visitor zone=prnm_wload:2m rate=10r/m;" in src_n
      and "location ~ ^/(widget|api/v1/widget/config)(\\\\.|/|$) {\n        limit_req zone=prnm_wload burst=10 nodelay;"
      in src_n)
check("plan: every service's log capped (json-file, max-size 20m, max-file 5), each as its own block (no YAML anchors)",
      out.count("    logging:\n      driver: json-file\n      options:\n        max-size: 20m\n        max-file: '5'\n") == 4
      and "&id" not in out and "container logs (postgres, redis, rails, sidekiq): json-file, max-size 20m, max-file 5 each"
      in out)
check("plan: 3 2FA encryption keys generated at the change (none in DRY), never printed",
      "env ACTIVE_RECORD_ENCRYPTION_* (2FA): 3 generated at the change, into .env only, never printed" in out)
check("no pull, stop, migrate or up in DRY", not [x for x in calls if x.startswith("docker pull") or "compose" in x])
check("no unhandled command", not [x for x in calls if "UNHANDLED" in x])
print("\n".join("     | " + x for x in out.splitlines()[-14:]))

print("== dry, DB schema is not 4.16.2's")
c, D, orig, code, out, calls, st = run_case("dry-schema", True, schema="20250101000000")
check("ABORT names the schema", isinstance(code, str) and "ABORT" in code and "schema_migrations max" in code)

for image in ("ce", "running"):
    print("== real, IMAGE=%s" % image)
    c, D, orig, code, out, calls, st = run_case("ok-" + image, False, image)
    check("exit 0 DONE", code == 0 and "DONE." in out)
    comp = open(D + "/docker-compose.yml").read()
    env = parse_env_file(D + "/.env")
    check("compose has no secret values", SKB not in comp and PGP not in comp)
    check("compose/.env/postgres.env mode 600", all(oct(os.stat(D + "/" + f).st_mode & 0o777) == "0o600"
                                                    for f in ("docker-compose.yml", ".env", "postgres.env")))
    check(".env values", env["SECRET_KEY_BASE"] == SKB and env["POSTGRES_PASSWORD"] == PGP
          and env["FRONTEND_URL"] == "https://chat.poolrentalnearme.com" and env["ENABLE_ACCOUNT_SIGNUP"] == "false"
          and env["FORCE_SSL"] == "true" and "SAFE_FETCH_ALLOW_PRIVATE_NETWORK" not in env
          and env["RATE_LIMIT_WIDGET_CONVERSATIONS"] == "2" and env["RATE_LIMIT_WIDGET_MESSAGES"] == "20"
          and env["RATE_LIMIT_WIDGET_LOAD"] == "20")
    check("postgres.env only POSTGRES_PASSWORD", parse_env_file(D + "/postgres.env") == {"POSTGRES_PASSWORD": PGP})
    ks = [env.get(k, "") for k in AR]
    check("2FA: 3 distinct 32-char alphanumeric keys in .env, none printed; fingerprint + off-box backup step printed",
          all(re.fullmatch(r"[A-Za-z0-9]{32}", x) for x in ks) and len(set(ks)) == 3 and not any(x in out for x in ks)
          and "2FA keys fingerprint %s. BACK THEM UP OFF-BOX" % hashlib.sha256("".join(ks).encode()).hexdigest()[:12] in out
          and "sudo grep ^ACTIVE_RECORD_ENCRYPTION_ " in out)
    check("verify compared the keys too (rails + sidekiq env as planned)", out.count("env keys not as planned: []") == 2)
    check("verify read each running container's log config: all 4 capped as planned",
          all("%s log config: {'Type': 'json-file', 'Config': {'max-size': '20m', 'max-file': '5'}}" % x in out
              for x in ("postgres", "redis", "rails", "sidekiq")))
    want = CE if image == "ce" else DIG["rails"]
    check("images pinned (%s)" % want[:40], comp.count(want) == 2 and DIG["postgres"] in comp and DIG["redis"] in comp
          and ":latest" not in comp)
    check("pull only for ce", any(x.startswith("docker pull") for x in calls) == (image == "ce"))
    mig, ups, stops = idx(calls, "db:chatwoot_prepare"), idx(calls, "docker compose up -d"), idx(calls, "compose stop")
    if image == "ce":
        check("order: pull, rails+sidekiq stopped, migrate (--no-deps -T), then up -d once",
              len(mig) == 1 and len(ups) == 1 and stops and idx(calls, "docker pull")[0] < stops[0] < mig[0] < ups[0])
        check("schema now 4.19.1's, rails answers 4.19.1", st["schema"] == CE_SCHEMA and "healthy 4.19.1: True" in out)
        check("D1 SRI of the running sdk.js printed (and flagged: the fake bytes are not v4.19.1-ce's)",
              "VITE_CHATWOOT_SDK_SRI=%s (WARN: expected sha384-NMOi" % SDK_SRI in out)
        check("old image removed", any(x.startswith("docker image rm") for x in calls))
    else:
        check("no migration, no DB restore, stays 4.16.2", not mig and not idx(calls, "pg_restore -U")
              and st["schema"] == FROM_SCHEMA and "healthy 4.16.2: True" in out)
        check("SRI printed without the CE warning", "VITE_CHATWOOT_SDK_SRI=%s\n" % SDK_SRI in out)
    check("no unhandled command", not [x for x in calls if "UNHANDLED" in x])
    r = subprocess.run(["docker", "compose", "-f", D + "/docker-compose.yml", "config", "--format", "json"],
                       capture_output=True, text=True, cwd=D)
    ok = r.returncode == 0
    if ok:
        cfg = json.loads(r.stdout)["services"]
        ok = (cfg["rails"]["environment"]["FRONTEND_URL"] == "https://chat.poolrentalnearme.com"
              and cfg["sidekiq"]["environment"]["SECRET_KEY_BASE"] == SKB
              and cfg["sidekiq"]["environment"]["RATE_LIMIT_WIDGET_MESSAGES"] == "20"
              and cfg["rails"]["environment"]["RATE_LIMIT_WIDGET_LOAD"] == "20"
              and cfg["sidekiq"]["environment"][AR[0]] == env[AR[0]] and cfg["rails"]["environment"][AR[2]] == env[AR[2]]
              and cfg["postgres"]["environment"] == {"POSTGRES_PASSWORD": PGP}
              and all(cfg[x].get("logging") == {"driver": "json-file", "options": {"max-size": "20m", "max-file": "5"}}
                      for x in ("postgres", "redis", "rails", "sidekiq"))
              and cfg["rails"]["extra_hosts"] in (["chat.poolrentalnearme.com=3.222.110.146"],
                                                  ["chat.poolrentalnearme.com:3.222.110.146"],
                                                  {"chat.poolrentalnearme.com": ["3.222.110.146"]}))
        if not ok:
            print(json.dumps(cfg["rails"].get("extra_hosts")), cfg["rails"]["environment"].get("FRONTEND_URL"))
    else:
        print(r.stderr[-500:])
    check("real `docker compose config` accepts it, resolves env_file values exactly and keeps every service's log cap", ok)


def rolled_back(D, orig, calls, st, code, out, ups):
    check("exit 1, FAILED", code == 1 and "FAILED" in out)
    check("original compose restored byte-for-byte, mode 644", open(D + "/docker-compose.yml", "rb").read() == orig
          and oct(os.stat(D + "/docker-compose.yml").st_mode & 0o777) == "0o644")
    check("env files removed", not os.path.exists(D + "/.env") and not os.path.exists(D + "/postgres.env"))
    check("compose up run %d time(s)" % ups, len(idx(calls, "docker compose up -d")) == ups)
    r = idx(calls, "pg_restore -U postgres -C --clean")
    check("DB restored from the fresh dump, rails stopped first, before the old image starts again",
          len(r) == 1 and max(i for i in idx(calls, "compose stop") if i < r[0]) < r[0] < idx(calls, "docker compose up -d")[-1]
          and st["schema"] == FROM_SCHEMA)
    check("old 4.16.2 back and healthy", st["image"] == "chatwoot/chatwoot:latest" and "rollback healthy: True" in out)
    check("old image NOT removed on failure", not any(x.startswith("docker image rm") for x in calls))


print("== real, the compose already holds the 3 keys -> kept, never regenerated")
c, D, orig, code, out, calls, st = run_case("keyed", False, "running", compose=with_keys(3))
check("exit 0; .env carries the existing keys unchanged; plan says kept", code == 0 and "kept from the compose" in out
      and all(parse_env_file(D + "/.env")[k] == v for k, v in KEYED.items()) and not any(v in out for v in KEYED.values()))
print("== dry, only some of the keys set -> refuse (regenerating would orphan data encrypted with the old ones)")
c, D, orig, code, out, calls, st = run_case("partial", True, compose=with_keys(1))
check("ABORT names it", isinstance(code, str) and "2FA encryption keys set: fix by hand, never regenerate" in code)

print("== real, API never healthy after up -d -> rollback (compose + DB)")
c, D, orig, code, out, calls, st = run_case("rollback", False, "ce", healthy=False)
rolled_back(D, orig, calls, st, code, out, 2)

print("== real, a container comes up without the log cap (the daemon ignored it) -> rollback (compose + DB)")
c, D, orig, code, out, calls, st = run_case("logcap", False, "ce", logcap=False)
rolled_back(D, orig, calls, st, code, out, 2)
check("the uncapped log config is printed", "rails log config: {'Type': 'json-file', 'Config': {}}" in out)

print("== real, migration fails half-way -> the new image never starts; compose + DB restored")
c, D, orig, code, out, calls, st = run_case("migfail", False, "ce", migrate="fail")
rolled_back(D, orig, calls, st, code, out, 1)

print("== real, migration hits its timeout (sh() returns 124 instead of crashing past the rollback)")
c, D, orig, code, out, calls, st = run_case("migtimeout", False, "ce", migrate="timeout")
rolled_back(D, orig, calls, st, code, out, 1)
check("timeout reported", "rc 124" in out and "TIMEOUT after 600 s" in out)
check("the one-off migration container a timeout leaves behind is removed before the DB restore",
      any("com.docker.compose.oneoff=True" in x and "docker rm -f" in x for x in calls[:idx(calls, "pg_restore -U")[0]]))

print("== real, DB restore fails -> loud manual instructions")
c, D, orig, code, out, calls, st = run_case("restorefail", False, "ce", healthy=False, restore_rc=1)
check("exit 1, ROLLBACK INCOMPLETE with the manual pg_restore line", code == 1 and "ROLLBACK INCOMPLETE" in out
      and "pg_restore -U postgres -C --clean --if-exists -d postgres <" in out)

print("== real, runner budget too short for the change window -> abort before any change")
c, D, orig, code, out, calls, st = run_case("budget", False, "ce", budget=900)
check("ABORT after the pull, before the compose is touched", isinstance(code, str) and "runner budget" in code
      and open(D + "/docker-compose.yml", "rb").read() == orig and not os.path.exists(D + "/.env")
      and not idx(calls, "compose stop") and not idx(calls, "db:chatwoot_prepare"))


def real_pg():
    """The script's own dump / terminate / restore commands against a throwaway local PostgreSQL 16 cluster: a
    'migrated' DB (new column, new table, newer schema version) with a lingering connection comes back exactly."""
    bins = "/usr/lib/postgresql/16/bin"
    print("== the DB rollback commands against a real PostgreSQL (%s)" % bins)
    if not os.path.exists(bins + "/initdb") or not shutil.which("pg_restore") or os.geteuid() != 0:
        return print("  skip: needs root (to run initdb as ubuntu) and PostgreSQL 16 binaries")
    src = open(SCRIPT).read()
    term = ("select pg_terminate_backend(pid) from pg_stat_activity where datname='chatwoot_production' and pid <> "
            "pg_backend_pid()")
    check("these are the commands cw_harden.py runs (dump flags, terminate SQL, restore flags)",
          "pg_dump -U postgres " in src and "-d chatwoot_production -Fc > {0}/cw.dump" in src
          and "pg_restore -U postgres -C --clean --if-exists -d postgres < %s/cw.dump" in src
          and "select pg_terminate_backend(pid) from pg_stat_activity where datname=" in src
          and "'chatwoot_production' and pid <> pg_backend_pid()" in src)
    d = tempfile.mkdtemp(prefix="prnm-pg-")
    os.chmod(d, 0o777)
    port = "55437"
    conn = " -h %s -p %s" % (d, port)

    def u(c, **kw):
        return subprocess.run(["runuser", "-u", "ubuntu", "--", "bash", "-c", c], capture_output=True, text=True, **kw)

    def sql(db, x):
        return u("psql%s -U postgres -d %s -Atc %s" % (conn, db, "'" + x.replace("'", "'\\''") + "'")).stdout.strip()

    try:
        u("%s/initdb -D %s/data -U postgres --auth=trust >/dev/null" % (bins, d))
        u("%s/pg_ctl -D %s/data -o \"-k %s -p %s -c listen_addresses=''\" -w start >/dev/null" % (bins, d, d, port))
        sql("postgres", "create database chatwoot_production")
        sql("chatwoot_production", "create table schema_migrations (version varchar primary key); "
            "create table ar_internal_metadata (key varchar primary key, value varchar); "
            "create table conversations (id serial primary key, status int); insert into conversations (status) values (2); "
            "insert into schema_migrations select to_char(20250101000000 + g, 'FM99999999999999') from generate_series(1, 157) g; "
            "insert into schema_migrations values ('%s')" % FROM_SCHEMA)
        r = u("pg_dump%s -U postgres -d chatwoot_production -Fc > %s/cw.dump" % (conn, d))
        check("pg_dump -Fc of the 4.16.2-state DB", r.returncode == 0 and os.path.getsize(d + "/cw.dump") > 500)
        sql("chatwoot_production", "alter table conversations add column ai_assignee_type varchar; create table "
            "new_in_4_19 (id int); insert into schema_migrations values ('%s')" % CE_SCHEMA)
        hold = subprocess.Popen(["runuser", "-u", "ubuntu", "--", "bash", "-c", "psql%s -U postgres -d "
                                 "chatwoot_production -c 'select pg_sleep(120)'" % conn], stdout=subprocess.DEVNULL,
                                stderr=subprocess.DEVNULL)  # a connection left open (sidekiq, a killed migration)
        time.sleep(1)
        sql("postgres", term)
        r = u("pg_restore%s -U postgres -C --clean --if-exists -d postgres < %s/cw.dump" % (conn, d))
        hold.kill()
        cols = sql("chatwoot_production", "select string_agg(column_name, ',' order by column_name) from "
                   "information_schema.columns where table_name='conversations'")
        check("restore after terminate: rc 0, schema %s, the 4.19 column and table are gone, data kept" % FROM_SCHEMA,
              r.returncode == 0 and sql("chatwoot_production", "select max(version) from schema_migrations") == FROM_SCHEMA
              and cols == "id,status" and sql("chatwoot_production", "select to_regclass('new_in_4_19') is null") == "t"
              and sql("chatwoot_production", "select count(*) from schema_migrations") == "158"
              and sql("chatwoot_production", "select status from conversations") == "2")
        if r.returncode:
            print(r.stderr[-600:])
    finally:
        u("%s/pg_ctl -D %s/data -m immediate -w stop >/dev/null 2>&1" % (bins, d))
        shutil.rmtree(d, ignore_errors=True)


real_pg()
print("\nharness:", "ALL OK" if not fails else "%d FAIL(S)" % fails)
sys.exit(1 if fails else 0)
