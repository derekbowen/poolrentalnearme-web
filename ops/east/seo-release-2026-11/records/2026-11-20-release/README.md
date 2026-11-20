# EAST release of seo/release-2026-11, 2026-11-20

`east_seo_release.py` through `ship.py`, constants `RELEASE_SHA = 9b2f432d7e665ef59f433fece183035d3bf260b8`,
`RELEASE_BRANCH = seo/release-2026-11`, `CURRENT_SHA = 77028454655e…`. Outputs: `plan-output.txt`, `go-output.txt`.

- PLAN (read-only): OK. MemAvailable 2,062 MB, build cap 1,550 MB RAM + 1,536 MB swap, 128 files changed vs HEAD,
  no lockfile change, none of the five EAST-only files touched.
- GO: `RESULT: RELEASED 9b2f432d7e66 over 77028454655e`. Typecheck (baseline), build in the copy, smoke on :3005,
  dist swap, proven pm2 restart, live stamp = release, verify:production, check:price-variants,
  check:production-drift: all PASS. Build scope memory peak 1,557 MB (at the cap; swap used). Tracker regression 9/9.
  Live build stamp: built 2026-11-20T20:10:10Z, dirty = exactly the five pinned EAST-only files.
- Step 3.2: /s, /login, /signup, /wizard/ and a listing page all 200; WEST marker on /s and /login unchanged
  (`assets/index-DACcM51y.js` before and after).
- Step 3.3: sitemap index 15 children; /sitemap-directory.xml 410; comparisons sitemap 1,013 URLs.
- Step 3.4: pm2 env names live 67 = dump 67, no difference.
- Step 3.1 (full tracker, after the 600 s edge cache): see `tracker.txt` once added.

Rollback: `MODE = "ROLLBACK"` in a copy of the script (state in `/home/ubuntu/fresh-web.release-state.json`,
previous dist in `/home/ubuntu/fresh-web/dist-prev-deploy` and `/home/ubuntu/fresh-web-release-backup/`).
