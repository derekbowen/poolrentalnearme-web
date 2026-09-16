# Read-only forensic audit — every outbound email / SMS / outreach worker (2026-09-16)

Scope: Supabase `pg_cron` + `pg_net`, `pgmq`, fresh-web (EAST) hook routes and senders, WEST cron
and scripts, Sharetribe counts. Nothing was changed, enabled, or sent. All counts are from
production, read-only, taken 2026-09-16 22:40–23:10Z. Code citations are fresh-web
`ops/deploy-sha-enforcement` @ `3379f65` (the deployed tree). WEST paths are under `/home/ubuntu`.

---

## A. Executive summary

- **The "five" are eight.** `cron.job` holds nine jobs; eight are HTTP posts to dead hosts
  (`fresh-web.lovable.app`, a Lovable preview host, or the deleted Supabase project
  `ptfjspcphskifoseidut`). All eight are now `active=false` (deactivated 22:41Z today). Job 6
  (`refresh-related-slugs-monthly`, plain SQL) is untouched. `pg_cron` reports every run as
  "succeeded" because `net.http_post` only enqueues; the real outcome lives in
  `net._http_response`: 401 Unauthorized (Lovable hosts) or "Couldn't resolve host name" (dead
  project). ~102,000 runs of the two every-minute jobs since 2026-07-06 did nothing.
- **EAST has the code for all seven HTTP hooks and would accept the calls.** `hook-auth.server.ts`
  validates `x-admin-token` against `HOOKS_ADMIN_TOKEN` / `BACKFILL_ADMIN_TOKEN` /
  `SUPABASE_SERVICE_ROLE_KEY`, then falls back to the vault RPC `get_hooks_admin_token()`. The
  jobs send the vault token. So **changing the URL to `https://www.poolrentalnearme.com/api/public/hooks/…`
  is enough to make five of them run for real.** That is the danger. EAST's nginx logs show zero
  real hook calls in 14 days; the only hits are our smoke test's `hooks.seo-self-test` (404).
- **The host drip must not be restored as written.** All five live templates are signed
  **"Stephen, Founder"** (the CLAUDE.md rule-1 incident, still in the shipping tree), say
  "flat 10% fee / keep 90%", link to a dead CTA, and one tells hosts guests are "covered by the
  insurance". 66 emails are overdue since 2026-08-06 and would send within 20 minutes of the
  cron being re-pointed; the daily poll would then enrol every listing author not yet flagged
  (203 in the table + 26 new authors since the watermark), five emails each.
- **The renter drip never sent a single email.** Tables are empty; the poll has no host/renter
  filter, so re-pointing it would enrol all 259 Sharetribe users created since 2026-07-05
  (53 of them hosts) and send 3 emails each within a day. Copy is signed "The team" (fine) but
  the sequence is generic.
- **Auto-outreach is AI-written cold email with no unsubscribe link, no suppression check, and a
  backfill that marks every historical lead as new.** Today the backlog is one lead (five SMS
  drafted for one person). Do not restore; rebuild if wanted.
- **The transactional email pipeline is silently dead too**: `pgmq` holds 13 undelivered
  transactional messages and 26 in the dead-letter queue (waitlist confirmations, internal lead
  notifications). The dispatcher route exists on EAST but nothing schedules it.
- **What is actually alive** is a second, separate lifecycle system on WEST: 20+ cron-driven
  SMS jobs (welcome text, booking/transaction texts, reminders, cart recovery, stuck-host
  detector, warm digest to Derek/Brandon, weekly click stats, slow-reply nudges) all via
  Twilio, plus a Riverside cold-email drip (Emailit) that is gated off. That system is
  documented, dedupes on `sms_log`, honours opt-outs and quiet hours, and is where the real
  host lifecycle lives. The EAST/Lovable email drips duplicate it badly.
- **Verdict:** the Lovable-era lifecycle code is fragmented (six senders, four unsubscribe
  systems that do not talk to each other), unsafe (no suppression on drips, no daily cap, no
  send lock, wrong facts, fictitious signer), and never ran on EAST. Worth keeping: the Emailit
  transport with back-off, the Intercom open-conversation pause, the composer's suppression
  handling, Twilio STOP handling. Rebuild the lifecycle on top of those; do not revive the rest.

