# /sitemap-listings.xml returned 404 — 2026-09-25

**Symptom.** Search Console: "Sitemap could not be read — General HTTP error 404" for
`https://www.poolrentalnearme.com/sitemap-listings.xml`. Our own index (`/sitemap.xml`) lists
that child, so the 125 marketplace listing URLs (`/l/...`) were not reaching Google by sitemap.

**Cause.** EAST (`fresh-web`) serves the route fine (200, 125 `<loc>`). WEST nginx only proxies
sitemap children to EAST through the regex

    location ~ ^/(sitemap\.xml|sitemap-(static|directory|recent-pages|pages-[a-z-]+)\.xml)$

which has no `listings` alternative, so the request fell through to the marketplace container
and 404'd.

**Fix (WEST, `/etc/nginx/sites-enabled/default`).** Added `listings` to that alternation:

    location ~ ^/(sitemap\.xml|sitemap-(static|directory|recent-pages|listings|pages-[a-z-]+)\.xml)$

Backup: `/home/ubuntu/nginx-pre-sitemap-listings-<timestamp>.bak`. `nginx -t` passed, reload.
Rollback = copy the backup back, `nginx -t`, reload.

**Verified.** Origin: `/sitemap-listings.xml` 200 `application/xml`; `/sitemap.xml`,
`/sitemap-static.xml`, `/s`, a `/l/...` page unchanged at 200. Public: after Cloudflare's
10-minute edge TTL on the cached 404 lapsed (the `prnm-edge` token has no Cache Purge
permission, so it could not be purged), 200 with 125 URLs. Every other child in the index
returned 200 with URLs; the three ccTLD `sitemap-country.xml` files return 200.

**Note.** This WEST site config is not in git. Any future sitemap child added to EAST's index
needs a matching alternative in that regex, or it is live on EAST and 404 to Google.
