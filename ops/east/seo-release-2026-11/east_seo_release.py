"""EAST: ship ONE fresh-web release SHA keeping the five EAST-only files. README.md beside this file.
MODE PLAN = read-only preflight | GO = release, any failure puts the previous build back | ROLLBACK."""
import hashlib, json, os, re, shlex, subprocess, sys, tempfile, time, urllib.request

RUNNER_TIMEOUT = 3600
MODE = "PLAN"
RELEASE_SHA = "<FILL: 40-hex release commit>"
RELEASE_BRANCH = "<FILL: e.g. seo/release-2026-11>"
CURRENT_SHA = "77028454655e7b272d8c23987b54f445f9eba9f7"
ALLOW_LOCKFILE_CHANGE = False
REPO = "/home/ubuntu/fresh-web"
REMOTE = "https://github.com/derekbowen/fresh-web-702e04c3.git"
BASE = "https://www.poolrentalnearme.com"
PINS = "/home/ubuntu/fresh-web.east-only.sha256"
STATE = "/home/ubuntu/fresh-web.release-state.json"
BACKUP = "/home/ubuntu/fresh-web-release-backup"
HEAP = "--max-old-space-size=3072"
MIN_FREE_MB = 3000
DEPLOY_MIN_S = 600
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


def git(*a, gd=None, timeout=120):
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
    rc, out = run(["sudo", "-u", RUN_AS, "git", "-c", "safe.directory=" + REPO, "-C", REPO, "status", "--porcelain"])
    if rc:
        die("git status failed: " + out[-300:])
    lines = [l for l in out.split("\n") if len(l) > 3]
    return ({l[3:] for l in lines if not DEPLOY_IGN.search(l)},
            {l[3:].strip('"') for l in lines if not STAMP_IGN.search(l[3:].strip('"'))})


def check_tree(pins=None):
    a, b = dirty_sets()
    want = set(EAST_ONLY)
    if a != want or b != want:
        extra, missing = sorted((a | b) - want), sorted(want - (a & b))
        return "dirty set is not exactly the five EAST-only files: extra %s missing %s" % (extra[:10], missing)
    if pins:
        bad = [p for p in EAST_ONLY if sha256(p) != pins.get(p)]
        if bad:
            return "EAST-only file(s) changed since they were pinned: %s" % bad
    return None


def stamp(url):
    try:
        req = urllib.request.Request(url + "?cb=%d" % time.time(), headers={"Cache-Control": "no-cache", "User-Agent": "prnm-east-release"})
        return json.loads(urllib.request.urlopen(req, timeout=20).read())
    except Exception as e:
        return {"sha": None, "err": str(e)[:80]}


def live():
    return stamp(BASE + "/fw-assets/__build.json")


def local_stamp():
    try:
        return json.load(open(os.path.join(REPO, "dist/client/fw-assets/__build.json")))
    except Exception:
        return {"sha": None}


def pm2_status():
    rc, out = ub("PM2_HOME=%s pm2 jlist" % PM2_HOME, 60)
    try:  # parsed, never printed: pm2 jlist carries the process environment
        procs = json.loads(out[out.index("["):])
        return ",".join(p.get("pm2_env", {}).get("status", "?") for p in procs if p.get("name") == "fresh-web") or "absent"
    except Exception:
        return "unreadable (rc %d)" % rc


def restart_and_wait(sha, polls=60):
    rc, out = ub("PM2_HOME=%s pm2 restart fresh-web" % PM2_HOME, 120)
    if rc:
        say("  pm2 restart rc %d: %s" % (rc, out[-200:]))
    return wait_live(sha, polls)


def wait_live(sha, polls=60):
    for _ in range(polls):
        if live().get("sha") == sha:
            return True
        time.sleep(2)
    return False


