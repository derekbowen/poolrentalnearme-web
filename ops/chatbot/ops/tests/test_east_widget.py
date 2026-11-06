# Local harness for ops/chatbot/ops/east_widget.py against a fake EAST box. Touches no server.
# Run: PATH=/path/to/node/bin:$PATH python3 ops/chatbot/ops/tests/test_east_widget.py   (needs node, npm, curl)
# The real script is copied with ONLY these substitutions: DRY, SHA/SUM, RAW (file:// to a fixture TSX, so the
# test does not depend on the live widget source), APP, SITE + SDK (local server), backup/stage dirs, the sudo
# part of the ubuntu prefix, the pm2 command, sleep, the token query (echo), MIN_MB. docker, systemd-run and
# systemctl are fakes on PATH that log every call (systemd-run --scope runs its command, like the real one).
# Runs get PRNM_RUNNER_TIMEOUT=1800, as ops/runners/east_runx.py exports for this script's RUNNER_TIMEOUT.
import base64, hashlib, http.server, os, re, shutil, subprocess, sys, tempfile, threading, time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
H = tempfile.mkdtemp(prefix="prnm-ops-test-")  # all fake boxes live here
SCRIPT = REPO + "/ops/chatbot/ops/east_widget.py"
BOX = os.path.join(HERE, "fixtures", "east__root.tsx")  # EAST copy, md5 c6aedc95...
TSX = os.path.join(HERE, "fixtures", "chatwoot-widget.fixture.tsx")
TOKEN = "TestToken1234567890abcd"
SDKJS = b"/* fake chatwoot sdk.js for the harness */ window.chatwootSDK = { run: function () {} };\n"
SRI = "sha384-" + base64.b64encode(hashlib.sha384(SDKJS).digest()).decode()
PORT = 8797
STATE = {"inject": False, "sdk": SDKJS, "acao": "*"}

FAKEBUILD = r'''
import fs from "node:fs"; import crypto from "node:crypto";
if (fs.existsSync("FAIL_BUILD")) { console.error("fake build failure"); process.exit(1); }
// in-place writer, like the TanStack router plugin's routeTree.gen.ts
fs.writeFileSync("src/routeTree.gen.ts", "// regenerated " + Date.now() + "\n");
let out = fs.readFileSync("src/routes/__root.tsx", "utf8");
if (out.includes('from "@/components/chatwoot-widget"')) {
  let comp = fs.readFileSync("src/components/chatwoot-widget.tsx", "utf8");
  const env = fs.existsSync(".env.production.local") ? fs.readFileSync(".env.production.local", "utf8") : "";
  for (const m of env.matchAll(/^(VITE_\w+)=(.*)$/gm)) comp = comp.split("import.meta.env." + m[1]).join(JSON.stringify(m[2]));
  out += comp;
}
fs.rmSync("dist", { recursive: true, force: true });
fs.mkdirSync("dist/client/fw-assets", { recursive: true }); fs.mkdirSync("dist/server/fw-assets", { recursive: true });
const h = crypto.createHash("md5").update(out).digest("hex").slice(0, 8);
fs.writeFileSync(`dist/client/fw-assets/index-${h}.js`, out);
fs.writeFileSync("dist/client/fw-assets/__build.json", JSON.stringify({ h }));
fs.writeFileSync(`dist/server/fw-assets/chunk-${h}.js`, "server chunk");
fs.writeFileSync("dist/server/server.js", "export default {};");
fs.mkdirSync("node_modules/.vite-temp", { recursive: true });
fs.writeFileSync("node_modules/.vite-temp/vite.config.timestamp.mjs", "x");
if (process.env.PRNM_FAIL_VERIFY) fs.writeFileSync(process.env.PRNM_FAIL_VERIFY, "1");
console.log("fake build wrote index-" + h + ".js");
'''

FAKES = {  # %(c)s = case dir
    "docker": '#!/bin/sh\necho "docker $*" >> %(c)s/calls.log\n'
              'case "$*" in "exec chatwoot-rails-1 cat "*) cat %(c)s/sdk.js;; esac\n',
    "systemd-run": '#!/bin/bash\necho "systemd-run $*" >> %(c)s/calls.log\n'
                   '[ "$1" = "--scope" ] || exit ${FAKE_TIMER_RC:-0}\n'
                   'while [ $# -gt 0 ]; do case "$1" in --scope|-q|--unit=*) shift;; -p) shift 2;; *) break;; esac; done\n'
                   'exec "$@"\n',
    "systemctl": '#!/bin/sh\necho "systemctl $*" >> %(c)s/calls.log\n',
}


