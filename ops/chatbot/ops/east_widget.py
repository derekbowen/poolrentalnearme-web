"""EAST: Chatwoot widget on non-admin fresh-web pages; staged build + atomic dist swap (see README.md)."""
import ctypes, hashlib, os, shlex, subprocess, sys, time, urllib.request

DRY = True
SHA = "REPLACE_AFTER_COMMIT"  # commit holding ops/chatbot/ops/east/chatwoot-widget.tsx
SUM = "REPLACE_AFTER_COMMIT"  # sha256 of that file at SHA
RAW = "https://raw.githubusercontent.com/derekbowen/poolrentalnearme-web/%s/ops/chatbot/ops/east/" % SHA
APP = "/home/ubuntu/fresh-web"
ROOT_MD5 = "c6aedc950b8e3a76efed6d7f64fe647e"
MARK = "prnm-chatwoot-v1"
SITE = "https://www.poolrentalnearme.com"
PAGES = ("/", "/p/how-to-host-a-pool-party")
IMP = 'import { AffiliateRefCapture } from "@/components/affiliate-ref-capture";\n'
MNT = "        {!isAdmin && <SiteFooter />}\n      </div>\n    </>\n"
EDITS = [(IMP, IMP + 'import { ChatwootWidget } from "@/components/chatwoot-widget";\n'),
         (MNT, MNT.replace("    </>", "      {!isAdmin && <ChatwootWidget />}\n    </>"))]
R, C, E = "src/routes/__root.tsx", "src/components/chatwoot-widget.tsx", ".env.production.local"
MIN_MB = 1536  # MemAvailable below this: sidekiq is stopped for the build (always restarted)


def sh(c, t=600):
    r = subprocess.run(c, shell=True, capture_output=True, text=True, timeout=t, executable="/bin/bash")
    return r.returncode, (r.stdout + r.stderr).strip()


def ub(c, t=600):
    return sh("cd /home/ubuntu && sudo -u ubuntu PM2_HOME=/home/ubuntu/.pm2 bash -lc " + shlex.quote(c), t)


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
sdk = sh("curl -s -o /dev/null -w '%{http_code}' -m 15 https://chat.poolrentalnearme.com/packs/js/sdk.js")[1]
if sdk != "200":
    bad.append("public sdk.js: %s (cw_nginx.py)" % sdk)
before = {p: page(p) for p in PAGES}
if any(r != ("200", False) for r in before.values()):
    bad.append("baseline %r" % before)
avail = int(open("/proc/meminfo").read().split("MemAvailable:")[1].split()[0]) // 1024
print("baseline", before, "| sdk.js", sdk, "| MemAvailable %d MB |" % avail, sh("df -h /home | tail -1")[1])
if bad:
    sys.exit("ABORT, nothing changed: " + "; ".join(bad))
print("sha256, md5, anchors and token OK (selfcheck.py shows the diff)")
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
envline = ("VITE_CHATWOOT_WEBSITE_TOKEN=%s\n" % tok[0]).encode()
put(ST, R, new.encode())
put(ST, C, comp)
put(ST, E, envline, 0o600)
stopped = False
if avail < MIN_MB:  # rule 4: the safety timer is disclosed below
    sh("systemd-run --on-active=1200 --unit=prnm-sidekiq-guard /usr/bin/docker start chatwoot-sidekiq-1")
    print("low memory (%d MB): sidekiq stopped for the build; timer prnm-sidekiq-guard runs "
          "'docker start chatwoot-sidekiq-1' once at +20 min unless cancelled" % avail)
    stopped = sh("docker stop chatwoot-sidekiq-1")[0] == 0
try:
    rc, o = ub("cd %s && NODE_OPTIONS=--max-old-space-size=3072 nice -n 10 npm run build" % ST, 480)
finally:
    if stopped:
        print("sidekiq started:", sh("docker start chatwoot-sidekiq-1")[0] == 0,
              "| guard cancelled:", sh("systemctl stop prnm-sidekiq-guard.timer")[0] == 0)
nd = ST + "/dist/client"
hits = sh("grep -rlF %s %s | wc -l; grep -rlF %s %s | wc -l" % (MARK, nd, tok[0], nd))[1].split()
print("build rc", rc, o[-400:], "| client files with marker, token:", hits)
if rc or any(cp) or len(hits) != 2 or "0" in hits or not os.path.exists(ST + "/dist/server/server.js"):
    sh("rm -rf " + ST)
    sys.exit("ABORT: build failed; live site untouched")
for sub in ("client/fw-assets", "server/fw-assets"):  # old chunks stay for pages already open
    sh("cp -aln %s/dist/%s/. %s/dist/%s/" % (APP, sub, ST, sub))


def restart_ok():
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
    put(APP, E, envline, 0o600, mt)
    os.rename(ST + "/dist", BK + "/dist-prev")
    sh("rm -rf " + ST)
    print("DONE. backup + previous dist:", BK)
    sys.exit(0)
print("FAILED -> exchanging the previous dist back")
exchange(APP + "/dist", ST + "/dist")
print("rollback ok:", restart_ok())
sh("rm -rf " + ST)
sys.exit(1)
