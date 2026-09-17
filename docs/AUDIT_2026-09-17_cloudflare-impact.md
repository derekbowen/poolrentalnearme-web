# POOLRENTALNEARME.COM — CLOUDFLARE IMPACT AUDIT

Read-only. Nothing was changed: no cache purge, no DNS edit, no setting toggled,
no deploy, no nginx change, no rule edit.

## CLOUDFLARE VERDICT

**MODEST BENEFIT — real and measurable on bandwidth and cached-page latency,
but the security objective that motivated the move is currently defeated by an
exposed origin, and the observation window is too short for SEO conclusions.**

Two things are true at once:

1. On bandwidth and on time-to-first-byte for public SEO pages, the evidence is
   strong and consistent. Origin bytes per request fell by half; cached pages
   answer 3–7× faster.
2. The reason Derek gave for installing it ("don't let the server go down") is
   **not actually secured**. Our own DNS publishes the origin IP and the origin
   accepts direct traffic, so every edge protection can be walked around.

Confidence is limited by two gaps stated up front:

- The API token lacks `analytics.read`, so **no Cloudflare edge-side numbers
  were available**: no edge request totals, no true zone cache-hit ratio, no
  firewall event counts, no edge bandwidth. Everything below is measured at the
  origin or by direct probing.
- Cloudflare became authoritative 2026-09-16 22:00Z, so there are ~13.9 days of
  "before" and only ~1.9 days of "after". The 7/14/28-day matched windows asked
  for are impossible. Day-of-week effects are not controlled.

## PHASE 1 — TRAFFIC PATH (proven)

```
USER / BOT → Cloudflare edge (anna/max.ns.cloudflare.com)
           → WEST origin 13.56.113.85 : nginx
           → marketplace app (docker, :3000) for /s /login /l/* /account/*
           → EAST origin 3.222.110.146 : fresh-web (pm2) for / and /p/* and /fw-assets/*
```

| item | value |
|---|---|
| Zone | `poolrentalnearme.com`, id f153ae5162eb55f788ee0956ef0f3d7a, **Free plan**, type full |
| Nameservers | anna.ns.cloudflare.com, max.ns.cloudflare.com |
| Created / activated | 2026-09-16T19:29:50Z / **2026-09-16T22:00:56Z** |
| DNS records | 61 total, **2 proxied** (apex + www → 13.56.113.85), 59 DNS-only |
| SSL | strict, min TLS 1.2, TLS 1.3 on, Always Use HTTPS on |
| HTTP/2 | on. **HTTP/3 on** (`alt-svc: h3=":443"; ma=86400` confirmed live) |
| Compression | Brotli on. Live: gzip, **br** and **zstd** all observed |
| Early Hints | **off** |
| Rocket Loader / Mirage / Polish / WebP | **all off** |
| Always Online | **off** |
| Tiered Cache / Argo / Cache Reserve | **off / unavailable on Free** |
| 0-RTT | off. Opportunistic encryption on |
| Cache level | aggressive. Browser cache TTL 14400s |
| Security level | medium. Browser check off. Challenge TTL 1800 |
| Bot Fight Mode | **off on .com** (deliberate, for the iOS/Android apps) |
| AI bots protection | disabled (deliberate, AI crawlers welcome) |
| Page rules | 0 |
| Transform / redirect / origin / response-header rules | 0 of each |
| Workers routes | token cannot read; no Worker behaviour observed in any response |

**Active rules, all four in the custom firewall phase:**

1. `skip` ALL security for `/.well-known/`, `/api/`, `/csp-report`, `/fw-assets/`,
   `/assets/`, `/tools/`, `/static/` — protects the mobile apps and payments.
2. `block` junk crawlers by user agent.
3. `block` scanner paths (`.php`, `/.env`, `/.git`, `/wp-`, `/xmlrpc`, …).
4. `skip` the rate-limit phase for 3.222.110.146 and 13.56.113.85 (our own
   deploy verifier and smoke checks) — scoped to `phases: ["http_ratelimit"]`
   only, nothing else.

**Rate limiting:** 60 requests / 10s per IP+colo, verified bots exempt, app and
asset paths exempt.

