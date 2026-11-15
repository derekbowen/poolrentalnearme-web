# Moving Pool Rental Near Me from Sharetribe to Sunoblack

Decision (Derek, 2026-11-15): we are leaving Sharetribe for Sunoblack.
Goal: move without a single problem for hosts, guests, money or search traffic.

Nothing on the live site changes until the new marketplace has passed every
check in section 14. Every step until the final switch can be undone.

Labels: **[V]** verified on 2026-11-15 (from code, our database or a public
page), **[U]** unknown until tested or answered, **[D]** Derek decides.

Revision 2 (2026-11-15) follows an adversarial review of revision 1. Section 19
records what was checked.

---

## The short version

1. **Everything moves at once.** Sign-in, sign-up, account, checkout, host
   onboarding (including `/wizard/`) and search all move to Sunoblack in one
   switch. Only `/s`, `/l`, `/u` was not enough: new accounts and listings
   would have kept landing on Sharetribe.
2. **Sharetribe is frozen before the final copy:** no sign-ups, no new or
   edited listings, and after the switch every Sharetribe listing is closed so
   the old mobile app cannot take bookings.
3. **Bookings already paid on Sharetribe for dates after the switch stay on
   Sharetribe.** We find them in the export, block those hours on Sunoblack,
   and keep Sharetribe until the last one has paid out and its review window
   has closed. That date comes from the export.
4. **No check sends anything to a real host or guest.** Tests use aliased
   copies, founder and test accounts, and phone and email allowlists.
5. **Our own text and email engines are switched off before the import** and
   come back one at a time, each with Derek's GO, once they can tell an
   imported account from a new sign-up.
6. **Checkout has written reference answers** (section 5), taken from today's
   price calculator, to the cent.

---

## 1. Where we stand today

| Fact | Value | |
|---|---|---|
| Sharetribe is answering | Search, listing pages, login and photos load | [V] |
| Site closed to bookings until | January 1 | Derek, 2026-11-14 |
| Listings in our copy (`synced_listings`, last written 2026-09-25) | 126 published, 51 closed, 23 draft | [V] |
| Our own copy of users, transactions, messages | **None.** `st_users`, `st_listings`, `st_transactions`, `st_messages` all hold 0 rows | [V] |
| Hosts in `host_lifecycle_state` (last synced 2026-09-18) | 300; 127 have no listing; 94 have an unverified email (18 of them have a published listing); 7 use Apple's private relay | [V] |
| Who knows which host owns which Stripe payout account | **Only Sharetribe.** Nothing on our side stores it | [V] `scripts/export-stripe-mapping.js` |
| Stripe accounts | Sharetribe-created **Custom** accounts on our own platform account; Sharetribe requires a **manual** payout schedule and uses destination charges with `on_behalf_of` | [V] `server/api/payouts.js`; Sharetribe docs |
| How far ahead guests could book | 90 days | [V] `src/config/configStripe.js` |
| When Sharetribe pays a host | 2 days after the booking ends, by its own timer | [V] `process.edn` |
| Text-message engine | Still running: poller cursor updated today; a founder welcome text went out on 2026-11-03 | [V] `sms_poll_cursor`, `sms_log` |
| Listing photos | Sharetribe's image service, signed URLs | [V] |
| Sunoblack test marketplace | `poolrentalnearme-test.sunoblack.pp.ua`: our homepage design, 24 listings in search including junk test listings | [V] |
| Sunoblack sign-in | Email link only. `/login` answers; `/signup` and `/inbox` answer 404 | [V] |
| Sunoblack privacy terms | `sunoblack.com/privacy`, `/terms`, `/dpa` answer 404 | [V] |
| Sunoblack tools connected to Claude | No | [V] |

The closure until January 1 is the best window we will get: nobody is
mid-checkout. It does not mean nothing is open: bookings made before the
closure for dates after January 1 are still live on Sharetribe (section 3).

---

## 2. What moves, what stays, what freezes

**Decision in this plan: the whole marketplace moves in one switch.** After
the switch nothing can create an account, a listing or a booking on
Sharetribe. [D] Derek confirms.

| Part | After the switch |
|---|---|
| Search, listing pages, profiles | Sunoblack |
| Sign-in, sign-up, password and email links, account, payouts page | Sunoblack (email link sign-in) |
| Checkout and bookings, inbox, host dashboard | Sunoblack |
| Host onboarding: `/wizard/` (Merlin, its own container on WEST, not in git) and Sunoblack `/sell` | Sunoblack `/sell`. Merlin shows a holding page from the write freeze, then 302s to `/sell` |
| Mobile app (Sharetribe-only) | Retired. Order in section 8 |
| Marketing site (`/`, `/p/…`, city pages, sitemaps) | Stays on EAST; its listing data is re-pointed to Sunoblack |
| `/go/` share links, iCal feeds, old-URL redirects | Stay on WEST, rewired through our own ID map (section 9) |
| Sharetribe | Paid and frozen: sign-up off, listing edits off, every listing closed. Runs only so open bookings finish and pay out |

### Every path on www has one owner

| Path on www | Today | After the switch |
|---|---|---|
| `/`, `/p/*`, `/public-pools/*`, sitemaps, `robots.txt` | EAST | EAST, unchanged |
| `/account/learning*`, `/auth*`, `/api/public/*` (fresh-web) | EAST | EAST. Settle collisions with Sunoblack's paths first |
| `/s`, `/s/*` | WEST marketplace | Sunoblack, through a translation step for old search links (section 9) |
| `/l/*`, `/u/*` | WEST | Sunoblack. Old Sharetribe shapes answered by our redirect map |
| `/login`, `/signin`, `/sell`, `/account*` (not learning), `/_sunoblack/*`, and every other path Sunoblack names (Q9) | WEST, or 404 today | Sunoblack |
| `/signup*`, `/confirm`, `/recover-password`, `/reset-password`, `/verify-email` | WEST | 302 to Sunoblack `/login` with a short notice |
| `/inbox*`, `/order/*`, `/sale/*`, `/listings`, `/dashboard`, `/profile-settings`, `/host/preview/start`, `/preview`, `/l/new` | WEST | 302 to the matching Sunoblack page (section 9) |
| `/wizard/*` | Merlin on WEST | Holding page at the freeze, then 302 to `/sell` |
| `/terms-of-service`, `/privacy-policy`, `/host-standards`, `/operating-ceo` | WEST marketplace | One owner [D]; Sunoblack's links point there |
| `/go/*`, `/api/ical/*` | WEST container | WEST, rewired (section 9) |
| `/tools/*` | WEST static files | Unchanged |
| Other marketplace `/api/*` (price quote, payouts, promo codes, wishlist…) | WEST container | Retired or re-pointed, one by one, listed during the rehearsal |
| `.co.uk`, `.ca`, `.com.au` | Serve the whole site; `/wizard` already 302s to `.com` | Every marketplace path 302s to `.com` the same way [U] confirm the current redirect list |

