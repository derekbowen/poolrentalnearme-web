# Incident review — 2026-09-17 — "did PRNM give a guest my phone number?"

**Reporter:** Jaclyn (host, Ledyard CT, listing "Backyard Oasis CT"), via SMS to
Derek. A guest contacted her off-platform by text and Instagram and told her he
got her number from PRNM "when he made the booking". She felt unsafe and asked
whether that is accurate.

**Status: no evidence found that PRNM disclosed her phone number.** Read-only
investigation; nothing was changed and nothing was sent to her or the guest.

## Identity

| | |
|---|---|
| Sharetribe user | `688472d0-ebd7-49e3-b7ec-48578e5c459e`, displayName **"Jaclyn"** (first name only) |
| Listing | `6888401b-7fa7-4ba0-9c9d-95e529fcf533` "Backyard Oasis CT", published |
| Her number is stored in | `profile.protectedData.phoneNumber` — **one place only** |
| Recent completed booking | tx `6aa71509…`, booked 2026-09-13 23:00Z, completed 2026-09-16; customer `6a7d1c85…`, displayName "Sneakers 82", name on transaction Erik Brevik |
| Earlier inquiry from same customer | tx `6a9f31e9…` 2026-09-07, expired |

## Every surface checked

| surface | result |
|---|---|
| Listing `publicData` (hers) | no phone. Scanned **all 199 listings**: zero real phone numbers. 7 apparent hits were UUID fragments and one Swimply iCal URL |
| Listing `privateData` (hers) | `exactAddress`, `addressHiddenAt`, `addressHiddenReason` only |
| Listing free text (title, description, houseRules, checkingin, other_perks, guestRequirement) | no phone |
| Her public profile | displayName "Jaclyn", bio empty, publicData = agecheck / cityandstate "Ledyard, CT" / contact / userType. No phone, **no surname** |
| All 12 transactions: `protectedData` + `metadata` | no phone. `server/api/initiate-privileged.js` carries an explicit comment that phone and email are deliberately **not** copied into transaction data |
| Transactional email templates | **78 templates** under `ext/transaction-processes/`: zero `phone` / `mobile` / `cell` / `telephone` tokens |
| Marketplace frontend | **no component reads a provider's phone.** `phoneNumber` appears only in the user's own ContactDetailsPage, signup, the phone-verification extension, and CheckoutPage shipping details (a shipping flow PRNM does not use) |
| Marketing site (EAST) | only PRNM's own numbers (888-940-4247, 909-272-8096). Her surname appears nowhere in site code |
| Supabase | every table with a phone column has RLS enabled and **no grants to `anon` or `authenticated`** |
| SMS relay (`sms_log`, 4,821 rows) | her number never appears in any message body, to any recipient |
| Message threads on her 12 transactions | 6 messages total, **zero** contain a phone number, from either party |
| Live anonymous fetch of her listing page and profile page | zero occurrences of her number |

## What the guest legitimately receives

- Her **first name only** ("Jaclyn"). The platform never shows her surname.
- The **exact street address**, shared after a booking by design
  (`HostOnboardingPage/listingContract.js`: "privateData.exactAddress the street
  address, shared after a booking"). This is necessary for a booking and is the
  strongest identity vector we hand over.

## Real systemic finding (not her case)

The message relay forwards message text verbatim by SMS. Three customers have
historically received a **host's own phone number** because that host typed it
into the in-app chat. In all three the digits match that host's own number:

| when | listing | what the host typed |
|---|---|---|
| 2026-08-05 | Backyard Bliss | "Yes. 908 400 7722" |
| 2026-07-24 | Huge Private Pool & Party Lawn | "610-209-7264" |
| 2026-07-15 | TSC Outdoor fun services | "I cannot see your message. Please text me 2038107297" |

That is hosts sharing their own number, not a platform disclosure. It does not
apply to Jaclyn: her threads contain no numbers.

## Remaining explanations, none proven

1. The guest obtained it off-platform. Her account email is
   `pinnellrealestate@gmail.com`; a street address in a small CT town leads to
   public land records, an owner name, and from there to publicly published
   contact details. This path uses only the address, which we do share by design.
2. The guest is mistaken or untruthful about where he got it.
3. A disclosure route not covered above.

## Gaps I could not close from here

- **Live Sharetribe Console email templates.** I read the repo copies on WEST.
  If Console holds edited versions, they could differ. Worth confirming in
  Console → Build → Email templates.
- **Authenticated renter API view.** I proved the anonymous case empirically and
  proved our frontend never requests a provider's phone. Sharetribe's documented
  behaviour is that `users/show` returns only public profile data, but I did not
  authenticate as a renter to test it, because that needs a real session.

## Suggested next steps (none taken)

1. Ask Jaclyn for a screenshot of the guest's claim. That is the single piece of
   evidence that would settle it.
2. Confirm with her which booking and which guest.
3. Decide on a safety action for the guest account pending facts.
4. Product change to consider: detect phone numbers in outgoing in-app messages
   and warn the sender before the relay forwards them.

## Unrelated state note

The three host lifecycle cohorts remain unsent and untouched. Production config
unchanged: `HOST_PRODUCTION_CAMPAIGNS=no_listing_1`, no cron.
