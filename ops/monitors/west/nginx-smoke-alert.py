#!/usr/bin/env python3
"""Runs nginx-smoke-test.sh, appends to ~/nginx-smoke.log, emails Derek (via Emailit) on failure.
Live copy: /home/ubuntu/nginx-smoke-alert.py, cron */10 * * * * (ubuntu). Mirror edits in ops/monitors/west/.

v2 2026-09-15: subject and body name the failure CLASS(es) the test reported (ROUTING, API,
FRONTEND, ASSET, BACKEND, TIMEOUT, LATENCY) instead of the fixed "social/booking endpoint
down" text v1 sent for every failure. DRY_RUN=1 prints the email instead of sending it.
One alert per hour max (marker ~/.nginx-smoke-last-alert), unchanged from v1."""
import os, re, subprocess, time, json, urllib.request
H = os.path.expanduser("~")
env = {}
for l in open(H + "/nginx-smoke.env"):
    l = l.strip()
    if "=" in l and not l.startswith("#"):
        k, v = l.split("=", 1); env[k] = v
p = subprocess.run([os.environ.get("SMOKE_TEST", H + "/nginx-smoke-test.sh")], capture_output=True, text=True)
out = (p.stdout + p.stderr).strip(); rc = p.returncode
LOG = os.environ.get("SMOKE_LOG", H + "/nginx-smoke.log")
open(LOG, "a").write("[%s] rc=%d %s\n" % (time.strftime("%FT%TZ", time.gmtime()), rc, out))
if rc == 0:
    raise SystemExit(0)
classes = sorted(set(re.findall(r"^FAIL \[([A-Z]+)\]", out, re.M)))
fails = re.findall(r"^FAIL .*", out, re.M)
subject = "🔴 PRNM smoke: %s — %s" % (", ".join(classes) or "UNCLASSIFIED", (fails[0] if fails else out.splitlines()[0])[:90])
legend = ("ROUTING=wrong backend (fresh-web/marketplace swallow); API=marketplace API answered non-JSON/bad status; "
          "FRONTEND=/s not the marketplace app; ASSET=css/js missing or not 200; BACKEND=5xx/000; "
          "TIMEOUT=no response in 15s (/s retried once); LATENCY=/s first byte over threshold.")
html = "<p><b>%d failing check(s)</b>, class(es): %s</p><pre>%s</pre><p>%s</p><p>Log: ~/nginx-smoke.log on WEST. Test: ~/nginx-smoke-test.sh</p>" % (
    len(fails), ", ".join(classes), out, legend)
body = json.dumps({"from": env["ALERT_FROM"], "to": env["ALERT_TO"], "subject": subject, "html": html, "text": out}).encode()
if os.environ.get("DRY_RUN"):
    print("DRY_RUN subject:", subject); print(html); raise SystemExit(rc)
mk = H + "/.nginx-smoke-last-alert"; now = int(time.time()); last = 0
try: last = int(open(mk).read().strip())
except Exception: pass
if now - last > 3600:
    open(mk, "w").write(str(now))
    try:
        r = urllib.request.urlopen(urllib.request.Request("https://api.emailit.com/v2/emails", data=body,
            headers={"Authorization": "Bearer " + env["EMAILIT_API_KEY"], "Content-Type": "application/json"}), timeout=20)
        open(LOG, "a").write("  alert emailed HTTP %s\n" % r.status)
    except Exception as e:
        open(LOG, "a").write("  alert send FAILED %s\n" % e)
