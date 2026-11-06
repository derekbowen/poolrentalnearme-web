"""WEST c208 (chat launcher), step 2 of 2: write /home/ubuntu/build/gate/flip-c208.sh
from the c207 scripts with exact-anchor replacements (each anchor must occur exactly
the expected number of times). Step 1 is patch_c208.py; README.md has the order.

Run with ops/runners/ssm_runx.py. DRY=True only checks. Refuses while a REPLACE
placeholder remains, and unless the c207 scripts are byte-identical (md5) to the
copies the anchors were tested on (fixtures/c207/). Keeps the memory-capped build
and every carried-forward gate check; adds a build-tree guard to the build, and two
blocks fetched at the PINNED commit, sha256-checked: gate_c208_block.sh and
flip_c208_block.sh (which /login entry is live; an abort between step 1 and 2
returns traffic to MAIN on :4000).
"""
import hashlib, os, pwd, re, sys, urllib.request

DRY = True
SHA = "REPLACE_AFTER_COMMIT"
TOKEN = "REPLACE_WITH_TOKEN"
SRI = "REPLACE_WITH_SRI"
RAW = "https://raw.githubusercontent.com/derekbowen/poolrentalnearme-web/%s/" % SHA
SDK = "https://chat.poolrentalnearme.com/packs/js/sdk.js"
H = "/home/ubuntu"
BLOCK = ("ops/west/c208/gate_c208_block.sh", "db011ebf677e1132a4caff8ef46c241384044ee9db25c9dbbfbe34d287605148")
FLIP = ("ops/west/c208/flip_c208_block.sh", "809df9a214317472676ffff118f9d676f6da458e9e4e8f8f951b4e2dc65e95e9")
C207 = {"build-c207.sh": "fddf1ce1189a6dc4f6a984ba9f30773d", "gate-c207.sh": "1b70e733c2eb7a9f89047542fce35e62",
        "flip-c207.sh": "f1940a806085782ead35756cc1d73806"}

ph = [n for n, v in (("SHA", SHA), ("TOKEN", TOKEN), ("SRI", SRI), ("BLOCK", BLOCK[1]), ("FLIP", FLIP[1])) if "REPLACE" in v]
if ph:
    sys.exit("ABORT, nothing changed: placeholders remain: " + ", ".join(ph))
bad = [n for n, v, rx in (("SHA", SHA, "[0-9a-f]{40}"), ("TOKEN", TOKEN, "[A-Za-z0-9]{16,64}"),
                          ("SRI", SRI, "sha384-[A-Za-z0-9+/]{64}")) if not re.fullmatch(rx, v)]
if bad:
    sys.exit("ABORT, nothing changed: malformed " + ", ".join(bad))
src = {}
for f, m in C207.items():
    p = os.path.join(H, f)
    src[f] = open(p, "rb").read() if os.path.isfile(p) else b""
    if hashlib.md5(src[f]).hexdigest() != m:
        bad.append("c207 script missing or changed: " + f)
bad += ["already exists " + f for f in ("build-c208.sh", "gate-c208.sh", "flip-c208.sh") if os.path.lexists(os.path.join(H, f))]
blk = {}
for k, (p, want) in (("gate", BLOCK), ("flip", FLIP)):
    try:
        blk[k] = urllib.request.urlopen(RAW + p, timeout=60).read()
        if hashlib.sha256(blk[k]).hexdigest() != want:
            bad.append("sha256 mismatch: " + p)
    except Exception as e:
        bad.append("fetch %s: %s" % (p, e))
if bad:
    sys.exit("ABORT, nothing changed: " + "; ".join(bad))


def sed(name, pairs):
    s = src[name].decode("utf-8")
    for a, b, n in pairs:
        if s.count(a) != n:
            sys.exit("ABORT, nothing changed: anchor %r found %d times in %s, want %d" % (a, s.count(a), name, n))
        s = s.replace(a, b)
    return s


