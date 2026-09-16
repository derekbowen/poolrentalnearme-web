# Cloudflare edge migration — state as of 2026-09-16

Goal (Derek GO 2026-09-16): every PRNM domain enters through Cloudflare (bots, rate limits,
TLS, cache), the country domains stop resolving straight to EAST, EAST is then locked to
WEST + Cloudflare. App fixes (404 DB writes, footer cache, homepage stale cache) run alongside.
Background: `docs/OPS_RECORD_2026-09-16_timing-log-cron-stagger.md` and the 2026-09-16
Supabase outage analysis (crawler on .co.uk → EAST → 15k DB calls in 4 min).

## Account / token
- Cloudflare account: Derekbowencorp@gmail.com's Account (also holds carnivalmanagerpro.com,
  founders.click, poolhostpro.com, poolrentalmarketplace.com and three Workers incl. an old
  `fresh-web` Worker from 2026-05-03 — the Lovable-era attempt; not serving anything).
- API token `prnm-edge`: zone-scoped (Zone Read, DNS/Zone Settings/Cache Rules/Firewall
  Services/Zone WAF/Bot Management/Origin Rules/Config Rules Edit, Account Settings Read),
  IP-locked to WEST 13.56.113.85, expires 2026-12-15. Lives ONLY in WEST
  `/home/ubuntu/cloudflare/cf.env` (ubuntu, 0600). It cannot create zones (by design).

## Zones (all Free plan, added by Derek via dashboard 2026-09-16, status pending)
| zone | Cloudflare nameservers | records | proxied |
|---|---|---|---|
| poolrentalnearme.com | anna.ns.cloudflare.com / max.ns.cloudflare.com | 61 | 0 |
| poolrentalnearme.co.uk | angelina.ns.cloudflare.com / norm.ns.cloudflare.com | 3 | 2 (apex+www, since 2026-09-16 19:53Z) |
| poolrentalnearme.ca | anna.ns.cloudflare.com / max.ns.cloudflare.com | 3 | 0 |
| poolrentalnearme.com.au | angelina.ns.cloudflare.com / norm.ns.cloudflare.com | 3 | 0 |

Nameservers: .co.uk moved to Cloudflare 2026-09-16 19:49Z (Derek, Hostinger hPanel), zone active 19:50:45Z. .com/.ca/.com.au still ns1/ns2.dns-parking.com.

## DNS reconciliation (done 2026-09-16, API from WEST)
Cloudflare's scan found 19 of 60 .com records and proxied 11 of them. All 60 records from
the Hostinger export (`hostinger-export-2026-09-16.json`, source: Hostinger hPanel via
Claude in Chrome) are now present, everything DNS-only, TTLs as at Hostinger. Kept one
extra Cloudflare-scanned record (`A host → 195.35.35.244`, which Hostinger serves live but
does not list). `AAAA host` set to Hostinger's live answer, not the panel value.
Record-by-record diff Cloudflare NS vs Hostinger NS: identical except the two Hostinger
ALIAS records (`stage.host`, `designs`), which Hostinger flattens to its own IPs and
Cloudflare serves as CNAMEs to the same `cdn.hstgr.net` targets. Functionally equivalent;
both are Hostinger-hosted side sites.

## Rollout order
1. Derek: Hostinger → poolrentalnearme.co.uk → nameservers → angelina/norm. Proxy stays OFF.
   Wait for zone "active". Nothing changes for visitors (same A records).
