# Intercom vs PRNM — dependency audit

**Read-only.** Nothing was changed: no code, config, database, credential or
third-party service. Date: 2026-09-04.

**Headline:** Intercom is a **chat bubble and nothing else**. It carries no
transactional notification, no onboarding, no lead capture and no automation.
Every function in those categories is PRNM-owned code (Twilio SMS, Supabase,
Chatwoot) or a *different* third party. The one thing that would be lost by
removing Intercom is live chat and its conversation history — and that history
is **not mirrored anywhere in our systems**.

**The trap:** the Intercom widget boots from **two independent paths**, and one
of them hardcodes the app id. Clearing `VITE_INTERCOM_APP_ID` does **not** remove
the bubble from the landing page. See §3.

---

## 1. Repository scope actually covered

| Repo | Status | Evidence |
|---|---|---|
| `derekbowen/poolrentalnearme-web` (marketplace, WEST) | **fully audited** | working copy, HEAD `6ae7fe0` |
| `derekbowen/fresh-web` (marketing/pSEO, EAST) | **fully audited** | cloned this session, HEAD `501f3ed` |
| `journeyhorizon/poolrentalnearme-app` (mobile) | **NOT audited** | `add_repo` refused: cross-owner attach unsupported — *"session already has repos from owner(s) [derekbowen]"*. Needs a session started with that repo as the initial source. |

`poolrentalnearme-web-main/poolrentalnearme-web-main` is a directory shape, not a
separate GitHub repo; the only marketplace repo on the account is the one above.

**Out of reach in this session (no AWS credentials, no shell to WEST/EAST):**
on-box crons, pm2 processes, and anything configured *inside* the Intercom
dashboard (Series, Inbox rules, saved replies). Statements below are about code
in the repos plus live HTTP probes of production. Where I could not see, I say so.

---

## 2. Classification

| Label | Meaning |
|---|---|
| **PRNM-OWNED** | our code, our infra; Intercom absent |
| **INTERCOM-DEPENDENT** | stops working if Intercom is removed |
| **INTERCOM-COSMETIC** | Intercom is present but only as a launcher; no data we consume |
| **OTHER-VENDOR** | depends on a third party that is *not* Intercom |
| **ORPHANED** | code exists, nothing wires it |
| **NOT IN REPOS** | asked about, no code evidence in either repo |

### Function-by-function

