#!/usr/bin/env python3
"""Production env preflight for a WEST marketplace candidate. Fails closed.

Why: the c197 deploy found build/.env missing 17 variables that the running
MAIN container had (STRIPE_SECRET_KEY, SUPABASE_URL, VITE_SHARETRIBE_USING_SSL,
...). A candidate started from that file would have run without payments, the
database or Secure cookies. This check compares the ACTUAL environment of the
running candidate container against the running MAIN container, so a candidate
started from build/.env alone cannot pass.

Rules (any failure -> exit 1, before nginx is touched):
  1. Parity: every variable set in MAIN is set, non-empty, in the candidate
     (except names the image itself provides: PATH, HOSTNAME, BUN_*, ...).
  2. Minimum: every name in REQUIRED is set and non-empty in BOTH. If MAIN
     itself lacks one, that fails too: production is already broken and a
     copy of it must not be certified.
Extra variables in the candidate are allowed and listed.
Only variable NAMES are ever printed, never values.

Usage (on WEST):
  env_preflight.py --main-container poolrentalnearme-production --candidate-container <gate>
  env_preflight.py --main-container poolrentalnearme-production --candidate-env-file <file>
"""
import argparse
import json
import subprocess
import sys

REQUIRED = [
    # payments
    "STRIPE_SECRET_KEY", "VITE_STRIPE_PUBLISHABLE_KEY",
    # Sharetribe
    "SHARETRIBE_INTEGRATION_SDK_CLIENT_ID", "SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET",
    "SHARETRIBE_SDK_CLIENT_SECRET", "VITE_SHARETRIBE_SDK_CLIENT_ID", "VITE_SHARETRIBE_USING_SSL",
    "MARKETPLACE_ID",
    # Supabase
    "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
    # Twilio
    "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_MESSAGING_SERVICE_SID", "TWILIO_PHONE_NUMBER",
    # auth / social login / signed links
    "GOOGLE_CLIENT_SECRET", "FACEBOOK_APP_SECRET",
    "APPLE_KEY_ID", "APPLE_TEAM_ID", "APPLE_PRIVATE_KEY_BASE64", "ICAL_FEED_SECRET",
    # marketplace + VITE runtime
    "VITE_ENV", "VITE_MARKETPLACE_ROOT_URL", "VITE_MARKETPLACE_NAME", "VITE_CSP",
    "VITE_GOOGLE_MAPS_API_KEY", "VITE_GOOGLE_CLIENT_ID", "VITE_FACEBOOK_APP_ID", "VITE_APPLE_CLIENT_ID",
    "PORT",
]
# Provided by the image/runtime, not by the production env.
IMAGE_PROVIDED_PREFIXES = ("BUN_", "NODE_", "YARN_", "NPM_")
IMAGE_PROVIDED = {"PATH", "HOSTNAME", "HOME", "TERM", "PWD", "SHLVL"}


def image_provided(name):
    return name in IMAGE_PROVIDED or name.startswith(IMAGE_PROVIDED_PREFIXES)


def parse_env_lines(lines):
    env = {}
    for line in lines:
        line = line.rstrip("\n")
        if not line or line.lstrip().startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.replace("export ", "").strip()
        env[k] = v.strip().strip('"').strip("'")
    return env


def compare(main, cand, required=REQUIRED):
    """Pure. Returns a dict of NAME lists; ok=True only if nothing is wrong."""
    set_ = lambda env, n: n in env and env[n] != ""
    parity = sorted(n for n in main if set_(main, n) and not image_provided(n))
    missing = sorted(n for n in parity if n not in cand)
    empty = sorted(n for n in parity if n in cand and cand[n] == "")
    req_missing_candidate = sorted(n for n in required if not set_(cand, n))
    req_missing_main = sorted(n for n in required if not set_(main, n))
    extra = sorted(n for n in cand if n not in main and not image_provided(n))
    ok = not (missing or empty or req_missing_candidate or req_missing_main)
    return {
        "ok": ok,
        "checked": len(set(parity) | set(required)),
        "missing": missing,
        "empty": empty,
        "required_missing_in_candidate": req_missing_candidate,
        "required_missing_in_main": req_missing_main,
        "extra": extra,
    }


def container_env(name):
    out = subprocess.run(
        ["docker", "inspect", name, "--format", "{{json .Config.Env}}"],
        capture_output=True, text=True, check=True,
    ).stdout
    return parse_env_lines(json.loads(out))


def report(result, out=sys.stdout):
    status = "PASS" if result["ok"] else "FAIL"
    print(f"env preflight: {status} ({result['checked']} names checked)", file=out)
    for key in ("missing", "empty", "required_missing_in_candidate", "required_missing_in_main"):
        if result[key]:
            print(f"  {key}: {' '.join(result[key])}", file=out)
    if result["extra"]:
        print(f"  extra (allowed): {' '.join(result['extra'])}", file=out)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--main-container", required=True)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--candidate-container")
    g.add_argument("--candidate-env-file")
    a = ap.parse_args(argv)
    try:
        main_env = container_env(a.main_container)
        cand_env = (container_env(a.candidate_container) if a.candidate_container
                    else parse_env_lines(open(a.candidate_env_file)))
    except Exception as e:  # cannot read either side -> cannot certify
        print(f"env preflight: FAIL (could not read env: {type(e).__name__})")
        return 1
    result = compare(main_env, cand_env)
    report(result)
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
