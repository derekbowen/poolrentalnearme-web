# Plan — moving poolrentalnearme.com behind Cloudflare without taking anything down

Status: PROPOSED, nothing executed. Derek's brief (2026-09-16): "The dot-com scares me. We
can't have this thing go down, and there's a lot of DNS records. Plan this out."
Also standing: "we have iOS and Android apps, don't crash them."

## What is true today (measured 2026-09-16 21:20Z)

| Fact | Evidence |
|---|---|
| Cloudflare zone for .com exists, Free plan, status pending, 61 records, all DNS-only | API from WEST |
| The 61 records are a verified copy of Hostinger's zone (record-by-record diff, identical; two Hostinger ALIAS records become CNAMEs to the same targets) | `ops/cloudflare/README.md`, reconciliation 2026-09-16 |
| DNSSEC: no DS record at the .com registry, Cloudflare DNSSEC disabled | `dig DS poolrentalnearme.com @a.gtld-servers.net` → none |
| Leftovers from the May attempt: SSL mode `full` (not strict), Always-HTTPS off, no page rules, Bot Fight Mode off, no WAF/rate/redirect/cache rules | API |
| **Unknown: Worker routes.** The account has an old `fresh-web` Worker (2026-05-03). The token cannot list Worker routes (auth error). A leftover route like `*poolrentalnearme.com/*` would hijack proxied traffic. | must be checked in the dashboard before step 4 |
| Hostinger keeps serving a moved zone (rollback works): `ns1.dns-parking.com` still answers for .co.uk hours after the switch | dig |
| Apps make no requests to www.poolrentalnearme.com; they use Sharetribe and Stripe directly | WEST timing log, 40k requests, zero Dart/okhttp/CFNetwork |
| What .com must keep serving unchallenged: `/.well-known/*` (AASA, assetlinks, openid, jwks, passkeys, acme), `/api/*` (Apple/Google sign-in, Stripe off-session, iCal, privileged transitions, Twilio inbound), `/csp-report`, `/fw-assets/*`, `/assets/*`, `/tools/*` | timing log UA analysis |
| WEST's own cron jobs call `https://www.poolrentalnearme.com/api/*`, `/jobs.xml`, `/s` ≈2,500 req/day from 13.56.113.85 | timing log |
| Slowest requests today ≈60 s (WEST→EAST proxy timeouts during the Supabase incident). Cloudflare Free cuts a response at 100 s → 524 | timing log |
| Origin cert: Let's Encrypt for www.poolrentalnearme.com to 2026-11-03; certbot renews `poolrentalnearme.com`, `www`, `update` on WEST via HTTP-01 | `/etc/letsencrypt/renewal` |
| WEST nginx has no Cloudflare real-IP config | grep |
| Subdomains that must stay DNS-only: mail (Hostinger MX + SPF/DKIM/DMARC), Emailit, Mailgun (`connect`), SendGrid (`em2761`), Intercom, `go` (Switchy), `help`, `learn`, `book`, `swimsuits`, `newhostes`, Lovable sites (`hostpro`, `es`, `memories`, `parcs`, `amenities`, `connect`), Hostinger sites (`host`, `designs`, `stage.host`, `ftp`), `test`, `update` | record list |

## What we will and will not do

- **Only `poolrentalnearme.com` and `www.poolrentalnearme.com` get proxied.** Every other
  record stays exactly as it is, grey-cloud. Email, short links, help centre, Lovable sites,
  Hostinger sites: untouched. Proxying `www` alone first, then the apex.
- **No Bot Fight Mode, no JS challenge, no browser integrity check on .com.** That is what
  would break universal links, Apple/Google sign-in, Stripe and calendar sync. The country
  domains have those because only browsers and crawlers visit them.
- **Nothing that changes bytes**: email obfuscation, Rocket Loader, Mirage, Polish, minify all
  off (same as the country domains). Cloudflare passes the HTML through.
