# "Text us" bubble on EAST (built 2026-11-05, not yet deployed)

A small floating "Text us" button replaces the removed Intercom bubble on every non-admin page EAST renders (`/`, `/p/*`, blog, and so on). Derek approved the design. This folder holds the component and its deploy script. **Nothing has been committed, pushed or run against a server.**

| File | What it is |
|---|---|
| `text-us-bubble.tsx` | The component (`export function TextUsBubble()`). It imports only `react`. The box fetches it from this public repo at a pinned commit and checks its sha256. |
| `east_apply_text_us.py` | The deploy script, modeled on `../remove-intercom/east_remove_intercom.py`, with the pinned fetch from `../hero-video/east_apply_hero_video.py`. `DRY=True` by default. Its base64 payload is about 7.3 KB, under the 9.4 KB SSM limit. |

WEST (`/s`, `/l/*`, checkout) gets its own bubble from `src/components/TextUsBubble/`. That is a separate change, with the same topics and the same prefill strings.

## What changes on EAST

- **New file:** `src/components/text-us-bubble.tsx`. The script refuses if this file already exists.
- **`src/routes/__root.tsx`:** exactly two insertions, md5-gated on `c6aedc950b8e3a76efed6d7f64fe647e`. Each anchor must occur exactly once.

```diff
@@ -8,2 +8,3 @@
 import { AffiliateRefCapture } from "@/components/affiliate-ref-capture";
+import { TextUsBubble } from "@/components/text-us-bubble";

@@ -133,2 +134,3 @@
       </div>
+      {!isAdmin && <TextUsBubble pathname={pathname} />}
     </>
```

- **Admin:** the bubble is hidden on `/admin*`, by the same rule the box's Intercom used (`!isAdmin`).
- **Navigation:** `pathname` is the root's existing `useRouterState` value. Passing it in lets the panel close on client-side navigation without the component importing TanStack.
- **Nothing else changes:** no CSS file, no other component, no env.

## Behaviour

- **Server HTML is unchanged.** The component renders `null` on the server and on the first client render, and mounts after hydration. A `renderToString` of the component returns `""`.
- **Steps:**
  1. "Hey 👋 what do you need?"
  2. Pick one: I'm a swimmer / I'm a host / Something else.
  3. Pick a topic.
  4. See the answer, then "Still stuck? Text us".
- **Human-only topics:** these show no canned answer, only "This one needs a person…" and a **Text us** action. They cover insurance, damage, injury, disputes, account deletion and privacy, plus partnerships and other questions.
- **Phones** (`(pointer: coarse)` or a mobile UA): Text us is `sms:+1…?&body=<prefill>`.
- **Desktop:** Text us reveals **(855) 617-8207** with a **Copy** button and an **Email us** link (`mailto:support@poolrentalnearme.com?subject=<prefill>`).
- **The number stays out of page HTML.** It is built from parts at tap time, so it never appears in page HTML or as one contiguous string in the bundle. This was checked on a minified Vite build: 0 hits each for `8556178207`, `(855)` and `617-8207`. The homepage "Text Derek" card already puts the number in `/`'s HTML; that card is not touched here.
- **Prefill text** (exact, straight apostrophe, matched by `isBubbleOpener()` in `server/extensions/sms-messaging/mod/notify/routing.js`):
  - Swimmer: `Hi! I'm a swimmer on Pool Rental Near Me. Question about <topic label>: `
  - Host: `Hi! I'm a host on Pool Rental Near Me. Question about <topic label>: `
  - Other: `Hi! I have a question about Pool Rental Near Me: `
- **No inputs, no requests:**
  - There is no input, textarea, select, form or contenteditable anywhere.
  - The widget makes no network request, loads no script and sends nothing itself.
  - `window.plausible('TextUs', {props:{step}})` is called only if Plausible already exists. EAST loads none, so this does nothing there.
