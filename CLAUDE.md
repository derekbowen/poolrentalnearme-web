# Pool Rental Near Me — operating notes

Founder: **Derek Bowen**. Co-founder: **Brandon Elias**. They are the only real
people who may be named as company voices.

## Hard rules (each of these came from a real incident)

1. **Never invent a person, testimonial, host quote, venue, or statistic.**
   A lifecycle email template shipped signed "Stephen, Founder" — a person who
   does not exist — and reached 21 hosts over six weeks before a host forwarded
   it to Derek. Any customer-facing copy is signed by Derek or Brandon, or by
   nobody. US earnings data may be cited *as US data* only.
2. **Read our own working implementation before probing an external API.**
   I concluded Switchy's API was read-only after guessing endpoints and getting
   404s — while our own `mk_links.js` had been creating thousands of links with
   it for weeks. Grep `/home/ubuntu` for a script that already does the thing.
3. **Outbound sends (email/SMS) to real users need Derek's fresh, explicit GO.**
   Approval for one send never carries to the next. Report every scheduled
   run, including clean no-op runs — silence is how a runaway goes unnoticed.
4. **Disclose scheduled triggers in the same message you create them** — name,
   schedule, and exactly what they run. Derek must never find one in a log.
5. **Never use Derek's Gmail.** All email goes through Emailit
   (`noreply@poolrentalnearme.com`, reply-to `support@`).
6. James Martin (Cypress River Oasis) is **do-not-contact**. Listing stays
   live; never initiate outreach.
7. **Never write a token, credential, or "log in as" session into source.**
   `app/lib/main.dart` saved a hardcoded `isLoggedInAs` operator token for a
   real host on every app launch — under the same storage key as the user's own
   token — so every cold start logged everyone out, on every install, for
   months. See `app-patches/`.

## Infrastructure

| | |
|---|---|
| **WEST** `13.56.113.85` | Marketplace. Docker `poolrentalnearme-production`, build tree `/home/ubuntu/build`, nginx + certbot. Run via `ssm_runx.py` / `ship_big.py` (payload >9.5KB). |
| **EAST** `3.222.110.146` | Marketing/pSEO (`fresh-web` under pm2 as **ubuntu**, `PM2_HOME=/home/ubuntu/.pm2`), Chatwoot. Run via `east_runx.py` / `east_ship_big.py`. |
| Pages | Supabase `content_pages`; body lives in `content` **or** `body_markdown`. |
| Domains | `.com` + `.co.uk` / `.ca` / `.com.au` (each ccTLD root 302s to its country hub). Registrar: Hostinger. |

**Deploy ritual (WEST):** patch build tree with exact-anchor edits → build image
`cNNN-name` → **gated flip**: run the new image on `:4000`, re-verify every prior
release's markers + promo math + payment endpoints, only then move nginx and
replace MAIN. An abort leaves production untouched. Never skip the gate.

## Integrations — the exact facts that cost time to learn

**Switchy** (short links, `go.poolrentalnearme.com`; AppSumo lifetime, free)
- **Create:** `POST https://api.switchy.io/v1/links/create`, header
  `Api-Authorization: <key>`, body
  `{link:{url,domain,title,description,tags,note}, meta:{autofill:true}}` →
  returns `{id, domain}`; short URL is `https://<domain>/<id>`.
- **Stats:** `POST https://graphql.switchy.io/v1/graphql` (Hasura), same header.
  **Query-only — "no mutations exist".** Stats live here; creation does not.
- Key: `/home/ubuntu/switchy/switchy.env`. Host links: `host_links.json`
  (consumed by `send_host_links.js`, which self-guards quiet hours 10am–noon
  recipient-local, dedupes on `sms_log`, honors opt-outs).
- **Live cron, bulk SMS:** `0 20 * * 4` (Thu 4pm ET) runs
  `run_weekly_stats.sh` → `weekly_stats.js`, texting every host their click
  count. First run 2026-08-06 sent **91 texts to 90 hosts**. Kill switch:
  `touch /home/ubuntu/switchy/WEEKLY_STOP`. Report every run to Derek.
  A failed Switchy lookup used to read as a genuine zero and send the harshest
  "nobody has seen your pool" message — Stephanie Frey got it while her link
  had 2 clicks. Now it skips the host instead. Never let a lookup failure and
  a real zero produce the same message.

**Sharetribe**
- Integration SDK creds on WEST are `SHARETRIBE_INTEGRATION_SDK_CLIENT_ID/SECRET`;
  on EAST they are `SHARETRIBE_INTEG_CLIENT_ID/SECRET`. Token endpoint
  `https://flex-integ-api.sharetribe.com/v1/auth/token` (form-encoded, `scope=integ`).
- The wrapped marketplace SDK returns **denormalized arrays**; use
  `{allowRawResponse:true}` and read `r._raw.data.meta` for paging.
- `authorId` must be a `UUID` instance, not a plain object.
- **One marketplace = one currency (USD).** A listing priced in another currency
  displays a bare currency code and cannot be booked.
- Image upload via the SDK can 411; `curl -F 'image=@file;type=image/jpeg'`
  against `/v1/integration_api/images/upload` works.
- Listing types must match a configured `listingType`+`unitType` pair or the
  host sees "Outdated listing" and cannot edit.

**Mobile app** (separate repo, Flutter/melos; patches staged in `app-patches/`)
- Its unit-type enum is `{item, hour, day, night, inquiry}`. Console listing
  types on `fixed` (`rentalslots`) or `request` (`needzone-request`) make
  `isValidListingType()` return false → **"Outdated listing!"**, unfixable by the
  host. Its `supportedProcess` list also omits `default-negotiation`.
  Keep hosts on `hourly-pool`/`hour` until the app ships a build that knows them.
- Sessions: nothing may write to the SDK token store during startup.

**Twilio / SMS** — US 10DLC sender: `twsend` skips non-US numbers by design.
International hosts are email-only until that changes.

**Session cookies** — `VITE_SHARETRIBE_USING_SSL` is a **build-time** var baked
into the client bundle; setting it only in the container does nothing (this is
why the first c158 flip aborted). Both `src/config/settings.js` and
`server/api-util/sdk.js` now default it on in production so a missing env var
cannot silently drop `Secure` from every session cookie.

**Stripe** — payouts reach 36 countries in local currency; guests worldwide can
pay in USD. Platform account is US.

## Guest-facing money

Guest fee is **15%**; hosts keep **100%** (0% host fees). Any displayed
"all-in" price must equal the checkout total to the penny — a stale 10%
multiplier once showed $77/hr on an $80.50 booking.
