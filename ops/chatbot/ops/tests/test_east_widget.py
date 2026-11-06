# Local harness for ops/chatbot/ops/east_widget.py against a fake EAST box. Touches no server.
# Run: PATH=/path/to/node/bin:$PATH python3 ops/chatbot/ops/tests/test_east_widget.py   (needs node, curl)
# The real script is copied with ONLY these substitutions: DRY, SHA/SUM, RAW (file://), APP, SITE (local
# server), backup/stage dirs, sudo prefix, pm2 command, sleep, the token query (echo), the sdk.js URL, MIN_MB.
import hashlib, http.server, os, shutil, subprocess, sys, tempfile, threading, time

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))
H = tempfile.mkdtemp(prefix="prnm-ops-test-")  # all fake boxes live here
SCRIPT = REPO + "/ops/chatbot/ops/east_widget.py"
BOX = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "east__root.tsx")  # EAST copy, md5 c6aedc95...
TSX = REPO + "/ops/chatbot/ops/east/chatwoot-widget.tsx"
TOKEN = "TestToken1234567890abcd"
PORT = 8797
STATE = {"inject": False}

FAKEBUILD = r'''
import fs from "node:fs"; import crypto from "node:crypto";
if (fs.existsSync("FAIL_BUILD")) { console.error("fake build failure"); process.exit(1); }
// in-place writer, like the TanStack router plugin's routeTree.gen.ts
fs.writeFileSync("src/routeTree.gen.ts", "// regenerated " + Date.now() + "\n");
let out = fs.readFileSync("src/routes/__root.tsx", "utf8");
if (out.includes('from "@/components/chatwoot-widget"')) {
  let comp = fs.readFileSync("src/components/chatwoot-widget.tsx", "utf8");
  const env = fs.existsSync(".env.production.local") ? fs.readFileSync(".env.production.local", "utf8") : "";
  const m = env.match(/^VITE_CHATWOOT_WEBSITE_TOKEN=(.*)$/m);
  if (m) comp = comp.split("import.meta.env.VITE_CHATWOOT_WEBSITE_TOKEN").join(JSON.stringify(m[1]));
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


class Site(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        p = self.path.split("?")[0]
        inj = STATE.get("inject")
        if p in ("/", "/p/how-to-host-a-pool-party", "/packs/js/sdk.js"):
            body = ("page %s %s" % (p, "prnm-chatwoot-v1" if inj and os.path.exists(inj) else "")).encode()
            self.send_response(200)
        else:
            body = b"nope"
            self.send_response(404)
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
    return a


def script(c, dry, min_mb=0):
    s = open(SCRIPT).read()
    reps = [
        ("DRY = True\n", "DRY = %s\n" % dry),
        ('SHA = "REPLACE_AFTER_COMMIT"', 'SHA = "TESTSHA"'),
        ('SUM = "REPLACE_AFTER_COMMIT"', 'SUM = "%s"' % hashlib.sha256(open(TSX, "rb").read()).hexdigest()),
        ('RAW = "https://raw.githubusercontent.com/derekbowen/poolrentalnearme-web/%s/ops/chatbot/ops/east/" % SHA',
         'RAW = "file://%s/ops/chatbot/ops/east/"' % REPO),
        ('APP = "/home/ubuntu/fresh-web"', 'APP = "%s/app"' % c),
        ('SITE = "https://www.poolrentalnearme.com"', 'SITE = "http://127.0.0.1:%d"' % PORT),
        ('"/home/ubuntu/backup-east-chatwoot-widget-"', '"%s/bk-"' % c),
        ('"/home/ubuntu/fresh-web-stage-"', '"%s/stage-"' % c),
        ('"cd /home/ubuntu && sudo -u ubuntu PM2_HOME=/home/ubuntu/.pm2 bash -lc "', '"bash -c "'),
        ('ub("pm2 restart fresh-web")', 'ub("echo restart >> %s/calls.log")' % c),
        ("time.sleep(10)", "time.sleep(0)"),
        ('"docker exec chatwoot-postgres-1 psql -U postgres -d chatwoot_production -Atc \\"select w.website_token from "',
         '"echo %s # "' % TOKEN),
        ("https://chat.poolrentalnearme.com/packs/js/sdk.js", "http://127.0.0.1:%d/packs/js/sdk.js" % PORT),
        ("MIN_MB = 1536", "MIN_MB = %d" % min_mb),
    ]
    for a, b in reps:
        assert s.count(a) == 1, a
        s = s.replace(a, b)
    p = c + "/east_widget.test.py"
    open(p, "w").write(s)
    return p


def run(c, p, extra_env=None):
    STATE["inject"] = c + "/INJECT"
    env = dict(os.environ, PATH=c + "/bin:" + os.environ["PATH"], PRNM_INJECT_FILE=c + "/INJECT", **(extra_env or {}))
    r = subprocess.run([sys.executable, p], capture_output=True, text=True, env=env)
    return r.returncode, r.stdout + r.stderr


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


def main():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Site)
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    print("== case dry")
    c = H + "/case-dry"
    a = mkbox(c)
    before = tree_md5(a)
    rc, out = run(c, script(c, True))
    check("exit 1 with DRY RUN", rc == 1 and "DRY RUN: nothing changed" in out)
    check("app tree unchanged", tree_md5(a) == before)
    check("no stage/backup dirs", not [x for x in os.listdir(c) if x.startswith(("stage-", "bk-"))])

    print("== case ok")
    c = H + "/case-ok"
    a = mkbox(c)
    nm_ino = os.stat(a + "/node_modules/pkg/index.js").st_ino
    rc, out = run(c, script(c, False))
    print("\n".join("     | " + x for x in out.strip().splitlines()[-6:]))
    root = open(a + "/src/routes/__root.tsx").read()
    js = [f for f in os.listdir(a + "/dist/client/fw-assets") if f.startswith("index-") and f != "index-OLDHASH.js"]
    bundle = open(a + "/dist/client/fw-assets/" + js[0]).read() if js else ""
    check("exit 0 DONE", rc == 0 and "DONE." in out)
    check("__root.tsx has import + mount", root.count("ChatwootWidget") == 2)
    check("component installed", os.path.exists(a + "/src/components/chatwoot-widget.tsx"))
    check(".env.production.local mode 600 with token",
          oct(os.stat(a + "/.env.production.local").st_mode & 0o777) == "0o600"
          and TOKEN in open(a + "/.env.production.local").read())
    check("live dist has the new bundle with marker and token", "prnm-chatwoot-v1" in bundle and TOKEN in bundle)
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
    check("pm2 restart called once", open(c + "/calls.log").read().count("restart") == 1)
    check("dist.bak-* not copied into stage (no stray copy in backup)", not os.path.exists(
        "%s/%s/dist-prev/dist.bak-old" % (c, bk[0])) if bk else False)
    rc2, out2 = run(c, script(c, False))
    check("second run refuses (drift + files exist)", rc2 == 1 and "drift" in out2 and "exists" in out2)

    print("== case buildfail")
    c = H + "/case-buildfail"
    a = mkbox(c)
    open(a + "/FAIL_BUILD", "w").write("1")
    before = tree_md5(a)
    rc, out = run(c, script(c, False))
    check("exit 1 build failed", rc == 1 and "ABORT: build failed; live site untouched" in out)
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
    check("pm2 restarted twice (new, then old)", open(c + "/calls.log").read().count("restart") == 2)

    print("== case lowmem (sidekiq stop + safety timer, always restarted)")
    c = H + "/case-lowmem"
    a = mkbox(c)
    for tool in ("docker", "systemd-run", "systemctl"):
        open("%s/bin/%s" % (c, tool), "w").write('#!/bin/sh\necho "%s $*" >> %s/calls.log\n' % (tool, c))
        os.chmod("%s/bin/%s" % (c, tool), 0o755)
    rc, out = run(c, script(c, False, min_mb=10 ** 9))
    calls = open(c + "/calls.log").read()
    print("\n".join("     | " + x for x in calls.strip().splitlines()))
    order = [x.split()[0] + " " + x.split()[1] for x in calls.strip().splitlines() if not x.startswith("restart")]
    check("exit 0", rc == 0)
    check("timer armed, sidekiq stopped, started, timer cancelled (in that order)",
          order == ["systemd-run --on-active=1200", "docker stop", "docker start", "systemctl stop"])
    check("timer disclosed in output", "prnm-sidekiq-guard" in out and "+20 min" in out)

    print("== case lowmem + buildfail (sidekiq still restarted)")
    c = H + "/case-lowmem-fail"
    a = mkbox(c)
    open(a + "/FAIL_BUILD", "w").write("1")
    for tool in ("docker", "systemd-run", "systemctl"):
        open("%s/bin/%s" % (c, tool), "w").write('#!/bin/sh\necho "%s $*" >> %s/calls.log\n' % (tool, c))
        os.chmod("%s/bin/%s" % (c, tool), 0o755)
    rc, out = run(c, script(c, False, min_mb=10 ** 9))
    calls = open(c + "/calls.log").read()
    check("exit 1 and sidekiq started + timer cancelled", rc == 1 and "docker start chatwoot-sidekiq-1" in calls
          and "systemctl stop prnm-sidekiq-guard.timer" in calls)

    print("\nharness:", "ALL OK" if not check.fails else "%d FAIL(S)" % check.fails)
    srv.shutdown()
    sys.exit(1 if check.fails else 0)


if __name__ == "__main__":
    main()
