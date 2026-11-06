#!/usr/bin/env python3
"""Pin the chatbot release for bot_deploy.py (local only; touches no server).

  python3 ops/chatbot/ops/pin_bot.py manifest <rev>   # write ops/chatbot/ops/bot_manifest.sha256 from <rev>
  python3 ops/chatbot/ops/pin_bot.py pin <rev>        # verify the manifest at <rev>, then set SHA and
                                                      # MANIFEST_SUM in bot_deploy.py

Flow: commit the bot -> `manifest HEAD` -> commit + push the manifest -> `pin HEAD` (the pushed
commit) -> run bot_deploy.py DRY, then DRY=False with Derek's GO.

The manifest lists every file under ops/chatbot/ in git at <rev> except ops/ (deploy tooling),
data/ (runtime logs live in /home/ubuntu/chatbot/data on the box) and bank/drafts/ (drafts are
never published), as `<sha256>  <path relative to ops/chatbot/>`, sorted.
"""
import hashlib, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
MANIFEST = "ops/chatbot/ops/bot_manifest.sha256"
SKIP = ("ops/", "data/", "bank/drafts/")


def git(*a, binary=False):
    r = subprocess.run(["git", "-C", REPO] + list(a), capture_output=True)
    if r.returncode:
        sys.exit("git %s failed: %s" % (" ".join(a), r.stderr.decode()[-300:]))
    return r.stdout if binary else r.stdout.decode()


def build(rev):
    paths = [p for p in git("ls-tree", "-r", "--name-only", rev, "ops/chatbot/").splitlines()]
    lines = []
    for p in sorted(paths):
        rel = p[len("ops/chatbot/"):]
        if rel.startswith(SKIP):
            continue
        if not re.match(r"[A-Za-z0-9_][A-Za-z0-9_./-]*$", rel) or ".." in rel:
            sys.exit("path not allowed by bot_deploy.py: %r" % rel)
        lines.append("%s  %s" % (hashlib.sha256(git("show", "%s:%s" % (rev, p), binary=True)).hexdigest(), rel))
    if not any(x.endswith("  package.json") for x in lines):
        sys.exit("ops/chatbot/package.json is required (main + scripts.test; no dependencies)")
    return "\n".join(lines) + "\n"


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in ("manifest", "pin"):
        sys.exit(__doc__)
    mode, rev = sys.argv[1], git("rev-parse", sys.argv[2]).strip()
    want = build(rev)
    if mode == "manifest":
        open(os.path.join(REPO, MANIFEST), "w").write(want)
        print("wrote %s (%d files) from %s. Commit and push it, then: pin_bot.py pin <that commit>"
              % (MANIFEST, want.count("\n"), rev[:12]))
        return
    have = git("show", "%s:%s" % (rev, MANIFEST), binary=True)
    if have.decode() != want:
        sys.exit("manifest at %s does not match the files at %s; run `manifest` again" % (rev[:12], rev[:12]))
    if git("branch", "-r", "--contains", rev).strip() == "":
        print("WARNING: %s is not on any remote branch yet; raw.githubusercontent.com cannot serve it" % rev[:12])
    p = os.path.join(HERE, "bot_deploy.py")
    s = open(p).read()
    s = re.sub(r'^SHA = "[^"]*"', 'SHA = "%s"' % rev, s, count=1, flags=re.M)
    s = re.sub(r'^MANIFEST_SUM = "[^"]*"', 'MANIFEST_SUM = "%s"' % hashlib.sha256(have).hexdigest(), s, count=1,
               flags=re.M)
    open(p, "w").write(s)
    print("bot_deploy.py pinned: SHA=%s MANIFEST_SUM=%s (%d files)" % (rev, hashlib.sha256(have).hexdigest(),
                                                                       want.count("\n")))


if __name__ == "__main__":
    main()
