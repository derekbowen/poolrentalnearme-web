# Flutter app patches

The mobile app lives in a separate repo (`poolrentalnearme-app`, Flutter/melos,
SDK dep `git@github.com:journeyhorizon/dart_sharetribe_sdk.git`). It is not built
from this repo. Fixes we find are staged here as patches so they are not lost,
and so whoever holds the app repo can apply them without re-deriving the work.

Apply from the app repo root: `git apply /path/to/<patch>`

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

## `OUTDATED-LISTING-ROOT-CAUSE.md`

Why the app shows "Outdated listing!" — the app's unit-type enum is
`{item, hour, day, night, inquiry}` and our Console offers `fixed`
(`rentalslots`) and `request` (`needzone-request`), so `isValidListingType()`
returns false for them. Includes the code path, the live-vs-supported config
table, and the per-listing exposure count. Data side is already resolved; the
Dart fix is described there but **not** included in the patch above, because it
needs `build_runner` codegen for the enum change.
