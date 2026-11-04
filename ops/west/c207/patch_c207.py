"""WEST c207 (remove Intercom): patch /home/ubuntu/build and write build/gate/flip-c207.sh.

Run with ops/runners/ssm_runx.py. DRY=True only checks. Each build-tree file must
still be byte-identical to the repo version before the change (md5), and each
replacement is fetched from this public repo at a PINNED commit and sha256-checked.
The two Intercom extension folders are MOVED to /home/ubuntu/backup-c207/, not
deleted. package.json is not touched (unused deps are harmless; the build tree's
package.json drifts from the repo).
"""
import hashlib, os, pwd, shutil, subprocess, sys, urllib.request

DRY = True
SHA = "41947bfb8d0deece154a39d088d380bc964aba93"
RAW = "https://raw.githubusercontent.com/derekbowen/poolrentalnearme-web/%s/" % SHA
B = "/home/ubuntu/build"
BK = "/home/ubuntu/backup-c207"
H = "/home/ubuntu"
FILES = {  # path: (md5 of current build-tree file, sha256 of replacement)
    "src/entry-client.jsx": ("2bf95c07744c9f7545f23b8e75ebdde5", "66af7759883f11dba5455270d84df109a9b6cc9a3fd17fa75d6754b6e2ece53d"),
    "src/ducks/auth.duck.js": ("635cc56095d8c5579167698341469b5e", "4a5a6a1b3121fa0e8e52e5880ffdea345eb415c7f7451000ad6e50e53db96681"),
    "src/containers/LandingPage/SectionLoveFooter.js": ("b95e1bddc9e50855ba492b304fbbcf30", "2b15ffc8b8cc07f81d8e6fd2a6eac8d2c0e0bc5ad17d267e61be3dd4925316f9"),
    "src/containers/TopbarContainer/Topbar/BottomNav/BottomNav.module.css": ("d8c1c65ef92ec84e05a8eddb080184a1", "66d524c1fc457961b04a7e98dae3691f1927846a2a6de7cd05975fd268c1fecb"),
    "server/csp.js": ("21ba7a4491bc764eff419adf3149dc53", "9fe31290a4c502a9dc5fbb3849732e21ce2670574052e1d1b13afbec1b9a1b7f"),
}
DIRS = ["src/extensions/intercom", "server/extensions/intercom-sync"]

bad, new = [], {}
for p, (md5, sha) in FILES.items():
    cur = open(os.path.join(B, p), "rb").read()
    if hashlib.md5(cur).hexdigest() != md5:
        bad.append("drift: " + p)
    data = urllib.request.urlopen(RAW + p, timeout=60).read()
    if hashlib.sha256(data).hexdigest() != sha:
        bad.append("sha256 mismatch: " + p)
    new[p] = data
for d in DIRS:
    if not os.path.isdir(os.path.join(B, d)):
        bad.append("missing dir: " + d)
for f in ("build-c206.sh", "gate-c206.sh", "flip-c206.sh"):
    if not os.path.exists(os.path.join(H, f)):
        bad.append("missing " + f)
for f in ("build-c207.sh", "gate-c207.sh", "flip-c207.sh"):
    if os.path.exists(os.path.join(H, f)):
        bad.append("already exists " + f)
if os.path.exists(BK):
    bad.append(BK + " exists")
if bad:
    sys.exit("ABORT, nothing changed: " + "; ".join(bad))
print("all 5 files match pre-change md5; replacements sha256-verified; both dirs present")


def sed(src, dst, pairs):
    s = open(os.path.join(H, src)).read()
    for a, b in pairs:
        if a not in s:
            sys.exit("ABORT: anchor %r not in %s" % (a, src))
        s = s.replace(a, b)
    return s


build = sed("build-c206.sh", "build-c207.sh", [
    ("build-c206", "build-c207"), ("c206-ceo-cal-health", "c207-no-intercom"), ("=== c206 build", "=== c207 build"),
    ("free -m\n", "docker stop poolrentalnearme-production-rollback 2>/dev/null || true\nfree -m\n")])
