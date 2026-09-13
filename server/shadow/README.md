# Shadow model of the transaction process

**Nothing in this directory executes anything.** No Stripe calls, no transitions,
no writes to Sharetribe or Supabase, no runtime code imports it. It computes what
Sharetribe *would* do, so we can diff against what Sharetribe *did*.

This is the foundation of C1/C2 in the exit plan — the hardest and longest-pole
part of replacing Sharetribe, and the one where being wrong costs real money.

## Why the scheduler is the point

Sharetribe runs a durable scheduler. Eight transitions in `default-booking` fire
on a timer with no human involved:

| From | Fires | When |
|---|---|---|
| `pending-payment` | `expire-payment` | entered + **PT15M** |
| `offer-sent` | `expire-offer` | entered + **P3D** |
| `requested` | `expire-no-payment` | min(entered + P6D, bookingStart + P1D, **bookingEnd**) |
| `preauthorized` | `expire` | min(entered + P6D, bookingStart + P1D, **bookingEnd**) |
| `accepted` | `complete` | bookingEnd + **P2D** ← **releases the payout** |
| `delivered` | `expire-review-period` | bookingEnd + **P7D** |
| `reviewed-by-customer` | `expire-provider-review-period` | bookingEnd + P7D |
| `reviewed-by-provider` | `expire-customer-review-period` | bookingEnd + P7D |

PRNM has no equivalent for any of it. A missed `complete` is a host who is never
paid, and nothing surfaces it.

## Files

| File | |
|---|---|
| `processEdn.js` | Parser for `process.edn`. Pure: text in, data out. |
| `bookingProcess.data.json` | **Generated.** The transition table. |
| `generate.js` | Regenerates it: `bun server/shadow/generate.js` |
| `bookingProcess.js` | The model: replay, scheduler evaluation, action lookup. Pure. |
| `bookingProcess.test.js` | 57 tests, including the fidelity check below. |

Run with `npx jest server/shadow`.

## Fidelity is enforced, not assumed

The table is generated from
`ext/transaction-processes/default-booking/process.edn`, and the test re-parses
that same `.edn` and asserts the committed table still matches it exactly. The
two cannot drift. If the test fails, either the process changed — re-run
`generate.js` — or the table was hand-edited.

That `.edn` is itself a reference copy; the live process lives in Sharetribe
Console (see `ext/transaction-processes/README.md`). **Verifying the copy against
Console is still outstanding** and is the one thing that would make this model
authoritative rather than merely self-consistent.

The hand-maintained client mirror `src/transactions/transactionProcessBooking.js`
was also checked against the `.edn` while building this: 31/31 transitions and
31/31 graph edges match, zero drift. It is correct and was left alone.

## Corrections to the audit

Building this turned up three things `SHARETRIBE-EXIT-AUDIT.md` got wrong.

**It is 31 transitions, not 38.** The audit's number came from counting keys
rather than reading the definition. 15 states was right.

**The expiry rule is not "P3D after request".** That conflated two different
transitions. `expire-offer` is P3D from `offer-sent`. The expiry that applies to
a *booking* — `expire` and `expire-no-payment` — is the **earliest of three**
deadlines: entered + P6D, bookingStart + P1D, and bookingEnd.

**One arm of that rule is dead for every booking PRNM sells.** `bookingEnd` is
always earlier than `bookingStart + P1D` for any booking shorter than 24 hours,
and production runs a single listing type, `hourly-pool` with unit type `hour`.
So in practice the rule is `min(entered + P6D, bookingEnd)`. The middle arm would
only bite if a multi-day unit type were ever configured — worth knowing before
anyone adds one. Both facts are pinned by tests.

## Design notes

**`replay()` returns errors, it does not throw.** The purpose of replaying real
transactions is to find the histories this model cannot explain; throwing would
discard the partial walk that says *where* it broke. It reports
`unknown-transition`, `illegal-transition` (with the state it expected) and
`malformed-entry`, and accepts both bare and `transition/`-prefixed names, and
both strings and `{transition}` objects — which is how `st_transactions.transitions`
stores them.

**The scheduler returns `null` rather than guessing.** If a timepoint is missing,
or if any arm of a `min()` is unknown, there is no answer — because the unknown
arm could be the earliest. Inventing a due time is the one failure mode that must
not happen here: it would fire a payout or an expiry at the wrong moment. Tests
pin both cases.

**`parseDurationMs` refuses months, years and weeks.** Sharetribe's periods are
exact offsets and a month is not a fixed number of milliseconds. Quietly treating
one as 30 days would drift the scheduler by days on exactly the transitions where
money moves, so it throws instead.

**`now` is always a parameter.** Nothing here reads the clock, so the model can
be run against historical transactions and the tests are deterministic.

## What is not built

- **No replay against real data yet.** `st_transactions.transitions` holds the
  full history of every real transaction, so every one can be replayed through
  `replay()` and divergence counted. That harness needs Supabase, which is not
  reachable from the audit environment. It is the obvious next step and the first
  real evidence of whether this model matches production.
- **No Stripe shadow.** `stripeActionsFor()` is the groundwork — it says which of
  the five money-moving actions each transition runs — but nothing computes
  amounts or asserts against real PaymentIntents. That is C2.
- **No `additional-charge` process.** The parser handles it; the table is not
  generated. One line in `generate.js` when wanted.
- **Nothing schedules anything.** This computes due times. Actually firing them
  needs a durable job runner, and that is Phase 3 of the plan, not this.
