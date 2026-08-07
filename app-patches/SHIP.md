# Shipping the app

Apple Developer agreement is signed, so releases are unblocked.

## Status: patches applied, build NOT run

Both patches are on branch **`claude/yo-6bgv46`** in the app repo —
`ce71ceb` (login persistence) and `1327c4b` (fixed unit type). No PR opened.

Verified there: patches applied with no fuzz or rejects; the
`flutter_secure_storage` 9.0.0 API was confirmed by compiling the patch's exact
code in a throwaway package pinned to that version (`flutter analyze` clean,
const-ness included); the enum claims were checked against the source rather
than assumed — `BookingUnitTypesX.value` reads the `.g.dart` map with `!`, so
that hand-written map entry is load-bearing and it is present; all 7 changed
files parse and are `dart format`-clean.

**Do not release without a real build.** A whole-project compile is impossible
in an agent session: `melos bootstrap` needs the private
`journeyhorizon/dart_sharetribe_sdk`, `flutter_translation` and
`flutter_timezone`, which agent credentials cannot reach. Run it on Jenkins or
a dev machine. Codegen is also unrun — confirm a regen of `listing_type.g.dart`
is a no-op. The device checks (force-quit/cold-start, Android's one-time
re-login after the storage backend change, iOS pre-first-unlock) need hardware.

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

Status (verified in the app repo): removing it from the working tree does not
remove it from **git history** — the token is still reachable in old commits.
It is expired and therefore unusable, so this is hygiene, not an active
exposure; purging it means a history rewrite, which is a separate decision.
A sweep of that repo found **no other** embedded JWT, `isLoggedInAs`, or
hardcoded `access_token`. The only other write to the token store is the
post-login one in the socials sign-in delegate, which is correct.

## Caveat on the source these were written against

The patches were derived from `poolrentalnearmeappmain.zip`, and applied cleanly
to `main` — the source matched.

**Correction to an earlier version of this doc:** it said "the repo's last push
was 2026-03-29". That is the repo-level `pushed_at` from the GitHub API, which
reflects a push to *any* branch. **`main` is at `7e29599`, dated 2025-10-27.**
Do not use the 2026 date to judge staleness.

That date matters: the hardcoded token below expired **2025-10-23**, four days
before the last commit on `main`. So the shipped app has been destroying
sessions on every cold start for roughly **nine months**, not four.

If `main` moves, re-check the files the patches touch before applying:

- `app/lib/main.dart`
- `common/lib/infrastructure/network/sdk/sdk_token_storage.dart`
- `common/lib/services/flutter_secure_storage/flutter_secure_storage.dart`
- `common/lib/domain/models/listing_types/listing_type.dart` (+ its `.g.dart`)
- `common/lib/config/line_items.dart`
- `app/lib/features/edit_listing/presentation/widgets/edit_listing_details_panel/edit_listing_details_panel.utils.dart`
