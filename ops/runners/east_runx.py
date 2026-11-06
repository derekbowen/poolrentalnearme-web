#!/usr/bin/env python3
"""EAST runner (fresh-web marketing box). Vendored copy — see ops/runners/_runner_common.py.

  python3 east_runx.py <script.py> [timeout_seconds]   run a script (SSM executionTimeout below)
  python3 east_runx.py --result <command-id>            re-read an earlier run's status/output (SSM only)

Timeout: the optional second argument, else the script's own `RUNNER_TIMEOUT = <s>` line, else 560 s
(unchanged default). A value below the script's declared RUNNER_TIMEOUT is refused, so a long deploy
cannot be cut off by SSM between its change and its verify/rollback. Runs longer than a few minutes
outlive an interactive tool call: start them in the background; the command id is on stderr.

Payload: plain base64 whenever the command fits 9500 chars (byte-identical to earlier runs), else the
gzip form (see _runner_common.py). PRNM_RUNNER_GZIP=1 forces the gzip form (to prove it on the box).
"""
import sys, os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _runner_common import run, result, script_timeout, DEFAULT_TIMEOUT

INSTANCE, REGION = "i-060692efd53e6e853", "us-east-1"

if len(sys.argv) == 3 and sys.argv[1] == "--result":
    result(INSTANCE, REGION, sys.argv[2])
    sys.exit(0)
if len(sys.argv) not in (2, 3):
    sys.exit(__doc__)
path = sys.argv[1]
declared = script_timeout(path)
timeout = int(sys.argv[2]) if len(sys.argv) == 3 else (declared or DEFAULT_TIMEOUT)
if not 60 <= timeout <= 7200:
    sys.exit("refusing: timeout %d s is outside 60..7200" % timeout)
if declared and timeout < declared:
    sys.exit("refusing: %s declares RUNNER_TIMEOUT = %d; %d s could cut it off mid-change" % (path, declared, timeout))
run(INSTANCE, REGION, path, timeout, True if os.environ.get("PRNM_RUNNER_GZIP") == "1" else "auto")
