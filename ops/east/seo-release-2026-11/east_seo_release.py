"""EAST: ship ONE fresh-web release SHA keeping the five EAST-only files. README.md beside this file.
MODE PLAN = read-only preflight | GO = release, any failure puts the previous build back | ROLLBACK.
Too big for one SSM command: ship it with ship.py (beside this file), not east_runx.py."""
import hashlib, json, os, re, shlex, shutil, signal, subprocess, sys, tempfile, time, urllib.request
from datetime import datetime

RUNNER_TIMEOUT = 3600
MODE = "PLAN"
RELEASE_SHA = "<FILL: 40-hex release commit>"
RELEASE_BRANCH = "<FILL: e.g. seo/release-2026-11>"
CURRENT_SHA = "77028454655e7b272d8c23987b54f445f9eba9f7"
ALLOW_LOCKFILE_CHANGE = False
ALLOW_EAST_ONLY_NEWER = False  # True only after a human has read an EAST-only edit made after the live build
REPO = "/home/ubuntu/fresh-web"
BUILD_DIR = REPO + ".build"  # deploy-east.sh's default build copy
REMOTE = "https://github.com/derekbowen/fresh-web-702e04c3.git"
BASE = "https://www.poolrentalnearme.com"
PINS = "/home/ubuntu/fresh-web.east-only.sha256"
STATE = "/home/ubuntu/fresh-web.release-state.json"
BACKUP = "/home/ubuntu/fresh-web-release-backup"
HEAP = "--max-old-space-size=3072"
MIN_AVAIL_MB = 2048    # MemAvailable needed before GO (swap does not count)
MEM_RESERVE_MB = 512   # left for production: the build scope gets MemAvailable minus this
BUILD_SWAP_MB = 1536   # swap the build scope may use (its own pages, not production's)
DEPLOY_MIN_S = 600
RECOVER_S = 900        # budget kept back for recover(); its steps are bounded to fit
MEMINFO = "/proc/meminfo"
CGROUP = "/sys/fs/cgroup"
PROC_CGROUP = "/proc/%d/cgroup"
RUN_AS = "ubuntu"
PM2_HOME = "/home/ubuntu/.pm2"
EAST_ONLY = ["src/components/home-page.tsx", "src/routes/__root.tsx", "src/server/listing-sync.server.ts",
             "src/server/sharetribe.server.ts", "src/lib/listing-slug.ts"]
LOCKS = ("package-lock.json", "bun.lock", "bun.lockb", "yarn.lock", "pnpm-lock.yaml", "npm-shrinkwrap.json")
# The two "is this source?" filters EAST already applies: deploy-east.sh step 1 (whole porcelain
# line) and scripts/stamp-build.mjs (path). Both must see exactly EAST_ONLY.
DEPLOY_IGN = re.compile(r"(^.. (dist|node_modules|\.tanstack|dist-server-bak|dist\.bak)/|\.bak|\.v2bak|\.log$|\.deployed-sha$|\.env|dump\.pm2)")
STAMP_IGN = re.compile(r"^(dist/|\.output/|node_modules/|\.vinxi/|\.nitro/|\.tanstack/|dist-server-bak|dist\.bak|\.cache/|\.deployed-sha$|\.env|dump\.pm2$|logs?/)|\.bak($|-|\.)|\.v2bak|\.log$")
T0 = time.time()
BUDGET = int(os.environ.get("PRNM_RUNNER_TIMEOUT") or RUNNER_TIMEOUT)
DEPLOY = [None]  # the running deploy-east.sh process, so a failure can stop it before recovering


def say(*a):
    print(*a, flush=True)


def die(msg, code=2):
    say("ABORT: " + msg)
    sys.exit(code)


def run(cmd, timeout=600):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, errors="replace")
        return r.returncode, (r.stdout if r.returncode == 0 else r.stdout + r.stderr).rstrip()  # porcelain: keep column 1
    except subprocess.TimeoutExpired:
        return 124, "timed out after %ds" % timeout


def ub(shcmd, timeout=600):  # login shell as the app user, like every EAST runbook
    return run(["sudo", "-u", RUN_AS, "bash", "-lc", shcmd], timeout)


def git(*a, gd=None, timeout=60):
    loc = ["--git-dir", gd] if gd else ["-C", REPO]
    return run(["sudo", "-u", RUN_AS, "env", "GIT_TERMINAL_PROMPT=0", "git", "-c", "safe.directory=" + REPO,
                "-c", "credential.helper=", *loc, *a], timeout)


