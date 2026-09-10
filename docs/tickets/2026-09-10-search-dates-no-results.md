# Ticket: `/s?dates=…` returns "No results" for every date

**Logged:** 2026-09-10 (Derek: "not in this project, look at it after Phase 3")
**Where:** marketplace search page (WEST, this repo), `src/containers/SearchPage`

## Symptom
Any `dates=` value on the search page yields "No results", e.g.
`/s?dates=2026-12-20,2026-12-21` and `…&minDuration=60`, while the same page with no
date shows 123 results. Verified 2026-09-09 by curl on production.

## Why it matters
The winter homepage brief asked for a Date field in the hero search; it was left out in
Phase 1 because submitting a date would send every visitor to an empty results page.

## Suspects (unverified)
- `configSearch.js` dates filter (`schemaType: 'dates'`) vs. hourly listings whose
  availability plans are time-based: the query may need `start`/`end` with times and
  `availability: time-full|time-partial` rather than day-level `dates`.
- Listings without an availability plan / no open slots in the window.

## Done when
A date (or date + hours) filter on `/s` returns the listings that are actually bookable
in that window, and the homepage can pass it.
