"""EAST: homepage hero video, one self-contained deploy (Derek, 2026-10-15: "Put the video on EAST").

Run with ops/runners/east_runx.py. From this public repo at a PINNED commit it
fetches the component, its imports and the six video files (all hash-checked),
puts the videos in src/assets/hero/ (Vite emits them hashed under /fw-assets/),
and patches src/components/home-page-winter.tsx at three exact anchors: the
imports after the paradise-hero-mobile import, the component above WinterHero,
and <HeroVideo /> after the hero's </picture>. Nothing else changes.

DRY=True (default): read-only; checks anchors, prints the diff, memory, pm2.
DRY=False: backup, patch, build, require HTTP 206 on a byte-range request for
the built video (Safari will not play without it), restart, verify. Any
failure restores the backup, removes the videos, rebuilds and restarts.
"""
import difflib, hashlib, os, pwd, re, shlex, shutil, subprocess, sys, time, urllib.request

DRY = True
SHA = "90f641d05b71fff4d844ccfd15278210b400d294"
SUMS = {  # repo path -> sha256 at SHA
    "HeroVideo.tsx.snippet": "24aba6c690239e5aacb1ef15d91641f650a4c944f3c47ca1d8b64989cd069144",
    "HeroVideo.imports.snippet": "454c8b19aece9ca09d33a3fc172dfd4ce3e4c376b9f97e7e7ba59e016d67c50e",
    "files/hero-desktop.mp4": "4075aee7122ca9858f07a71bbf7690709d9ad5991002d86dae9c7e77dee9b8e8",
    "files/hero-desktop.webm": "234da3e5d5d615cc63531ab04b45e4d4bbd8a7fe96b651ee3b23deeca107d482",
    "files/hero-mobile.mp4": "8ac00819f673a2fc8ac647b14277414c2641bcafe8bb5e24b8e3802f88c00883",
    "files/hero-mobile.webm": "aa9bc36b10e5004f79b5fbd3f3c37efa43e6967f6e7b8d49a6dc15eafc075a24",
    "files/hero-mobile-xs.mp4": "d08569787cb4c961022061b7f5daa5ef60f0658d7f46f586fc7b1e0c6f32796f",
    "files/hero-mobile-xs.webm": "911a4bb21ad0dc5fe5511fd1b7822a92330c4c08b53a5b75ef0097e07d2b9b5c",
}
APP = "/home/ubuntu/fresh-web"
SRC = APP + "/src/components/home-page-winter.tsx"
ASSETS = APP + "/src/assets/hero"
RAW = "https://raw.githubusercontent.com/derekbowen/poolrentalnearme-web/%s/ops/east/hero-video/" % SHA
SITE = "https://www.poolrentalnearme.com"
IMP_ANCHOR = 'import heroMobile from "@/assets/paradise-hero-mobile.webp";\n'
FN = "function WinterHero() {\n"


def sh(cmd, timeout=900):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
    return r.returncode, (r.stdout + r.stderr)[-3000:]


def as_ubuntu(cmd, timeout=900):
    return sh("sudo -u ubuntu PM2_HOME=/home/ubuntu/.pm2 bash -lc %s" % shlex.quote(cmd), timeout)


def fetch(path):
    data = urllib.request.urlopen(RAW + path, timeout=120).read()
    if hashlib.sha256(data).hexdigest() != SUMS.get(path):
        sys.exit("ABORT: sha256 mismatch on %s; nothing changed" % path)
    return data


if "REPLACE" in SHA or len(SUMS) != 8:
    sys.exit("refusing: SHA/SUMS not filled in")
snippet = fetch("HeroVideo.tsx.snippet").decode()
imports = fetch("HeroVideo.imports.snippet").decode()
videos = {p.split("/")[-1]: fetch(p) for p in SUMS if p.startswith("files/")}
print("fetched + verified:", ", ".join("%s %dKB" % (k, len(v) // 1024) for k, v in videos.items()))

s = open(SRC).read()
print("src sha256", hashlib.sha256(s.encode()).hexdigest()[:16], "bytes", len(s))
bad = []
if "HeroVideo" in s:
    bad.append("HeroVideo already present")
if not all(h in s.splitlines()[0] for h in ("useEffect", "useRef", "useState")):
    bad.append("first import lacks useEffect/useRef/useState")
for a in (IMP_ANCHOR, FN):
    if s.count(a) != 1:
        bad.append("anchor %r count %d" % (a.strip(), s.count(a)))
if os.path.exists(ASSETS):
    bad.append(ASSETS + " already exists")
if not bad:
    start = s.find(FN)
    nxt = s.find("\nfunction ", start + len(FN))
    body = s[start:nxt if nxt > 0 else len(s)]
    pics = list(re.finditer(r"\n([ \t]*)</picture>\n", body))
    if len(pics) != 1:
        bad.append("</picture> inside WinterHero: %d" % len(pics))
if bad:
    sys.exit("ABORT, nothing changed: " + "; ".join(bad))

m = pics[0]
body2 = body[:m.end()] + m.group(1) + "<HeroVideo />\n" + body[m.end():]
new = s[:start] + snippet + body2 + s[start + len(body):]
new = new.replace(IMP_ANCHOR, IMP_ANCHOR + imports, 1)
print("".join(difflib.unified_diff(s.splitlines(True), new.splitlines(True), "a", "b", n=1))[:5000])
print(sh("free -m; df -h %s | tail -1" % APP)[1])
print(as_ubuntu("pm2 jlist | python3 -c \"import json,sys;[print(p['name'],p['pm2_env']['status']) for p in json.load(sys.stdin)]\"")[1])
if DRY:
    sys.exit("DRY RUN: anchors OK, nothing changed")

ts = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
bak = SRC + ".bak-" + ts
shutil.copy2(SRC, bak)
u = pwd.getpwnam("ubuntu")


def put(path, data, mode="w"):
    with open(path, mode) as f:
        f.write(data)
    os.chown(path, u.pw_uid, u.pw_gid)


def build():
    rc, out = as_ubuntu("cd %s && NODE_OPTIONS=--max-old-space-size=1536 npm run build" % APP)
    print("build rc", rc, out[-1200:])
    return rc == 0


def restart():
    rc, _ = as_ubuntu("pm2 restart fresh-web")
    time.sleep(8)
    return rc == 0


def range_ok():
    rc, f = sh("find %s/dist -name 'hero-desktop-*.mp4' | head -1" % APP)
    name = os.path.basename(f.strip())
    if not name:
        print("built video not found in dist")
        return False
    rc, out = sh("curl -s -o /dev/null -m 30 -r 0-1023 -w '%%{http_code} %%{content_type}' %s/fw-assets/%s" % (SITE, name))
    print("range check", name, "->", out)
    return out.startswith("206") and "video/mp4" in out


def home_ok():
    rc, html = sh("curl -s -m 25 '%s/?hv=%s'" % (SITE, ts))
    return "Swim all winter." in html


os.makedirs(ASSETS)
os.chown(ASSETS, u.pw_uid, u.pw_gid)
for name, data in videos.items():
    put(os.path.join(ASSETS, name), data, "wb")
put(SRC, new)
ok = build()
if ok and not range_ok():
    ok = restart() and range_ok()   # the old process may not serve new dist files yet
if ok:
    ok = restart() and home_ok() and range_ok()
if ok:
    print("DONE. backup:", bak)
    sys.exit(0)
print("FAILED -> rolling back to", bak)
put(SRC, open(bak).read())
shutil.rmtree(ASSETS, ignore_errors=True)
print("rollback build ok:", build(), "| restart ok:", restart(), "| homepage ok:", home_ok())
sys.exit(1)
