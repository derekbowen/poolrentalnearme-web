# Run as root on a THROWAWAY machine only (it uses /home/ubuntu/chatbot, /home/ubuntu/.pm2 and writes /usr/local/bin/ss):
#   python3 ops/chatbot/ops/tests/test_bot_deploy_local.py [--rev <git rev>]
#   (needs sudo, a local `ubuntu` user, node >= 20.6, pm2, logrotate; --rev defaults to HEAD)
# Local integration harness for ops/chatbot/ops/bot_deploy.py with REAL bot code and a REAL pm2 (7.0.1, as on EAST)
# running as the local `ubuntu` user. Touches no server. The bot code is a `git archive` snapshot of ops/chatbot at
# --rev, never the working tree, so other people's uncommitted edits cannot change the result.
# Substitutions in a copy of the script: DRY, SHA, MANIFEST_SUM, RAW (file:// fake repo) and the logrotate entry's
# path (a temp file instead of /etc/logrotate.d/prnm-chatbot). Runs get PRNM_RUNNER_TIMEOUT=900, as
# ops/runners/east_runx.py exports for the script's RUNNER_TIMEOUT. `ss` is a local shim reading /proc/net/tcp
# (iproute2 is not installed here).
import hashlib, json, os, pwd, re, shutil, subprocess, sys, tempfile, time

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))
sys.path.insert(0, REPO + "/ops/chatbot/ops")
from pin_bot import shipped  # noqa: E402  the manifest's own file rule (pin_bot.py builds the real one)

H = tempfile.mkdtemp(prefix="prnm-ops-test-")  # all fake boxes live here
SCRIPT = REPO + "/ops/chatbot/ops/bot_deploy.py"
B = "/home/ubuntu/chatbot"
U = pwd.getpwnam("ubuntu")
LR = H + "/logrotate-prnm-chatbot"  # stands in for /etc/logrotate.d/prnm-chatbot
LOGS = "/home/ubuntu/.pm2/logs"
REV = sys.argv[sys.argv.index("--rev") + 1] if "--rev" in sys.argv else "HEAD"
SS = r'''#!/usr/bin/env python3
# local stand-in for `ss -ltnH 'sport = :PORT'` (LISTEN sockets on PORT, IPv4 + IPv6)
import sys, re, socket, struct
port = int(re.search(r":(\d+)", " ".join(sys.argv)).group(1))
for f, fam in (("/proc/net/tcp", 4), ("/proc/net/tcp6", 6)):
    try:
        lines = open(f).read().splitlines()[1:]
    except OSError:
        continue
    for l in lines:
        p = l.split()
        a, prt = p[1].split(":")
        if p[3] != "0A" or int(prt, 16) != port:
            continue
        if fam == 4:
            ip = socket.inet_ntoa(struct.pack("<I", int(a, 16)))
        else:
            ip = "[" + socket.inet_ntop(socket.AF_INET6, b"".join(struct.pack("<I", int(a[i:i + 8], 16)) for i in range(0, 32, 8))) + "]"
        print("LISTEN 0 511 %s:%d 0.0.0.0:*" % (ip, port))
'''


def snapshot():
    """ops/chatbot exactly as committed at REV (git archive), extracted under H."""
    rev = subprocess.run(["git", "-C", REPO, "rev-parse", REV], capture_output=True, text=True, check=True).stdout.strip()
    d = "%s/snap-%s" % (H, rev[:12])
    os.makedirs(d)
    arc = subprocess.run(["git", "-C", REPO, "archive", rev, "ops/chatbot"], capture_output=True, check=True).stdout
    subprocess.run(["tar", "-x", "-C", d], input=arc, check=True)
    return rev, d + "/ops/chatbot"


REVSHA, SRC = None, None


