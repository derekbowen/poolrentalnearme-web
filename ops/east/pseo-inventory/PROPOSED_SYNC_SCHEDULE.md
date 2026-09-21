# Proposed: automatic `synced_listings` refresh — NOT INSTALLED

Prepared 2026-09-21. **Nothing below has been activated.** It needs a specific GO.

This is deliberately independent of the email / SMS / host-lifecycle workers: its
own crontab entry, its own lock file, its own log. It shares no scheduler, no
lock and no kill switch with them.

---

## What it runs

```
POST http://127.0.0.1:3000/api/public/hooks/sync-listings
header: x-admin-token: <SUPABASE_SERVICE_ROLE_KEY from /home/ubuntu/fresh-web/.env>
```

That is the existing, already-deployed hook (`runListingSync`). No new ingestion
path, no new code to schedule.

## Measured inputs to the cadence decision

| input | measured value |
|---|---|
| Full sync wall time | **3.7 s** (199 listings, 3 runs measured: 3.5 s / 3.7 s / 3.7 s) |
| Sharetribe API calls per run | **2** (`PER_PAGE = 100`, 199 listings → pages 1–2) |
| Listings currently tracked | 199 (124 eligible) |
| Catalogue change rate | 0 net change over 2026-09-18 → 2026-09-21 |
| City-page edge cache TTL | **600 s** (Cloudflare cache rule) |

I have **not** verified Sharetribe's documented Integration API rate limit, so I
am not quoting one. What I can say from measurement: at 2 requests per run, even
a 5-minute cadence is 24 requests/hour, which is negligible against any plausible
limit. Cadence here is driven by freshness need, not by API budget.

## Recommended cadence: **every 15 minutes**

Rationale: city pages sit behind a 600 s edge cache, so refreshing faster than
~10 minutes cannot surface sooner anyway. A 15-minute cadence bounds worst-case
staleness at **15 min (sync) + 10 min (edge) ≈ 25 min**, at a cost of 8 API
requests/hour and ~15 s of compute/hour.

Conservative alternative: **hourly** (`7 * * * *`). Given the catalogue did not
change at all over three days, hourly is defensible and I would not argue
against it. Anything slower than hourly starts to risk a closed pool being
displayed for most of a day, which is the failure mode that matters.

## The crontab entry (user `ubuntu` on EAST)

```cron
# PRNM pSEO inventory refresh — updates public.synced_listings from Sharetribe.
# Independent of the email/SMS/lifecycle workers by design.
# flock prevents overlap: a run that is still going blocks the next tick
# instead of racing it (two concurrent runs could interleave the tombstone
# sweep against a partial page set).
*/15 * * * * /usr/bin/flock -n /home/ubuntu/locks/prnm-listing-sync.lock /home/ubuntu/bin/prnm-listing-sync.sh >> /home/ubuntu/logs/listing-sync.log 2>&1
```

## The runner script — `/home/ubuntu/bin/prnm-listing-sync.sh` (mode 0750, owner ubuntu)

```bash
#!/usr/bin/env bash
# PRNM pSEO inventory refresh. Invoked only by cron via flock.
set -uo pipefail

ENV_FILE=/home/ubuntu/fresh-web/.env
STOP_FILE=/home/ubuntu/locks/LISTING_SYNC_STOP
TS() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }

# Kill switch: `touch` the stop file to halt the schedule without editing cron.
if [ -f "$STOP_FILE" ]; then
  echo "$(TS) skip: STOP file present"
  exit 0
fi

TOKEN=$(grep -m1 '^SUPABASE_SERVICE_ROLE_KEY=' "$ENV_FILE" | cut -d= -f2-)
if [ -z "$TOKEN" ]; then
  echo "$(TS) FAIL: no admin token in $ENV_FILE"
  exit 1
fi

BODY=$(curl -sS --max-time 300 -w '\nHTTP=%{http_code}' \
  -X POST -H "x-admin-token: $TOKEN" \
  http://127.0.0.1:3000/api/public/hooks/sync-listings)

CODE=$(printf '%s' "$BODY" | sed -n 's/.*HTTP=\([0-9]*\)$/\1/p')
JSON=$(printf '%s' "$BODY" | sed '$d')

if [ "$CODE" != "200" ]; then
  echo "$(TS) FAIL http=$CODE $JSON"
  exit 1
fi

echo "$(TS) ok $JSON"
```

Token handling: read from `.env` at run time and never written to disk or into
the log — only the JSON result line is logged.

## Failure reporting

Three layers, no new infrastructure:

1. **`listing_sync_log`** already records every run: `status`, `total_processed`,
   `failed_count`, `error_message`. This is the authoritative record and it is
   queryable. The run that fails now also records the tombstone-sweep failure,
   which it previously swallowed (fixed this pass).
2. **`/home/ubuntu/logs/listing-sync.log`** — one line per tick, `ok` or `FAIL`
   with the HTTP code.
3. **A stale-data query** you or I can run on demand:
   ```sql
   select max(finished_at) last_ok
   from listing_sync_log where status = 'success';
   -- alert if older than ~2x the cadence
   ```
   I have deliberately **not** wired this to email or SMS, since that would
   cross into the outbound-messaging systems this is meant to stay clear of.
   If you want an alert channel, say which one and I will propose it separately.

## Overlap prevention

`flock -n` on `/home/ubuntu/locks/prnm-listing-sync.lock`. `-n` means a tick that
finds the lock held exits immediately rather than queueing, so a slow run can
never stack up behind itself. At 3.7 s per run against a 15-minute tick this
should never trigger, but it is the guard that makes the cadence safe to lower
later.

## Rollback

```bash
touch /home/ubuntu/locks/LISTING_SYNC_STOP     # immediate halt, keeps cron entry
# or, to remove entirely:
sudo -u ubuntu crontab -l | grep -v prnm-listing-sync | sudo -u ubuntu crontab -
rm -f /home/ubuntu/bin/prnm-listing-sync.sh
```

Removing the schedule does not touch data. `synced_listings` simply stops being
refreshed and city pages keep serving the last synced state.

## Install steps (for when this is approved)

```bash
mkdir -p /home/ubuntu/bin /home/ubuntu/logs /home/ubuntu/locks
install -m 0750 -o ubuntu -g ubuntu prnm-listing-sync.sh /home/ubuntu/bin/
sudo -u ubuntu bash -c '(crontab -l 2>/dev/null; cat prnm-listing-sync.cron) | crontab -'
sudo -u ubuntu crontab -l | grep listing-sync     # confirm exactly one entry
```

Then verify: wait one tick, confirm a new `listing_sync_log` row with
`status='success'`, and confirm `/home/ubuntu/logs/listing-sync.log` has an `ok`
line. Confirm no other cron entry was disturbed.