- **Accessibility:**
  - The launcher has `aria-label="Text us"`, `aria-expanded` and `aria-controls`.
  - The panel is `role="dialog"` with an `aria-label`. It is non-modal: no backdrop, no scroll lock, no focus trap.
  - Focus moves to each step's heading, and Back walks up one step.
  - X or Escape closes the panel and returns focus to the launcher.
  - Under reduced motion there is no entrance animation and no transitions.
- **WEST's injected `#prnm-cta`:** it is hidden while the panel is open, by a `<style>` the component renders, and restored on close.

## Position: bottom-left (deliberate)

The computed task asked for "bottom-right on lg". The bubble is **bottom-left at every width** instead, as the research plan recommended:

- **The bottom-right corner is taken.** WEST injects `#prnm-cta` (`/tools/cta.js`) there on almost every page, at `right:14px; bottom:14px; z-index:2147483000`, which is above everything. A bottom-right bubble on desktop would sit underneath it.
- **Placement by width:**

  | Width | Launcher | Offset |
  |---|---|---|
  | below `sm` | 48 px circle | `left-3`, `bottom: calc(5rem + safe-area)`, which clears every sticky bottom bar (61–70 px) |
  | `sm` and up | "💬 Text us" pill | same `bottom` as below `sm` |
  | `lg` and up | pill | `left-6 bottom-6` |

- **Panel width:** full width minus 12 px gutters on phones, and `w-[22rem]` from `sm` up.
- **Stacking:** `z-[45]` sits above the header, the page bars and FloatingFredTip (z-40). It sits below Radix overlays and lightboxes (z-50), the mobile menu (z-[60]) and the founder and host-lead modals.
- **Clearance against `#prnm-cta` at 320 px:** the circle's right edge is 60 px. `#prnm-cta`'s left edge, at its maximum width, is 60.4 px, so the gap is about 0.4 px.
- **To go bottom-right later**, `#prnm-cta` has to be retired first (cta.js lines 108–202 on WEST). Then use `right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] lg:right-6 lg:bottom-6`, plus `sm:hidden` on the academy hub, where FloatingFredTip sits.

## Content

The component ships only the topics with no open question for Derek, plus the human-only ones. Each answer is verbatim from the fact-checked list:

| Role | Topic | Type |
|---|---|---|
| swimmer | Safety, injury, damage or a refund dispute | human-only |
| host | Fees & pricing | canned answer + link to ToS §4.1 |
| host | Insurance, damage, injury or a dispute | human-only |
| other | Partnerships & press | human-only |
| other | Delete my account or data | human-only |
| other | Another question | human-only |

**Below the spec's 4–6 topics per role.** Swimmers get 1 topic, hosts 2 and "other" 3. Ten drafted topics are withheld until Derek answers the question attached to each one. They are not in the component, so they cannot ship by accident.

| Topic | Derek's decision needed |
|---|---|
| swimmer: How booking works | Confirm the hold/charge wording. It was checked against the repo copy of the process, not the live Console process. |
| swimmer: What the price includes | Refundable deposits are charged at checkout but are not in the all-in price (rule 8 area). Name them? |
| swimmer: No reply from the host | Keep the "if your swim is coming up soon, text us" line? Requests can stay open until the slot has passed. |
| swimmer: Cancelling or changing | Do guests text PRNM to cancel? What applies when a listing has no terms? Does the ToS "Cancellation and Refund Policy" exist? |
| swimmer: Pool rules | Add the per-booking waiver line? |
| host: Listing my pool | Mention eligibility and the safety standards (ToS §6)? |
| host: Getting paid | Approve a payout-timing statement, or leave timing out. |
| host: Calendar & availability | Restore the caveated Swimply-feed sentence? |
| host: Getting more bookings | Should support copy recommend instant booking at all? |
| other: Something isn't working | Repeat the §8 "we make it right" commitment here? |

To add one once Derek approves it, put it in `GROUPS` in `text-us-bubble.tsx` with his exact wording, commit, and re-pin `SHA`/`SUM`.

