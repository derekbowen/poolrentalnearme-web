# c206-ceo-cal-health release + build-caused outage, 2026-10-04

## Outage (caused by the release build)
- 02:01–02:12 UTC: WEST (t3.medium, 3.8 GB) stopped serving. The first c206 `docker build`
  (BuildKit, no memory cap) ran beside MAIN, whose bun process had grown to ~950 MB over 8 days
  (305 MB after restart). Memory thrash → kernel OOM-killed MAIN's bun at 02:11:26 → instance
  power-cycled from outside (`systemd-logind: Power key pressed` ×4 from 02:09, i.e. EC2-level
  reboot), back up 02:12:01; all containers restarted on c205 via restart policy.
- nginx: almost no requests logged 02:01–02:10, 53 × 5xx at 02:11–02:12, normal from 02:12.
- **Rule from now on:** release builds run memory-capped
  (`DOCKER_BUILDKIT=0 docker build --memory=2500m --memory-swap=2500m`, test run `--memory=1200m`),
  rollback container stopped during the build (the gate removes it anyway). Verified: a 1.8 GB cap
  killed only the build (prod stayed 200); at 2.5 GB the build passed, MemAvailable never < ~930 MB.
- Follow-up (not done): MAIN memory growth 305 MB → ~950 MB over 8 days — check for a leak.

## Release
Image `c206-ceo-cal-health`, flipped 02:22:51Z; rollback `c205-cal-tiers` on :3000. Live bundle =
MAIN's. Shipped: `e019590`, `4724729`, `70e3243` (calendar: ended blocks never touched, bounded
tracking, size budget, undo), `bfd7819` (GET /api/health/booking, {ok} only), `85f392b` + `ca9844c`
(/operating-ceo page + POST /api/ceo-application, hero art). New container env: EMAILIT_API_KEY
(from nginx-smoke.env; env preflight lists it as allowed extra). Not shipped: package.json (build
tree drift, test registration only); ceo-application.test.js is jest-only (shipped, not in bun list).
Build-stage tests 138 pass. Gate: all c205 checks + page/noindex, form 400/honeypot, health {"ok":true}.

Post-flip: /operating-ceo 200, `noindex, follow`; /api/health/booking 200 via nginx; one test
application (name "PRNM deploy test (please ignore)", ref 568f6887) → emailed to
derek@poolrentalnearme.com + SMS to Derek, no SMS failure logged.

Not changed: WEST smoke monitor (nginx-smoke-test.next.sh ready to swap in).