def fake_repo(name, mutate=None):
    root = "%s/botrepo-%s" % (H, name)
    shutil.rmtree(root, ignore_errors=True)
    dst = root + "/ops/chatbot"
    files = []
    for d, _, fs in os.walk(SRC):
        for f in fs:
            rel = os.path.relpath(os.path.join(d, f), SRC)
            if not shipped(rel):
                continue
            os.makedirs(os.path.dirname(os.path.join(dst, rel)), exist_ok=True)
            shutil.copy(os.path.join(SRC, rel), os.path.join(dst, rel))
            files.append(rel)
    if mutate:
        mutate(dst)
        files = sorted(os.path.relpath(os.path.join(d, f), dst) for d, _, fs in os.walk(dst) for f in fs)
    man = "".join("%s  %s\n" % (hashlib.sha256(open(os.path.join(dst, r), "rb").read()).hexdigest(), r) for r in sorted(files))
    os.makedirs(dst + "/ops", exist_ok=True)
    open(dst + "/ops/bot_manifest.sha256", "w").write(man)
    return root, hashlib.sha256(man.encode()).hexdigest(), len(files)


def script(root, msum, dry, tag):
    s = open(SCRIPT).read()
    for a, b in [("DRY = True\n", "DRY = %s\n" % dry),
                 ('SHA = "REPLACE_WITH_COMMIT"', 'SHA = "%s"' % (tag * 40)[:40]),
                 ('MANIFEST_SUM = "REPLACE_WITH_SHA256"', 'MANIFEST_SUM = "%s"' % msum),
                 ('RAW = "https://raw.githubusercontent.com/derekbowen/poolrentalnearme-web/%s/ops/chatbot/" % SHA',
                  'RAW = "file://%s/ops/chatbot/"' % root),
                 ('LR = "/etc/logrotate.d/prnm-chatbot"', 'LR = "%s"' % LR)]:
        assert s.count(a) == 1, a
        s = s.replace(a, b)
    p = "%s/bot_deploy.%s.test.py" % (H, tag)
    open(p, "w").write(s)
    return p


def run(p, budget="900"):
    env = dict(os.environ)
    env.pop("PRNM_RUNNER_TIMEOUT", None)
    if budget:
        env["PRNM_RUNNER_TIMEOUT"] = budget
    r = subprocess.run([sys.executable, p], capture_output=True, text=True, timeout=400, env=env)
    return r.returncode, r.stdout + r.stderr


def pm2(cmd):
    return subprocess.run(["sudo", "-u", "ubuntu", "bash", "-lc", "PM2_HOME=/home/ubuntu/.pm2 pm2 " + cmd],
                          capture_output=True, text=True, cwd="/home/ubuntu").stdout


def curl(args):
    return subprocess.run("curl -s -o /dev/null -w '%%{http_code}' -m 5 %s" % args, shell=True, capture_output=True,
                          text=True).stdout


fails = 0


def check(n, c):
    global fails
    print(("  ok   " if c else "  FAIL ") + n)
    fails += 0 if c else 1


