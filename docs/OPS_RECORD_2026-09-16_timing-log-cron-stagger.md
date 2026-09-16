# 2026-09-16 — WEST timing log + cron stagger (Derek GO after the 2026-09-15 alert)

## 1. nginx timing access log

Live: `/etc/nginx/conf.d/prnm-timing.conf` (mirror: `ops/monitors/west/nginx/prnm-timing.conf`)
plus four lines in `/etc/nginx/sites-enabled/default` inside the `www.poolrentalnearme.com`
server block, right after `server_name`. Backup: `/etc/nginx/config-backups/default.bak-timinglog-20260916-040246`.

```
+    access_log /var/log/nginx/access.log;
+    access_log /var/log/nginx/prnm_timing.log prnm_timing;
```

The first line restates the http-level default (a server-level `access_log` replaces the
inherited one, it does not add to it), so `access.log` keeps its combined format.
`nginx -t` ok; `systemctl reload nginx` 04:02:46Z (master PID 1474885 unchanged, workers
re-spawned). Routing unchanged (diff is the four lines above). Logrotate: the nginx stanza
globs `/var/log/nginx/*.log`, so `prnm_timing.log` rotates daily with the others (verified
with `logrotate -d`). File set to `www-data:adm 0640` like its siblings.

Record fields: `time ip "request" status bytes rt= uct= uht= urt= ua= us= host= "ua"`.
`rt` = whole request as seen by nginx (client connect → last byte sent); `uct` = TCP connect
to the upstream; `uht` = until the upstream's response headers arrived (for the marketplace
that is the SSR render); `urt` = until the upstream finished sending; `ua`/`us` = which
upstream and its status. `rt - urt` is time spent on the client side (slow client, TLS).

Sample /s at 04:02:59Z: `rt=0.514 uct=0.000 uht=0.506 urt=0.515 ua=127.0.0.1:4000 us=200`.

## 2. cron stagger (in-container `docker exec … bun` jobs that fired at :00/:30)

Backups: `/home/ubuntu/cron-backups/{ubuntu,root}.crontab.20260916-040120`. Only the minute
field changed; commands, logs, kill switches, and cadence are identical.

| job | user | before | after |
|---|---|---|---|
| stuck-detector | ubuntu | `*/15 * * * *` | `3,18,33,48 * * * *` |
| cart-recovery | ubuntu | `*/15 * * * *` | `8,23,38,53 * * * *` |
| switchy send + outreach (`run_switchy_jobs.sh`) | root | `*/30 * * * *` | `13,43 * * * *` |
| switchy click snapshot (`run_click_snapshot.sh`) | root | `0 */6 * * *` | `28 */6 * * *` |

Minutes were chosen to avoid each other, every multiple of 5 (the `*/5` switchy stats pass,
db-watchdog, sms-extras), every multiple of 10 (the smoke monitor), and :15 (lead-nudge).
Not changed: switchy stats `*/5` (3 s runs, cannot avoid :00 at that cadence), warm-digest
`0 16 * * *` (daily), lead-nudge `15 * * * *`, weekly stats `0 20 * * 4`, smoke monitor `*/10`.

## 3. db-watchdog PermissionError

Historical, already closed. `run.log` was last written 2026-08-08 05:40:14Z; its 22,280 lines
are 5,570 identical tracebacks (one per 5-min run) from the watchdog's first run
(2026-07-19 20:55Z, directory mtime) until 2026-08-08 05:40Z. `state.json` is now
`ubuntu:ubuntu 0664` and is rewritten every 5 minutes (mtime 04:00:03Z today); the cron
runs as ubuntu. No audit trail of the original owner exists; the only consistent explanation
is that `state.json` was created by a root-run test before the first cron run and chowned on
2026-08-08. Impact while broken: `fails` never persisted, so the DOWN text could never fire
(the crash was after the health probe, so no false alerts either). No change made.

## 4. sitemap: last-good-count fallback (Derek GO, deployed 08:25Z)

fresh-web `b2d42ea` (`src/routes/sitemap[.]xml.ts`): a count that fails twice now reuses the
last value that succeeded in this process and logs `using last good count N`; the
page-1-only fallback applies only before any count for that entry has ever succeeded.
Motivation: 6 double failures in ~3,600 counts over 28h with an empty-message error while
the same PostgREST query answers in 60-80 ms by hand. Deployed through `ops/deploy-east.sh`
(typecheck gate PASS, all 9 gates PASS, drift check: verified SHA = built = live).
