# Homepage hero video (approved 2026-10-14, not yet deployed)

Derek approved the homepage-hero option on 2026-10-14 ("Homepage hero").
This folder holds everything needed to ship it. It has **not** been
deployed: this session had no `PRNM_AWS_*` credentials, so neither box was reachable.

## What changes on the site

- **Video files:** six new static files go on WEST in `/var/www/prnm-tools/hero/`. nginx already serves that folder at `/tools/hero/` through `location ^~ /tools/`.
- **Homepage code:** one component is added to EAST `src/components/home-page-winter.tsx`, with one `<HeroVideo />` line placed right after the hero's `</picture>`. Nothing else on the page changes. The server-rendered photo is still the first paint. The video loads client-side only and fades in once it is playing. It is skipped for `prefers-reduced-motion` and Save-Data, and slow (2g/3g) phones get the 360p file. The dark gradient over the hero stays as it is.

## The video (v3)

- **Source material:** five PRNM listing photos, in this order:
  1. **006** "Welcome to The Grajales Patio"
  2. **124** "Tropical Oasis — Patio, Pool & Spa"
  3. **160** "A Little Piece of Heaven"
  4. **080** "Backyard Bliss"
  5. **191** "Your Private Paradise", at night
- **Photo rules:** no people and no AI imagery. Using host listing photos is covered by Terms of Service §13.2 (user-content licence).
- **Do-not-contact check:** every host was checked against the two do-not-contact account ids (687d8b7e…, 6859ec3a…). None matched.
- **Why earlier versions were rejected:**
  - v1 included a likely stock photo, a readable Disneyland sign, a soft upscaled photo and a cleaner hose.
  - v2 had hoses in the water in 095 and 161, plus soft sources.
- **Independent reviews:** three rounds in total. The v3 content review found no blockers and no should-fixes. The v3 technical review's one blocker was quality sagging before the loop; it is fixed by starting the loop mid-shot and boosting bits on the final frames.
- **Format:** an 18.5 s seamless loop at 30 fps with BT.709 colour tags. H.264 is High@4.0. Each file is a single GOP (2-pass), so there are no mid-loop keyframe snaps.

| File | Size | Used by |
|---|---|---|
| `hero-desktop.mp4` | 1920×1080, 3.5 MB | desktop |
| `hero-desktop.webm` | 2.9 MB | fallback, only for browsers without H.264 |
| `hero-mobile.webm` / `.mp4` | 720×1280, 2.0 / 2.3 MB | phones |
| `hero-mobile-xs.webm` / `.mp4` | 360×640, 0.42 / 0.46 MB | phones on 2g/3g |
| `hero-*-poster.*` | — | not used by the component; kept for a later swap of the hero image |

The benchmark is Swimply's hero: desktop 1920×1080, 18 s, 3.7 MB; mobile 360×640, 3.7 MB mp4 / 2.3 MB webm / 0.4 MB xs.

**Reproduce:** `python3 render.py desktop|mobile <ffmpeg args>` builds the masters from the listing photos, then `./encode.sh <dir>` produces the deliverables.

**Measured on v3:**
- **Loop seam:** the quality jump is at most 0.8 dB on the MP4s and at most 2.9 dB on the WebMs.
- **Quality floor:** at least 31 dB on desktop and mobile, and about 26 dB on the 360p xs files.

## Verified before shipping (local)

- v3 deliverables: see measurements above; 3rd review content lens = ship-ready.

- **Patch dry-run:** the patch was run against the repo mirror `docs/ops/winter-home/home-page-winter.tsx`. It inserts exactly one `<HeroVideo />`, a second run refuses, and the result transpiles with bun.
- **Headless Chromium, desktop:** the video plays and fades in. This browser has no H.264, so it correctly falls back to the WebM; real Chrome, Edge and Safari use the MP4.
- **Headless Chromium, mobile:** the WebM plays and fades in.
- **Headless Chromium, reduced motion:** no video element is created.
- **Console:** no errors in any of the three runs.

**The repo mirror is stale.** The live hero has `id="winter-hero"` and a different search form, so the EAST script's DRY run is mandatory: it checks every anchor against the live file.

## Ship order (needs `PRNM_AWS_*` in the environment)

1. Commit and push these files. Note the commit SHA, the md5s of `files/*` and the sha256 of `HeroVideo.tsx.snippet`.
2. **WEST.** Fill `SHA` and `FILES` in `west_install_videos.py`, then run `python3 ops/runners/ssm_runx.py ops/east/hero-video/west_install_videos.py`.
   1. Run it once with `DRY=True`: it downloads and md5-verifies the files without installing anything.
   2. Run it again with `DRY=False`: it installs atomically, then checks 200 + `video/*` + range 206 through local nginx.
3. **Public check.** `curl -I https://www.poolrentalnearme.com/tools/hero/hero-desktop.mp4` should return 200 `video/mp4`.
4. **EAST.** Fill `SHA` and `SNIP_SHA256` in `east_apply_hero_video.py`, then run `python3 ops/runners/east_runx.py ops/east/hero-video/east_apply_hero_video.py`.
   1. Run it once with `DRY=True`: it is read-only and prints the anchor checks, the diff, memory and pm2 state.
   2. Run it again with `DRY=False`: it backs up, patches, runs `npm run build` and `pm2 restart fresh-web` (as ubuntu), then confirms the H1 and that the bundle references `/tools/hero/hero-desktop.mp4`. On any failure it restores the backup, rebuilds and restarts.
5. **After the flip.** Pull the live `home-page-winter.tsx` back into `docs/ops/winter-home/` and push, so the mirror matches production.

**Rollback:**
- **EAST:** restore `home-page-winter.tsx.bak-<ts>`, rebuild, then `sudo -u ubuntu PM2_HOME=/home/ubuntu/.pm2 pm2 restart fresh-web`.
- **WEST:** the files can stay; nothing references them once EAST is rolled back.
