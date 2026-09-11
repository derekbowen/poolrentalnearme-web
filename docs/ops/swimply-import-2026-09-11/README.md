# Swimply → PRNM listing import — pool 84203 (The Grajales Patio, Fontana CA)

Date: 2026-09-11. Requested by Derek after a phone call with the host.
Source: `https://swimply.com/pooldetails/84203`

## Result

| | |
|---|---|
| Listing | `6aa48caa-bfda-4e32-87ee-4cff77f4c0d6` — **published** |
| URL | https://www.poolrentalnearme.com/l/the-grajales-patio-private-poolside-in-fontana/6aa48caa-bfda-4e32-87ee-4cff77f4c0d6 |
| Author | Bibiana Grajales (`6a9f4749-7082-4375-b21f-89ff214ab8ce`, `bibiana101@hotmail.com`, signed up 2026-09-07) |
| Type | `hourly-pool` / `hour` / `default-booking/release-1`, USD |
| Base price | $35.00/hr (3500 subunits) |
| Images | 14 of 14 uploaded and attached |
| Verified | listing page HTTP 200; appears in `/s?bounds=…` around Fontana |

## Why this host account

Derek said "him"; the Swimply owner profile is "Bibi". They are the same
household: the PRNM account is **Bibiana Grajales**, ZIP `92336` (North
Fontana), and the Swimply listing is "The Grajales Patio" in Fontana. The
account had **zero** existing listings, so there was no duplicate risk. The
create script aborts if the author already owns any listing.

## Field mapping (every value traceable to the Swimply page)

| PRNM field | Swimply source |
|---|---|
| `title` | Swimply title, normalised + city appended |
| `description` | host's own Swimply copy verbatim, then a "Good to know" block built only from Swimply's own booking settings |
| `price` / `priceVariants` | Swimply `price_tiers[].hourly_price` — 1-5 $35, 6-10 $45, 11-15 $55, 16-20 $65, 21-30 $85 |
| `priceVariationsEnabled: true` | required or `OrderPanel` ignores the tiers (see finding below) |
| `guestallowed: 30` | `max_guests` |
| `availabilityPlan` | `available_from` 09:00 → `available_to` 22:00, `time_zone` America/Los_Angeles, all 7 days |
| `advanceNoticeDays: 1` | `advance_notice: 24` (hours) |
| `minBookingHours: 3` | `min_booking_length: 3` |
| `isInstantBooking: false` | `default_instant_booking: false` |
| `proHost: false` | `user.is_pro_host: false` |
| `alcohol` / `smoking` / `loud_music` | `RuleSetting.is_allowed` |
| `houseRules: [no_pets, no_smoking]` | `pets_rule: NotAllowed`, smoking not allowed |
| `shower: "outdoor"` | free "Shower" amenity (Outdoor shower) |
| `amenities[]` (7 priced add-ons) | Swimply `PoolPremiumAmenity` entries with a non-zero flat price |
| `externalReviews` | the 3 real Swimply reviews, rating 5 — copied, not summarised |
| `geolocation` | Swimply's own `latitude_round` / `longitude_round` |
| `importedFrom: "swimply:84203"` | convention set by the prior import `swimply:10961` |

### Deliberately NOT set

Swimply's public page does not publish them and nothing was invented:
pool size, depth, water type, pool type, square footage, parking count,
restroom type, private/shared space, security cameras, transportation notes.

**Heating, Wi-Fi, BBQ, fire pit and speakers were kept OUT of `poolAmenities`
and `advantagesSelection`.** On Swimply every one of them is a paid flat-fee
add-on ($25–$200), so listing them as amenities would put them in search
filters as if included. They live in `amenities[]` with their prices, and the
description states each price.

No cancellation promise was written into the description. `cancellation_policy`
carries Swimply's literal "24 hours"; our refund behaviour is whatever
`default-booking/release-1` does, and that was not verified here.

## Open items for Derek

1. **Bibi has no Stripe payout account** (`stripeConnected: false`). The
   listing is live and bookable-looking, but the privileged transition will
   fail for a guest at checkout. She has to finish payout setup.
2. **No street address.** Her signup stalled on exactly that — her reply in
   the stuck-host thread was "My address is not populating?". The map pin is
   Swimply's rounded public coordinate; `privateData.addressStatus` records
   this. The same wizard bug is blocking several other new hosts.
3. **Prior import `swimply:10961` (Justice For Pools) is missing
   `priceVariationsEnabled`.** It carries 7 price tiers ($200–$500/hr) that
   `OrderPanel` never offers, so every booking is priced at the $200 base.
   Not changed here — that is the host's pricing, not ours to alter unasked.

## Reproducing

Run on WEST (both read `SHARETRIBE_INTEGRATION_SDK_CLIENT_*` from
`/home/ubuntu/live.env`; no credential is stored in this directory):

```
ship.py west sw84203_payload.json /home/ubuntu/sw84203/payload.json
ssm_runx.py imgs.py      # download from imgix, POST /v1/integration_api/images/upload
ssm_runx.py create.py    # aborts if the author already has a listing
ssm_runx.py verify.py
```

`vocab.py` is the field-vocabulary scanner used to pick valid `publicData`
enum values from the 123 published listings rather than guessing them.
