# PRNM scripted assistant

The support assistant behind the website chat. It is a **Chatwoot Agent Bot** for the self-hosted Chatwoot on EAST. It is scripted: no AI, no language model, no paid API, no SMS and no subscription. It runs as one Node process (Node 20 or later, **no npm dependencies**) on 127.0.0.1:3120 next to Chatwoot.

It answers routine questions from 100 verified entries and asks one clarifying question when it isn't sure. It hands off to Derek and Brandon, who are both notified in the Chatwoot app, when it can't answer or someone asks for a person. Anything urgent is handed off at once. Every line it sends is written in `bank/` or `engine/copy.js`, so it never makes up an answer.

> **Status (2026-11-13):** code and tests only. Nothing is deployed and no server or DNS has changed. Chatwoot on EAST is still the private, empty 4.16.2 install. The last review said **fix first**: see "Known gaps" below and "Open before going public" in `ops/README.md`.

## Files

| Path | What it is |
|---|---|
| `bank/entries.json` | **The 100 answers.** This is the single source of truth. Edit this. |
| `bank/routes.json` | Starter buttons, where buttons and follow-ups lead, and the `builtin` replies, which hand off without stating any fact (refunds, deposits, complaints, emergency questions, …). |
| `bank/sources/` | Derek-approved wording that entries cite as sources. |
| `bank/drafts/` | Drafted additions from recurring unmatched questions. **Never live**: the bot never reads this folder, and the deploy does not ship it. |
| `server.js` | Webhook receiver. Checks Chatwoot's HMAC, answers 200 at once, then does the work. Also serves `GET /healthz` and runs the 60 s deferred-handoff sweep. |
| `engine/normalize.js`, `lexicon.js`, `fuzzy.js`, `matcher.js` | Text clean-up, slang, synonyms, typo tolerance, and scoring against every question, variant and keyword. |
| `engine/safety.js` | Guard rules (urgent topics, "talk to a person", near-misses), card numbers (Luhn), CVVs, passwords, booking refs, emails, and the input caps. |
| `engine/flows.js`, `copy.js` | The conversation engine (pure, no I/O) and every line that isn't a bank answer. |
| `engine/chatwoot.js`, `handoff.js`, `bot.js`, `flood.js` | The Chatwoot API client, the handoff call sequence, the webhook→engine→API executor, and the D3 flood caps. |
| `engine/memory.js`, `tracking.js`, `logsample.js` | Conversation memory (`data/state.json`), the event log (`data/events.jsonl`), and log sampling for rejected webhooks. |
| `tools/` | `validate-bank.js`, `metrics.js`, `draft-additions.js`, `chat-cli.js` (try it in a terminal), and `notify-test.js` (posts one @mention note into a test conversation). |
| `test/` | `node:test` suites, including end-to-end runs against a mock Chatwoot. |
| `ops/` | Everything that touches EAST. See `ops/README.md`. |

## How a conversation goes

1. **Greeting.** "Hey, glad you're here. Quick heads-up: I'm an automated assistant, not a person. What can I help you with?" It comes with buttons **Booking a swim**, **Hosting a pool** and **Talk to the founder**. Typing works too. In Chatwoot the bot is named "PRNM Assistant (automated)".
   - If the first message is already a question, the label line goes first and the answer follows.
   - An upset customer gets only "Quick heads-up: I'm an automated assistant, not a person.", with no cheerful greeting.
   - A bare "help", "HELP!!!" or "pls help" gets the safety question (step 6) instead of the greeting.
2. **Answer.** A confident match gets the bank answer plus its link, made absolute (`https://www.poolrentalnearme.com/s`).
   - Some entries are only offered when the message contains one of their own words.
   - Five host-only entries ask "Are you booking a swim or hosting?" first when the role isn't known.
