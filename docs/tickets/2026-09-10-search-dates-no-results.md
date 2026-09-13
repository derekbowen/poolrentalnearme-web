# /s date filter returns "No results"

Reported 2026-09-10 · verified on production 2026-09-09 and again 2026-09-13 · WEST marketplace

## Symptom

`https://www.poolrentalnearme.com/s?dates=2026-12-20,2026-12-21` renders "No results" while
plain `/s` shows 123 listings. Adding `&minDuration=60` changes nothing.

## What was wrong

The `dates` filter is configured with `availability: 'time-full'`, which means *the entire
selected range must be free*. `SearchPage.duck.js` implements that by asking the Marketplace API
for one uninterrupted free slot as long as the whole selection:

```
minDuration = dayCount * 1440 - 60   // minutes
```

That is the right reading for a marketplace that sells whole days or nights. PRNM sells **hours**
(`hourly-pool`, unit type `hour`). Those listings carry time-based availability plans that only
ever expose the host's open hours, so the query asked for **47 uninterrupted hours** for a two-day
pick and **23** for a single day — durations no pool can offer.

The `&minDuration=60` in the URL was silently discarded: `datesSearchParams` spread its own
`minDuration` over anything that came from the query string.

Measured against the live listings query (124 published listings, window
`2026-12-19T10:00Z → 2026-12-22T12:00Z`, `availability=time-partial`):

| minDuration | matching listings |
|---|---|
| 2820 (what the app sent for a 2-day pick) | **0** |
| 1380 (1-day pick) | 2 |
| 720 | 91 |
| 180 | 119 |
| 60 | 119 |

So the availability data was fine all along — only the requested duration was impossible. This was
never specific to December: *every* dated search on the site returned at most 2 of 124 listings.

## Fix

`src/containers/SearchPage/SearchPage.duck.js`

- `time-full` is now only honoured when some listing type actually books whole days or nights
  (`unitType` `day`/`night`). For time-based unit types a day-level date pick means "has bookable
  time on these days", so the query asks for one bookable unit (60 min) instead of the whole range.
  Day/night marketplaces keep the upstream behaviour exactly (2820 / 1380 minutes).
- `minDuration` is now a real, validated URL param: integer minutes, at least one unit, capped at
  the length of the days picked. `/s?dates=2026-12-20,2026-12-21&minDuration=180` finds pools with
  a free 3h block. Invalid values fall back to 60, and a stray `minDuration` with no `dates` is no
  longer forwarded to the API.

`src/config/configSearch.js` — `dateRangeFilter.availability` set to `time-partial` to match.

**The config change alone would not have fixed production.** Per
`src/containers/SearchPage/README.md`, the built-in filters come from the hosted
`listings/listing-search.json` asset, and `validDatesConfig` in `src/util/configHelpers.js`
defaults an unset `availability` to `time-full`. That is why the guard lives in the duck, where it
runs no matter what Console sends.

## Results after the fix

Same window, params the fixed code produces:

| URL | matching listings |
|---|---|
| `/s` | 124 |
| `/s?dates=2026-12-20,2026-12-21` | 119 |
| `/s?dates=2026-12-20,2026-12-20` | 117 |
| `/s?dates=2026-12-20,2026-12-21&minDuration=180` | 119 |
| `/s?dates=2026-12-20,2026-12-21&minDuration=720` | 91 |

The 5 listings excluded on 20–21 Dec have no open hour in that window, so the filter still
discriminates rather than passing everything through.

## Known limits (unchanged, not introduced here)

- The search window is still prolonged by −14h/+12h to cover every time zone, because the dates
  filter does not know the listing's time zone. A pool open only on the evening of 19 Dec local
  time can therefore match a 20–21 Dec search. Fixing that properly needs location → IANA tz
  resolution before the date filter, which is a UX change.
- Availability queries return `paginationUnsupported`, so a dated search shows one page of up to
  `perPage` results and no pager. That is upstream Sharetribe behaviour.
- There is no UI control for `minDuration` yet; it works as a URL param only.

## Deploying

Not deployed. Production runs from `/home/ubuntu/build` on WEST, so this needs the usual ritual —
patch the build tree with exact-anchor edits, build `cNNN-search-dates`, gated flip on `:4000` with
the prior release markers, promo math and payment endpoints re-verified, then move nginx. Production's
current `SearchPage.duck` chunk was checked against this repo before the edit and matched, so the
repo is a clean base for the patch. Derek flagged this as not urgent (after Phase 3 of the homepage
rebuild).
