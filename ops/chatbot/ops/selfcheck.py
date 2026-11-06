#!/usr/bin/env python3
"""Local checks for ops/chatbot/ops (runs here, never on a server; changes nothing remote).

  python3 ops/chatbot/ops/selfcheck.py [--embed] [--box-root PATH]

--embed      re-embed cw_setup.rb into cw_setup.py (zlib+base85 + sha256) before checking
--box-root   saved copy of EAST's src/routes/__root.tsx for the anchor check

Checks: python syntax; every shipped script still has DRY = True; runner payload size
(same arithmetic as ops/runners/_runner_common.py: base64 < 9400 and command <= 9500);
the embedded Ruby equals cw_setup.rb and passes `ruby -c`; the widget CSS block is
byte-identical in the WEST loader and the EAST snippet; east_widget.py's md5 and both
anchors match the saved box copy (prints the resulting diff); placeholders are reported.
"""
import base64, difflib, hashlib, os, re, shutil, subprocess, sys, zlib

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
SHIPPED = ["cw_harden.py", "cw_setup.py", "cw_nginx.py", "bot_deploy.py", "cw_status.py", "east_widget.py",
           "cw_push_test.py"]
DEFAULT_BOX_ROOT = os.path.join(HERE, "tests", "fixtures", "east__root.tsx")  # EAST's file, fetched 2026-11-05
fails = []


def fail(msg):
    fails.append(msg)
    print("FAIL", msg)


def embed():
    rb = open(os.path.join(HERE, "cw_setup.rb"), "rb").read()
    p = os.path.join(HERE, "cw_setup.py")
    s = open(p).read()
    s = re.sub(r'^RB_SHA = ".*"$', 'RB_SHA = "%s"' % hashlib.sha256(rb).hexdigest(), s, count=1, flags=re.M)
    s = re.sub(r'^RBZ = ".*"$', lambda m: 'RBZ = "%s"' % base64.b85encode(zlib.compress(rb, 9)).decode(), s,
               count=1, flags=re.M)
    open(p, "w").write(s)
    print("embedded cw_setup.rb (%d bytes, sha256 %s)" % (len(rb), hashlib.sha256(rb).hexdigest()))


def payload(path):
    raw = open(path, "rb").read()
    b64 = base64.b64encode(raw).decode()
    remote = "/tmp/prnm_step_%s.py" % ("0" * 10)
    cmd = "echo %s | base64 -d > %s && python3 %s; rm -f %s" % (b64, remote, remote, remote)
    return len(raw), len(b64), len(cmd)


def css_block(path):
    s = open(path).read()
    m = re.search(r"prnm-cw-css:start \*/.*?`(.*?)`.*?/\* prnm-cw-css:end", s, re.S)
    return m.group(1) if m else None


def main():
    args = sys.argv[1:]
    if "--embed" in args:
        embed()
    box_root = args[args.index("--box-root") + 1] if "--box-root" in args else DEFAULT_BOX_ROOT

    print("== syntax, DRY default, runner payload")
    for f in SHIPPED:
        p = os.path.join(HERE, f)
        if not os.path.exists(p):
            fail("missing " + f)
            continue
        r = subprocess.run([sys.executable, "-m", "py_compile", p], capture_output=True, text=True)
        if r.returncode:
            fail("syntax %s: %s" % (f, r.stderr[-300:]))
        src = open(p).read()
        if not re.search(r"^DRY = True$", src, re.M) and f != "cw_status.py":
            fail("%s: DRY is not True" % f)
        raw, b64, cmd = payload(p)
        ok = b64 < 9400 and cmd <= 9500
        print("  %-14s raw %5d  base64 %5d  command %5d  %s" % (f, raw, b64, cmd, "OK" if ok else "TOO BIG"))
        if not ok:
            fail("payload " + f)
        ph = sorted(set(re.findall(r"REPLACE_[A-Z0-9_]+", src)))
        if ph:
            print("  %-14s placeholders (refuses to run until filled): %s" % ("", ", ".join(ph)))

    print("== embedded Ruby")
    s = open(os.path.join(HERE, "cw_setup.py")).read()
    rb = open(os.path.join(HERE, "cw_setup.rb"), "rb").read()
    m = re.search(r'^RBZ = "(.*)"$', s, re.M)
    sha = re.search(r'^RB_SHA = "(.*)"$', s, re.M)
    try:
        same = zlib.decompress(base64.b85decode(m.group(1))) == rb and sha.group(1) == hashlib.sha256(rb).hexdigest()
    except Exception as e:  # noqa: BLE001
        same = False
        print("  decode error:", e)
    print("  cw_setup.py embed == cw_setup.rb:", same)
    if not same:
        fail("cw_setup.py embed is stale: run selfcheck.py --embed")
    if shutil.which("ruby"):
        r = subprocess.run(["ruby", "-c", os.path.join(HERE, "cw_setup.rb")], capture_output=True, text=True)
        print("  ruby -c:", (r.stdout + r.stderr).strip())
        if "Syntax OK" not in r.stdout:
            fail("ruby syntax")

    print("== widget CSS identical on WEST and EAST")
    west = css_block(os.path.join(REPO, "src/components/ChatwootWidget/chatwootLoader.js"))
    east = css_block(os.path.join(HERE, "east/chatwoot-widget.tsx"))
    print("  identical:", bool(west) and west == east)
    if not west or west != east:
        fail("CSS blocks differ")

    print("== east_widget.py anchors against the saved box copy:", box_root)
    ns = {}
    src = open(os.path.join(HERE, "east_widget.py")).read()
    consts = src.split("\n\ndef ", 1)[0]
    consts = "\n".join(x for x in consts.splitlines() if not x.startswith(("import ", "DRY")))
    exec(consts, ns)  # constants only (ROOT_MD5, EDITS, ...); nothing runs
    box = open(box_root, "rb").read()
    print("  md5 %s (script expects %s)" % (hashlib.md5(box).hexdigest(), ns["ROOT_MD5"]))
    if hashlib.md5(box).hexdigest() != ns["ROOT_MD5"]:
        fail("box __root.tsx md5")
    t = box.decode()
    new = t
    for a, b in ns["EDITS"]:
        print("  anchor x%d: %r" % (t.count(a), a.splitlines()[0][:70]))
        if t.count(a) != 1:
            fail("anchor count")
        new = new.replace(a, b, 1)
    print("".join(difflib.unified_diff(t.splitlines(True), new.splitlines(True), "a/__root.tsx", "b/__root.tsx", n=1)))
    tsx = open(os.path.join(HERE, "east/chatwoot-widget.tsx")).read()
    for need in ("export function ChatwootWidget(", ns["MARK"], "import.meta.env.VITE_CHATWOOT_WEBSITE_TOKEN"):
        if need not in tsx:
            fail("chatwoot-widget.tsx lacks %r" % need)

    print("\nRESULT:", "OK" if not fails else "%d failure(s)" % len(fails))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
