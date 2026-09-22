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

---

# Remediation and marketplace hardening — same day, on Derek's GO

## The 10 leaked listings (Priority 1) — done

Each was handled one at a time, strictly ordered, with every original value
journalled to disk (mode 0600, `/home/ubuntu/merlin/address-redaction-journal-20260922.json`)
**before** the first write:

1. read the listing fresh from the Integration API;
2. if `privateData.exactAddress` was absent, write it **first** from the current
   public address, then re-read and assert it persisted — a failure here aborts
   that listing before anything public is touched, so an exact address can never
   be destroyed;
3. only then narrow `publicData.location.address`;
4. re-read and assert: public is the safe value, the street is gone from
   `publicData`, the exact address is present privately, `geolocation`, `price`
   and `state: published` are unchanged.

**9 of the 10 had no `privateData.exactAddress`** and needed step 2.

The replacement value was **not** parsed from the address. Every listing's
coordinates were reverse-geocoded through the Geocoding API to get an
authoritative structured locality, and all ten agreed with the structured
`location.city` where one existed. Same principle as the Merlin fix: structured
data decides, the address string never does.

Verified after the fact: 0 of the 10 still carry the street in `publicData` or
in rendered HTML, all 10 still render and still show a city, and a re-scan of
**all 125 published listings** finds 0 street-shaped public addresses.

## Marketplace fallback (Priority 3) — c197

`publicLocationLabel()` in `src/util/address.js`, wired into `ListingCard`,
`SectionMapMaybe` and `shortLocationLabel` (social/meta link previews). Details
in the commit; 16 regression tests in `src/util/address.test.js`.

Deployed as **c197-publicloc** through the standard gated flip. Ports were
mirrored from the usual script because MAIN was sitting on `:4000`: the gate ran
on `:3000`, nginx was never touched until every check passed, and both moves
were `cp` + `nginx -t` + `reload` (master pid 1474885 unchanged throughout, all
live probes 200). Rollback is `c196-canonical-404`, running on `:3000`.

One trap worth recording: the first candidate was started with
`--env-file /home/ubuntu/build/.env` and came up **missing 17 environment
variables** that MAIN has, including `STRIPE_SECRET_KEY`, `SUPABASE_URL` and
`VITE_SHARETRIBE_USING_SSL`. The real ritual clones the env from the *running
MAIN container* (`docker inspect --format '{{range .Config.Env}}'`), which is
the only thing that guarantees parity. `build/.env` is not the production env.

## Merlin source — recovery plan (not started, per instruction)

**Current state.** `/home/ubuntu/merlin` holds a built `dist/` and an Express
`server/`. There is no `src/`, no `.jsx`/`.tsx` anywhere, no sourcemaps, no
`sourceMappingURL`, and no repository — `merlin-dist*.tgz` are dist archives,
not source. Every frontend change is therefore a patch of minified production
JavaScript. That is how both this fix and the 2026-09-16 "countries" fix were
made.

1. **Look for the source before rebuilding it.** Check Derek's local machines
   and any Lovable / v0 / bolt-style generator account — the code's shape
   (Vite + React + Tailwind + lucide icons, single bundle) suggests it was
   generated in a hosted builder that still holds the project. Also check the
   `fresh-web-702e04c3` org for an unlisted repo. This costs an hour and may
   return the whole tree.
2. **If it is genuinely gone, reconstruct rather than decompile.** The Express
   server is intact and readable, and the wizard's behaviour is fully specified
   by what it posts to `/wizard/api/sharetribe/create-listing`. Rebuilding the
   six wizard steps against that contract is a known-scope project; un-minifying
   390 KB of bundled React is not, and would leave unreadable code under source
   control, which is worse than none.
3. **Stop the bleeding in the meantime.** `dist/` should be committed to a
   repository as-is, so at least the deployed artifact is versioned and a bad
   patch is revertible without a timestamped `.bak` convention. `run-merlin.sh`
   and a redacted `merlin.env.template` belong with it.
4. **Then forbid the practice.** Once a source tree exists, the deploy path
   becomes build-from-source into the image, and patching `dist/` directly is
   refused by the same kind of guard as `check:insurance-claims` — a check that
   fails when `dist/` is newer than the source it claims to come from.
