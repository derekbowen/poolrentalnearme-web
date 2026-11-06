"""WEST c208 (chat launcher), step 1 of 2: patch the build tree /home/ubuntu/build.
Step 2 (scripts_c208.py) writes build/gate/flip-c208.sh. README.md has the order.

Run with ops/runners/ssm_runx.py. DRY=True only checks. Refuses while a REPLACE
placeholder remains. Changed files must still have their pinned md5 (= the repo
before the change), new files must be absent, and the files the widget imports
must be the versions it was tested on. Replacements come from this public repo at
the PINNED commit, sha256-checked. TOKEN and SRI are public: they go into the build
tree's .env, the only place this build reads VITE_* from (its Dockerfile COPYs the
tree, vite loadEnv reads .env; no ARG, so --build-arg is dropped). The public
sdk.js must match SRI and send CORS. Old files and .env are copied to BK first.
"""
import base64, hashlib, os, re, shutil, sys, urllib.request

DRY = True
SHA = "REPLACE_AFTER_COMMIT"
TOKEN = "REPLACE_WITH_TOKEN"
SRI = "REPLACE_WITH_SRI"
RAW = "https://raw.githubusercontent.com/derekbowen/poolrentalnearme-web/%s/" % SHA
SDK = "https://chat.poolrentalnearme.com/packs/js/sdk.js"
B = "/home/ubuntu/build"
BK = "/home/ubuntu/backup-c208"
FILES = {  # path: (md5 of the build-tree file now, None = must not exist; sha256 of the new file)
    "src/routing/AppRouter.jsx": ("c30d1847b1a6b54c26b66ac2b7119499", "219bd60a4ee1965170a62972145f2e017e7da5954f0f9e9f2157d0be3389a1e5"),
    "server/csp.js": ("f8c3beae7696e51d26c83339a21ff43c", "09ff46739405395ca62abf970d4ea795be3a44bf6d5c9faa3e0ed75eff9cc436"),
    "src/components/ChatwootWidget/ChatwootWidget.js": (None, "b3016b29393f7f5682b64c804080d2a8f0236098deea82a7c2520ff315b00ff9"),
    "src/components/ChatwootWidget/chatwootLoader.js": (None, "121c54e032a7d13c0694c0c2a258dff71f9219b5c10bdb38f63e35fa059e7879"),
    "src/components/ChatwootWidget/chatwootLoader.test.js": (None, "2e491369ba16223fe469b2112daffa3e38fc3338e786692466217a68a0996419"),
}
DEPS = {  # imported by the widget, unchanged by c208
    "src/context/routeConfigurationContext.js": "9638d0adec76bf3cfa45278fa74b3a0c",
    "src/ducks/ui.duck.js": "311c87ddc2552054db2282fc5792f8e5",
    "src/hooks/useMediaQuery.js": "4c25023de4f9f8ce92f777dd88a03942",
    "src/util/routes.js": "f080c6da9cdb51951d5619e51a13f1a9",
    "src/routing/routeConfiguration.js": "df33ac56872a467311746ac159241d07",
}
md5 = lambda p: hashlib.md5(open(p, "rb").read()).hexdigest() if os.path.isfile(p) else None

ph = [n for n, v in (("SHA", SHA), ("TOKEN", TOKEN), ("SRI", SRI)) if "REPLACE" in v]
ph += [p for p, (_, s) in FILES.items() if "REPLACE" in s]
if ph:
    sys.exit("ABORT, nothing changed: placeholders remain: " + ", ".join(ph))
bad = [n for n, v, rx in (("SHA", SHA, "[0-9a-f]{40}"), ("TOKEN", TOKEN, "[A-Za-z0-9]{16,64}"),
                          ("SRI", SRI, "sha384-[A-Za-z0-9+/]{64}")) if not re.fullmatch(rx, v)]
if bad:
    sys.exit("ABORT, nothing changed: malformed " + ", ".join(bad))

