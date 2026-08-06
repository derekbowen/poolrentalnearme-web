# Shipping the app

Apple Developer agreement is signed, so releases are unblocked.

## Why this can't be done from the marketplace session

The app lives in **`journeyhorizon/poolrentalnearme-app`** (private, we have
push). A session pinned to `derekbowen` repos cannot attach it:

```
add_repo: cross-tier adds are not supported in v1 — requested
"journeyhorizon/poolrentalnearme-app" but session already has repos
from owner(s) [derekbowen]
```

**Start a new Claude Code session with `journeyhorizon/poolrentalnearme-app` as
the initial source.** Everything needed is in this folder.

## Steps in that session

1. Branch off `main`.
2. Apply both patches from this folder (they are independent, and verified to
   apply cleanly individually and in sequence):
   ```
   git apply app-stay-logged-in.patch      # login persistence
   git apply app-fixed-unit-type.patch     # "Outdated listing!"
   ```
3. `fvm use && fvm dart pub get && fvm dart run melos bootstrap`
4. **Compile.** These patches were written by reading the source; there was no
   Dart toolchain in the environment that produced them. Nothing here has been
   built or run.
5. Optionally re-run codegen (`melos run build_runner` or
   `dart run build_runner build --delete-conflicting-outputs`). The one
   generated line added by hand — `BookingUnitTypes.fixed: 'fixed'` in
   `listing_type.g.dart` — is exactly what codegen emits, so a regen is a no-op.
6. Jenkins (`Jenkinsfile`) handles env sync, build-number bump, iOS and Android.

## Verify before release

- **Log in, force-quit, cold start.** Session must survive. That is the whole
  point of patch 1 — before it, `main.dart` overwrote the user's token on every
  launch.
- **Android specifically:** storage moves to `EncryptedSharedPreferences`, so
  existing users sign in **once** more after updating, then stay signed in.
- **iOS:** reboot the device and open the app before unlocking it once —
  `first_unlock_this_device` should keep the session readable.
- Open a listing on a non-`hourly-pool` type as its host — the details form must
  render instead of "Outdated listing!".

## Known gap — do not skip

Guests still cannot book a **`fixed`** ("Preset Booking Windows") listing in the
app: its length comes from the price variant's `bookingLengthInMinutes`, and the
app has no picker for that. Deliberately not faked — a start/end picker would
create wrongly priced bookings. Zero published `fixed` listings exist today.
**Keep hosts on `hourly-pool` until that picker is built.**

`default-negotiation` is likewise still missing from `supportedProcess`, so a
`needzone-request` listing would show `UnsupportedPanel`. No listings use it.

## Security item for this release

The removed `main.dart` block shipped a live operator token in every binary:
`isLoggedInAs: true`, `scope user:limited`, for host **Tiara Jones**
(`tiarajones27@gmail.com`), `exp` 2025-10-23 (expired, so not usable). Worth a
look at how it got committed, and worth confirming no other build carries one.

## Caveat on the source these were written against

The patches were derived from `poolrentalnearmeappmain.zip`. The repo's last
push was 2026-03-29. If `main` has moved since, re-check the four files the
patches touch before applying:

- `app/lib/main.dart`
- `common/lib/infrastructure/network/sdk/sdk_token_storage.dart`
- `common/lib/services/flutter_secure_storage/flutter_secure_storage.dart`
- `common/lib/domain/models/listing_types/listing_type.dart` (+ its `.g.dart`)
- `common/lib/config/line_items.dart`
- `app/lib/features/edit_listing/presentation/widgets/edit_listing_details_panel/edit_listing_details_panel.utils.dart`