The switch routes this whole table, not three prefixes. The table is final
only when Sunoblack has given its full list of public, sign-in, asset, API and
webhook paths (Q9).

---

## 3. Step 0: copy everything out of Sharetribe now

Do this first, while Sharetribe still answers. Every step only reads.

**Not the mirror.** The `st_*` mirror pulls only the last 30 days on its first
run, stops after 25 pages per resource, and has no reviews at all [V]
(`fresh-web-702e04c3/src/server/sharetribe-mirror.server.ts`). Step 0 is a
one-off full pull from the marketplace's first day, paging until empty.

| # | What | Script | Notes |
|---|---|---|---|
| 1 | Host to payout-account map | `scripts/export-stripe-mapping.js` (this repo, branch `claude/sharetribe-dependency-audit-6axv9x`) | Without it, payout accounts can only be matched by guessing on email; a wrong match pays the wrong person |
| 2 | Users | full pull (to write) | Every field: email, verified flag, pending email, sign-in method, created date, banned, deleted, `protectedData` (phone, `smsConsentMarketing`), `privateData`, wishlist |
| 3 | Listings, every state | full pull | All extended data, including price options, group-size bands, paid extras, deposit, date prices, booking rules, promo codes |
| 4 | Availability | full pull | Weekly plans with time zone, and every exception |
| 5 | Transactions | full pull | Raw: line items, payin and payout totals, every transition, `protectedData` (holds the Stripe PaymentIntent ids [V]), booking start and end, host and guest ids, process version |
| 6 | Messages | full pull | Per transaction |
| 7 | Reviews | full pull | With author and subject |
| 8 | Photos, originals | `scripts/download-listing-images.ts` (repo `fresh-web-702e04c3`, branch `claude/sharetribe-dependency-audit-6axv9x`) | Full resolution, in order |
| 9 | Hosted configuration | Console assets | Listing types, fields, search, translations, `commission.json` (where the 15% lives), email templates |
| 10 | iCal subscriptions | token store | How many listings have a subscribed feed |
| 11 | Payout-account status | read-only Stripe GETs with the platform key, for every account in the map | Payout schedule, `charges_enabled`, `payouts_enabled`, `requirements.currently_due`, balance |

`scripts/export-all-data.ts` (same fresh-web branch) only dumps the mirror
tables, so the full pull in rows 2–7 still has to be written.

### Two lists Step 0 must produce

**A. Open bookings.** Every transaction not yet in a final state, with its
booking start and end. Guests could book 90 days ahead, so a booking made on
November 14 can be for a date in mid-February [V]. For each one:

- block the same hours on its Sunoblack listing before anything on Sunoblack
  is bookable, then check the block;
- it stays on Sharetribe and is paid out by Sharetribe's timer.

**Sharetribe end date** = the later of (last open booking's end + 7 days, when
its review window closes; payout comes at + 2 days) and the day list B is
empty. Computed from the export. Not January 31.

**B. Money still open on Sharetribe.** Every booking past its end + 2 days
without a payout, every disputed charge, and every connected account with a
non-zero balance. Two are already known from the 2026-09-07 record: a booking
accepted in May whose payout timer never fired (the host is still owed; only
a Console action can complete it), and a $289 chargeback whose listing and
host were deleted. Each item goes to Derek: complete, refund or write off,
before Sharetribe is cancelled. [U] re-check both today.

### Where the export lives

- A private, encrypted S3 bucket (KMS encryption, no public access, named
  readers only) and one encrypted offline copy. Never in git; this repo is
  public.
- A deletion date for both [D]. Any erasure request is applied to both copies
  and to the import.
- The transaction, message and PaymentIntent part is kept read-only until about
  120 days after the last Sharetribe charge, for chargebacks [U] confirm the
  window with Stripe, and through the 2026 tax forms.

**Needs:** Integration API credentials and the Stripe key, which live only on
our servers. Derek runs the scripts on the server, or the keys are added to
this session's environment settings. Read-only; no outbound messages.

**Done when** counts match Sharetribe Console for: users; listings by state;
transactions by state; reviews; messages per transaction; exceptions per
listing; users with a phone and with SMS consent. Every listing has every
photo. Every host with a connected payout account is in the map. Lists A and
B exist.

---

## 4. What the new marketplace must do on day one

Counts are from our published listings unless stated. "Sunoblack today" is
what its public test pages and new-listing form show.

### Money (any failure here is a blocker)

| Must work | How many | Today's rule | Sunoblack today |
|---|---|---|---|
| Hourly price | all 126 | per hour | Test listings show "per hour" [U checkout] |
| 15% guest fee, host keeps 100% | all | Fee on host price + paid extras; not on the deposit; before the promo; rounded half-up (section 5) [V] | Not configured: shows "$100 all-in" on a $100/hr listing [U] |
| All-in price = checkout, to the cent, on every page | all | Includes our own homepage, city cards and `/p/` pages on EAST, which compute it themselves [V] | [U] |
| Price options | 103; 47 have more than 3, up to 18 | Duration tiers ("3+ hours") are chosen by the server from booked hours, never from the guest's pick [V] | Form shows 3 slots [U] |
| Price by group size, party size enforced | count from export | A party bigger than the chosen tier's band is refused at checkout [V] `guestBands.js` | [U] |
| Paid extras (heater…) | 94 | Inside the fee base [V] | Not on the form [U] |
| Longer-booking discounts | 21 | | Not on the form [U] |
| Different prices on set dates | 45 | Uses the pool's local date of the booking start [V] | [U] |
| Damage deposit | 26 | **Charged at booking, no fee on it, paid to the host with the booking. No platform refund path; the host returns it off-platform** [V] `lineItems.js`, `process.edn` | Sunoblack's "deposit" means part-payment [U]. Keep today's behaviour or change it: [D]. Deposits are about damage, so wording goes to Derek (rule 8) |
| Promo codes | 2 | Host-funded; the redemption limit is **not** enforced today (the counter never increases); codes sit in public listing data [V] | [U]; whether to enforce limits [D] |
| Request to book; instant book | most; 3 | Host accepts, then the guest is charged | "In full when I accept" [U] |
| Host paid out | all | 2 days after the booking ends, automatically [V] | Stripe Connect [U timing; see section 12] |
| Booking expires if the host does not answer | all | Earliest of 6 days after request, 1 day after start, or booking end [V] | [U] |
| Refunds | all | Decline, expiry, operator decline, operator cancel: 100% of what the guest paid, fee included; host gets 0. **Guests cannot cancel themselves today** [V] | Guest self-cancel must be off, or Derek writes the refund rule [D] |
| Admin actions | support | Operator accept, decline, complete, cancel (all used in the logs) [V] | [U] |
| Extra charge after a booking | count from export | Separate process: host asks, guest pays, host paid 2 days later [V] | [U]; else retire it [D] |
| Host offers and deal links | count from export | Own price path [V] | [U]; else retire [D] |
| Card kept on file for damage charges | Terms 4.4 promise | Card must stay active 30 days after the rental [V] | [U]; if not possible, change Terms 4.4 before January 1 [D] |
| No guest fee for $5/month supporters | promised to 213 customers on 2026-11-14 | Not built anywhere yet [V] | Section 6 |

