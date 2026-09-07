# On-box marketing files, under version control

These files are served under `www.poolrentalnearme.com/tools/` but exist in **no
git repository** — they were edited directly on the box. That is the same
unversioned-working-copy pattern that let production drift from git elsewhere, so
they are vendored here.

**Correction (2026-09-07): `/tools/*` is served by WEST, not EAST.** nginx on WEST
has `location ^~ /tools/ { alias /var/www/prnm-tools/; }` and injects
`<script async src="/tools/cta.js">` into `/p/*`, `/l/*`, `/u/<uuid>` and `/`
responses with `sub_filter`. EAST's own server answers 404 for `/tools/cta.js`.
Deploying a change here means copying the file to `/var/www/prnm-tools/` on WEST
(root, mode 644); no restart is involved.

| File | Served from | Captured | Installed |
|---|---|---|---|
| `tools/cta.js` | WEST `/var/www/prnm-tools/cta.js` | 2026-09-04, verbatim, then edited | **2026-09-07 07:00 UTC**, sha256 `02366c84…8037`; previous file kept as `cta.js.bak-20260907T070047Z` |

`tools/cta.js` here **is** what production serves as of 2026-09-07. The install was
verified three ways: the public file hashes to the repo file, `node --check` passes,
and executing the public file inside a DOM copy of `/p/hosting` produces an
Organization JSON-LD block whose description no longer names a carrier or an
amount ("Hartford" appears nowhere in the rendered document). This closes
`docs/INSURANCE_CLAIM_INVENTORY.md` row 1.

`tools/home.js` is deliberately **not** vendored yet: it is a post-hydration DOM
patcher that rewrites a course count and an `h1`, and capturing it invites
treating it as permanent. It should be deleted once the deployed bundle is
correct, not maintained.
