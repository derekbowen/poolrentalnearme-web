"""EAST: Chatwoot widget on non-admin fresh-web pages; staged build + atomic dist swap (see README.md).

Run: python3 ops/runners/east_runx.py ops/chatbot/ops/east_widget.py   (the runner reads RUNNER_TIMEOUT below
and exports PRNM_RUNNER_TIMEOUT; anything else gets a 560 s budget and the gate refuses).
The staged build's .env.production.local gets BOTH VITE_CHATWOOT_WEBSITE_TOKEN (the PRNM Website inbox) and
VITE_CHATWOOT_SDK_SRI (sha384 of the running chatwoot-rails-1 /app/public/packs/js/sdk.js, computed here and
required to equal what https://chat.poolrentalnearme.com serves, with CORS); either missing -> abort.
Memory: the build runs in a transient systemd scope capped at MemAvailable-512 MB RAM and SwapFree-256 MB swap
(heap NODE_OPTIONS=--max-old-space-size=3072 per OPS_RECORD 2026-11-04), so an OOM kills only the build.
Budget: the build gets <= 900 s (RuntimeMaxSec); the dist swap never starts later than 360 s before SSM's limit,
and everything after the swap (restart, 2 page checks, rollback) is bounded to well under that.
TRIAL = True (with DRY = False, Derek's GO) runs only the capped staged build and prints its time and peak RAM/swap,
then deletes the stage: the measured trial the review asked for before the first real run. It never swaps.
"""
import base64, ctypes, hashlib, os, shlex, subprocess, sys, time, urllib.request

T0 = time.time()
DRY = True
TRIAL = False  # with DRY = False: run the capped staged build, report time + peak memory, delete it; never swaps
RUNNER_TIMEOUT = 1800  # SSM executionTimeout east_runx.py uses for this script
SHA = "REPLACE_AFTER_COMMIT"  # commit holding ops/chatbot/ops/east/chatwoot-widget.tsx
SUM = "REPLACE_AFTER_COMMIT"  # sha256 of that file at SHA
RAW = "https://raw.githubusercontent.com/derekbowen/poolrentalnearme-web/%s/ops/chatbot/ops/east/" % SHA
APP = "/home/ubuntu/fresh-web"
ROOT_MD5 = "c6aedc950b8e3a76efed6d7f64fe647e"
MARK = "prnm-chatwoot-v1"
SITE = "https://www.poolrentalnearme.com"
SDK = "https://chat.poolrentalnearme.com/packs/js/sdk.js"
SDK_FILE = "/app/public/packs/js/sdk.js"  # inside chatwoot-rails-1
PAGES = ("/", "/p/how-to-host-a-pool-party")
IMP = 'import { AffiliateRefCapture } from "@/components/affiliate-ref-capture";\n'
MNT = "        {!isAdmin && <SiteFooter />}\n      </div>\n    </>\n"
EDITS = [(IMP, IMP + 'import { ChatwootWidget } from "@/components/chatwoot-widget";\n'),
         (MNT, MNT.replace("    </>", "      {!isAdmin && <ChatwootWidget />}\n    </>"))]
R, C, E = "src/routes/__root.tsx", "src/components/chatwoot-widget.tsx", ".env.production.local"
MIN_MB = 1536  # RAM cap below this: sidekiq is stopped for the build (guard timer, always restarted)
KEEP_RAM, KEEP_SWAP = 512, 256  # MB the build leaves to fresh-web + Chatwoot
BUILD_MAX, AFTER = 900, 360  # build seconds; seconds kept after the swap for restart/verify/rollback
END = T0 + int(os.environ.get("PRNM_RUNNER_TIMEOUT", 560)) - AFTER  # no dist swap after this


def sh(c, t=600):  # a timeout is a failed step (rc 124), never an exception that skips the rollback
    try:
        r = subprocess.run(c, shell=True, capture_output=True, text=True, timeout=t, executable="/bin/bash")
    except subprocess.TimeoutExpired:
        return 124, "timed out after %d s" % t
    return r.returncode, (r.stdout + r.stderr).strip()


def ub(c, t=60, pre=""):  # as ubuntu; pre: a command prefix (the build's systemd-run scope)
    return sh("cd /home/ubuntu && %ssudo -u ubuntu PM2_HOME=/home/ubuntu/.pm2 bash -lc %s" % (pre, shlex.quote(c)), t)


def mb(key):  # /proc/meminfo field in MB
    return int(open("/proc/meminfo").read().split(key + ":")[1].split()[0]) // 1024


def page(p):  # (status, marker leaked into the server HTML?)
    o = sh("curl -s -m 25 -w '\\n%%{http_code}' '%s%s?cw=%d'" % (SITE, p, time.time()))[1]
    return o[-3:], MARK in o


