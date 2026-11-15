#!/usr/bin/env python3
"""Local harness for east_seo_release.py + the release's ops/deploy-east.sh. Touches no server.

    python3 ops/east/seo-release-2026-11/test/run_tests.py [--keep] [--only name,name]

It simulates EAST in a scratch directory (default: $RELEASE_TEST_DIR, else the session
scratchpad's release-test/):

  github.git      a local bare repo standing in for GitHub: ops/deploy-sha-enforcement
                  (the commit EAST runs) and seo/release-2026-11 (the fresh-web commit
                  under test, default seo/07-release-tracking), plus bad/* branches
  east/fresh-web  a clone at ops/deploy-sha-enforcement with the five EAST-only files
                  modified locally, node_modules symlinked, a .env holding a sentinel,
                  and a dist/ built by the stub build + the REAL scripts/stamp-build.mjs
  live server     a local HTTP server standing in for BASE. It serves the stamp from
                  dist/ on disk, as serve.mjs does (control/live_frozen pins an old one)
  control/loaded  the stamp of the build the "process" has loaded: the fake pm2 updates it only
                  on a restart that really happens. Because the live stamp is read from disk, a
                  restart can only be proven through pm2; every end-state check reads this too.
  fakebin/        sudo, pm2, npm, node, sleep, systemd-run shims (see each file)

Real code under test: the whole of east_seo_release.py (its constants rewritten the way an
operator fills them in, plus test paths), ship.py's steps (run through bash exactly as SSM
would run them), the release's ops/deploy-east.sh end to end (allowlist, build copy,
typecheck/build gates, stamp checks, smoke against the real serve.mjs, asset carry-over,
swap, proven restart, live SHA polling, attestation, restore_dist), scripts/stamp-build.mjs,
check-deployed-sha.mjs and check-production-drift.mjs. Stubbed: tsc, the vite half of the
build, the other verify:production checks, check-price-variants (they need production) and
systemd (the shim records the scope and its memory caps).
"""
import argparse, hashlib, http.server, json, os, re, shutil, socket, subprocess, sys, threading, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(os.path.dirname(HERE), "east_seo_release.py")
RUNNERS = os.path.join(HERE, "..", "..", "..", "runners")
DEFAULT_DIR = "/tmp/claude-0/-home-user-poolrentalnearme-web/1f29cae8-9a21-55ff-8af7-de45b781f323/scratchpad/release-test"
FIVE = ["src/components/home-page.tsx", "src/routes/__root.tsx", "src/server/listing-sync.server.ts",
        "src/server/sharetribe.server.ts", "src/lib/listing-slug.ts"]
BASE_SHA = "77028454655e7b272d8c23987b54f445f9eba9f7"
REL_BRANCH = "seo/release-2026-11"

ap = argparse.ArgumentParser()
ap.add_argument("--src", default="/home/user/fresh-web-seo-release", help="fresh-web checkout to take refs from (read only)")
ap.add_argument("--ref", default="refs/heads/seo/07-release-tracking", help="the release commit under test")
ap.add_argument("--base-ref", default="refs/remotes/origin/ops/deploy-sha-enforcement")
ap.add_argument("--node-modules", default="/home/user/fresh-web-702e04c3/node_modules")
ap.add_argument("--dir", default=os.environ.get("RELEASE_TEST_DIR", DEFAULT_DIR))
ap.add_argument("--only", default="")
ap.add_argument("--keep", action="store_true", help="keep the scratch tree afterwards")
ap.add_argument("--show", action="store_true", help="print every east_seo_release.py transcript")
A = ap.parse_args()

SIM = os.path.join(os.path.abspath(A.dir), "sim")
GH = os.path.join(SIM, "github.git")
TPL = os.path.join(SIM, "template")
EAST = os.path.join(SIM, "east")
REPO = os.path.join(EAST, "fresh-web")
CTL = os.path.join(SIM, "control")
FAKEBIN = os.path.join(HERE, "fakebin")
GITID = ["-c", "user.name=harness", "-c", "user.email=harness"]


def sh(cmd, cwd=None, env=None, check=True):
    r = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True, shell=isinstance(cmd, str))
    if check and r.returncode:
        raise RuntimeError("command failed: %s\n%s%s" % (cmd, r.stdout[-2000:], r.stderr[-2000:]))
    return r.stdout.strip()


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


