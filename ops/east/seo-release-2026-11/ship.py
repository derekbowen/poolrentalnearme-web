#!/usr/bin/env python3
"""Ship a box script that is too big for one SSM command to EAST, in parts, then run it.

    python3 ops/east/seo-release-2026-11/ship.py <script.py>       # e.g. a filled-in copy of east_seo_release.py
    python3 ops/runners/east_runx.py --result <command-id>        # re-read a step (ids are on stderr)

One SSM command is limited to MAX_COMMAND (9500) characters (ops/runners/_runner_common.py), and
east_seo_release.py no longer fits in one. This tool sends it as several steps, each one an ordinary
run of the same tested runner east_runx.py uses (_runner_common.run, same instance, same credential):

  1. here: the script is gzip-compressed (mtime 0), base64-encoded and cut into parts of PART chars;
     its sha256 is computed;
  2. one small python step per part writes that part to /root/eastrel-ship-<tag>/<n> on EAST (0700);
  3. a loader step reassembles the parts and checks the sha256. A missing or altered part is an ABORT
     and nothing runs. Otherwise it writes the script, runs it with `python3 -u` (passing the remaining
     SSM budget as PRNM_RUNNER_TIMEOUT), forwards SIGTERM to it, removes the parts and exits with the
     script's exit code. The loader declares the script's own RUNNER_TIMEOUT, so SSM gives it that budget.

The parts are written as root under /root and hold only this public script. Nothing here reads or
prints a credential beyond what _runner_common already does (it names the source, never a value).
"""
import base64, gzip, hashlib, os, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "runners"))
from _runner_common import DEFAULT_TIMEOUT, script_timeout  # noqa: E402

INSTANCE, REGION = "i-060692efd53e6e853", "us-east-1"  # = ops/runners/east_runx.py (the tests compare them)
PART = 6400  # base64 chars per part; a part step then ships well under MAX_COMMAND

LOADER = '''RUNNER_TIMEOUT = %(timeout)d
import base64, gzip, hashlib, os, shutil, signal, subprocess, sys, time
T0 = time.time()
D, N, WANT = %(dir)r, %(n)d, %(want)r
try:
    raw = gzip.decompress(base64.b64decode("".join(open(os.path.join(D, "%%03d" %% i)).read() for i in range(N))))
except Exception:
    raw = None
if raw is None or hashlib.sha256(raw).hexdigest() != WANT:
    shutil.rmtree(D, ignore_errors=True)
    print("ABORT: the shipped script did not reassemble (a part is missing or altered); nothing ran", flush=True)
    sys.exit(2)
p = os.path.join(D, "script.py")
with open(p, "wb") as f:
    f.write(raw)
print("ship: script reassembled, sha256 %%s, running it" %% WANT[:16], flush=True)
env = dict(os.environ)
env["PRNM_RUNNER_TIMEOUT"] = str(int(int(env.get("PRNM_RUNNER_TIMEOUT") or RUNNER_TIMEOUT) - (time.time() - T0)))
c = subprocess.Popen([sys.executable, "-u", p], env=env)
signal.signal(signal.SIGTERM, lambda *a: c.send_signal(signal.SIGTERM))
rc = c.wait()
shutil.rmtree(D, ignore_errors=True)
sys.exit(rc)
'''

PART_STEP = '''import os
d = %(dir)r
os.makedirs(d, 0o700, exist_ok=True)
with open(os.path.join(d, "%(i)03d"), "w") as f:
    f.write(%(part)r)
print("ship: part %(k)d/%(n)d stored")
'''


def steps(raw, tag, base="/root", timeout=None):
    """[(label, python source, ssm timeout)] for script bytes `raw`: the part steps, then the loader."""
    timeout = timeout or DEFAULT_TIMEOUT
    b64 = base64.b64encode(gzip.compress(raw, 9, mtime=0)).decode()
    parts = [b64[i:i + PART] for i in range(0, len(b64), PART)]
    d = os.path.join(base, "eastrel-ship-" + tag)
    out = [("part %d/%d" % (i + 1, len(parts)), PART_STEP % {"dir": d, "i": i, "k": i + 1, "n": len(parts), "part": p}, 120)
           for i, p in enumerate(parts)]
    out.append(("run", LOADER % {"timeout": timeout, "dir": d, "n": len(parts), "want": hashlib.sha256(raw).hexdigest()}, timeout))
    return out


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    path = sys.argv[1]
    timeout = script_timeout(path) or DEFAULT_TIMEOUT
    if not 60 <= timeout <= 7200:
        sys.exit("refusing: %s declares RUNNER_TIMEOUT = %d, outside 60..7200" % (path, timeout))
    from _runner_common import run  # boto3 is imported only when AWS is called
    raw = open(path, "rb").read()
    tag = hashlib.sha256(raw + os.urandom(8)).hexdigest()[:10]
    tmp = tempfile.mkdtemp(prefix="eastrel-ship-")
    plan = steps(raw, tag, timeout=timeout)
    print("ship: %s (%d bytes, sha256 %s) in %d step(s), run budget %d s" % (
        path, len(raw), hashlib.sha256(raw).hexdigest()[:16], len(plan), timeout), file=sys.stderr)
    for label, src, t in plan:
        f = os.path.join(tmp, "step.py")
        with open(f, "w") as fh:
            fh.write(src)
        print("ship: %s" % label, file=sys.stderr)
        run(INSTANCE, REGION, f, t, "auto")
    os.remove(os.path.join(tmp, "step.py"))
    os.rmdir(tmp)


if __name__ == "__main__":
    main()