2. Proxy ON for .co.uk apex+www. SSL mode Full (strict). Watch a day. Then bots/rate rules.
3. Same for .ca, .com.au. Then .com (Pro plan first: verified-bot allowance, better WAF).
   .com bypass rules BEFORE proxying: /s, /l/*, /login, /account/*, /api/*, checkout,
   anything with Set-Cookie; /fw-assets/__build.json no-store; webhooks (Stripe/Twilio/
   Sharetribe) allowlisted; WEST nginx trusts CF-Connecting-IP; certbot .well-known bypass.
4. EAST security group: 80/443 only from WEST + Cloudflare ranges.
Rollback at any point: proxy OFF (grey cloud) or nameservers back to Hostinger.

## .co.uk proxied — 2026-09-16 19:53Z (Derek GO)
- EAST nginx: `snippets/cloudflare-real-ip.conf` (22 Cloudflare ranges + `real_ip_header CF-Connecting-IP`)
  included from nginx.conf http block; backup `config-backups/nginx.conf.bak-realip-*`. Logs show
  visitor IPs again.
- Zone settings: SSL Full (strict) against EAST's Let's Encrypt cert (valid to 2026-11-04), min TLS 1.2,
  Always Use HTTPS on. Email obfuscation, Rocket Loader, Mirage, Polish, minify all OFF so the edge
  serves byte-identical HTML to the origin (obfuscation had rewritten support@ and injected a script).
- Verified: cf-ray present, apex 302 → /p/rent-out-your-pool-uk unchanged, page 200 identical bytes,
  robots.txt/sitemap-country.xml 200, http→https 301, edge cert Let's Encrypt via Cloudflare, no 5xx on EAST.
- Not yet on .co.uk: bot rules, rate limits, cache rules (cf-cache-status DYNAMIC on pages). Next after a
  day of observation.

## .co.uk protection — 2026-09-16 20:10Z (Derek GO)
- **WAF custom rule** `prnm: block scanner/garbage paths`: `.php`, `/.env*`, `/.git*`, `/wp-*`, `xmlrpc`,
  `/actuator*`, `phpinfo`, `/cgi-bin*`, `/.aws`, `/vendor/phpunit`, `/dns-query`, `/resolve`, `/query`,
  `/fw-assets/fw-assets/*` → 403 at the edge. Verified: all probe paths 403, real pages 200.
- **Rate limit** (Free-plan shape): per IP+colo, 60 requests / 10 s on anything except `/fw-assets/*` and
  `/static/*`, block 10 s, `cf.client.bot` (verified crawlers) exempt. Verified with Bot Fight Mode
  briefly off: 100-request burst → 60×200 + 40×429 (`retry-after: 9`), 200 again after cooldown; EAST saw
  only the allowed 60.
- **Bot Fight Mode** on (requires JavaScript Detections on; that injects Cloudflare's small
  `challenge-platform` script into HTML pages — the one deliberate deviation from byte-identical HTML).
  It challenges non-browser clients (curl from WEST gets 403 `cf-mitigated: challenge`); verified
  bots (Googlebot/Bingbot) pass; real browsers pass the invisible JS check. Consequences to remember:
  SEO tools (Semrush/Ahrefs/Linkup) and any curl-based monitor get challenged on this zone. **Do NOT
  replicate Bot Fight Mode on .com as-is** — it would challenge the smoke monitor, deploy gates,
  UptimeRobot/Sentry, and server-to-server webhooks. .com needs Pro + Super Bot Fight Mode with WAF skip
  rules, or no bot mode at all.
- Not yet: cache rules (pages still `cf-cache-status: DYNAMIC`).

## 2026-09-16 20:53Z — ccTLD marketplace-path redirects + the .com app-safety recipe
See `docs/OPS_RECORD_2026-09-16_country-launch-pages.md` §2 and §4. Short version for .com:
no Bot Fight Mode / JS challenge / browser check; a WAF skip for `/.well-known/*`, `/api/*`,
`/csp-report`, `/fw-assets/*`, `/assets/*`, `/tools/*`; scanner block + verified-bot-exempt
rate limit only; WEST trusts CF-Connecting-IP first; proxy apex+www only (mail, go., hostpro.,
help. stay DNS-only). Evidence: no app traffic hits .com; universal links, Apple/Google
sign-in, Stripe, iCal all do.