class Site(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        p = self.path.split("?")[0]
        inj = STATE.get("inject")
        extra = {}
        if p == "/packs/js/sdk.js":
            body = STATE["sdk"]
            if STATE["acao"]:
                extra["Access-Control-Allow-Origin"] = STATE["acao"]
            self.send_response(200)
        elif p in ("/", "/p/how-to-host-a-pool-party"):
            body = ("page %s %s" % (p, "prnm-chatwoot-v1" if inj and os.path.exists(inj) else "")).encode()
            self.send_response(200)
        else:
            body = b"nope"
            self.send_response(404)
        for k, v in extra.items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


def mkbox(c):
    shutil.rmtree(c, ignore_errors=True)
    a = c + "/app"
    for d in ("src/routes", "src/components", "node_modules/pkg", "node_modules/.vite-temp",
              "dist/client/fw-assets", "dist/server/fw-assets", "dist.bak-old/client", ".git", "bin"):
        os.makedirs(os.path.join(a if d != "bin" else c, d), exist_ok=True)
    shutil.copy(BOX, a + "/src/routes/__root.tsx")
    open(a + "/src/routeTree.gen.ts", "w").write("// original route tree\n")
    open(a + "/node_modules/pkg/index.js", "w").write("module.exports = 1;\n")
    open(a + "/node_modules/.vite-temp/stale.mjs", "w").write("stale\n")
    open(a + "/fakebuild.mjs", "w").write(FAKEBUILD)
    open(a + "/package.json", "w").write('{"name":"fake","private":true,"scripts":{"build":"node fakebuild.mjs"}}\n')
    open(a + "/.env", "w").write("VITE_SUPABASE_URL=https://example.invalid\n")
    os.chmod(a + "/.env", 0o600)
    open(a + "/dist/client/fw-assets/index-OLDHASH.js", "w").write("old bundle\n")
    open(a + "/dist/server/fw-assets/chunk-OLD.js", "w").write("old server chunk\n")
    open(a + "/dist/server/server.js", "w").write("old server\n")
    open(a + "/dist.bak-old/client/x", "w").write("bak\n")
    old = time.time() - 7200
    for root, _, fs in os.walk(a):
        for f in fs:
            os.utime(os.path.join(root, f), (old, old))
    newer = time.time() - 3600
    os.utime(a + "/dist/client/fw-assets/index-OLDHASH.js", (newer, newer))
    open(c + "/sdk.js", "wb").write(SDKJS)  # what the fake chatwoot-rails-1 holds
    open(c + "/calls.log", "w").close()
    for tool, body in FAKES.items():
        open("%s/bin/%s" % (c, tool), "w").write(body % {"c": c})
        os.chmod("%s/bin/%s" % (c, tool), 0o755)
    os.makedirs(c + "/raw", exist_ok=True)
    shutil.copy(TSX, c + "/raw/chatwoot-widget.tsx")
    return a


def script(c, dry, min_mb=0, trial=False):
    s = open(SCRIPT).read()
    reps = [
        ("DRY = True\n", "DRY = %s\n" % dry),
        ("TRIAL = False  #", "TRIAL = %s  #" % trial),
        ('SHA = "REPLACE_AFTER_COMMIT"', 'SHA = "TESTSHA"'),
        ('SUM = "REPLACE_AFTER_COMMIT"', 'SUM = "%s"' % hashlib.sha256(open(TSX, "rb").read()).hexdigest()),
        ('RAW = "https://raw.githubusercontent.com/derekbowen/poolrentalnearme-web/%s/ops/chatbot/ops/east/" % SHA',
         'RAW = "file://%s/raw/"' % c),
        ('APP = "/home/ubuntu/fresh-web"', 'APP = "%s/app"' % c),
        ('SITE = "https://www.poolrentalnearme.com"', 'SITE = "http://127.0.0.1:%d"' % PORT),
        ('SDK = "https://chat.poolrentalnearme.com/packs/js/sdk.js"', 'SDK = "http://127.0.0.1:%d/packs/js/sdk.js"' % PORT),
        ('"/home/ubuntu/backup-east-chatwoot-widget-"', '"%s/bk-"' % c),
        ('"/home/ubuntu/fresh-web-stage-"', '"%s/stage-"' % c),
        ("sudo -u ubuntu PM2_HOME=/home/ubuntu/.pm2 bash -lc %s", "bash -c %s"),
        ('ub("pm2 restart fresh-web")', 'ub("echo restart >> %s/calls.log")' % c),
        ("time.sleep(10)", "time.sleep(0)"),
        ('"docker exec chatwoot-postgres-1 psql -U postgres -d chatwoot_production -Atc \\"select w.website_token from "',
         '"echo %s # "' % TOKEN),
        ("MIN_MB = 1536", "MIN_MB = %d" % min_mb),
    ]
    for a, b in reps:
        assert s.count(a) == 1, a
        s = s.replace(a, b)
    p = c + "/east_widget.test.py"
    open(p, "w").write(s)
    return p


def run(c, p, extra_env=None, budget="1800"):
    STATE["inject"] = c + "/INJECT"
    env = dict(os.environ, PATH=c + "/bin:" + os.environ["PATH"], PRNM_INJECT_FILE=c + "/INJECT", **(extra_env or {}))
    env.pop("PRNM_RUNNER_TIMEOUT", None)
    if budget:
        env["PRNM_RUNNER_TIMEOUT"] = budget
    r = subprocess.run([sys.executable, p], capture_output=True, text=True, env=env)
    return r.returncode, r.stdout + r.stderr


def calls(c):
    return open(c + "/calls.log").read()


def tree_md5(a):
    h = hashlib.md5()
    for root, dirs, fs in sorted(os.walk(a)):
        dirs.sort()
        for f in sorted(fs):
            fp = os.path.join(root, f)
            h.update(fp.encode() + open(fp, "rb").read())
    return h.hexdigest()


def check(name, cond):
    print(("  ok   " if cond else "  FAIL ") + name)
    if not cond:
        check.fails += 1


check.fails = 0


def refused_untouched(label, c, a, before, rc, out, why):
    check("%s: exit 1, nothing changed (%s)" % (label, why), rc == 1 and "ABORT, nothing changed" in out and why in out)
    check("%s: app tree byte-identical, no stage/backup dirs" % label, tree_md5(a) == before
          and not [x for x in os.listdir(c) if x.startswith(("stage-", "bk-"))])


def main():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Site)
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    print("== case dry")
    c = H + "/case-dry"
    a = mkbox(c)
    before = tree_md5(a)
    rc, out = run(c, script(c, True))
    check("exit 1 with DRY RUN", rc == 1 and "DRY RUN: nothing changed" in out)
    check("DRY prints the SRI computed from the container's sdk.js", SRI in out)
    check("app tree unchanged", tree_md5(a) == before)
    check("no stage/backup dirs", not [x for x in os.listdir(c) if x.startswith(("stage-", "bk-"))])
    check("DRY made no systemd-run/stop calls", "systemd-run" not in calls(c) and "docker stop" not in calls(c))

    print("== case no runner budget (run outside east_runx.py: 560 s default)")
    c = H + "/case-budget"
    a = mkbox(c)
    before = tree_md5(a)
    rc, out = run(c, script(c, False), budget=None)
    refused_untouched("budget", c, a, before, rc, out, "runner budget too short")

    print("== case public sdk.js differs from the container's (SRI would never match)")
    c = H + "/case-sdk-mismatch"
    a = mkbox(c)
    before = tree_md5(a)
    STATE["sdk"] = SDKJS + b"/* altered by a proxy */"
    rc, out = run(c, script(c, False))
    STATE["sdk"] = SDKJS
    refused_untouched("sdk mismatch", c, a, before, rc, out, "differs from the container's")

    print("== case public sdk.js without CORS (crossorigin=anonymous would block it)")
    c = H + "/case-sdk-cors"
    a = mkbox(c)
    before = tree_md5(a)
    STATE["acao"] = None
    rc, out = run(c, script(c, False))
    STATE["acao"] = "*"
    refused_untouched("no CORS", c, a, before, rc, out, "Access-Control-Allow-Origin None")

    print("== case no sdk.js in the container (no SRI)")
    c = H + "/case-sdk-missing"
    a = mkbox(c)
    os.remove(c + "/sdk.js")
    before = tree_md5(a)
    rc, out = run(c, script(c, False))
    refused_untouched("no sdk.js", c, a, before, rc, out, "no SRI")

    print("== case ok")
    c = H + "/case-ok"
    a = mkbox(c)
    nm_ino = os.stat(a + "/node_modules/pkg/index.js").st_ino
    rc, out = run(c, script(c, False))
    print("\n".join("     | " + x for x in out.strip().splitlines()[-7:]))
    root = open(a + "/src/routes/__root.tsx").read()
    js = [f for f in os.listdir(a + "/dist/client/fw-assets") if f.startswith("index-") and f != "index-OLDHASH.js"]
    bundle = open(a + "/dist/client/fw-assets/" + js[0]).read() if js else ""
    envf = open(a + "/.env.production.local").read() if os.path.exists(a + "/.env.production.local") else ""
    check("exit 0 DONE", rc == 0 and "DONE." in out)
    check("__root.tsx has import + mount", root.count("ChatwootWidget") == 2)
    check("component installed (the pinned TSX bytes)", os.path.exists(a + "/src/components/chatwoot-widget.tsx")
          and open(a + "/src/components/chatwoot-widget.tsx", "rb").read() == open(TSX, "rb").read())
    check(".env.production.local mode 600 with BOTH token and SRI",
          oct(os.stat(a + "/.env.production.local").st_mode & 0o777) == "0o600"
          and envf == "VITE_CHATWOOT_WEBSITE_TOKEN=%s\nVITE_CHATWOOT_SDK_SRI=%s\n" % (TOKEN, SRI))
    check("live dist has the new bundle with marker, token and SRI",
          "prnm-chatwoot-v1" in bundle and TOKEN in bundle and SRI in bundle)
    scope = [x for x in calls(c).splitlines() if x.startswith("systemd-run --scope")]
    check("build ran in one memory-capped transient scope (MemoryMax, MemorySwapMax, RuntimeMaxSec)",
          len(scope) == 1 and re.search(r"--unit=prnm-fw-build-\S+ -p MemoryMax=\d+M -p MemorySwapMax=\d+M "
                                        r"-p RuntimeMaxSec=\d+ bash -c .*max-old-space-size=3072.*npm run build", scope[0]))
    check("scope disclosed in the output", "transient scope prnm-fw-build-" in out and "MemoryMax=" in out)
    check("no sidekiq stop when the cap is above MIN_MB", "docker stop" not in calls(c))
    check("old hashed client asset kept", os.path.exists(a + "/dist/client/fw-assets/index-OLDHASH.js"))
    check("old server chunk kept", os.path.exists(a + "/dist/server/fw-assets/chunk-OLD.js"))
    check("new server.js live", open(a + "/dist/server/server.js").read() == "export default {};")
    bk = [x for x in os.listdir(c) if x.startswith("bk-")]
    check("backup has __root.tsx + dist-prev with the old bundle", bk and os.path.exists(
        "%s/%s/dist-prev/client/fw-assets/index-OLDHASH.js" % (c, bk[0])) and open(
        "%s/%s/__root.tsx" % (c, bk[0]), "rb").read() == open(BOX, "rb").read())
    check("stage removed", not [x for x in os.listdir(c) if x.startswith("stage-")])
    check("live node_modules untouched (same inode, same content)",
          os.stat(a + "/node_modules/pkg/index.js").st_ino == nm_ino
          and open(a + "/node_modules/pkg/index.js").read() == "module.exports = 1;\n"
          and os.path.exists(a + "/node_modules/.vite-temp/stale.mjs"))
    check("in-place build writer did not reach live src",
          open(a + "/src/routeTree.gen.ts").read() == "// original route tree\n")
    newest = max(os.path.getmtime(a + "/dist/client/fw-assets/" + f) for f in os.listdir(a + "/dist/client/fw-assets")
                 if f.endswith(".js"))
    check("live src older than the new bundle (next gate clean)",
          os.path.getmtime(a + "/src/routes/__root.tsx") < newest
          and os.path.getmtime(a + "/src/components/chatwoot-widget.tsx") < newest)
    check("pm2 restart called once", calls(c).count("restart") == 1)
    check("dist.bak-* not copied into stage (no stray copy in backup)", not os.path.exists(
        "%s/%s/dist-prev/dist.bak-old" % (c, bk[0])) if bk else False)
    rc2, out2 = run(c, script(c, False))
    check("second run refuses (drift + files exist)", rc2 == 1 and "drift" in out2 and "exists" in out2)

    print("== case trial (capped staged build only, never swaps)")
    c = H + "/case-trial"
    a = mkbox(c)
    before = tree_md5(a)
    rc, out = run(c, script(c, False, trial=True))
    print("\n".join("     | " + x[:120] for x in out.strip().splitlines()[-3:]))
    check("exit 1 TRIAL passed, peak memory reported", rc == 1 and "TRIAL: capped build passed" in out
          and re.search(r"peak RAM \S+ swap \S+ bytes", out))
    check("trial: build ran in the capped scope", "systemd-run --scope" in calls(c) and "MemoryMax=" in calls(c))
    check("trial: live tree byte-identical, no pm2 restart, no stage/backup left", tree_md5(a) == before
          and "restart" not in calls(c) and not [x for x in os.listdir(c) if x.startswith(("stage-", "bk-"))])

    print("== case buildfail")
    c = H + "/case-buildfail"
    a = mkbox(c)
    open(a + "/FAIL_BUILD", "w").write("1")
    before = tree_md5(a)
    rc, out = run(c, script(c, False))
    check("exit 1 build failed", rc == 1 and "ABORT: build failed or out of time; live site untouched" in out)
    check("live tree byte-identical", tree_md5(a) == before)
    check("stage removed", not [x for x in os.listdir(c) if x.startswith("stage-")])

    print("== case verifyfail (marker leaks into server HTML after the swap)")
    c = H + "/case-verifyfail"
    a = mkbox(c)
    before = tree_md5(a)
    rc, out = run(c, script(c, False), {"PRNM_FAIL_VERIFY": c + "/INJECT"})
    print("\n".join("     | " + x for x in out.strip().splitlines()[-4:]))
    check("exit 1 FAILED -> exchanging back", rc == 1 and "exchanging the previous dist back" in out)
    check("live tree byte-identical after rollback", tree_md5(a) == before)
    check("pm2 restarted twice (new, then old)", calls(c).count("restart") == 2)

    print("== case lowmem (sidekiq stop + safety timer, always restarted)")
    c = H + "/case-lowmem"
    a = mkbox(c)
    rc, out = run(c, script(c, False, min_mb=10 ** 9))
    log = calls(c)
    print("\n".join("     | " + x[:110] for x in log.strip().splitlines()))
    order = [" ".join(x.split()[:2]) for x in log.strip().splitlines() if not x.startswith("restart")]
    check("exit 0", rc == 0)
    check("sdk read, timer armed, sidekiq stopped, scoped build, started, timer cancelled (in that order)",
          order == ["docker exec", "systemd-run --on-active=1300", "docker stop", "systemd-run --scope",
                    "docker start", "systemctl stop"])
    check("timer is uniquely named and cancelled by that name",
          re.search(r"--unit=(prnm-sidekiq-guard-\S+) ", log) and "systemctl stop %s.timer" % re.search(
              r"--unit=(prnm-sidekiq-guard-\S+) ", log).group(1) in log)
    check("timer disclosed in output (name, schedule, command)", "prnm-sidekiq-guard-" in out and "+1300 s" in out
          and "docker start chatwoot-sidekiq-1" in out)

    print("== case lowmem + buildfail (sidekiq still restarted)")
    c = H + "/case-lowmem-fail"
    a = mkbox(c)
    open(a + "/FAIL_BUILD", "w").write("1")
    rc, out = run(c, script(c, False, min_mb=10 ** 9))
    log = calls(c)
    check("exit 1 and sidekiq started + timer cancelled", rc == 1 and "docker start chatwoot-sidekiq-1" in log
          and re.search(r"systemctl stop prnm-sidekiq-guard-\S+\.timer", log))

    print("== case lowmem, guard timer cannot be created (sidekiq must stay up)")
    c = H + "/case-lowmem-noguard"
    a = mkbox(c)
    rc, out = run(c, script(c, False, min_mb=10 ** 9), {"FAKE_TIMER_RC": "1"})
    log = calls(c)
    check("exit 0, no docker stop, build still capped", rc == 0 and "docker stop" not in log
          and "systemd-run --scope" in log and "not created; sidekiq left running" in out)

    print("\nharness:", "ALL OK" if not check.fails else "%d FAIL(S)" % check.fails)
    srv.shutdown()
    shutil.rmtree(H, ignore_errors=True)
    sys.exit(1 if check.fails else 0)


if __name__ == "__main__":
    main()
