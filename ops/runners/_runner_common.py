"""Shared SSM runner used by ssm_runx.py (WEST) and east_runx.py (EAST).

Vendored into the repo 2026-09-06 because the container recycle wipes the
scratchpad copy (it did on 2026-09-03) and /root/.claude with it.

CREDENTIALS — one identity, two accepted sources, checked in this order:
  1. /root/.claude/prnm-creds.env      PRNM_AWS_ACCESS_KEY_ID / PRNM_AWS_SECRET_ACCESS_KEY
  2. the process environment           PRNM_AWS_ACCESS_KEY_ID / PRNM_AWS_SECRET_ACCESS_KEY
The identity is the existing SSM-only burner IAM user (no rotation, no new key).

It deliberately does NOT fall back to plain AWS_ACCESS_KEY_ID. In the cloud
sandbox that variable holds the agent proxy's placeholder string, and from
2026-09-03 to 2026-09-06 the previous version of this file silently sent that
placeholder to AWS and failed with UnrecognizedClientException on every call,
which read as "credentials broken" when the truth was "file wiped, sentinel
used". A missing credential now fails loudly, naming exactly what is absent.
Values are never printed.

TIMEOUT (SSM executionTimeout) — DEFAULT_TIMEOUT (560 s) unless the caller passes
another. With the default the shipped command is byte-identical to every earlier
version. With any other value the script runs as
`PRNM_RUNNER_TIMEOUT=<s> python3 -u <script>`: unbuffered, so the output of a run
that SSM kills still shows how far it got, and the script can read its real
budget. A script declares the timeout it needs with a top-level line
`RUNNER_TIMEOUT = <seconds>` (see script_timeout(); east_runx.py honours it).
The command id goes to stderr; `result()` re-reads a finished or still running
command without touching the box. boto3 is imported only when AWS is called, so
selfcheck tools can import shipped()/script_timeout() for the exact arithmetic.

PAYLOAD — the command must stay <= MAX_COMMAND (9500) characters. run(compress=)
picks the form: False (default; ssm_runx.py/WEST) ships the script as plain
base64, exactly as before. "auto" (east_runx.py) ships plain whenever that fits and
otherwise `base64 -d | gzip -dc` of a deterministic gzip (mtime 0); the file that
lands on the box is byte-identical either way. True always uses gzip.
"""
import sys, time, base64, gzip, hashlib, os, re


SENTINELS = ("proxy-injected", "")
DEFAULT_TIMEOUT = 560
MAX_COMMAND = 9500  # len(command) limit (plain form: base64 then stays under 9400)


def _looks_real(key_id):
    return isinstance(key_id, str) and key_id[:4] in ("AKIA", "ASIA") and len(key_id) == 20


def creds():
    """Return (access_key_id, secret) from prnm-creds.env or PRNM_AWS_* env, or exit loudly."""
    d = {}
    p = "/root/.claude/prnm-creds.env"
    src = None
    if os.path.exists(p):
        for line in open(p):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                d[k] = v
        if d.get("PRNM_AWS_ACCESS_KEY_ID"):
            src = p
    ak = d.get("PRNM_AWS_ACCESS_KEY_ID") or os.environ.get("PRNM_AWS_ACCESS_KEY_ID")
    sk = d.get("PRNM_AWS_SECRET_ACCESS_KEY") or os.environ.get("PRNM_AWS_SECRET_ACCESS_KEY")
    if src is None and ak:
        src = "environment (PRNM_AWS_*)"
    if not ak or not sk or ak in SENTINELS or not _looks_real(ak):
        print("NO USABLE AWS CREDENTIAL. Refusing to call AWS.", file=sys.stderr)
        print("  checked: %s (%s)" % (p, "present" if os.path.exists(p) else "absent"), file=sys.stderr)
        print("  checked: env PRNM_AWS_ACCESS_KEY_ID (%s)" % ("set" if os.environ.get("PRNM_AWS_ACCESS_KEY_ID") else "unset"), file=sys.stderr)
        if os.environ.get("AWS_ACCESS_KEY_ID") in SENTINELS:
            print("  note: AWS_ACCESS_KEY_ID holds the proxy placeholder; it is ignored on purpose.", file=sys.stderr)
        print("  fix: put the EXISTING PRNM_AWS_* pair in the cloud environment's env keys (persistent),", file=sys.stderr)
        print("       or restore /root/.claude/prnm-creds.env. Do not create a new key. See docs/SECRETS_BOOTSTRAP.md.", file=sys.stderr)
        sys.exit(3)
    print("credentials: %s" % src, file=sys.stderr)  # source name only, never a value
    return ak, sk


