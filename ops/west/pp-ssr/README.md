# pp-ssr: put the public-pools renderer under version control

`/public-pools/*` and `/public-pools.xml` are rendered by the `pp-ssr` container on WEST
(nginx proxies them to :3100). Its source is in no repository. The SEO audit of
2026-11-14 (fix F8) found rendering defects there: a raw JSON array printed as
"Best for: [...]" on 1,679 of 2,000 indexed pool pages. The owner's rule:
"Put pp-ssr source under version control before modifying it."

`preserve_pp_ssr.py` does that capture. It is read-only on WEST apart from two
temporary files that it removes:
- the decrypted copy, deleted on the box at once;
- the ciphertext, served from `/var/www/prnm-tools/`.

The capture follows the pattern of `ops/preserve_east.py`.

| Command | What it does |
|---|---|
| `python3 ops/west/pp-ssr/preserve_pp_ssr.py` | prints the plan; touches nothing |
| `python3 ops/west/pp-ssr/preserve_pp_ssr.py --selftest` | tests the secret scanner (25 cases) |
| `python3 ops/west/pp-ssr/preserve_pp_ssr.py --go` | runs the capture; needs `PRNM_AWS_*` for SSM |

Safety:
- Container env values are never printed. Only the variable names are recorded.
- `node_modules`, `.git`, `.env*` and key files are never copied.
- This repository is public, so the tree is scanned for secrets before any push, and
  the exact tree to be committed (`PP_SSR_SNAPSHOT.md` with the container's command
  line included) is scanned again just before the commit.
- A file larger than 50 MB, or one that cannot be read, is not skipped: it counts as
  a finding and the push is refused.
  - A JWT whose role is `anon` (a publishable key) is allowed.
  - Anything else aborts the push: AWS keys, Stripe live keys, webhook secrets, private keys, GitHub tokens, service-role JWTs, or literal secret assignments.
- Each hop is checked by sha256: the plain tar on WEST, the ciphertext, and the decrypted tar here.
- The file count on the box must match the count extracted here.
- The result goes to an orphan branch, `ops/pp-ssr-snapshot-<date>`. No existing branch is changed.

Not yet run: this session has no WEST credentials. After the capture, the F8
rendering fix (print `ai_best_for` as a list, not as JSON) can be made in that
tree and deployed the way pp-ssr is deployed today. The data-side clean-up is
prepared separately on the fresh-web branch `seo/05b-public-pools-data`.