### Bookings and calendar

| Must work | How many | Sunoblack today |
|---|---|---|
| Weekly opening hours in the pool's time zone | all | Shown by day and time zone [V] |
| Minimum and maximum hours; advance notice | 29; 30 | [U] |
| Buffer between bookings; blocked dates | 29; 29 | [U] |
| No double booking, ever | all | [U] |
| Hours already sold on Sharetribe are blocked | every open booking in list A | [U] |
| Swimply calendar import | 15 | [U] |
| Calendar feed out to hosts' calendars, **at the URL they already subscribed to** | count from export | [U] |

### Listings and hosts

| Must work | How many | Sunoblack today |
|---|---|---|
| Photos | up to 61 per listing; 42 have more than 10, 12 more than 20 | Plans cap at 20 (published, not yet enforced) [V] |
| Pool details (check-in instructions, cancellation policy, house rules, parking…) | about 40 fields in use | Custom fields; 10 can be filters on paid plans [V] |
| Listing state kept | 126 published, 51 closed, 23 draft | [U] import may publish all |
| Owner kept, including hosts with several listings | 22 hosts own more than one (up to 4) | [U] |
| Test and operator accounts left out | 18 known test users in `exclude.js`, plus a reviewed list | Junk test listings already on the test site |
| Search by place, guests, amenities, pool type | all | [U] |
| Address search when listing a pool | new hosts | Free-text place plus typed coordinates [V] |
| Reviews carried over | 5 listings show ratings | Section exists [V]; import [U] |
| Host sees listings, bookings, payouts | all hosts | [U] |

### People

| Must work | Notes | Sunoblack today |
|---|---|---|
| Everyone can sign in | Sharetribe does not export passwords; email link only | Email link [V] |
| Hosts with unverified, Apple relay or pending emails can sign in | 94 unverified, 7 relay (of 300 hosts) | Relay addresses accept mail only from senders registered with Apple [U] |
| Google / Facebook / Apple sign-in users | must use the same email | [U] |
| Sign-up records terms acceptance (time and version), a phone number, and a separate unticked SMS consent | today's form has all three; our texts rely on them | `/login` shows no terms or consent [V] |
| Phone and SMS consent imported | from `protectedData`; `sms_opt_out` (55 phones) stays the STOP authority | [U] |
| Messages between host and guest | history and new | [U] |
| Booking emails from our domain | `noreply@poolrentalnearme.com` via Emailit, reply-to `support@` | [U] |
| Our suppression list honoured | 106 bounces, 19 unsubscribes, plus host and composer unsubscribes | [U] |
| The do-not-contact host (CLAUDE.md rule 6) gets nothing, while his listing stays live | | [U] per-user suppression |

---

## 5. What checkout must equal

These are the reference answers. Sunoblack's guest total and host payout must
match them exactly, for every fixture.

**Rules today** [V] (`server/api-util/lineItems.js`, `lineItemHelpers.js`,
`durationTiers.js`):

1. **Hourly rate:** a date price for the pool-local date the booking starts
   wins; else the duration tier the server picks from booked hours (the
   highest tier the booking reaches); else the chosen option; else the base
   price.
2. **Fee base** = rate × hours + paid extras.
3. **Guest fee** = 15% of the fee base, once for the whole booking, rounded
   half-up to the cent. Host fee 0%.
4. **Deposit** is added outside the fee base: the guest pays it, the host
   receives it.
5. **Promo** comes off outside the fee base: percent of the fee base rounded to
   the cent, or a fixed amount, never more than the fee base. The host funds
   it; the fee does not change.
6. **Guest pays** = fee base + fee + deposit − promo.
   **Host gets** = fee base + deposit − promo. **We keep** = the fee.
7. Out-of-range hours, too little notice, a start in the past, or a party too
   big for its tier are refused.

**Worked examples**, computed on 2026-11-15 by running a copy of today's
calculator from this repo with 15% guest and 0% host:

| # | Booking | Fee base | Fee | Deposit | Promo | Guest pays | Host gets | We keep |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| A | $45.00/hr × 2 h | $90.00 | $13.50 | | | **$103.50** | $90.00 | $13.50 |
| B | $38.90/hr × 1 h | $38.90 | $5.84 | | | **$44.74** | $38.90 | $5.84 |
| C | $38.90/hr × 3 h | $116.70 | $17.51 | | | **$134.21** | $116.70 | $17.51 |
| D | $80/hr × 2 h + $25 heater + $100 deposit | $185.00 | $27.75 | $100.00 | | **$312.75** | $285.00 | $27.75 |
| E | D + 10% promo | $185.00 | $27.75 | $100.00 | −$18.50 | **$294.25** | $266.50 | $27.75 |
| F | $80/hr × 2 h + $15 fixed promo | $160.00 | $24.00 | | −$15.00 | **$169.00** | $145.00 | $24.00 |
| G | Tiers $90 "Per hour" / $75 "3+ hours"; 2 h; guest picked "3+ hours" | $180.00 | $27.00 | | | **$207.00** | $180.00 | $27.00 |
| H | Same tiers; 3 h; guest picked "Per hour" | $225.00 | $33.75 | | | **$258.75** | $225.00 | $33.75 |
| I | $45/hr listing with a $60 price on Mar 10; 3 h from 10 pm Mar 10 pool time (crosses midnight) | $180.00 | $27.00 | | | **$207.00** | $180.00 | $27.00 |
| J | Same listing; 2 h from 00:00 Mar 11 pool time | $90.00 | $13.50 | | | **$103.50** | $90.00 | $13.50 |

