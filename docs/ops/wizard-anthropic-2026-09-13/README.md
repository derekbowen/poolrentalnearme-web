# /wizard/ photo analysis: OpenRouter-in-the-browser → server-side Anthropic

2026-09-13. A live, uncapped OpenRouter API key was compiled into the public
wizard bundle. It is no longer served anywhere. Photo analysis now runs
server-side against the Anthropic API.

## What production was doing

```
browser (/wizard/assets/index-EHnDwOcW.js, public)
  └─ fetch https://openrouter.ai/api/v1/chat/completions
       Authorization: Bearer sk-or-v1-…9b2     ← readable by any visitor
       model: anthropic/claude-sonnet-4-6
```

The key was **live and working** — verified with a 1-token request: HTTP 200,
`$0.000039`, routed to `anthropic/claude-sonnet-4.6` via Claude Platform on AWS,
`limit: null` (no spend cap), `$20.07` used. So this was not a broken feature.
It was a working feature that let anyone spend from the account.

## Root cause of the drift

There are **two** AI paths in PRNM and only one was migrated:

| Path | Where | Provider | Migrated? |
|---|---|---|---|
| Listing generation from photos | marketplace `server/api/ai-generate-listing.js` | Anthropic SDK, `ANTHROPIC_API_KEY` server-side | **Yes** (c139-c148, early Aug) |
| Wizard photo analysis | merlin `dist/assets/index-*.js` | OpenRouter, key in client JS | **No** |

So "we switched that to Claude API" was true — of the marketplace endpoint. The
wizard was never repointed. All **six** wizard builds on the box
(`dist` + 5 `dist.bak*`) call OpenRouter; none mention `api.anthropic.com`. There
was no newer build waiting to be promoted.

A second, separate OpenRouter failure had already been fixed the same way and
documented in the code: the *import* path moved to Firecrawl after OpenRouter
"billed the model's full default output ceiling … and started returning HTTP 402 —
43 failed imports across 13 hosts." The photo path was left behind.

## The architecture now

```
browser  ──POST /wizard/api/analyze-photos──▶  merlin (container, host-only :3099)
                                                 └─ ANTHROPIC_API_KEY from merlin.env
                                                      └─▶ api.anthropic.com  (claude-opus-5)
```

`server/anthropic-photos.js` (mirrored in this directory) deliberately returns the
**OpenAI/OpenRouter envelope** `{choices:[{message:{content}}]}`, because the
wizard bundle already parses that shape. That kept the client change to a URL swap
and a removed header instead of a rewrite of minified React.

Guards, because this endpoint spends money per call: max 5 images, 5 MB each,
20 MB total, allow-listed media types, and 40 analyses/hour/IP
(`WIZARD_ANALYZE_RPH`). Upstream error bodies are logged server-side and never
echoed to the browser.

**Model: `claude-opus-5`** (`ANTHROPIC_WIZARD_MODEL`). Confirmed against the
current Anthropic model list, not inferred from the OpenRouter slug — the slug
`anthropic/claude-sonnet-4-6` maps to `claude-sonnet-4-6`, which is real but
previous-generation. Note the marketplace endpoint still defaults to
`claude-opus-4-8` via `ANTHROPIC_LISTING_MODEL`; the two are not aligned yet.

## Client patch — and why it is a patched bundle, not a rebuild

**The wizard's client source does not exist.** `/home/ubuntu/merlin` is a git repo
with 20 tracked files, no remote, no `src/`; neither Lovable workspace has it.
Only built output. Four exact-match substitutions, each verified to occur exactly
once before editing:

| Before | After |
|---|---|
| `const u="sk-or-v1-…b2",m=…` | `const u="",m=…` |
| `"https://openrouter.ai/api/v1/chat/completions"` | `"/wizard/api/analyze-photos"` |
| `headers:{Authorization:`Bearer ${u}`,…,"X-Title":"PRNM Listing Wizard"}` | `headers:{"Content-Type":"application/json"}` |
| `OpenRouter API error:` | `Photo analysis error:` |

This is a **patched artifact, not a source build.** Recovering the wizard source
is still required — the address-autocomplete fix
(`docs/ops/host-address-bug-2026-09-12.md`) cannot be done this way.

`index-EHnDwOcW.js` → `index-4d5740d4.js` (new name so the year-long `immutable`
cache cannot keep serving the old one), `dist/index.html` repointed, old file
moved out of `dist/`.

### The secondary exposure

Four `.bak` copies of the bundle were sitting **inside `dist/`**, which
`express.static` serves. `/wizard/assets/index-EHnDwOcW.js.bak-v3-20260806-052250`
and three siblings were publicly downloadable and each contained the key. All
four are quarantined to `/root/merlin-backups/quarantine-withkey/`.

## Deployment notes discovered the hard way

- merlin runs in a **container** (`node:20-alpine`, bind-mount
  `/home/ubuntu/merlin:/app`, host-only `127.0.0.1:3099`), not on the host.
  `node`/`npm` exist only inside it.
- **`docker restart` does not re-read `--env-file`.** The running container had no
  `ANTHROPIC_API_KEY` and a restart would not have added it — the same class of
  trap as the pm2 env issue in CLAUDE.md. The container must be **recreated**.
- Nothing on the box recorded how merlin was launched. `run-merlin.sh` now does,
  and says why a restart is not enough.
- `server/index.js` reads `dist/index.html` **once at startup**, so an index.html
  change needs the recreate too.

## Verification (from the public internet)

```
/wizard/ references        -> /wizard/assets/index-4d5740d4.js   (was index-EHnDwOcW.js)
live bundle, 390,886 bytes:
  sk-or-v1-           0        openrouter.ai       0
  sk-ant-             0        api.anthropic.com   0        AIzaSy  0
  /wizard/api/analyze-photos   present
old URLs:  index-EHnDwOcW.js 404 · three .bak copies 404
```

End-to-end through `https://www.poolrentalnearme.com`, real pool photo:

```
HTTP 200 · model claude-opus-5 · photosUsed 1 · in=1180 out=103
content: {"poolType":"inground","features":["saltwater","heated","hot tub", …],"guessedCapacity":15}
client-side JSON extraction: SUCCEEDS
```

## Revocation

The exposed key `sk-or-v1-…9b2` is no longer served by anything. **Safe to revoke
now** at openrouter.ai/settings/keys. Nothing in PRNM reads it any more — no
remaining `openrouter.ai` reference exists in `dist/`, and the only host-side
mentions are historical `.bak` files and `build/LAUNCH.md`.

## Rollback

```sh
cp -a /root/merlin-backups/20260913T015243Z/index.js   /home/ubuntu/merlin/server/index.js
cp -a /root/merlin-backups/20260913T015243Z/dist       /home/ubuntu/merlin/
cp -a /root/merlin-backups/20260913T015243Z/merlin.env /home/ubuntu/merlin/merlin.env
sh /home/ubuntu/merlin/run-merlin.sh
```
That restores the OpenRouter implementation **and the exposed key**, so only do it
to recover from a functional break, and revoke the key first.

## Latent bug found, deliberately not changed

`app.get("/wizard/{*path}", …)` is Express **5** syntax on Express **4.22.2**, so
the SPA fallback has never worked — `/wizard/anything` returns 404. No user impact
today: the bundle has zero `pushState`, zero router, zero hash routing, so the
wizard is a single-URL app with no deep links to fall back from. Classified MINOR
and left alone rather than changing route semantics on a service just cut over.