def gitv(*a, **k):
    rc, out = git(*a, **k)
    return out if rc == 0 else None


def sha256(p):
    try:
        return hashlib.sha256(open(os.path.join(REPO, p), "rb").read()).hexdigest()
    except OSError:
        return None


def dirty_sets():
    rc, out = git("status", "--porcelain")
    if rc:
        return None  # never exits: this also runs after the checkout and inside recover()
    lines = [l for l in out.split("\n") if len(l) > 3]
    return ({l[3:] for l in lines if not DEPLOY_IGN.search(l)},
            {l[3:].strip('"') for l in lines if not STAMP_IGN.search(l[3:].strip('"'))})


def check_tree(pins=None):
    ds = dirty_sets()
    if ds is None:
        return "git status failed"
    a, b = ds
    want = set(EAST_ONLY)
    if a != want or b != want:
        extra, missing = sorted((a | b) - want), sorted(want - (a & b))
        return "dirty set is not exactly the five EAST-only files: extra %s missing %s" % (extra[:10], missing)
    if pins:
        bad = [p for p in EAST_ONLY if sha256(p) != pins.get(p)]
        if bad:
            return "EAST-only file(s) changed since they were pinned: %s" % bad
    return None


def stamp(url, timeout=20):
    try:
        req = urllib.request.Request(url + "?cb=%d" % time.time(), headers={"Cache-Control": "no-cache", "User-Agent": "prnm-east-release"})
        return json.loads(urllib.request.urlopen(req, timeout=timeout).read())
    except Exception as e:
        return {"sha": None, "err": str(e)[:80]}


def live(timeout=20):
    return stamp(BASE + "/fw-assets/__build.json", timeout)


def local_stamp():
    try:
        return json.load(open(os.path.join(REPO, "dist/client/fw-assets/__build.json")))
    except Exception:
        return {"sha": None}


def pm2_info():
    """fresh-web as pm2 sees it. `pm2 jlist` carries the process environment: parsed, never printed;
    only the env variable NAMES are kept, as a hash and a count."""
    rc, out = ub("PM2_HOME=%s pm2 jlist" % PM2_HOME, 30)
    try:  # the JSON is one line; a "[PM2] ..." daemon notice may come before it
        js = [l for l in out.split("\n") if l.startswith("[{") or l.strip() == "[]"][-1]
        p = [x for x in json.loads(js) if x.get("name") == "fresh-web"][0]
        e = p.get("pm2_env") or {}
        names = sorted((e.get("env") or {}).keys())
        return {"status": e.get("status"), "gen": [p.get("pid"), e.get("restart_time"), e.get("pm_uptime")],
                "env": hashlib.sha256("\n".join(names).encode()).hexdigest()[:12], "nenv": len(names)}
    except Exception:
        return {"status": "absent or unreadable (rc %d)" % rc, "gen": None, "env": None, "nenv": 0}


def restart_and_wait(sha):
    """Restart fresh-web and PROVE it, then wait for the live stamp. The stamp alone proves nothing:
    serve.mjs reads it from disk, so it shows the restored dist/ even if the process never restarted."""
    before = pm2_info()["gen"]
    if not before:
        say("  pm2 state unreadable before the restart: a restart could not be proven")
        return False
    rc, out = ub("PM2_HOME=%s pm2 restart fresh-web" % PM2_HOME, 60)  # no --update-env: the env stays as it was
    if rc:
        say("  pm2 restart rc %d: %s" % (rc, out[-200:]))
        return False
    end = time.time() + 60
    while True:
        i = pm2_info()
        if i["status"] == "online" and i["gen"] and i["gen"] != before:
            break
        if time.time() > end:
            say("  pm2 restart NOT proven: status %s, pid/restarts/uptime %s -> %s" % (i["status"], before, i["gen"]))
            return False
        time.sleep(2)
    say("  pm2 fresh-web restarted: online, pid/uptime changed")
    return wait_live(sha)


def wait_live(sha, secs=120):
    end = time.time() + secs
    while True:
        if live(min(10, max(1, end - time.time()))).get("sha") == sha:
            return True
        if time.time() > end:
            return False
        time.sleep(2)


