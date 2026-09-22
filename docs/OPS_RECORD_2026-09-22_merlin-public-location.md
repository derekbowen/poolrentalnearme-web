# Merlin: never display or publish a street address — 2026-09-22

Triggered by a host ticket (Moorebank, NSW): *"The listing setup says that the
address will be shared only when guests book, however the preview shows the full
address."* They were right, and the same flaw was also publishing street
addresses to the live marketplace.

Merlin is the host-onboarding wizard: its own container on WEST, `127.0.0.1:3099`,
proxied at `/wizard/`. It is **not** in either git repository.

## Root cause

Every public-location surface read `location.address` — the raw
`formatted_address` string from Google Places.

The publish payload tried to redact it with a regex on that string:

```js
/^\d+\s/.test(address) ? [city, state + " " + zip].join(", ") : address
```

That only fires when the address begins with a house number. `"Nicholas Dr,
Carlisle, PA 17015, USA"` and `"Catherine St, Union, NJ 07088, USA"` do not, so
they were published verbatim into `publicData.location.address`.

A string rule cannot be made safe, because the failure mode is "the rule did not
match" and the default on no-match was to publish everything. The fix inverts
that: build the public value from structured components only, and have no path
that can reach `.address` at all.

## The formatter

One function, `__prnmPublicLoc(location, withZip)`, at the head of the bundle.
It reads `city`, `state`, `zip`, `country` and nothing else:

| Input | Output |
|---|---|
| city + state | `Moorebank, NSW` (`Moorebank, NSW 2170` on publish) |
| city only | `Moorebank` |
| state + country | `PA, United States` |
| state only / country only | that value |
| nothing usable | `""` → UI shows *"Location shown after publishing"* |

A test asserts the function's own source contains no reference to `address`,
`building`, `lat` or `lng`, so the guarantee is structural rather than a
convention someone has to remember.

`locality` is absent in much of the world, so the Places extraction now falls
back `locality → postal_town → sublocality → administrative_area_level_2`, and
captures `country`. Every one of those is an administrative area. No street
component (`street_number`, `route`, `subpremise`) is ever a candidate.

## Files changed

* `dist/assets/index-4d5740d4.js` — 8 edits (backup:
  `index-4d5740d4.js.bak-publicloc-20260922-062938`)
* `test/public-location.test.mjs` — new, 22 assertions

Merlin has **no frontend source in the environment** — only a built `dist/` and
the Express server. The established deployment path is therefore a surgical patch
of the minified bundle with a timestamped backup beside it, which is what the
2026-09-16 `bak-countries` patch also did. The tests work around this by reading
the shipped bundle, extracting the real `__prnmPublicLoc` and the real
`address_components` reducer out of it, and exercising those — so they cannot
pass against a copy that has drifted from what production serves.

### The 8 edits

| # | Site | Before → after |
|---|---|---|
| 1 | draft initial state | added `country:""` |
| 2 | Places extraction | added `postal_town` / `sublocality` / `admin_area_2` / `country` |
| 3 | address field `onChange` | forwards `country` into the draft |
| 4 | **publish payload** | regex hack → `__prnmPublicLoc(c.location,!0)` |
| 5 | small preview card | `.address` → formatter |
| 6 | guest/product preview | `.address` → formatter |
| 7 | map placeholder | `.address` → formatter, *"Location shown after publishing"* |
| 8 | Search Results Preview | `.address` → formatter |

### Deliberately unchanged (private address retained)

* `privateData.exactAddress` — still the full formatted address on publish
* the host's own step-6 Location review panel — still shows street + unit
* the address input's own value
* publish validation (`address && lat != null && lng != null`)
* geocoding — unchanged; Places still receives and returns the full address

## Verification

22/22 tests pass against the deployed bundle. Rendered in a real browser at
desktop 1280px and iPhone 13, driving the actual production JS: the host's card
reads **"Moorebank, NSW"**, matching the granularity of the neighbouring cards
("Austin, TX"); the guest preview header and the map placeholder both read
"Moorebank, NSW" above its own *"Exact address shown after booking"* line; no
street token anywhere in either DOM. Expanding the step-6 Location panel still
shows `2 Gal Cres, Moorebank NSW 2170, Australia, Unit 4` to the host.

## Still open — marketplace data, NOT fixed here

**Ten published listings serve a full street address in `publicData`, which is
in the rendered HTML of their public listing pages today.** Verified on six of
them. These predate the fix; Merlin can no longer create one. Redacting them is
a production data change on real hosts' listings and is awaiting Derek's GO. A
dry run exists; nine of the ten have no `privateData.exactAddress`, so the full
address must be copied there before the public field is narrowed, or it is lost.

Separately, `getCityFromLocation()` in the marketplace's `ListingCard.js` takes
the third-from-last comma segment, which is the city for a four-part US address
and the **street** for a three-part international one. No such listing is
published today. Not changed — reported.