---

## B. Worker inventory (the eight deactivated `cron.job` rows + what else exists)

| # | jobid / name | Schedule | State | Target (as stored) | Code on EAST | What it does | Provider | Failure chain | Last real success | Safe to restore? |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 `competitor-radar-daily` | `0 8 * * *` | inactive (was active, 71 runs since 07-07) | `fresh-web.lovable.app/api/public/hooks/competitor-radar-scan`, header `apikey`=anon JWT of the dead project | `hooks.competitor-radar-scan.ts` | Fetches competitor listing URLs, matches/enriches host candidates into `competitor_host_matches`. No email. | none | pg_cron → lovable.app → 401 (host gone/anon key not accepted) | never on EAST | REPOINT + rewrite auth header (`x-admin-token` from vault). No send risk. Low value. |
| 2 | 2 `daily-seo-digest` | `0 12 * * *` | inactive (71 runs) | `project--4831238c…lovable.app/api/public/hooks/daily-seo-digest`, `apikey` anon | `hooks.daily-seo-digest.ts` | Builds an SEO digest and **enqueues** one email to `derek@poolrentalnearme.com` via `enqueue_email('transactional_emails')`. Internal only. | Emailit via pgmq dispatcher | same 401 | never on EAST | REPOINT + auth rewrite + needs the queue dispatcher scheduled (see #9). Internal-only recipient. |
| 3 | 5 `auto-generate-content-batch` | `* * * * *` | inactive (102,554 runs) | `ptfjspcphskifoseidut.supabase.co/functions/v1/generate-content-batch` | `supabase/functions/generate-content-batch/` in repo; **project has zero Edge Functions deployed** | Claims `content_plan` rows and generates pages with Gemini via Lovable gateway. No email. Prompts assert "$2M liability insurance included" and "10% flat host fee". `content_plan` pending = 0. | none | pg_cron → DNS failure | never on this project | **OBSOLETE — DO NOT RESTORE.** Prompts violate rules 1 and 8; nothing pending. |
| 4 | 7 `poll-sharetribe-renters-15m` | `*/15 * * * *` | inactive (6,837 runs) | `fresh-web.lovable.app/…/poll-sharetribe-renters`, vault `hooks_admin_token` | `hooks/poll-sharetribe-renters.ts` → `renter-drip.server.ts:226-347` | Pulls Sharetribe users after cursor `renter_drip_state.last_st_created_at` (2026-07-05), **no userType filter**, one page of 100 per run; inserts `renter_subscribers` + 3 `renter_emails` each. | none itself | 401 | never (tables empty) | REPOINT ONLY technically → **CODE CHANGE REQUIRED** before use (filter hosts out, unique on step). |
| 5 | 8 `send-renter-emails-1m` | `* * * * *` | inactive (102,555 runs) | `…/send-renter-emails`, vault | `hooks/send-renter-emails.ts` → `renter-drip.server.ts:90-222` | Sends 25 due `renter_emails` per run via Emailit from `support@`. Skips non-active, Intercom-paused; **does not check `suppressed_emails`**. | Emailit | 401 | never | REPOINT ONLY technically → CODE CHANGE REQUIRED (suppression, claim/lock). |
| 6 | 9 `poll-sharetribe-hosts-daily` | `0 14 * * *` | inactive (71 runs) | `…/poll-sharetribe-hosts`, vault | `hooks/poll-sharetribe-hosts.ts` → `host-drip.server.ts:72-186` | **Full rescan** of every listing author (any state); any `host_subscribers` row not `sequence_scheduled` gets the 5-step sequence scheduled from now. Also the separate `enroll-host-signups` hook (no cron) uses `host_drip_state.last_st_created_at` = 2026-08-06. | none itself | 401 | last real enrolments 2026-08-06 (from the Lovable host, before it died) | **DO NOT RESTORE as written** (enrols long-tenured hosts; templates are wrong). CODE CHANGE REQUIRED. |
| 7 | 10 `send-host-drip-emails-5m` | `*/5 * * * *` | inactive (20,509 runs) | `…/send-host-drip-emails`, vault | `hooks/send-host-drip-emails.ts` → `host-drip.server.ts:190-322` | Sends 20 due `host_drip_emails` per run via Emailit from `support@`; no suppression check. | Emailit | 401 | last sent 2026-08-06 04:00Z (59 rows total) | **DO NOT RESTORE as written.** Templates signed "Stephen", 10%/90% fee copy, insurance line. |
| 8 | 11 `auto-outreach-worker` | `*/5 * * * *` | inactive (20,510 runs) | `…/auto-outreach-worker`, vault | `hooks/auto-outreach-worker.ts` → `auto-outreach.server.ts` | Takes 20 `lead_followups` with `status='new'`, has Gemini write 3 touches (0/3/7 d) per lead, sends 5 per run: email (Emailit, `hello@`, **no unsubscribe**) or SMS (Twilio via Lovable gateway) or DM draft. | Emailit / Twilio | 401 | never (0 `auto_outreach_messages` rows) | **OBSOLETE — DO NOT RESTORE.** Rebuild if outreach is wanted. |
| — | 6 `refresh-related-slugs-monthly` | `0 3 1 * *` | **active** | SQL | n/a | Rebuilds `related_slugs` on city pages. | none | works | 2026-09-01 | n/a |

Crons that exist in migrations but are **not** in the live `cron.job` (already gone): `sms-sender-every-minute` (drains `sms_messages`), `sync-sharetribe-listings-hourly`, `process-email-queue` (the pgmq dispatcher, 5-second interval). Consequence: `sms_messages` has 5 pending rows nobody drains, and the transactional queue is stuck (see F).

### What is alive today (outside the eight) — WEST crontab, all Twilio unless noted

| Job | Schedule | What it sends / to whom | Gate |
|---|---|---|---|
| `stuck-detector` | `3,18,33,48 * * * *` | Air-file + alert SMS **to Derek/Brandon only** about host signups with no listing (`stuck_host_alert`, 22 in 30 d) | `STOP` file |
| `cart-recovery` | `8,23,38,53 * * * *` | ONE founder text to a guest whose checkout expired; 7-day dedupe; 14–02Z window | `STOP` file |
| `lead-nudge/nudger.js` | `15 * * * *` | ONE text to a host who hasn't answered an inquiry in >2 h (`host_nudge_slow_reply`, 10 in 30 d) | `STOP` file |
| `warm-digest` | `0 16 * * *` | Daily digest **to Derek/Brandon** (`warm_digest`, 42 in 30 d) | `STOP` file |
| `sms-extras/run.sh` | `*/5` | Guest address text on acceptance; decline-rescue text (`message/created`, 48 sent in 30 d) | flock |
| `switchy/run_switchy_jobs.sh` | `13,43 * * * *` | `send_host_links.js` (share link to new hosts, 10–12 local) + `send_outreach.js` (queue-driven host outreach; queue empty) | dedupe on `sms_log` |
| `switchy/run_stats_only.sh` | `*/5` | Replies to inbound "stats" texts | — |
| `switchy/run_weekly_stats.sh` | `0 20 * * 4` | Weekly click count to every published host (Thu 4pm ET) | `WEEKLY_STOP` |
| `payouts/run_watchdog.sh` | `0 15 * * *` | One status line **to Derek** | `WATCHDOG_STOP` |
| `photo-concierge/run.py` | `5 16 * * *` | Photo nudge to hosts (`photo_concierge`, 2 in 30 d); **currently erroring** ("Failed to parse JSON", 09-16) | — |
| `analytics/funnel.py` | daily + Mon | Funnel report email **to Derek** (Emailit) | — |
| in-container SMS notifier (`sms_poll_cursor`, `sms_heartbeat` ok 22:36Z) | continuous | Transaction texts, 24 h reminders, founder welcome (`founder_welcome` 23 sent in 30 d; **603 failures Aug 16–19 retrying three invalid numbers**), Stripe-connect nudges | env flags |
| `email-drip` (Riverside cold email, 10 steps, Emailit) | **not in cron** since 2026-08-06 | 1,788 sends Jul 18–Aug 5 to 389 contacts; `cold_riverside` 385 active due + 842 `guest_wk` rows | `APPROVED` + `DRIP_GO` + `STOP`; ESP must be configured |
| one-offs (dated cron lines, expired): `campaign-send.py`, `promo-send.py` (Jul 11–14), `blast/run_blast.sh` (Aug 19, 194 texts), `jaclyn-watch` | past | — | — |

---

## C. Host drip sequence (as it exists — `src/lib/email-static/host-drip/_shared.ts:20-59`)

| Step | Timing | Eligibility | Subject (exact) | Purpose / first line | CTA | Signature | Stop condition |
|---|---|---|---|---|---|---|---|
| 0 | +0 (5 min after enrolment) | any Sharetribe user who is the author of a listing in **any** state (poll) or `userType=provider` signup (enroll hook) | `Welcome - you're keeping 90% on every Pool Rental Near Me booking` | "Our host fee is a flat 10%. Swimply takes 15%…" | `/l/draft/0000…/new/details` (302s to `/wizard/`) | **Stephen, Founder** | unsubscribe token, admin pause, Intercom open conversation |
| 1 | +3 d | same | `Stuck getting started? I'll help you personally` | "I'm the founder. Not a support team." | reply | **Stephen** | same |
| 2 | +7 d | same | `Free Pool Host Academy: the playbook top hosts use` | "hosts making $3K to $10K a month" | `/p/pool-host-academy` | **Stephen** | same |
| 3 | +14 d | same | `Want me to tune up your pool listing? Free, takes 10 min` | reply with listing URL | reply | **Stephen** | same |
| 4 | +30 d | same | `Got customers asking? Share your booking link, keep 100%` | body says "keep 90%" and "covered by the insurance" | `/login` | **Stephen** | same |
| 99 | manual broadcast | all active | `Keep more of your profits 🌊 Share your link…` | "keep an extra 10%" | `/login` | The team | — |

Delivered so far: 59 emails (25 subscribers) between 07-23 and 08-06; 66 pending and overdue (4 step-1, 12 step-2, 25 step-3, 25 step-4).

State-specific sequences: **NO SEQUENCE FOUND** for any of: signed up/no listing (only the generic welcome via the un-scheduled `enroll-host-signups` hook), started/abandoned, address/no photos, complete/unpublished, published/no Stripe, Stripe/no bookings, inactive N days, active-then-dormant. `host_subscribers` has no listing, Stripe, booking or activity columns. The WEST SMS jobs cover three of these states by text (stuck-host, Stripe-connect nudge, slow reply).

Suppression: unsubscribe page requires a click (one-click `List-Unsubscribe-Post` is advertised but the route has no POST handler); `suppressed_emails` (Emailit bounces/complaints, 106 bounces + 18 unsubscribes on record) is **never consulted** by the drip sender.

## D. Renter sequence (`src/server/renter-drip.server.ts:29-51`)

| Step | Timing | Eligibility | Subject | CTA | Signature | Stop |
|---|---|---|---|---|---|---|
| 0 | +60 s | every Sharetribe user after the cursor, hosts included | `Ready for a swim? 🌊 Dive into our local pools today` | `/s` | The team | unsubscribe token, Intercom |
| 1 | +1 d | same | `✨ New pools just dropped, come find your new favorite spot` | `/s` | The team | same |
| 2 | +2 d | same | `Don't miss out, prime pool days are booking fast ☀️` | `/s` | The team | same |

Never sent (0 rows). NO SEQUENCE FOUND for: abandoned search, abandoned booking, inquiry, confirmation, upcoming, post-booking, review request, repeat, reactivation, failed payment, cancellation (those exist as SMS on WEST / Sharetribe's own emails, not here). Three orphan templates (`renter-welcome`, `renter-pool-of-the-day`, `renter-referral`) are never referenced. Admin "pause" for renters would violate the table's CHECK constraint.

## E. Auto-outreach (`src/server/auto-outreach.server.ts`)

Leads: `lead_followups.status='new'`, auto-created by trigger on `host_leads` (site popup **and** job-board imports) and `ig_leads` (SerpApi Instagram scrape); the 2026-05-11 migration backfilled a `new` row for every historical lead. Channel: email if the lead has one, else SMS, else DM draft. Cadence: 3 touches at 0/3/7 days, bodies written by Gemini per lead with no human review. Personalisation: name, city, handle, snippet. Dedupe: unique `(followup, channel, step)` only; no cross-source email/phone dedupe; `host_leads.email_sendable` never read. Suppression: SMS STOP honoured; **email: no unsubscribe link, no List-Unsubscribe, no `suppressed_emails` check**. Replies: none handled. Signup does not stop it. Daily cap: none (5 per 5-minute run → 1,440/day theoretical). Current backlog: 1 lead (`host_leads` has 1 row, 2026-09-01) with 5 pending SMS in `sms_messages` written by the separate SMS blast path. **If switched on with a repopulated lead table it would blast old leads.** Today it would touch one person.

## F. Email infrastructure

- **Provider: Emailit only** (`src/lib/email/emailit.ts`, `POST https://api.emailit.com/v2/emails`, env `EMAILIT_API_KEY`, present on EAST and in WEST's `nginx-smoke.env`, `email-drip/drip.env`). DNS: DKIM `emailit._domainkey` on `poolrentalnearme.com` and `mail.poolrentalnearme.com`, SPF on both, `inbound.` MX to Emailit. No Resend/SendGrid/Postmark/Brevo/SES/Mailgun code (Mailgun/SendGrid DNS records belong to `connect.` and `em2761.` legacy subdomains). Intercom: contact sync only, no messaging.
- Senders and from addresses: host drip and renter drip `Pool Rental Near Me <support@poolrentalnearme.com>` (drip/marketing); auto-outreach `hello@` from `auto_outreach_settings` (cold); composer `support@` reply-to `support@` (broadcast, admin-triggered); follow-up reminders `alerts@` (internal); listing audit `hosts@poolrentalnearme.online` (unverified-looking domain, admin-triggered); pgmq dispatcher overrides to `noreply@poolrentalnearme.com`, reply-to `support@` (transactional + Supabase-auth emails).
- **Transactional queue is dead**: `pgmq` `transactional_emails` depth 13, `transactional_emails_dlq` 26; `email_send_log` shows 33 pending (16 waitlist confirmations, 17 internal lead notifications, latest 2026-09-01) and 22 dlq. The dispatcher `/lovable/email/queue/process` exists on EAST; the `process-email-queue` cron that drove it on Lovable does not exist here. Two "Domain not verified" 422s on 2026-07-06 were the last dispatcher attempts.
- Lovable dependencies still in code: SMS goes through `connector-gateway.lovable.dev/twilio` with `LOVABLE_API_KEY` (not set on EAST → EAST cannot send SMS at all); AI copy via `ai.gateway.lovable.dev`; auth-email and suppression webhooks verified with `LOVABLE_API_KEY`; hard-coded `fresh-web.lovable.app` links in reminder emails.
- `email_send_log` is also written by WEST scripts (`restricted-sweep`, `review-nudge`, the July campaigns `booknow-aug`, `labor-day-2026`, `learn_with_derek_wk1-4`; the `swimply_sync_sweep` job logs 2,389 "failed" rows that are skips, not sends).
- Transactional vs marketing vs internal: transactional = pgmq (waitlist, auth); marketing/drip = host/renter drips, composer, auto-outreach, Riverside; internal = SEO digest, follow-up reminders, lead notifications, WEST watchdog/digest texts.

## G. Current backlog — what fires if each worker is re-pointed today

| Worker | Immediate | Within 24 h | Notes |
|---|---|---|---|
| send-host-drip-emails | **66 overdue emails** to 25 hosts (20 per 5 min → all within 20 min) | — | signed "Stephen", 90% copy |
| poll-sharetribe-hosts | schedules 5 emails for every active `host_subscribers` row with `sequence_scheduled=false`: **203** rows (some historical hosts back to 2024) plus any listing author not in the table (26 new authors since 08-06) | ≈1,145 emails queued; step 0 goes out at 240/hour | contradicts "new signups only" |
| poll-sharetribe-renters | enrols up to 100 users per run after the 2026-07-05 cursor: **259 users** (206 non-hosts, 53 hosts) | ≈777 emails, step 0 within minutes at 25/min | hosts get renter copy |
| auto-outreach-worker | 1 lead → 3 messages | — | plus 5 pending `sms_messages` that only the (absent) sms-sender cron would send |
| daily-seo-digest / competitor radar | 1 internal email / none | — | would 401 anyway until the auth header is rewritten |
| content batch | nothing (0 pending, no function deployed) | — | — |
| transactional dispatcher (if ever scheduled) | 13 queued messages; TTL 60 min → all to DLQ, none delivered | — | good: stale confirmations will not go out |
| Riverside cold drip (WEST) | 385 contacts due | up to warm-up cap | gated by APPROVED + DRIP_GO + cron absent + ESP config |

Unsubscribe/suppression state: `suppressed_emails` 124 (106 bounce, 18 unsubscribe); `host_subscribers` 5 unsubscribed, 1 excluded; `composer_unsubscribes` 0; `sms_opt_outs` 0 rows (the live WEST system uses `sms_opt_out`, a different table). None of the drips read `suppressed_emails`.

## H. Failure root causes

```
jobs 1,2      pg_cron → POST https://fresh-web.lovable.app / project--…lovable.app (apikey: anon JWT of deleted project) → 401 → nothing runs
jobs 7–11     pg_cron → POST https://fresh-web.lovable.app/api/public/hooks/* (x-admin-token from vault) → 401 (Lovable host gone) → nothing runs
job 5         pg_cron → POST https://ptfjspcphskifoseidut.supabase.co/functions/v1/… → "Couldn't resolve host name" → nothing runs
transactional pgmq enqueue works → no dispatcher cron on this project → messages age past TTL → DLQ
sms_messages  rows written by admin blast → sms-sender cron absent → never drained
```
Correct modern targets: EAST serves every hook at `https://www.poolrentalnearme.com/api/public/hooks/<name>` (WEST proxies `^~ /api/public/hooks` to EAST) and `https://www.poolrentalnearme.com/lovable/email/queue/process` for the dispatcher. Auth would pass with the vault token. The Edge Function has no modern equivalent (not deployed).

## I. Restoration requirements

| Worker | Verdict | Minimum to run at all | Minimum to run **safely** |
|---|---|---|---|
| competitor-radar | REPOINT + CONFIG (rewrite header to `x-admin-token` from vault) | cron command rewrite | none beyond that (no sends) |
| daily-seo-digest | REPOINT + CONFIG + dispatcher scheduled | as above + a scheduler for the pgmq dispatcher | recipient is Derek only |
| content batch | OBSOLETE — DO NOT RESTORE | — | rewrite prompts (fee, insurance) and redeploy function if content generation is wanted |
| poll-sharetribe-renters | CODE CHANGE REQUIRED | URL | filter `userType`, unique `(subscriber, step)`, cap enrolments per run, cursor seeded to **now** |
| send-renter-emails | CODE CHANGE REQUIRED | URL | consult `suppressed_emails`, claim/lock rows, daily cap, dry-run mode |
| poll-sharetribe-hosts | CODE CHANGE REQUIRED | URL | new-signups-only (HWM seeded to now), stop the full rescan, listing-state awareness if state-specific copy is wanted |
| send-host-drip-emails | CODE CHANGE + CONTENT CHANGE REQUIRED | URL | rewrite all templates (signer Derek/Brandon/none, 0% fee, no insurance, working CTA), suppression, lock, daily cap, dry-run |
| auto-outreach | OBSOLETE — DO NOT RESTORE | — | rebuild with human-approved templates, unsubscribe, suppression, per-source dedupe, cap |
| transactional dispatcher | ENV/SECRET + SCHEDULER REQUIRED | a scheduler calling `/lovable/email/queue/process` with the service-role bearer; confirm Emailit domain verification | purge the stale queue first; keep TTL |
| SMS from EAST | ENV/SECRET REQUIRED | `LOVABLE_API_KEY` + `TWILIO_API_KEY` for the Lovable gateway, or code change to call Twilio directly (WEST already does) | prefer: keep SMS on WEST only |

## J. Recommended architecture

Keep: Emailit as the single ESP (`src/lib/email/emailit.ts`), `suppressed_emails` + `email_unsubscribe_tokens` + `/email/unsubscribe` (RFC 8058) as the **one** suppression system, the Intercom open-conversation pause, WEST's Twilio path and `sms_log`/`sms_opt_out` conventions, the pgmq dispatcher for transactional mail (scheduled from EAST cron, not pg_cron).
Delete: auto-outreach (worker, settings, AI prompt), the content-batch cron and Edge Function, the Lovable SMS gateway path, `composer_unsubscribes` and per-table unsubscribe tokens (migrate into `suppressed_emails`), all `.bak` files and `.lovable/` docs, the dead `sms-sender`/`sync-listings` references.
Consolidate: one `lifecycle_state` per user (host/renter, listing state, Stripe state, last booking, last activity, last email/SMS at, sequence + step, suppression) fed by one Sharetribe sync; one sender with dry-run, allowlist, daily cap, claim/lock, and `sms_log`/`email_send_log` as the audit trail; templates as files with Derek's approval recorded (the WEST `APPROVED` pattern). Schedule from EAST's crontab (observable, same box as the code) rather than pg_cron posting over the internet.

## K. Proposed restore commands / patches — PREPARED, NOT RUN

```sql
-- (K1) Re-point ONE job at EAST, still inactive. Do not run without a GO.
SELECT cron.alter_job(9, command := $$
  SELECT net.http_post(
    url := 'https://www.poolrentalnearme.com/api/public/hooks/poll-sharetribe-hosts',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-admin-token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='hooks_admin_token' LIMIT 1)),
    body := '{}'::jsonb);
$$);
-- (K2) Move the host high-water mark to now so nothing historical is enrolled:
UPDATE host_drip_state SET last_st_created_at = now() WHERE id = 1;
UPDATE renter_drip_state SET last_st_created_at = now() WHERE id = 1;
-- (K3) Cancel the overdue host rows so a restored sender starts clean:
UPDATE host_drip_emails SET status='cancelled' WHERE status='pending' AND scheduled_at < now();
-- (K4) Purge the stale transactional queue before any dispatcher runs:
SELECT pgmq.purge_queue('transactional_emails'); SELECT pgmq.purge_queue('transactional_emails_dlq');
```
Code patches (fresh-web, not written): `DRIP_DRY_RUN=1` + `DRIP_ALLOWLIST` env checked in `sendDueHostEmails`/`sendDueEmails` before `sendViaEmailit`, writing the intended send to `email_send_log` with `status='suppressed'` and `metadata.dry_run=true`; `suppressed_emails` check in both senders; `FOR UPDATE SKIP LOCKED` claim via an RPC; daily cap read from `email_send_state`; `userType` filter in the renter poll; HWM-only host enrolment; template rewrite (signer, fee, insurance, CTA).

## L. GO gates — every action that sends or reactivates

1. `cron.alter_job(..., active := true)` on any of jobs 1, 2, 5, 7, 8, 9, 10, 11.
2. Any `cron.alter_job(..., command := …)` pointing a job at `www.poolrentalnearme.com`, EAST, or any live host.
3. Scheduling `/lovable/email/queue/process` (transactional dispatcher) by any means.
4. Admin buttons on EAST: host-drip "Poll Sharetribe now", "Drain send queue now", "Broadcast"; renter-drip "Poll", "Drain", "Backfill ALL"; auto-outreach "Run now"; composer "Send now"/"Send later"/A-B; sms-blast "Schedule & send"; add-contacts with "Start the drip sequence"; listing-auditor "send email".
5. Setting `LOVABLE_API_KEY`/`TWILIO_API_KEY` on EAST (enables EAST SMS).
6. WEST: creating `email-drip/DRIP_GO`, adding `sender.mjs` to cron, removing any `STOP` file, `stuck-nudge` runs, `recovery-campaign` GO file, `outreach/queue.json` population, any new crontab line that calls `twsend`.
7. Re-deploying the content-batch Edge Function.
Each requires Derek's fresh, explicit GO (rule 3) and gets reported, including no-op runs.
