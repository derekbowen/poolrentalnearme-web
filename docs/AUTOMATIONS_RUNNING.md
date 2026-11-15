# Automations that keep Pool Rental Near Me running

Written 2026-11-15 for a person or AI taking over operations. It lists everything
that runs on its own: what it does, where it runs, when, who it messages, and how
to stop it.

**How much of this was checked today:**
- **Checked live 2026-11-15 [V]:** the database, the Make.com account, the Claude
  scheduled tasks, and the public site.
- **From the ops records [R]:** the server crontabs, containers and pm2. This
  session cannot log in to the servers. The records are
  `docs/OPS_RECORD_2026-09-07.md` and `docs/OPS_RECORD_2026-09-16_timing-log-cron-stagger.md`.
- **Before changing anything, re-read on the box:** `crontab -l` (ubuntu and root),
  `ls /etc/cron.d`, `docker ps`, `sudo -u ubuntu PM2_HOME=/home/ubuntu/.pm2 pm2 ls`,
  `systemctl list-timers`.

**Rules that apply to every one of these (from CLAUDE.md):**
- Any outbound email or SMS to real users needs Derek's fresh, explicit GO.
- Report every scheduled run to Derek, including runs that send nothing.
- Disclose any new schedule in the same message that creates it.
- Never contact the do-not-contact host (rule 6).

---

## 1. Run by Sharetribe (not by us)

| What | When | Effect |
|---|---|---|
| Booking timers (`default-booking` process) | Unpaid checkout expires after 15 min. A request expires at the earliest of 6 days, start + 1 day, or booking end. An offer expires after 3 days. | The guest's card is released and the slot reopens. |
| **Booking complete → host payout** | booking end + 2 days | Releases the host's payout through Stripe. Nothing else does this. |
| Review windows | booking end + 7 days | Publishes or expires reviews. |
| Booking emails (13 templates) | on each booking step | Sent by Sharetribe, not by Emailit. |

The host Stripe accounts are Sharetribe-managed Custom accounts on a manual
payout schedule. If Sharetribe stops, payouts stop.

## 2. WEST server: the marketplace (13.56.113.85)

**Always on [R]:**
- `poolrentalnearme-production` Docker container: the marketplace app, serving `/s`, `/l`, `/u`, login and checkout.
- `pp-ssr` container on :3100: the `/public-pools/*` pages.
- Merlin on :3099: the `/wizard/` host listing flow.
- nginx front door and certbot.

**Inside the marketplace container [R, poller confirmed live V]:**

| Job | Cadence | Messages | Stop |
|---|---|---|---|
| SMS engine poller: reads Sharetribe events and texts hosts and guests through Twilio | every 12 s | hosts, guests | `SMS_NOTIFICATIONS_ENABLED=false` |
| Heartbeat and nudge sweep | 5 min | hosts, guests | with the poller |
| Expiring-request sweep | 15 min | hosts | with the poller |
| Day-before reminder sweep | 30 min | guests | with the poller |
| Founder welcome text | on new host | new hosts | `FOUNDER_WELCOME_ENABLED=false` |

Evidence the poller is alive: `sms_poll_cursor` was last updated 2026-11-15 18:01 UTC.

**Crontab jobs [R]:** most of these `docker exec` into the container *named*
`poolrentalnearme-production`, so they follow whatever container has that name.

| Job | Schedule (UTC) | Messages | Notes |
|---|---|---|---|
| warm-digest | `0 16 * * *` | Derek, Brandon | Last text 2026-11-15 16:00 [V] |
| stuck-detector | `3,18,33,48 * * * *` | founders, daytime | |
| cart-recovery | `8,23,38,53 * * * *` | guests | One text per abandoned checkout, 14:00–02:00 UTC only |
| lead-nudge | `15 * * * *` | hosts | 9am–7pm Pacific only |
| review-nudge (cron.d) | `*/30` | guests | Completed bookings only |
| sms-extras | `*/5` | guests | Booking confirm and decline texts |
| photo-concierge | `5 16 * * *` | hosts | |
| restricted-sweep (cron.d) | `35 15 * * *` | Derek | Reads Sharetribe and Stripe; flags restricted payout accounts |
| payout watchdog | `0 15 * * *` | Derek | Read-only |
| allie-pitch watch | `40 * * * *` | Derek | |
| db-watchdog | `*/5` | Derek | Sends only when the content database is down |
| nginx smoke monitor | `*/10` | founders | Front-door health |
| Switchy send and outreach | `13,43 * * * *` | hosts | Stop with `/home/ubuntu/switchy/STOP` |
| Switchy stats replies | `*/5` | hosts | |
| Switchy click snapshot | `28 */6 * * *` | nobody | Writes `click_history.jsonl` |
| Switchy weekly stats | `0 20 * * 4` | **all hosts** | **Held** by `/home/ubuntu/switchy/WEEKLY_STOP` since 2026-08-07 |
| future-season | Mondays in March | Derek | Dormant |
| Concierge replies | on inbound text | hosts | `CONCIERGE_STOP` |