3. **Clarify once.** A close call gets one question: "which one's closest?" with the options plus **Something else**, or a one-tap "is this what you mean?". The role question is asked at most once and remembered.
4. **Several questions in one message.** The first confident part is answered. Up to two other parts are offered as buttons under "You asked about this too:".
5. **Misses.** The first unmatched question gets "Hmm, I don't want to guess on that one. Can you say it another way?" with a **Talk to the founder** button. The second one hands off, with both questions in the note.
6. **Urgent** (rules in `engine/safety.js`): injury, drowning, violence, harassment and child safety, an unsafe pool, being locked out or the host not showing up on arrival, damage, insurance/liability/coverage/claims, scams, theft, billing disputes, guests breaking rules, and emergencies in Spanish, French, German or Portuguese.
   - The reply goes out first. Injury, danger, violence and harassment replies lead with **"If anyone is hurt or in danger, call 911 first."**
   - The handoff then runs in the same turn, with urgency high, label `urgent` and Chatwoot priority `urgent`, and asks no questions.
   - No facts about coverage, refunds or claims are given (CLAUDE.md rule 8). Rule-8 notes tell Brandon to leave the coverage answer to Derek.
   - "What do I do if someone is drowning" gets the 911 line and "I don't want to guess on emergency steps" (`builtin:emergency-question`). It never gets insurance wording.
   - A message that might be an emergency but that the bot can't place gets "If anyone is hurt or in danger, call 911 first. Is someone hurt or in danger right now?" with Yes/No buttons. Yes is an urgent handoff.
   - An urgent bank entry that was reached only by question matching is confirmed with one tap before anyone is paged.
7. **Asking for a person** ("talk to the founder", human, agent, real person, live agent, supervisor, …) hands off at once with no answer attempted. "What's it about?" is asked only when they haven't said yet.
8. **Calm handoffs** (no 911 line): complaints (BBB, bad review), accusations ("you guys are scammers"), legal threats (these keep the rule-8 note), and the no-fact builtins.
9. **The handoff asks only for what's missing**, one question at a time: the question, the booking reference (only when relevant and not already given), and the reply method (**Here in chat** or **By email**, and the address only if they pick email). Reply options are chat or email only: no texting, no phone.
10. **Handoff in Chatwoot** (`engine/handoff.js`). Every call below must return 2xx:
    1. `POST …/custom_attributes`: the `prnm_*` facts
    2. `GET` + `POST …/labels`: the existing labels plus `handoff`, `urgent`, `topic-<category>`, `role-<role>`
    3. one private note @mentioning Derek and Brandon. Its first line (the push text) carries no customer words. It asks whoever replies to assign the chat to himself first.
    4. `POST …/toggle_priority` `urgent` (urgent topics only)
    5. `POST …/toggle_status` `open` with the bot token. This is Chatwoot's bot handoff.

    Only after all of them: "I've sent Derek and Brandon the rundown so you don't have to explain everything again." If any call fails, the conversation stays pending and the customer is told honestly, with support@poolrentalnearme.com offered. `escalation_failed` is logged and the next message retries. The note is never posted twice. The bot never promises how fast anyone will reply.
11. **While the handoff waits** (sent or capped, and no person has replied yet):
    - A booking ref or email they add is kept.
    - Card numbers and passwords get the warning and a "please delete" note.
    - Danger gets the 911 line (at most once every 10 minutes), plus an `urgent` label, urgent priority and a plain note with no @mention, then "I've marked this urgent for Derek and Brandon."
    - The first other message gets one line: "Got it. Derek and Brandon have this, and anything you add here goes to them."
    - After that, silence.
12. **A person takes over.** Once a founder replies publicly, the bot goes silent for that conversation (and opens it if it was still pending). Setting the conversation back to pending hands it back to the bot. Resolving it starts a fresh thread: the role is kept, but the booking ref, reply method and tried answers are forgotten. The flood ledger is kept.
13. **Other languages** get "Sorry, I can only read English here for now…" with the founder button. A second non-English message hands off with both messages.
14. **Tone.** Short, warm, contractions. For upset customers and urgent topics the playful openers ("Okay, cool", "Nice.", "Cool.") are dropped.

## Safeguards

- **Honest delivery.** "I've sent …" is said only by `handoffConfirmed()`, after every Chatwoot call of the handoff succeeded. "I've marked this urgent" is said only after the label, priority and note calls succeeded.
- **Flood caps (D3, `engine/flood.js`).** A founder alert is the @mention note plus the open toggle (both push). The caps are 1 per conversation per 24 h, 2 per contact per 24 h, and 10 for the whole inbox per rolling hour.
  - The slot is checked and taken in one synchronous step, so concurrent chats can't all slip under a cap.
  - The ledger lives in the store's meta, so it survives a resolve.
  - Beyond a cap: no @mention and no open toggle. The bot adds the label `handoff-capped` (conversation or contact cap) or `handoff-overflow` (hourly ceiling) and keeps the chat pending. A new thread gets a note without an @mention, and urgent topics still get urgent priority.
  - The customer hears only what is true. "I've already flagged this for Derek and Brandon…" is said only if this same open thread already alerted. Otherwise: "I've logged this for Derek and Brandon. It may take a bit longer than usual."
  - A handoff capped by the hourly ceiling or the per-contact cap is **deferred**. It is retried on the customer's next message, on every webhook, and by the 60 s sweep, and it goes out as a normal alert once a slot is free. Nothing is sent while a cap holds. The per-conversation cap is final for its 24 h.
  - Danger while waiting (step 11) adds no @mention, so it uses no slot.
