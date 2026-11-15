#!/usr/bin/env python3
"""Put the public-pools renderer (pp-ssr) under version control before anyone changes it.

    python3 ops/west/pp-ssr/preserve_pp_ssr.py            # plan only: prints the steps, touches nothing
    python3 ops/west/pp-ssr/preserve_pp_ssr.py --selftest # tests the secret scanner locally
    python3 ops/west/pp-ssr/preserve_pp_ssr.py --go       # does it (needs PRNM_AWS_* for SSM)

Why (SEO audit 2026-11-14, fix F8): every /public-pools/* page and public-pools.xml
is rendered by the `pp-ssr` container on WEST (proxied from nginx on :3100). Its
source is in no repository. The owner's rule: "Put pp-ssr source under version
control before modifying it."

How: the same pattern as ops/preserve_east.py (tested 2026-09-11). Copy the app
directory out of the running container, tar it deterministically, encrypt it on
the box with a single-use passphrase, serve the ciphertext for a few seconds from
the static /tools/ directory WEST nginx already serves, pull it down in one GET,
delete it from the box, verify sha256 at every step, then commit the tree to an
orphan branch of this repository.

Never prints an environment value. Never copies .env files, keys or node_modules.
This repository is PUBLIC, so the extracted tree is scanned for secrets here, and
the exact tree to be committed (PP_SSR_SNAPSHOT.md with the container metadata
included) is scanned again just before the commit. The push is refused on any
finding the scanner cannot clear (see SECRETS below), and a file too large to
scan or unreadable is a finding, never skipped. Fails closed: any mismatch aborts
before anything is pushed.
"""
import argparse, base64, datetime, hashlib, json, os, re, secrets, subprocess, sys, tarfile, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
WEST_RUNNER = os.path.join(HERE, "..", "..", "runners", "ssm_runx.py")
CONTAINER = "pp-ssr"
TOOLS_DIR = "/var/www/prnm-tools"          # served by WEST nginx at /tools/ (CLAUDE.md)
PUBLIC_BASE = "https://www.poolrentalnearme.com/tools/"
EXCLUDE_DIRS = {"node_modules", ".git", ".next/cache", ".cache"}
EXCLUDE_FILE_RE = re.compile(r"(^|/)(\.env(\..*)?|.*\.pem|.*\.key|id_rsa.*|.*\.p12)$")

# ---------------------------------------------------------------- SECRETS ----
# A JWT whose payload role is "anon" is a publishable key (it ships in browsers)
# and is allowed. Anything else below aborts the push.
SECRET_PATTERNS = {
    "aws_access_key": re.compile(r"\b(AKIA|ASIA)[0-9A-Z]{16}\b"),
    "stripe_live": re.compile(r"\b(sk|rk)_live_[0-9A-Za-z]{10,}"),
    "stripe_webhook": re.compile(r"\bwhsec_[0-9A-Za-z]{10,}"),
    "twilio_auth": re.compile(r"\bSK[0-9a-f]{32}\b"),
    "private_key": re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    "github_token": re.compile(r"\bgh[pousr]_[0-9A-Za-z]{30,}"),
    "supabase_secret": re.compile(r"\bsb_secret_[0-9A-Za-z_-]{10,}"),
    # name = "value" / name: 'value' / "name": "value" (JSON, JS objects), where the
    # name contains a secret-ish word anywhere (STRIPE_SECRET_KEY, clientSecret, ...).
    "generic_assignment": re.compile(
        r"(?i)[A-Za-z0-9_-]*(secret|api[_-]?key|password|passwd|token|private[_-]?key|service[_-]?role)"
        r"[A-Za-z0-9_-]*['\"]?\s*[:=]\s*['\"][^'\"\s]{12,}['\"]"),
    # Unquoted shell/env/Dockerfile style: SECRET_KEY=abc..., export API_TOKEN=..., ENV X_TOKEN=...
    "env_assignment": re.compile(
        r"(?im)^\s*(export\s+|ENV\s+)?[A-Z0-9_]*(SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY|SERVICE_ROLE)[A-Z0-9_]*"
        r"\s*=\s*[^\s'\"$]{12,}"),
    # Command-line flags: --token=abc..., --api-key abc...
    "cli_flag": re.compile(r"(?i)--(token|secret|password|api-?key|key)[= ][^\s'\"]{12,}"),
}
# Files are scanned whole up to this size. A larger file is not skipped: it is a
# finding, so the push is refused (fail closed) and a person decides.
MAX_SCAN_BYTES = 50_000_000
JWT_RE = re.compile(r"\beyJ[0-9A-Za-z_-]{8,}\.(eyJ[0-9A-Za-z_-]{8,})\.[0-9A-Za-z_-]{8,}")


