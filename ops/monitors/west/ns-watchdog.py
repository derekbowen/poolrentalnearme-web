#!/usr/bin/env python3
"""Nameserver watchdog. Live copy: /home/ubuntu/ns-watchdog/ns-watchdog.py, cron 17 * * * * (ubuntu).

Why: in 2026 poolrentalnearme.com silently went from Cloudflare back to Hostinger's
nameservers (a Hostinger "point this domain" prompt rewrites them), Cloudflare marked the
zone moved and deleted it, and nobody noticed. This asks each TLD registry directly, once
an hour, and emails Derek (Emailit, same creds as the smoke alert) ONLY when a domain's
nameserver set differs from the last run. Every run is logged to ~/ns-watchdog.log.
DRY_RUN=1 prints instead of sending. State: ~/ns-watchdog/state.json.
"""
import json, os, re, subprocess, time, urllib.request
H = os.path.expanduser("~")
D = H + "/ns-watchdog"; os.makedirs(D, exist_ok=True)
LOG = H + "/ns-watchdog.log"; STATE = D + "/state.json"
# registry servers (authoritative for the TLD), so resolver caches cannot hide a change
DOMAINS = {
    "poolrentalnearme.com":    ["a.gtld-servers.net", "b.gtld-servers.net"],
    "poolrentalnearme.co.uk":  ["nsa.nic.uk", "nsb.nic.uk", "dns1.nic.uk"],
    "poolrentalnearme.ca":     ["any.ca-servers.ca", "c.ca-servers.ca"],
    "poolrentalnearme.com.au": ["q.au", "r.au", "s.au"],
}
def ns_at_registry(domain, servers):
    for s in servers:
        p = subprocess.run(["dig", "+norecurse", "+time=5", "+tries=1", "NS", domain, "@" + s], capture_output=True, text=True)
        found = set()
        for line in p.stdout.splitlines():
            if line.startswith(";") or not line.strip(): continue   # comments and the question line
            f = line.split()
            if len(f) >= 5 and f[2] == "IN" and f[3] == "NS" and f[0].rstrip(".").lower() == domain:
                found.add(f[4].lower().rstrip("."))
        if found: return sorted(found)
    return None  # every registry server failed to answer; do not treat as a change
old = {}
try: old = json.load(open(STATE))
except Exception: pass
now = {}; changes = []
for d, servers in DOMAINS.items():
    cur = ns_at_registry(d, servers)
    if cur is None:
        now[d] = old.get(d); changes.append(f"{d}: registry did not answer (kept last known {old.get(d)})") if not old.get(d) else None; continue
    now[d] = cur
    if d in old and old[d] != cur:
        changes.append(f"{d}: {old[d]} -> {cur}" + ("" if any("cloudflare" in n for n in cur) else "   <-- NOT CLOUDFLARE ANY MORE"))
stamp = time.strftime("%FT%TZ", time.gmtime())
open(LOG, "a").write(f"[{stamp}] " + " | ".join(f"{d}={','.join(n) if n else '?'}" for d, n in now.items()) + (f"  CHANGES: {changes}" if changes else "  no change") + "\n")
json.dump(now, open(STATE, "w"), indent=1)
if not changes or not old:
    raise SystemExit(0)   # first run only records the baseline
env = {}
for l in open(H + "/nginx-smoke.env"):
    l = l.strip()
    if "=" in l and not l.startswith("#"):
        k, v = l.split("=", 1); env[k] = v
subject = "⚠️ PRNM nameservers changed: " + "; ".join(c.split(":")[0] for c in changes)
text = "Registry nameserver change detected by the hourly watchdog on WEST:\n\n" + "\n".join(changes) + \
       "\n\nIf a domain is no longer on Cloudflare, Hostinger has most likely reset it (a 'point domain to Hostinger' prompt). " \
       "Cloudflare will mark the zone moved and delete it after ~7 days. Fix: set the Cloudflare nameservers again at Hostinger.\n" \
       "Log: ~/ns-watchdog.log on WEST."
body = json.dumps({"from": env["ALERT_FROM"], "to": env["ALERT_TO"], "subject": subject, "html": "<pre>" + text + "</pre>", "text": text}).encode()
if os.environ.get("DRY_RUN"):
    print("DRY_RUN subject:", subject); print(text); raise SystemExit(0)
try:
    r = urllib.request.urlopen(urllib.request.Request("https://api.emailit.com/v2/emails", data=body,
        headers={"Authorization": "Bearer " + env["EMAILIT_API_KEY"], "Content-Type": "application/json"}), timeout=20)
    open(LOG, "a").write(f"  alert emailed HTTP {r.status}\n")
except Exception as e:
    open(LOG, "a").write(f"  alert send FAILED {e}\n")