| # | Function | Verdict | Where it lives |
|---|---|---|---|
| 1 | Booking-request → host SMS | **PRNM-OWNED** | `server/extensions/sms-messaging/mod/notify/poller.js`, `messages.js` (Twilio) |
| 2 | Guest confirm / decline / cancel / payout SMS | **PRNM-OWNED** | same poller, `TEMPLATES` in `messages.js` |
| 3 | Expiring-request nudge | **PRNM-OWNED** | `HOST_EXPIRING_SOON` in `messages.js` |
| 4 | Reply-to-accept ("1"/"2"/YES) | **PRNM-OWNED** | `notify/replyactions.js` (operator via Integration API) |
| 5 | Inbound SMS + STOP/START/HELP compliance | **PRNM-OWNED** | `notify/inbound.js` |
| 6 | Host reply routing (Derek↔Brandon round-robin) | **PRNM-OWNED** | `notify/routing.js`, `routectl.js`, Supabase `sms_reply_ctx` |
| 7 | Founder welcome text on host signup | **PRNM-OWNED** | `notify/welcome.js`, queue `sms_welcome_queue` |
| 8 | SMS consent / opt-out / test-account exclusion | **PRNM-OWNED** | `notify/consent.js`, `exclude.js`, `sms_opt_out` |
| 9 | Bulk/campaign SMS | **PRNM-OWNED** | `notify/betablast.js`, `twsend.js` (Messaging Service) |
| 10 | AI SMS concierge + admin commands | **PRNM-OWNED** | `server/concierge/` (12 files), Twilio + Anthropic + Supabase |
| 11 | Live chat widget (marketplace) | **INTERCOM-DEPENDENT** | `src/extensions/intercom/*`, `SectionLoveFooter.js` |
| 12 | Live chat widget (marketing `/` and `/admin`) | **INTERCOM-DEPENDENT** | `fresh-web/src/components/intercom-widget.tsx` |
| 13 | User identity passed to chat | **INTERCOM-COSMETIC** | one-way push only; nothing reads it back (§5) |
| 14 | Server-side Intercom sync | **ORPHANED** | `server/extensions/intercom-sync/` — config object only, zero importers (§4) |
| 15 | Transactional email | **PRNM-OWNED** | `fresh-web/src/server/transactional-email.server.ts` → Supabase `enqueue_email`, react-email templates, suppression list, unsubscribe tokens, `email_send_log` |
| 16 | Auth emails (signup/magic-link/recovery) branding | **PRNM-OWNED** | `fresh-web/src/server/email-branding.functions.ts` + Supabase Auth |
| 17 | Public help centre `help.poolrentalnearme.com` | **OTHER-VENDOR** | **Eniston**, not Intercom Articles — live probe returns `eniston_session` cookie, `server: nginx-rc`. Linked at `src/containers/LandingPage/PremiumLandingPage.jsx:87` |
| 18 | Help centre on EAST (`/help-center/*`) | **PRNM-OWNED** | `fresh-web/src/server/help-center.functions.ts`, Supabase `help_articles` / `help_categories` |
| 19 | Waitlist ("notify me") on EAST | **PRNM-OWNED** | `fresh-web/src/server/waitlist.functions.ts` → own email queue |
| 20 | Lead capture on marketplace `/s` banner | **PRNM-OWNED but degraded** | `server/api/notify-signup.js` — *writes the lead to stdout only* (`console.log('NOTIFY_LEAD …')`). No DB, no email, no CRM. Retrievable only from container logs. |
| 21 | Richer lead capture (geo, nearest listing) | **ORPHANED** | `server/api/lead-capture.js` exists, is **not mounted** in `server/apiRouter.js` |
| 22 | Booking/transaction emails to guests+hosts | **OTHER-VENDOR** | Sharetribe Console-managed templates (hosted assets, outside both repos) |
| 23 | Phone verification, account deletion, wishlist, off-session payment | **PRNM-OWNED** | `server/extensions/*` |
| 24 | Host/renter drip workers | **NOT IN REPOS** | zero matches in either repo (§6) |
| 25 | "Check App - Pending Requests Reminder" | **NOT IN REPOS** | zero matches in either repo (§6) |

---

## 3. The two boot paths — the operational finding

**Path A — the extension (env-driven):**

- `src/extensions/intercom/config/intercom.js:2-4` — `const { VITE_INTERCOM_APP_ID } = import.meta.env`
- `src/extensions/intercom/mod/intercom/init.js:12-18` — `Intercom({ app_id: intercomAppId, … })`
- `src/entry-client.jsx:23,25` — `initIntercom()` called **unconditionally at module scope**, on every page load, with no guard on an empty app id
- `src/ducks/auth.duck.js:7-8,202-204` — `signInIntercom(currentUser)` / `signOutIntercom()` on every `authInfo()` resolution
- launcher offset handling: `init.js:7-11,25-27` + `src/containers/TopbarContainer/Topbar/BottomNav/BottomNav.module.css:57-62`

**Path B — a hardcoded duplicate:**

`src/containers/LandingPage/SectionLoveFooter.js:25,30-34`

```js
const INTERCOM_APP_ID = 'nuuc4281'; // VITE_INTERCOM_APP_ID from .env; app ids are public client-side
…
window.intercomSettings = { api_base: 'https://api-iam.intercom.io', app_id: INTERCOM_APP_ID };
s.src = 'https://widget.intercom.io/widget/' + INTERCOM_APP_ID;
```

This injects the widget script directly, reads no environment variable, and is
rendered on the landing page (`LandingPage.js:18,81`, section key `prnmLoveFooter`).

**Consequence:** unsetting `VITE_INTERCOM_APP_ID` disables path A and leaves
path B running. The bubble would vanish from the app but survive on the front
door — the page most visitors see. Both paths must be removed together.

**Live confirmation that Intercom is active in production today** (read-only fetch
of the production bundle, `2026-09-04`):

