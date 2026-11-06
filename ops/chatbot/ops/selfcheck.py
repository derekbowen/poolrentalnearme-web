#!/usr/bin/env python3
"""Local checks for ops/chatbot/ops (runs here, never on a server; changes nothing remote).

  python3 ops/chatbot/ops/selfcheck.py [--embed] [--box-root PATH]

--embed      re-embed cw_setup.rb into cw_setup.py (zlib+base85 + sha256) before checking
--box-root   saved copy of EAST's src/routes/__root.tsx for the anchor check

Checks: python syntax; every shipped script still has DRY = True; the runner payload of every script
*as it will really run*: placeholders replaced by a 40-char commit (SHA) / 64-char sha256 (*SUM), DRY = False,
the script's own RUNNER_TIMEOUT, measured with ops/runners/_runner_common.shipped() itself (the exact command
east_runx.py sends: plain when it fits, else gzip) against the 9500-char limit, with a warning under 100 chars
of headroom; the embedded Ruby equals cw_setup.rb and passes `ruby -c`; the widget CSS block is byte-identical in
the WEST loader and the EAST snippet; east_widget.py's md5 and both anchors match the saved box copy (prints the
resulting diff); the EAST TSX carries the names east_widget.py builds with; the bot port is one value
everywhere (bot_deploy.py PORT = nginx = cw_status = server.js DEFAULT_PORT); placeholders are reported.
"""
import base64, difflib, hashlib, os, re, shutil, subprocess, sys, zlib

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(REPO, "ops", "runners"))
import _runner_common as runner  # noqa: E402  (no AWS: boto3 is imported only when a run starts)

SHIPPED = ["cw_harden.py", "cw_setup.py", "cw_nginx.py", "bot_deploy.py", "cw_status.py", "east_widget.py",
           "cw_push_test.py"]
READ_ONLY = ("cw_status.py",)  # no DRY flag: it changes nothing
LOCAL = ("selfcheck.py", "pin_bot.py")  # run here, never shipped
NEED_TIMEOUT = ("bot_deploy.py", "east_widget.py")  # long steps: must declare RUNNER_TIMEOUT
HEADROOM = 100
DEFAULT_BOX_ROOT = os.path.join(HERE, "tests", "fixtures", "east__root.tsx")  # EAST's file, fetched 2026-11-05
fails = []
warns = []


def fail(msg):
    fails.append(msg)
    print("FAIL", msg)


def warn(msg):
    warns.append(msg)
    print("WARN", msg)


def embed():
    rb = open(os.path.join(HERE, "cw_setup.rb"), "rb").read()
    p = os.path.join(HERE, "cw_setup.py")
    s = open(p).read()
    s = re.sub(r'^RB_SHA = ".*"$', 'RB_SHA = "%s"' % hashlib.sha256(rb).hexdigest(), s, count=1, flags=re.M)
    s = re.sub(r'^RBZ = ".*"$', lambda m: 'RBZ = "%s"' % base64.b85encode(zlib.compress(rb, 9)).decode(), s,
               count=1, flags=re.M)
    open(p, "w").write(s)
    print("embedded cw_setup.rb (%d bytes, sha256 %s)" % (len(rb), hashlib.sha256(rb).hexdigest()))


def pinned(src):
    """The script as it really runs: pins filled at their real length, DRY = False."""
    def fill(m):
        name = m.group(1)
        n = 64 if ("SUM" in name or "256" in name or not re.search(r"SHA|COMMIT", name)) else 40
        return '%s = "%s"' % (name, "0" * n)
    s = re.sub(r'^(\w+) = "[^"\n]*REPLACE_[A-Z0-9_]*[^"\n]*"', fill, src, flags=re.M)
    s = re.sub(r"REPLACE_[A-Z0-9_]+", "0" * 64, s)  # any other placeholder: assume the longest pin
    return re.sub(r"^DRY = True$", "DRY = False", s, count=1, flags=re.M)


def payload(path):
    """(raw, as run, plain cmd len, gzip cmd len, shipped command, timeout) with the runner's own arithmetic."""
    src = open(path, encoding="utf-8").read()
    real = pinned(src).encode()
    t = runner.script_timeout(path) or runner.DEFAULT_TIMEOUT
    remote = "/tmp/prnm_step_%s.py" % ("0" * 10)
    return (len(src.encode()), len(real), len(runner.command(real, remote, t)),
            len(runner.command(real, remote, t, gz=True)), runner.shipped(real, remote, t, "auto"), t)


def css_block(path):
    s = open(path).read()
    m = re.search(r"prnm-cw-css:start \*/.*?`(.*?)`.*?/\* prnm-cw-css:end", s, re.S)
    return m.group(1) if m else None


def scripts():
    extra = sorted(f for f in os.listdir(HERE) if f.endswith(".py") and f not in SHIPPED + list(LOCAL))
    return SHIPPED + extra, extra


