"""WEST c208: report where the release is, or start the next of build/gate/flip-c208.sh.

Run with ops/runners/ssm_runx.py. The scripts outlive SSM's 560 s timeout, so a step
is started outside the SSM command and writes /home/ubuntu/<step>-c208.log and .done
(OK / FAIL / ABORTED). DRY=True (the default) only prints each step's .done state, log
size and age, the last log lines and the running c208 scripts; it starts nothing. STEP
runs only after the previous step printed OK, never twice, and never while any c208
script is still running. HOW: "setsid" (own session and process group: SSM kills only
its command's process group, and the agent unit is KillMode=process), or "systemd-run"
(a one-shot transient unit prnm-c208-<step>, not scheduled; README says when).
"""
import os, re, subprocess, sys, time

DRY = True
STEP = "build"  # build -> gate -> flip
HOW = "setsid"  # or "systemd-run"
H = "/home/ubuntu"
ORDER = ["build", "gate", "flip"]
SEC = re.compile(r"(KEY|SECRET|TOKEN|PASSW|AUTH)\w*=\S+", re.I)
PG = r"(build|gate|flip)-c208\.sh"  # pgrep -f: any c208 step script, however it was started


def done(s):
    p = "%s/%s-c208.done" % (H, s)
    return open(p).read().strip() if os.path.exists(p) else "-"


def running():
    return subprocess.run(["pgrep", "-f", PG], capture_output=True, text=True).stdout.split()


for s in ORDER:
    log = "%s/%s-c208.log" % (H, s)
    if not os.path.exists(log):
        print("%s-c208: done=%s, no log" % (s, done(s)))
        continue
    print("%s-c208: done=%s, log %d B, last written %d s ago" % (s, done(s), os.path.getsize(log), time.time() - os.path.getmtime(log)))
    for line in open(log, errors="replace").read().splitlines()[-8:]:
        print("    " + SEC.sub(lambda m: m.group(0).split("=")[0] + "=<redacted>", line)[:220])
busy = running()
print("running c208 scripts:", busy or "none")
if STEP not in ORDER or HOW not in ("setsid", "systemd-run"):
    sys.exit("ABORT: STEP must be build, gate or flip; HOW setsid or systemd-run")
prev = ORDER[ORDER.index(STEP) - 1] if STEP != "build" else None
if not os.path.exists("%s/%s-c208.sh" % (H, STEP)):
    sys.exit("ABORT: %s/%s-c208.sh missing (run scripts_c208.py)" % (H, STEP))
if prev and done(prev) != "OK":
    sys.exit("ABORT: %s-c208 has not printed OK" % prev)
if done(STEP) == "OK" or busy:
    sys.exit("ABORT: %s-c208 already OK, or a c208 script is still running" % STEP)
if STEP == "flip" and done("flip") != "-":
    sys.exit("ABORT: flip already ran (done=%s). Read flip-c208.log; a re-run is a manual decision" % done("flip"))
if DRY:
    sys.exit("DRY RUN: would start %s-c208.sh (%s); nothing started" % (STEP, HOW))
cmd = ["sh", "%s/%s-c208.sh" % (H, STEP)]
if HOW == "systemd-run":
    unit = "prnm-c208-" + STEP
    r = subprocess.run(["systemd-run", "--unit=" + unit, "--collect", "--quiet"] + cmd, capture_output=True, text=True)
    if r.returncode:
        sys.exit("ABORT: systemd-run failed, nothing started: " + r.stderr.strip()[:300])
    print("transient unit %s: runs %s once, not scheduled (systemctl status %s)" % (unit, cmd[1], unit))
else:
    subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
for _ in range(10):
    time.sleep(1)
    pids = running()
    if pids or done(STEP) != "-":
        break
print("STARTED %s-c208.sh (%s): pids %s, done=%s." % (STEP, HOW, pids or "none", done(STEP)))
if not pids and done(STEP) == "-":
    sys.exit("ABORT: %s-c208.sh is not running and wrote no .done; read %s-c208.log" % (STEP, STEP))
print("Poll with DRY=True within a minute: the pid must still be listed and the log age small.")