**Swimply calendar import sweep [V from logs]:**
- Runs about every 6 hours: 30 runs in the last 7 days, the last at 2026-11-15 15:36 UTC.
- Where it runs (cron or container) is not confirmed.
- It logs to `email_send_log` as `swimply_sync_sweep`.
- Every logged attempt in the last 7 days was skipped or failed:
  - 8 saved links are web pages, not calendar feeds;
  - 4 are not Swimply links;
  - 2 answer 403.

## 3. EAST server: marketing site and support chat (3.222.110.146)

**Always on [R]:**
- `fresh-web` under pm2, running as ubuntu with `PM2_HOME=/home/ubuntu/.pm2`. It serves `/`, `/p/*` (about 10,000 pages) and the sitemaps.
- Chatwoot containers (support chat).

**Endpoints that do nothing unless something calls them [V]. No cron calls them today:**

| Endpoint | What it does | Last run |
|---|---|---|
| `POST /api/public/hooks/composer-scheduled` | Sends due email campaigns through Emailit | Called by hand for the $5 appeal sends |
| `POST /api/public/hooks/sync-listings` | Refreshes the listing copy behind city pages | **2026-09-25**: 6 runs ever, all by hand. A schedule is prepared, not installed: fresh-web branch `seo/06-scheduled-jobs` |
| Sharetribe mirror sync (`st_*` tables) | Copies users, transactions and messages | Never filled. The tables are empty. |
| Host lifecycle engine | Host emails | Armed, run by hand. Stop with `HOST_LIFECYCLE_EMAILS_ENABLED=false` |

## 4. Database (Supabase project `qbzpjsiahqgyoazjurqy`) [V]

| What | When | Effect |
|---|---|---|
| pg_cron job 6 | `0 3 1 * *` | Rebuilds "related cities" links on city pages. Fixed 2026-11-15: it now writes only changed rows and skips redirecting pages. |
| Trigger `tg_host_acq_related_refresh` | when a city page is inserted, deleted, or changes status, template or slug | Recomputes related links for all city pages (about 70 s) |
| Trigger `trg_content_pages_updated_at` | every page update | Sets `updated_at` |

pg_net (outbound HTTP from SQL) is used only by the manual email sends.

## 5. Make.com (team "My Team") [V]

- **Active:** "PRNM Elite — Welcome Email" and "PRNM Pro — Welcome Email". Each is a webhook that sends an HTTP request. Both show 0 recorded executions.
- **Inactive:** the rest, including "Sharetribe → Intercom: User Data Sync" (Intercom was removed 2026-11-04), the Nextdoor lead monitor and the Academy welcome email.

## 6. Claude scheduled tasks (claude.ai cloud) [V]

| Task | Schedule | What it does |
|---|---|---|
| PRNM $5 appeal: daily check-in with Derek | 10:17 Pacific daily | Drafts that day's appeal email and asks Derek. Sends only if he approves that day. Procedure: `ops/support-page/SERIES_RUNBOOK.md` |
| PRNM Pool Host Prospecting | Mon and Thu, 4:00 Pacific | Research only. Adds prospects to the "PRNM Prospects" Google Sheet. Contacts no one. |

## 7. Services with no schedule of their own

- **Cloudflare** is in front of all four domains. Its cache rule holds `/` and `/p/*` for 600 s whatever the status, plus a WAF and a rate limit.
- **Stripe** pays out as Sharetribe instructs it. The $5 supporter payment links are separate Stripe links.
- **Twilio**: a US 10DLC messaging service. Non-US numbers are skipped.
- **Emailit**: all email, from `noreply@poolrentalnearme.com`.
- **Switchy**: short links on `go.poolrentalnearme.com`.
- **Vercel**: `support.poolrentalnearme.com`, a static page.
- **Hostinger**: domains and DNS.

## 8. Things that look automated but are not

- The listing copy behind city pages has not refreshed since 2026-09-25.
- Email campaigns go out only when someone calls the composer hook.
- The Switchy weekly stats text has been held since 2026-08-07.

## 9. Changes coming

The marketplace is moving to Sunoblack in December. Section 10 of
`docs/SUNOBLACK_MIGRATION_PLAN.md` gives the freeze order for every job above
and a kill switch for each.
