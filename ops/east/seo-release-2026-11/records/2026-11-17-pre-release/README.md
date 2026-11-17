# Pre-release record, 2026-11-17 (EAST SEO release)

Read-only checks run before the EAST deploy of `seo/release-2026-11` (fresh-web, tip 9b2f432).
Nothing was deployed.

| Step (RELEASE.md) | Result, 2026-11-17 ~03:13 UTC |
|---|---|
| 0.1 live stamp | sha 77028454655e7b272d8c23987b54f445f9eba9f7, dirty 5, the five EAST-only files, builtAt 2026-11-04T07:38:03Z — matches |
| 0.2 branch tips | 01 b3e2ace, 02 b0c524d, 03 359ff20, 04 58c2ede, 05 a832991, 06 f9b6d9b, 07 08b2360, release 9b2f432 — all on GitHub |
| 0.2b WEST marker | /s and /login both serve assets/index-DACcM51y.js |
| 0.3 Cloudflare 5xx caching | Not read (no Cloudflare access in this session). Observed: a 404 on /p/* is cached (MISS then HIT). A cached 503 would still be better than today's cached 404 + false 404-log row + empty sitemap on a failed read. |
| 0.4 nginx read (EAST/WEST) | Not run: this session has no PRNM_AWS_* credential (runner refused, as designed). |
| 0.5 tracker baseline | track-031428.md in this folder: regression 8/8 PASS; F11, F6a, F14, F1, F7, F4, F10 repair checks FAIL as expected before the release. |

Blocked before step 2 (EAST deploy): the PRNM_AWS_* pair must be present in the cloud environment.
