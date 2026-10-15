"""EAST step: add the background video to the winter homepage hero.

Run with ops/runners/east_runx.py. Smallest diff: inserts the HeroVideo
component (fetched from this public repo at a PINNED commit, sha256-checked)
above WinterHero and one <HeroVideo /> line after the hero's </picture>.
Nothing else in the page changes; the SSR image stays as the first paint.

DRY=True (default): read-only. Checks every anchor, prints the diff, memory
and pm2 state. DRY=False: backup, patch, build, restart, verify; on any build
or verify failure it restores the backup, rebuilds and restarts.
"""
import difflib, hashlib, os, pwd, re, shlex, shutil, subprocess, sys, time, urllib.request

DRY = True
SHA = "354112dcca509a486560c2b66529d9f378f4f630"
SNIP_SHA256 = "15817e218ae3c301ae877aba02a6cd1210cf03d1b23bd5f6f54d2e25496251f3"
APP = "/home/ubuntu/fresh-web"
SRC = APP + "/src/components/home-page-winter.tsx"
SNIP_URL = ("https://raw.githubusercontent.com/derekbowen/poolrentalnearme-web/%s/"
            "ops/east/hero-video/HeroVideo.tsx.snippet" % SHA)
SITE = "https://www.poolrentalnearme.com/"


def sh(cmd, timeout=900):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
    return r.returncode, (r.stdout + r.stderr)[-3000:]


def as_ubuntu(cmd, timeout=900):
    return sh("sudo -u ubuntu PM2_HOME=/home/ubuntu/.pm2 bash -lc %s" % shlex.quote(cmd), timeout)


if "REPLACE" in SHA or "REPLACE" in SNIP_SHA256:
    sys.exit("refusing: SHA/SNIP_SHA256 not filled in")
snippet = urllib.request.urlopen(SNIP_URL, timeout=60).read()
if hashlib.sha256(snippet).hexdigest() != SNIP_SHA256:
    sys.exit("ABORT: snippet sha256 mismatch")
snippet = snippet.decode()

s = open(SRC).read()
print("src sha256", hashlib.sha256(s.encode()).hexdigest()[:16], "bytes", len(s))
fn = "function WinterHero() {\n"
problems = []
if "HeroVideo" in s:
    problems.append("HeroVideo already present")
first = s.splitlines()[0] if s else ""
if not all(h in first for h in ("useEffect", "useRef", "useState")):
    problems.append("import line lacks useEffect/useRef/useState: %r" % first)
if s.count(fn) != 1:
    problems.append("WinterHero anchor count %d" % s.count(fn))
start = s.find(fn)
nxt = s.find("\nfunction ", start + len(fn))
body = s[start:nxt if nxt > 0 else len(s)]
pics = [m.start() for m in re.finditer(r"\n([ \t]*)</picture>\n", body)]
if len(pics) != 1:
    problems.append("</picture> inside WinterHero: %d (need 1)" % len(pics))
if problems:
    sys.exit("ABORT, nothing changed: " + "; ".join(problems))

m = re.search(r"\n([ \t]*)</picture>\n", body)
indent = m.group(1)
new_body = body[:m.end()] + indent + "<HeroVideo />\n" + body[m.end():]
new = s[:start] + snippet + new_body + s[start + len(body):]
diff = "".join(difflib.unified_diff(s.splitlines(True), new.splitlines(True), "a/" + SRC, "b/" + SRC, n=2))
print(diff[:6000])
print(sh("free -m")[1])
print(as_ubuntu("pm2 jlist | python3 -c \"import json,sys;[print(p['name'],p['pm2_env']['status'],p['pm2_env'].get('restart_time')) for p in json.load(sys.stdin)]\"")[1])
if DRY:
    sys.exit("DRY RUN: anchors OK, nothing changed")

ts = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
bak = SRC + ".bak-" + ts
shutil.copy2(SRC, bak)
u = pwd.getpwnam("ubuntu")


def write(path, text):
    open(path, "w").write(text)
    os.chown(path, u.pw_uid, u.pw_gid)


def build_restart():
    rc, out = as_ubuntu("cd %s && NODE_OPTIONS=--max-old-space-size=1536 npm run build" % APP)
    print("build rc", rc, "\n", out[-1500:])
    if rc != 0:
        return False
    rc, out = as_ubuntu("pm2 restart fresh-web")
    print("restart rc", rc)
    time.sleep(8)
    return rc == 0


def verify():
    rc, html = sh("curl -s -m 25 '%s?hv=%s'" % (SITE, ts))
    if "Swim all winter." not in html:
        print("verify: H1 missing")
        return False
    bundles = sorted(set(re.findall(r'/fw-assets/[A-Za-z0-9_.-]+\.js', html)))
    for b in bundles:
        rc, js = sh("curl -s -m 25 https://www.poolrentalnearme.com%s" % b)
        if "/tools/hero/hero-desktop.mp4" in js:
            print("verify: video wired in", b)
            return True
    # component may sit in a lazily imported chunk; search the build output on disk too
    rc, out = sh("grep -rl '/tools/hero/hero-desktop.mp4' %s/dist 2>/dev/null | head -3" % APP)
    print("verify: on-disk chunks:", out.strip() or "none")
    return bool(out.strip())


write(SRC, new)
if build_restart() and verify():
    print("DONE. backup:", bak)
    sys.exit(0)
print("FAILED -> rolling back to", bak)
write(SRC, open(bak).read())
ok = build_restart()
print("rollback build/restart ok:", ok, "| homepage H1 present:", "Swim all winter." in sh("curl -s -m 25 " + SITE)[1])
sys.exit(1)
