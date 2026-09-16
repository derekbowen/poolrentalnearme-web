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
| poolrentalnearme.co.uk | angelina.ns.cloudflare.com / norm.ns.cloudflare.com | 3 | 0 |
| poolrentalnearme.ca | anna.ns.cloudflare.com / max.ns.cloudflare.com | 3 | 0 |
| poolrentalnearme.com.au | angelina.ns.cloudflare.com / norm.ns.cloudflare.com | 3 | 0 |

Hostinger nameservers today on all four: ns1/ns2.dns-parking.com. **Not changed yet.**

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
