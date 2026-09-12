#!/usr/bin/env python3
"""Preserve EAST's live fresh-web tree to GitHub, end to end, without putting a
credential on EAST.

    python3 ops/preserve_east.py [--branch ops/east-production-snapshot-YYYY-MM-DD]

Why it works this way (2026-09-11):
  * EAST has no GitHub credential, no `gh`, no GH_TOKEN.
  * S3 is not available: neither the sandbox IAM user nor EAST's instance role
    (`hosting-logger`) can list or create a bucket.
  * Relaying 62 MB through SSM at ~4 KB/call is not a transfer mechanism.

So: bundle on EAST, encrypt with a single-use passphrase delivered over SSM,
drop it where `serve.mjs` already serves static files, pull it down here in one
GET, verify the sha256 computed on EAST survived the round trip, delete the
served file, then push from this session (which does hold push access).

The bundle is AES-encrypted for the seconds it is reachable. It also carries no
secrets: .env is untracked and no literal secret value appears in any tracked
file (see docs/ops/east-preservation-2026-09-11/README.md).

Fails closed. Any hash mismatch aborts before anything is pushed.
"""
import argparse, base64, hashlib, os, re, secrets, subprocess, sys, tempfile, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
EAST_RUNNER = os.path.join(HERE, "runners", "east_runx.py")
EAST_HOST = "3.222.110.146"
FW = "/home/ubuntu/fresh-web"
REMOTE = "https://github.com/derekbowen/fresh-web-702e04c3.git"


def east(script, timeout=580):
    """Run a python script on EAST via SSM; return stdout."""
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
        fh.write(script)
        path = fh.name
    try:
        r = subprocess.run([sys.executable, EAST_RUNNER, path],
                           capture_output=True, text=True, timeout=timeout)
        if "STATUS: Success" not in r.stdout:
            sys.exit("EAST step failed:\n" + (r.stdout + r.stderr)[-1500:])
        return r.stdout
    finally:
        os.remove(path)


def one(pattern, text, what):
    m = re.search(pattern, text)
    if not m:
        sys.exit("could not read %s from EAST output:\n%s" % (what, text[-1200:]))
    return m.group(1)