**Cache rule (one):** GET, no `st-authinfo` cookie, paths `/`, `/p/*` (minus
affiliate/privacy-request/waitlist-signup), `/public-pools/*`, `/sitemap*`,
`/robots.txt` → edge TTL **600s override**, browser TTL respect-origin,
stale-while-updating enabled.

## PHASE 2 — CUTOVER TIMESTAMP

**Defensible cutover: 2026-09-16 22:00:56Z**, from the zone's own `activated_on`
field, corroborated by the ops record of the nameserver change and by the
origin log profile shifting on the same boundary. Zone was created at 19:29Z, so
the narrowest honest window for "the edge started carrying traffic" is
19:29Z–22:01Z on 2026-09-16.

## PHASES 3–4 — ORIGIN LOAD (WEST access.log, 14 days)

Daily origin requests and bytes:

| day | requests | bytes |
|---|---:|---:|
| 09-04 … 09-15 (12 days, pre) | mean **45,874** | mean **1,926 MB** |
| 09-16 (cutover at 22:00Z) | 58,517 | 962.7 MB |
| 09-17 (first full post day) | **36,508** | **703.1 MB** |

- **Origin requests −20%** vs the pre-period mean. Not conclusive on its own:
  the pre-period range was 35,978–83,697, so 36,508 sits inside normal variance.
- **Origin bytes −63.5%** vs the pre-period mean. Far outside normal variance.

The normalized metric controls for traffic volume and is the strongest single
number in this audit:

| metric | before | after | change |
|---|---:|---:|---:|
| bytes per origin request | 39.7 KB | **19.1 KB** | **−51.9%** |

Request mix explains it. Cloudflare is absorbing static assets, leaving origin
to do proportionally more HTML:

| type | before | after |
|---|---:|---:|
| HTML | 57.3% | 78.2% |
| JS | 26.0% | **11.1%** |
| CSS | 4.8% | **2.1%** |
| `.env` + `.php` scanner probes | 2.5% | ~0% |

JS+CSS requests per hour reaching origin fell from roughly 400/h (09-16
pre-cutover hours) to roughly 130/h (09-17 settled hours), about **−67%**.

**Estimated origin offload: cannot be stated as an edge-vs-origin ratio**
because edge counters are unreadable. What is provable is that origin now
carries half the bytes per request and a third of the static-asset requests.

**Server headroom:** WEST load average 0.09/0.05/0.07, 1.4 GB of 3.8 GB used.
EAST load average 0.00, fresh-web at 1.2% CPU and 222 MB. **Neither box was
under load pressure before or after.** Cloudflare is not rescuing a saturated
server; it is reducing bandwidth on an idle one.

## PHASE 5 + 16 — CACHE EFFECTIVENESS AND HTML CACHING

Measured by direct probe, two passes (cold then warm):

| URL | pass 1 | pass 2 | TTFB 1 | TTFB 2 | change |
|---|---|---|---:|---:|---:|
| `/` | HIT (age 98) | HIT | 0.498s | 0.177s | −64% |
| `/p/rent-out-your-pool-uk` | MISS | **HIT** | 1.078s | 0.150s | **−86%** |
| `/p/pool-host-tools` | EXPIRED | **HIT** | 0.789s | 0.207s | −74% |
| `/public-pools/california/fullerton` | MISS | **HIT** | 0.501s | 0.365s | −27% |
| `/robots.txt` | REVALIDATED | HIT | 0.523s | 0.210s | −60% |
| `/sitemap.xml` | UPDATING (age 1783) | HIT | 0.221s | 0.180s | −19% |
| `/tools/cta.js` | REVALIDATED | HIT | 0.472s | 0.150s | −68% |
| `/tools/home.js` | REVALIDATED | HIT | 0.456s | 0.193s | −58% |
| `/fw-assets/email/prnm-logo-240.png` | HIT (age 37,801) | HIT | 0.203s | 0.222s | — |

**HTML caching verdict: GOOD but UNDERUTILIZED.** Every public SEO surface
caches correctly and serves from the edge. Two limits:

- `/public-pools/*` sends `s-maxage=3600` from origin, but the cache rule
  overrides edge TTL to **600s**. We are discarding 83% of the TTL the
  application itself says is safe.
