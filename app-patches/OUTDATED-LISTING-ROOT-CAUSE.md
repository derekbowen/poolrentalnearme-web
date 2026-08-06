# "Outdated listing!" in the Flutter app — root cause

## Verdict
The app is one Sharetribe generation behind our marketplace config. Our Console
offers listing types with unit types the app's code does not know exist. Any
listing on one of those types is rejected by the app with "Outdated listing!"
and cannot be edited there. Nothing is wrong with the listings; the web is fine.

## The exact line

`app/lib/features/edit_listing/presentation/widgets/edit_listing_details_panel/edit_listing_details_panel.utils.dart:87`

```dart
bool isValidListingType({...}) {
  return listingTypes.any((element) {
    final listingTypesMatch = element.id == existingListingType;
    final unitTypesMatch = switch (element) {
      ListingTypeBooking(unitType: final unitType) => unitType.value == existingUnitType,
      ListingTypePurchase() => existingUnitType == 'item',
      ListingTypeFreeMessaging() => existingUnitType == 'inquiry',
      _ => false                       // <-- unknown unit type => ALWAYS INVALID
    };
    return listingTypesMatch && unitTypesMatch;
  });
}
```

Chain:
1. `common/lib/domain/models/listing_types/listing_type.dart` — `UnitTypes` enum is
   `{item, hour, day, night, inquiry}`. No `fixed`. No `request`.
2. `ListingType._fromJson` routes `hour|day|night` → `ListingTypeBooking`,
   `item` → `Purchase`, `inquiry` → `FreeMessaging`, **everything else →
   `_ListingType`** (the plain fallback member, which carries no unit type).
3. `isValidListingType` sees a `_ListingType`, hits `_ => false`.
4. `EditListingDetailsPanel` → `canShowForm == false` → `ErrorMessage(...)` →
   `'EditListingDetailsPanel.invalidListingTypeSetTitle': 'Outdated listing!'`
   (`app/lib/core/translations/en.dart:460`).

Same `_ => false` shape in `getTabs`/`hasListingTypeConflict`
(`edit_listing_wizard.utils.dart`), which collapses the wizard to the details tab.

Guest side has a parallel hole: `common/lib/transactions/transaction.dart:35`
```dart
final supportedProcess = <BaseProcessInfo>[PurchaseProcess, InquiryProcess, BookingProcess];
```
`default-negotiation` is not there, so `getProcessByName` returns null and
`OrderPanel` renders `UnsupportedPanel` — the same "Outdated listing!" copy.

## Live config vs app support
From `https://cdn.st-api.com/v1/assets/pub/<clientId>/a/latest/listings/listing-types.json`:

| id | unitType | process | app? |
|---|---|---|---|
| `hourly-pool` | hour | default-booking | OK |
| `rentms` | hour | default-booking | OK |
| `rentalslots` (Preset Booking Windows) | **fixed** | default-booking | **breaks** |
| `needzone-request` (Pool Request) | **request** | **default-negotiation** | **breaks** |

Config load itself is healthy — asset paths come back with a leading slash and
match the lookup keys in `hosted_configs.dart`, so there is no silent fallback to
the bundled defaults. Ruled out.

## Actual exposure — 175 listings

```
159  hourly-pool     | default-booking/release-1 | hour     OK
  3  rentms          | default-booking/release-1 | hour     OK
  2  rentalslots     | default-booking/release-1 | fixed    BROKEN IN APP
 10  (test drafts/closed, no publicData)
  1  config listing
```

The two broken ones:
- `68865990-2dec-4c64-a6a3-475f95ffe556` — "Luke's Lounge LLC near philly",
  **closed**, Nicole (missnicolel@aol.com). This is the one she is opening.
- `6a3333fc-5bd4-4cdc-9e37-f725f809b51e` — "Bumpass paradise", **draft**,
  Lisac (lisacmcadams@gmail.com).

Nicole's *live* listing `6a1ef54c-7f0e-4171-b806-bdb25416ea00` ("Luke's Lounge
LLC") is `hourly-pool`/`hour`, published, 12 images, 7-day availability plan,
6 price variants, Stripe connected, 4 prior transactions. It is healthy and
renders fine in the app. She has a duplicate and is editing the dead one.

## Fixes

### A. Data (no release, fixes today's exposure) — NEEDS APPROVAL
Move the closed duplicate off the app-fatal type. It is closed, so no booking,
pricing, or guest-facing behaviour changes:

```
listingType            rentalslots  ->  hourly-pool
unitType               fixed        ->  hour
transactionProcessAlias            default-booking/release-1  (unchanged)
priceVariants          drop bookingLengthInMinutes (only meaningful for `fixed`)
```

Script written and ready: `scratchpad/w_nicole_fix.py`. It prints a full JSON
backup of the prior `publicData` before writing and refuses to run unless the
listing is closed. **Two attempts to run it were blocked by the permission
classifier — it needs an explicit go-ahead.**

Lisac's draft deliberately left alone: she is mid-creation on the web where
`fixed` works, and changing her listing type under her would be wrong.

### B. Config (no release, prevents recurrence) — needs a decision
Remove `rentalslots` and `needzone-request` from the Console's listing types so
no host can select an app-fatal type. Cost: the web loses Preset Booking Windows
and Pool Request, both of which work there. Zero listings use
`needzone-request` today, so removing that one is free.

### C. App code (needs an app release, currently blocked on the Apple agreement)
1. `listing_type.dart` — add `fixed` to `BookingUnitTypes` and `UnitTypes`, route
   `'fixed'` to `ListingTypeBooking` in `_fromJson`. Requires `build_runner`
   (the enum maps in `listing_type.g.dart` are generated).
2. `edit_listing_details_panel.utils.dart` and `edit_listing_wizard.utils.dart` —
   stop treating an unknown-but-id-matching listing type as invalid. Degrading to
   a limited editor beats a dead end.
3. `transaction.dart` — add a `default-negotiation` process, or explicitly route
   its listings to the web.

## Ruled out along the way
- Hosted config load failing / falling back to bundled defaults — no; asset paths
  match, live JSON parses.
- Listing data corruption — no; `hourly-pool` listings carry exactly the fields
  the app expects.
- App traffic regression from our web deploys — no; the app talks to the
  Sharetribe API directly, and nginx shows zero WebView loads of the edit page.
- A parse exception — no; `unitType` is read as a plain `String?`
  (`common/lib/extensions/listing.dart:10`), so nothing throws. It is a silent
  validation false.
