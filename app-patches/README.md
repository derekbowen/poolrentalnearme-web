# Flutter app patches

The mobile app lives in a separate repo (`poolrentalnearme-app`, Flutter/melos,
SDK dep `git@github.com:journeyhorizon/dart_sharetribe_sdk.git`). It is not built
from this repo. Fixes we find are staged here as patches so they are not lost,
and so whoever holds the app repo can apply them without re-deriving the work.

App repo: **`journeyhorizon/poolrentalnearme-app`** (private; we have push
access). Apply from its root: `git apply /path/to/<patch>`

These patches were written against the source but **not compile-checked** —
there is no Dart/Flutter toolchain in the environment they were produced in.
Run `melos bootstrap` and a build before shipping.

## `app-stay-logged-in.patch`

Fixes "I have to log in every time" on iOS and Android. Three changes:

1. **`app/lib/main.dart` — the actual bug.** Startup unconditionally called
   `sdkTokenStore.save(...)` with a hardcoded `Oauth2Token`. `save()` writes
   under the `clientId` key, which is the same key the signed-in user's own
   token uses, so **every cold start destroyed the real session**. The token was
   a `scope: user:limited`, `isLoggedInAs: true` operator token for a live host
   account, `exp` 2025-10-23 — expired, and shipped inside every installed
   binary. Removed. Nothing may write to the token store during startup.
2. **`common/lib/services/flutter_secure_storage/flutter_secure_storage.dart`** —
   `const FlutterSecureStorage()` used platform defaults. Now sets
   `AndroidOptions(encryptedSharedPreferences: true)` (the default Keystore
   backend loses its key across OS upgrades and backup/restore) and
   `IOSOptions(accessibility: first_unlock_this_device)` (the default `unlocked`
   fails to read when the app starts before first unlock).
   *Android note:* this switches storage backend, so Android users sign in once
   more after the update, then stay signed in.
3. **`common/lib/infrastructure/network/sdk/sdk_token_storage.dart`** — `read()`
   let a `jsonDecode` failure throw, which every caller reads as "no session".
   Now returns `null` on a bad entry instead of blowing away a live session.

Requires no codegen. `pubspec.lock` pins `flutter_secure_storage: 9.0.0`, which
supports all options used.

## `app-fixed-unit-type.patch`

Stops "Outdated listing!" for listing types the build does not model yet.

1. **`common/lib/domain/models/listing_types/listing_type.dart`** — adds `fixed`
   to `UnitTypes` and to `BookingUnitTypes` (`@JsonValue('fixed')`), and routes
   `'fixed'` to `ListingTypeBooking` in `_fromJson`. That is our `rentalslots`
   ("Preset Booking Windows") type.
2. **`listing_type.g.dart`** — adds `BookingUnitTypes.fixed: 'fixed'` to
   `_$BookingUnitTypesEnumMap`, hand-written to match what `build_runner` emits.
   Re-running codegen reproduces it; nothing else in the file changes.
3. **`common/lib/config/line_items.dart`** — registers `line-item/fixed` in
   `recognizeLineItem` and `listingUnitTypes` so a fixed booking's main line is
   not dropped from price breakdowns.
4. **`edit_listing_details_panel.utils.dart`** — `isValidListingType()` returned
   `false` for any type it could not classify, which is precisely what produced
   the error. An unknown type whose **id matches a configured listing type** is
   now treated as valid so the host can still edit.

Verified safe to add the enum values: no code anywhere switches on
`BookingUnitTypes`, and the only exhaustive switch over `UnitTypes` is the
`UnitTypesX.value` extension, updated in the same patch.

**Still open after this patch — guest-side booking for `fixed`.** A fixed
booking's length comes from the chosen price variant's `bookingLengthInMinutes`,
not from units picked (see `src/containers/ListingPage/ListingPage.duck.js` in
the web repo, which special-cases `isFixed`). The app has no picker for that, so
a *published* `fixed` listing shows a guest no booking widget. Deliberately not
faked here — a start/end picker would create wrongly priced reservations. Zero
published `fixed` listings exist today, so nothing is currently affected. Keep
hosts on `hourly-pool` until that picker is built.

**Not addressed:** `default-negotiation` is still absent from `supportedProcess`
in `common/lib/transactions/transaction.dart`, so a `needzone-request` listing
would still hit `UnsupportedPanel`. No listings use it.

## `OUTDATED-LISTING-ROOT-CAUSE.md`

Why the app shows "Outdated listing!" — the app's unit-type enum is
`{item, hour, day, night, inquiry}` and our Console offers `fixed`
(`rentalslots`) and `request` (`needzone-request`), so `isValidListingType()`
returns false for them. Includes the code path, the live-vs-supported config
table, and the per-listing exposure count. Data side is already resolved; the
Dart fix is described there but **not** included in the patch above, because it
needs `build_runner` codegen for the enum change.
