"""WEST step: install the homepage hero videos into /var/www/prnm-tools/hero/.

Run with ops/runners/ssm_runx.py. nginx on WEST serves that folder at
https://www.poolrentalnearme.com/tools/hero/ (location ^~ /tools/ alias).

Files come from this repo (public) at a PINNED commit and are md5-verified
before anything is moved into place. DRY=True only downloads, verifies and
reports; DRY=False installs (atomic rename per file, previous copies kept as
.bak-<ts>) and then checks nginx serves them with byte ranges.
"""
import hashlib, os, shutil, subprocess, sys, time, urllib.request

DRY = True
SHA = "REPLACE_WITH_COMMIT_SHA"
BASE = "https://raw.githubusercontent.com/derekbowen/poolrentalnearme-web/%s/ops/east/hero-video/files/" % SHA
DEST = "/var/www/prnm-tools/hero"
FILES = {  # name: md5  (filled from `md5sum ops/east/hero-video/files/*`)
    "REPLACE": "REPLACE",
}

if "REPLACE" in SHA or "REPLACE" in FILES:
    sys.exit("refusing: SHA/FILES not filled in")

ts = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
stage = "/tmp/prnm_hero_%s" % ts
os.makedirs(stage)
bad = []
for name, want in FILES.items():
    data = urllib.request.urlopen(BASE + name, timeout=120).read()
    got = hashlib.md5(data).hexdigest()
    open(os.path.join(stage, name), "wb").write(data)
    print("%-26s %9d bytes md5 %s %s" % (name, len(data), got, "OK" if got == want else "MISMATCH want " + want))
    if got != want:
        bad.append(name)
if bad:
    shutil.rmtree(stage)
    sys.exit("ABORT: md5 mismatch on %s; nothing installed" % bad)
print("df:", subprocess.run(["df", "-h", "/var/www"], capture_output=True, text=True).stdout.splitlines()[-1])
if DRY:
    shutil.rmtree(stage)
    print("DRY RUN: verified, nothing installed")
    sys.exit(0)

os.makedirs(DEST, exist_ok=True)
for name in FILES:
    dst = os.path.join(DEST, name)
    if os.path.exists(dst):
        shutil.copy2(dst, dst + ".bak-" + ts)
    tmp = dst + ".tmp-" + ts
    shutil.copyfile(os.path.join(stage, name), tmp)
    os.chmod(tmp, 0o644)
    os.replace(tmp, dst)
shutil.rmtree(stage)
print("installed into", DEST)

# Serve check through local nginx (bypasses Cloudflare), including a byte-range request.
for name in FILES:
    url = "https://www.poolrentalnearme.com/tools/hero/" + name
    base = ["curl", "-sk", "--resolve", "www.poolrentalnearme.com:443:127.0.0.1", "-o", "/dev/null"]
    full = subprocess.run(base + ["-w", "%{http_code} %{content_type} %{size_download}", url],
                          capture_output=True, text=True).stdout
    rng = subprocess.run(base + ["-r", "0-1023", "-w", "%{http_code}", url], capture_output=True, text=True).stdout
    print("%-26s full=%s range=%s" % (name, full, rng))
