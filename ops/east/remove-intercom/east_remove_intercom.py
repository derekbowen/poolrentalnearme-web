"""EAST: remove the Intercom Messenger from every public page of fresh-web (Derek, 2026-11-04).

Run with ops/runners/east_runx.py. EAST has drifted from the fresh-web repo (its
__root.tsx lazy-loads the widget on every non-admin page, and home-page.tsx boots it
again with the hardcoded app id), so this edits the box's own files at exact anchors,
gated on their md5. Server-side Intercom code (webhook routes, email-queue pause)
is left in place, inert once Intercom is gone, as a separate cleanup.

DRY=True (default): read-only checks. DRY=False: backup, edit, build, restart, verify.
Any failure restores the backups, rebuilds and restarts.
"""
import hashlib, os, shlex, shutil, subprocess, sys, time

DRY = True
APP = "/home/ubuntu/fresh-web"
SITE = "https://www.poolrentalnearme.com"
EDITS = {
    "src/routes/__root.tsx": ("be754078a9f4597b65243ad1d1e71743", [
        ('import { lazy, Suspense, useState } from "react";\n', 'import { useState } from "react";\n'),
        ("// Intercom ships ~350KB of JS. Lazy-load it so it never blocks first paint\n"
         "// and never lands in the entry chunk for routes that don't show the widget.\n"
         "const IntercomWidget = lazy(() =>\n"
         '  import("@/components/intercom-widget").then((m) => ({ default: m.IntercomWidget })),\n'
         ");\n", ""),
        ("  const showIntercom = !isAdmin;\n", ""),
        ("      {showIntercom && (\n"
         "        <Suspense fallback={null}>\n"
         "          <IntercomWidget />\n"
         "        </Suspense>\n"
         "      )}\n", ""),
    ]),
    "src/components/home-page.tsx": ("436fdf889e579c3d814eb632efe702dc", [
        ("  // Intercom messenger on the public homepage (the app id is public client-side;\n"
         "  // WEST already boots it on internal pages - this is the missing EAST half).\n"
         "  // Deferred to idle so it never competes with the hero paint.\n"
         "  useEffect(() => {\n"
         "    const w = window as any;\n"
         "    if (w.Intercom) return;\n"
         "    const boot = () => {\n"
         '      w.intercomSettings = { api_base: "https://api-iam.intercom.io", app_id: "nuuc4281" };\n'
         '      const s = document.createElement("script");\n'
         "      s.async = true;\n"
         '      s.src = "https://widget.intercom.io/widget/nuuc4281";\n'
         "      document.head.appendChild(s);\n"
         "    };\n"
         '    if ("requestIdleCallback" in w) w.requestIdleCallback(boot, { timeout: 4000 });\n'
         "    else setTimeout(boot, 2500);\n"
         "  }, []);\n"
         "\n", ""),
    ]),
}


def sh(cmd, timeout=900):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
    return r.returncode, (r.stdout + r.stderr)[-2500:]


def as_ubuntu(cmd, timeout=900):
    return sh("sudo -u ubuntu PM2_HOME=/home/ubuntu/.pm2 bash -lc %s" % shlex.quote(cmd), timeout)


bad, out = [], {}
for p, (md5, reps) in EDITS.items():
    raw = open(os.path.join(APP, p), "rb").read()
    if hashlib.md5(raw).hexdigest() != md5:
        bad.append("drift: " + p)
        continue
    s = raw.decode()
    for a, b in reps:
        if s.count(a) != 1:
            bad.append("anchor x%d in %s: %r" % (s.count(a), p, a[:50]))
        s = s.replace(a, b, 1)
    out[p] = s
if "src/routes/__root.tsx" in out:
    r = out["src/routes/__root.tsx"]
    if "lazy(" in r or "Suspense" in r or "Intercom" in r:
        bad.append("__root.tsx still references lazy/Suspense/Intercom after edit")
if "src/components/home-page.tsx" in out and "nuuc4281" in out["src/components/home-page.tsx"]:
    bad.append("home-page.tsx still has the app id after edit")
rc, newer = sh("cd %s && ref=$(ls -t dist/client/fw-assets/*.js 2>/dev/null | head -1); [ -n \"$ref\" ] && find src -type f -newer \"$ref\" ! -name '*.bak*' | head -20" % APP)
newer = [x for x in newer.split() if x]
if newer:
    bad.append("unbuilt source edits present: %s" % newer)
print(sh("free -m | sed -n 2p; df -h %s | tail -1" % APP)[1])
if bad:
    sys.exit("ABORT, nothing changed: " + "; ".join(bad))
print("anchors OK in both files; no unbuilt source edits")
if DRY:
    sys.exit("DRY RUN: nothing changed")

ts = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
BK = "/home/ubuntu/backup-east-remove-intercom-" + ts
os.makedirs(BK)
orig = {}
for p, s in out.items():
    full = os.path.join(APP, p)
    orig[p] = open(full, "rb").read()
    shutil.copy2(full, os.path.join(BK, os.path.basename(p)))
    st = os.stat(full)
    with open(full, "w") as f:
        f.write(s)
    os.chown(full, st.st_uid, st.st_gid)


def build():
    rc, o = as_ubuntu("cd %s && NODE_OPTIONS=--max-old-space-size=3072 npm run build" % APP)
    print("build rc", rc, o[-600:])
    return rc == 0


def restart():
    rc, _ = as_ubuntu("pm2 restart fresh-web")
    time.sleep(10)
    return rc == 0


def verify():
    rc, n = sh("cd %s && grep -rlE 'widget.intercom.io|nuuc4281|intercomSettings' dist/client | wc -l" % APP)
    ok = n.strip() == "0"
    for path in ("/", "/p/how-to-host-a-pool-party"):
        rc, r = sh("curl -s -o /tmp/eic.html -w '%%{http_code}' -m 25 '%s%s?v=%s'" % (SITE, path, ts))
        html = open("/tmp/eic.html", errors="replace").read()
        print(path, r.strip(), "| nuuc4281 in html:", "nuuc4281" in html)
        ok = ok and r.strip() == "200" and "nuuc4281" not in html
    print("client files with widget refs:", n.strip())
    return ok


ok = build() and restart() and verify()
if ok:
    print("DONE. backup:", BK)
    sys.exit(0)
print("FAILED -> rolling back from", BK)
for p, raw in orig.items():
    with open(os.path.join(APP, p), "wb") as f:
        f.write(raw)
print("rollback build ok:", build(), "| restart ok:", restart())
sys.exit(1)
