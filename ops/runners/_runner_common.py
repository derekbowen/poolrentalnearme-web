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
"""
import sys, time, base64, hashlib, os
import boto3


SENTINELS = ("proxy-injected", "")


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


def run(instance, region, path, timeout=560):
    """Ship a python script (<9.5KB base64) to the box via SSM and print its output."""
    ak, sk = creds()
    ssm = boto3.Session(aws_access_key_id=ak, aws_secret_access_key=sk, region_name=region).client("ssm")
    raw = open(path, "rb").read()
    b64 = base64.b64encode(raw).decode()
    uniq = hashlib.md5((path + str(os.getpid()) + str(time.time())).encode()).hexdigest()[:10]
    remote = "/tmp/prnm_step_%s.py" % uniq
    cmd = "echo %s | base64 -d > %s && python3 %s; rm -f %s" % (b64, remote, remote, remote)
    if len(cmd) > 9500:
        print("PAYLOAD TOO BIG: %d" % len(cmd), file=sys.stderr)
        sys.exit(2)
    r = ssm.send_command(
        InstanceIds=[instance],
        DocumentName="AWS-RunShellScript",
        Parameters={"commands": [cmd], "executionTimeout": [str(timeout)]},
    )
    cid = r["Command"]["CommandId"]
    for _ in range(int(timeout / 3) + 5):
        time.sleep(3)
        try:
            inv = ssm.get_command_invocation(CommandId=cid, InstanceId=instance)
        except ssm.exceptions.InvocationDoesNotExist:
            continue
        if inv["Status"] in ("Pending", "InProgress", "Delayed"):
            continue
        print("STATUS:", inv["Status"])
        out = inv.get("StandardOutputContent", "")
        err = inv.get("StandardErrorContent", "")
        if out:
            print("--- STDOUT ---")
            print(out)
        if err:
            print("--- STDERR ---")
            print(err)
        return
    print("STATUS: TimedOut (client)")