def _jwt_role(payload_b64):
    try:
        pad = "=" * (-len(payload_b64) % 4)
        return json.loads(base64.urlsafe_b64decode(payload_b64 + pad)).get("role")
    except Exception:
        return None


def scan_text(text):
    """Return a list of finding names (never the values)."""
    hits = [name for name, rx in SECRET_PATTERNS.items() if rx.search(text)]
    for m in JWT_RE.finditer(text):
        role = _jwt_role(m.group(1))
        if role != "anon":
            hits.append("jwt_role_%s" % (role or "unknown"))
    return hits


def scan_tree(root, max_bytes=None):
    """Scan every file that would be committed. Fails closed: a file that is too
    large to scan, or cannot be read, is itself a finding (never silently skipped)."""
    limit = MAX_SCAN_BYTES if max_bytes is None else max_bytes
    findings = {}
    for dp, dns, fns in os.walk(root):
        dns[:] = [d for d in dns if d not in EXCLUDE_DIRS]
        for fn in fns:
            p = os.path.join(dp, fn)
            rel = os.path.relpath(p, root)
            if os.path.islink(p):
                # Committed as a link; scan the link text, never follow it.
                hits = scan_text(os.readlink(p))
            else:
                try:
                    if os.path.getsize(p) > limit:
                        findings[rel] = ["too_large_to_scan"]
                        continue
                    with open(p, "r", encoding="utf-8", errors="ignore") as fh:
                        t = fh.read()
                except OSError:
                    findings[rel] = ["unreadable"]
                    continue
                hits = scan_text(t)
            if hits:
                findings[rel] = sorted(set(hits))
    return findings


def selftest():
    import base64 as b

    def jwt(role):
        enc = lambda d: b.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")
        return "%s.%s.%s" % (enc({"alg": "HS256"}), enc({"role": role, "iss": "x"}), "s" * 20)

    cases = [
        ("const k = '%s'" % jwt("anon"), []),
        ("const k = '%s'" % jwt("service_role"), ["jwt_role_service_role"]),
        ("AKIA" + "A" * 16, ["aws_access_key"]),
        ("sk_live_" + "a" * 20, ["stripe_live"]),
        ("password = 'hunter2hunter2'", ["generic_assignment"]),
        ('{"client_secret": "exampleSecret123456"}', ["generic_assignment"]),
        ("const cfg = {'apiKey': 'abcdefghijklmnop'}", ["generic_assignment"]),
        ('STRIPE_SECRET_KEY = "abcdefghijklmnop"', ["generic_assignment"]),
        ("export SUPABASE_SERVICE_ROLE_KEY=abcdefghijklmnop", ["env_assignment"]),
        ("ENV HOOKS_ADMIN_TOKEN=abcdefghijklmnop", ["env_assignment"]),
        ('["node", "server.js", "--token=abcdefghijklmnop"]', ["cli_flag"]),
        ("sb_secret_" + "a" * 20, ["supabase_secret"]),
        ("const token = process.env.API_TOKEN", []),
        ('{"name": "pp-ssr", "version": "1.0.0"}', []),
        ("const url = 'https://example.supabase.co'", []),
        ("-----BEGIN RSA PRIVATE KEY-----", ["private_key"]),
    ]
    bad = 0
    for text, want in cases:
        got = sorted(set(scan_text(text)))
        ok = got == sorted(want)
        bad += not ok
        print(("PASS" if ok else "FAIL"), repr(text[:40]), "->", got)
    for name in (".env", "a/.env.local", "x/server.pem", "k.key", "id_rsa"):
        ok = bool(EXCLUDE_FILE_RE.search(name))
        bad += not ok
        print(("PASS" if ok else "FAIL"), "excluded:", name)
    for name in ("server.js", "envelope.js", "keys.ts"):
        ok = not EXCLUDE_FILE_RE.search(name)
        bad += not ok
        print(("PASS" if ok else "FAIL"), "kept:", name)
    # Tree scan fails closed on files it cannot scan.
    with tempfile.TemporaryDirectory() as d:
        open(os.path.join(d, "ok.js"), "w").write("const a = 1\n")
        open(os.path.join(d, "big.js.map"), "w").write("x" * 200 + "\nsk_live_" + "a" * 20)
        open(os.path.join(d, "PP_SSR_SNAPSHOT.md"), "w").write('"cmd": ["node", "--token=abcdefghijklmnop"]')
        got = scan_tree(d, max_bytes=100)
        want = {"big.js.map": ["too_large_to_scan"], "PP_SSR_SNAPSHOT.md": ["cli_flag"]}
        ok = got == want
        bad += not ok
        print(("PASS" if ok else "FAIL"), "tree scan (oversize file and snapshot metadata are findings) ->", got)
    print("selftest:", "ALL PASS" if not bad else "%d FAILED" % bad)
    return bad == 0


