# Homepage v4 — follow-ups

## Pool-type chips use keyword search (temporary)

The Heated / Indoor / Night swims / Pool parties / Hot tubs / Family chips link to
`/s?keywords=…`. This is a functional stopgap, chosen on 2026-09-09 because `/s` ignores
`pub_categoryLevel1` while the category filter is disabled in `src/config/configSearch.js`,
so the previous links returned the whole catalogue (124 results for every value, including
a nonsense one).

Limits of the stopgap:

- Keyword matching does not guarantee the amenity. A listing whose description says
  "not heated" matches "heated". Counts measured on 2026-09-09: heated 34, indoor 13,
  night 64, party 28, hot tub 36, family 69.
- `/s?keywords=` pages are `noindex`, so the chips carry no crawl value.

Long-term fix, either or both:

1. Structured filters: enable the category filter in Console and in `configSearch.js`,
   and make sure listings carry `publicData.categoryLevel1` / `poolType` (today
   `poolType` is set on 1 of 196 listings).
2. Dedicated indexable landing pages per pool type (heated, indoor, hot tub), with the
   chips linking there.

## Testimonials

The three Love notes must match the recorded messages character for character. Demarco
and Katherine come from the site-wide quote list in `ops/east/tools/cta.js`. Salty's
wording was confirmed by Derek on 2026-09-09: "Rock on, Derek. I see your hustle this
year and it's legit." (the cta.js copy has an em dash where the original has a period,
and should be aligned when that file is next touched).
