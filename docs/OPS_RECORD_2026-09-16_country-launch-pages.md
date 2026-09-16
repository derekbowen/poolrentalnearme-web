# Ops record 2026-09-16 — country launch pages, ccTLD redirects, app-safety findings for .com

Derek GO (all three) 2026-09-16 ~20:40Z after the preview screenshots.

## 1. Country launch template — fresh-web, deployed 20:52:15Z, SHA `748f2cc`

Trigger: Derek, on https://www.poolrentalnearme.co.uk/p/rent-out-your-pool-uk — "That's the
ugliest page I've ever seen. We need this to look like a pool rental site."

Cause: the nine `content_pages` rows with `template_type = country_launch` (hubs
`rent-out-your-pool-{uk,canada,australia}` and city pages london, manchester, toronto,
vancouver, sydney, melbourne) had no template. `p.$slug.tsx` fell through to
`GenericPageTemplate`: bare H1, byline, unstyled markdown. Every ccTLD root 302s to its hub,
so this was the front door of all three international domains.

Change (fresh-web `ops/deploy-sha-enforcement`, commits `0c30a74`, `281f873`, `748f2cc`):
- `src/components/templates/country-launch.tsx` — hero (paradise-hero asset, founding-host
  card), trust strip, money cards, hosting steps, city cards, stored body as "From the
  founder" (leading `# H1` stripped), live guide cards, `FounderBookingInline`, FAQ, gradient
  CTA. Every claim is from the row's own body or existing site copy. No earnings figures, no
  quotes, no insurance language. Marketplace CTAs are absolute `.com` URLs.
- `src/config/country-launch.ts` — market config (currency, cities, guide slugs) keyed by slug
  then locale.
- `src/server/country-launch.functions.ts` — server fn fetching the market's guide rows
  (title/description/cover) via `supabaseAdmin`.
- `src/lib/page-faqs.ts` — `country_launch` FAQ (visible + FAQPage JSON-LD through the
  existing dispatcher path). Five answers, all restating the body.
- `src/server/content-pages.functions.ts` — `country_launch` added to
  `ContentPageTemplateType` (check:types had refused the comparison, TS2367).

Preview method (reusable): throwaway git worktree on EAST (`/home/ubuntu/fw-preview`,
node_modules symlinked), `check:types` + `npm run build`, `serve.mjs` on :3006 with the
production `.env`, HTML+CSS pulled back in md5-verified 16 KB chunks, images inlined as
data URIs, screenshots with the sandbox Chromium (`/opt/pw-browsers/chromium`, headless,
min window width ~500px). Worktree and outputs removed after deploy.

Deploy: normal ritual via `ops/deploy-east.sh`, all gates PASS, drift check PASS.

## 2. ccTLD nginx — marketplace paths now 302 to .com (EAST, 20:53Z)

Finding: on `.co.uk`/`.ca`/`.com.au` every marketplace link in the site header
(`/s`, `/wizard/`, `/login`, `/signup`, `/l/*`) was a 404, because those routes only exist on
WEST and the ccTLD blocks proxy everything to fresh-web.

Change: `/etc/nginx/sites-enabled/intl.conf`, one `location ~` per ccTLD server block,
before `location = /`:
```
location ~ ^/(wizard|s|l|u|login|signup|account|inbox|listings|profile-settings|order|sale|recover-password|reset-password|verify-email)(/|$) {
    return 302 https://www.poolrentalnearme.com$request_uri;
}
```
Backup `/home/ubuntu/config-backups/intl.conf.bak-mktredirect-20260916-205341`. `nginx -t` ok,
reload. Verified per host: those paths → 302 to .com; `/`, `/p/*`, `/sitemap*.xml`,
`/robots.txt` unchanged. (`/api/*` deliberately not included; fresh-web owns its own `/api`.)

## 3. Content DB — three dead cover images (20:47Z)

`cover_image_url = https://www.poolrentalnearme.com/img/paradise-hero.webp` 404s on .com
(the file is in fresh-web `public/img/` but WEST only proxies `/`, `/p/`, `/fw-assets/` to
EAST). Rows updated to covers already used by their sibling-market pages:
`how-it-works-uk` → Unsplash photo-1519046904884 (same as how-it-works-australia);
`romantic-pool-escapes-australia` → the Wikimedia rooftop pool used by romantic-pool-escapes-uk;
`pool-rental-insurance-explained-canada` (in_sitemap=false) → the Unsplash cover used by the
UK insurance page. Guarded `WHERE cover_image_url = <dead url>`; 3 rows returned.

## 4. iOS/Android apps and the .com Cloudflare move — evidence (Derek: "don't crash the apps")

WEST timing log 2026-09-16 04:02–20:50Z, 40,463 requests, grouped by non-browser UA:
- **No Dart / Flutter / okhttp / CFNetwork app traffic to www.poolrentalnearme.com.** The apps
  talk to Sharetribe's API and Stripe directly. Cloudflare on .com cannot break in-app login,
  search, booking or payment.
- What .com provides to the app ecosystem (must never be challenged or rate-limited):
  `/.well-known/apple-app-site-association` (AASA-Bot), `/.well-known/assetlinks.json`
  (GoogleAssociationService), `/.well-known/openid-configuration` + `jwks.json` and
  `/api/socials-sign-in/*` (Apple/Google sign-in), `/api/off-session-payment/*` and Stripe's
  own fetches (UA `Stripe/1.0`), `/api/ical/*` (Google Calendar, Apple dataaccessd),
  `/api/{initiate,transition}-privileged`, `/api/transaction-line-items`, `/api/sms/inbound`,
  `/csp-report`, and web-view pages (`/p/learningacademy`, terms, privacy).
- App IDs served: iOS `Z7B9NW644Q.com.poolrentalnearme.app.prod`, Android
  `com.poolrentalnearme.app.prod` (from the live association files).

Therefore the .com recipe (not yet applied) differs from the country domains:
- NO Bot Fight Mode, NO JS challenge, NO browser integrity check on .com.
- WAF `skip` rule (all products) for `/.well-known/*`, `/api/*`, `/csp-report`,
  `/fw-assets/*`, `/assets/*`, `/tools/*`.
- Only: scanner-path block (same expression as .co.uk) and a per-IP page rate limit exempting
  `cf.client.bot` and the paths above.
- WEST nginx trusts `CF-Connecting-IP` (same snippet as EAST) before proxying; certbot
  `.well-known/acme-challenge` covered by the skip rule.
- Proxy one host at a time; watch WEST access log for 403/429 on the paths above; rollback =
  grey cloud.

## Still open
- .ca and .com.au: Derek changes nameservers at Hostinger (anna/max for .ca, angelina/norm for
  .com.au); then `cf_zone_rollout_template.py` stages activate → proxy → protect (same as .co.uk).
- .com: WEST real-IP snippet + the rules above, then proxy.
- EAST security group to WEST + Cloudflare ranges once all four are behind Cloudflare.
- Optional: serve the country hub at `/` on each ccTLD instead of a 302 (canonical + sitemap
  change in fresh-web).
