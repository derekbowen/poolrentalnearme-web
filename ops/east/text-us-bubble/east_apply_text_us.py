"""EAST: "Text us" bubble on every non-admin fresh-web page (design approved by Derek).

Run with ops/runners/east_runx.py. Fetches ops/east/text-us-bubble/text-us-bubble.tsx from
this public repo at a PINNED commit (sha256-checked), writes it to src/components/, and
patches the box's own src/routes/__root.tsx (md5-gated) at two exact anchors: one import,
one mount. Nothing else changes. The component renders nothing on the server.

DRY=True (default): read-only checks + diff. DRY=False: backup, write, build, restart,
verify. Any failure restores __root.tsx, removes the component, rebuilds and restarts.
"""
import difflib, hashlib, os, shlex, shutil, subprocess, sys, time, urllib.request

DRY = True
SHA = "REPLACE_AFTER_COMMIT"  # commit holding text-us-bubble.tsx
SUM = "REPLACE_AFTER_COMMIT"  # sha256 of text-us-bubble.tsx at SHA
RAW = "https://raw.githubusercontent.com/derekbowen/poolrentalnearme-web/%s/ops/east/text-us-bubble/text-us-bubble.tsx" % SHA
APP = "/home/ubuntu/fresh-web"
ROOT = APP + "/src/routes/__root.tsx"
ROOT_MD5 = "c6aedc950b8e3a76efed6d7f64fe647e"
COMP = APP + "/src/components/text-us-bubble.tsx"
SITE = "https://www.poolrentalnearme.com"
MARK = "prnm-text-us-v1"
PAGES = ("/", "/p/how-to-host-a-pool-party")
IMP = 'import { AffiliateRefCapture } from "@/components/affiliate-ref-capture";\n'
MNT = "        {!isAdmin && <SiteFooter />}\n      </div>\n    </>\n"
EDITS = [
    (IMP, IMP + 'import { TextUsBubble } from "@/components/text-us-bubble";\n'),
    (MNT, MNT.replace("    </>", "      {!isAdmin && <TextUsBubble pathname={pathname} />}\n    </>")),
]


def sh(cmd, timeout=900):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
    return r.returncode, (r.stdout + r.stderr)[-2500:]


def as_ubuntu(cmd, timeout=900):
    return sh("sudo -u ubuntu PM2_HOME=/home/ubuntu/.pm2 bash -lc %s" % shlex.quote(cmd), timeout)


def page(path):
    r = subprocess.run(["curl", "-s", "-m", "25", "-w", "\n%{http_code}", "%s%s?tu=%d" % (SITE, path, time.time())],
                       capture_output=True, text=True, errors="replace")
    html, _, code = r.stdout.rpartition("\n")
    return code.strip(), html.count("8556178207"), MARK in html


if "REPLACE" in SHA + SUM:
    sys.exit("refusing: SHA/SUM not filled in")
comp = urllib.request.urlopen(RAW, timeout=60).read()
if hashlib.sha256(comp).hexdigest() != SUM:
    sys.exit("ABORT: sha256 mismatch on text-us-bubble.tsx; nothing changed")
bad = []
if MARK.encode() not in comp or b"export function TextUsBubble(" not in comp:
    bad.append("fetched component lacks marker/export")
raw = open(ROOT, "rb").read()
if hashlib.md5(raw).hexdigest() != ROOT_MD5:
    bad.append("drift: __root.tsx md5 " + hashlib.md5(raw).hexdigest())
s = raw.decode()
new = s
for a, b in EDITS:
    if s.count(a) != 1:
        bad.append("anchor x%d: %r" % (s.count(a), a[:50]))
    new = new.replace(a, b, 1)
if new.count("TextUsBubble") != 2:
    bad.append("TextUsBubble x%d after edit" % new.count("TextUsBubble"))
if os.path.exists(COMP):
    bad.append(COMP + " already exists")
rc, newer = sh("cd %s && ref=$(ls -t dist/client/fw-assets/*.js 2>/dev/null | head -1); [ -n \"$ref\" ] && find src -type f -newer \"$ref\" ! -name '*.bak*' | head -20" % APP)
newer = [x for x in newer.split() if x]
if rc != 0 or newer:
    bad.append("no bundle, or unbuilt source edits present: %s" % newer)
before = {p: page(p) for p in PAGES}
for p, r in before.items():
    print("before", p, r)
    if r[0] != "200" or r[2]:
        bad.append("baseline %s %r" % (p, r))
print("".join(difflib.unified_diff(s.splitlines(True), new.splitlines(True), "a/__root.tsx", "b/__root.tsx", n=1)))
print(sh("free -m | sed -n 2p; df -h %s | tail -1; du -sh %s/dist/client/fw-assets" % (APP, APP))[1])
if bad:
    sys.exit("ABORT, nothing changed: " + "; ".join(bad))
print("component sha256 OK (%d bytes); anchors OK; no unbuilt source edits" % len(comp))
if DRY:
    sys.exit("DRY RUN: nothing changed")

ts = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
BK = "/home/ubuntu/backup-east-text-us-" + ts
os.makedirs(BK)
shutil.copy2(ROOT, BK + "/__root.tsx")
sh("cp -a %s/dist/client/fw-assets %s/fw-assets-prev" % (APP, BK))
st = os.stat(ROOT)


def put(path, data):
    with open(path, "wb") as f:
        f.write(data)
    os.chown(path, st.st_uid, st.st_gid)


def build():
    rc, o = as_ubuntu("cd %s && NODE_OPTIONS=--max-old-space-size=3072 npm run build" % APP)
    print("build rc", rc, o[-600:])
    # keep the previous hashed assets so pages already loaded keep working
    sh("cp -an %s/fw-assets-prev/. %s/dist/client/fw-assets/" % (BK, APP))
    return rc == 0


def restart():
    rc, _ = as_ubuntu("pm2 restart fresh-web")
    time.sleep(10)
    return rc == 0


def verify():
    rc, n = sh("grep -rl %s %s/dist/client | wc -l" % (MARK, APP))
    ok = n.strip().isdigit() and int(n.strip()) >= 1
    print("client files with marker:", n.strip())
    for p in PAGES:
        r = page(p)
        print("after", p, r)
        ok = ok and r[0] == "200" and r[1] == before[p][1] and not r[2]
    return ok


put(COMP, comp)
put(ROOT, new.encode())
ok = build() and restart() and verify()
if ok:
    print("DONE. backup:", BK)
    sys.exit(0)
print("FAILED -> rolling back from", BK)
put(ROOT, raw)
if os.path.exists(COMP):
    os.remove(COMP)
print("rollback build ok:", build(), "| restart ok:", restart(), "| pages:", [page(p) for p in PAGES])
sys.exit(1)
