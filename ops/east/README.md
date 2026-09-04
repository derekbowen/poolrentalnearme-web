# EAST on-box files, under version control

These files are served by EAST but exist in **no git repository** — they were
edited directly on the box. That is the same unversioned-working-copy pattern
that let production drift from git elsewhere, so they are vendored here.

| File | Served at | Captured |
|---|---|---|
| `tools/cta.js` | `https://www.poolrentalnearme.com/tools/cta.js` | 2026-09-04, verbatim, then edited |

**`tools/cta.js` here is NOT what production serves yet.** The copy in this repo
has the unverified insurance clause removed from its Organization JSON-LD; the
live copy still carries it. Installing it on EAST is a separate, deliberate step
that has not been taken. Until then, `docs/INSURANCE_CLAIM_INVENTORY.md` row 1
remains live.

`tools/home.js` is deliberately **not** vendored yet: it is a post-hydration DOM
patcher that rewrites a course count and an `h1`, and capturing it invites
treating it as permanent. It should be deleted once the deployed bundle is
correct, not maintained.