def tree(pid):
    """pid and all its descendants (from /proc), so a deploy can be stopped whatever process groups it made."""
    kids = {}
    for d in os.listdir("/proc"):
        if d.isdigit():
            try:
                kids.setdefault(int(open("/proc/%s/stat" % d).read().rsplit(")", 1)[1].split()[1]), []).append(int(d))
            except Exception:
                pass
    out, todo = [], [pid]
    while todo:
        x = todo.pop()
        out.append(x)
        todo += kids.get(x, [])
    return out


def kill_deploy():
    p = DEPLOY[0]
    if not p or p.poll() is not None:
        return
    pids = tree(p.pid)
    say("  stopping the running deploy (%d processes)" % len(pids))
    for sig in (signal.SIGTERM, signal.SIGKILL):
        for x in pids:
            try:
                os.kill(x, sig)
            except OSError:
                pass
        try:
            p.wait(20)
        except subprocess.TimeoutExpired:
            pass


def in_scope(pid, unit):
    """Every process of the deploy that /proc lets us read is in the capped scope (and at least one is)."""
    seen = []
    for x in tree(pid):
        try:
            seen.append(("/%s.scope" % unit) in open(PROC_CGROUP % x).read())
        except OSError:
            pass
    return bool(seen) and all(seen)


def scope_mb(unit):
    for f in ("memory.peak", "memory.current"):
        try:
            return int(open(os.path.join(CGROUP, "system.slice", unit + ".scope", f)).read().split()[0]) // 2**20
        except Exception:
            pass
    return 0