T = "src/components/ChatwootWidget/chatwootLoader.test.js"
NP = 'echo FAIL > /home/ubuntu/build-c208.done; exit 1; }\n'
GUARD = ('[ -f src/components/ChatwootWidget/chatwootLoader.js ] || { echo "NOT PATCHED: widget files missing (patch_c208.py)"; ' + NP +
         "grep -q '^VITE_CHATWOOT_WEBSITE_TOKEN=' .env && grep -q '^VITE_CHATWOOT_SDK_SRI=' .env || "
         '{ echo "NOT PATCHED: .env lacks VITE_CHATWOOT_* (patch_c208.py)"; ' + NP)
build = sed("build-c207.sh", [
    ("build-c207", "build-c208", 6), ("c207-no-intercom", "c208-chat-widget", 4), ("=== c207 build", "=== c208 build", 1),
    ("cd /home/ubuntu/build || exit 1\n", "cd /home/ubuntu/build || exit 1\n" + GUARD, 1),
    ("health-booking.test.js ||", "health-booking.test.js %s ||" % T, 1)])
G208 = blk["gate"].decode("utf-8").replace("@TOKEN@", TOKEN).replace("@SRI@", SRI).replace("@SDK@", SDK)
P = 'echo "=== c%s GATE PASSED $(date -u) — nginx NOT touched, live still on c%s (:4000) ==="'
gate = sed("gate-c207.sh", [
    ("gate-c207.log", "gate-c208.log", 1), ("gate-c207.done", "gate-c208.done", 3),
    ("NEW=c207-no-intercom:latest", "NEW=c208-chat-widget:latest", 1),
    ("prod-clone-c207.env", "prod-clone-c208.env", 1), ("production-c207gate", "production-c208gate", 1),
    ("=== c207 GATE $(date", "=== c208 GATE $(date", 1), (P % ("207", "204"), G208 + P % ("208", "207"), 1)])
S = 'abort "live $u after step %s"; done\n'
flip = sed("flip-c207.sh", [
    ("flip-c207.log", "flip-c208.log", 1), ("flip-c207.done", "flip-c208.done", 3),
    ("NEW=c207-no-intercom:latest; OLD=c206-ceo-cal-health:latest", "NEW=c208-chat-widget:latest; OLD=c207-no-intercom:latest", 1),
    ("prod-clone-c207.env", "prod-clone-c208.env", 1), ("production-c207gate", "production-c208gate", 1),
    ("=== c207 FLIP $(date", "=== c208 FLIP $(date", 1), ("=== c207 FLIP DONE", "=== c208 FLIP DONE", 1),
    ("gated c207 on :3000", "gated c208 on :3000", 1), ("with c207 (keeps", "with c208 (keeps", 1),
    ('|| abort "env preflight failed"\n', '|| abort "env preflight failed"\n' + blk["flip"].decode("utf-8"), 1),
    ('(reload, never restart) ---"\n', '(reload, never restart) ---"\nBACK=1\n', 1),
    ('docker rm -f "$MAIN" ||', 'BACK=0\ndocker rm -f "$MAIN" ||', 1),
    (S % 1, S % 1 + 'live_idx "after step 1"\n', 1), (S % 3, S % 3 + 'live_idx "after step 3"\n', 1)])
for name, body, gone in (("build", build, ("c207",)), ("gate", gate, ("c207-no-intercom", "gate-c207", "c207gate", "clone-c207", "@TOKEN@", "@SRI@", "@SDK@")),
                         ("flip", flip, ("flip-c207", "c207gate", "clone-c207", "c206"))):
    if [g for g in gone if g in body] or "c208-chat-widget" not in body or body.count("--memory=2500m --memory-swap=2500m") != 2 * (name == "build"):
        sys.exit("ABORT, nothing changed: %s-c208.sh still names c207/c206, lacks c208 or changed the memory caps" % name)
print("scripts ok:", {"build": len(build), "gate": len(gate), "flip": len(flip)})
if DRY:
    sys.exit("DRY RUN: checks passed, nothing written")

u = pwd.getpwnam("ubuntu")
for name, body in (("build-c208.sh", build), ("gate-c208.sh", gate), ("flip-c208.sh", flip)):
    p = os.path.join(H, name)
    with open(p, "w", encoding="utf-8") as f:
        f.write(body)
    os.chmod(p, 0o755)
    os.chown(p, u.pw_uid, u.pw_gid)
print("WROTE build/gate/flip-c208.sh. Next: launch_c208.py STEP=build")
