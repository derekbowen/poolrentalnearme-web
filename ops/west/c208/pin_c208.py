#!/usr/bin/env python3
"""LOCAL ONLY (never contacts a server): pin patch_c208.py and scripts_c208.py to a commit.

    python3 ops/west/c208/pin_c208.py <commit> [--token T] [--sri S]

Sets SHA in both scripts, recomputes every pinned sha256 (the 5 shipped files,
gate_c208_block.sh and flip_c208_block.sh) from `git show <commit>:<path>`, and fills TOKEN / SRI when given
(both are public: the website token cw_setup prints and the sha384 east_widget.py
prints). Run it after the commit is pushed, then run test_c208.py again. It checks
formats only; patch_c208.py checks the SRI against the live sdk.js on the box.
"""
import hashlib, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
FORMAT = {"SHA": r"[0-9a-f]{40}", "TOKEN": r"[A-Za-z0-9]{16,64}", "SRI": r"sha384-[A-Za-z0-9+/]{64}"}


def git_bytes(commit, path):
    return subprocess.run(["git", "-C", ROOT, "show", "%s:%s" % (commit, path)], capture_output=True, check=True).stdout


def pin(text, values, commit):
    """Return text with SHA/TOKEN/SRI and every 64-hex sha256 pin re-derived from commit."""
    for k, v in values.items():
        text, n = re.subn(r'^%s = "[^"]*"$' % k, '%s = "%s"' % (k, v), text, flags=re.M)
        if n != 1:
            raise SystemExit("ABORT: %s line not found exactly once" % k)

    def fix(m):
        return m.group(1) + hashlib.sha256(git_bytes(commit, m.group(2))).hexdigest() + m.group(4)
    # FILES lines: "path": ("md5" or None, "sha256"),  and  BLOCK / FLIP = ("path", "sha256")
    text, n1 = re.subn(r'^(\s*"([^"]+)": \((?:"[0-9a-f]{32}"|None), ")([0-9a-f]{64}|REPLACE[^"]*)("\),?)$', fix, text, flags=re.M)
    text, n2 = re.subn(r'^((?:BLOCK|FLIP) = \("([^"]+)", ")([0-9a-f]{64}|REPLACE[^"]*)("\))$', fix, text, flags=re.M)
    return text, n1 + n2


def main(argv):
    if not argv or argv[0].startswith("-"):
        raise SystemExit(__doc__)
    commit = subprocess.run(["git", "-C", ROOT, "rev-parse", "--verify", argv[0] + "^{commit}"],
                            capture_output=True, text=True, check=True).stdout.strip()
    values = {"SHA": commit}
    for flag, key in (("--token", "TOKEN"), ("--sri", "SRI")):
        if flag in argv:
            values[key] = argv[argv.index(flag) + 1]
    for k, v in values.items():
        if not re.fullmatch(FORMAT[k], v):
            raise SystemExit("ABORT: %s is malformed" % k)
    out = {}
    for name, want in (("patch_c208.py", 5), ("scripts_c208.py", 2)):  # both computed before either is written
        text, n = pin(open(os.path.join(HERE, name), encoding="utf-8").read(), values, commit)
        if n != want:
            raise SystemExit("ABORT, nothing written: %s: %d sha256 pins found, want %d" % (name, n, want))
        out[name] = text
    for name, text in out.items():
        open(os.path.join(HERE, name), "w", encoding="utf-8").write(text)
        print("pinned %s to %s (%s)" % (name, commit[:12], ", ".join(sorted(values))))


if __name__ == "__main__":
    main(sys.argv[1:])