def exchange(a, b):  # renameat2(RENAME_EXCHANGE): atomic swap, same filesystem
    if ctypes.CDLL(None, use_errno=True).renameat2(-100, a.encode(), -100, b.encode(), 2):
        raise OSError(ctypes.get_errno(), "renameat2 " + a)


def put(base, rel, data, mode=0o644, mtime=None):
    p = os.path.join(base, rel)
    with open(p + ".prnm-tmp", "wb") as f:
        f.write(data)
    os.chmod(p + ".prnm-tmp", mode)
    os.chown(p + ".prnm-tmp", UID, GID)
    os.replace(p + ".prnm-tmp", p)  # new inode: never writes through a hard link
    if mtime:
        os.utime(p, (mtime, mtime))


if "REPLACE" in SHA + SUM:
    sys.exit("refusing: SHA/SUM not filled in")
comp = urllib.request.urlopen(RAW + "chatwoot-widget.tsx", timeout=60).read()
if hashlib.sha256(comp).hexdigest() != SUM:
    sys.exit("ABORT: sha256 mismatch; nothing changed")
bad = []
raw = open(os.path.join(APP, R), "rb").read()
st = os.stat(os.path.join(APP, R))
UID, GID = st.st_uid, st.st_gid
if hashlib.md5(raw).hexdigest() != ROOT_MD5:
    bad.append("drift: __root.tsx md5 " + hashlib.md5(raw).hexdigest())
s = new = raw.decode()
for a, b in EDITS:
    if s.count(a) != 1:
        bad.append("anchor x%d: %r" % (s.count(a), a[:40]))
    new = new.replace(a, b, 1)
bad += [p + " exists" for p in (C, E) if os.path.exists(os.path.join(APP, p))]
rc, newer = sh("cd %s && ref=$(ls -t dist/client/fw-assets/*.js | head -1) && find src -type f -newer $ref | head" % APP)
if rc or newer:
    bad.append("unbuilt source edits: %s" % newer.split())
tok = sh("docker exec chatwoot-postgres-1 psql -U postgres -d chatwoot_production -Atc \"select w.website_token from "
         "channel_web_widgets w join inboxes i on i.channel_type='Channel::WebWidget' and i.channel_id=w.id where "
         "i.name='PRNM Website'\"")[1].split()
if len(tok) != 1 or not tok[0].isalnum():
    bad.append("no PRNM Website token (cw_setup.py)")
js = subprocess.run(["docker", "exec", "chatwoot-rails-1", "cat", SDK_FILE], capture_output=True, timeout=60).stdout
SRI = "sha384-" + base64.b64encode(hashlib.sha384(js).digest()).decode()
try:  # the browser checks SRI and CORS (crossorigin="anonymous") against what the public URL serves
    q = urllib.request.urlopen(urllib.request.Request(SDK, headers={"Origin": SITE}), timeout=15)
    pub, acao = q.read(), q.headers.get("Access-Control-Allow-Origin")
except Exception as e:  # noqa: BLE001
    pub, acao = b"", "%s: %s" % (type(e).__name__, str(e)[:60])
if not js:
    bad.append("no %s in chatwoot-rails-1: no SRI" % SDK_FILE)
elif pub != js or acao not in ("*", SITE):
    bad.append("public sdk.js (%d B, Access-Control-Allow-Origin %r) differs from the container's (%d B) or lacks "
               "CORS (cw_nginx.py)" % (len(pub), acao, len(js)))
before = {p: page(p) for p in PAGES}
if any(r != ("200", False) for r in before.values()):
    bad.append("baseline %r" % before)
if END - time.time() < BUILD_MAX + 100:
    bad.append("runner budget too short: run through ops/runners/east_runx.py (RUNNER_TIMEOUT)")
cap, swap = mb("MemAvailable") - KEEP_RAM, max(0, mb("SwapFree") - KEEP_SWAP)
print("baseline", before, "| sdk.js %d B %s | build cap now %d MB RAM + %d MB swap%s |"
      % (len(js), SRI, cap, swap, " (sidekiq would stop)" if cap < MIN_MB else ""), sh("df -h /home | tail -1")[1])
if bad:
    sys.exit("ABORT, nothing changed: " + "; ".join(bad))
print("sha256, md5, anchors, token and SRI OK; WEST's build uses the same VITE_CHATWOOT_SDK_SRI. selfcheck.py shows "
      "the __root.tsx diff")
if DRY:
    sys.exit("DRY RUN: nothing changed")

ts = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
BK, ST = "/home/ubuntu/backup-east-chatwoot-widget-" + ts, "/home/ubuntu/fresh-web-stage-" + ts
os.makedirs(BK)
os.makedirs(ST)
os.chown(ST, UID, GID)
open(BK + "/__root.tsx", "wb").write(raw)
cp = [sh("cp -a%s %s %s/" % ("l" * (n == "node_modules"), shlex.quote(os.path.join(APP, n)), ST), 300)[0]
      for n in os.listdir(APP) if not n.startswith("dist")]  # no dist, no dist.bak*