- `/` and `/p/*` send **no `Cache-Control` at all** from origin. They cache only
  because the rule forces it. Browsers get no caching directive.

**Compression is working well** (this initially looked absent; that was a probe
error, corrected):

| URL | uncompressed | transferred | saved |
|---|---:|---:|---:|
| `/` | 104,545 B | 27,924 B | **−73%** |
| `/p/rent-out-your-pool-uk` | 72,321 B | 18,433 B | −75% |
| `/tools/cta.js` | 15,236 B | 5,631 B | −63% |
| `/public-pools/…/fullerton` | 32,863 B | 11,968 B (zstd) | −64% |

## PHASE 17 — API CACHE SAFETY: **PASS**

| URL | CF-Cache-Status | sets cookie |
|---|---|---|
| `/s` (marketplace search) | DYNAMIC | yes |
| `/login` | DYNAMIC | yes |
| `/account/payments` (Stripe payout onboarding) | DYNAMIC | yes |
| `/api/public/hooks/daily-seo-digest` | DYNAMIC (401) | no |

No authenticated or user-specific content is cached. The cache rule is scoped to
GET plus absence of the `st-authinfo` session cookie, and `/api/*` is excluded
from caching by path. **No cache rule is broad enough to capture authenticated
content.** This is the check that most often goes wrong, and here it is correct.

## PHASES 6–7 — PERFORMANCE AND ORIGIN TIMING

From `prnm_timing.log` (2026-09-16T04:02 → 2026-09-17T23:49, spans the cutover):

| metric | before (n=42,774) | after (n=38,660) |
|---|---:|---:|
| request_time p50 | 0.013s | 0.308s |
| request_time p90 | 0.681s | 0.862s |
| request_time p99 | **3.984s** | **2.292s** |

**Read this carefully. The median rise is a composition effect, not a
regression.** Before the cutover the origin served a flood of cheap static
assets answering in ~13 ms. Those now terminate at the edge, so what remains at
origin is disproportionately expensive HTML (78.2% of requests versus 57.3%).
The median of the surviving work is naturally higher.

The honest conclusion: **Cloudflare did not make origin processing faster. It
reduced how much the origin does, and it improved the tail** (p99 down 42%).
Slow requests remain app-side, not edge-side.

Slowest origin routes (p50 / p90):

| route | p50 | p90 | n |
|---|---:|---:|---:|
| `/jobs.xml` | 0.751s | 1.612s | 535 |
| `/p/*` | 0.533s | 1.280s | 25,622 |
| `/l/*` | 0.504s | 0.915s | 916 |
| `/` | 0.576s | 0.900s | 1,729 |

**Field data (CrUX, Search Console Core Web Vitals, RUM): not accessible from
this session.** No LCP, INP or CLS numbers are claimed.

## PHASE 9 — ERRORS AND AVAILABILITY

| class | before | after |
|---|---:|---:|
| 2xx | 81.47% | 81.82% |
| 3xx | 8.35% | 9.94% |
| 4xx | **10.06%** | **7.99%** |
| 5xx | **0.12%** | **0.24%** |

The 4xx improvement is the scanner-path block working. The 5xx doubling looks
bad and is **not** Cloudflare's doing: of 100 post-cutover 5xx, **90 landed in a
single hour (09-17 04:00Z)** during my own deploys, and the top offenders are
scanner probes (`/index.php`, `/alfa.php`, `/222.php`, `/wp-content/...`)
getting 502 from an origin with no PHP backend. Genuine user-facing 5xx in the
whole post window: **two `502 /`, one `500 /`, two `_serverFn` errors.**

No Cloudflare-origin error codes (520–526) were observed at any point.
**Always Online is off**, so Cloudflare would not mask an origin outage today.

## PHASE 10 — GOOGLEBOT: **NO HARM DETECTED**

| metric | before (13.9 d) | after (1.07 d) |
|---|---:|---:|
| hits at origin | 8,590 (≈618/day) | 401 (≈375/day) |
| 200 rate | 75.7% | **81.3%** |
| 404 count | 985 (**11.5%**) | 17 (**4.2%**) |
| 499 aborted | 138 | **0** |
| 5xx | 1 | **0** |
| 403 / 429 / challenge | 0 | **0** |