- **No caching rules in this phase.** Cloudflare's default caches only static file types;
  pages and API stay DYNAMIC. Session cookies are never touched.
- **Free plan is enough for this phase.** Pro (Super Bot Fight Mode, more rate rules) is a
  later decision, not a prerequisite.

## Steps, in order, each reversible

Every step has a check; if the check fails we stop and roll back that step only.

**0. Pre-flight (Derek, dashboard, 5 minutes)**
- Cloudflare → Workers & Pages → `fresh-web` Worker → Settings → Triggers/Routes. If any route
  mentions poolrentalnearme.com, delete the route (not the Worker). Report what was there.
- Confirm the .com zone in the dashboard shows DNS → Records → 61 records, all grey clouds.

**1. Zone settings while still DNS-only (me, API, zero visitor impact)**
SSL `strict`, min TLS 1.2, Always-HTTPS on, obfuscation/Rocket/Mirage/Polish off, Bot Fight
Mode confirmed off, browser check off, security level medium. WAF rules created but they only
act on proxied traffic:
- Skip rule (all security products incl. rate limiting) for `/.well-known/*`, `/api/*`,
  `/csp-report`, `/fw-assets/*`, `/assets/*`, `/tools/*`, `/static/*`.
- Scanner-path block (same expression as the country domains).
- Rate limit: 60 page requests / 10 s per IP, verified bots exempt, block 10 s.
Check: settings read back as set; rules listed; zone still pending; site unchanged.

**2. WEST prep (me, nginx + hosts, no restart)**
- `/etc/nginx/conf.d/cloudflare-real-ip.conf`: `set_real_ip_from` for the 22 Cloudflare
  ranges + `real_ip_header CF-Connecting-IP` (same snippet as EAST). Harmless before
  proxying because only Cloudflare IPs are trusted. `nginx -t`, reload (file swap, no 502).
- `/etc/hosts` on WEST: `127.0.0.1 www.poolrentalnearme.com` so the ~2,500 daily cron
  requests keep hitting nginx locally and never depend on the edge. Check: a cron-style curl
  from WEST shows `remote=127.0.0.1` and the same responses; smoke test still PASS.
- Timing log kept; a grep for status 5xx and for `403|429` on the skip paths becomes the
  post-flip watch.

**3. Nameservers to Cloudflare, proxy still OFF (Derek at Hostinger, 2 minutes)**
Set `anna.ns.cloudflare.com` / `max.ns.cloudflare.com` on poolrentalnearme.com only. Nothing
changes for visitors: Cloudflare answers with the identical records. Check (me): zone active;
every record answers identically from Cloudflare vs Hostinger (same diff script as the
reconciliation); mail MX/SPF/DKIM answers identical; www resolves to 13.56.113.85.
Rollback: nameservers back to ns1/ns2.dns-parking.com (Hostinger still holds the zone).

**4. Wait for the Universal SSL edge certificate (me)**
Poll the edge with SNI until it presents a certificate for poolrentalnearme.com. Not before
the certificate exists (lesson from .com.au this afternoon). Check: openssl shows the cert.

**5. Proxy `www` only (me, API, one record)**
Orange-cloud `www.poolrentalnearme.com`. Immediately verify through the edge: `/s`,
`/login`, `/l/<a real listing>`, `/p/hosting` (proxied to EAST), `/api/transaction-line-items`
POST returns the same 400/401 JSON as the smoke test expects, `/.well-known/apple-app-site-association`
and `assetlinks.json` byte-identical to origin, `/fw-assets/__build.json` no-store, session
cookie `Secure`/`HttpOnly` flags unchanged, cf-ray present, no 403/429 in WEST's log on the
skip paths for 15 minutes. Rollback: grey-cloud `www` (seconds).

**6. Proxy the apex (me)**
Same checks; apex currently 301s to www and must keep doing so.

