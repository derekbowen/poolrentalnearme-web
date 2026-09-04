# Broken and misleading search links

Read-only inventory, 2026-09-04. Measured against production, 124 published listings.

---

## What filters, and what does not

| Parameter | Behaviour | Verdict |
|---|---|---|
| `pub_poolAmenities=<value>` | `heated` → **44**, `hot_tub` → **37**, `heated,hot_tub` → 21 (has_all), unknown value → **"No results."** | **works** |
| `keywords=<text>` | `heated` → 34, `indoor` → 13, `saltwater` → 16, nonsense → **"No results."** | **works** — text match, approximate but honest |
| `bounds=<ne,sw>` | Phoenix box → 3 | **works** |
| `pub_category=<anything>` | `heated`, `indoor`, `banana` → **124 (everything)** | **broken — no such field** |
| `pub_poolType=<value>` | `indoor`, `lap` → **124** | **broken — field exists in config, not indexed in production** |
| `pub_maxGuests=10,100` | **124** | **broken — not indexed** |
| `address=<city>` alone | no effect (`bounds` is what filters) | misleading if used alone |

## Inventory actually tagged per amenity

| Amenity | Listings |
|---|---|
| `heated` | **44** |
| `hot_tub` | **37** |
| `dog_friendly`, `party_ready`, `family_friendly`, `luxury`, `quiet`, `grill`, `shade` | **0** |

Only two of the nineteen `poolAmenities` options carry any inventory. The rest are
defined in config but unused by hosts, so they cannot back a discovery tile.

---

## The broken links

**All twelve live in one component**: `fresh-web` →
`src/components/home-page.tsx:823`, the "Browse by pool type" grid:

```jsx
href={`/s?pub_category=${encodeURIComponent(t.slug)}`}
```

Every tile returns the entire catalogue today:

| Tile | Current slug | Structured filter available? | Recommendation |
|---|---|---|---|
| Heated Pools | `heated` | **yes — 44** | `?pub_poolAmenities=heated` |
| Pools with Hot Tubs | `hot-tub` | **yes — 37** | `?pub_poolAmenities=hot_tub` |
| Indoor Pools | `indoor` | no (`poolType` not indexed) | **remove the tile** |
| Saltwater Pools | `saltwater` | no | `?keywords=saltwater` (16) or remove |
| Resort-Style Pools | `resort-style` | no | `?keywords=resort` or remove |
| Lap Pools | `lap` | no | `?keywords=lap` or remove |
| Pools with Outdoor Kitchens | `outdoor-kitchen` | no | remove |
| Pools with Fire Pits | `fire-pit` | no | remove |
| Pet-Friendly Pools | `pet-friendly` | no (`dog_friendly` → 0) | remove |
| Wheelchair-Accessible Pools | `accessible` | no | remove |
| Pools with Outdoor Theaters | `outdoor-theater` | no | remove |
| Infinity Pools | `infinity` | no | `?keywords=infinity` or remove |

`keywords=` is a text match over title and description, not a structured
attribute, so it under-reports (34 for "heated" against the structured 44). It is
honest — it filters, and an unmatched term returns "No results." — but a tile
labelled as a pool *type* backed by a text search is a weaker promise than it
looks. Removing the ten unbacked tiles is the cleaner option.

`fresh-web` also plumbs the dead parameter through its own server:
`src/server/sharetribe.functions.ts:43` and `src/server/sharetribe.server.ts:505,544`.

## Not broken

`poolrentalnearme-web` → `src/containers/LandingPage/SectionPoolTypes.js:28` uses
`/s?keywords=<term>`. It filters and degrades correctly. It is a *different*
pool-type section from the fresh-web one above — the two are unaware of each
other and offer different tile sets.

---

## Sequencing — this matters

The search fix in `SearchPage.duck.js` makes an unsupported extended-data filter
return **zero** results instead of the full catalogue. That is the correct
behaviour, but it changes those twelve tiles from *wrong-but-populated* to
*empty*.

**Fix the links in the same release as the search fix, or before it.** Shipping
the search fix alone turns twelve homepage tiles into empty result pages.

Neither change is deployed. The link fix cannot be committed from here: it lives
in `fresh-web`, whose authoritative source is not in any GitHub branch.
