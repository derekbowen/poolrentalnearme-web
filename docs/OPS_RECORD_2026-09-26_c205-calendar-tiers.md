# c205-cal-tiers — calendar exception reconcile + duration-tier pricing (2026-09-26)

Commits `6345ee2`, `7e4a0e3`. Gated flip 02:22Z; MAIN `poolrentalnearme-production` =
`c205-cal-tiers`, rollback `poolrentalnearme-production-rollback` = `c204-listing-canonical` (:3000).
Live `/login` bundle `index-BKBSbNWP.js` = MAIN's.

## Root causes
- Calendar blocks were never tracked: `integration.js` wraps the SDK (denormalised
  responses), and the endpoint read `create()`'s id from `data.data` → always undefined →
  `calendarExceptionIds` always `{}`. The panel also rewrote `publicData.availability`
  wholesale, so any tracking there could be clobbered, and the server's own write could
  revert a newer `dateOverrides`.
- `lineItems.js` charged the guest-selected price variant with no duration check.

## Fix
- Tracking in `privateData.prnmCalendarExceptionIds` (server-only). Reconcile against actual
  exceptions; delete only tracked-and-unwanted; never touch untracked; block around foreign
  blocks; per-listing serialisation; reconciled state returned.
- Duration tiers selected from booked hours (`durationTiers.js`).