What these catch:

- **B**: 15% of $38.90 is $5.835, which rounds **up**. Our homepage fallback
  cards use float math and show $44.73 today [V] (`home-page.tsx:154`); fix it
  to use `allInCents()`.
- **C**: the fee is taken once on the whole booking, so 3 hours is $134.21,
  not 3 × $44.74 = $134.22.
- **D, E**: no fee on the deposit; the promo does not lower the fee.
- **G, H**: the server picks the tier from booked hours, whatever the guest
  clicked.
- **I**: the whole booking uses the rate for the date it starts.
- **A** matches a live production quote measured on 2026-09-03 [V]
  (`docs/FEE_MATH_RECONCILIATION.md`).

Before building: re-run the fixtures against the live, read-only price quote
endpoint for a few real listings (the production build tree has drifted from
this repo before) and compare with real exported transactions [U]. Then build
the full fixture set from real exported listings: odd-cent prices, tiers,
group bands, extras, deposits, both promo types, date prices, a booking across
midnight.

---

## 6. The supporter fee waiver

The promise: supporters pay no guest fee, "through the end of the period you
have already paid for", and they were told to "subscribe with the email on
your Pool Rental Near Me account" [V] (supporter page).

| Question | Answer in this plan |
|---|---|
| Who is a supporter? | An active Stripe subscription. Source of truth: its status and `current_period_end`, kept current by webhooks from the Stripe account that holds the subscriptions |
| Which Stripe account? | [U] Checkout names "10000 solutions llc"; whether that is the marketplace's Stripe account is unknown. Read it (read-only) before building |
| How do we match a subscriber to an account? | By email. The links carry no account reference [V]. A list of subscribers with no matching account, and a manual fix list, reviewed by Derek |
| Cancelled | Waiver stays to the end of the paid period |
| Failed payment, or bank payment still pending | Off when payment fails; pending bank payment [D] |
| What do supporters see on listing cards and marketing pages? | The 15% all-in price. That is an exception to the all-in rule [D]. Whether signed-in supporters see a no-fee price on listing pages [D] |
| Who was emailed? | 213 customers from a March 2026 Intercom snapshot, not from marketplace records [V] |
| Cost | With 0% host fee and 0% guest fee, we pay Stripe's processing fee on every supporter booking, and Stripe does not return it on a refund |
| **If Sunoblack cannot waive per user by January 1** | Fallback chosen now [D], for example refunding the fee after each supporter booking |

---

## 7. Questions for Sunoblack, in writing, before we build