```
https://www.poolrentalnearme.com/assets/auth.duck-DMcxsljf.js
  __vite_import_meta_env__ = { LEGACY:!1, VITE_INTERCOM_APP_ID:"nuuc4281" }
```

so the value is baked into the shipped client, and `server/csp.js:71-73,135-137`
(`*.intercom.io`, `wss://*.intercom.io`, `*.intercomcdn.com`) is present on live
marketplace responses (`/s`, `/signup`).

---

## 4. Server side: there is no Intercom integration

`server/extensions/intercom-sync/` contains exactly two files and no client:

- `config/intercom.js:6-7` — `{ token: process.env.INTERCOM_TOKEN }`
- `schema/intercomConfigSchema.js` — an Ajv schema for that one field

**Nothing imports it.** A repo-wide grep for `intercom-sync` outside the
extension itself returns only a row in `docs/INFRASTRUCTURE_SECRET_AUDIT.md`.
There is no API call, no webhook route, no cron, no sync job.

Corroborating:

- `intercom-client@^6.1.0` is declared at `package.json:54` and **never imported** anywhere.
- `INTERCOM_TOKEN` is **absent from the production secret store** (`docs/INFRASTRUCTURE_SECRET_AUDIT.md:196`, status MISSING), so even the config object is `{ token: undefined }` in production.
- `.env.example:417` already says: *"Intercom API token (being retired in favour of Chatwoot)."*

On EAST the server side is one line: `fresh-web/src/server/intercom.functions.ts`
returns `process.env.INTERCOM_APP_ID` to the browser. That is the entire
server-side Intercom surface across both repos.

---

## 5. Data flow: one-way, unsigned, unmirrored

What we push to Intercom:

| Repo | Fields |
|---|---|
| marketplace | `signIn.js:15-20` — `email`, `user_id` (Sharetribe uuid), `created_at`, `name` |
| fresh-web | `intercom-widget.tsx` — Supabase `user.id`, `email`, `full_name`, plus derived `listing_id`, `admin_section`, `learner_user_id`, `content_page_slug`, `current_url` |

What we read back: **nothing.** There is no webhook, no polling, no table.
Specifically absent from both repos: `intercom_id`, `intercom_paused_at`,
`intercom_synced_at`, `intercom_events_log`, `hasOpenConversation`,
`/api/public/hooks/intercom`, `/api/public/hooks/intercom-sync`.

Two consequences worth stating plainly:

1. **Conversation history lives only in Intercom.** Nothing in our systems holds
   a copy. Any decision to disable Intercom needs an export first, or the support
   history is gone.
2. **Identity verification is not implemented.** `INTERCOM_IDENTITY_SECRET` and
   `INTERCOM_ACCESS_TOKEN` do not appear anywhere in either repo, and both boot
   paths pass `user_id`/`email` with no `user_hash`. Without the HMAC, a visitor
   can boot the messenger claiming another user's `user_id` and read that
   person's conversation thread. This is an Intercom-side setting as much as a
   code one, so it needs checking in the dashboard too — but from the code, the
   signature is not being sent.

---

## 6. Symbols searched that returned nothing

Searched across both repos (excluding `node_modules`, `.git`, `dist`, `build`):

| Symbol | Marketplace | fresh-web |
|---|---|---|
| `INTERCOM_ACCESS_TOKEN` | 0 | 0 |
| `INTERCOM_IDENTITY_SECRET` | 0 | 0 |
| `intercom_id` | 0 | 0 |
| `intercom_paused_at` | 0 | 0 |
| `intercom_synced_at` | 0 | 0 |
| `intercom_events_log` | 0 | 0 |
| `/api/public/hooks/intercom` | 0 | 0 |
| `/api/public/hooks/intercom-sync` | 0 | 0 |
| `hasOpenConversation` | 0 | 0 |
| host/renter drip worker | 0 | 0 (only an *AI tool that writes drip copy for hosts*, `fresh-web/src/server/host-tools.functions.ts:138` — unrelated) |
| `Check App - Pending Requests Reminder` | 0 | 0 |

