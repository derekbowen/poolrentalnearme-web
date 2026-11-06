#!/usr/bin/env node
'use strict';
/**
 * Summarises the tracking log: what got answered (by entry id), what went
 * unmatched, handoffs, and whether escalations reached Chatwoot.
 *
 *   node tools/metrics.js [--log data/events.jsonl] [--since 2026-11-01] [--json]
 */
const path = require('node:path');
const { readLog } = require('../engine/tracking');

function summarize(events, { since = null } = {}) {
  const ev = since ? events.filter((e) => String(e.ts || '') >= since) : events;
  const count = (arr, key) => {
    const m = new Map();
    for (const e of arr) {
      const k = typeof key === 'function' ? key(e) : e[key];
      m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  const by = (t) => ev.filter((e) => e.type === t);
  const answered = by('answered');
  const unmatched = by('unmatched');
  const handoffs = by('handoff');
  const escalated = by('escalated');
  const failed = by('escalation_failed');
  const conversations = new Set(ev.map((e) => e.conv)).size;
  const questions = answered.length + unmatched.length;
  return {
    since,
    events: ev.length,
    conversations,
    answered: answered.length,
    unmatched: unmatched.length,
    answer_rate: questions ? Math.round((answered.length / questions) * 1000) / 10 : null,
    clarify_questions: by('clarify').length,
    handoffs: handoffs.length,
    handoffs_by_reason: count(handoffs, 'reason'),
    handoffs_urgent: handoffs.filter((h) => h.urgency === 'high').length,
    escalated_ok: escalated.length,
    escalation_failed: failed.length,
    escalation_failed_by_step: count(failed, 'step'),
    human_takeovers: by('human_takeover').length,
    card_warnings: by('card_warning').length,
    password_warnings: by('password_warning').length,
    send_failures: by('send_failed').length,
    top_entries: count(answered, 'entry').slice(0, 25),
    answered_via: count(answered, 'via'),
    top_unmatched: count(unmatched, (e) =>
      String(e.text || '')
        .toLowerCase()
        .trim()
    ).slice(0, 25),
  };
}

function print(s) {
  const L = [];
  L.push(`PRNM assistant metrics${s.since ? ` since ${s.since}` : ''}`);
  L.push(`  conversations ${s.conversations} · events ${s.events}`);
  L.push(
    `  answered ${s.answered} · unmatched ${s.unmatched} · answer rate ${s.answer_rate == null ? 'n/a' : `${s.answer_rate}%`} · clarifying questions ${s.clarify_questions}`
  );
  L.push(
    `  handoffs ${s.handoffs} (urgent ${s.handoffs_urgent}) · reached Chatwoot ${s.escalated_ok} · FAILED ${s.escalation_failed}`
  );
  if (s.escalation_failed_by_step.length)
    L.push(`    failed at: ${s.escalation_failed_by_step.map(([k, n]) => `${k} ${n}`).join(', ')}`);
  L.push(`  by reason: ${s.handoffs_by_reason.map(([k, n]) => `${k} ${n}`).join(', ') || '-'}`);
  L.push(
    `  human takeovers ${s.human_takeovers} · card warnings ${s.card_warnings} · password warnings ${s.password_warnings} · send failures ${s.send_failures}`
  );
  L.push('  top answered entries:');
  for (const [k, n] of s.top_entries) L.push(`    ${String(n).padStart(4)}  ${k}`);
  L.push('  top unmatched questions (run tools/draft-additions.js to draft entries):');
  for (const [k, n] of s.top_unmatched) L.push(`    ${String(n).padStart(4)}  ${k}`);
  return L.join('\n');
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const get = (f) => {
    const i = argv.indexOf(f);
    return i >= 0 ? argv[i + 1] : null;
  };
  const file =
    get('--log') ||
    process.env.BOT_LOG_PATH ||
    path.join(process.env.BOT_DATA_DIR || path.join(__dirname, '..', 'data'), 'events.jsonl');
  const s = summarize(readLog(file), { since: get('--since') });
  console.log(argv.includes('--json') ? JSON.stringify(s, null, 2) : print(s));
}

module.exports = { summarize, print };