## Verified locally (scratch copies only; nothing touched a server)

- **Standalone typecheck:** `tsc --noEmit` with strict, `noUnusedLocals`, `exactOptionalPropertyTypes` and `skipLibCheck:false`, against React 19.2 types: **0 errors**.
- **Full-project typecheck:** the repo's fresh-web tree plus the box's patched `__root.tsx` and box component copies. **0 errors in `__root.tsx` or `text-us-bubble.tsx`.** The 6 errors reported are the 4 known repo route errors and 2 from drift between the repo and the box in unrelated files.
- **Deploy script against a fake box:** the real script was run with only these substituted: paths, site, sudo prefix, pm2 command, and a `file://` source. Results:
  - The unmodified script refuses, because the placeholders are still in place.
  - DRY run prints the diff above and changes nothing.
  - DRY=False writes the file, applies both insertions, builds, verifies and keeps the old hashed assets.
  - A second run refuses (drift, anchor, file exists).
  - It aborts on a sha256 mismatch, a drifted `__root.tsx`, and unbuilt source edits.
  - A failed build rolls back to the original md5 with the component removed.
  - A marker leaking into SSR HTML rolls back too.
- **Browser (Vite production build + headless Chromium):** 105 checks passed at 320, 360 and 390 px touch, 1366 px desktop, and under reduced motion. They cover:
  - exact `sms:` hrefs for all three prefixes
  - the desktop number, clipboard copy and `mailto:` subject
  - Back, X, Escape and focus return
  - keyboard-only navigation
  - closing on `pathname` change
  - `#prnm-cta` hidden while open and restored on close
  - no overlap with `#prnm-cta` or the mobile bar
  - no network requests and no console errors or hydration warnings

## Ship order

1. Commit `ops/east/text-us-bubble/` and push. Then set `SHA` in `east_apply_text_us.py` to that commit, and `SUM` to `sha256sum text-us-bubble.tsx`.
2. Run `python3 ops/runners/east_runx.py ops/east/text-us-bubble/east_apply_text_us.py` with `DRY=True`. It checks:
   - the fetch and the sha256
   - the `__root.tsx` md5 and both anchors
   - that no file is newer than the last bundle
   - live baselines for `/` and `/p/how-to-host-a-pool-party`: 200, the count of the number, and no marker
3. Set `DRY=False` and run again. The script then:
   - backs up to `/home/ubuntu/backup-east-text-us-<ts>/`, including the current `fw-assets`
   - writes the file and the patch, then builds as ubuntu with `NODE_OPTIONS=--max-old-space-size=3072 npm run build`
   - copies back the previous hashed assets, so pages already loaded keep working
   - runs `pm2 restart fresh-web`
   - verifies that `dist/client` contains `prnm-text-us-v1`, both pages return 200 with an unchanged number count, and no marker appears in the SSR HTML

   Any failure restores `__root.tsx`, removes the component, rebuilds and restarts.
4. Write `docs/OPS_RECORD_<date>_text-us-bubble.md`. Do **not** mirror this into `/home/user/fresh-web`, because its history differs from the box.

**Manual rollback:** copy `backup-east-text-us-<ts>/__root.tsx` back and `rm src/components/text-us-bubble.tsx`. Then rebuild (heap 3072) and run `sudo -u ubuntu PM2_HOME=/home/ubuntu/.pm2 pm2 restart fresh-web`.

## For Derek before shipping

- **Two "text us" numbers on one page.** `#prnm-cta` says "Call or text (909) 272-8096" next to this bubble's 855 line.
- **Visitors outside the US and Canada.** The bubble also renders on .co.uk and .com.au. The spec opens `sms:` on any phone, but texting a US toll-free number from the UK or Australia usually fails, and those visitors get no email fallback on a phone. Show them the desktop layout (number + email)?
- **The homepage "Text Derek" card** (`home-page-winter.tsx`) uses a different prefill, "Hi Derek! I’m looking at…", which the router's bubble detection does not match.