def main():
    global REVSHA, SRC
    REVSHA, SRC = snapshot()
    print("bot code: git archive of ops/chatbot at %s (not the working tree)" % REVSHA)
    open("/usr/local/bin/ss", "w").write(SS)
    os.chmod("/usr/local/bin/ss", 0o755)
    pm2("delete chatbot")
    shutil.rmtree(B, ignore_errors=True)
    os.makedirs(B + "/data")
    for d in (B, B + "/data"):
        os.chmod(d, 0o700)
        os.chown(d, U.pw_uid, U.pw_gid)
    token, secret = "FakeBotToken" + "x" * 12, "FakeWebhookSecret" + "y" * 7
    env = {"HOST": "127.0.0.1", "PORT": "3120", "CHATWOOT_URL": "http://127.0.0.1:3009", "CHATWOOT_FORWARDED_PROTO": "https",
           "CHATWOOT_PUBLIC_URL": "https://chat.poolrentalnearme.com", "SITE_URL": "https://www.poolrentalnearme.com",
           "CHATWOOT_ACCOUNT_ID": "1", "CHATWOOT_INBOX_ID": "1", "CHATWOOT_BOT_ID": "1", "CHATWOOT_DEREK_USER_ID": "1",
           "CHATWOOT_BRANDON_USER_ID": "2", "CHATWOOT_BOT_TOKEN": token, "CHATWOOT_WEBHOOK_SECRET": secret,
           "BOT_DATA_DIR": B + "/data"}
    open(B + "/.env", "w").write("".join("%s=%s\n" % kv for kv in env.items()))
    os.chmod(B + "/.env", 0o600)
    os.chown(B + "/.env", U.pw_uid, U.pw_gid)

    print("== placeholders refuse")
    rc, out = run(SCRIPT)
    check("unpinned script refuses", rc == 1 and "refusing" in out)

    root, msum, n = fake_repo("good")
    print("== no runner budget (run outside east_runx.py: 560 s default)")
    rc, out = run(script(root, msum, False, "z"), budget=None)
    check("refuses, nothing installed", rc == 1 and "runner budget too short" in out
          and not os.path.exists(B + "/current") and not os.path.exists(LR))

    print("== DRY (%d files)" % n)
    rc, out = run(script(root, msum, True, "a"))
    print("\n".join("     | " + x for x in out.strip().splitlines()[-4:]))
    check("DRY: tests passed on 'box' node, nothing installed", rc == 1 and "DRY RUN: tests passed" in out
          and not os.path.exists(B + "/current") and not os.path.exists(B + "/releases") and not os.path.exists(LR))
    check("DRY: logrotate entry checked with logrotate -d (rc 0, no errors) and disclosed",
          re.search(r"logrotate \S+/logrotate\.conf: .*existing daily logrotate\.timer.*-d rc 0, 0 error lines", out))

    print("== bad manifest sum")
    rc, out = run(script(root, "0" * 64, False, "b"))
    check("manifest mismatch aborts", rc == 1 and "manifest sha256 mismatch" in out)

    print("== tampered file")
    open(root + "/ops/chatbot/server.js", "a").write("\n// tampered\n")
    rc, out = run(script(root, msum, False, "c"))
    check("per-file sha256 mismatch aborts", rc == 1 and "sha256 mismatch on server.js" in out)

    root, msum, n = fake_repo("good")
    print("== first real deploy")
    rc, out = run(script(root, msum, False, "d"))
    print("\n".join("     | " + x for x in out.strip().splitlines()[-5:]))
    cur1 = os.path.realpath(B + "/current")
    check("exit 0 DONE", rc == 0 and "DONE." in out)
    check("current -> release, data symlinked to persistent dir", os.path.islink(B + "/current")
          and os.path.realpath(cur1 + "/data") == B + "/data")
    j = json.loads(pm2("jlist").strip().splitlines()[-1])
    st = [p for p in j if p["name"] == "chatbot"]
    check("pm2 chatbot online", st and st[0]["pm2_env"]["status"] == "online")
    dump = open("/home/ubuntu/.pm2/dump.pm2").read()
    check("dump.pm2 mode 600 and holds no token/secret", oct(os.stat("/home/ubuntu/.pm2/dump.pm2").st_mode & 0o777) == "0o600"
          and token not in dump and secret not in dump)
    check("pm2 env of the process has no token", st and token not in json.dumps(st[0]["pm2_env"]))
    hz = subprocess.run("curl -s http://127.0.0.1:3120/healthz", shell=True, capture_output=True, text=True).stdout
    check("healthz answers (%s)" % hz.strip()[:60], '"ok":true' in hz)
    check("bound to 127.0.0.1 only", subprocess.run("ss -ltnH 'sport = :3120'", shell=True, capture_output=True,
                                                    text=True).stdout.split()[3:4] == ["127.0.0.1:3120"])
    lr = open(LR).read() if os.path.exists(LR) else ""
    check("logrotate entry written root:root 644 for the bot's pm2 logs (su, size, rotate, copytruncate)",
          os.path.exists(LR) and oct(os.stat(LR).st_mode & 0o777) == "0o644" and os.stat(LR).st_uid == 0
          and lr.startswith(LOGS + "/chatbot-*.log {") and all(k in lr for k in (
              "su ubuntu ubuntu", "size 20M", "rotate 3", "compress", "missingok", "copytruncate")))
    check("logrotate entry disclosed with logrotate -d rc 0 in the deploy output",
          "existing daily logrotate.timer" in out and "-d rc 0, 0 error lines" in out)

    print("== logrotate entry really rotates the live pm2 logs (forced, private state file) and pm2 keeps writing")
    curl("-d '{}' http://127.0.0.1:3120/webhook")  # unsigned -> 401 + a WARN line in chatbot-error.log
    time.sleep(1)
    r = subprocess.run(["logrotate", "-f", "-s", H + "/lr.state", LR], capture_output=True, text=True)
    rotated = sorted(x for x in os.listdir(LOGS) if x.startswith("chatbot-") and x.endswith(".gz"))
    check("logrotate -f rc 0 and gzipped copies made (%s)" % rotated, r.returncode == 0 and rotated)
    curl("-d '{}' http://127.0.0.1:3120/webhook")
    time.sleep(1)
    errlog = open(LOGS + "/chatbot-error.log", "rb").read()
    check("after copytruncate pm2 appends from the start (WARN line present, no NUL hole, %d bytes)" % len(errlog),
          b"WARN" in errlog and b"\x00" not in errlog and len(errlog) < 4096)
    check("bot still online after rotation", '"ok":true' in subprocess.run(
        "curl -s http://127.0.0.1:3120/healthz", shell=True, capture_output=True, text=True).stdout)

    print("== second deploy (upgrade)")
    time.sleep(1)
    rc, out = run(script(root, msum, False, "e"))
    cur2 = os.path.realpath(B + "/current")
    check("exit 0, current moved, previous release kept", rc == 0 and cur2 != cur1 and os.path.isdir(cur1))

    print("== deploy whose server does not come up -> rollback to previous")

    def broken(dst):
        s = open(dst + "/server.js").read()
        s = s.replace("if (require.main === module) {", "if (require.main === module) {\n  process.exit(3);")
        open(dst + "/server.js", "w").write(s)

    root3, msum3, _ = fake_repo("broken", broken)
    rc, out = run(script(root3, msum3, False, "f"))
    print("\n".join("     | " + x for x in out.strip().splitlines()[-5:]))
    check("exit 1 FAILED -> rolling back", rc == 1 and "rolling back" in out)
    check("current back on the previous release", os.path.realpath(B + "/current") == cur2)
    check("previous release healthy again", "previous release healthy: True" in out)
    check("failed release removed", len(os.listdir(B + "/releases")) == 2)

    print("== tests failing on the box -> abort before any swap")

    def failing_test(dst):
        open(dst + "/test/zz_fail.test.js", "w").write("require('node:test')('fails', () => { throw new Error('x'); });\n")

    root4, msum4, _ = fake_repo("failtest", failing_test)
    rc, out = run(script(root4, msum4, False, "g"))
    check("exit 1, release removed, current unchanged", rc == 1 and "tests failed on the box" in out
          and os.path.realpath(B + "/current") == cur2 and len(os.listdir(B + "/releases")) == 2)

    pm2("delete chatbot")
    pm2("kill")
    shutil.rmtree(B, ignore_errors=True)
    shutil.rmtree("/home/ubuntu/.pm2", ignore_errors=True)
    os.remove("/usr/local/bin/ss")
    shutil.rmtree(H, ignore_errors=True)
    print("\nharness:", "ALL OK" if not fails else "%d FAIL(S)" % fails)
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