## Gate (in addition to all prior markers, fee math, payment endpoints)
- anon `calendar-apply-exceptions` → 403.
- Real SDK plan on 6a5db0ae: desired 10, delete 0, already blocked 10, create 2
  (Oct 1 05:00–10:00Z and 11:00Z–Oct 2 05:00Z, around the host's manual 10–11Z block).
- Real listing pricing: 6a5db0ae 2h = $90 (Per hour), 3h = $75 (3+ hours); standard 6aa8ae63 unchanged.
- The first gate run aborted on the SDK-shape bug above (caught before any traffic moved).

## Data change (Derek GO)
`ops/audits/calendar_adopt_tracking.py` APPLY: 287 PRNM-created blocks (Integration client per
event log + exact match of the current schedule) recorded in privateData tracking on 6 listings.
No exception created or deleted. Audit before/after:
`/home/ubuntu/audits/calendar_orphans_20260926T022315Z.json` → `…T022426Z.json`
(tracked 0 → 287; ambiguous 27, manual 1 unchanged).

## Open
- 6a5db0ae Oct 1 (closed by host) is still bookable outside 10–11Z until the next calendar
  save for that listing runs the new reconcile.
- 27 ambiguous blocks on 4 feed listings; Detroit 6a93e608 is blocked Sep 2026–Aug 2027.
- Build tree `package.json` differs from repo (not shipped in c205; needs a drift check).

## 2026-09-28 follow-up
- 6a5db0ae Oct 1 fixed directly (not via reconcileListing), see verification below.
- Found: the deployed planner schedules a tracked block that ended <24h ago for deletion
  (query window reaches back a day; desired excludes the past). Fixed in `e019590`.

## 2026-09-29 — Oct 1 remediation verified (read-only, deployed c205 code in MAIN)

| | NEW-1 `6abab79a` | NEW-2 `6abab79b` | host `6ab6a56d` | ref: normal save `6a5db390` (Sep 29) |
|---|---|---|---|---|
| listing | 6a5db0ae | 6a5db0ae | 6a5db0ae | 6a5db0ae |
| type / attrs | availabilityException, {start,end,seats} | same | same | same |
| seats | 0 | 0 | 0 | 0 |
| UTC | 10-01 05:00 → 10:00 | 10-01 11:00 → 10-02 05:00 | 10-01 10:00 → 11:00 | 09-29 05:00 → 09-30 05:00 |
| America/Chicago (CDT) | Oct 1 00:00 → 05:00 | Oct 1 06:00 → Oct 2 00:00 | Oct 1 05:00 → 06:00 | Sep 29 00:00 → Sep 30 00:00 |
| created by (event log) | integration API, PRNM client | same | **marketplace API, web client f812b9fc** | integration API, PRNM client |
| tracked | `privateData.prnmCalendarExceptionIds["2026-10-01"]` | same | not tracked | `["2026-09-29"]` |

Sharetribe exceptions carry no metadata field; ownership is exactly (a) creating client in the
event log and (b) presence in `prnmCalendarExceptionIds`. Both new blocks match the normal
save path on both. Simulated reconcile (planReconcile, no mutations sent):

- **No change** → 0 deletes, 0 creates (the new blocks are recognised as PRNM-managed).
- **Oct 1 override removed** → DELETE `6abab79a`, DELETE `6abab79b`; host `6ab6a56d` untouched;
  no other block touched.
- **"Closed" unticked in the panel** (row keeps open 9 / close 21 — what the UI actually saves):
  DELETE `6abab79b`, KEEP `6abab79a` (00:00–05:00 is still wanted before 9am), CREATE
  06:00–09:00 and 21:00–24:00 Chicago; host block untouched. So reopening via the UI leaves the
  day open 9am–9pm; a full 24h reopen requires removing the row/hours too.

## Past-block invariant (queued: `e019590` + `4724729`, not deployed)
Reconciliation never deletes or rewrites a block whose interval has ended, and PRNM-created past
blocks keep their tracking. `e019590` stops the <24h deletion; `4724729` stops each save from
dropping tracking ids of ended/out-of-window blocks (deployed c205 rebuilds tracking from
scratch, so e.g. 6a5db0ae's two Sep 27 ids would be dropped from tracking — the blocks
themselves are not touched). Tests: ended yesterday, ended 1 min ago, out-of-window past,
host past, active+wanted, starting later today, future, DST 25h/23h, planner-level. 5 fail on
deployed c205, 3 on `e019590` alone; 264 jest + 65 bun pass.

## c205 health (2026-09-28/29) — evidence actually verified
- MAIN `c205-cal-tiers` up since 2026-09-26 02:22Z, **0 restarts**; nginx → :4000; live
  `/login` bundle hashes = MAIN's.
- **0 5xx** in nginx since the flip. One app-log TypeError (`emailVerification.duck`, null
  currentUser during SSR) — pre-existing, not in c205's diff.
- **Real price previews** (`transaction-line-items`, browser UAs): 200.
- **Real booking requests** (`initiate-privileged`): 200s continue as before; none since the
  flip in the 26–28 window checked, earlier days 1–5/day — re-check before claiming.
- The 144/day 400/404 pairs are the WEST smoke monitor (below), present since 2026-09-14.
- **Calendar-save path: deployed and passing tests, NOT production-proven** — 0 calls to
  `/api/calendar-apply-exceptions` since the flip. Needs its first real host save.

## Monitor noise — proposal (nothing changed)
Source: `ubuntu` crontab `*/10 * * * * python3 /home/ubuntu/nginx-smoke-alert.py`
→ `nginx-smoke-test.sh` (mirrored in `ops/monitors/west/`). Sections 2/2b GET and
`POST {}` the three booking endpoints to prove they reach the marketplace (not fresh-web).
Each run = 3 GET 404 + 3 POST 400 per endpoint set; the POST to `transaction-line-items`
also logs `LINEITEMS_400_DIAG` (144/day) because the route only parses transit bodies.
nginx has no per-path rule for these endpoints — all go through `location /api/`.

Proposed (ship with a normal release; then switch the monitor):
1. `GET /api/health/booking` in the marketplace (under `/api/`, avoiding the `/api/public/`,
   `/api/admin`, `/api/certificates` carve-outs so it proves the same routing). Returns 200 JSON
   `{ ok, release, checks }` with no external calls and no secret values:
   `lineItems` = `transactionLineItems` on a fixed synthetic hourly listing equals expected
   cents incl. the 15% guest fee; `integrationSdk` configured (bool); `stripeKey` present (bool).
   Non-200 or `ok:false` → alert class API.
2. Smoke test: replace sections 2/2b with one probe of that endpoint + a check that the body is
   the marketplace's JSON (not fresh-web). Keeps routing coverage, removes ~864 intentional
   error responses/day and all `LINEITEMS_400_DIAG` noise.
Alternative without a release: a valid transit-encoded `transaction-line-items` request for a
real listing (read-only speculative pricing, 200) — rejected as primary: couples the monitor to
one listing's data and adds 144 Sharetribe API calls/day.
