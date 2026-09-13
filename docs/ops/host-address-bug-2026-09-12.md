# The host address-population bug — root cause, and why it is not fixed yet

Host report: **"My address is not popularing?"** — Bibiana Grajales, 2026-09-11 22:44,
in the stuck-host SMS thread. Several other new hosts are stuck at the same step.

**Status: diagnosed, not fixed. The fix is blocked on missing source code, not on
understanding.** See "Why this is not fixed" below.

## Which app this is

Not the marketplace, and not `fresh-web`. The host wizard at
`https://www.poolrentalnearme.com/wizard/` is served by a third app, **`merlin`**,
on WEST:

| | |
|---|---|
| Server | `/home/ubuntu/merlin/server/index.js` (461 lines, Express) |
| Client | `/home/ubuntu/merlin/dist/assets/index-EHnDwOcW.js` — **built output only** |
| Source | **does not exist** — no `src/`, no remote on its git repo, not in either Lovable workspace |
| Env | `merlin.env`: `GOOGLE_MAPS_API_KEY`, `FIRECRAWL_API_KEY`, `SHARETRIBE_CLI_API_*`, `WIZARD_JWT_SECRET`, `MARKETPLACE_CLIENT_ID` |

Bibi's import did run and succeed: `merlin/import-attempts.jsonl` records
`2026-09-07T23:35:04.697Z … pooldetails/84203 … "outcome":"ok" … "photos":6`.
So scraping was never the problem — the address step was.

## Things that are NOT the cause (checked, ruled out)

- **Maps key injection works.** `server/index.js` does a two-step string
  substitution into `dist/index.html`. Both landed: the live `/wizard/` HTML
  contains the key in the inline Google loader *and* in
  `window.__GOOGLE_MAPS_KEY`. This was the first hypothesis and it is wrong.
- **The importer does not set the address**, by design, and correctly:
  `IMPORT_SYSTEM` says *"Do NOT invent the exact street address (these sites hide
  it; city/state is OK)"*. The host is meant to enter it by hand.

## Root cause

From the shipped bundle. The address component (minified `Wg`) is:

```js
function Wg({ value: c, onChange: r, onRawChange: f }) {
  const u = useRef(null), m = useRef(null), [N, j] = useState(false);
  useEffect(() => {
    let _ = false;
    async function g() {
      try {
        if (await google.maps.importLibrary("places"), _ || !u.current) return;
        const p = new google.maps.places.Autocomplete(u.current, {
          types: ["address"], componentRestrictions: { country: "us" },
          fields: ["address_components", "geometry", "formatted_address"],
        });
        p.addListener("place_changed", () => { /* …calls r({address,city,state,zip,lat,lng}) */ });
        m.current = p; j(true);
      } catch {}            // ← swallows everything, silently
    }
    g();
    return () => { _ = true; };
  }, [r]);                  // ← r is the parent's onChange
  …
}
```

and its only caller passes a **freshly created arrow function** every render:

```js
jsx(Wg, {
  value: c.location.address,
  onRawChange: B => u({ address: B }),
  onChange:    B => u({ address: B.address, city: B.city, state: B.state,
                        zip: B.zip, lat: B.lat, lng: B.lng }),
})
```

Three defects compound:

1. **The effect re-runs on every render.** Its dependency is `[r]`, and `r` is a
   new function identity each render. Typing a character calls `onRawChange` →
   parent `setState` → re-render → new `onChange` identity → effect re-runs →
   **a brand-new `google.maps.places.Autocomplete` is constructed on the same
   input, per keystroke.**
2. **Nothing is torn down.** The cleanup only sets a local `_ = true`, which just
   aborts a still-pending `importLibrary`. It never calls
   `google.maps.event.clearInstanceListeners`, never discards the previous
   instance, and never removes its `.pac-container`. Instances and listeners
   accumulate, and each new instance restarts prediction fetching, so the
   dropdown never survives long enough to click — which is precisely
   *"not populating"*.
3. **`catch {}` is empty.** If `google` is undefined, or Places fails to load,
   or the key lacks the Places API, the component silently degrades to a plain
   text input with the hint *"Type your full address manually"* — and no error
   reaches the host, the console, or any log.

**Why typing manually cannot rescue it:** the plain input's `onChange` calls only
`onRawChange`, which sets the raw address string. The structured payload —
`city`, `state`, `zip`, `lat`, `lng` — is produced **only** inside the
`place_changed` listener. So with autocomplete broken there is no path to a
`lat`/`lng` at all, and the wizard hard-blocks publishing:

```
!(c.location.lat != null && c.location.lng != null) &&
  "Pick your address from the dropdown so it's pinned on the map — required to publish."
```

