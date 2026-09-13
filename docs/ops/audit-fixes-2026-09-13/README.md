# Audit remediation, 2026-09-13 — round 1

## The headline: a silent failure that explains the stuck drafts

`/wizard/api/sharetribe/upload-images` in `merlin/server/index.js` skipped every
failed photo with a bare `continue` — bad data URL, oversized buffer, non-image
content-type, or a Sharetribe rejection (`uploadBufferToSharetribe` returns
`null`) — and then answered:

```js
if (imageIds.length === 0) console.error("...WARNING: 0 of N...");
res.json({ ok: true, imageIds });      // 200 OK, empty array
```

A host whose photos all failed got **HTTP 200 `{ok:true}`**, the wizard believed
the photo step succeeded, and they moved on with a listing that had no pictures.
The only trace was a `console.error` nobody reads.

**Now:** zero-of-N returns HTTP 502 with a host-readable message and
`{requested, uploaded, failed}`; partial uploads still return 200 but carry the
same counts and log `PARTIAL`. Backup: `/root/merlin-backups/20260913T043119Z/`.

## The evidence that found it — and that corrected my own audit

I had reported address entry as the dominant onboarding blocker. **The draft data
says otherwise.** All 22 drafts, classified by last successful step:

| Last successful step | Count |
|---|---|
| **photos incomplete** (valid address + geolocation, **0 images**) | **13** |
| address incomplete | 8 |
| complete but never published | 1 |

13 drafts have `hasAddr=True, hasGeo=True, nImg=0`. They cleared the address step
and died at photos. Of the 8 "address incomplete", four are test records
(`T2 AUDIT TEST DRAFT A/B`, `T2 AUDIT POOL 2`, `bd-proof`), leaving ~4 real.

So the address defect is real but **second**; the silent photo failure is first.

One address case has a distinct cause worth separating: `Miradouro Pool Mafra`
(Portugal). The wizard's autocomplete is `componentRestrictions: {country: "us"}`,
so a non-US host cannot select their address at all.

## Full draft table

| listing | host | age | last step | addr | geo | imgs | stripe |
|---|---|---:|---|---|---|---:|---|
| 6886487e | 6886458e | 412 | photos incomplete | ✓ | ✓ | 0 | false |
| 69ee158d | 69ee12a0 | 139 | address incomplete | ✗ | ✗ | 0 | false |
| 69f8bad9 | 69f8ba9a | 131 | photos incomplete | ✓ | ✓ | 0 | **true** |
| 6a165dc9 | 6a165cd5 | 109 | photos incomplete | ✓ | ✓ | 0 | false |
| 6a207937 | 6a20783c | 101 | photos incomplete | ✓ | ✓ | 0 | false |
| 6a202075 | 6a201f5f | 101 | photos incomplete | ✓ | ✓ | 0 | false |
| 6a272d23 | 697510e2 | 96 | photos incomplete | ✓ | ✓ | 0 | false |
| 6a3333fc | 6a33334b | 87 | photos incomplete | ✓ | ✓ | 0 | false |
| 6a32f338 | 6a32f1d0 | 87 | photos incomplete | ✓ | ✓ | 0 | false |
| 6a527b30 | 6a508b34 | 63 | photos incomplete | ✓ | ✓ | 0 | false |
| 6a56984b | 6a56972b | 60 | photos incomplete | ✓ | ✓ | 0 | **true** |
| 6a57e9c7 | 6a57e9c6 | 59 | address incomplete (test: bd-proof) | ✗ | ✓ | 0 | false |
| 6a57c15b | 6a57c15b | 59 | photos incomplete (test: REPRO) | ✓ | ✓ | 0 | false |
| 6a5e51ca | 6a42d413 | 54 | photos incomplete | ✓ | ✓ | 0 | false |
| 6a6bd4ff | 6a6bd26b | 44 | address incomplete | ✗ | ✗ | 0 | **true** |
| 6a6b72cf | 6a6b636d | 44 | photos incomplete | ✓ | ✓ | 0 | false |
| 6a6b4b38 | 6a6b4549 | 44 | address incomplete (Portugal — US-only autocomplete) | ✗ | ✗ | 0 | false |
| 6a6f033b | 6a6d56af | 41 | address incomplete (test: T2 AUDIT) | ✗ | ✗ | 0 | false |
| 6a6f027e | 6a6d56b1 | 41 | address incomplete (test: T2 AUDIT B) | ✗ | ✗ | 0 | false |
| 6a6f0188 | 6a6d56b1 | 41 | address incomplete (test: T2 AUDIT A) | ✗ | ✗ | 0 | false |
| 6a8b013a | 6a8affdf | 20 | **complete, 8 photos, never published** | ✓ | ✓ | 8 | false |
| 6a8d44f4 | 6a821bb9 | 18 | address incomplete | ✗ | ✗ | 0 | false |

`6a8b013a` is the interesting one: complete and publishable, never pushed over
the line.

## Inquiry classification (item 7)

110 inquiries whose last transition is `transition/inquire`. Categorised by
listing state, provider payout status and message count. Realistically
recoverable (≤45 days old **and** listing still published): a small subset,
including `6a849b14` (25d, 2 messages), `6a7f3144` (29d — host has no payout
account), `6a7cfd42` (31d, 7 messages), `6a787a3d` (34d, **23 messages**).

A 23-message conversation that never became a booking is a product problem, not a
notification problem. **No messages were sent.** Raw data:
`/home/ubuntu/audit_inquiries.json`.

## Sitemap (item 11) — measured, not assumed

`/sitemap.xml`: **1.11 s, 1,602 bytes, HTTP 200.** It is not slow. The 35 `499`s
are not a latency problem at the index.

**New finding:** `/sitemap-country.xml` returns **HTTP 404** (61 KB marketplace
404 page). Per CLAUDE.md the ccTLD `robots.txt` points each country host at
`/sitemap-country.xml`. If that is the same path, every ccTLD robots directive
points at a dead sitemap. Not chased further this round — flagged, not fixed.

## Verified after deploy

```
/wizard/                                   200
/wizard/api/auth/me                        401
/wizard/api/sharetribe/upload-images       401 (unauth)
/wizard/api/analyze-photos                 400 "Attach at least one photo"
bundle                                     assets/index-4d5740d4.js (unchanged)
/  /s  /l/<listing>  /sitemap.xml          200 200 200 200
```