def script_timeout(path):
    """The script's own `RUNNER_TIMEOUT = <seconds>` (top level, first match), or None."""
    m = re.search(r"^RUNNER_TIMEOUT = (\d+)\b", open(path, encoding="utf-8", errors="replace").read(), re.M)
    return int(m.group(1)) if m else None


def command(raw, remote, timeout=DEFAULT_TIMEOUT, gz=False):
    """The exact shell command shipped through SSM for script bytes `raw` (plain or gzip form)."""
    b64 = base64.b64encode(gzip.compress(raw, 9, mtime=0) if gz else raw).decode()
    py = "python3" if timeout == DEFAULT_TIMEOUT else "PRNM_RUNNER_TIMEOUT=%d python3 -u" % timeout
    dec = "base64 -d | gzip -dc" if gz else "base64 -d"
    return "echo %s | %s > %s && %s %s; rm -f %s" % (b64, dec, remote, py, remote, remote)


def shipped(raw, remote, timeout=DEFAULT_TIMEOUT, compress=False):
    """The command run() would send: plain unless compress is True, or "auto" and plain is over the limit."""
    plain = command(raw, remote, timeout)
    if compress is True or (compress == "auto" and len(plain) > MAX_COMMAND):
        return command(raw, remote, timeout, gz=True)
    return plain


def _client(region):
    import boto3  # here, not at import time (selfcheck imports this module without AWS)
    ak, sk = creds()
    return boto3.Session(aws_access_key_id=ak, aws_secret_access_key=sk, region_name=region).client("ssm")


def _show(inv):
    print("STATUS:", inv["Status"])
    out = inv.get("StandardOutputContent", "")
    err = inv.get("StandardErrorContent", "")
    if out:
        print("--- STDOUT ---")
        print(out)
    if err:
        print("--- STDERR ---")
        print(err)


def result(instance, region, cid):
    """Print the current status/output of an earlier command (reads SSM only; never touches the box)."""
    ssm = _client(region)
    _show(ssm.get_command_invocation(CommandId=cid, InstanceId=instance))


def run(instance, region, path, timeout=DEFAULT_TIMEOUT, compress=False):
    """Ship a python script (command <= 9500 chars) to the box via SSM and print its output."""
    raw = open(path, "rb").read()
    uniq = hashlib.md5((path + str(os.getpid()) + str(time.time())).encode()).hexdigest()[:10]
    remote = "/tmp/prnm_step_%s.py" % uniq
    cmd = shipped(raw, remote, timeout, compress)
    if len(cmd) > MAX_COMMAND:
        print("PAYLOAD TOO BIG: %d" % len(cmd), file=sys.stderr)
        sys.exit(2)
    ssm = _client(region)
    r = ssm.send_command(
        InstanceIds=[instance],
        DocumentName="AWS-RunShellScript",
        Parameters={"commands": [cmd], "executionTimeout": [str(timeout)]},
    )
    cid = r["Command"]["CommandId"]
    print("command id: %s (executionTimeout %d s)" % (cid, timeout), file=sys.stderr)
    t0 = time.time()
    beat = t0
    while time.time() < t0 + timeout + 60:
        time.sleep(3)
        try:
            inv = ssm.get_command_invocation(CommandId=cid, InstanceId=instance)
        except ssm.exceptions.InvocationDoesNotExist:
            continue
        if inv["Status"] in ("Pending", "InProgress", "Delayed"):
            if time.time() - beat >= 60:
                beat = time.time()
                print("  ... %s after %d s" % (inv["Status"], beat - t0), file=sys.stderr)
            continue
        _show(inv)
        return
    print("STATUS: TimedOut (client) — the box may still be running it; re-read with the command id above")
