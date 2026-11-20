# SEO repair tracking, 2026-11-20 20:21 UTC, https://www.poolrentalnearme.com

Observed site behaviour only. It does not measure indexing.

| Group | Check | Result | Detail |
|---|---|---|---|
| regression | / -> 200 | PASS | 200 |
| regression | /s -> 200 | PASS | 200 |
| regression | /login -> 200 | PASS | 200 |
| regression | /signup -> 200 | PASS | 200 |
| regression | /p/hosting -> 200 | PASS | 200 |
| regression | /p/become-a-host -> 200 | PASS | 200 |
| regression | /p/all-locations -> 200 | PASS | 200 |
| regression | /sitemap.xml -> 200 | PASS | 200 |
| regression | /robots.txt -> 200 | PASS | 200 |
| F11 | /p ends in 404 without a loop | PASS | [('/p', 301), ('/p/', 404)] |
| F11 | /p answers 404 directly (needs the WEST nginx change too) | FAIL | [('/p', 301), ('/p/', 404)] |
| F11 | /p/ ends in 404 without a loop | PASS | [('/p/', 404)] |
| F11 | /p/ answers 404 directly (needs the WEST nginx change too) | PASS | [('/p/', 404)] |
| F11 | /p/null -> 404, not a redirect to the homepage | PASS | (404, None) |
| F11 | /p/details -> 404, not a redirect to the homepage | PASS | (404, None) |
| F11 | /p/mailto:someone -> 404, not a redirect to the homepage | PASS | (404, None) |
| F11 | stored redirects that take more than one hop (target 0) | FAIL | 10 of 451; e.g. [('bubble_covers_for_swimming_pools_the_ultimate_guide_to_protecting_and_enhancing_your_pool', [('/p/bubble_covers_for_swimming_pools_the_ultima |
| F11 | stored redirects that do not end at a 200 (target 0) | PASS | 0 of 451; e.g. [] |
| F6a | 78 exact-duplicate comparison URLs 301 once to their state-suffixed twin | PASS | 0 problems; e.g. [] |
| F14 | /p/become-a-swimming-pool-host-saratoga-springs-ny no longer says '10% service fee' | PASS | 200 |
| F14 | /p/swim-instructor-pool-rental-fair-oaks-ranch-tx no longer says '10% booking fee' | PASS | 200 |
| F14 | /p/swim-instructor-pool-rental-mount-vernon-va no longer says '10% booking fee' | PASS | 200 |
| F14 | /p/affiliate no longer says '10% platform fee' | PASS | 200 |
| F1 | sampled host pages load and do not open with the empty-inventory notice (25) | PASS | 0 with notice; e.g. [] |
| F7 | sampled renter city pages load and carry a renter heading, not the host heading (25) | PASS | 0 host-style; e.g. [] |
| F7 | sampled host pages load and have distinct H1s | PASS | 0 duplicates among 25 loaded |
| F4 | no URL listed in two sitemaps (target 0) | FAIL | 96; e.g. ['https://www.poolrentalnearme.com/p/cleanwatermanagementforpoolrentals', 'https://www.poolrentalnearme.com/p/fivestarguestcheckin', 'https://www.poolr |
| F4 | config/test listing absent | PASS |  |
| F4 | noindex /p/pool-pros absent | PASS |  |
| F4 | /sitemap-directory.xml no longer advertises noindex URLs (410 or no <loc>) | PASS | 410 |
| F4 | sampled sitemap URLs are 200, indexable and self-canonical (~150 sampled of 10004) | PASS | 0 bad; e.g. [] |
| F10 | www.poolrentalnearme.co.uk/p/hosting canonical -> www.poolrentalnearme.com | PASS | (200, 'https://www.poolrentalnearme.com/p/hosting') |
| F10 | www.poolrentalnearme.co.uk/p/become-a-swimming-pool-host-aberdeen-sd canonical -> www.poolrentalnearme.com | PASS | (200, 'https://www.poolrentalnearme.com/p/become-a-swimming-pool-host-aberdeen-sd') |
| F10 | www.poolrentalnearme.co.uk robots.txt allows its own /sitemap-country.xml | PASS | 200 |
| F10 | www.poolrentalnearme.ca/p/hosting canonical -> www.poolrentalnearme.com | PASS | (200, 'https://www.poolrentalnearme.com/p/hosting') |
| F10 | www.poolrentalnearme.ca/p/become-a-swimming-pool-host-aberdeen-sd canonical -> www.poolrentalnearme.com | PASS | (200, 'https://www.poolrentalnearme.com/p/become-a-swimming-pool-host-aberdeen-sd') |
| F10 | www.poolrentalnearme.ca robots.txt allows its own /sitemap-country.xml | PASS | 200 |
| F10 | www.poolrentalnearme.com.au/p/hosting canonical -> www.poolrentalnearme.com | PASS | (200, 'https://www.poolrentalnearme.com/p/hosting') |
| F10 | www.poolrentalnearme.com.au/p/become-a-swimming-pool-host-aberdeen-sd canonical -> www.poolrentalnearme.com | PASS | (200, 'https://www.poolrentalnearme.com/p/become-a-swimming-pool-host-aberdeen-sd') |
| F10 | www.poolrentalnearme.com.au robots.txt allows its own /sitemap-country.xml | PASS | 200 |