new = {}
for p, (m, sha) in FILES.items():
    fp = os.path.join(B, p)
    if m is None and os.path.lexists(fp):
        bad.append("already exists: " + p)
    elif m and md5(fp) != m:
        bad.append("drift: " + p)
    try:
        new[p] = urllib.request.urlopen(RAW + p, timeout=60).read()
    except Exception as e:
        bad.append("fetch %s: %s" % (p, e))
        continue
    if hashlib.sha256(new[p]).hexdigest() != sha:
        bad.append("sha256 mismatch: " + p)
bad += ["dep drift: " + p for p, m in DEPS.items() if md5(os.path.join(B, p)) != m]
bad += [f + " exists (would override .env)" for f in (".env.local", ".env.production", ".env.production.local")
        if os.path.lexists(os.path.join(B, f))]
bad += [p + " exists (left by an earlier run)" for p in (BK, B + "/.env.c208tmp") if os.path.lexists(p)]
env = open(B + "/.env", "rb").read() if os.path.isfile(B + "/.env") else None  # holds secrets: never printed
if env is None or re.search(rb"(?m)^\s*(export\s+)?VITE_CHATWOOT_", env):
    bad.append("build-tree .env missing or already has VITE_CHATWOOT_*")
try:
    r = urllib.request.urlopen(urllib.request.Request(SDK, headers={"Origin": "https://www.poolrentalnearme.com"}), timeout=30)
    js, acao = r.read(), r.headers.get("Access-Control-Allow-Origin")
    if "sha384-" + base64.b64encode(hashlib.sha384(js).digest()).decode() != SRI:
        bad.append("public sdk.js (%d B) does not match SRI" % len(js))
    if acao not in ("*", "https://www.poolrentalnearme.com"):
        bad.append("public sdk.js lacks CORS (ACAO %r)" % acao)
except Exception as e:
    bad.append("sdk.js: %s" % e)
if bad:
    sys.exit("ABORT, nothing changed: " + "; ".join(bad))
print("2 files match pre-change md5, 3 new files absent, all 5 sha256-verified; 5 deps unchanged;"
      " .env has no VITE_CHATWOOT_*; public sdk.js matches SRI with CORS")
if DRY:
    sys.exit("DRY RUN: checks passed, nothing changed")

os.makedirs(BK, 0o700)
shutil.copy2(B + "/.env", BK + "/.env")
with open(BK + "/NEW_FILES", "w") as f:
    f.write("".join(p + "\n" for p, (m, _) in FILES.items() if m is None))
st = os.stat(B + "/.env")
add = (b"" if env.endswith(b"\n") or not env else b"\n") + (
    "# c208 chat launcher: public, compiled into the client bundle (ops/west/c208)\n"
    "VITE_CHATWOOT_WEBSITE_TOKEN=%s\nVITE_CHATWOOT_SDK_SRI=%s\n" % (TOKEN, SRI)).encode()
tmp = B + "/.env.c208tmp"  # made before any build-tree file changes, so a clash stops with nothing patched
with os.fdopen(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as f:
    f.write(env + add)
os.chown(tmp, st.st_uid, st.st_gid)
os.chmod(tmp, st.st_mode & 0o777)
for p, data in new.items():
    dst = os.path.join(B, p)
    if FILES[p][0]:
        os.makedirs(os.path.dirname(os.path.join(BK, p)), exist_ok=True)
        shutil.copy2(dst, os.path.join(BK, p))
        st = os.stat(dst)
    else:
        st = os.stat(B + "/src/components")
        if not os.path.isdir(os.path.dirname(dst)):
            os.makedirs(os.path.dirname(dst))
            os.chown(os.path.dirname(dst), st.st_uid, st.st_gid)
    with open(dst, "wb") as f:
        f.write(data)
    os.chown(dst, st.st_uid, st.st_gid)
os.replace(tmp, B + "/.env")
print(".env: 2 VITE_CHATWOOT_* lines appended (values not printed), mode %o" % (os.stat(B + "/.env").st_mode & 0o777))
print("PATCHED build tree. Backup:", BK, "(old files, .env, NEW_FILES). Next: scripts_c208.py")
