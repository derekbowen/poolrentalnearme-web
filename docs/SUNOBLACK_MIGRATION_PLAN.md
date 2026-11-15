# Moving Pool Rental Near Me from Sharetribe to Sunoblack

Decision (Derek, 2026-11-15): we are leaving Sharetribe for Sunoblack.
Goal: move without a single problem for hosts, guests, money or search traffic.

This plan is written so that nothing on the live site changes until the new
marketplace has passed every check below, and so that every step until the
final switch can be undone.

Labels: **[V]** verified on 2026-11-15, **[U]** unknown until tested or answered
by Sunoblack, **[D]** Derek decides.

---

## 1. Where we stand today

| Fact | Value | |
|---|---|---|
| Sharetribe is answering | Search, listing pages, login and photos all load | [V] |
| The site is closed to bookings until | January 1 | Derek, 2026-11-14 |
| Published listings | 126 (of 200 in the mirror, last synced 2026-09-25) | [V] |
| Our own copy of users, transactions, messages | **None.** The `st_*` mirror tables are empty | [V] |
| Who knows which host owns which Stripe payout account | **Only Sharetribe.** Nothing on our side stores it | [V] code comment in `scripts/export-stripe-mapping.js` |
| Listing photos | Hosted by Sharetribe's image service; signed URLs | [V] |
| Sunoblack test marketplace | Live at `poolrentalnearme-test.sunoblack.pp.ua`, our homepage design, 6 listings that look like Sharetribe test data | [V] |
| Sunoblack tools connected to Claude | No | [V] |

The closure until January 1 is the best possible window: no live bookings, so
the switch can happen with nobody mid-checkout.

---

## 2. Step 0: copy everything out of Sharetribe now

Before anything else, while Sharetribe still answers. None of this changes
Sharetribe; every step only reads.

1. **Host-to-payout-account map.** `scripts/export-stripe-mapping.js`
   (branch `claude/sharetribe-dependency-audit-6axv9x`). Without it, hosts'
   Stripe accounts can only be matched by guessing on email, and a wrong match
   pays the wrong person.
2. **Full data export** through the Integration API: users, listings (all
   states, with every extended-data field), availability plans and exceptions,
   transactions with line items and transitions, reviews, messages.
   The `st_*` mirror in `fresh-web-702e04c3` already has the code
   (`src/server/sharetribe-mirror.server.ts`); it has never filled this
   project's tables. Run it once, then export the tables
   (`scripts/export-all-data.ts`).
3. **Every original photo**, full resolution, not the resized display copies
   (`scripts/download-listing-images.ts`, same branch).
4. **Hosted configuration**: listing types, fields, search settings,
   translations, the commission file (where the 15% lives), email templates.
5. Store the export in two places we own (an S3 bucket and an offline copy),
   checksummed.

**Needs:** Integration API credentials, which live only on our servers. Either
the `PRNM_AWS_*` keys are added to this session's environment settings, or
Derek runs the three scripts on the server. Read-only; no outbound messages.

**Done when:** counts in the export match Sharetribe's Console counts for
users, listings, transactions and reviews, and every listing has every photo.

---

## 3. What the new marketplace must do on day one

Counts are from our published listings. Each row is tested on the Sunoblack
test marketplace before cutover; "Sunoblack today" is what its public pages
and the new-listing form show.

### Money (any failure here is a blocker)

| Must work | How many depend on it | Sunoblack today |
|---|---|---|
| Hourly price, charged by the hour | all 126 | Test listings show "per hour" [U for checkout] |
| **15% guest fee on top of the host's price, host keeps 100%** | all | Not configured on the test site: it shows $100/hr and "$100 all-in" [U] |
| All-in price shown anywhere = checkout total, to the cent | all | [U] |
| Host is paid out after the booking, automatically | all | Stripe Connect payouts [U for timing] |
| Refunds on decline, cancel, expiry | all | [U] |
| Request-to-book: host accepts, then guest is charged | most | "In full when I accept" [U] |
| Instant book | 3 | [U] |
| Price options (weekday/weekend, packages) | 103; 47 have more than 3, up to 18 | Form shows 3 slots [U] |
| Paid extras (heater, etc.) | 94 | Not on the form [U] |
| Longer-booking discounts | 21 | Not on the form [U] |
| Refundable damage deposit | 26 | Its "deposit" means part-payment, not a refundable hold [U] |
| Different prices on set dates | 45 | [U] |
| Promo codes | 2 | [U] |
| **No guest fee for $5/month supporters** (promised to 213 customers on 2026-11-14) | promise in writing | [U]; needs a per-user fee waiver |

