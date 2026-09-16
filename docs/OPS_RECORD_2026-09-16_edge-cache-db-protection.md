# Ops record 2026-09-16 — edge cache + database protection (Derek GO "2 and 3", ~22:25Z)

Follows `docs/PLAN_2026-09-16_cloudflare-dotcom.md` (all four domains behind Cloudflare).

## 1. Cloudflare cache rule — all four zones, 22:35Z

Phase `http_request_cache_settings`, one rule per zone:
```
(http.request.method eq "GET") and (not (http.cookie contains "st-authinfo")) and (
  (http.request.uri.path eq "/")
  or (starts_with(http.request.uri.path, "/p/") and not starts_with(…, "/p/affiliate")
      and not starts_with(…, "/p/privacy-request") and not starts_with(…, "/p/waitlist-signup"))
  or starts_with(http.request.uri.path, "/public-pools/")
  or starts_with(http.request.uri.path, "/sitemap")
  or (http.request.uri.path eq "/robots.txt"))
→ cache: true, edge TTL override 600 s, browser TTL respect origin, stale-while-updating on
```
Why `st-authinfo`: the root loader renders the header's logged-in state from exactly that
cookie (`sharetribe-session.functions.ts`), so a request carrying it bypasses the cache;
the anonymous `st-<client>-token` cookie every visitor gets does NOT bypass (verified: same
bytes with and without it). Origin sends no Cache-Control on these pages, hence the override.
Verified via the edge: .com `/p/hosting`, a city page, `/` and a public-pools page MISS → HIT
with identical bodies; a `st-authinfo` request DYNAMIC; .co.uk hub and London MISS → HIT
(Bot Fight Mode paused for ~60 s for the test, then re-enabled and read back on).
First check read DYNAMIC everywhere because the header probe was a HEAD request, which a
GET-only rule never matches; the rule was fine.

Traffic context (WEST timing log, today): `/p/*` 9,588 of 43,815 requests, `/public-pools`
2,581, `/` 740. With the rule, a crawler burst over the content pages is served from the edge
after the first hit per URL per 10 minutes.

## 2. Supabase pg_cron — eight dead jobs deactivated, 22:41Z

`cron.alter_job(jobid, active := false)` for jobs 1, 2, 5, 7, 8, 9, 10, 11 (all
`net.http_post` to `fresh-web.lovable.app`, `project--4831238c…lovable.app` or
`ptfjspcphskifoseidut.supabase.co` — every response in `net._http_response` was 401 or
"Couldn't resolve host name"; jobs 5 and 8 fired every minute). Job 6
(`refresh-related-slugs-monthly`, plain SQL) left active. Reversible with `active := true`.
The plan said "five"; it is eight. NOTE: jobs 7–11 are the renter-email / host-drip /
auto-outreach workers. Re-pointing them at the live host would START outbound email to real
users — that is a separate, explicit GO under rule 3, not part of this change.
(`UPDATE cron.job` is denied to the MCP role; `cron.alter_job` is not.)

## 3. fresh-web `3379f65` — database protection (deploy via ritual, log below)

- `content-404-log.functions.ts`: `shouldLog404()` — scanner/asset-shaped paths never
  logged; per-path 60 s throttle; map capped at 5,000 entries.
- `site-footer.functions.ts`: 5-minute in-process cache; `invalidateSiteFooterCache()` in
  the admin save/reset handlers.
- `home-data.functions.ts`: every homepage data call bounded at 5 s; if the featured lookup
  fails entirely, the last good homepage is served instead of an empty one.
- `serve.mjs`: `/fw-assets/` misses answer 404 text/plain before the SSR router.