def mem_disk():
    m = {k: int(v.split()[0]) // 1024 for k, v in (l.split(":", 1) for l in open(MEMINFO)) if k in ("MemAvailable", "SwapFree")}
    st = os.statvfs(REPO)
    rc, du = run(["du", "-sm", os.path.join(REPO, "dist")], 120)
    return m.get("MemAvailable", 0), m.get("SwapFree", 0), st.f_bavail * st.f_frsize // 2**20, int(du.split()[0]) if rc == 0 else 0


def write_root(path, text):
    with open(path + ".tmp", "w") as f:
        f.write(text)
    os.chmod(path + ".tmp", 0o644)
    os.replace(path + ".tmp", path)


def checkout_prev(st):
    """Back to the recorded commit (and branch), keeping the five local files; never merges."""
    br, prev = st["prev_branch"], st["prev_sha"]
    target = [br] if br != "HEAD" and gitv("rev-parse", "refs/heads/" + br, timeout=30) == prev else ["--detach", prev]
    rc, out = git("checkout", "-q", *target)
    head = gitv("rev-parse", "HEAD", timeout=30)
    problem = check_tree(st["pins"])
    say("  git back to %s: %s; tree: %s" % (" ".join(target), "OK" if rc == 0 and head == prev else "FAILED " + out[-200:], problem or "five pinned files intact"))
    return rc == 0 and head == prev, problem


def restore_dist(st):
    """The previous build back on disk: dist-prev-deploy if it is that build, else our own backup."""
    prev = os.path.join(REPO, "dist-prev-deploy")
    try:
        pv = json.load(open(os.path.join(prev, "client/fw-assets/__build.json"))).get("sha")
    except Exception:
        pv = None
    src = prev if pv == st["prev_sha"] else st["backup_dist"]
    if not os.path.isdir(src):
        say("  no dist backup at %s" % src)
        return False
    put = "mv %s dist" % shlex.quote(prev) if src == prev else "cp -a %s dist; rm -rf dist-prev-deploy" % shlex.quote(src)
    rc, out = ub("set -e; cd %s; rm -rf dist; %s" % (shlex.quote(REPO), put), 300)
    say("  dist restored from %s: %s" % (src, "OK" if rc == 0 else out[-200:]))
    return rc == 0


def restore_attest(st):
    p = os.path.join(REPO, ".deployed-sha")
    if st.get("prev_deployed_sha") is None:
        if os.path.exists(p):
            os.remove(p)
    else:
        with open(p, "w") as f:
            f.write(st["prev_deployed_sha"])


def recover(st, why):
    """GO failed after the state file: previous commit, previous dist, previous build LOADED (restart proven)."""
    say("RECOVER (%s)" % why)
    kill_deploy()
    ub("rm -rf " + shlex.quote(BUILD_DIR), 60)
    ok, problem = checkout_prev(st)
    restored = False
    if local_stamp().get("sha") != st["prev_sha"] or not os.path.isdir(os.path.join(REPO, "dist/server")):
        ok = restore_dist(st) and ok
        restored = True
    # The process may hold the release in memory (it restarted since preflight), or dist/ just changed under it.
    if restored or pm2_info()["gen"] != st["gen"]:
        ok = restart_and_wait(st["prev_sha"]) and ok
    restore_attest(st)
    lv, pm = live(), pm2_info()
    ok = ok and lv.get("sha") == st["prev_sha"] and pm["status"] == "online"
    say("RESULT: FAILED, %s. live %s; pm2 %s; %s%s" % (why, str(lv.get("sha"))[:12], pm["status"],
        "production is back on the previous build" if ok else "NOT FULLY RECOVERED: run MODE=ROLLBACK and check by hand",
        "; BUT %s: changed on the box during the run, left as found, check by hand" % problem if problem else ""))
    sys.exit(1)


def fetch_and_inspect(head, gd):
    """Fetch RELEASE_BRANCH anonymously; its tip must be RELEASE_SHA and descend from HEAD. Returns problems."""
    rc, out = git("fetch", "--no-tags", "--no-recurse-submodules", "-q", REMOTE, "refs/heads/" + RELEASE_BRANCH, gd=gd, timeout=600)
    if rc:
        return ["fetch of %s from %s failed: %s" % (RELEASE_BRANCH, REMOTE, out[-300:])]
    tip = gitv("rev-parse", "FETCH_HEAD", gd=gd)
    if tip != RELEASE_SHA:
        return ["%s on GitHub is at %s, not the pinned RELEASE_SHA %s" % (RELEASE_BRANCH, tip, RELEASE_SHA)]
    if git("merge-base", "--is-ancestor", head, RELEASE_SHA, gd=gd)[0]:
        return ["%s does not descend from the current HEAD %s" % (RELEASE_SHA[:12], head[:12])]
    ns = (gitv("diff", "--no-renames", "--name-status", head, RELEASE_SHA, gd=gd) or "").split("\n")
    ch = [l.split("\t", 1) for l in ns if "\t" in l]
    names = [n for _, n in ch]
    say("release changes %d file(s) vs HEAD:" % len(names))
    for s, n in ch[:60]:
        say("  %s %s" % (s, n))
    if len(ch) > 60:
        say("  ... and %d more" % (len(ch) - 60))
    bad = ["release touches EAST-only file %s" % n for n in names if n in EAST_ONLY]
    bad += ["release adds %s, which is untracked here" % n for s, n in ch if s == "A" and os.path.lexists(os.path.join(REPO, n))]
    locks = [n for n in names if os.path.basename(n) in LOCKS]
    pj = [json.loads(gitv("show", "%s:package.json" % c, gd=gd) or "{}") for c in (head, RELEASE_SHA)]
    deps = [k for k in ("dependencies", "devDependencies", "optionalDependencies", "overrides") if pj[0].get(k) != pj[1].get(k)]
    if (locks or deps) and not ALLOW_LOCKFILE_CHANGE:
        bad.append("dependencies change (%s); this tool never runs npm install" % (locks + deps))
    de = gitv("show", RELEASE_SHA + ":ops/deploy-east.sh", gd=gd) or ""
    if "EAST_ONLY_SHA256" not in de or "restart_proven" not in de or "BUILD_DIR" not in de:
        bad.append("the release's ops/deploy-east.sh lacks the EAST-only allowlist, the build copy or the proven restart")
    return bad


def preflight(expect_head):
    if not os.path.isdir(os.path.join(REPO, ".git")):
        die("%s is not a git checkout" % REPO)
    head, br = gitv("rev-parse", "HEAD"), gitv("rev-parse", "--abbrev-ref", "HEAD")
    say("repo %s HEAD %s (%s)" % (REPO, head, br))
    if head != expect_head:
        die("HEAD is %s, expected %s" % (head, expect_head))
    p = check_tree()
    if p:
        die(p)
    pins = {f: sha256(f) for f in EAST_ONLY}
    if None in pins.values():
        die("an EAST-only file is missing")
    lv, ls = live(), local_stamp()
    say("live stamp %s dirty=%s built %s | dist stamp %s" % (lv.get("sha"), lv.get("dirty"), lv.get("builtAt"), ls.get("sha")))
    try:
        built = datetime.fromisoformat(str(lv.get("builtAt")).replace("Z", "+00:00")).timestamp()
    except ValueError:
        built = None
    newer = []
    for f in EAST_ONLY:
        mt = os.stat(os.path.join(REPO, f)).st_mtime
        newer += [f] if built is None or mt > built else []
        say("  EAST-only %-36s sha256 %s mtime %s" % (f, pins[f][:16], time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(mt))))
    mem, swap, disk, dist = mem_disk()
    pm = pm2_info()
    say("pm2 fresh-web: %s (%d env names) | MemAvailable %d MB, SwapFree %d MB | disk free %d MB, dist %d MB" % (pm["status"], pm["nenv"], mem, swap, disk, dist))
    if lv.get("sha") != head:
        die("live stamp %s != HEAD %s" % (lv.get("sha") or lv.get("err"), head))
    if ls.get("sha") != head:
        die("dist stamp %s != HEAD %s" % (ls.get("sha"), head))
    if pm["status"] != "online":
        die("pm2 fresh-web is not online")
    try:
        cg = "memory" in open(os.path.join(CGROUP, "cgroup.controllers")).read().split()
    except OSError:
        cg = False
    plan = (mem - MEM_RESERVE_MB, max(0, min(BUILD_SWAP_MB, swap - 256)))
    gates = [g for c, g in (
        (os.path.exists(os.path.join(REPO, "dist-prev-deploy")), "dist-prev-deploy exists: an earlier deploy did not finish"),
        (newer and not ALLOW_EAST_ONLY_NEWER, "EAST-only file(s) changed after the live build (%s): their content is not what production runs; have it read, then set ALLOW_EAST_ONLY_NEWER" % newer),
        (mem < MIN_AVAIL_MB, "MemAvailable %d MB < %d MB" % (mem, MIN_AVAIL_MB)),
        (not (shutil.which("systemd-run") and cg), "no systemd-run with the cgroup v2 memory controller: the build cannot be memory-capped"),
        (disk < 3 * dist + 1024, "disk free %d MB < 3 x dist + 1 GB" % disk),
        (T0 + BUDGET - RECOVER_S - time.time() < DEPLOY_MIN_S, "budget %d s leaves under %d s for the deploy after %d s kept for recovery" % (BUDGET, DEPLOY_MIN_S, RECOVER_S))) if c]
    say("GO would cap the build at %d MB RAM + %d MB swap" % plan)
    return head, br, pins, gates, pm, plan