- **Input cap (D4).** The executor hands the engine at most 1,564 characters. Only the first 1,500 are processed, redacted first. Every stored string (question, extras, button titles) is capped at 500. nginx caps widget request bodies at 16 KB.
- **Cards and passwords.** Card numbers (13–19 digits passing Luhn), CVVs and passwords get a short warning, and the digits are never repeated, logged, labelled or put in a note. A private note asks the founders to delete that message, because the bot token can't delete messages. Caveat: Chatwoot's new-conversation push shows the first 10 words of the customer's first message unredacted (see `ops/README.md`).
- **Visitor-controlled input is not trusted.**
  - A button tap counts only if the bot offered that value, and the title shown is the bot's own. A genuine older tap is still answered. One whose meaning depended on an older screen gets "Can you tell me in your own words?".
  - `prnm_*` custom attributes are re-checked when state is rebuilt, and `prnm_reply_method` / `prnm_reply_email` are ignored, so email replies only go to an address the customer typed.
  - Customer text in notes has `mention://` broken, so only the bot's own agents line can @mention anyone.
  - Chatwoot 4.19.1 lets a visitor preset labels on a new chat, so labels are not proof of an alert.
- **Webhooks.** The signature is an HMAC-SHA256 of `"<timestamp>.<body>"` with the bot secret, and the timestamp must be within ±300 s. Duplicate delivery ids are dropped and bodies over 1 MB get 413. Rejected requests are logged at most once a minute. The bot acks within milliseconds and never returns a 5xx itself (nginx turns a dead bot into 500 so Chatwoot retries).

## Labels and attributes

- **Labels the bot applies:** `handoff`, `urgent`, `handoff-capped`, `handoff-overflow`, `topic-<booking | payments | cancellations | rules | arrival | safety | host-listing | host-pricing | payouts | account>` and `role-host` / `role-swimmer`. `cw_setup.rb` also creates `bot-answered` and `unmatched`, which the engine does not apply today.
- **Custom attributes the bot writes:** `prnm_role`, `prnm_topic`, `prnm_booking_ref`, `prnm_reply_method`, `prnm_reply_email`, `prnm_urgency`, `prnm_handoff_reason`, `prnm_attempts` and `prnm_entry_ids`. The first five are defined in Chatwoot, so they show in the sidebar.

**Memory:** `data/state.json` (mode 600) holds at most 1,000 conversations for 30 days. Writes are coalesced (at most one every 2 s), written asynchronously to a temp file and renamed into place. The file is flushed synchronously on SIGTERM. Its `meta` holds the flood ledger and the `deferred` list (at most 200 entries). The facts above are mirrored into Chatwoot, so a lost file is rebuilt from the next webhook.

## Editing the bank

`bank/entries.json` is pretty-printed JSON, one object per entry:

| Field | Rule |
|---|---|
| `id` | kebab-case and unique. Don't rename one: the log and Chatwoot attributes use it. |
| `category` | one of the 10 categories. Keep **10 entries per category**. |
| `question` | the customer's wording. It is shown as a button title when clarifying. |
| `variants` | other ways people ask; typos and slang are welcome. No rewordings of another entry. |
| `keywords` | short words or phrases that mark the topic |
| `mode` | `auto` (answer), `clarify` (one question with `clarify_prompt` / `clarify_options`, wired in `routes.json`) or `handoff` (no facts; brings in Derek and Brandon) |
| `answer` | short, in the house voice, **every fact verified**. Insurance, liability, coverage, claims, damage, injury and dispute topics must stay `handoff`. |
| `link` | relative path (`/s`, `/inbox/orders`) or empty; expanded to the www domain when sent |
| `urgency` | `normal` or `high` (high = immediate handoff) |
| `sources` | `{ref, quote}` for every fact; `auto` entries need at least one |
| `gap` | notes for Derek; never shown to customers |

