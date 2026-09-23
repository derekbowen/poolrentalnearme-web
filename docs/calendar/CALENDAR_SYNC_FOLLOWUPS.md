# Calendar sync follow-ups (after the c199 outbound fix)

Status on 2026-09-23. The outbound feed (`/api/ical/:listingId/:token.ics`) is fixed and verified in
production as c199:
- event times are UTC `Z` instants
- blocks are read from every page, not just the first 100
- pending requests are exported

This doc covers what is still open. Nothing here is deployed.

## 1. Swimply → PRNM import: two known gaps

The code is `server/api/sync-ical.js` (manual "Sync now") and
`server/extensions/sms-messaging/mod/notify/swimply-resync.js` (4-hourly sweep, `SWIMPLY_RESYNC_ENABLED=true`).
Both are create-only and share one "covered" rule. Any overlap with an existing seats:0 exception counts
as covered:

```js
existing.some(x => new Date(a.start) < en && new Date(a.end) > s)   // sync-ical.js
```

### Gap A: a partial overlap leaves booked time open on PRNM
PRNM blocks 1–3 PM. A Swimply booking for 2–5 PM overlaps it, so it counts as "covered" and nothing is
created. **3–5 PM stays bookable on PRNM while it is booked on Swimply.** This is a double-booking risk.

### Gap B: a cancellation leaves a stale PRNM block
Swimply's feed has no `STATUS`; a cancelled booking simply disappears. The sync never deletes, so the
PRNM block stays forever. This costs revenue but carries no double-booking risk.

Facts checked against a real Swimply feed (Ledyard, read-only):
- 534 events, every one with a unique UUID `UID`.
- Properties present: `UID DTSTART DTEND DTSTAMP SUMMARY DESCRIPTION SEQUENCE`.
- Times are UTC `Z`.

### Proposed fix (branch `claude/calendar-sync-followups`)
`server/api-util/icalImportPlan.js` (pure) and `icalImportPlan.test.js` (8 tests) compute
`{ create, remove }`:
- **Create** only the uncovered parts of each event (interval subtraction), so Gap A is closed.
- **Remove** an exception only if the sync itself created it (recorded by Swimply `UID`), its UID is no
  longer in the feed, and it hasn't ended yet. This closes Gap B. Host blocks, bookings and past imports
  are never removed.
- It needs one new piece of state: which exceptions the sync created. Proposal: listing `privateData`
  `swimplyImports: { <exceptionId>: <uid> }`, written by the integration SDK. There is one writer (the
  sweep, plus manual sync, which it must share a lock with). Past entries get pruned.
- Wiring: both callers switch to `planImport`, then create/delete. Deletion is new; keep it behind
  `SWIMPLY_RESYNC_DELETE=true` and run one dry-run sweep that logs the plan before enabling it.
- Existing imports have no recorded UID, so they are never auto-removed. Only blocks created after
  rollout can be cleaned up automatically.

## 2. Weekly closed hours in the outbound feed

Problem: the feed exports holds and seats:0 exceptions, not the weekly `availabilityPlan`. Ledyard is
open 10:00–22:00, so Swimply shows 22:00–10:00 as open.

### Why a plain RRULE doesn't work here
- A weekly RRULE anchored to a **UTC** `DTSTART` stays fixed in UTC, so it drifts by an hour against
  local time at each DST change.
- Anchored to a **TZID** it follows local time, but Swimply ignores TZID. That is the exact bug c199 fixed.

### Proposal: RRULE split at DST boundaries, all UTC
For each weekly closed window, emit one `RRULE:FREQ=WEEKLY;UNTIL=<transition>Z` series per DST period
in the 365-day window, each with a UTC `DTSTART`. The UTC offset is constant inside each series, so the
instants are exact in every consumer that expands RRULE.
- Size: about 3 periods × the listing's weekly closed windows (typically 7–14), so roughly 20–45 VEVENTs
  per listing, not thousands.
- Days the host opens with a seats>0 exception: `EXDATE` the whole occurrence, plus a one-off UTC VEVENT
  for any part of it that is still closed.

### Compatibility, and the open question
- Google Calendar and Apple Calendar: `RRULE`, `UNTIL` and `EXDATE` are core RFC 5545 and supported.
- **Swimply: unknown.** Its own feed never uses RRULE, and we can't see its importer. It must be tested
  before relying on it: subscribe one test listing's feed containing a single weekly closed window, then
  confirm the next 3 weeks show blocked in Swimply.
- If Swimply ignores RRULE, fall back to literal UTC events for the next 60 days only. That is about
  60–120 events and is the form Swimply is proven to import.

### Risk
Not part of the emergency release. It adds many events to every feed, so ship behind a per-listing flag
after the Swimply test.