That is the hard stop the stuck hosts are hitting.

## Why this is not fixed

The defect is three lines of React in the wizard's client source, and **that
source does not exist anywhere reachable**:

- `/home/ubuntu/merlin` is a git repo (`master`, `7eacd437`) with **20 tracked
  files** and **no remote**. Tracked: `server/index.js`, `cron-ratings.mjs`,
  `dbg-author.mjs`, `ical-swimply-sync.js`, `package.json`, `package-lock.json`,
  plus `dist/`. No component source.
- `find /home/ubuntu -name 'AddressAutocomplete*'` → nothing.
- Neither Lovable workspace contains it (searched Derek's 60-project workspace).

Patching minified production React by hand would be a worse bug waiting to
happen, on the exact flow that is already blocking revenue. **I did not do it.**

## The fix, ready to apply once the source is found

```jsx
function AddressAutocomplete({ value, onChange, onRawChange }) {
  const inputRef = useRef(null);
  const acRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;          // latest callback, stable identity
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (typeof google === "undefined" || !google.maps?.importLibrary) {
          throw new Error("Google Maps loader never initialised");
        }
        await google.maps.importLibrary("places");
        if (cancelled || !inputRef.current) return;
        const ac = new google.maps.places.Autocomplete(inputRef.current, {
          types: ["address"],
          componentRestrictions: { country: "us" },
          fields: ["address_components", "geometry", "formatted_address"],
        });
        ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          if (!place.geometry?.location) return;       // incomplete selection
          const get = (t, k = "long_name") =>
            place.address_components?.find((c) => c.types.includes(t))?.[k] ?? "";
          onChangeRef.current({
            address: place.formatted_address ?? "",
            city: get("locality"),
            state: get("administrative_area_level_1", "short_name"),
            zip: get("postal_code", "short_name"),
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
          });
        });
        acRef.current = ac;
        setReady(true);
      } catch (err) {
        console.error("[AddressAutocomplete] Places unavailable:", err);
        setLoadError(err.message || String(err));      // never silent
      }
    })();
    return () => {
      cancelled = true;
      if (acRef.current) {
        google.maps?.event?.clearInstanceListeners(acRef.current);
        acRef.current = null;
      }
      document.querySelectorAll(".pac-container").forEach((n) => n.remove());
    };
  }, []);                                  // ← once, not per render
  …
}
```

Four changes, each tied to a defect above:

1. `[]` instead of `[r]`, with the callback held in a ref — the Autocomplete is
   constructed **once**, not per keystroke.
2. A real cleanup: `clearInstanceListeners` plus `.pac-container` removal.
3. `catch` records the error and surfaces it, instead of `catch {}`.
4. An explicit guard for `google` being undefined, so that case is diagnosable
   rather than indistinguishable from every other failure.

**Separately, and needed regardless:** a host must never be hard-blocked. Add a
"Use this address" button that geocodes what the host typed via the Geocoding API
and fills `lat`/`lng` from the result. That resolves the host's own typed input —
it does not invent an address — and it removes the single point of failure
between a willing host and a live listing.

## Tests to add with the fix

The required coverage, mapped to what each test would have caught:

| Test | Catches |
|---|---|
| type an address, assert exactly one `.pac-container` and one Autocomplete instance after N keystrokes | defect 1+2, the actual bug |
| select an autocomplete result → assert `{address, city, state, zip, lat, lng}` all set | the happy path |
| reload the wizard → assert the address and lat/lng survive | persistence/hydration |
| re-enter the edit flow → assert the address is still populated | edit flow |
| type a partial address and blur without selecting → assert a clear message, and that publish is either allowed via geocode fallback or explains itself | defect 3 + the hard block |
| stub `google.maps.importLibrary` to reject → assert a visible error, not a silent plain input | defect 3 |
| 390px viewport: dropdown is reachable and tappable over the sticky footer | mobile |

Note on tooling: these want a real browser. Playwright and Chromium are
installed in the session sandbox, but Chromium could not reach anything through
the session's HTTPS relay (`ERR_CONNECTION_RESET`, including `example.com`), so
the browser-level reproduction was **not** run here. Everything above is read
off the shipped bundle and the live HTML, which is why the root cause is stated
from code rather than from a recorded failing interaction.

## Bibi's listing, meanwhile

Live and published — `6aa48caa-bfda-4e32-87ee-4cff77f4c0d6`, created through the
Integration API, not the wizard. It carries Swimply's **rounded public
coordinate** (34.130001, -117.460001) and city-level `Fontana, CA 92336`, with
`privateData.addressStatus` recording that the street address is absent and why.
**No address was invented for her or for anyone else**, and none should be until
the host supplies it.