**Googlebot is not being challenged, blocked, rate-limited or slowed.** Verified
bots are explicitly exempt from the rate-limit rule, Bot Fight Mode is off on
.com, and no 403 or 429 reached Googlebot. Its 404 rate improved sharply.

Origin-side Googlebot volume is down ~39%, which has two innocent explanations
(edge absorbing crawls; a 1-day sample) and one that cannot yet be excluded
(reduced crawl demand). **1.07 days is far too short to call this.** Post-cutover
Googlebot non-200s are ordinary: trailing-slash 301s on `/public-pools/*`,
304s on `/tools/*.js` and `/robots.txt`, two 404s on `/icon-512.png`.

Bingbot: 8,941 before, 549 after (≈513/day vs ≈643/day). Same caveat.

## PHASE 11 — SEARCH CONSOLE: **NO DATA**

Search Console is not accessible from this session. No crawl stats, index
coverage, clicks, impressions, CTR or position data was retrieved. **No ranking
claim is made in either direction.** With 1.9 days elapsed, any ranking movement
observed now would not be attributable to this change regardless.

## PHASES 12–13 — STATIC ASSETS AND IMAGES

| asset class | Cache-Control | edge behaviour |
|---|---|---|
| `/fw-assets/email/*.png` | `public, max-age=31536000, immutable` | HIT, age 37,801s. Correct |
| `/tools/*.js` | `public, max-age=14400, must-revalidate` | REVALIDATED then HIT |
| `/public-pools/*` HTML | `public, max-age=600, s-maxage=3600` | HIT, but edge TTL forced to 600 |
| `/` and `/p/*` HTML | **none** | HIT only via the rule |

`must-revalidate` on `/tools/*.js` forces a revalidation round trip on every
expiry. These are versioned tool scripts; they could be cached far harder.

**Image optimisation is entirely off**: Polish off, WebP off, Mirage off. On the
**Free plan these are not available**, so this is a plan limitation, not a
misconfiguration. Measured image bytes saved by Cloudflare image features:
**zero**. The only image win is ordinary edge caching.

## PHASE 14 — SECURITY VALUE

Edge-side blocked-request counts are **unreadable** (no analytics permission), so
I cannot quantify blocked volume. What is provable from origin logs:

- Scanner probes (`.php`, `/.env`) fell from **2.5% of origin requests to
  effectively zero**, and origin 4xx fell from 10.06% to 7.99%.
- Junk-crawler user agents are blocked at the edge by rule.
- Rate limiting is configured at 60 req/10s per IP, with verified bots exempt.

Real security events versus normal bot traffic cannot be separated without edge
analytics. Googlebot and Bingbot are correctly **not** treated as malicious.

**And then the finding that undercuts all of it — see below.**

## PHASE 15 — FALSE POSITIVES: **NONE FOUND**

No evidence of blocked customers, hosts, Stripe, Sharetribe, Supabase, webhooks
or APIs. `/api/*` and `/fw-assets/*` skip all security products by rule. No 403
or 429 spikes appear in origin logs post-cutover. Googlebot clean. The one
false positive that did occur was **ours**: the rate limit blocked our own
deploy verifier on 2026-09-17, which is why the IP-skip rule exists.

## MISCONFIGURATIONS

### P0 — the origin is exposed, so every edge protection is optional

Two independent proofs:

1. **Our own DNS publishes the origin IP.** `update.poolrentalnearme.com` is an
   **unproxied A record pointing at 13.56.113.85**, the WEST origin. Anyone can
   `dig` it. `test.poolrentalnearme.com` (13.56.89.89) and
   `help-test.poolrentalnearme.com` (54.219.198.117) similarly expose infrastructure.
2. **The origin serves the real site to direct traffic.** A request to
   `https://13.56.113.85` with SNI `www.poolrentalnearme.com` returns **200 with
   the live site**. EAST answers **200 on port 80** to the open internet.