def main():
    args = sys.argv[1:]
    if "--embed" in args:
        embed()
    box_root = args[args.index("--box-root") + 1] if "--box-root" in args else DEFAULT_BOX_ROOT

    print("== syntax, DRY default, runner payload as really run (pins filled, DRY = False; limit %d, warn under %d "
          "headroom)" % (runner.MAX_COMMAND, HEADROOM))
    names, extra = scripts()
    if extra:
        print("  also found (not in SHIPPED, checked the same way):", ", ".join(extra))
    for f in names:
        p = os.path.join(HERE, f)
        if not os.path.exists(p):
            fail("missing " + f)
            continue
        r = subprocess.run([sys.executable, "-m", "py_compile", p], capture_output=True, text=True)
        if r.returncode:
            fail("syntax %s: %s" % (f, r.stderr[-300:]))
        src = open(p).read()
        if not re.search(r"^DRY = True$", src, re.M) and f not in READ_ONLY:
            fail("%s: DRY is not True" % f)
        raw, real, plain, gz, cmd, t = payload(p)
        form = "gzip" if "| gzip -dc >" in cmd else "plain"
        room = runner.MAX_COMMAND - len(cmd)
        grow = runner.MAX_COMMAND - min(plain, gz)  # east_runx.py switches to gzip when plain stops fitting
        print("  %-15s raw %5d  as run %5d  cmd plain %5d / gzip %5d  ships %-5s headroom %5d (if it grows %5d)"
              "  timeout %4d  %s" % (f, raw, real, plain, gz, form, room, grow, t, "OK" if room >= 0 else "TOO BIG"))
        if room < 0:
            fail("payload " + f)
        elif grow < HEADROOM:
            warn("%s: only %d chars of payload headroom" % (f, grow))
        declared = runner.script_timeout(p)
        if declared is not None and not 60 <= declared <= 7200:
            fail("%s: RUNNER_TIMEOUT %d outside 60..7200" % (f, declared))
        if f in NEED_TIMEOUT and declared is None:
            fail("%s: must declare RUNNER_TIMEOUT (its steps outlive the 560 s default)" % f)
        ph = sorted(set(re.findall(r"REPLACE_[A-Z0-9_]+", src)))
        if ph:
            print("  %-15s placeholders (refuses to run until filled): %s" % ("", ", ".join(ph)))

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
    exec(src.split("\n\ndef ", 1)[0], ns)  # imports + constants only (ROOT_MD5, EDITS, ...); nothing runs
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

    print("== EAST TSX carries what east_widget.py builds with (it is fetched by pinned commit + sha256)")
    tsx = open(os.path.join(HERE, "east/chatwoot-widget.tsx")).read()
    for need in ("export function ChatwootWidget(", ns["MARK"], "import.meta.env.VITE_CHATWOOT_WEBSITE_TOKEN",
                 "import.meta.env.VITE_CHATWOOT_SDK_SRI", "prnm-chat-launcher"):
        print("  %-45s %s" % (need, "yes" if need in tsx else "MISSING"))
        if need not in tsx:
            fail("chatwoot-widget.tsx lacks %r" % need)
    if "VITE_CHATWOOT_SDK_SRI=" not in src or "VITE_CHATWOOT_WEBSITE_TOKEN=" not in src:
        fail("east_widget.py must write both VITE_CHATWOOT_WEBSITE_TOKEN and VITE_CHATWOOT_SDK_SRI")

    print("== bot port: one value everywhere")
    port = re.search(r'^PORT = "(\d+)"', open(os.path.join(HERE, "bot_deploy.py")).read(), re.M).group(1)
    where = {"cw_nginx.py": "127.0.0.1:%s" % port, "cw_status.py": "127.0.0.1:%s" % port,
             "../server.js": "DEFAULT_PORT = %s;" % port}
    for f, need in where.items():
        have = need in open(os.path.join(HERE, f)).read()
        print("  %-14s %-24s %s" % (f, need, "yes" if have else "MISSING"))
        if not have:
            fail("%s does not use bot port %s" % (f, port))
    stale = []
    for d, _, fs in os.walk(os.path.join(HERE, "..")):
        if os.sep + "bank" in d or os.sep + "data" in d or "node_modules" in d:
            continue
        for x in fs:
            if x.endswith((".py", ".js", ".md", ".rb", ".json")):
                fp = os.path.join(d, x)
                if os.path.abspath(fp) == os.path.abspath(__file__):
                    continue
                if re.search(r"\b3021\b", open(fp, errors="replace").read()):
                    stale.append(os.path.relpath(fp, REPO))
    if stale:
        warn("old bot port 3021 still mentioned in: " + ", ".join(sorted(stale)))

    print("\nRESULT:", ("OK" if not fails else "%d failure(s)" % len(fails)) +
          (" (%d warning(s))" % len(warns) if warns else ""))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