After any edit:

```bash
cd ops/chatbot
npm run validate   # schema, 10 per category, forbidden phrases, 911 lead lines, rule-8 topics, every phrasing matches its own entry
npm test
```

`validate` fails on anything in its forbidden list (`FORBIDDEN` in `engine/bank.js`): invented coverage, "24/7" or "within 24 hours", host commission, refund tiers, "text us", phone numbers, and "Stephen". It also fails if a question or variant you added now lands on a different entry. `npm test` also checks that the only people named are Derek and Brandon.

A bank change goes live only as a new release: commit, `pin_bot.py`, then `bot_deploy.py` (see `ops/README.md`). The bot reads the bank at start. Never edit the files on the box.

To tune matching without touching answers:
- synonyms, slang and phrases are in `engine/lexicon.js`;
- thresholds are in `engine/matcher.js` (`THRESHOLDS`);
- guard rules are in `engine/safety.js` (`RULES`).

**Drafts are never auto-published.** `npm run drafts` (`tools/draft-additions.js`) groups questions that went unmatched at least 3 times across 2 or more conversations, and writes one JSON draft per group. A draft has an empty answer and no sources, so it cannot pass `validate`. To use one: Derek approves the wording, someone adds a verified source, the entry goes into `entries.json` (replacing or merging one, so each category keeps 10), and then it ships as a normal release.

## Tests

```bash
cd ops/chatbot && npm test     # = node --test test/*.test.js: 157 tests, about 4 s, on Node 20 and 22
```

The suites:
- `bank`: validation and forbidden phrases.
- `matcher`: all 918 questions and variants hit their own entry; typos and slang; must-not-answer cases.
- `safety`: emergency and benign phrasings run through the full engine.
- `flows`: role memory, the booking ref never asked twice, founder requests, two-strike handoff, cards and passwords, upset tone, no SMS or phone anywhere, and stale or forged taps.
- `flood`: the D3 caps, 30 concurrent escalations, deferral and the sweep.
- `memory`: store cap, write coalescing, mode 600.
- `e2e`: the real HTTP server against a mock Chatwoot. It checks the exact API calls, that the note mentions both founders, that "I've sent" appears only after every call succeeded, the failure fallbacks, signatures, retries and human takeover.
- `tools`, `fuzzy`.

Try it in a terminal, no Chatwoot needed:

```bash
node tools/chat-cli.js                         # interactive; type a number to tap a button
node tools/chat-cli.js "hi" "1" "is the pool heated"
node tools/chat-cli.js --fail-handoff "talk to the founder" "my payout" "1" "1"
```

## Metrics

Each event is one JSON line in `data/events.jsonl`, rotated at 50 MB (one `.1` copy is kept). The main types are `answered` (entry, score, how), `clarify`, `unmatched` (redacted text), `handoff` (reason, urgency), `escalated`, `escalation_failed` (step), `escalation_capped`, `handoff_capped`, `deferred_handoff`, `danger_while_waiting`, `card_warning`, `password_warning`, `human_takeover`, `returned_to_bot`, `resolved`, `not_english`, `multi_part`, `send_failed` and `api_error`.

Before writing, card numbers, passwords, emails, phone numbers and booking ids are redacted and text is cut to 300 characters. Tokens and secrets are never logged.

```bash
npm run metrics                       # answered by entry, answer rate, unmatched, handoffs, failed escalations
node tools/metrics.js --since 2026-11-01 --json
```

On EAST, run these as ubuntu from `/home/ubuntu/chatbot/current`:
- `node tools/metrics.js --log /home/ubuntu/chatbot/data/events.jsonl`
- `node tools/draft-additions.js --log /home/ubuntu/chatbot/data/events.jsonl --out /home/ubuntu/chatbot/data/drafts`

`cw_status.py` reports the founder-alert counts from Chatwoot itself.

## Configuration

All values live in `/home/ubuntu/chatbot/.env` (mode 600, outside the repo), which `cw_setup.py` writes. `.env.example` lists the names. Nothing secret is ever printed, and `/healthz` shows only `{ok, entries}`.

