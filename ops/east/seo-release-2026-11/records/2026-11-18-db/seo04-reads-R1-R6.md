# seo/04 production reads R1–R6 (fresh-web `docs/seo-repairs-2026-11/PENDING-READS.md` at 58c2ede)

Run 2026-11-18 ~03:00–03:10 UTC through the Supabase database tool (project `qbzpjsiahqgyoazjurqy`,
PostgreSQL 17.6). All SELECT only. Recorded here rather than on seo/04, because `seo/release-2026-11` pins seo/04 at
58c2ede and a new commit there would break RELEASE.md step 1.2.

| Read | Expected | Result |
|---|---|---|
| R1 body links to the 78 bare comparison URLs | 0 rows | **0 rows** (78 paths checked in `content`, `body_markdown`, `raw_html`, `blog_posts.content`, `related_slugs`; a `like '%-vs-pool-rental-near-me-in-%'` prefilter was added, which cannot drop a regex match). The guarded rewrite template is not needed. |
| R2 `cities` rows behind the 78 pairs | equal to `cities-2026-11-15.psv` | **equal**: 96 rows; md5 of the sorted `slug\|name\|state\|state_code\|latitude\|longitude\|is_published` lines is `33a8a568dfe207cec1d3c677892e44c3` in production and in the snapshot file. `comparison-duplicates.ts` needs no regeneration. |
| R3 country-page row set | same 69 rows, `redirect_to` null, `url_path` null or `/p/<slug>` | **same 69 rows** (md5 of the snapshot columns `14171fc3d7f6f64aa6814ae82dab5909`, equal to the file); `redirect_to` set on 0; `url_path` wrong on 0; all published; `content_refreshed_at` null on all 69 (so the new `<lastmod>` is `created_at`); latest `updated_at` 2026-09-16 20:48 UTC. |
| R4 hreflang groups holding country pages | only country rows plus group-key .com articles; no Spanish row | **60 rows, every one a country row** (en-GB / en-CA / en-AU, published). No .com or Spanish row carries any of these group keys, so the EN↔ES twin lookup change affects no non-country page. |
| R5 published blog posts with a country slug | 0 rows | **0 rows** |
| R6 `-little-canada` content rows | 0 rows or Little Canada MN only | **0 rows** |

Conclusion: every snapshot seo/04 was built from still holds in production. Nothing in seo/04 needs to change.