# ------------------------------------------------------------------ WEST -----
def west(script, timeout=580):
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
        fh.write(script)
        path = fh.name
    try:
        r = subprocess.run([sys.executable, WEST_RUNNER, path], capture_output=True, text=True, timeout=timeout)
        if "STATUS: Success" not in r.stdout:
            sys.exit("WEST step failed:\n" + (r.stdout + r.stderr)[-1500:])
        return r.stdout
    finally:
        os.remove(path)


def one(pattern, text, what):
    m = re.search(pattern, text)
    if not m:
        sys.exit("could not read %s from WEST output:\n%s" % (what, text[-1200:]))
    return m.group(1)


BOX_SCRIPT = r'''
import subprocess, hashlib, json, os, re, tarfile, shutil
C, SERVED, PASS, TOOLS = %(container)r, %(served)r, %(passphrase)r, %(tools)r
EXCL_DIRS = %(excl_dirs)r
EXCL_FILE = re.compile(%(excl_file)r)
def sh(c, t=500):
    r = subprocess.run(c, shell=True, capture_output=True, text=True, timeout=t)
    return r.returncode, ((r.stdout or "") + (r.stderr or "")).strip()
rc, raw = sh("docker inspect %%s" %% C)
if rc != 0: print("NO_CONTAINER"); raise SystemExit(0)
info = json.loads(raw)[0]
cfg = info.get("Config", {})
# Metadata only. Env VALUES are never printed; only the variable NAMES.
meta = {"image": cfg.get("Image"), "image_id": info.get("Image"), "workdir": cfg.get("WorkingDir"),
        "cmd": cfg.get("Cmd"), "entrypoint": cfg.get("Entrypoint"),
        "env_names": sorted(e.split("=", 1)[0] for e in (cfg.get("Env") or [])),
        "mounts": [{"src": m.get("Source"), "dst": m.get("Destination"), "rw": m.get("RW")} for m in info.get("Mounts", [])],
        "created": info.get("Created"), "started": info.get("State", {}).get("StartedAt")}
print("META " + json.dumps(meta))
wd = meta["workdir"] or "/app"
dst = "/tmp/pp-ssr-src"
shutil.rmtree(dst, ignore_errors=True)
rc, out = sh("docker cp %%s:%%s %%s" %% (C, wd, dst))
if rc != 0: print("CP_FAILED " + out[-300:]); raise SystemExit(0)
files = []
for dp, dns, fns in os.walk(dst):
    dns[:] = sorted(d for d in dns if d not in EXCL_DIRS)
    for fn in sorted(fns):
        rel = os.path.relpath(os.path.join(dp, fn), dst)
        if EXCL_FILE.search(rel): continue
        files.append(rel)
tarp = "/tmp/pp-ssr-src.tar.gz"
def norm(ti):
    ti.mtime, ti.uid, ti.gid, ti.uname, ti.gname = 0, 0, 0, "", ""
    return ti
with tarfile.open(tarp, "w:gz", compresslevel=9) as tf:
    for rel in files:
        tf.add(os.path.join(dst, rel), arcname=rel, recursive=False, filter=norm)
d = open(tarp, "rb").read()
print("FILES %%d" %% len(files))
print("PLAIN_SHA256 " + hashlib.sha256(d).hexdigest())
print("PLAIN_BYTES %%d" %% len(d))
enc = os.path.join(TOOLS, SERVED)
rc, out = sh("openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -in %%s -out %%s -pass pass:%%s" %% (tarp, enc, PASS))
if rc != 0: print("ENC_FAILED"); raise SystemExit(0)
os.chmod(enc, 0o644)
print("ENC_SHA256 " + hashlib.sha256(open(enc, "rb").read()).hexdigest())
shutil.rmtree(dst, ignore_errors=True); os.remove(tarp)
'''