**7. Watch 24 h, then lock EAST's firewall** to WEST + Cloudflare ranges (the step that
actually stops scrapers from hitting EAST directly). Separate GO.

## What can still go wrong, and the answer

| Risk | Mitigation |
|---|---|
| Old Worker route hijacks traffic | Step 0 removes it; step 5 proxies one host and checks pages before the apex |
| Redirect loop (Flexible SSL) | SSL set to `strict` in step 1, before any proxying |
| Certificate error at the edge | Step 4 waits for the cert; nothing proxied until it exists |
| A skip path gets challenged or rate-limited | No bot mode on .com at all; skip rule covers the list; log grep in step 5 |
| Cron jobs from WEST trip the rate limit or depend on the edge | `/etc/hosts` pin in step 2 keeps them local |
| Long responses cut at 100 s | Those are already 60 s failures (WEST→EAST timeout); no new failure mode, but it appears as 524 instead of 504 in the log |
| Certbot renewal fails behind the proxy | HTTP-01 passes through Cloudflare; `/.well-known/*` is in the skip rule; next renewal is due before 2026-11-03, and a manual dry-run is part of step 5 |
| Mail breaks | Mail records never proxied; MX/SPF/DKIM answers diffed in step 3 |
| Anything unexpected | Grey cloud = instant; NS back to Hostinger = full rollback, Hostinger still serving the zone |

## Execution log

**Steps 1 and 2 done 2026-09-16 21:30–21:39Z (Derek GO).** Zone still pending, 0 proxied.
- Zone: ssl strict, min TLS 1.2, Always-HTTPS on, automatic HTTPS rewrites off, browser
  check OFF, obfuscation/Rocket/Mirage/Polish off, bot management confirmed off. WAF custom
  rules: (1) `skip` — ruleset current + phases http_ratelimit / http_request_sbfm /
  http_request_firewall_managed + products rateLimit, securityLevel, bic, hot, uaBlock,
  zoneLockdown, waf — for `/.well-known/`, `/api/`, `/csp-report`, `/fw-assets/`,
  `/assets/`, `/tools/`, `/static/`; (2) scanner block. Rate limit 60/10 s per IP, verified
  bots exempt, skip paths excluded again in the expression. All read back as set.
- WEST: `/etc/nginx/conf.d/cloudflare-real-ip.conf` (22 ranges, mirrored at
  `ops/cloudflare/west-nginx/`), nginx -t ok, reload; smoke PASS afterwards. `/etc/hosts`:
  `13.56.113.85 www.poolrentalnearme.com` (backup `config-backups/hosts.bak-orig-*`); the
  production container already had the same via `--add-host`, which is why its ~2,500
  daily self-calls never touch DNS.
- **New scheduled job:** `ns-watchdog` — ubuntu crontab `17 * * * *` runs
  `/usr/bin/python3 /home/ubuntu/ns-watchdog/ns-watchdog.py` (mirror
  `ops/monitors/west/ns-watchdog.py`). Asks each TLD registry for the four domains'
  nameservers, logs every run to `~/ns-watchdog.log`, emails Derek via Emailit only when a
  set changes from the previous run. Baseline recorded 21:39Z.
- **Incident during the test:** the alert path was exercised with a faked previous state
  under `DRY_RUN=1`, but `sudo -u ubuntu` dropped the variable, so one real email went to
  Derek at 21:39Z: subject "⚠️ PRNM nameservers changed: poolrentalnearme.ca", body
  showing .ca dns-parking → Cloudflare (true, but a test). Nobody else received anything.

## What I need from Derek
1. Step 0 (Worker routes) — or extend the `prnm-edge` token with "Workers Routes: Read" so I
   can check it myself.
2. What went wrong "last time" on Cloudflare, if you remember any symptom (redirect loop, cert
   warning, blank pages, email). It changes nothing in the plan but tells me what to test first.
3. GO for steps 1–2 (no visitor-facing change), then GO for step 3 when you're at Hostinger.