C207 = r'''echo "--- c207 THE FIX: Intercom removed (both boot paths, CSP) ---"
docker exec "$FB" sh -c "grep -rqiE 'widget.intercom.io|nuuc4281|intercomSettings|messenger-js-sdk' dist/client/assets/" && abort "Intercom still in client bundle"
R=$(curl -s --max-time 25 http://127.0.0.1:3000/login); printf '%s' "$R" | grep -qi 'intercom' && abort "intercom in /login HTML"
curl -s -I --max-time 20 http://127.0.0.1:3000/login | grep -i '^content-security-policy' | grep -qi intercom && abort "intercom still in CSP"
L=$(curl -s --max-time 25 http://127.0.0.1:3000/); printf '%s' "$L" | grep -qi 'nuuc4281' && abort "hardcoded app id on landing"
printf '%s' "$L" | grep -q 'Text Derek' && echo "  landing: Text Derek card renders" || echo "  (landing SSR has no Text Derek text; client-only section)"
echo "  no Intercom in bundle, /login, CSP or landing"
'''
gate = sed("gate-c206.sh", "gate-c207.sh", [
    ("gate-c206.log", "gate-c207.log"), ("gate-c206.done", "gate-c207.done"),
    ("NEW=c206-ceo-cal-health:latest", "NEW=c207-no-intercom:latest"),
    ("prod-clone-c206.env", "prod-clone-c207.env"), ("production-c206gate", "production-c207gate"),
    ("=== c206 GATE $(date", "=== c207 GATE $(date"),
    ('echo "=== c206 GATE PASSED', C207 + 'echo "=== c207 GATE PASSED')])
flip = sed("flip-c206.sh", "flip-c207.sh", [
    ("flip-c206.log", "flip-c207.log"), ("flip-c206.done", "flip-c207.done"),
    ("NEW=c206-ceo-cal-health:latest; OLD=c205-cal-tiers:latest", "NEW=c207-no-intercom:latest; OLD=c206-ceo-cal-health:latest"),
    ("prod-clone-c206.env", "prod-clone-c207.env"), ("production-c206gate", "production-c207gate"),
    ("=== c206 FLIP $(date", "=== c207 FLIP $(date"), ("=== c206 FLIP DONE", "=== c207 FLIP DONE"),
    ("gated c206 on :3000", "gated c207 on :3000"), ("with c206 (keeps", "with c207 (keeps")])
for name, body in (("build-c207.sh", build), ("gate-c207.sh", gate), ("flip-c207.sh", flip)):
    if "c206-ceo-cal-health:latest" in body and name != "flip-c207.sh":
        sys.exit("ABORT: %s still names the c206 image" % name)
print("scripts ok:", {n: len(b) for n, b in (("build", build), ("gate", gate), ("flip", flip))})
if DRY:
    sys.exit("DRY RUN: checks passed, nothing changed")

u = pwd.getpwnam("ubuntu")
os.makedirs(BK)
for p, data in new.items():
    dst = os.path.join(B, p)
    os.makedirs(os.path.dirname(os.path.join(BK, p)), exist_ok=True)
    shutil.copy2(dst, os.path.join(BK, p))
    st = os.stat(dst)
    with open(dst, "wb") as f:
        f.write(data)
    os.chown(dst, st.st_uid, st.st_gid)
for d in DIRS:
    os.makedirs(os.path.dirname(os.path.join(BK, d)), exist_ok=True)
    shutil.move(os.path.join(B, d), os.path.join(BK, d))
for name, body in (("build-c207.sh", build), ("gate-c207.sh", gate), ("flip-c207.sh", flip)):
    p = os.path.join(H, name)
    with open(p, "w") as f:
        f.write(body)
    os.chmod(p, 0o755)
    os.chown(p, u.pw_uid, u.pw_gid)
r = subprocess.run("cd %s && grep -rIl -i intercom src server 2>/dev/null | head" % B, shell=True, capture_output=True, text=True)
print("remaining intercom refs in src/server:", r.stdout.strip() or "none")
print("PATCHED. backup:", BK)
