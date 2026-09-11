# Ops record — 2026-09-11: broken-link repair (EAST `fresh-web`)

A two-layer link crawl of the homepage found 63 internal 404s and one dev-hostname
leak. This record covers the repair, the tests added, and the two bugs the deploy
gate caught before they reached production.

Live copies of every changed EAST file are mirrored under
`docs/ops/linkfix-2026-09-11/` (EAST is a loose working copy, not a git checkout).

## What was broken

| Finding | Detail |
|---|---|
| `/p/pool-host-tools` | **57 dead links**, every one under `/host-tools/`. The routes `src/routes/host-tools.$slug.tsx` and `host-tools.index.tsx` were deleted (git `8eac8996`); the hub page kept linking them. Page is footer-linked, so it was reachable from every page on the site. |
| Homepage city grid | **6 dead city links** (`bowling-green`, `boynton-beach`, `bozeman`, `brambleton-va`, `brandon-fl`, `brentwood-tn`). Root cause: the grid is sourced from `cities` but links to `/p/<slug>`, a `content_pages` page. 73 of 200 published cities had no `content_pages` row; the existing filter only dropped rows that *had* a row carrying `redirect_to`. 10 of the first 72 were dead — 6 landed inside the rendered 60. |
| `/p/anaheim` | `https://poolrental.local/p/hosting` baked into published `body_markdown`. |

## What changed

### Code (EAST `/home/ubuntu/fresh-web`)

| File | Change |
|---|---|
| `src/lib/host-tools-live.ts` | **NEW.** Verified registry of the 6 tools that resolve to a canonical 200. The hub body is generated from this, so a tool cannot reappear without being registered. Records `supersedes` for the old `/host-tools/*` slugs (archaeology only — no redirects emitted). |
| `src/server/home-data.functions.ts` | `selectEligibleCities()` helper; both the live grid and the winter-preview grid now require a `content_pages` row with `status = "published"` and no `redirect_to`. Candidate pool 72 → 150 so 60 survive filtering. One DB round-trip, no per-render HTTP checks. |
| `src/routes/p.corpus-christi-pool-rental-laws.tsx` | "Related guides" section + TOC entry linking the Texas advocacy guide, HOA defense kit, and Host Advocacy Center with descriptive anchors. |
| `scripts/check-tools-hub.mjs` | **NEW.** Fails if the hub links any `/host-tools/*`, links an unregistered tool path, or if any registry path is not a canonical 200. |
| `scripts/check-homepage-cities.mjs` | **NEW.** Fails if any homepage `/p/` link does not resolve to a published page. |
| `scripts/check-dev-hostnames.mjs` | **NEW.** Scans source + live pages for dev hostnames. |
| `package.json` | Registers `check:tools-hub`, `check:homepage-cities`, `check:dev-hostnames`. |

### Database (Supabase `content_pages`)

| Row | Change |
|---|---|
| `pool-host-tools` | `body_markdown` + `content` regenerated from the registry (13,940 → 2,855 chars, **67 → 0** `/host-tools/` links). `title` `57 Free Pool Host Tools` → `6 Free Pool Host Tools`; `seo_title`, `seo_description` updated to match. Backups: `/root/east-backups/pool-host-tools.{body,content}.bak.md` |
| `anaheim` | `poolrental.local` absolute URL rewritten to a relative path in `body_markdown`. Backup under `/root/east-backups/devhosts/` |
| `host-advocacy-texas` | Appended "Local guide: Corpus Christi" section (11,723 → 12,251 chars) |
| `host-advocacy` | Appended "Local and city guides" section (8,461 → 8,919 chars) |

Backups of both advocacy rows under `/root/east-backups/advocacy/`.

## Redirect decision for the 57 dead tool URLs

Per instruction, redirects only where a genuinely equivalent destination exists.

- The URLs **did** previously exist (git `8eac8996` deleted both route files).
- **No Search Console or analytics tables exist in this project** (`gsc_pages`,
  `gsc_queries`, `search_console_pages`, `page_metrics` all 404), so there is no
  traffic or backlink evidence to weigh.
- Only 2 of the 57 slugs have a `content_pages` row at all.
- There is no redirect-alias mechanism in the app (`redirect_aliases` table does
  not exist); a 301 would require a WEST nginx edit.

**Decision:** internal links removed, dead URLs left as honest 404s. Equivalences
are recorded in `host-tools-live.ts` under `supersedes` if 301s are ever wanted.
A mass-redirect to the hub was explicitly rejected — it would be soft-404 behaviour.

## Two bugs the gate caught

1. **Smoke harness under-specified.** `node serve.mjs` was spawned inheriting the
   SSM shell env, which has no `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`, so
   every DB-backed page 500'd — including `/p/anaheim` and
   `/p/hoa-pool-rental-defense-kit`, untouched by this change. `fresh-web` runs
   with `--env-file=.env`; the smoke child now loads the same file.
2. **`content_pages.is_published` is a dead column.** It is `false` on all 106
   rows while those pages serve normally. The real signal is `status`
   (`published` = 100, `redirect` = 6). Keying eligibility on `is_published`
   rendered **zero** city cards. Caught only by the `>= 40` link-count assertion
   added to the second gate run. Now keyed on `status === "published"` — 91
   eligible from 150 candidates.

Also corrected: two false positives in the new checkers — the hub pages match the
"tool" substring rule, and `canonical.server.ts` defines a legitimate `DEV_ORIGIN`
local-dev fallback (live canonicals verified as `https://www.poolrentalnearme.com/...`).
Both narrowed with documented reasons rather than disabled.

## Verification

- `npm run build` clean; `npx tsc --noEmit` **5 errors = pre-existing baseline, 0 in touched files**
- Smoke on `:3005` with real env before any restart; failure restores `dist` and leaves the live process alone (it did, twice)
- `check:tools-hub` PASS · `check:homepage-cities` PASS (99/99 links resolve) · `check:dev-hostnames` PASS
- Live after restart: homepage 149,222 bytes, 99 `/p/` links, dead-six absent

Backups: `/root/east-backups/linkfix-*`, `linkfix-dist2-*`, `linkfix-status-*`.
Rollback = restore the file(s) from the backup dir, `npm run build`,
`sudo -u ubuntu PM2_HOME=/home/ubuntu/.pm2 pm2 restart fresh-web`; DB rows restore
from the `.bak` copies named above.