Consequence: the WAF rules, the junk-crawler block, the rate limit and the DDoS
protection are all trivially bypassable. **The specific outcome Cloudflare was
installed to prevent — the origin being overwhelmed — is still fully available
to any attacker who reads one DNS record.** This is not theoretical; scanner
traffic is already reaching the origin.

### P1 — `/public-pools/*` edge TTL is 6× shorter than the app permits

Origin says `s-maxage=3600`; the cache rule overrides to 600s. These are pSEO
pages that change rarely.

### P1 — `/` and `/p/*` send no `Cache-Control`

Edge caching works only because the rule forces it. Browser caching gets no
directive, and any future cache-rule change silently stops caching them.

### P2 — a 404 is being cached at the edge

`.com/sitemap-country.xml` returns **404 and is cached** (61 KB, HIT on second
pass) because `/sitemap*` is in the cache rule. The ccTLDs correctly return 200
for this path, so the .com 404 is expected behaviour, but caching a 404 for
10 minutes is not.

### P2 — `must-revalidate` on `/tools/*.js` forces needless round trips

### P3 — features that are off and could be evaluated

Early Hints off, Tiered Cache off, Always Online off, 0-RTT off. Polish, WebP
and Mirage are unavailable on the Free plan.

## TOP ROUTES WHERE CLOUDFLARE HELPS MOST (evidence)

1. `/p/*` pSEO pages — 25,622 origin samples at p50 0.533s / p90 1.280s; edge HIT serves in **0.150s (−86%)**
2. `/` homepage — origin p50 0.576s; edge HIT **0.177s**, observed age 98–107s
3. `/tools/cta.js` — 0.472s → **0.150s**, and Googlebot now gets 304s
4. `/fw-assets/*` images — `immutable`, HIT at age 10.5 hours, never touching origin
5. `/public-pools/*` — MISS 0.501s → HIT 0.365s
6. `/robots.txt` — 0.523s → **0.210s**, hit by every crawler
7. `/sitemap.xml` — served from edge with stale-while-revalidate
8. All JS/CSS — origin share fell 30.8% → 13.2%
9. Scanner paths — `.php` and `.env` probes blocked before reaching origin
10. Junk crawler user agents — blocked at the edge

## TOP ROUTES WHERE CLOUDFLARE IS UNDERUTILIZED

1. `/public-pools/*` — TTL capped at 600s when origin permits 3600s
2. `/l/*` marketplace listing pages — p50 0.504s, 916 samples, **not in the cache rule** at all despite being public and SEO-relevant for anonymous visitors
3. `/jobs.xml` — **slowest route measured** (p50 0.751s, p90 1.612s), not cached
4. `/sitemap-pages-*.xml` — several at p90 0.8–1.3s, cached only 600s
5. `/` and `/p/*` — no origin `Cache-Control` to respect
6. `/tools/*.js` — `must-revalidate` prevents clean long-lived caching
7. Images generally — no Polish/WebP (Free plan limit)
8. Early Hints — off; would help LCP on `/p/*`
9. Tiered Cache — off; would cut origin fetches on a multi-colo crawl
10. Always Online — off; would mask an origin outage for static pages

## SEO VERDICT

- **Did it improve crawl efficiency?** Directionally yes, not yet provable.
  Googlebot's 404 rate fell 11.5% → 4.2%, aborted connections went 138 → 0, and
  `robots.txt` and sitemaps now serve from the edge. The window is 1.07 days.
- **Did it reduce Googlebot response time?** For cached paths, yes:
  `robots.txt` −60%, `/p/*` −86% on a hit. Not separately measured for Googlebot.
- **Did it introduce crawler errors?** **No.** Zero 403, zero 429, zero
  challenges, zero 5xx to Googlebot post-cutover.
- **Is it likely helping Core Web Vitals?** Plausibly, via TTFB and Brotli, but
  **no field data was accessible**, so this is unproven.
- **Any evidence of ranking improvement?** **None, and none should be expected
  yet.** Do not attribute ranking movement to this change.

## INFRASTRUCTURE VERDICT

- **Reducing load on WEST/EAST?** Bandwidth yes, materially (−52% bytes per
  request). CPU no — neither box was ever loaded. Load averages are 0.09 and 0.00.
