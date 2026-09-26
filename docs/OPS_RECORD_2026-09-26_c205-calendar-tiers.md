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