def mem_disk():
    m = {k: int(v.split()[0]) // 1024 for k, v in (l.split(":", 1) for l in open("/proc/meminfo")) if k in ("MemAvailable", "SwapFree")}
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
    target = [br] if br != "HEAD" and gitv("rev-parse", "refs/heads/" + br) == prev else ["--detach", prev]
    rc, out = git("checkout", "-q", *target)
    head = gitv("rev-parse", "HEAD")
    problem = check_tree(st["pins"])
    say("  git back to %s: %s; tree: %s" % (" ".join(target), "OK" if rc == 0 and head == prev else "FAILED " + out[-200:], problem or "five pinned files intact"))
    return rc == 0 and head == prev, problem


def restore_dist(st):
    bk = st["backup_dist"]
    if not os.path.isdir(bk):
        say("  no dist backup at %s" % bk)
        return False
    rc, out = ub("set -e; cd %s; rm -rf dist; cp -a %s dist; rm -rf dist-prev-deploy" % (shlex.quote(REPO), shlex.quote(bk)), 900)
    say("  dist restored from %s: %s" % (bk, "OK" if rc == 0 else out[-200:]))
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
    """GO failed after the checkout: previous commit, previous dist, previous live build."""
    say("RECOVER (%s)" % why)
    ok, problem = checkout_prev(st)
    if local_stamp().get("sha") != st["prev_sha"] or not os.path.isdir(os.path.join(REPO, "dist/server")):
        ok = restore_dist(st) and ok
        ok = restart_and_wait(st["prev_sha"]) and ok
    elif live().get("sha") != st["prev_sha"]:
        ok = restart_and_wait(st["prev_sha"]) and ok
    restore_attest(st)
    lv = live()
    ok = ok and lv.get("sha") == st["prev_sha"]
    say("RESULT: FAILED, %s. live %s; %s%s" % (why, str(lv.get("sha"))[:12],
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
    if "EAST_ONLY_SHA256" not in (gitv("show", RELEASE_SHA + ":ops/deploy-east.sh", gd=gd) or ""):
        bad.append("the release's ops/deploy-east.sh has no EAST-only allowlist; it would refuse the five files")
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
    for f in EAST_ONLY:
        say("  EAST-only %-36s sha256 %s" % (f, pins[f][:16]))
    mem, swap, disk, dist = mem_disk()
    pm2 = pm2_status()
    say("pm2 fresh-web: %s | MemAvailable %d MB, SwapFree %d MB | disk free %d MB, dist %d MB" % (pm2, mem, swap, disk, dist))
    lv, ls = live(), local_stamp()
    say("live stamp %s dirty=%s built %s | dist stamp %s" % (lv.get("sha"), lv.get("dirty"), lv.get("builtAt"), ls.get("sha")))
    if lv.get("sha") != head:
        die("live stamp %s != HEAD %s" % (lv.get("sha") or lv.get("err"), head))
    if ls.get("sha") != head:
        die("dist stamp %s != HEAD %s" % (ls.get("sha"), head))
    if pm2 != "online":
        die("pm2 fresh-web is not online")
    gates = [g for c, g in ((os.path.exists(os.path.join(REPO, "dist-prev-deploy")), "dist-prev-deploy exists: an earlier deploy did not finish"),
                            (mem + swap < MIN_FREE_MB, "only %d MB RAM+swap free, build needs ~%d" % (mem + swap, MIN_FREE_MB)),
                            (disk < 3 * dist + 1024, "disk free %d MB < 3 x dist + 1 GB" % disk)) if c]
    return head, br, pins, gates


def go_or_plan():
    if not re.fullmatch(r"[0-9a-f]{40}", RELEASE_SHA) or not re.fullmatch(r"[A-Za-z0-9._][A-Za-z0-9._/-]*", RELEASE_BRANCH):
        die("RELEASE_SHA / RELEASE_BRANCH are still placeholders (or malformed); fill them in first")
    say("MODE %s: release %s (%s) over %s" % (MODE, RELEASE_SHA, RELEASE_BRANCH, CURRENT_SHA[:12]))
    head, br, pins, gates = preflight(CURRENT_SHA)
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
        say(("PLAN: GO WOULD REFUSE: %s. " % "; ".join(gates) if gates else "PLAN OK. ") + "GO would: write %s (5 pins); save dist to %s and state to %s; "
            "git checkout -B %s %s (keeping the five); run its ops/deploy-east.sh as %s with NODE_OPTIONS=%s; "
            "on failure check out %s again and restore dist + live. Nothing changed." % (PINS, bk, STATE, RELEASE_BRANCH, RELEASE_SHA[:12], RUN_AS, HEAP, head[:12]))
        return
    # ---- GO ----
    write_root(PINS, "".join("%s  %s\n" % (pins[f], f) for f in EAST_ONLY))
    dp = os.path.join(REPO, ".deployed-sha")
    st = {"prev_sha": head, "prev_branch": br, "release_sha": RELEASE_SHA, "release_branch": RELEASE_BRANCH, "pins": pins,
          "backup_dist": bk, "prev_deployed_sha": open(dp).read() if os.path.exists(dp) else None, "started": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    rc, out = ub("set -e; mkdir -p %s; rm -rf %s; cp -a %s %s" % (shlex.quote(BACKUP), shlex.quote(bk), shlex.quote(REPO + "/dist"), shlex.quote(bk)), 900)
    if rc:
        die("could not back up dist: %s (nothing changed in the repo)" % out[-200:])
    write_root(STATE, json.dumps(st, indent=1))
    say("pins %s, dist backup %s, state %s" % (PINS, bk, STATE))
    rc, out = git("checkout", "-q", "-B", RELEASE_BRANCH, RELEASE_SHA)
    if rc:
        if gitv("rev-parse", "HEAD") == head and not check_tree(pins):
            die("git checkout refused (%s); nothing changed" % out[-300:])
        recover(st, "checkout failed: " + out[-200:])
    problem = check_tree(pins)
    if gitv("rev-parse", "HEAD") != RELEASE_SHA or problem:
        recover(st, problem or "HEAD did not move to the release")
    say("checked out %s; five EAST-only files unchanged" % RELEASE_SHA[:12])
    left = max(DEPLOY_MIN_S, BUDGET - int(time.time() - T0) - 480)  # leaves time to recover
    env = " ".join("%s=%s" % (k, shlex.quote(v)) for k, v in (("REPO_DIR", REPO), ("BASE_URL", BASE), ("EAST_ONLY_SHA256", PINS), ("NODE_OPTIONS", HEAP)))
    cmd = "cd %s && env %s timeout -k 30 %d bash ops/deploy-east.sh 2>&1" % (shlex.quote(REPO), env, left)
    keep = re.compile(r"^(=== |ABORT|DEPLOYED|clean at|  tolerated|  pinned|  stamp dirty|stamp|production |WARNING|FAIL|PASS|DRIFT|  - |  /|build NODE|  dirty files|check:price|rolled back|previous dist)")
    tail = []
    p = subprocess.Popen(["sudo", "-u", RUN_AS, "bash", "-lc", cmd], stdout=subprocess.PIPE, text=True, errors="replace")
    for line in p.stdout:
        line = line.rstrip("\n")[:220]
        tail = (tail + [line])[-30:]
        if keep.match(line):
            say("  | " + line)
    rc = p.wait()
    if rc:
        say("deploy-east.sh exit %d; last lines:" % rc)
        for l in tail[-15:]:
            say("  > " + l)
        recover(st, "deploy-east.sh exit %d" % rc)
    # ---- success ----
    lv = live()
    say("live stamp: sha %s dirty %s %s built %s" % (lv.get("sha"), lv.get("dirty"), lv.get("dirtyFiles"), lv.get("builtAt")))
    problem = check_tree(pins)
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
    ok = lv.get("sha") == RELEASE_SHA == gitv("rev-parse", "HEAD") and not problem
    say("RESULT: %s %s (%s) over %s; live %s dirty=%s; %s; %s; rollback: MODE=ROLLBACK" % (
        "RELEASED" if ok else "RELEASED WITH WARNINGS", RELEASE_SHA[:12], RELEASE_BRANCH, head[:12],
        str(lv.get("sha"))[:12], lv.get("dirty"), problem or "five EAST-only files intact", tracker))
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
    ok = True
    if os.path.isdir(os.path.join(REPO, "dist-prev-deploy")) and os.path.exists(os.path.join(REPO, "ops/deploy-east.sh")):
        rc, out = ub("set -o pipefail; cd %s && ROLLBACK=1 REPO_DIR=%s bash ops/deploy-east.sh 2>&1 | tail -3" % (shlex.quote(REPO), shlex.quote(REPO)), 900)
        say("  deploy-east.sh ROLLBACK=1: rc %d %s" % (rc, out[-200:].replace("\n", " | ")))
        ok = rc == 0
    if local_stamp().get("sha") != st["prev_sha"]:
        ok = restore_dist(st)
    g_ok, problem = checkout_prev(st)
    ok = g_ok and not problem and ok
    ok = restart_and_wait(st["prev_sha"]) and ok
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