- **Reducing bandwidth?** Yes. ~1,223 MB/day saved at current volume, roughly
  **37 GB/month** of origin egress.
- **Improving resilience?** Partially. Caching and rate limiting help, but with
  the origin directly reachable, resilience against a determined attacker is
  **not** established.
- **Worth keeping?** **Yes.** It costs $0 on the Free plan, it halves origin
  bytes, it makes public SEO pages several times faster, and it has caused no
  crawler or customer harm. But it is currently doing about half the job it was
  installed to do.

## PHASE 19 — COUNTERFACTUAL: REMOVE CLOUDFLARE TOMORROW

| dimension | expected effect |
|---|---|
| Origin bytes | roughly doubles, back to ~1.9 GB/day |
| Static asset requests | roughly triples at origin |
| TTFB on public pages | 0.15–0.21s → 0.50–1.08s for every visitor |
| CPU / uptime | little change; both boxes are idle |
| Bot traffic | junk crawlers and scanner probes return to origin (~2.5% of requests) |
| Security | loses WAF, rate limiting, DDoS absorption — though today these are bypassable anyway |
| SEO crawling | Googlebot returns to slower origin responses; no structural breakage |

Removing it would be a clear regression on bandwidth and page speed, and a
modest one on security. **Do not remove it.**

## RECOMMENDED NEXT ACTIONS — NOT IMPLEMENTED

Ordered by return on effort. None of these were carried out.

### 1. Close the origin (P0)
- **Change:** delete or proxy `update.poolrentalnearme.com`; then restrict the
  WEST and EAST security groups to Cloudflare's published IP ranges plus our own
  admin access.
- **Benefit:** makes every existing edge protection actually binding.
- **Risk:** **high if done carelessly** — a wrong security group locks us out or
  breaks the WEST→EAST proxy hop and the deploy verifier. Must be staged.
- **SEO impact:** none if done correctly.
- **Rollback:** restore the previous security group rules; both are one API call.
- **Evidence:** `https://13.56.113.85` with SNI returns 200 live; EAST returns
  200 on port 80; `update.poolrentalnearme.com` A → 13.56.113.85 unproxied.

### 2. Raise `/public-pools/*` edge TTL to match the app (P1)
- **Change:** edge TTL 600s → 3600s for that path prefix.
- **Benefit:** ~6× fewer origin fetches on the largest public page set.
- **Risk:** low. Content changes rarely; stale-while-updating already on.
- **Rollback:** set the value back.
- **Evidence:** origin already sends `s-maxage=3600`.

### 3. Add `Cache-Control` at the origin for `/` and `/p/*` (P1)
- **Change:** emit `public, max-age=300, s-maxage=3600` from fresh-web.
- **Benefit:** browser caching, and edge caching that survives rule changes.
- **Risk:** low.
- **Rollback:** remove the header.
- **Evidence:** both currently send no `Cache-Control`.

### 4. Exclude non-200 responses from the cache rule (P2)
- **Evidence:** `.com/sitemap-country.xml` 404 is cached, 61 KB, HIT.

### 5. Consider caching `/l/*` for anonymous visitors (P2)
- **Benefit:** 916 samples at p50 0.504s; public listing pages are SEO surface.
- **Risk:** **must** retain the `st-authinfo` bypass so logged-in hosts never see
  a cached page. Test carefully before enabling.

### 6. Enable Early Hints and evaluate Tiered Cache (P3)

### 7. Grant the API token `Analytics:Read` (P3)
- Without it, no future audit can measure edge requests, true cache-hit ratio,
  edge bandwidth or blocked-threat counts. **This is the single change that would
  most improve the next audit.**

## WHAT I COULD NOT MEASURE

- Cloudflare edge analytics: requests, cache-hit ratio, bandwidth, firewall
  events, bot scores. Token lacks `analytics.read`.
- Search Console: crawl stats, index coverage, clicks, impressions, position.
- CrUX / field Core Web Vitals: LCP, INP, CLS.
- Any 7/14/28-day matched comparison: only 1.9 days of "after" exist.
- Per-URL edge cache-hit ratios across real traffic (only direct probes).
