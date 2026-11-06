# PRNM scripted assistant

A support assistant for the website chat widget, built as a **Chatwoot Agent Bot** for the self-hosted Chatwoot on EAST. It is scripted: no AI, no language model, no paid API, no SMS, no subscription. It runs as one Node process (Node 20 or later, **zero npm dependencies**) next to Chatwoot and costs nothing beyond the server PRNM already pays for.

It answers routine questions from 100 verified entries, asks one clarifying question when it isn't sure, and hands off to Derek and Brandon (both notified in the Chatwoot app) when it can't answer, when someone asks for a person, and right away on anything urgent. Every message it sends is written in `bank/` or `engine/copy.js`; it never makes up an answer.

> **Status:** code and tests only. Nothing is deployed, no server or DNS was changed, no Chatwoot account exists yet. "Going live" below lists the steps, each of which needs Derek's GO.

## Checked on EAST (read-only, 2026-11-06 02:53 UTC)

| | |
|---|---|
| Chatwoot | 4.16.2 (`GET /api` → `queue_services: ok`, `data_services: ok`), 4 containers up 43 h, bound to 127.0.0.1:3009. Database is empty (0 accounts, users, inboxes, bots, conversations). |
| Chatwoot memory | about 1.0 GB: rails 435 MiB, sidekiq 468 MiB, postgres 83 MiB, redis 14 MiB |
| Box | t3.medium, 2 vCPU, load 0.15. RAM 3831 MB, **2126 MB available**. Swap 2047 MB, unused. Disk `/` 19 GB, **4.7 GB free** (75% used). |
| Node | v20.20.2 for `ubuntu` (pm2 already runs `fresh-web`, 235 MB) |
| Ports | 3021 (this bot's default) and 3120 are free |
| This bot | about 57 MB RSS on Node 20 at idle; a match takes a few milliseconds. It fits easily. |
| Still open | The Chatwoot onboarding page still returns 200 on 127.0.0.1. Close it with the setup runner before Chatwoot is ever reachable from outside (see the integration spec). |

## Files

| Path | What it is |
|---|---|
| `bank/entries.json` | **The 100 answers.** The single source of truth. Edit this. |
| `bank/routes.json` | Where buttons and follow-ups lead, starter buttons, and the few no-fact handoff replies (deposits, refunds, service animals, ...). |
| `bank/drafts/` | Drafted additions from recurring unmatched questions. Never live. |
| `server.js` | Webhook receiver on `127.0.0.1:${PORT:-3021}`. Checks Chatwoot's HMAC signature, answers 200 at once, then works. `GET /healthz`. |
| `engine/normalize.js`, `lexicon.js`, `fuzzy.js` | Text clean-up, phrases, slang, synonyms, stemming, typo tolerance (token-level Damerau-Levenshtein with length-aware limits). |
| `engine/matcher.js` | Scores a message against every question, variant and keyword. |
| `engine/safety.js` | Card numbers (Luhn), passwords, urgent topics, "talk to a person", near-miss guards, booking refs, emails, mood. |
| `engine/flows.js` | The conversation engine (greeting, answers, clarify, follow-ups, handoff, memory). Pure: no I/O. |
| `engine/copy.js` | Every line that isn't a bank answer. |
| `engine/chatwoot.js`, `handoff.js`, `bot.js` | Chatwoot API client, the handoff call sequence, and the webhook→engine→API executor. |
| `engine/memory.js`, `tracking.js` | Per-conversation memory (JSON file, mode 600, mirrored to Chatwoot custom attributes) and the append-only event log. |
| `tools/` | `validate-bank.js`, `metrics.js`, `draft-additions.js`, `chat-cli.js` (try it in a terminal), `notify-test.js` (test both founders' notifications). |
| `test/` | `node:test` suites, including an end-to-end run against a mock Chatwoot server. |

## How a conversation goes

1. **Greeting.** "Hey, glad you're here. Quick heads-up: I'm an automated assistant, not a person. What can I help you with?" with buttons **Booking a swim**, **Hosting a pool**, **Talk to the founder**. Typing works too. If the first message is already a question, the label line goes first and the answer follows. (Chatwoot also shows the bot's name, "PRNM Assistant (automated)".)
2. **Answer.** A confident match gets the bank answer plus its link, made absolute (`https://www.poolrentalnearme.com/s`), because the widget runs on the chat domain.
3. **Clarify once.** Close calls get one question with the likely options and **Something else**. Where a guest entry and a host entry share the same words ("instant book", "promo code"), it asks "Are you booking a swim or hosting?" once and remembers the answer.
4. **Two misses → handoff.** The first unmatched question gets "Can you say it another way? Or want to talk to the founder?". The second hands off with both questions in the note.
5. **"Talk to the founder" / "human" / "agent" / "a real person"** → handoff at once, no answer attempted.
6. **Urgent** (injury, danger, harassment, unsafe pool, locked out on arrival, host no-show, damage, insurance/liability/coverage/claims, scams, billing disputes, guests who won't leave) → the reply goes out first (injury and danger lead with **"If anyone is hurt or in danger, call 911 first."**), then the handoff runs in the same turn with urgency high, label `urgent` and Chatwoot priority `urgent`. No facts about coverage, refunds or claims are given (CLAUDE.md rule 8).
7. **Handoff asks only for what's missing**, one question at a time: the question (if they haven't said it), the booking reference (only when it's relevant and not already given), and reply method (**Here in chat** or **By email**; an address only if they pick email). Urgent handoffs don't wait for any of this.
8. **Handoff in Chatwoot**, in this order, every call must succeed:
   1. `POST …/custom_attributes`: role, topic, booking ref, reply method, urgency, reason, entry ids
   2. `GET` + `POST …/labels`: existing plus `handoff`, `urgent`, `topic-<category>`, `role-<role>`
   3. one private note `@mentioning` Derek and Brandon: question, what the bot tried, urgency, booking ref, reply method, conversation link, and "assign it to yourself before replying". The first line (the push text) carries no customer words.
   4. `POST …/toggle_priority` `urgent` (urgent only)
   5. `POST …/toggle_status` `open` with the bot token (Chatwoot's bot handoff)

   Only then: "Cool. I've sent Derek and Brandon the rundown so you don't have to explain everything again. They'll reply right here in this chat." If any call fails, the conversation stays pending, the customer is told honestly and offered support@poolrentalnearme.com, `escalation_failed` is logged, and the next message retries (the note is never posted twice). It never promises how fast they'll reply.
9. **After a handoff the bot is silent.** It also stands down the moment a person replies in Chatwoot (and opens the conversation if it was still pending). An agent can hand a conversation back by setting it to pending.
10. **Card numbers** (13–19 digits passing Luhn) and passwords: the customer gets a short warning, the digits are never repeated or logged, and a private note asks the founders to delete that message (the bot token can't delete messages). The rest of the message is still answered.
11. **Tone.** Short, warm, contractions. For upset customers and urgent topics the playful openers ("Okay, cool", "Nice.") are dropped.

Memory per conversation: role, topic, booking ref, reply method/email, attempt count, entries answered. Kept in `data/state.json` and mirrored to Chatwoot custom attributes (`prnm_*`), so a lost file is rebuilt from the next webhook.

## Editing the bank

`bank/entries.json` is pretty-printed JSON, one object per entry:

| Field | Rule |
|---|---|
| `id` | kebab-case, unique, don't rename (the log and Chatwoot attributes use it) |
| `category` | one of the 10 categories; keep **10 entries per category** |
| `question` | the customer's wording; shown as a button title when clarifying |
| `variants` | other ways people ask, typos and slang welcome; no rewordings of another entry |
| `keywords` | short words or phrases that mark the topic |
| `mode` | `auto` (answer), `clarify` (one question with `clarify_options`, wired in `routes.json`), or `handoff` (no facts, bring in Derek and Brandon) |
| `answer` | short, in the house voice, **every fact verified**; insurance, liability, coverage, claims, damage, injury and dispute topics must stay `handoff` |
| `link` | relative path (`/s`, `/inbox/orders`) or empty; expanded to the www domain when sent |
| `urgency` | `normal` or `high` (high = immediate handoff) |
| `sources` | `{ref, quote}` for every fact; `auto` entries need at least one |
| `gap` | notes for Derek; never shown to customers |

After any edit:

```bash
cd ops/chatbot
npm run validate   # schema, 10 per category, forbidden phrases, 911 lines, rule-8 topics, every phrasing matches its own entry
npm test           # full suite
```

`validate` fails on anything that would mislead: invented coverage, "24/7", host commission, refund tiers, payout speed, "text us", any name other than Derek or Brandon. It also fails if a question or variant you added now lands on a different entry. Restart the bot afterwards (`pm2 restart prnm-bot`); it reads the bank at start.

To tune matching without touching answers: synonyms, slang and phrases are in `engine/lexicon.js`; thresholds are in `engine/matcher.js` (`THRESHOLDS`); safety and near-miss patterns are in `engine/safety.js` (`RULES`).

## Tests

```bash
cd ops/chatbot && npm test        # = node --test test/*.test.js   (75 tests, ~3 s, Node 20 and 22)
```

They cover: all 905 questions and variants hitting their own entry; 46 invented typo/slang phrasings across all 10 categories; everyday rewordings (right answer or a clarifying question, never a wrong one); near-misses that must clarify or hand off; role memory; the booking ref never being asked twice; founder requests; urgent escalation with the 911 line first; two-strike handoff; card numbers and passwords; an international customer (no SMS or phone mentioned anywhere); upset tone; and an end-to-end run through the real HTTP server against a mock Chatwoot that checks the exact API calls, that the note mentions both agents, that "I've sent" only appears after every call succeeded, the failure fallbacks, signature checks, retries, and human takeover.

Try it in a terminal, no Chatwoot needed:

```bash
node tools/chat-cli.js                         # interactive; type a number to tap a button
node tools/chat-cli.js "hi" "1" "is the pool heated"
node tools/chat-cli.js --fail-handoff "talk to the founder" "my payout" "1" "1"
```

## Metrics and drafts

Each event is one JSON line in `data/events.jsonl` (rotated at 50 MB): `answered` (entry id, score, how), `clarify`, `unmatched` (redacted text), `handoff`, `escalated`, `escalation_failed` (step), `card_warning`, `human_takeover`, and so on. Card numbers, passwords, emails, phone numbers and booking ids are redacted before writing; tokens and secrets are never logged.

```bash
npm run metrics                       # answered by entry, answer rate, unmatched, handoffs, failed escalations
node tools/metrics.js --since 2026-11-01 --json
npm run drafts                        # group recurring unmatched questions into bank/drafts/*.json
node tools/draft-additions.js --dry-run --min 3 --min-conversations 2
```

A draft needs at least 3 occurrences across 2 or more conversations. It has an empty answer and no sources, so it can't be published by accident; Derek approves the wording, someone adds a source, and only then does it go into `entries.json`.

## Configuration

All values live in a mode-600 env file outside the repo (`.env.example` lists the names). Nothing secret is ever printed; `/healthz` shows only `{ok, entries}`.

| Variable | |
|---|---|
| `CHATWOOT_URL` | `http://127.0.0.1:3009` (rails directly) |
| `CHATWOOT_BOT_TOKEN` | agent bot access token (sent as `api_access_token`; 4.16.2 doesn't take `Bearer`) |
| `CHATWOOT_WEBHOOK_SECRET` | agent bot secret; required (requests are rejected without a valid `X-Chatwoot-Signature`) |
| `CHATWOOT_ACCOUNT_ID`, `CHATWOOT_INBOX_ID` | only this account and website inbox are handled |
| `CHATWOOT_DEREK_USER_ID`, `CHATWOOT_BRANDON_USER_ID` | Chatwoot user ids for the @mentions |
| `CHATWOOT_PUBLIC_URL` | `https://chat.poolrentalnearme.com` (conversation link in the note) |
| `CHATWOOT_FORWARDED_PROTO` | `https` (default) so `FORCE_SSL=true` doesn't redirect local calls |
| `SITE_URL` | `https://www.poolrentalnearme.com` |
| `PORT`, `HOST` | `3021`, `127.0.0.1`. The nginx location must point at the same port. |
| `BOT_DATA_DIR` | where `state.json` and `events.jsonl` go (mode 600, gitignored) |
| `BOT_ALLOW_UNSIGNED_LOOPBACK` | `true` only for local testing without a secret |

## Going live (not done; each step needs Derek's GO)

Follows the Chatwoot integration spec for 4.16.2. In short:

1. **Chatwoot setup runner, while it's still private:** account; Derek (super admin) and Brandon as administrators and inbox members, created without anyone handling a password (reset links later, handed over privately); onboarding page closed; signup off. Notification flags for **both**: push `conversation_mention`, `conversation_creation`, `conversation_assignment`, `assigned_conversation_new_message`, `participating_conversation_new_message`; email flags none (no SMTP). Website inbox with auto-assignment **off** (so either founder can claim), email collect off, continuity via email off, attachments off. Agent bot "PRNM Assistant (automated)" with `outgoing_url` `https://chat.poolrentalnearme.com/prnm-bot/webhook`, attached to the inbox; its token and secret go straight into the bot's mode-600 env file. Create the labels (`handoff`, `urgent`, `topic-booking`, `topic-payments`, `topic-cancellations`, `topic-rules`, `topic-arrival`, `topic-safety`, `topic-host-listing`, `topic-host-pricing`, `topic-payouts`, `topic-account`, `role-host`, `role-swimmer`) and the `prnm_*` conversation custom attributes so they display.
2. **Run the bot under pm2 as ubuntu** (never as root):
   ```bash
   sudo -u ubuntu PM2_HOME=/home/ubuntu/.pm2 pm2 start /home/ubuntu/prnm-bot/server.js --name prnm-bot \
     --node-args="--env-file=/home/ubuntu/prnm-bot/.env" && sudo -u ubuntu PM2_HOME=/home/ubuntu/.pm2 pm2 save
   curl -s http://127.0.0.1:3021/healthz
   ```
3. **nginx (EAST chat vhost):** `location /prnm-bot/ { limit_except POST { deny all; } client_max_body_size 1m; proxy_pass http://127.0.0.1:3021/; }`. Signature checking is what keeps it private, so never set `BOT_ALLOW_UNSIGNED_LOOPBACK` in production.
4. **Test both recipients** before any customer sees it:
   - each founder installs the free Chatwoot app, connects `chat.poolrentalnearme.com`, logs in, allows notifications;
   - Super Admin → push diagnostics for each user (or `Notification::PushTestService` in the runner);
   - `node --env-file=… tools/notify-test.js --conversation <test id> --send` posts one private note mentioning both; each confirms it arrived;
   - end to end: open the widget in a private window, type "talk to the founder", finish the questions, confirm **both** phones get the mention, and that either can assign himself.
5. **Embed the widget** on the site (separate change).

The bot creates no scheduled jobs. Anything scheduled (for example Chatwoot backups) is separate and must be disclosed when it is created.

## Zero cost: what stays off

Captain AI and the OpenAI key (empty), Firebase keys (the free Chatwoot push relay is used), SMS/WhatsApp/Twilio inboxes, paid SMTP, Enterprise billing links, S3/GCS storage, trials of anything, new or bigger instances. The bot itself calls nothing outside the box: only Chatwoot on 127.0.0.1.

## Waiting on Derek (the bot hands these off until he decides)

Refund rules and timing (the Cancellation and Refund Policy the ToS cites isn't published) · whether refundable deposits come back · weather and host no-shows · waivers (ToS §8.1 vs no signing step) · whether guests see a host's exact address · service animals · which support phone number, if any · payout timing · host eligibility for apartment, HOA or pool-less spaces · what happens to bookings when a listing is closed. Each `gap` field in `entries.json` has the detail.
