# $5 appeal email series: how it is sent

Derek asked on 2026-11-13 for a series of emails to hosts and customers asking for support, sent daily.
This file is the procedure, so a later session can run it the same way. It holds no addresses and no secrets.

## Rules that apply to every send

- Every send needs Derek's fresh, explicit GO on that day's wording and count (CLAUDE.md rule 3). No GO, no send.
- Only wording Derek has approved goes out in his name. Approved sentences are listed below; new sentences need his OK first.
- Email goes through Emailit via the site's own composer. Never Gmail, never Resend.
- Never email the do-not-contact host (the Cypress River Oasis listing's author). The SQL below removes him by account id and by address.
- The site's built-in "Hosts" audience includes him, so it is never used. Always a `custom` audience.
- Report every run to Derek, including runs where nothing was sent.
- Insurance questions that come back as replies go to Derek.

## Who gets it

- Hosts: everyone on `host_subscribers` (active) and `host_lifecycle_state`, minus unsubscribes, bounces
  (`suppressed_emails`), banned or deleted accounts, internal and test addresses, and the do-not-contact host.
  264 people on 2026-11-13.
- Customers: the marketplace's customer list is not in this database (it lived in Sharetribe). The only copy
  reachable was Intercom: 234 contacts tagged `user_type:customer`, `marketplace:poolrentalnearme`, a March 2026
  snapshot. After removing Intercom unsubscribes and hard bounces, test accounts, mistyped addresses and non-US
  contacts, 217 were stored in one row of `composer_campaigns` with `status = 'list'`
  (subject starts `[LIST] Customers for the $5 series`). That row is never sent; it is only the stored audience.
  At send time anyone who is also a host, suppressed or unsubscribed is skipped: 213 people on 2026-11-14.

## Where each audience is sent

| Audience | Link in the email | Offer |
|---|---|---|
| Hosts | https://support.poolrentalnearme.com | $5, $10 or $20 a month; customer service at $20 |
| Customers | https://support.poolrentalnearme.com/guests/ | $5 a month; no booking fee (normally 15%) while subscribed, starting when the site reopens January 1 |

## Wording Derek has approved

Customers, email 1 (sent 2026-11-14), subject "Pool Rental Near Me needs your help":

> Pool Rental Near Me needs your help.
> I'm Derek Bowen, the founder. I've been building Pool Rental Near Me while working as a truck driver, and I don't have the money to keep carrying everything on my own.
> I'm asking everyone who has used or signed up for Pool Rental Near Me for $5 a month to help cover the cost of keeping it running.
> In return, for as long as you stay subscribed, you pay no booking fee on any pool you book. The booking fee is normally 15%.
> [Support with $5 a month]
> It's voluntary, and it's charged monthly until you cancel. We are closed until January 1, so no-fee booking starts when we reopen.
> Derek Bowen, Founder, Pool Rental Near Me

Also approved (emails 2 and 3 as drafted on 2026-11-13; the hosts version of email 2 went out on 2026-11-17 with the button "Support with $5 a month" linking https://support.poolrentalnearme.com):

> A few days ago I asked for your help with Pool Rental Near Me.
> Here's the honest part: I need help covering the platform's ongoing costs. The website, software, maintenance, and work behind the scenes still need funding.
> If you can give $5 a month, it helps.
> It's voluntary, and you can cancel anytime. If you can't contribute right now, you are still welcome here.
> Pool Rental Near Me still needs help covering its costs, and I'm asking one more time for $5 a month.
> If you can help, thank you.

Hosts, first email (sent 2026-11-13): "Please, we desperately need your help. / We can't pay the server bills."

Not to be used while emails go out daily: "This is my last email about this" and "I won't email you about this again".

## How a send works

The site (EAST, `fresh-web`) sends any `composer_campaigns` row with `status = 'scheduled'` and a due `scheduled_at`
when `POST /api/public/hooks/composer-scheduled` is called with an admin token. Nothing calls that hook on a
schedule, so nothing goes out unless this procedure calls it.

1. Token. The hook accepts a token stored in the database vault under the name `hooks_admin_token`. Create a
   random one for the send and delete it afterwards. Never select or print its value.
   - create: `select vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hooks_admin_token', '<why>') where not exists (select 1 from vault.secrets where name = 'hooks_admin_token');`
   - delete: `delete from vault.secrets where name = 'hooks_admin_token';` (the database tool asks Derek to confirm a delete)
   - The site keeps the previous token in memory. The first call after a new token is created is refused (401)
     and makes the site reload it; the second call works. Call once with nothing due, then carry on.
2. Test first. Insert one row with `test_only = true`, audience `custom`, recipients
   `support@poolrentalnearme.com` and `derek@poolrentalnearme.com`, `scheduled_at = now() - interval '1 minute'`,
   call the hook, and check the row reaches `completed` with 2 sent, 0 failed.
3. Batches of about 36. Each batch is one statement that (a) refuses to run if any campaign is still
   `scheduled` or `sending`, (b) takes the next recipients who are in the audience and not yet in
   `composer_email_log` for this subject, (c) inserts them as a `custom` campaign due now, and (d) calls the hook.
   Wait about 50 seconds between batches; a batch of 36 takes about 45 seconds.
4. Verify at the end: sent and failed totals, no recipient twice, none on the suppression list, none internal,
   none the do-not-contact host. Then delete the token.

`body_html` is the inside of the email only; the site wraps it in the branded shell with the postal address and a
per-person unsubscribe link. Unsubscribes land in `composer_unsubscribes` and are skipped automatically.

## Sends so far

| Date (Pacific) | Audience | Subject | Sent | Failed |
|---|---|---|---|---|
| 2026-11-13 morning | Hosts | Please, we desperately need your help | 220 | 0 |
| 2026-11-13 evening | Hosts (the rest) | Pool rental near me - very important | 44 | 0 |
| 2026-11-14 | Customers | Pool Rental Near Me needs your help | 213 | 0 |
| 2026-11-15 | None (Derek chose hosts only, then skipped the day before anything went out) | Pool Rental Near Me still needs help (drafted) | 0 | 0 |
| 2026-11-16 | None (the database tool's SQL calls hung all day, so results, counts and a send were impossible; Derek was not asked) | — | 0 | 0 |
| 2026-11-17 (approved in the daily check-in dialog; sent 2026-11-18 01:40–02:20 Pacific) | Hosts only (Derek's choice; customers skipped) | Pool Rental Near Me still needs help | 263 | 0 |
| 2026-11-18 (approved in the daily check-in dialog; sent 18:31–18:47 Pacific) | Hosts only (Derek's choice; customers skipped again) | Pool Rental Near Me needs your help | 260 | 0 |

| 2026-11-19 | None (that day's check-in reached the session a day late; Derek was not asked) | — | 0 | 0 |
| 2026-11-20 | None (Derek chose "Skip today" in the check-in dialog) | — | 0 | 0 |
| 2026-11-21 | None (the check-in's first database read waited on an approval prompt nobody answered; the session restarted; Derek was not asked) | — | 0 | 0 |
| 2026-11-22 | None (Derek was asked; no answer before the session restarted) | — | 0 | 0 |
| 2026-11-23 | None (no approval; the recommendation is to skip until the opt-outs below are applied) | — | 0 | 0 |
| 2026-11-24 | None (no reply from Derek since 2026-11-20; same hold) | — | 0 | 0 |
| 2026-11-25 | None (no reply from Derek since 2026-11-20; same hold) | — | 0 | 0 |
| 2026-11-26 | None (no reply from Derek since 2026-11-20; same hold) | — | 0 | 0 |
| 2026-11-27 | None (no reply from Derek since 2026-11-20; same hold) | — | 0 | 0 |

Hold before the next send (found 2026-11-20 to 2026-11-22 by a read-only sweep of inbound texts and the readable
Intercom history): 3 people made clear removal requests in July and August (one asked to unlist and delete her
listing, one replied "Unsubscribe", one replied "stop texting me, I'm not interested") and are still on email lists,
so the appeal audience above would include them. 3 more look like removal requests and were not double-checked.
Replies to the appeal emails since 2026-11-04 land in the support@, derek@ and brandon@ Hostinger mailboxes, which
no system here reads; a person has to check them before any further send.

Results of the 2026-11-17 hosts send, read before the 2026-11-18 one: 0 bounces, 3 unsubscribes (1.1%).
Results of the 2026-11-18 hosts send (260), read 2026-11-20: 0 bounces, 5 unsubscribes (1.9%; one of them added by
hand for a host who had asked to be removed by text on 2026-08-19 and again by email).

## Removal requests made by reply are not opt-outs (found 2026-11-20)

Only an unsubscribe-link click, a bounce or a STOP text puts someone on an opt-out list. A reply saying "take me
off" by text or email changes nothing, so that person stays in every audience above. One host asked by text in
August and by email in November and still got all three appeal emails. Before any send, check new replies to
support@ and inbound texts for removal requests and add each one to `suppressed_emails`, `composer_unsubscribes`,
`host_subscribers.status = 'unsubscribed'` and, for texts, `sms_opt_out` (the weekly host text reads it).
The 2026-11-18 send used only approved sentences: email 2 without its first line, plus "If you can help, thank you."
2 people unsubscribed within minutes of it. The temporary token's delete prompt timed out unanswered, so the token
was still in the vault when this was written.

## Still to do before the offer can be honoured

- The marketplace checkout does not waive the booking fee for subscribers. That has to be built before the site reopens.
- Nobody can be skipped for having already paid, because Stripe is not connected to the sending session.
- Cancellations arrive by email at support@, so someone has to watch that inbox.
- The Stripe checkout still names the $5 product "Pool rental near me host silver".