### Bookings and calendar

| Must work | How many | Sunoblack today |
|---|---|---|
| Weekly opening hours, in the pool's time zone | all | Test listings show start times by day and time zone [V] |
| Minimum and maximum hours | 29 | [U] |
| Buffer between bookings | 29 | [U] |
| Advance notice | 30 | [U] |
| Blocked dates | 29 | [U] |
| No double booking, ever | all | [U] |
| Swimply calendar import | 15 | [U] |
| Our calendar feed out to hosts' calendars | hosts who subscribed | [U] |
| Booking expires if the host does not answer | all | [U] |

### Listings and hosts

| Must work | How many | Sunoblack today |
|---|---|---|
| Photos | up to 61 per listing; 42 listings have more than 10, 12 have more than 20 | Plans cap at 20 per listing (limit published, not yet enforced) [V] |
| Pool details: check-in instructions, cancellation policy, house rules, accessibility, parking, water type… | about 40 fields in use (112, 109, 88, 76… listings) | Custom fields possible; 10 can be search filters on paid plans [V] |
| Search by place, guests, amenities, pool type | all | [U] |
| Address search when a host lists a pool | all new hosts | Free-text place plus typed-in coordinates [V] |
| Reviews carried over | 5 listings show ratings | Reviews section exists [V]; import [U] |
| Host sees their listings, bookings and payouts | all hosts | [U] |

### People

| Must work | Notes | Sunoblack today |
|---|---|---|
| Everyone can sign in after the move | Sharetribe will not export passwords | Email sign-in link only, so no passwords are needed [V] |
| Google / Facebook / Apple sign-in users | must sign in with the same email by link | [U] whether emails match |
| Messages between host and guest | history and new | [U] |
| Booking emails come from our domain | today `noreply@poolrentalnearme.com` via Emailit | [U] sender domain |
| The do-not-contact host (CLAUDE.md rule 6) receives nothing | the import will bring his listing | [U] whether import sends any email |

---

## 4. Questions for Sunoblack, in writing, before we build

1. **Stripe.** Can our marketplace use our existing Stripe platform account,
   and can existing connected accounts (Sharetribe-created Custom accounts)
   be attached to imported hosts, so hosts do not redo bank and ID checks?
2. **Import scope.** What does the Sharetribe import bring: users, listings in
   every state, all extended-data fields, original photos, availability,
   reviews, transactions, messages? Does it send any email to anyone? Can it be
   re-run as a final top-up just before switching?
3. **Test marketplace limits.** The test site always runs on Free limits
   (100 listings, 10 photos, 1 import). We have 200 listings. Can we rehearse
   the full import on test, and has our one free import already been used?
4. **Photos.** Can 12 listings keep more than 20 photos, or do hosts choose 20?
5. **Fees.** A 15% fee charged to the guest on top of the host price, with the
   host paid 100%, and a per-user waiver for supporters.
6. **Hourly bookings.** Minimum and maximum hours, buffers, advance notice,
   date-specific prices, more than 3 price options, paid extras, refundable
   deposit (card hold), instant book and request-to-book on the same site.
7. **Calendars.** iCal import and export.
8. **Webhooks and API.** Booking events to our server (our text messages run
   on them), and a way to read listings for our 10,000 marketing pages and
   sitemaps.
9. **Domain.** Can the marketplace run behind our own front door at
   `www.poolrentalnearme.com` for `/s`, `/l/…`, `/u/…` only, while `/p/…`
   stays on our marketing server? If not, a subdomain.
10. **Redirects.** Can old listing URLs (`/l/<slug>/<uuid>`) answer with one
    redirect to the new ones?
11. **Email.** Booking emails from `noreply@poolrentalnearme.com` with reply-to
    `support@`, SPF and DKIM on our domain.
12. **Exit.** Data export format, backups, uptime record, and what happens to
    our data if Sunoblack stops operating. It is in early access and
    independently developed.

---

## 5. What we have to rebuild or rewire ourselves