| Variable | |
|---|---|
| `CHATWOOT_URL` | `http://127.0.0.1:3009` (rails directly) |
| `CHATWOOT_BOT_TOKEN` | the agent bot access token, sent as the `api_access_token` header |
| `CHATWOOT_WEBHOOK_SECRET` | the agent bot secret. Required: without a valid `X-Chatwoot-Signature` a request gets 401. |
| `CHATWOOT_ACCOUNT_ID`, `CHATWOOT_INBOX_ID` | only this account and website inbox are handled |
| `CHATWOOT_DEREK_USER_ID`, `CHATWOOT_BRANDON_USER_ID` | Chatwoot user ids for the @mentions |
| `CHATWOOT_BOT_ID` | written by `cw_setup.py` for reference; the bot doesn't need it |
| `CHATWOOT_PUBLIC_URL` | `https://chat.poolrentalnearme.com` (the conversation link in the note) |
| `CHATWOOT_FORWARDED_PROTO` | `https` (the default), so `FORCE_SSL=true` doesn't redirect local calls |
| `SITE_URL` | `https://www.poolrentalnearme.com` |
| `PORT`, `HOST` | `3120`, `127.0.0.1`. This is the one port everywhere; `selfcheck.py` checks that nginx, `cw_status.py`, `bot_deploy.py` and `server.js` agree. |
| `BOT_DATA_DIR` | where `state.json` and `events.jsonl` go (`/home/ubuntu/chatbot/data`) |
| `BOT_CAP_PER_CONVERSATION`, `BOT_CAP_PER_CONTACT`, `BOT_CAP_GLOBAL_PER_HOUR` | optional overrides of the D3 caps (defaults 1, 2 and 10) |
| `BOT_ALLOW_UNSIGNED_LOOPBACK` | `true` only for local testing without a secret. Never set it on EAST. |

## Going live

Every step, its order, who does it, its rollback, every timer, the cost and Derek's open decisions are in **`ops/README.md`**. In short: DNS → `cw_harden` → `cw_setup` → `cw_nginx` → one reset link per founder → apps and 2FA → `pin_bot` + `bot_deploy` → `cw_push_test` → a test handoff → EAST widget → WEST release c208. Each server step runs DRY first, and DRY=False needs Derek's GO.

## Known gaps (engine, from the 2026-11-13 review)

These were open when this README was written. Fix them before going public.

- **Emergency recall:** 6 of 50 untuned plain-language emergencies get no 911 line, for example "our 2 yr old was found floating", "my nephew got pulled out of the pool and hes all blue" and "stranger jumped the fence and is coming at us".
- **Safety question replies:** a typed reply to the safety question that isn't yes or no ("hurry", "my son") drops the question and is matched as a new message.
- **Harassment and child safety:** misses include "the host told my son not to tell me what they talked about", requests for photos of the customer, and someone showing up at the customer's house.
- **False urgent pages:** idioms, negation and hypothetical insurance questions ("we almost died laughing", "not dangerous just gross", "does your insurance cover guest injuries") page both founders. They also use up D3 slots.
- **Queue race in `bot.js`:** the deferred sweep queues under `String(convId)` and webhooks under the numeric id, so the two can run at once. One reproduced race sent a second alert about 25 h later.
- **Deferred alerts under a flood:** a deferred alert can be lost if 1,000 newer chats evict its state. Retries have no urgency order, and at 200 entries the oldest are dropped.
- **Multi-part messages:** `multiPart()` has no limit on parts. A 1,500-character `x?x?…` costs about 250 ms of CPU per message.
- **Host answers to guests:** with no role known, guests can get host-only answers ("any pools open saturday" gets the host calendar answer).
- **Billing disputes:** some phrasings are missed ("charged 3 times", "two charges on my card").
- **Visitor labels:** labels a visitor preset on a new chat are kept and merged.
- **Copy nits:** urgent answers end with a question the bot doesn't wait for, and a failed urgent handoff says the 911 line twice.

## Waiting on Derek (the bot hands these off until he decides)

- Refund rules and timing. The Cancellation and Refund Policy the ToS cites isn't published.
- Whether refundable deposits come back.
- Weather, and host no-shows.
- Waivers: ToS §8.1 versus there being no signing step.
- Whether guests see a host's exact address.
- Service animals.
- Which support phone number to give, if any.
- Payout timing.
- Host eligibility for apartment, HOA or pool-less spaces.
- What happens to bookings when a listing is closed.

Each entry's `gap` field in `entries.json` has the detail. Ops decisions are listed in `ops/README.md`.
