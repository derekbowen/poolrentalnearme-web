#!/usr/bin/env node
'use strict';
/**
 * Drafts candidate bank entries from questions the assistant could not match.
 *
 * Reads the tracking log, groups recurring "unmatched" questions (same
 * canonical words, after typo/slang/synonym folding), and writes one draft
 * per recurring group to bank/drafts/. It NEVER edits bank/entries.json:
 * a draft has an empty answer and no sources, so it cannot pass validation
 * until Derek approves the wording and someone adds a verified source.
 *
 *   node tools/draft-additions.js [--log data/events.jsonl] [--out bank/drafts]
 *                                 [--min 3] [--min-conversations 2] [--dry-run]
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadBank, BANK_DIR } = require('../engine/bank');
const { Matcher } = require('../engine/matcher');
const { readLog } = require('../engine/tracking');

function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const uni = A.size + B.size - inter;
  return uni ? inter / uni : 0;
}

function slug(text) {
  return (
    String(text)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'question'
  );
}

/**
 * @returns {{ written: string[], clusters: Array }}
 */
function generateDrafts({
  logFile,
  outDir = path.join(BANK_DIR, 'drafts'),
  min = 3,
  minConversations = 2,
  dryRun = false,
  now = new Date(),
  bankDir = BANK_DIR,
} = {}) {
  const { entries } = loadBank(bankDir);
  const matcher = new Matcher(entries);
  const events = readLog(logFile).filter(
    (e) => e.type === 'unmatched' && typeof e.text === 'string' && e.text.trim()
  );

  const clusters = [];
  for (const ev of events) {
    const tokens = [...new Set(matcher.canon(ev.text))];
    if (!tokens.length) continue;
    let best = null;
    let bestSim = 0;
    for (const c of clusters) {
      const s = jaccard(tokens, c.core);
      if (s > bestSim) {
        bestSim = s;
        best = c;
      }
    }
    if (best && bestSim >= 0.5) {
      best.items.push({ text: ev.text, conv: ev.conv, ts: ev.ts, tokens });
      // core = tokens shared by at least half the members
      const counts = new Map();
      for (const it of best.items)
        for (const t of it.tokens) counts.set(t, (counts.get(t) || 0) + 1);
      const core = [...counts].filter(([, n]) => n >= best.items.length / 2).map(([t]) => t);
      if (core.length) best.core = core;
    } else {
      clusters.push({ core: tokens, items: [{ text: ev.text, conv: ev.conv, ts: ev.ts, tokens }] });
    }
  }

  const recurring = clusters
    .map((c) => ({ ...c, conversations: new Set(c.items.map((i) => i.conv)).size }))
    .filter((c) => c.items.length >= min && c.conversations >= minConversations)
    .sort((a, b) => b.items.length - a.items.length);

  const written = [];
  if (!dryRun && recurring.length) fs.mkdirSync(outDir, { recursive: true });
  for (const c of recurring) {
    // representative: the member closest to the core
    const rep = c.items
      .slice()
      .sort(
        (a, b) =>
          jaccard(b.tokens, c.core) - jaccard(a.tokens, c.core) || a.text.length - b.text.length
      )[0];
    const uniqueTexts = [...new Set(c.items.map((i) => i.text))];
    const nearest = matcher
      .rank(rep.text)
      .ranked.slice(0, 3)
      .map((r) => ({ id: r.id, score: Math.round(r.score * 100) / 100 }));
    const near =
      nearest[0] && nearest[0].score >= 0.4 ? entries.find((e) => e.id === nearest[0].id) : null;
    const key = crypto
      .createHash('sha1')
      .update([...c.core].sort().join(' '))
      .digest('hex')
      .slice(0, 8);
    const id = `draft-${slug(rep.text).slice(0, 32)}-${key}`;
    const draft = {
      status:
        "DRAFT - not live. The assistant never reads this folder. Needs Derek's approved answer and a verified source before it is copied into entries.json.",
      generated_at: now.toISOString(),
      cluster: {
        count: c.items.length,
        conversations: c.conversations,
        first_seen: c.items.map((i) => i.ts).sort()[0] || null,
        last_seen:
          c.items
            .map((i) => i.ts)
            .sort()
            .slice(-1)[0] || null,
        core_words: c.core,
        examples: uniqueTexts.slice(0, 12),
      },
      nearest_entries: nearest,
      suggested_entry: {
        id,
        category: near ? near.category : '',
        question: rep.text,
        variants: uniqueTexts.filter((t) => t !== rep.text).slice(0, 8),
        keywords: c.core.slice(0, 8),
        mode: 'handoff',
        answer: '',
        link: '',
        clarify_prompt: '',
        clarify_options: [],
        urgency: 'normal',
        sources: [],
        gap: `DRAFT from ${c.items.length} unmatched customer questions in ${c.conversations} conversations. Write a verified answer with a source, or keep it as a handoff with Derek-approved wording.`,
      },
    };
    const file = path.join(outDir, `${id}.json`);
    if (!dryRun) fs.writeFileSync(file, `${JSON.stringify(draft, null, 2)}\n`);
    written.push(file);
  }
  return { written, clusters: recurring, unmatched: events.length };
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.dryRun = true;
    else if (a === '--log') o.logFile = argv[++i];
    else if (a === '--out') o.outDir = argv[++i];
    else if (a === '--min') o.min = Number(argv[++i]);
    else if (a === '--min-conversations') o.minConversations = Number(argv[++i]);
  }
  return o;
}

if (require.main === module) {
  const opts = parseArgs(process.argv.slice(2));
  opts.logFile =
    opts.logFile ||
    process.env.BOT_LOG_PATH ||
    path.join(process.env.BOT_DATA_DIR || path.join(__dirname, '..', 'data'), 'events.jsonl');
  const res = generateDrafts(opts);
  console.log(`${res.unmatched} unmatched questions → ${res.clusters.length} recurring group(s)`);
  for (const c of res.clusters)
    console.log(`  ${c.items.length}× in ${c.conversations} conversations: "${c.items[0].text}"`);
  for (const f of res.written) console.log(`${opts.dryRun ? 'would write' : 'wrote'} ${f}`);
  console.log(
    'entries.json was not changed. Review drafts with Derek before adding anything to the bank.'
  );
}

module.exports = { generateDrafts, jaccard };
