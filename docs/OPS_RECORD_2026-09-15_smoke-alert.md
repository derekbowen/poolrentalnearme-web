# 2026-09-15 — "routing regression: social/booking endpoint down" alert

**What it was.** One `nginx-smoke-alert.py` run (cron `*/10`, WEST) at 18:00:29Z failed
on its `/s` check: `curl --max-time 15 /s` timed out with 0 bytes (nginx logged `499 /s`
from 13.56.113.85). Every `/api/*` social/booking/carve-out check in the same run passed.
The subject line was hardcoded in v1 of the alert script, so any failure read as
"social/booking endpoint down". Runs at 17:50 and 18:10 onward all PASS.

**Not a routing change.** `nginx -T` unchanged since 2026-09-07 (`/api/` → `upstream web`
:4000; `/api/public/`, `/api/admin`, `/api/certificates`, `^~ /api/public/hooks` → EAST).
nginx itself was restarted 06:01:57Z by unattended-upgrades (1.18.0-6ubuntu14.20 → .21);
71 smoke runs passed between that restart and the failure. Marketplace container up since
09-02, RestartCount 0. No 5xx / upstream-timeout lines in nginx error.log at 18:00.
Sharetribe status page: no incidents. EAST last restarted 03:04Z (c399489 deploy).

**Root cause of the 15 s stall: NOT PROVEN.** The access log has no `$request_time` /
`$upstream_response_time` and the bun server logs no requests, so nginx-vs-SSR-vs-API
cannot be attributed. Correlation only: at 18:00:01 nine cron jobs fired, four of them
`docker exec … bun` inside the production container (stuck-detector, cart-recovery,
switchy stats/send, and the 6-hourly click snapshot which ran 18:00:01→18:00:35, spanning
the `/s` request window 18:00:14→18:00:29). A 45-min probe afterwards showed `/s` TTFB
rising from ~0.55 s to 1.6–1.7 s (load 1.0–1.6 on 2 vCPU) at the :00/:30 bursts, never
near 15 s. Same timeout-on-/s mode seen once before (2026-07-07 02:01Z). Real users hit
499 on `/s*` 1–7 times/day (14-day log), so slow `/s` renders do recur at low rate.

**Change made (monitor only, no nginx/app change):** `ops/monitors/west/` v2 of the smoke
test + alert, installed on WEST (v1 kept as `*.prev-20260915-231152.*`). Failures now carry
a class (ROUTING / API / FRONTEND / ASSET / BACKEND / TIMEOUT / LATENCY), `/s` is retried
once on timeout, booking `/api/*` POSTs must return `application/json`, css **and** js
from the live `/s` HTML must serve 200 with the right type, `/s` TTFB is logged on every
PASS and fails above 8 s. Subject line names the class(es).

**Proposed, not done (needs GO):** add a timing access log on WEST
(`$request_time $upstream_response_time`) so the next stall can be attributed; stagger the
four in-container bun cron jobs off minute :00/:30.