1. **Stripe and payouts.**
   - Can we use our existing Stripe platform account, and attach the existing
     Sharetribe-created Custom accounts to imported hosts, so hosts do not redo
     bank and ID checks?
   - Those accounts are on a manual payout schedule. Does Sunoblack create its
     own payouts on them, or change the schedule, and when?
   - Destination charges with `on_behalf_of` and an application fee?
   - How does Sunoblack connect to our account: restricted key (which
     permissions) or OAuth? Can it change a host's bank account or payout
     schedule?
   - How does its webhook handler treat refunds, disputes and payouts for
     charges it did not create (Sharetribe's, during the drain)?
   - Can an admin refund so the transfer and application fee are reversed?
2. **Import.** What comes across: users, listings in every state, all extended
   data, original photos, availability, reviews, transactions, messages, phone
   and consent fields? Are original created dates kept? Does it return a map
   of old ids to new ids? Can it skip listed accounts? Does it send any email
   to anyone? Can it run again as a final top-up?
3. **Test limits.** The test site runs on Free limits (100 listings, 10
   photos, 1 import). We have 200 listings. Can we rehearse the full import on
   test, and is our one free import still unused?
4. **Photos.** Can 12 listings keep more than 20 photos?
5. **Fees.** Exactly the rules in section 5, and a per-user waiver driven by
   an outside status.
6. **Bookings.** Minimum and maximum hours, buffers, advance notice, date
   prices, more than 3 price options, tiers chosen by booked hours, group-size
   tiers with party-size enforcement, paid extras, today's deposit behaviour,
   instant book and request-to-book together, an extra charge after a booking,
   host offers, charging a saved card later, guest self-cancel switched off,
   admin accept, decline, cancel and force payout. Can we block specific hours
   on a listing in bulk (for list A)?
7. **Calendars.** iCal import and export; the feed URL format; can we proxy
   it from our old URLs?
8. **Webhooks and API.** Ordered booking and message events with ids (our
   texts run on them); can events for imported records be held during the
   import? An API to read listings for our 10,000 marketing pages and
   sitemaps.
9. **Domain and proxy.** The complete list of paths it uses (pages, sign-in
   callbacks, assets, API, webhooks). The Host header and SNI it needs behind
   our WEST nginx; whether it honours `X-Forwarded-Host`; the cookie domain;
   the address used in sign-in emails and in Stripe return URLs; whether a
   custom domain can be served through someone else's front door.
10. **URLs.** Are listing URLs stable? Is there a lookup from our old id to
    the new URL?
11. **Email.** Booking emails from `noreply@poolrentalnearme.com`, reply-to
    `support@`, SPF and DKIM on our domain. Is its sender registered with
    Apple's private relay? Will it honour our suppression list? Can one user be
    suppressed from **all** platform email (import, sign-in, listing live,
    broadcasts) while his listing stays live?
12. **Sign-up.** Terms acceptance with time and version, a phone field, and a
    separate unticked SMS consent.
13. **Search engines.** Canonical and `og:url` pointing at www; listing
    structured data; `noindex` on facet and cursor pages. Please put the
    `sunoblack.pp.ua` test host on `noindex` **now**: it already serves a full
    copy of our `/p/` pages with "Allow: /" [V].
14. **Privacy.** A data processing agreement, sub-processor list, data
    location, encryption at rest, breach notice, deletion when we leave,
    Standard Contractual Clauses and the UK addendum, and the legal name of the
    company.
15. **Support.** Can our Chatwoot chat widget run on its pages?
16. **Exit.** Export format, backups, uptime record, and what happens to our
    data if Sunoblack stops. It is early access and independently developed.

---

## 8. What we rebuild or rewire ourselves

| Today | After the move |
|---|---|
| **ID map** (none today) | New private table in Supabase: kind (user, listing, transaction), Sharetribe id, Sunoblack id and URL, state, original created date. Required output of the import. Everything below reads it |
| Text engine: poller every 12 s on Sharetribe events | Sunoblack webhooks. Drops events for the import set during the import. Welcome text skips anyone in the ID map |
| Host lifecycle emails (EAST; armed in production mode, run by hand, no schedule as of 2026-09-17) | Sent-history and account age read through the ID map and the original created date, so 300 hosts do not look new |
| About 15 scheduled jobs on WEST, plus EAST jobs | Section 10 |
| Marketing site listing cards, city inventory, homepage loaders, `sitemap-listings.xml` | Re-synced from Sunoblack **at the switch**: new URLs, new image URLs (125 of 126 sitemap images are Sharetribe image links today [V]). The price field fed to `allInCents()` must be the host's base price in cents [U] which Sunoblack field |
| Hardcoded listing ids on the homepage (`JAN_LISTING_ID`, `CURATED_LISTING_IDS`, `WINTER_FEATURED_LISTING_IDS`) | Replaced through the ID map |
| `/go/` links: resolved live from Sharetribe; feed host click counts | One hop to Sunoblack through the map; clicks logged with both ids; an unresolved link logs a **miss**, never nothing |
| iCal feeds at `/api/ical/<id>/<token>.ics` | Same URLs, proxied to Sunoblack's feed (or built from its data) |
| `/s` search links (section 9) | Translation step at WEST, or a one-time rewrite of the links |
| Host short links (`go.poolrentalnearme.com`) | Work through the redirects; targets updated later |
| Do-not-contact list: runbook SQL, a `/tmp` file read inside a silent try/catch, a campaign file | One lasting do-not-contact record in Supabase (email, phone, Sharetribe id, later Sunoblack id). Every sender checks it and refuses to send if it cannot read it. Not in this repo |
| Chatwoot bot: 100 answers, 42 describe Sharetribe-era screens | Rewritten for the new sign-in and booking pages before the switch |
| Monitoring (smoke test, founder alerts from inside the container) | Section 16 |
| Operator "log in as", admin tools | Sunoblack owner admin |
| Stripe Identity checks, boost purchases | Re-wire or retire [D] |
| Mobile app | Shut down in this order: (1) before the switch, take it out of the stores [D] and rewrite `/p/pool-rental-app` and the footer app links; (2) at the switch, Sharetribe sign-up and listing edits are off and every Sharetribe listing is closed, so installed copies cannot book or list; (3) daily check that Sharetribe takes no new booking; (4) when Sharetribe is cancelled, the app stops |
| Insurance wording anywhere on the new site | Derek only (CLAUDE.md rule 8) |

---

## 9. Old URLs, redirects and search engines

**Redirects are ours, at WEST, keyed on the Sharetribe id alone,** through the
ID map. Today any slug works with a listing id, `/l/<id>` works, sub-paths are
live, and closed listings answer 200 [V]. Sunoblack's URLs look like
`/l/<slug>-<6 hex>` [V].

| Old shape | Goes to |
|---|---|
| `/l/<any slug>/<id>`, with any query (e.g. `?ref=host-share`) | 301 to the Sunoblack listing, query kept |
| `/l/<id>` | Same |
| `/l/<slug>/<id>/checkout` | The listing page |
| `/l/<slug>/<id>/edit/<tab>` and `/draft/<tab>` (in host emails) | Sunoblack's edit page for that listing |
| Closed or deleted listing | 301 to its city page, or 410 [D] |
| `/u/<id>` | Sunoblack profile |
| `/go/<slug>-<id8>` | One hop to the Sunoblack listing |
| `/api/ical/<id>/<token>.ics` | Proxied to that listing's Sunoblack feed; old token checked |
| `/order/<tx>`, `/sale/<tx>` (53 `/sale` and 16 `/order` links texted in the last 120 days [V]) | The Sunoblack booking, if transactions are imported and mapped; else the bookings list |
| Old bookings still open on Sharetribe | [D] either keep the old app at a separate, unindexed address for those bookings only (sign-up and edits off), or support handles them through Sharetribe Console and old links go to a short "your earlier booking" page |
| `/inbox*`, `/listings`, `/account*` | Sunoblack messages, host listings, account |
| `/reset-password`, `/verify-email`, `/recover-password`, `/signup*` | Sunoblack `/login` with a short notice |

**Search links.** 7,098 links on 4,432 of our 6,712 content pages use
`/s?address=…` [V]. The homepage also uses `/s?keywords=` and
`/s?pub_poolAmenities=` [V]. Sunoblack ignores `address`, `bounds`, `keywords`
and `pub_*` and shows every listing, with no error [V]; it takes `q=` and
`near=<lat,lng>&radius=` [V] (radius unit [U]). In the same release as the
switch, translate them: address and bounds to `near=<centre>&radius=<half the
diagonal>`, `keywords` to `q`, amenities to Sunoblack's amenity filter [U].
Or rewrite the content pages and homepage links once.

**Search engines.** Live listing pages today carry a canonical to www,
`og:url`, listing structured data and `index,follow`; filtered search pages
send `noindex` [V]. Sunoblack's listing and `/p/` pages carry none of these
[V]. Before the switch, all must hold:

- every Sunoblack page's canonical and `og:url` point at
  `https://www.poolrentalnearme.com/<path>`;
- the `sunoblack.pp.ua` host 301s to www or sends `noindex`;
- facet and `cursor` pages are `noindex` (our current
  `Disallow: /s?*&page=` does not catch `cursor`);
- listing structured data (offer, price, location) matches today's;
- www `robots.txt` covers Sunoblack's paths; the ccTLD robots rules stay as
  they are.

---

## 10. Scheduled jobs and the text-message poller: freeze and order

Every scheduled run is reported to Derek, including runs that send nothing
(rule 3). Any new schedule is disclosed in the same message that creates it
(rule 4).

**Freeze before the final import:** every job that sends to hosts or guests
stops, with a report to Derek naming each one. **Re-enable** one at a time,
only after it is re-pointed to Sunoblack, a dry run shows zero sends to
imported accounts, and Derek gives a fresh GO for that job.

| Job (source: `docs/OPS_RECORD_2026-09-07.md`, audit section 13) | Sends to | Kill switch | Plan |
|---|---|---|---|
| Text poller, every 12 s, in the container | hosts, guests | `SMS_NOTIFICATIONS_ENABLED=false` | Freeze. [D] whether it keeps running for list A bookings only, so their hosts and guests still get reminders |
| Founder welcome text | new hosts | `FOUNDER_WELCOME_ENABLED=false` | Freeze; skip anyone in the ID map |
| In-container sweeps (nudges 5 min, expiring 15 min, day-before reminders 30 min) | hosts, guests | with the poller | Freeze with the poller |
| cart-recovery */15 | guests | crontab line | Freeze |
| lead-nudge hourly | hosts | crontab line | Freeze |
| review-nudge */30 | guests | cron.d line | Freeze |
| sms-extras */5 | guests | crontab line | Freeze |
| photo-concierge daily | hosts | crontab line | Freeze |
| Switchy host-link jobs */30, */5 | hosts | `/home/ubuntu/switchy/STOP` | Freeze |
| Switchy weekly stats, Thursday | all hosts | `WEEKLY_STOP` (held since Aug 7) | Stays held. Before any re-enable: reads Sunoblack listings and the new click log, and refuses to send if either source is not the post-move one. A failed lookup must never look like zero clicks |
| Concierge replies | hosts | `CONCIERGE_STOP` | Freeze |
| Host lifecycle emails (EAST) | hosts | `HOST_LIFECYCLE_EMAILS_ENABLED=false` | Off from the start of the final import |
| EAST mirror sync 15 min, listing-sync, host and renter drips, affiliate-sync | hosts, guests (drips) | per job [U] | Freeze; re-point or retire |
| $5 supporter appeal series (daily) | customers | runbook | Pause around the move announcement [D] |
| payout watchdog, restricted-sweep | Derek | — | Keep, pointed at Sharetribe, until list B is empty |
| warm-digest, stuck-detector, db-watchdog, other founder alerts | Derek, Brandon | — | Keep. Move warm-digest and db-watchdog sending out of the marketplace container before it is retired |
| switchy click snapshot | nobody | — | Keep |

A job without a switch has its cron line commented out, recorded, and
reported. Jobs that `docker exec` into the container named
`poolrentalnearme-production` must not be left pointing at a retired
container.

---

## 11. People: telling them, consent, privacy, support

### Order of messages

1. **Announcement first.** Wording approved by Derek, signed by Derek, Brandon
   or nobody, sent through Emailit with his GO. It goes out before any
   Sunoblack email (sign-in link, payout setup, booking notice) reaches anyone.
2. Then sign-in and payout emails.
3. A site banner and an FAQ.

- Email for verified addresses. US hosts who cannot be emailed: a text, with
  Derek's GO. International hosts are email-only today; anyone left over:
  [D].
- Our full suppression list goes to Sunoblack, and it confirms in writing
  that its sends honour it.
- The do-not-contact host is excluded by the system record, not by hand.

### Hard sign-in cases

Before the switch, list every host and guest with an unverified, Apple relay
or pending email. Import pending-email cases with the verified address.
Derek decides how to confirm the right address for unverified ones [D].
Check: every published host's email is verified or resolved one by one.

### Our own engines and imported accounts

Imported accounts get new ids and probably the import time as their created
date [U]. Today the welcome text treats anyone created in the last 15 minutes
as new [V]; the lifecycle engine keys its history on the Sharetribe id [V].
So: the ID map is loaded before any import to live; every engine reads it;
the engines stay off (section 10) until a dry run shows zero would-send rows
for imported accounts.

### The do-not-contact host (CLAUDE.md rule 6)

- His listing (published, payout account connected) comes across and stays
  live.
- One lasting record in Supabase that every sender checks, replacing the
  three ad-hoc places used today.
- Sunoblack confirms it can suppress all platform email to him (Q11). If it
  cannot: [D].
- He is left out of the December listing and payout checks. If his payout
  account cannot be attached, what happens to his bookings and payouts is
  decided now [D].

### Consent for new sign-ups

Sunoblack's sign-up must record terms acceptance (time and version), a phone
number, and a separate unticked SMS consent (Q12). Phone and
`smsConsentMarketing` are imported with each user. `sms_opt_out` stays the
STOP authority. Our text engine refuses anyone with no recorded consent.

### Privacy and legal

- No real personal data reaches Sunoblack, test site included, until a data
  processing agreement is signed (Q14). Until then, tests use aliased copies.
- Our privacy policy promises a written agreement with every processor,
  Standard Contractual Clauses for EEA and UK users, encryption at rest, and
  30 days' notice by email and banner before a material change [V]. [D]
  whether this move is material. If it is, the notice goes out at least 30
  days before go-live (Derek's GO, Emailit, do-not-contact host excluded), and
  go-live moves to match. A December 14 go-live would have needed notice by
  November 14.
- Update the policy to name the processor and one operating company: the
  policy, the test site footer and the supporter checkout name three
  different companies [V] [D].
- Terms: section 4.2 promises the all-in price at every display (California
  SB 478) [V]; section 4.4 promises a card on file for damage charges [V]. Both
  must still be true, or be changed, before January 1 [D].

### Support

- Who watches `support@` and Chatwoot from the switch to mid-January [D]. $5
  subscription cancellations also arrive at `support@`.
- The Chatwoot widget on Sunoblack pages (Q15).
- Any message about insurance, liability, coverage, claims or damage goes to
  Derek with the sender and the question, unchanged. Nobody else answers it.

---

## 12. Money that is still on Sharetribe, and payouts on Sunoblack

**Payouts on Sunoblack.** Existing accounts are Custom accounts on a manual
schedule, paid by Sharetribe's timer [V]. If Sunoblack expects Stripe's
automatic schedule, its bookings would sit in host balances and never reach a
bank. If it switches accounts to automatic, it sweeps money that Sharetribe's
pending payouts expect, and they fail. Test mode cannot show either: it uses
new test accounts.

- Do not change any payout schedule until list A is finished.
- A listing is bookable on Sunoblack only when its host's attached account
  shows `payouts_enabled` and nothing currently due.
- **Live-mode check before reopening, only with Derek's approval:** one small
  real booking on a real existing Custom account (a founder-owned host account
  if one exists [U]), through accept, payout to the bank, and a refund. No
  host or guest is involved.

**Stripe key.** With Custom accounts, our platform key can change a host's
bank account and payout schedule. Sunoblack's access level is Q1. During the
drain, Sharetribe and Sunoblack act on one Stripe account. After the drain:
delete the key from Sharetribe Console, roll the platform key, update WEST's
`STRIPE_SECRET_KEY`, and confirm Sunoblack still works.

**Chargebacks.** With destination charges, a dispute is taken from our
platform balance. Charges up to mid-November can be disputed into about March
2027 [U]. Keep the transaction, message and PaymentIntent export (section 3).

**Stuck payouts.** List B. Sharetribe is not cancelled while it has an item.

**2026 tax forms (1099-K).** Our Terms say we may issue them [V]; they are due
to hosts around January 31 [U]. [D] confirm in Stripe whether 1099 reporting
is on. File 2026 from the existing accounts using the Step 0 map. If Sunoblack
creates new accounts, keep all 2026 payouts on the old ones.

---

## 13. The order of work

Dates are a proposal; the closure ends January 1. A step starts only when its
gate is met.

| When | Step | Gate | Live site affected? |
|---|---|---|---|
| Nov 16–22 | Step 0 export (Derek runs it on the server). Send section 7 to Sunoblack. Ask for `noindex` on the test host. Derek answers section 18 | — | No |
| Nov 16 – Dec 6 | Build on test with aliased data: listing type, pricing fixtures, payouts in test mode, fields, pages. ID map, path table, redirect map, `/s` translation, `/go/` and iCal, engines reading the map, do-not-contact record, new smoke test, Chatwoot answers | Real data only after the processing agreement is signed | No |
| Dec 7–13 | Full rehearsal: import, switch through WEST on a staging hostname, run section 14, roll back, fix | Section 14 A–F pass on test | No |
| Before go-live | Announcement (Derek's GO). Suppression list to Sunoblack | Sunoblack confirms its import sends nothing | Email only |
| Go-live, proposed Dec 14–20 | The switch (section 15) | Sunoblack has answered Q1, Q2, Q9, Q11, Q14; rehearsal passed; 30-day notice served if Derek calls the change material; Derek's GO | Yes, during the closure |
| Dec 21–31 | Hosts check listings and payout setup (Derek's GO for each send). Live-mode payout check. Supporter waiver live, or the fallback ready | — | Yes |
| January 1 | Reopen bookings on Sunoblack | Checks 32–34 pass; Derek's GO | Yes |
| Until the computed end date | Sharetribe paid and frozen; list A bookings finish; list B worked down | — | No |
| End | Final export; Stripe key removed and rolled; Sharetribe cancelled | Lists A and B empty; end date passed | No |

---

## 14. Checks before the switch (all must pass)

**Nothing in this section sends anything to a real host or guest.** Tests on
the test marketplace use an import where every email is rewritten to a
controlled alias on our domain and every phone number is blanked. Real
sign-ins use only Derek's, Brandon's and listed test accounts. Texts go only
to an allowlist of our own phones. On live, checks are data comparisons only.

**A. Money** (test marketplace, Stripe test mode)

1. Every section 5 fixture: Sunoblack's guest total, host payout and fee equal
   the saved answers to the cent.
2. For each fixture listing, the all-in price on Sunoblack pages and on our
   homepage, city cards and `/p/` pages equals the 1-hour checkout total.
3. Decline, expiry, operator decline and operator cancel each refund 100% of
   what the guest paid, fee included, and the host gets 0. An admin refund
   reverses the transfer and the application fee; platform and host balances
   end as expected.
4. Guest self-cancel is off, or follows Derek's written rule.
5. Supporters: active; cancelled but still in the paid period; failed
   payment; bank payment pending; email matching no account. A non-supporter
   pays 15%.
6. Extra charge after a booking, host offer, deal link, saved-card charge:
   each works, or is retired with the Terms updated.

**B. Bookings**

7. Two test guests try the same hours at the same moment: one wins.
8. Minimum hours, buffer, advance notice and blocked dates are enforced.
9. For every booking in list A, Sunoblack refuses those hours.
10. A new test booking appears in the old iCal feed URL within its cache time.
11. Swimply calendar import still blocks hours.

**C. Data** (also run on live, as comparisons)

12. Every imported listing: title, price, photos (count and order), fields,
    owner, map position and **state** match the export; listings per owner
    match; no test or operator listings; promo codes not shown publicly.
13. Every imported account: email equals the export (verified or resolved),
    owns its exported listings, phone and consent imported.
14. Payout account attached to the right host for every host in the map, with
    `payouts_enabled`.
15. The ID map has a row for every Sharetribe user and listing id ever seen,
    in every state.

**D. Sign-in** (founder and test accounts only)

16. Founder and test accounts sign in by email link through the staging
    hostname: the link in the email, the cookie domain and the Stripe return
    URL are all on www.
17. A new test sign-up records terms acceptance, phone and an unticked SMS
    consent; our text engine refuses a user with no recorded consent.

**E. URLs and search engines**

18. Every row of the section 2 path table answers from its owner. No Sunoblack
    page references a path that is not routed to Sunoblack.
19. Every old listing and user id (all states, plus every URL in the old
    sitemap) answers with one redirect to a useful page, for every shape in
    section 9.
20. Every distinct link path found in `sms_log` and `email_send_log` lands on
    a useful Sunoblack page.
21. 20 sampled `/s?address=` links show the same city-filtered listings on
    Sunoblack as on Sharetribe.
22. `/go/` resolves in one hop and logs the click; an unknown link logs a miss.
23. Section 9 search-engine list: canonical, `og:url`, test host noindex or
    301, facets and cursor noindex, structured data, robots.
24. Homepage shows listing cards, a sampled city page shows its listings,
    every sitemap listing URL answers 200 directly, and no page contains
    `sharetribe.imgix.net`.
25. A scripted browse through Cloudflare (search, then 3 listings within 10
    seconds) gets no 429. `/_sunoblack/` is in the rate-limit skip rule and an
    image cache rule (today only `/assets/`, `/static/` and similar are
    skipped, at 60 requests per 10 s [V as of 2026-09-17]).

**F. Messages and silence**

26. Texts fire on accept, decline and reminder: allowlisted phones only.
27. Booking emails come from our domain and pass SPF and DKIM: internal
    addresses only.
28. A dry run of every engine (welcome, lifecycle, drips, weekly stats) shows
    zero would-send rows for imported accounts.
29. Every sender's dry run shows the do-not-contact host suppressed;
    Sunoblack confirms the same.
30. Emailit, Twilio and Sunoblack logs show no email or text reached any real
    person during import or testing.

**G. After the switch, daily until Sharetribe is cancelled**

31. Sharetribe shows zero new users, new or edited listings, and new bookings
    after the freeze.

**Before reopening on January 1** (with Derek's approval)

32. The live-mode payout check in section 12 passed.
33. Every bookable listing's host has `payouts_enabled`; the rest are not
    bookable.
34. The supporter waiver is live, or Derek's fallback is in place.

---

## 15. The switch, and how to undo it

**Switch**, in this order, with Derek's GO:

1. **Freeze jobs** (section 10). Report each one to Derek.
2. **Write freeze on Sharetribe:** sign-up, listing creation and listing
   editing off in the web app; Merlin shows its holding page; listing and user
   approval turned on in Console [U] whether that also stops the mobile app.
3. **Final full export and import.** The ID map is written.
4. **Data checks 12–15** on live. Nothing is sent.
5. **Route the whole path table:** the new nginx location file (its own file,
   `proxy_ssl_server_name on`, explicit Host) is swapped in, then `nginx -t`
   and reload. Redirect map, `/s` translation, `/go/` and iCal re-pointing on.
   Marketing site re-synced and sitemap regenerated. Cloudflare rules updated.
   New smoke test installed.
6. **Close every Sharetribe listing** through the Integration API, after one
   test listing shows that closing sends nobody an email [U], and after
   Sharetribe confirms in writing that open bookings on a closed listing still
   complete and pay out [U]. Keep the list for undo.
7. **Re-run checks 18–24 on live.** No sign-in emails.
8. Submit the new sitemap in Google Search Console.

The current "move nginx" swap only switches between two local containers
(`:3000`, `:4000`). Sunoblack sits behind Cloudflare [V] and needs its own
Host and SNI; nginx 1.18 sends no SNI unless told to [V]. So the Sunoblack
routing is its own file, and undo swaps that file back.

**Undo, before January 1:** swap the location file back; reopen the
Sharetribe listings from the saved list; point the marketing site back; jobs
stay frozen until Derek decides. Sharetribe was frozen, so nothing on it is
lost. Anything created on Sunoblack after the switch (new sign-ups or
listings) is listed from Sunoblack and copied back by hand [U].

**After January 1** an undo means moving live Sunoblack bookings back by hand.
That is not a clean undo; it is why the January 1 gates exist.

**Do not cancel Sharetribe** until lists A and B are empty and the computed
end date has passed. Then: a last export, the Stripe key removed and rolled
(section 12), and only then cancel.

---

## 16. Watching after the switch

- **New smoke test**, written and dry-run before the switch, installed at the
  switch, every 10 minutes, alerting Derek. It checks the new path table
  (Sunoblack owns `/s`, `/l`, `/login`, `/_sunoblack`; EAST owns `/`, `/p`,
  `/account/learning`), a Sunoblack price quote for one fixture listing (no
  booking made), and sample redirect rows. The current test checks things that
  stop being true at the switch, so it would alert every hour; it is replaced,
  not switched off.
- **Founder alerts** (db-watchdog, warm-digest) send from outside the
  marketplace container before that container is retired.
- **Daily report to Derek for 30 days:** Search Console 404s and coverage;
  404s in the access log; unmapped `/l/` and `/go/` hits; 429s on Sunoblack
  paths; Sharetribe write events (check 31); the open list A and B.
- Every scheduled run reported to Derek, including runs that send nothing.

---

## 17. Risks stated plainly

| Risk | What limits it |
|---|---|
| Sunoblack is early access; published limits are not yet enforced | Our own full export; Sharetribe kept frozen as fallback; Sunoblack's export tested before go-live |
| Hosts redo payout setup if existing accounts cannot be attached | Q1 decides it; biggest host-facing cost |
| A payout-schedule mismatch leaves money in host balances, or breaks Sharetribe's last payouts | No schedule change during the drain; live-mode check before reopening |
| A partner with our platform key can change hosts' bank details | Q1 on access level; key rolled after the drain |
| Hours already sold on Sharetribe are sold again | List A blocks; check 9 |
| Installed mobile apps keep booking on Sharetribe | Every Sharetribe listing closed at the switch; check 31 |
| City links show the whole national list | `/s` translation; check 21 |
| Google picks the Sunoblack host or sees duplicates | Canonical, noindex, check 23 |
| Hosts with bad or relay emails are locked out | Section 11 list; Apple relay question |
| Imported hosts are texted or emailed as new sign-ups | Engines off; ID map; dry runs; checks 28–30 |
| Privacy notice timing moves go-live | Derek's decision on "material", made this week |
| The supporter promise breaks on January 1 | Fallback chosen now |
| We pay Stripe's fee on every no-fee supporter booking | Known cost; Derek's decision |
| 12 listings lose photos above 20 | Q4 |
| Image-heavy pages hit the rate limit | Check 25 |
| The timeline is tight | Every step has a gate; a missed gate moves the date, not the gate |

---

## 18. Decisions for Derek

1. Confirm the whole marketplace moves in one switch (section 2).
2. Owner of the legal pages; `/terms-of-service`, `/privacy-policy`.
3. Old bookings still open on Sharetribe: separate old-app address, or support
   by hand (section 9).
4. Whether the text poller keeps running for those bookings only (section 10).
5. Closed and deleted listings: 301 to city page, or 410.
6. Deposit: keep today's behaviour or change it, and how to tell the 26 hosts.
7. Guest self-cancel: off, or a written refund rule.
8. Extra charges, offers, deal links, saved-card charges: keep or retire;
   Terms 4.4.
9. Promo-code limits: enforce or not.
10. Supporter waiver: pending bank payments, the January 1 fallback, what
    supporters see, the Stripe-fee cost.
11. Whether the move is a material privacy change (30-day notice); one
    operating company name.
12. How to confirm unverified host emails; who cannot be emailed.
13. The do-not-contact host: suppression if Sunoblack cannot, and his payouts
    if his account cannot be attached.
14. Mobile app: when it leaves the stores.
15. Stripe Identity and boost purchases: re-wire or retire.
16. Deletion date for the export copies.
17. 1099-K reporting for 2026.
18. Who watches `support@` and Chatwoot from the switch to mid-January.
19. Pausing the $5 appeal series around the announcement.
20. Approval for the live-mode payout check, and whose account.

---

## 19. Review record

Revision 2 handles 43 findings from three review lenses (money; people, data
and communication; URLs, search and integrations): 9 blockers, 28 major, 6
minor. Each unverified finding and each blocker was re-checked on 2026-11-15
against the code, our database (read-only) or public pages.

- Checked and dropped: none. Every finding held.
- Checked and narrowed: one finding put the live import at "about 1,196
  users"; no evidence supported that number, so it is not used.
- Checked and narrowed: the host lifecycle engine is armed in production mode
  but, as of 2026-09-17, runs by hand with no schedule.
- Checked and confirmed from Sharetribe's documentation: the manual payout
  schedule, Custom accounts and destination charges. The live accounts'
  actual schedules are still unread (section 3, row 11).
- Still unknown, carried as [U]: the 120-day chargeback window, the 1099-K
  deadline, and whether the September 17 Cloudflare rules are unchanged.