Found: `INTERCOM_TOKEN` (marketplace, orphaned), `INTERCOM_APP_ID` /
`VITE_INTERCOM_APP_ID` (both repos, client boot).

The drip workers and the pending-requests reminder are **not in either
repository**. They are either Intercom Series configured in the dashboard, or
on-box scripts under `/home/ubuntu`. I could not check either from this session
(no AWS credentials, no Intercom dashboard access). That question is open, and it
is the one that most affects the blast radius — if those reminders are Intercom
Series, turning Intercom off silently stops them.

---

## 7. Twilio is separate — explicitly

Every transactional message PRNM sends to a customer today goes out over
**Twilio**, from **our** code, with **our** compliance handling:

- sending: `notify/twsend.js` (Messaging Service, Advanced Opt-Out)
- copy: `notify/messages.js` — deliberately in code, not in Console hosted assets
- consent: `notify/consent.js` (`protectedData.smsConsentMarketing`)
- opt-out & keywords: `notify/inbound.js` (STOP/START/HELP), `sms_opt_out`
- quiet hours, dedupe, idempotency: `poller.js`, `welcome.js`, `supastore.js`
- inbound routing to a human: `notify/routing.js`, `server/concierge/`

**No part of this touches Intercom.** Removing the Intercom chat bubble removes
zero SMS capability. Any recommendation to reduce Twilio would be a separate
decision on separate evidence, and this audit does not make one.

---

## 8. Blast radius if Intercom were removed

| Lost | Severity |
|---|---|
| Live chat on marketplace + marketing `/` and `/admin` | real — it is the only real-time inbound web channel; SMS to `+1 855 617 8207` and `support@` remain |
| Support conversation history | **real and irreversible without an export first** |
| Anything driven by Intercom Series (possible drip/reminders — §6) | **unknown, and the open question** |

| Not lost | Why |
|---|---|
| all transactional SMS | Twilio + our code (§7) |
| all transactional + auth email | Supabase queue + react-email (§2 #15,16) |
| both help centres | Eniston and Supabase (§2 #17,18) |
| booking/transaction emails | Sharetribe Console |
| lead capture, waitlist | our endpoints (§2 #19,20,21) |
| server-side "sync" | never existed (§4) |

---

## 9. Findings that stand on their own, independent of any Intercom decision

1. **`notify-signup` loses leads to stdout.** `server/api/notify-signup.js:17-21`
   writes `NOTIFY_LEAD …` with `console.log` and nothing else. Every "notify me
   when there are more pools" signup from `/s` exists only in container logs, and
   is destroyed on container replacement — which happens on every deploy.
2. **`server/api/lead-capture.js` is dead code** — a fuller implementation
   (geo, rate limiting, nearest-listing context) that is not mounted in
   `server/apiRouter.js`.
3. **Intercom identity verification is not implemented** (§5).
4. **`intercom-client` is an unused production dependency** (`package.json:54`).
5. **Two help centres exist**: the linked public one is Eniston
   (`help.poolrentalnearme.com`), while EAST serves its own at `/help-center/*`
   off Supabase. They are separate content sets.
6. **`server/concierge/route.js:6` requires an absolute container path**
   (`/home/bun/app/server/…`), so the concierge route only resolves inside the
   production image layout.
7. **The transactional email sender domain is
   `notify.poolfriends.poolrentalnearme.com`** (`transactional-email.server.ts:11-12`),
   not the `noreply@poolrentalnearme.com` recorded as the canonical sender.

Items 1–2 and 7 are stated as observations, not proposals. No fixes were made.

---

## 10. Open questions I could not answer from the repos

1. Are the host/renter drips and "Check App - Pending Requests Reminder" Intercom
   Series, or on-box crons? (Determines whether disabling Intercom stops
   customer messaging.)
2. Is Intercom identity verification enforced in the dashboard? (If yes, the
   messenger is already failing to identify users, because no `user_hash` is
   sent. If no, §5.2 is a live exposure.)
3. What does the mobile app do? `journeyhorizon/poolrentalnearme-app` could not
   be attached to this session.
4. Volume: how many open Intercom conversations, and over what period? Needed
   before any export/disable sequencing.
