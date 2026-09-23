# Merlin (host listing wizard): deployed artifact, versioned as-is

This directory is a **byte-for-byte snapshot of what WEST serves at `/wizard/`**,
taken 2026-09-23. It is a rollback point, not a source tree. Do not decompile the
bundle into source here.

## How it runs today (WEST 13.56.113.85)
- Container `merlin`: image `node:20-alpine`, command `node server/index.js`,
  workdir `/app`, restart `unless-stopped`, `127.0.0.1:3099`.
- `/home/ubuntu/merlin` is bind-mounted as `/app`. The container has no build
  step: it serves the files in that host directory.
- The env comes from `/home/ubuntu/merlin/merlin.env` (mode 600) via
  `run-merlin.sh`. `docker restart` does NOT re-read it, so an env change needs
  `run-merlin.sh`. The variable names are in `.env.example`.
- The Express server (`server/index.js`, Express 4, dependencies in
  `package.json` / `package-lock.json`) serves the static bundle with
  `express.static(dist)` at `/wizard`. It exposes:
  - `GET  /wizard/api/auth/me`
  - `POST /wizard/api/import-listing`
  - `POST /wizard/api/analyze-photos`
  - `POST /wizard/api/sharetribe/create-listing`
  - `POST /wizard/api/sharetribe/update-listing`
  - `POST /wizard/api/sharetribe/upload-images`
  - `GET  /wizard/{*path}` (SPA fallback)
- WEST nginx proxies `/wizard/` to `127.0.0.1:3099`.

## What is here
- `dist/`: the served bundle only (`index-4d5740d4.js`, css, `heic2any`,
  `index.html`, `logo.png`). The `.bak*` siblings on WEST are excluded.
- `server/`, `test/public-location.test.mjs`, `package.json`, `package-lock.json`,
  `run-merlin.sh`.
- `ical-swimply-sync.js` and `cron-ratings.mjs`: scripts that live in the same
  host directory.
- `MANIFEST.md5`: md5 of every file as deployed.

## Deliberately NOT here
- `merlin.env`: secrets.
- `node_modules`: reinstall with `npm ci`.
- `address-redaction-journal-*.json`: they hold real street addresses.
- `import-attempts.jsonl`: host data.
- `dbg-author.mjs`: a debug script.
- `.bak*` copies.

## One redaction
`server/index.js` on WEST contains a **hardcoded Google Maps API key** as a
fallback: `process.env.GOOGLE_MAPS_API_KEY || "<key>"`. The committed copy
replaces the key with `REDACTED_GOOGLE_MAPS_API_KEY`, so its md5 differs from
`MANIFEST.md5` for that one file. At runtime the env var is set, so behaviour
is identical. **Recommend rotating that key and removing the fallback on WEST.**

## Rollback
Copy `dist/` (and `server/` if it changed) back into `/home/ubuntu/merlin`. The
bind mount picks it up; restart the container only if `server/` changed. For
`server/index.js`, use the WEST copy or put the real key in `merlin.env`, since
this copy's fallback is redacted.

## Source
The original React/TypeScript source is `github.com/derekbowen/pool-rental-listing-wizard`
(public, 9 commits, last 2026-06-20 10:14 UTC). **The deployed bundle is ahead of it:**
- AI photo analysis (`/api/analyze-photos`)
- HEIC upload (`heic2any`)
- the 2026-09-16 countries patch
- the 2026-09-22 public-location privacy fix

The last two were patched directly into the minified bundle. Rebuilding from that
repo as-is would revert the privacy fix.