def release(st, plan):
    """Checkout and deploy. Returns None on success, else why it failed (the caller recovers)."""
    rc, out = git("checkout", "-q", "-B", RELEASE_BRANCH, RELEASE_SHA)
    if rc:
        return "git checkout refused: " + out[-200:]
    problem = check_tree(st["pins"])
    if gitv("rev-parse", "HEAD") != RELEASE_SHA or problem:
        return problem or "HEAD did not move to the release"
    say("checked out %s; five EAST-only files unchanged" % RELEASE_SHA[:12])
    left = int(st["deadline"] - time.time())
    if left < DEPLOY_MIN_S:
        return "only %d s left for the deploy" % left
    env = " ".join("%s=%s" % (k, shlex.quote(v)) for k, v in (("REPO_DIR", REPO), ("BASE_URL", BASE), ("EAST_ONLY_SHA256", PINS), ("NODE_OPTIONS", HEAP)))
    cmd = "cd %s && env %s timeout -k 30 %d bash ops/deploy-east.sh 2>&1" % (shlex.quote(REPO), env, left)
    unit = "eastrel-build-%d" % os.getpid()
    keep = re.compile(r"^(=== |ABORT|DEPLOYED|clean at|  tolerated|  pinned|  stamp dirty|stamp|production |WARNING|FAIL|PASS|DRIFT|  - |  /|build |  dirty files|check:price|rolled back|previous dist|carried|  pm2|  no )")
    tail, peak, scoped = [], 0, None
    p = DEPLOY[0] = subprocess.Popen(["systemd-run", "--scope", "--quiet", "--unit=" + unit, "-p", "MemoryMax=%dM" % plan[0],
                                      "-p", "MemorySwapMax=%dM" % plan[1], "--", "sudo", "-u", RUN_AS, "bash", "-lc", cmd],
                                     stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace")
    for line in p.stdout:
        if scoped is None:
            scoped = in_scope(p.pid, unit)
            if not scoped:
                return "the deploy is not inside its memory-capped scope %s" % unit
        peak = max(peak, scope_mb(unit))
        line = line.rstrip("\n")[:220]
        tail = (tail + [line])[-30:]
        if keep.match(line):
            say("  | " + line)
    rc = p.wait()
    say("build scope %s: peak %s MB (cap %d MB RAM + %d MB swap)" % (unit, peak or "unknown", plan[0], plan[1]))
    if rc:
        say("deploy-east.sh exit %d; last lines:" % rc)
        for l in tail[-15:]:
            say("  > " + l)
        return "deploy-east.sh exit %d" % rc
    return None


def _term(*a):
    raise SystemExit("SIGTERM")


def go_or_plan():
    if not re.fullmatch(r"[0-9a-f]{40}", RELEASE_SHA) or not re.fullmatch(r"[A-Za-z0-9._][A-Za-z0-9._/-]*", RELEASE_BRANCH):
        die("RELEASE_SHA / RELEASE_BRANCH are still placeholders (or malformed); fill them in first")
    say("MODE %s: release %s (%s) over %s" % (MODE, RELEASE_SHA, RELEASE_BRANCH, CURRENT_SHA[:12]))
    head, br, pins, gates, pm, plan = preflight(CURRENT_SHA)
    if gates and MODE == "GO":
        die("; ".join(gates))
    # inspect in a throwaway repo borrowing the objects, so a refusal leaves the real repo unwritten
    tmp = ub("mktemp -d /tmp/eastrel-fetch.XXXXXX")[1].strip()
    if tmp:
        run(["sudo", "-u", RUN_AS, "git", "init", "-q", "--bare", tmp])
        write_root(tmp + "/objects/info/alternates", os.path.join(REPO, ".git/objects") + "\n")
        if os.path.exists(REPO + "/.git/shallow"):
            write_root(tmp + "/shallow", open(REPO + "/.git/shallow").read())
        git("update-ref", "refs/base", head, gd=tmp)
    bad = fetch_and_inspect(head, tmp) if tmp else ["mktemp failed"]
    if not bad and MODE == "GO":  # only now does the real repo receive the objects
        git("update-ref", "refs/release", RELEASE_SHA, gd=tmp)
        rc, out = git("fetch", "--no-tags", "-q", tmp, "refs/release", timeout=600)
        if rc or gitv("rev-parse", "FETCH_HEAD") != RELEASE_SHA:
            bad = ["local fetch of the verified commit failed: " + out[-200:]]
    ub("rm -rf " + shlex.quote(tmp)) if tmp else None
    if bad:
        die("; ".join(bad) + " (nothing changed)")
    bk = os.path.join(BACKUP, "dist-" + head[:12])
    if MODE == "PLAN":
        say(("PLAN: GO WOULD REFUSE: %s. " % "; ".join(gates) if gates else "PLAN OK. ") + "GO would: write %s (5 pins); save dist to %s, "
            "the five to %s/east-only-%s.tar, state to %s; git checkout -B %s %s (keeping the five); run its ops/deploy-east.sh as %s "
            "with NODE_OPTIONS=%s in a memory-capped scope; on failure check out %s again, restore dist, restart (proven). Nothing changed."
            % (PINS, bk, BACKUP, head[:12], STATE, RELEASE_BRANCH, RELEASE_SHA[:12], RUN_AS, HEAP, head[:12]))
        return
    # ---- GO ----
    write_root(PINS, "".join("%s  %s\n" % (pins[f], f) for f in EAST_ONLY))
    dp = os.path.join(REPO, ".deployed-sha")
    st = {"prev_sha": head, "prev_branch": br, "release_sha": RELEASE_SHA, "release_branch": RELEASE_BRANCH, "pins": pins,
          "backup_dist": bk, "prev_deployed_sha": open(dp).read() if os.path.exists(dp) else None, "gen": pm["gen"], "env": pm["env"],
          "deadline": T0 + BUDGET - RECOVER_S, "started": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    q = shlex.quote
    rc, out = ub("set -e; umask 077; mkdir -p %s; rm -rf %s; cp -a %s %s; tar -C %s -cf %s %s" % (
        q(BACKUP), q(bk), q(REPO + "/dist"), q(bk), q(REPO), q("%s/east-only-%s.tar" % (BACKUP, head[:12])), " ".join(map(q, EAST_ONLY))), 900)
    if rc:
        die("could not back up dist and the five: %s (nothing changed in the repo)" % out[-200:])
    write_root(STATE, json.dumps(st, indent=1))
    say("pins %s, backups in %s, state %s" % (PINS, BACKUP, STATE))
    signal.signal(signal.SIGTERM, _term)
    try:
        why = release(st, plan)
    except BaseException as e:  # an exception, a die() or a SIGTERM after the state file: never leave git moved
        why = "interrupted: %s %s" % (type(e).__name__, str(e)[:120])
    if why:
        signal.signal(signal.SIGTERM, signal.SIG_IGN)  # recovery must not be cut short
        recover(st, why)
    # ---- success ----
    lv, pm2 = live(), pm2_info()
    say("live stamp: sha %s dirty %s %s built %s" % (lv.get("sha"), lv.get("dirty"), lv.get("dirtyFiles"), lv.get("builtAt")))
    problem = check_tree(pins)
    envnote = "pm2 env names unchanged" if pm2["env"] == pm["env"] else "PM2 ENV NAMES CHANGED (%d -> %d): compare with dump.pm2" % (pm["nenv"], pm2["nenv"])
    tracker = "tracker not run"
    tg = os.path.join(REPO, "ops/seo-repairs-2026-11/tracking/track_groups.py")
    if os.path.exists(tg):  # copied out so its reports never land in the repo tree
        d = tempfile.mkdtemp(prefix="eastrel-track-")
        run(["cp", tg, d])
        rc2, out = run(["env", "BASE=" + BASE, sys.executable, "-I", os.path.join(d, "track_groups.py"), "--only", "regression"], 300)
        res = [l for l in out.split("\n") if l[:4] in ("PASS", "FAIL")]
        fails = [l for l in res if l.startswith("FAIL")]
        tracker = "tracker regression %d/%d PASS" % (len(res) - len(fails), len(res)) if res and rc2 == 0 else "tracker did not run (rc %d)" % rc2
        for l in fails:
            say("  " + l[:160])
        run(["rm", "-rf", d])
    ok = lv.get("sha") == RELEASE_SHA == gitv("rev-parse", "HEAD") and not problem and pm2["env"] == pm["env"]
    say("RESULT: %s %s (%s) over %s; live %s dirty=%s; %s; %s; %s; rollback: MODE=ROLLBACK" % (
        "RELEASED" if ok else "RELEASED WITH WARNINGS", RELEASE_SHA[:12], RELEASE_BRANCH, head[:12],
        str(lv.get("sha"))[:12], lv.get("dirty"), problem or "five EAST-only files intact", envnote, tracker))
    sys.exit(0 if ok else 1)


def rollback():
    try:
        st = json.load(open(STATE))
    except Exception:
        die("no readable state file %s: nothing to roll back to" % STATE)
    say("MODE ROLLBACK: %s -> %s (%s)" % (st["release_sha"][:12], st["prev_sha"][:12], st["prev_branch"]))
    head = gitv("rev-parse", "HEAD")
    if head not in (st["release_sha"], st["prev_sha"]):
        die("HEAD %s is neither the release nor the previous commit; refusing" % head)
    problem = check_tree(st["pins"])
    if problem:
        die(problem)
    ub("rm -rf " + shlex.quote(BUILD_DIR), 60)
    ok = True
    if local_stamp().get("sha") != st["prev_sha"] or not os.path.isdir(os.path.join(REPO, "dist/server")):
        ok = restore_dist(st)
    g_ok, problem = checkout_prev(st)
    ok = restart_and_wait(st["prev_sha"]) and g_ok and not problem and ok  # always: the release may be loaded
    restore_attest(st)
    lv = live()
    st["rolled_back"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    write_root(STATE, json.dumps(st, indent=1))
    ok = ok and lv.get("sha") == st["prev_sha"]
    say("RESULT: %s; live %s, HEAD %s" % ("ROLLED BACK" if ok else "ROLLBACK INCOMPLETE, check by hand", str(lv.get("sha"))[:12], (gitv("rev-parse", "HEAD") or "?")[:12]))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    if MODE not in ("PLAN", "GO", "ROLLBACK"):
        die("MODE must be PLAN, GO or ROLLBACK")
    rollback() if MODE == "ROLLBACK" else go_or_plan()