| Today | After the move | |
|---|---|---|
| Mobile app (Sharetribe-only) | Stops working | [D] retire it from the stores, or point it at the website, before January 1 |
| Text messages to hosts and guests (poll Sharetribe every 12 s) | Need Sunoblack webhooks | rewire |
| About 15 scheduled jobs on the marketplace server (review nudges, cart recovery, payout watchdog, booking texts…) | Most read Sharetribe | retire or re-point each one; Sunoblack allows 5 of its own |
| Marketing site listing cards, city inventory, `sitemap-listings.xml` | Read Sharetribe | switch to Sunoblack data |
| Host short links (`go.poolrentalnearme.com`) | Point at old listing URLs | keep working through the redirects; update targets |
| Old listing URLs in Google, emails, texts | `/l/<slug>/<uuid>` | one redirect each to the new URL |
| Operator "log in as", admin tools | Sharetribe Console | Sunoblack owner admin |
| Stripe Identity checks, boost purchases | Our server | re-wire or retire [D] |
| Insurance wording anywhere on the new site | — | [D] Derek only (CLAUDE.md rule 8) |

---

## 6. The order of work

Dates are a proposal; the closure ends January 1.

| When | Step | Live site affected? |
|---|---|---|
| This week | Step 0 exports. Send section 4 to Sunoblack. Connect Sunoblack to Claude. | No |
| Nov 16 – Dec 6 | Build on the test marketplace: listing type, hourly booking with the 15% guest fee, payouts, fields, pages. Import. Run every check in section 7. | No |
| Dec 7 – 13 | Full rehearsal on test: import, switch, verify, roll back. Fix what fails. | No |
| Dec 14 – 20 | Go live on Grow. Final import. Switch `/s`, `/l`, `/u` to Sunoblack. Redirects on. | Yes, during the closure |
| Dec 21 – 31 | Hosts check their listings and payout setup. Fix issues. | Yes |
| January 1 | Reopen bookings on Sunoblack | Yes |
| Through January 31 | Keep Sharetribe paid and read-only, as the fallback and for any old booking still settling | No |

Any message to hosts or guests about the move (new sign-in, check your
listing, payout setup) needs Derek's GO for that send, excludes the
do-not-contact host, and goes through Emailit.

---

## 7. Checks before the switch (all must pass)

On the test marketplace with Stripe test cards:

1. Book 1, 2 and 8 hours at a listing; the guest pays host price + 15% exactly;
   the host is paid 100%; the all-in price on every page equals checkout.
2. Host accepts, declines, ignores (expires); guest cancels; each refunds correctly.
3. Two guests try the same slot at the same moment: one wins, one is refused.
4. Minimum hours, buffer, advance notice and blocked dates are enforced.
5. A listing with 18 price options, paid extras and a deposit prices correctly.
6. A supporter books with no guest fee; a non-supporter pays 15%.
7. Every imported listing: same title, price, photos (count and order), fields,
   owner, map position as the export.
8. Every imported host can sign in by email link and sees their listings.
9. Payout account attached to the right host for every host with one.
10. Every old listing URL answers with one redirect to its new page; every
    `/p/` page still answers 200 from our marketing server.
11. Our text messages fire on accept, decline and reminder.
12. Booking emails arrive from our domain and pass SPF and DKIM.
13. No email or text reached anyone during import or testing.

## 8. The switch, and how to undo it

- **Switch:** final import top-up → spot-check 20 listings → route `/s`, `/l`,
  `/u` to Sunoblack → turn on redirects → re-run checks 7, 8, 10 on live.
- **Undo:** route the same paths back to the current marketplace server (the
  existing nginx file swap, no restart). Possible while Sharetribe stays paid.
  Because bookings are closed until January 1, undoing before then loses no
  bookings.
- **Do not cancel Sharetribe** until every old transaction has finished,
  including payouts and review windows, and the export has been checked.

---

## 9. Risks stated plainly

- **Sunoblack is early access** and published limits are not yet enforced.
  Mitigation: our own full export (Step 0), Sharetribe kept as fallback through
  January, and Sunoblack's own export tested before going live.
- **Hosts may have to redo payout setup** if existing Stripe accounts cannot be
  attached. That would be the biggest host-facing cost. Answer to question 1
  decides it.
- **12 listings lose photos** above 20 unless Sunoblack lifts the cap.
- **The mobile app stops.** Anyone using it needs to move to the website.