sh("rm -rf {0}/node_modules/.vite {0}/node_modules/.vite-temp {0}/node_modules/.cache".format(ST))  # stage only
envb = ("VITE_CHATWOOT_WEBSITE_TOKEN=%s\nVITE_CHATWOOT_SDK_SRI=%s\n" % (tok[0], SRI)).encode()
put(ST, R, new.encode())
put(ST, C, comp)
put(ST, E, envb, 0o600)
if any(cp) or END - time.time() < 300:
    sh("rm -rf " + ST)
    sys.exit("ABORT: staging copy failed (%s) or out of time; live site untouched" % cp)
GUARD, SCOPE = "prnm-sidekiq-guard-" + ts, "prnm-fw-build-" + ts
stopped = False
if cap < MIN_MB:  # rule 4: the one-shot safety timer is disclosed in this output
    if sh("systemd-run --on-active=%d --unit=%s /usr/bin/docker start chatwoot-sidekiq-1" % (BUILD_MAX + 400, GUARD))[0]:
        print("guard timer %s not created; sidekiq left running" % GUARD)
    else:
        stopped = sh("docker stop chatwoot-sidekiq-1")[0] == 0
        print("low memory (cap %d MB): sidekiq stopped %s for the build; timer %s.timer runs 'docker start "
              "chatwoot-sidekiq-1' once at +%d s unless cancelled" % (cap, stopped, GUARD, BUILD_MAX + 400))
        cap = mb("MemAvailable") - KEEP_RAM
bt = int(min(BUILD_MAX, END - time.time() - 30))
print("build: transient scope %s.scope, MemoryMax=%dM MemorySwapMax=%dM RuntimeMaxSec=%d (no schedule; it ends with "
      "the build)" % (SCOPE, cap, swap, bt))
try:  # the build reports its own scope's peak RAM / swap (cgroup v2 memory.peak, memory.swap.peak)
    rc, o = ub("cd %s && NODE_OPTIONS=--max-old-space-size=3072 nice -n 10 npm run build; rc=$?; g=/sys/fs/cgroup$(sed "
               "-n 's/^0:://p' /proc/self/cgroup); echo peak RAM $(cat $g/memory.peak 2>/dev/null || echo n/a) swap "
               "$(cat $g/memory.swap.peak 2>/dev/null || echo n/a) bytes; exit $rc" % ST, bt + 60,
               "systemd-run --scope -q --unit=%s -p MemoryMax=%dM -p MemorySwapMax=%dM -p RuntimeMaxSec=%d "
               % (SCOPE, cap, swap, bt))
finally:
    if stopped:
        print("sidekiq started:", sh("docker start chatwoot-sidekiq-1")[0] == 0,
              "| guard cancelled:", sh("systemctl stop %s.timer" % GUARD)[0] == 0)
nd = ST + "/dist/client"
hits = [sh("grep -rlF -- %s %s | wc -l" % (shlex.quote(x), nd))[1] for x in (MARK, tok[0], SRI)]
print("build rc", rc, o[-400:], "| client files with marker, token, SRI:", hits, "| %d s elapsed" % (time.time() - T0))
for sub in ("client/fw-assets", "server/fw-assets"):  # old chunks stay for pages already open
    sh("cp -aln %s/dist/%s/. %s/dist/%s/" % (APP, sub, ST, sub), 120)
if rc or "0" in hits or not os.path.exists(ST + "/dist/server/server.js") or time.time() > END:
    sh("rm -rf " + ST)
    sys.exit("ABORT: build failed or out of time; live site untouched")
if TRIAL:
    sh("rm -rf %s %s" % (ST, BK))
    sys.exit("TRIAL: capped build passed in %d s (peak above); stage removed, live site untouched" % (time.time() - T0))


def restart_ok():  # <= ~120 s: pm2 60 + 10 + two 25 s page checks
    rc, _ = ub("pm2 restart fresh-web")
    time.sleep(10)
    r = {p: page(p) for p in PAGES}
    print("restart rc", rc, r)
    return rc == 0 and all(v == ("200", False) for v in r.values())


exchange(APP + "/dist", ST + "/dist")
if restart_ok():
    mt = os.stat(os.path.join(ST, R)).st_mtime  # older than the bundle, so the next gate stays clean
    put(APP, R, new.encode(), st.st_mode & 0o777, mt)
    put(APP, C, comp, 0o644, mt)
    put(APP, E, envb, 0o600, mt)
    os.rename(ST + "/dist", BK + "/dist-prev")
    print("DONE. backup + previous dist:", BK)
    sh("rm -rf " + ST)
    sys.exit(0)
print("FAILED -> exchanging the previous dist back")
exchange(APP + "/dist", ST + "/dist")
print("rollback ok:", restart_ok())
sh("rm -rf " + ST)
sys.exit(1)