def main():
    today = datetime.date.today().isoformat()
    ap = argparse.ArgumentParser()
    ap.add_argument("--branch", default="ops/east-production-snapshot-%s" % today)
    ap.add_argument("--workdir", default=tempfile.mkdtemp(prefix="east-preserve-"))
    args = ap.parse_args()

    passphrase = secrets.token_hex(32)
    served = secrets.token_hex(16) + ".bin"
    wd = args.workdir
    os.makedirs(wd, exist_ok=True)

    # ---- 1. bundle + encrypt on EAST -------------------------------------
    print("[1/6] bundling on EAST (all refs, full history)...")
    out = east(r'''
import subprocess, hashlib, os
FW, B = %r, "/tmp/east-snapshot.bundle"
def sh(c, t=560):
    r = subprocess.run(c, shell=True, capture_output=True, text=True, timeout=t)
    return ((r.stdout or "") + (r.stderr or "")).strip()
if os.path.exists(B): os.remove(B)
sh("sudo -u ubuntu git -C %%s bundle create %%s --all" %% (FW, B))
v = sh("sudo -u ubuntu git -C %%s bundle verify %%s" %% (FW, B))
print("COMPLETE" if "records a complete history" in v else "INCOMPLETE")
d = open(B, "rb").read()
print("PLAIN_SHA256 " + hashlib.sha256(d).hexdigest())
print("PLAIN_BYTES %%d" %% len(d))
print("TREE " + sh("sudo -u ubuntu git -C %%s rev-parse HEAD^{tree}" %% FW))
print("HEAD " + sh("sudo -u ubuntu git -C %%s rev-parse HEAD" %% FW))
print("TRACKED " + sh("sudo -u ubuntu git -C %%s ls-files | wc -l" %% FW))
print("DIRTY " + sh("sudo -u ubuntu git -C %%s status --porcelain | wc -l" %% FW))
enc = FW + "/dist/client/" + %r
sh("openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -in %%s -out %%s -pass pass:%%s" %% (B, enc, %r))
os.chmod(enc, 0o644)
print("ENC_SHA256 " + hashlib.sha256(open(enc, "rb").read()).hexdigest())
''' % (FW, served, passphrase))

    if "COMPLETE" not in out:
        sys.exit("ABORT: bundle does not record a complete history")
    plain_sha = one(r"PLAIN_SHA256 ([0-9a-f]{64})", out, "bundle sha256")
    enc_sha = one(r"ENC_SHA256 ([0-9a-f]{64})", out, "encrypted sha256")
    tree = one(r"TREE ([0-9a-f]{40})", out, "tree hash")
    head = one(r"HEAD ([0-9a-f]{40})", out, "HEAD")
    tracked = one(r"TRACKED (\d+)", out, "tracked count")
    dirty = one(r"DIRTY (\d+)", out, "dirty count")
    print("      HEAD %s  tree %s  %s files  %s dirty" % (head[:8], tree[:8], tracked, dirty))
    if dirty != "0":
        print("      WARNING: %s uncommitted file(s) on EAST are NOT in this bundle." % dirty)

    # ---- 2. download in one GET ------------------------------------------
    print("[2/6] downloading...")
    encp = os.path.join(wd, "east.enc")
    subprocess.run(["curl", "-sS", "--max-time", "900", "-o", encp,
                    "http://%s/%s" % (EAST_HOST, served)], check=True)
    got = hashlib.sha256(open(encp, "rb").read()).hexdigest()

    # ---- 3. delete the served file, always --------------------------------
    print("[3/6] removing the served file from EAST...")
    east('''import glob, os
for f in glob.glob(%r): os.remove(f); print("removed", os.path.basename(f))
''' % (FW + "/dist/client/" + served))

    if got != enc_sha:
        sys.exit("ABORT: ciphertext sha256 mismatch (EAST %s, here %s)" % (enc_sha, got))

    # ---- 4. decrypt + verify ---------------------------------------------
    print("[4/6] decrypting and verifying...")
    bundle = os.path.join(wd, "east.bundle")
    pf = os.path.join(wd, "pass")
    with open(pf, "w") as fh:
        fh.write(passphrase)
    os.chmod(pf, 0o600)
    subprocess.run(["openssl", "enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "200000",
                    "-in", encp, "-out", bundle, "-pass", "file:" + pf], check=True)
    os.remove(pf)
    if hashlib.sha256(open(bundle, "rb").read()).hexdigest() != plain_sha:
        sys.exit("ABORT: decrypted bundle sha256 does not match EAST's")

    # ---- 5. restore and check against EAST --------------------------------
    print("[5/6] restoring from the bundle...")
    repo = os.path.join(wd, "restore")
    subprocess.run(["git", "clone", "-q", bundle, repo], check=True)
    g = ["git", "-C", repo]
    subprocess.run(g + ["checkout", "-q", args.branch], check=False)
    got_tree = subprocess.run(g + ["rev-parse", "HEAD^{tree}"],
                              capture_output=True, text=True).stdout.strip()
    got_n = subprocess.run(g + ["ls-files"], capture_output=True, text=True).stdout.count("\n")
    if got_tree != tree or str(got_n) != tracked:
        sys.exit("ABORT: restored tree %s/%s != EAST %s/%s" % (got_tree, got_n, tree, tracked))
    print("      restored tree matches EAST exactly")

    # ---- 6. push ----------------------------------------------------------
    print("[6/6] pushing to %s ..." % REMOTE)
    subprocess.run(g + ["remote", "add", "gh", REMOTE], check=False)
    r = subprocess.run(g + ["push", "gh", "refs/heads/%s:refs/heads/%s" % (args.branch, args.branch)],
                       capture_output=True, text=True)
    print((r.stdout + r.stderr).strip()[-500:])
    if r.returncode != 0:
        sys.exit("ABORT: push failed")

    man = os.path.join(wd, "east-snapshot-manifest.txt")
    with open(man, "w") as fh:
        fh.write(subprocess.run(g + ["ls-tree", "-r", "HEAD", "--format=%(objectname) %(path)"],
                                capture_output=True, text=True).stdout)
    print("\nPRESERVED  branch=%s  head=%s  tree=%s  files=%s" % (args.branch, head, tree, tracked))
    print("manifest:  %s" % man)
    print("workdir:   %s  (delete when done)" % wd)


if __name__ == "__main__":
    main()