def plan():
    print(__doc__)
    print("Steps with --go:")
    print("  1. WEST: docker inspect %s (metadata, env NAMES only), docker cp its working dir," % CONTAINER)
    print("     drop node_modules/.git/.env/keys, deterministic tar, AES-256 with a single-use passphrase,")
    print("     write the ciphertext to %s/<random>.bin" % TOOLS_DIR)
    print("  2. here: one GET of %s<random>.bin, sha256 check" % PUBLIC_BASE)
    print("  3. WEST: delete the served file (always, even on mismatch)")
    print("  4. here: decrypt, sha256 check, extract")
    print("  5. here: secret scan; any finding other than an anon JWT aborts")
    print("  6. here: commit the tree + PP_SSR_SNAPSHOT.md (metadata) to orphan branch")
    print("     ops/pp-ssr-snapshot-<date> and push. Nothing on WEST is changed except the temp files.")


def go(branch, workdir):
    passphrase = secrets.token_hex(32)
    served = secrets.token_hex(16) + ".bin"
    os.makedirs(workdir, exist_ok=True)
    print("[1/6] capturing on WEST...")
    out = west(BOX_SCRIPT % {"container": CONTAINER, "served": served, "passphrase": passphrase,
                             "tools": TOOLS_DIR, "excl_dirs": sorted(EXCLUDE_DIRS),
                             "excl_file": EXCLUDE_FILE_RE.pattern})
    for bad in ("NO_CONTAINER", "CP_FAILED", "ENC_FAILED"):
        if bad in out:
            sys.exit("ABORT on WEST: " + bad)
    meta = json.loads(one(r"META (\{.*\})", out, "container metadata"))
    plain_sha = one(r"PLAIN_SHA256 ([0-9a-f]{64})", out, "tar sha256")
    enc_sha = one(r"ENC_SHA256 ([0-9a-f]{64})", out, "ciphertext sha256")
    nfiles = int(one(r"FILES (\d+)", out, "file count"))
    print("      %d files, image %s" % (nfiles, (meta.get("image_id") or "")[:19]))

    encp = os.path.join(workdir, "pp-ssr.enc")
    print("[2/6] downloading...")
    dl = subprocess.run(["curl", "-sS", "--max-time", "300", "-o", encp,
                         PUBLIC_BASE + served + "?nocache=" + secrets.token_hex(6)])
    print("[3/6] removing the served file from WEST...")
    west("import os\np=%r\nif os.path.exists(p): os.remove(p); print('removed')\n" % os.path.join(TOOLS_DIR, served))
    if dl.returncode != 0:
        sys.exit("ABORT: download failed")
    got = hashlib.sha256(open(encp, "rb").read()).hexdigest()
    if got != enc_sha:
        sys.exit("ABORT: ciphertext sha256 mismatch (WEST %s, here %s)" % (enc_sha, got))

    print("[4/6] decrypting and verifying...")
    tarp = os.path.join(workdir, "pp-ssr.tar.gz")
    pf = os.path.join(workdir, "pass")
    with open(pf, "w") as fh:
        fh.write(passphrase)
    os.chmod(pf, 0o600)
    subprocess.run(["openssl", "enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "200000",
                    "-in", encp, "-out", tarp, "-pass", "file:" + pf], check=True)
    os.remove(pf)
    if hashlib.sha256(open(tarp, "rb").read()).hexdigest() != plain_sha:
        sys.exit("ABORT: decrypted tar sha256 does not match WEST's")
    src = os.path.join(workdir, "src")
    with tarfile.open(tarp) as tf:
        names = tf.getnames()
        if any(n.startswith("/") or ".." in n.split("/") for n in names):
            sys.exit("ABORT: unsafe path in archive")
        tf.extractall(src)
    if len(names) != nfiles:
        sys.exit("ABORT: %d files extracted, WEST counted %d" % (len(names), nfiles))

    print("[5/6] scanning for secrets...")
    findings = scan_tree(src)
    if findings:
        for f, h in sorted(findings.items()):
            print("      %s: %s" % (f, ", ".join(h)))
        sys.exit("ABORT: possible secrets in %d file(s); nothing pushed. Review %s" % (len(findings), src))

    print("[6/6] committing to %s ..." % branch)
    with open(os.path.join(src, "PP_SSR_SNAPSHOT.md"), "w") as fh:
        fh.write("# pp-ssr source snapshot\n\nCaptured %s UTC from the running `%s` container on WEST by\n"
                 "`ops/west/pp-ssr/preserve_pp_ssr.py`. Excluded: node_modules, .git, .env*, key files.\n\n"
                 "```json\n%s\n```\n\nArchive sha256 (before encryption): `%s`\n"
                 % (datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M"), CONTAINER, json.dumps(meta, indent=2), plain_sha))
    repo = os.path.join(workdir, "repo")
    g = ["git", "-C", repo]
    subprocess.run(["git", "init", "-q", "-b", branch, repo], check=True)
    subprocess.run(["cp", "-a", src + "/.", repo], check=True)
    # Scan again exactly what will be committed, PP_SSR_SNAPSHOT.md included: the
    # container's Cmd/Entrypoint can carry credentials as arguments.
    final = scan_tree(repo)
    if final:
        for f, h in sorted(final.items()):
            print("      %s: %s" % (f, ", ".join(h)))
        sys.exit("ABORT: possible secrets in the tree to be committed; nothing pushed. Review %s" % repo)
    subprocess.run(g + ["add", "-A"], check=True)
    subprocess.run(g + ["-c", "user.name=Claude", "-c", "user.email=noreply@anthropic.com", "commit", "-q",
                        "-m", "pp-ssr source snapshot from the running container (read-only capture)"], check=True)
    remote = subprocess.run(["git", "-C", os.path.join(HERE, "..", "..", ".."), "remote", "get-url", "origin"],
                            capture_output=True, text=True).stdout.strip()
    r = subprocess.run(g + ["push", remote, "HEAD:refs/heads/%s" % branch], capture_output=True, text=True)
    print((r.stdout + r.stderr).strip()[-400:])
    if r.returncode != 0:
        sys.exit("ABORT: push failed")
    print("\nPRESERVED  branch=%s  files=%d  sha256=%s" % (branch, nfiles, plain_sha))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--go", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--branch", default="ops/pp-ssr-snapshot-%s" % datetime.date.today().isoformat())
    ap.add_argument("--workdir", default=None)
    a = ap.parse_args()
    if a.selftest:
        sys.exit(0 if selftest() else 1)
    if not a.go:
        plan()
        return
    if not selftest():
        sys.exit("ABORT: scanner selftest failed")
    go(a.branch, a.workdir or tempfile.mkdtemp(prefix="pp-ssr-preserve-"))


if __name__ == "__main__":
    main()
