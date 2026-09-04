# Where is the production `fresh-web` source?

**Result: it is in no GitHub branch of either repository.** Established
2026-09-04 without touching EAST.

---

## Method 1 — production-only strings (decisive)

Four section headings are rendered on the live homepage. If a branch were the
production source, it would contain them. Checked with `git grep` against every
branch of `fresh-web-702e04c3`, plus `fresh-web`:

| Live heading | `main` | `claude/jobposting-schema-fix` | `flywheel/host-money-sheet` | `fresh-web` (May) |
|---|---|---|---|---|
| Love notes | no | no | no | no |
| Swim with us everywhere | no | no | no | no |
| Stuck on anything? Text Derek | no | no | no | no |
| Already renting your pool on Swimply | no | no | no | no |
| Host smarter, host legally | yes | yes | yes | no |
| Got a pool? Turn it into income | yes | yes | yes | yes |
| Browse by pool type | yes | yes | yes | yes |

Every candidate is a **proper ancestor**: it has the older sections and none of
the four newer ones. No branch is production.

Two of the missing four — "Swim with us everywhere" and "Stuck on anything? Text
Derek" — do exist in the **marketplace** repo
(`src/containers/LandingPage/SectionLoveFooter.js`). So the live `fresh-web`
homepage has absorbed sections that previously lived in the marketplace landing
page. That work exists only on EAST.

## Method 2 — Vite content hashes (corroborating)

| Source | Emitted entry assets |
|---|---|
| **production** | `index-Dbzl3FRr.js`, `index-DqTt9-Fr.js`, `styles-Bkw4jYX1.css` |
| `main` (2026-07-16) | `index-AHOoIUD0.js`, `index-BZOxiT2B.js`, … (6 chunks) |
| `claude/jobposting-schema-fix` (2026-07-26) | `index-B-7kqBHQ.js`, … , `styles-DEQSGMC2.css` (6 chunks) |

No hash matches. Note the structural difference too: production emits **two**
`index-*.js` entry chunks where both builds emit six, which is a chunking
difference rather than a content nudge.

**Caveat, stated so this is not over-read:** a Vite content hash covers bundled
dependency code as well as source, and these builds resolved dependencies freshly
(`package-lock.json` was stale — it pinned `@lovable.dev/vite-tanstack-config`
1.5.0 against a `package.json` pin of 2.7.6). So a hash **match** would be strong
proof; a **non-match** on its own is only suggestive. Method 1 is what settles it,
and it settles it independently of any build.

`flywheel/host-money-sheet` (2026-06-20) was not built: it is strictly older than
`main`, which is already eliminated, and it shows the identical string profile.

## Method 3 — deployment artefacts

Nothing identifies the deployed commit: no `/version`, `/health`, `/api/version`
or `/__version` endpoint (all 404), no commit hash or build id in the served
HTML, and no build manifest exposed.

---

## Recommendation

**Obtain the authoritative tree from EAST.** Methods 1–3 are exhausted, and the
cheap options are genuinely gone rather than untried.

Do not reconstruct from bundle output. The live bundle is minified and
tree-shaken; recovering JSX from it would produce plausible-looking code that
silently differs, which is a worse starting point than the honest gap.

Two things worth capturing in the same pass, because both are unversioned files
that only exist on the box:

- `/tools/cta.js` — vendored here at `ops/east/tools/cta.js`, but the live copy
  still carries the insurance claim (see `INSURANCE_CLAIM_INVENTORY.md`).
- `/tools/home.js` — the post-hydration DOM patcher.

Once the tree is in hand, the same string test above verifies it in seconds
before anyone builds on it.

---

## What is no longer blocking

The private-registry problem was **not real**. `package-lock.json` resolves every
`@lovable.dev/*` package from `registry.npmjs.org`; only `bun.lockb` points at
`europe-west1-npm.pkg.dev`. `npm install` fetched all 858 packages with no
credentials, and `npm run build` completed. Nothing was replaced or removed.

So the moment the authoritative source arrives, it builds.