# ------------------------------------------------------------------ live server ----
class Live(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("/fw-assets/__build.json", "/__build.json"):
            frozen = os.path.join(CTL, "live_frozen")
            src = frozen if os.path.exists(frozen) else os.path.join(REPO, "dist/client/fw-assets/__build.json")
            try:
                body, code = open(src, "rb").read(), 200
            except OSError:
                body, code = b"not found", 404
        else:
            body, code = b"<html><body><h1>ok</h1></body></html>", 200
        self.send_response(code)
        self.send_header("Content-Type", "application/json" if code == 200 and path.endswith(".json") else "text/html")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


LIVE_PORT = free_port()
srv = http.server.ThreadingHTTPServer(("127.0.0.1", LIVE_PORT), Live)
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = "http://127.0.0.1:%d" % LIVE_PORT

ENV = dict(os.environ)
ENV.update({
    "PATH": FAKEBIN + ":" + os.environ["PATH"],
    "SIM_ROOT": SIM, "SIM_REAL_NODE": shutil.which("node"), "SIM_REAL_SLEEP": shutil.which("sleep"),
    "SMOKE_PORT": str(free_port()), "NO_PROXY": "127.0.0.1,localhost", "no_proxy": "127.0.0.1,localhost",
})
for k in ("NODE_OPTIONS", "PRNM_RUNNER_TIMEOUT", "TOLERATED_DIRTY_FILES", "EAST_ONLY_SHA256"):
    ENV.pop(k, None)


# ----------------------------------------------------------------------- setup ----
def setup():
    shutil.rmtree(SIM, ignore_errors=True)
    os.makedirs(CTL)
    open(os.path.join(CTL, "secret"), "w").write("SENTINEL-not-a-real-secret-%d" % os.getpid())
    sh(["git", "init", "-q", "--bare", GH])
    # --update-shallow: the session's fresh-web clones are shallow, so this stand-in is too
    sh(["git", "--git-dir", GH, "fetch", "-q", "--no-tags", "--update-shallow", A.src,
        "%s:refs/heads/ops/deploy-sha-enforcement" % A.base_ref, "%s:refs/heads/%s" % (A.ref, REL_BRANCH)])
    base = sh(["git", "--git-dir", GH, "rev-parse", "ops/deploy-sha-enforcement"])
    if base != BASE_SHA:
        raise SystemExit("base ref is %s, expected %s" % (base, BASE_SHA))
    rel = sh(["git", "--git-dir", GH, "rev-parse", REL_BRANCH])
    # bad/* release candidates, each one commit on top of the real release (or the base)
    work = os.path.join(SIM, "work")
    sh(["git", "clone", "-q", GH, work])
    def bad(name, start, edit):
        sh(["git", "checkout", "-q", "-B", name, start], cwd=work)
        edit(work)
        sh(["git", "add", "-A"], cwd=work)
        sh(["git", *GITID, "commit", "-q", "-m", name], cwd=work)
        sh(["git", "push", "-q", "origin", "HEAD:refs/heads/" + name], cwd=work)
    append = lambda rel_path, text: (lambda w: open(os.path.join(w, rel_path), "a").write(text))
    bad("bad/touches-five", rel, append("src/components/home-page.tsx", "// shipped from a repo (must be refused)\n"))
    bad("bad/adds-slug", rel, append("src/lib/listing-slug.ts", "export const x = 1;\n"))
    bad("bad/lockfile", rel, append("package-lock.json", "\n"))
    bad("bad/old-deploy", BASE_SHA, append("NOTES-test.md", "a release whose deploy-east.sh predates the allowlist\n"))
    bad("bad/moved", rel, append("NOTES-test.md", "the branch moved after the SHA was pinned\n"))
    shas = {n: sh(["git", "--git-dir", GH, "rev-parse", n]) for n in
            ("bad/touches-five", "bad/adds-slug", "bad/lockfile", "bad/old-deploy", "bad/moved")}
    # the EAST checkout as it is today
    tpl = os.path.join(TPL, "fresh-web")
    sh(["git", "clone", "-q", "--branch", "ops/deploy-sha-enforcement", GH, tpl])
    for f in FIVE:
        os.makedirs(os.path.dirname(os.path.join(tpl, f)), exist_ok=True)
        with open(os.path.join(tpl, f), "a") as fh:
            fh.write("// EAST-only local edit (test)\n")
    os.symlink(A.node_modules, os.path.join(tpl, "node_modules"))
    open(os.path.join(tpl, ".env"), "w").write("DUMMY_SECRET=%s\n" % open(os.path.join(CTL, "secret")).read())
    r = subprocess.run(["npm", "run", "build"], cwd=tpl, env=ENV, capture_output=True, text=True)
    if r.returncode:
        raise SystemExit("template build failed: " + r.stdout + r.stderr)
    return rel, shas


MEM_AVAIL_KB, SWAP_FREE_KB = 3000 * 1024, 2000 * 1024


def reset():
    shutil.rmtree(EAST, ignore_errors=True)
    for n in os.listdir(CTL):
        if n != "secret":
            pth = os.path.join(CTL, n)
            shutil.rmtree(pth) if os.path.isdir(pth) else os.remove(pth)
    sh(["cp", "-a", TPL, EAST])
    shutil.copy(os.path.join(REPO, "dist/client/fw-assets/__build.json"), os.path.join(CTL, "loaded"))
    os.makedirs(os.path.join(CTL, "cgroup"))
    open(os.path.join(CTL, "cgroup", "cgroup.controllers"), "w").write("cpuset cpu io memory pids\n")
    meminfo(MEM_AVAIL_KB, SWAP_FREE_KB)


def meminfo(avail_kb, swap_kb):
    open(os.path.join(CTL, "meminfo"), "w").write(
        "MemTotal:        3900000 kB\nMemAvailable:   %d kB\nSwapTotal:       2097148 kB\nSwapFree:       %d kB\n" % (avail_kb, swap_kb))


def ctl(name, text=""):
    open(os.path.join(CTL, name), "w").write(text)


def loaded():
    try:
        return json.load(open(os.path.join(CTL, "loaded"))).get("sha")
    except Exception:
        return None


def sha256(p):
    try:
        return hashlib.sha256(open(p, "rb").read()).hexdigest()
    except OSError:
        return None


def snap():
    g = lambda *a: sh(["git", "-C", REPO, *a], check=False)
    try:
        lv = json.loads(urllib.request.urlopen(BASE + "/fw-assets/__build.json", timeout=5).read())
    except Exception:
        lv = {}
    stamp_p = os.path.join(REPO, "dist/client/fw-assets/__build.json")
    st = json.load(open(stamp_p)) if os.path.exists(stamp_p) else {}
    dep = os.path.join(REPO, ".deployed-sha")
    return {
        "head": g("rev-parse", "HEAD"), "branch": g("rev-parse", "--abbrev-ref", "HEAD"),
        "five": {f: sha256(os.path.join(REPO, f)) for f in FIVE},
        "live": lv.get("sha"), "live_files": sorted(lv.get("dirtyFiles") or []), "live_dirty": lv.get("dirty"),
        "dist": st.get("sha"), "dist_stamp_md5": hashlib.md5(open(stamp_p, "rb").read()).hexdigest() if st else None,
        "dist_server": os.path.exists(os.path.join(REPO, "dist/server/server.js")),
        "prev_deploy": os.path.exists(os.path.join(REPO, "dist-prev-deploy")),
        "deployed": json.load(open(dep)).get("sha") if os.path.exists(dep) else None,
        "pins": os.path.exists(os.path.join(EAST, "pins.sha256")), "state": os.path.exists(os.path.join(EAST, "state.json")),
        "refs": hashlib.md5(g("for-each-ref").encode()).hexdigest(),
        "fetch_head": os.path.exists(os.path.join(REPO, ".git/FETCH_HEAD")),
        "status": g("status", "--porcelain"),
        "loaded": loaded(), "build_copy": os.path.exists(os.path.join(EAST, "fresh-web.build")),
        "restarts": open(os.path.join(CTL, "pm2_restarts")).read().strip() if os.path.exists(os.path.join(CTL, "pm2_restarts")) else "0",
    }


def script_copy(mode, sha, branch, remote=None, **extra):
    """east_seo_release.py with its constants filled in, the way an operator fills them."""
    src = open(SCRIPT).read()
    subs = {"MODE": mode, "RELEASE_SHA": sha, "RELEASE_BRANCH": branch, "REPO": REPO,
            "REMOTE": remote or "file://" + GH, "BASE": BASE, "PINS": os.path.join(EAST, "pins.sha256"),
            "STATE": os.path.join(EAST, "state.json"), "BACKUP": os.path.join(EAST, "backup"),
            "BUILD_DIR": os.path.join(EAST, "fresh-web.build"), "MEMINFO": os.path.join(CTL, "meminfo"),
            "CGROUP": os.path.join(CTL, "cgroup"), "PROC_CGROUP": os.path.join(CTL, "cgroup-%d")}
    subs.update(extra)
    for k, v in subs.items():
        new = "%s = %s" % (k, repr(v) if isinstance(v, str) else v)
        src, n = re.subn(r"(?m)^%s = .*$" % k, lambda m: new, src)
        assert n == 1, "constant %s found %d times" % (k, n)
    p = os.path.join(SIM, "east_seo_release.%s.py" % mode.lower())
    open(p, "w").write(src)
    return p


def run_script(mode, sha=None, branch=REL_BRANCH, raw=False, env=None, **kw):
    p = SCRIPT if raw else script_copy(mode, sha, branch, **kw)
    r = subprocess.run([sys.executable, "-u", p], env=dict(ENV, **(env or {})), capture_output=True, text=True, timeout=900)
    out = r.stdout + r.stderr
    if A.show:
        print("  ----- %s %s rc=%d (%d bytes)\n%s\n  -----" % (mode, CUR[0], r.returncode, len(out.encode()), out))
    secret = open(os.path.join(CTL, "secret")).read()
    check(secret not in out, "%s output never contains the .env/pm2 sentinel" % mode)
    check(len(out.encode()) < 20000, "%s output is %d bytes (< 20 KB; SSM truncates ~24 KB)" % (mode, len(out.encode())))
    return r.returncode, out


def deploy_east(**env):
    e = dict(ENV, REPO_DIR=REPO, BASE_URL=BASE, **env)
    r = subprocess.run(["bash", "ops/deploy-east.sh"], cwd=REPO, env=e, capture_output=True, text=True, timeout=600)
    return r.returncode, r.stdout + r.stderr


def write_pins(extra=""):
    p = os.path.join(EAST, "pins.sha256")
    open(p, "w").write(sh(["sha256sum", *FIVE], cwd=REPO) + "\n" + extra)
    return p


# ------------------------------------------------------------------ assertions ----
RESULTS = []
CUR = [""]


def check(cond, what, detail=""):
    RESULTS.append((CUR[0], bool(cond), what))
    if not cond:
        print("    FAIL %s %s" % (what, ("\n      " + str(detail)[-1500:].replace("\n", "\n      ")) if detail else ""))


def unchanged(before, out, what="nothing changed"):
    after = snap()
    keys = ["head", "branch", "five", "live", "dist", "dist_stamp_md5", "deployed", "pins", "state", "refs", "fetch_head", "status",
            "loaded", "build_copy", "restarts"]
    diff = {k: (before[k], after[k]) for k in keys if before[k] != after[k]}
    check(not diff, what, "%s\n%s" % (diff, out[-1200:]))


def at_prev(before, out, five_same=True):
    s = snap()
    check(s["head"] == BASE_SHA and s["branch"] == "ops/deploy-sha-enforcement", "HEAD back on %s (ops/deploy-sha-enforcement)" % BASE_SHA[:8], (s["head"], s["branch"], out[-1500:]))
    check(s["dist"] == BASE_SHA and s["dist_server"], "dist/ is the previous build", (s["dist"], s["dist_server"]))
    check(s["live"] == BASE_SHA, "live stamp reports the previous sha", s["live"])
    check(s["loaded"] == BASE_SHA, "the process has the previous build LOADED (pm2 restart really happened, or never needed)", s["loaded"])
    check(not s["prev_deploy"], "no dist-prev-deploy left behind")
    check(not s["build_copy"], "no build copy left behind")
    check(s["deployed"] == before["deployed"], ".deployed-sha is what it was before", (before["deployed"], s["deployed"]))
    if five_same:
        check(s["five"] == before["five"], "five EAST-only files byte-for-byte unchanged")
    return s


SCENARIOS = []


def scenario(fn):
    SCENARIOS.append(fn)
    return fn


@scenario
def stamp_build_is_real():
    """The real stamp-build lists exactly the five, so deploy-east's step 3 compares real output."""
    st = json.load(open(os.path.join(REPO, "dist/client/fw-assets/__build.json")))
    check(st["sha"] == BASE_SHA and st["dirty"] == 5 and sorted(st["dirtyFiles"]) == sorted(FIVE), "template stamp: base sha, dirty 5, exactly the five", st)
    open(os.path.join(REPO, "notes-local.ts"), "w").write("x\n")
    subprocess.run(["node", "scripts/stamp-build.mjs"], cwd=REPO, env=ENV, capture_output=True)
    st = json.load(open(os.path.join(REPO, "dist/client/fw-assets/__build.json")))
    check(st["dirty"] == 6 and "notes-local.ts" in st["dirtyFiles"], "an extra file shows in the real stamp", st)


@scenario
def placeholders_refused():
    before = snap()
    rc, out = run_script("PLAN", raw=True)
    check(rc != 0 and "placeholders" in out, "unfilled script refuses to run", out[-500:])
    unchanged(before, out)


@scenario
def plan_is_read_only():
    before = snap()
    rc, out = run_script("PLAN", REL_SHA)
    check(rc == 0 and "PLAN OK" in out, "PLAN passes", out[-1500:])
    check("release changes" in out, "PLAN lists the changed files")
    unchanged(before, out, "PLAN changed nothing (refs, FETCH_HEAD, tree, dist, live, no pins/state)")


@scenario
def happy_path():
    before = snap()
    rc, out = run_script("GO", REL_SHA)
    s = snap()
    check(rc == 0 and "RESULT: RELEASED " in out, "GO exits 0 with RELEASED", out[-3000:])
    check(s["head"] == REL_SHA and s["branch"] == REL_BRANCH, "HEAD is the release on its named branch", (s["head"], s["branch"]))
    check(s["five"] == before["five"], "five EAST-only files byte-for-byte unchanged")
    check(s["live"] == REL_SHA and s["live_dirty"] == 5 and s["live_files"] == sorted(FIVE), "live stamp: release sha, dirty 5, exactly the five", s)
    check(s["dist"] == REL_SHA and s["dist_server"] and not s["prev_deploy"], "new dist present, dist-prev-deploy cleaned up")
    check(s["deployed"] == REL_SHA, ".deployed-sha attests the release")
    check(s["pins"] and s["state"], "pin file and state file written outside the tree")
    check(os.path.isdir(os.path.join(EAST, "backup", "dist-" + BASE_SHA[:12], "server")), "previous dist kept for ROLLBACK")
    check(os.path.exists(os.path.join(EAST, "backup", "east-only-%s.tar" % BASE_SHA[:12])), "the five EAST-only files copied to the backup")
    check(s["loaded"] == REL_SHA, "the process LOADED the release (restart proven)", s["loaded"])
    check(open(os.path.join(CTL, "live_during_build")).read() == BASE_SHA, "the live dist/ was untouched while the release built (built in the copy)")
    check(not s["build_copy"], "build copy removed")
    old = [n for n in os.listdir(os.path.join(TPL, "fresh-web/dist/client/fw-assets")) if n != "__build.json"]
    new = os.listdir(os.path.join(REPO, "dist/client/fw-assets"))
    own = open(os.path.join(REPO, "dist/.own-assets")).read().split()
    check(old and all(n in new for n in old), "the previous build's hashed assets are still served (Cloudflare holds old HTML 600 s)", (old, new))
    check(own and not set(own) & set(old), ".own-assets lists only the new build's own assets", own)
    check("carried %d previous asset" % len(old) in out, "the carry-over is reported")
    check("pm2 env names unchanged" in out and not os.path.exists(os.path.join(CTL, "pm2_env_extra")), "no restart merged the deploy shell's env (no --update-env)")
    log = open(os.path.join(CTL, "log")).read()
    cap = [l for l in log.split("\n") if l.startswith("systemd-run")]
    want = "MemoryMax=%dM MemorySwapMax=%dM" % (MEM_AVAIL_KB // 1024 - 512, 1536)
    check(len(cap) == 1 and want in cap[0], "deploy ran in one memory-capped scope (%s)" % want, cap)
    check("peak 1234 MB" in out, "the scope's memory peak is reported", out[-800:])
    check("npm run build NODE_OPTIONS=--max-old-space-size=3072" in log, "build ran with the 3072 MB heap", log)
    check("npm run check:types NODE_OPTIONS=--max-old-space-size=3072" in log, "typecheck ran with the 3072 MB heap")
    restarts = [l for l in log.split("\n") if l.startswith("pm2 restart")]
    check(restarts and all(l.endswith("NODE_OPTIONS=") and "--update-env" not in l for l in restarts), "pm2 restart: no build heap, no --update-env", restarts)
    check("tracker regression 9/9 PASS" in out, "tracker regression group ran (9/9)", out[-600:])
    check("tolerated" in out and "DEPLOYED" in out, "deploy-east tolerated the five and reached DEPLOYED")
    e = dict(ENV, REPO_DIR=REPO, BASE_URL=BASE)
    r = subprocess.run(["node", "scripts/check-production-drift.mjs"], cwd=REPO, env=e, capture_output=True, text=True)
    check(r.returncode != 0, "drift check WITHOUT the tolerated list still fails on the five (old rule)", r.stdout[-400:])
    r = subprocess.run(["node", "scripts/check-production-drift.mjs"], cwd=REPO, env=dict(e, TOLERATED_DIRTY_FILES=",".join(FIVE)), capture_output=True, text=True)
    check(r.returncode == 0, "drift check with exactly the five passes", r.stdout[-600:] + r.stderr[-600:])
    r = subprocess.run(["node", "scripts/check-production-drift.mjs"], cwd=REPO, env=dict(e, TOLERATED_DIRTY_FILES=",".join(FIVE[:4])), capture_output=True, text=True)
    check(r.returncode != 0, "drift check with only four of the five fails")
    sha = lambda tol, exp=REL_SHA: subprocess.run(["node", "scripts/check-deployed-sha.mjs"], cwd=REPO, capture_output=True, text=True,
                                                   env=dict(e, EXPECTED_SHA=exp, **({"TOLERATED_DIRTY_FILES": tol} if tol is not None else {}))).returncode
    check(sha(",".join(FIVE)) == 0, "check:deployed-sha passes with exactly the five")
    check(sha(None) != 0, "check:deployed-sha without the list fails on dirty (old rule)")
    check(sha(",".join(FIVE + ["src/extra.ts"])) != 0, "check:deployed-sha with a sixth expected file fails")
    check(sha(",".join(FIVE), BASE_SHA) != 0, "check:deployed-sha with the wrong EXPECTED_SHA fails")


@scenario
def rollback_after_release():
    before = snap()
    rc, out = run_script("GO", REL_SHA)
    check(rc == 0, "release first", out[-1500:])
    rc, out = run_script("ROLLBACK", REL_SHA)
    check(rc == 0 and "ROLLED BACK" in out, "ROLLBACK exits 0", out[-2000:])
    at_prev(before, out)
    rc, out = run_script("GO", REL_SHA)
    check(rc == 0 and snap()["live"] == REL_SHA, "the same release can ship again after a rollback", out[-1500:])


@scenario
def rollback_prefers_dist_prev_deploy():
    before = snap()
    rc, out = run_script("GO", REL_SHA)
    sh(["cp", "-a", os.path.join(EAST, "backup", "dist-" + BASE_SHA[:12]), os.path.join(REPO, "dist-prev-deploy")])
    rc, out = run_script("ROLLBACK", REL_SHA)
    check(rc == 0 and "dist restored from %s" % os.path.join(REPO, "dist-prev-deploy") in out, "ROLLBACK moves dist-prev-deploy back when it is the previous build", out[-1500:])
    at_prev(before, out)


@scenario
def rollback_restart_fails():
    """dist/ goes back on disk (so the live stamp reads the previous sha) but pm2 cannot restart: not a rollback."""
    before = snap()
    rc, out = run_script("GO", REL_SHA)
    ctl("pm2_fail_at", str(int(snap()["restarts"]) + 1))
    rc, out = run_script("ROLLBACK", REL_SHA)
    s = snap()
    check(s["live"] == BASE_SHA and s["loaded"] == REL_SHA, "precondition: the stamp lies (previous sha on disk, release still loaded)", s)
    check(rc != 0 and "ROLLBACK INCOMPLETE" in out and "pm2 restart rc 1" in out, "ROLLBACK fails when pm2 restart fails", out[-1500:])


@scenario
def rollback_restart_does_nothing():
    rc, out = run_script("GO", REL_SHA)
    ctl("pm2_noop")
    rc, out = run_script("ROLLBACK", REL_SHA)
    check(rc != 0 and "ROLLBACK INCOMPLETE" in out and "restart NOT proven" in out, "ROLLBACK fails when pm2 says ok but nothing restarted", out[-1500:])


@scenario
def gate_fails_and_restore_restart_fails_once():
    """Step 7b fails after the restart; deploy-east's own restore cannot restart; recover() must."""
    ctl("pv_fail"); ctl("pm2_fail_at", "2"); ctl("pm2_fail_until", "2")
    before = snap()
    rc, out = run_script("GO", REL_SHA)
    check(rc != 0 and "RESTORE IS NOT PROVEN" in out, "deploy-east says its restore is not proven", out[-2500:])
    check("production is back on the previous build" in out, "recover() restarts and proves it", out[-1500:])
    at_prev(before, out)


@scenario
def gate_fails_and_pm2_stays_broken():
    ctl("pv_fail"); ctl("pm2_fail_at", "2")
    rc, out = run_script("GO", REL_SHA)
    check(rc != 0 and "NOT FULLY RECOVERED" in out, "a restore that cannot restart is never reported as recovered", out[-1500:])
    check(loaded() == REL_SHA, "precondition: the release is still loaded")


def refused(sha, branch, why, **kw):
    before = snap()
    rc, out = run_script("GO", sha, branch, **kw)
    check(rc != 0 and "ABORT" in out and why in out, "GO refuses: %s" % why, out[-1500:])
    unchanged(before, out, "nothing changed (HEAD, five, dist, live, no pins/state)")


@scenario
def release_touches_a_five_file():
    refused(BAD["bad/touches-five"], "bad/touches-five", "release touches EAST-only file src/components/home-page.tsx")


@scenario
def release_adds_the_untracked_five_file():
    refused(BAD["bad/adds-slug"], "bad/adds-slug", "release touches EAST-only file src/lib/listing-slug.ts")


@scenario
def release_changes_lockfile():
    refused(BAD["bad/lockfile"], "bad/lockfile", "dependencies change")


@scenario
def release_without_allowlist():
    refused(BAD["bad/old-deploy"], "bad/old-deploy", "lacks the EAST-only allowlist, the build copy or the proven restart")


@scenario
def branch_moved_after_pinning():
    refused(REL_SHA, "bad/moved", "not the pinned RELEASE_SHA")


@scenario
def fetch_fails():
    refused(REL_SHA, REL_BRANCH, "fetch of", remote="file://" + os.path.join(SIM, "no-such-remote.git"))


@scenario
def extra_dirty_file():
    open(os.path.join(REPO, "src/extra-local.ts"), "w").write("export {};\n")
    refused(REL_SHA, REL_BRANCH, "extra ['src/extra-local.ts']")


@scenario
def five_file_missing():
    os.remove(os.path.join(REPO, "src/lib/listing-slug.ts"))
    refused(REL_SHA, REL_BRANCH, "missing ['src/lib/listing-slug.ts']")


@scenario
def head_not_expected():
    sh(["git", *GITID, "commit", "-q", "--allow-empty", "-m", "local commit"], cwd=REPO)
    before = snap()
    rc, out = run_script("GO", REL_SHA)
    check(rc != 0 and "expected %s" % BASE_SHA in out, "GO refuses when HEAD is not CURRENT_SHA", out[-800:])
    unchanged(before, out)


@scenario
def pm2_not_online():
    open(os.path.join(CTL, "pm2_status"), "w").write("errored")
    refused(REL_SHA, REL_BRANCH, "not online")


@scenario
def five_file_changes_after_preflight():
    open(os.path.join(CTL, "mutate_before_deploy"), "w").write("")
    before = snap()
    rc, out = run_script("GO", REL_SHA)
    check(rc != 0 and "(pinned, but sha256" in out, "deploy-east step 1 refuses the changed pinned file", out[-2500:])
    s = at_prev(before, out, five_same=False)
    check(s["five"]["src/components/home-page.tsx"] != before["five"]["src/components/home-page.tsx"], "the changed file is left as found (never reverted by the tool)")
    check("left as found, check by hand" in out, "the run says a human must look at the changed file")


@scenario
def five_file_changes_during_build():
    open(os.path.join(CTL, "mutate_during_build"), "w").write("")
    before = snap()
    rc, out = run_script("GO", REL_SHA)
    check(rc != 0 and "changed during the build" in out, "deploy-east step 3 catches the change", out[-2500:])
    at_prev(before, out, five_same=False)


@scenario
def typecheck_fails():
    open(os.path.join(CTL, "typecheck_fail"), "w").write("")
    before = snap()
    rc, out = run_script("GO", REL_SHA)
    check(rc != 0 and "typecheck failed" in out, "typecheck failure aborts", out[-1500:])
    s = at_prev(before, out)
    check(s["dist_stamp_md5"] == before["dist_stamp_md5"], "dist/ never touched")


@scenario
def build_fails():
    open(os.path.join(CTL, "build_fail"), "w").write("")
    before = snap()
    rc, out = run_script("GO", REL_SHA)
    check(rc != 0 and "build failed" in out, "build failure aborts", out[-2000:])
    s = at_prev(before, out)
    check(s["dist_stamp_md5"] == before["dist_stamp_md5"] and s["restarts"] == "0", "dist/ never touched and no restart (built in the copy)")


@scenario
def live_never_reports_new_sha():
    shutil.copy(os.path.join(REPO, "dist/client/fw-assets/__build.json"), os.path.join(CTL, "live_frozen"))
    before = snap()
    rc, out = run_script("GO", REL_SHA)
    check(rc != 0 and "production is not serving" in out, "step 6 fails when live never reports the release", out[-2000:])
    at_prev(before, out)


@scenario
def price_variants_fail_after_restart():
    open(os.path.join(CTL, "pv_fail"), "w").write("")
    before = snap()
    rc, out = run_script("GO", REL_SHA)
    check(rc != 0 and "tiered listing" in out, "a failing post-restart gate aborts", out[-2000:])
    at_prev(before, out)


@scenario
def deploy_killed_mid_build():
    """The deploy's share of the budget runs out mid-build: killed, and production was never touched."""
    ctl("build_hang")
    before = snap()
    rc, out = run_script("GO", REL_SHA, DEPLOY_MIN_S=4, RECOVER_S=60, env={"PRNM_RUNNER_TIMEOUT": "75"})
    check(rc != 0 and "exit 124" in out and "production is back on the previous build" in out, "the timed-out deploy is killed and reported", out[-2000:])
    s = at_prev(before, out)
    check(s["restarts"] == "0" and s["dist_stamp_md5"] == before["dist_stamp_md5"], "live dist/ never touched, no restart needed")


@scenario
def sigterm_mid_build():
    """SSM (or anyone) sends SIGTERM while the build runs: stop the deploy, then recover."""
    ctl("build_hang")
    before = snap()
    p = subprocess.Popen([sys.executable, "-u", script_copy("GO", REL_SHA, REL_BRANCH)], env=ENV, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    for _ in range(300):
        if os.path.exists(os.path.join(CTL, "build_pid")):
            break
        time.sleep(0.1)
    time.sleep(0.5)
    p.send_signal(15)
    out = p.communicate(timeout=300)[0]
    check(p.returncode == 1 and "interrupted: SystemExit SIGTERM" in out and "production is back on the previous build" in out, "SIGTERM is recovered from", out[-2000:])
    at_prev(before, out)
    bp = int(open(os.path.join(CTL, "build_pid")).read())
    gone = False
    for _ in range(50):
        try:
            os.kill(bp, 0)
            time.sleep(0.1)
        except OSError:
            gone = True
            break
    check(gone, "the hung build process was stopped, not left running")


@scenario
def budget_too_small():
    refused(REL_SHA, REL_BRANCH, "kept for recovery", env={"PRNM_RUNNER_TIMEOUT": "1200"})


@scenario
def memory_too_low():
    meminfo(1500 * 1024, SWAP_FREE_KB)
    refused(REL_SHA, REL_BRANCH, "MemAvailable 1500 MB < 2048 MB")


@scenario
def no_memory_cgroup():
    open(os.path.join(CTL, "cgroup", "cgroup.controllers"), "w").write("cpu io pids\n")
    refused(REL_SHA, REL_BRANCH, "cannot be memory-capped")


@scenario
def deploy_escapes_scope():
    ctl("scope_escape")
    before = snap()
    rc, out = run_script("GO", REL_SHA)
    check(rc != 0 and "not inside its memory-capped scope" in out, "a deploy outside its memory cap is stopped", out[-2000:])
    at_prev(before, out)


@scenario
def east_only_edited_after_live_build():
    """An edit on the box after the live build: its content is not what production runs. Refused."""
    with open(os.path.join(REPO, "src/server/listing-sync.server.ts"), "a") as f:
        f.write("// edited on the box after the live build (test)\n")
    before = snap()
    rc, out = run_script("PLAN", REL_SHA)
    check(rc == 0 and "GO WOULD REFUSE" in out and "changed after the live build (['src/server/listing-sync.server.ts'])" in out, "PLAN reports the newer EAST-only file", out[-1200:])
    unchanged(before, out)
    refused(REL_SHA, REL_BRANCH, "changed after the live build")
    rc, out = run_script("PLAN", REL_SHA, ALLOW_EAST_ONLY_NEWER=True)
    check(rc == 0 and "PLAN OK" in out, "the explicit override lifts that gate (after a human read it)", out[-800:])


@scenario
def two_releases_carry_one_generation():
    """Release, then a second release on top: the dist carries the previous build's assets, never older ones."""
    rc, out = run_script("GO", REL_SHA)
    check(rc == 0, "first release", out[-1500:])
    t_assets = [n for n in os.listdir(os.path.join(TPL, "fresh-web/dist/client/fw-assets")) if n != "__build.json"]
    r1_own = open(os.path.join(REPO, "dist/.own-assets")).read().split()
    rel2 = BAD["bad/moved"]
    rc, out = run_script("GO", rel2, "bad/moved", CURRENT_SHA=REL_SHA)
    s = snap()
    names = os.listdir(os.path.join(REPO, "dist/client/fw-assets"))
    check(rc == 0 and s["live"] == rel2 and s["loaded"] == rel2, "second release shipped and loaded", out[-1500:])
    check(all(n in names for n in r1_own) and not any(n in names for n in t_assets), "carries the first release's assets, not the template's", (names, r1_own, t_assets))


@scenario
def leftover_prev_deploy_refused():
    sh(["cp", "-a", os.path.join(REPO, "dist"), os.path.join(REPO, "dist-prev-deploy")])
    before = snap()
    rc, out = run_script("PLAN", REL_SHA)
    check(rc == 0 and "GO WOULD REFUSE: dist-prev-deploy exists" in out, "PLAN reports that GO would refuse", out[-800:])
    refused(REL_SHA, REL_BRANCH, "dist-prev-deploy exists")


# -------------------------------------------- deploy-east.sh allowlist, directly ----
def on_release():
    sh(["git", "checkout", "-q", "-B", REL_BRANCH, REL_SHA], cwd=REPO)


@scenario
def deploy_east_without_pins_keeps_old_rule():
    on_release()
    before = snap()
    rc, out = deploy_east(EAST_ONLY_SHA256=os.path.join(EAST, "absent.sha256"))
    check(rc != 0 and "uncommitted source changes" in out, "no pin file: the five are refused as before", out[-800:])
    check(snap()["dist_stamp_md5"] == before["dist_stamp_md5"], "dist untouched")


@scenario
def deploy_east_wrong_pin():
    on_release()
    p = write_pins()
    txt = open(p).read()
    open(p, "w").write(("0" * 64) + txt[64:])
    rc, out = deploy_east(EAST_ONLY_SHA256=p)
    check(rc != 0 and "(pinned, but sha256" in out, "a pin that does not match is refused", out[-800:])


@scenario
def deploy_east_malformed_pins():
    on_release()
    p = write_pins("not a pin line\n")
    rc, out = deploy_east(EAST_ONLY_SHA256=p)
    check(rc != 0 and "malformed line" in out, "a malformed pin file is refused", out[-800:])
    p = write_pins("%s  src/../../etc/passwd\n" % ("a" * 64))
    rc, out = deploy_east(EAST_ONLY_SHA256=p)
    check(rc != 0 and "plain and relative" in out, "a path escaping the repo is refused", out[-800:])
    p = write_pins(sh(["sha256sum", FIVE[0]], cwd=REPO) + "\n")
    rc, out = deploy_east(EAST_ONLY_SHA256=p)
    check(rc != 0 and "duplicate path" in out, "a duplicate pin is refused", out[-800:])


@scenario
def deploy_east_stale_pin():
    on_release()
    p = write_pins(sh(["sha256sum", "package.json"], cwd=REPO) + "\n")
    rc, out = deploy_east(EAST_ONLY_SHA256=p)
    check(rc != 0 and "pinned but not dirty: package.json" in out and "stale" in out, "a pinned file that is not dirty is refused", out[-800:])


@scenario
def deploy_east_restart_not_proven():
    """pm2 says the restart worked but nothing restarted: step 5 fails, and so does the restore's restart."""
    on_release()
    p = write_pins()
    ctl("pm2_noop")
    rc, out = deploy_east(EAST_ONLY_SHA256=p)
    s = snap()
    check(rc != 0 and "the restart of fresh-web was not proven" in out and "RESTORE IS NOT PROVEN" in out, "deploy-east never claims an unproven restart", out[-1500:])
    check(s["dist"] == BASE_SHA and s["loaded"] == BASE_SHA and not s["build_copy"], "previous dist/ back on disk, build copy gone", s)
    rc, out = deploy_east(ROLLBACK="1")
    check(rc != 0 and "nothing to roll back to" in out, "ROLLBACK=1 without dist-prev-deploy is an error, not 'rolled back.'", out[-500:])


@scenario
def deploy_east_stamp_must_match_exactly():
    """A file step 1's filter skips (".env" in the name) but the real stamp counts: step 3 must refuse."""
    on_release()
    p = write_pins()
    open(os.path.join(REPO, "notes.env.txt"), "w").write("x\n")
    before = snap()
    rc, out = deploy_east(EAST_ONLY_SHA256=p, NODE_OPTIONS="--max-old-space-size=3072")
    check(rc != 0 and "stamp dirty: notes.env.txt" in out and "exactly 5 pinned" in out, "step 3 refuses a stamp with a sixth dirty file", out[-1200:])
    s = snap()
    check(s["dist"] == BASE_SHA and s["dist_stamp_md5"] == before["dist_stamp_md5"] and not s["prev_deploy"], "restore_dist put the previous dist back")


@scenario
def payload_and_ship():
    """ship.py: every step fits one SSM command; run through bash as SSM runs them, the parts
    reassemble into the exact script, a bad part is refused before anything runs, and the
    script's budget and exit code come through."""
    sys.path.insert(0, RUNNERS)
    sys.path.insert(0, os.path.dirname(HERE))
    from _runner_common import shipped, script_timeout, MAX_COMMAND
    import ship
    raw = open(SCRIPT, "rb").read()
    check(script_timeout(SCRIPT) == 3600, "RUNNER_TIMEOUT = 3600 is declared")
    src = raw.decode()
    check(re.search(r'(?m)^MODE = "PLAN"$', src) and "<FILL" in src, "the committed script defaults to PLAN with placeholders")
    er = open(os.path.join(RUNNERS, "east_runx.py")).read()
    check('INSTANCE, REGION = "%s", "%s"' % (ship.INSTANCE, ship.REGION) in er, "ship.py targets the same instance and region as east_runx.py")
    base = os.path.join(SIM, "shipbase")
    os.makedirs(base, exist_ok=True)

    def ship_run(raw_bytes, tag, timeout, corrupt=False):
        plan = ship.steps(raw_bytes, tag, base, timeout)
        outs = []
        for i, (label, text, t) in enumerate(plan):
            f = os.path.join(SIM, "step-%s-%d.py" % (tag, i))
            open(f, "w").write(text)
            if label == "run":
                check(script_timeout(f) == timeout, "the loader declares RUNNER_TIMEOUT = %d" % timeout)
                if corrupt:
                    pf = os.path.join(base, "eastrel-ship-" + tag, "000")
                    open(pf, "w").write(open(pf).read()[:-4] + "AAAA")
            cmd = shipped(text.encode(), os.path.join(SIM, "remote-%s-%d.py" % (tag, i)), t, "auto")
            check(len(cmd) <= MAX_COMMAND, "%s %s: %d <= %d chars" % (tag, label, len(cmd), MAX_COMMAND))
            # as SSM runs it; the command's own status is rm's, so the script's exit code is echoed
            r = subprocess.run(["bash", "-c", cmd.replace("; rm -f ", '; echo "RC=$?"; rm -f ', 1)], capture_output=True, text=True, env=ENV, timeout=120)
            m = re.search(r"RC=(\d+)", r.stdout)
            outs.append((int(m.group(1)) if m else None, r.stdout + r.stderr))
        return plan, outs

    plan, outs = ship_run(raw, "real", 3600)
    check(len(plan) >= 3, "the real script needs several parts (%d steps)" % len(plan))
    rc, out = outs[-1]
    check(rc == 2 and "reassembled" in out and "placeholders" in out, "the reassembled script runs as itself (and refuses its placeholders)", out[-500:])
    check(not os.path.exists(os.path.join(base, "eastrel-ship-real")), "the parts are removed after the run")
    probe = b"import os, sys\nprint('BUDGET', os.environ.get('PRNM_RUNNER_TIMEOUT'))\nsys.exit(7)\n" + b"#" * 9000 + b"\n"
    plan, outs = ship_run(probe + b"#" + os.urandom(6000).hex().encode() + b"\n", "probe", 900)
    rc, out = outs[-1]
    m = re.search(r"BUDGET (\d+)", out)
    check(rc == 7 and m and 890 <= int(m.group(1)) <= 900, "the script's exit code and its remaining budget come through", out[-300:])
    plan, outs = ship_run(raw, "bad", 3600, corrupt=True)
    rc, out = outs[-1]
    check(rc == 2 and "did not reassemble" in out and "placeholders" not in out, "an altered part is refused and nothing runs", out[-300:])


# --------------------------------------------------------------------------- main ----
print("setting up %s" % SIM)
REL_SHA, BAD = setup()
print("release under test %s (%s), base %s, live on %s" % (REL_SHA[:12], A.ref, BASE_SHA[:12], BASE))
wanted = [s for s in A.only.split(",") if s]
for fn in SCENARIOS:
    if wanted and fn.__name__ not in wanted:
        continue
    CUR[0] = fn.__name__
    reset()
    t = time.time()
    n0 = len(RESULTS)
    try:
        fn()
    except Exception as e:  # a crash in a scenario is a failure, never a skip
        import traceback
        check(False, "scenario crashed: %r" % e, traceback.format_exc())
    mine = RESULTS[n0:]
    print("%s %-42s %2d checks %5.1fs" % ("PASS" if all(ok for _, ok, _ in mine) and mine else "FAIL", fn.__name__, len(mine), time.time() - t))
srv.shutdown()
bad = [r for r in RESULTS if not r[1]]
print("\n%d checks, %d failed" % (len(RESULTS), len(bad)))
if not A.keep:
    shutil.rmtree(SIM, ignore_errors=True)
sys.exit(1 if bad else 0)
