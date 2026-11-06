'use strict';
/**
 * Loads and validates bank/entries.json (the single source of truth for
 * answers) and bank/routes.json (flow wiring). validateBank() is what
 * `npm run validate` and the tests run, so a bad edit fails loudly.
 */
const fs = require('node:fs');
const path = require('node:path');

const BANK_DIR = path.join(__dirname, '..', 'bank');

const CATEGORIES = [
  'booking',
  'prices and payments',
  'cancellations and changes',
  'pool rules and amenities',
  'arrival and access',
  'creating a host listing',
  'host pricing and calendars',
  'payouts',
  'accounts and technical problems',
  'safety, disputes, and human help',
];
const MODES = new Set(['auto', 'clarify', 'handoff']);
const URGENCY = new Set(['normal', 'high']);
const LINE_911 = 'If anyone is hurt or in danger, call 911 first.';
// Injury / danger answers must lead with the 911 line.
const MUST_LEAD_911 = [
  'safety-injury',
  'safety-damage',
  'safety-unsafe-pool',
  'safety-harassment',
  'dispute-guest-breaking-rules',
];

/**
 * Phrases that must never appear in anything the assistant says. Sources:
 * CLAUDE.md rules 1 and 8, src/config/businessFacts.js notApproved, the
 * known /p/faq conflicts, and scripts/check-insurance-language.sh BANNED.
 */
const FORBIDDEN = [
  /fully insured|fully covered|all bookings are insured|every booking is (insured|covered)|your pool is protected|hosts are protected/i,
  /up to \$[0-9,]+ in coverage|hosts are covered|you.?re protected|you are protected|host protection|guest protection guarantee/i,
  /your (pool|home|property|data) (is|are) (covered|insured|protected)|automatically insured|insurance on every booking/i,
  /protected by|PRNM Guarantee|damage claims up to|policy limit/i,
  /does not (provide|offer|arrange|carry) (or arrange )?insurance|does NOT cover|we don.?t verify/i,
  /15% commission|commission on hosts|we take 15%/i,
  /full refund up to|50% (refund )?day.of|refund tiers?/i,
  /next business day|within 24 hours|24\/7|around the clock/i,
  /every pool (is )?reviewed|500\+|\bthousands of (hosts|pools|guests)\b/i,
  /\btext us\b|\btext me\b|\bsms\b|\btwilio\b/i,
  /\bStephen\b/,
  /\b(call|phone) us\b|\(909\)|888-940/i,
  /\bAI-powered\b|\bas an AI\b|\bChatGPT\b/i,
];

function loadBank(dir = BANK_DIR) {
  const entries = JSON.parse(fs.readFileSync(path.join(dir, 'entries.json'), 'utf8'));
  const routes = JSON.parse(fs.readFileSync(path.join(dir, 'routes.json'), 'utf8'));
  return { entries, routes };
}

function forbiddenHits(text) {
  return FORBIDDEN.filter((re) => re.test(String(text || ''))).map((re) => re.source);
}

/** @returns {{errors: string[], warnings: string[]}} */
function validateBank(entries, routes = {}) {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(entries)) return { errors: ['entries.json must be an array'], warnings };
  if (entries.length !== 100) errors.push(`expected 100 entries, found ${entries.length}`);
  const ids = new Set();
  const perCat = new Map(CATEGORIES.map((c) => [c, 0]));
  const seenQuestions = new Map();
  for (const e of entries) {
    const where = e && e.id ? e.id : JSON.stringify(e).slice(0, 60);
    for (const k of [
      'id',
      'category',
      'question',
      'mode',
      'answer',
      'urgency',
      'gap',
      'link',
      'clarify_prompt',
    ]) {
      if (typeof e[k] !== 'string') errors.push(`${where}: "${k}" must be a string`);
    }
    for (const k of ['variants', 'keywords', 'clarify_options', 'sources']) {
      if (!Array.isArray(e[k])) errors.push(`${where}: "${k}" must be an array`);
    }
    if (errors.length > 50) break;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.id)) errors.push(`${where}: id must be kebab-case`);
    if (ids.has(e.id)) errors.push(`${where}: duplicate id`);
    ids.add(e.id);
    if (!perCat.has(e.category)) errors.push(`${where}: unknown category "${e.category}"`);
    else perCat.set(e.category, perCat.get(e.category) + 1);
    if (!MODES.has(e.mode)) errors.push(`${where}: mode must be auto, clarify or handoff`);
    if (!URGENCY.has(e.urgency)) errors.push(`${where}: urgency must be normal or high`);
    if (!e.answer.trim()) errors.push(`${where}: empty answer`);
    if (e.answer.length > 320)
      warnings.push(`${where}: answer is ${e.answer.length} chars; keep messages short`);
    if (e.link && !/^(\/|https:\/\/)/.test(e.link))
      errors.push(`${where}: link must be a relative path ("/s") or https URL`);
    if (e.mode === 'auto' && !e.sources.length)
      errors.push(`${where}: auto answers need at least one source`);
    for (const s of e.sources) {
      if (!s || typeof s.ref !== 'string' || typeof s.quote !== 'string')
        errors.push(`${where}: each source needs ref + quote`);
    }
    if (e.mode === 'clarify') {
      if (!e.clarify_prompt.trim()) errors.push(`${where}: clarify entries need clarify_prompt`);
      if (e.clarify_options.length < 2)
        errors.push(`${where}: clarify entries need 2+ clarify_options`);
      if (!(routes.clarify_routes || {})[e.id])
        errors.push(`${where}: clarify entry has no clarify_routes in routes.json`);
    }
    if (e.variants.length < 5) warnings.push(`${where}: only ${e.variants.length} variants`);
    const vset = new Set();
    for (const v of e.variants) {
      const k = v
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
      if (vset.has(k)) warnings.push(`${where}: duplicate variant "${v}"`);
      vset.add(k);
    }
    const qk = e.question
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    if (seenQuestions.has(qk)) errors.push(`${where}: same question as ${seenQuestions.get(qk)}`);
    seenQuestions.set(qk, e.id);
    for (const hit of forbiddenHits(
      `${e.answer} ${e.clarify_prompt} ${e.clarify_options.join(' ')}`
    )) {
      errors.push(`${where}: answer contains a forbidden phrase (${hit})`);
    }
    // Rule 8: insurance / liability / coverage / claims / damage / injury questions never get a factual answer.
    const asks = `${e.question} ${e.variants.join(' ')} ${e.keywords.join(' ')}`;
    if (
      /\b(insur\w*|liabilit\w*|coverage|claims?|damag\w*|injur\w*|hurt)\b/i.test(asks) &&
      e.mode === 'auto'
    ) {
      errors.push(
        `${where}: rule-8 topic (insurance/liability/coverage/claims/damage/injury) must not be mode "auto"`
      );
    }
    if (
      /\b(insur\w*|coverage)\b/i.test(e.answer) &&
      !/\bInsurance questions go to Derek\b/.test(e.answer)
    ) {
      errors.push(`${where}: answer mentions insurance/coverage`);
    }
  }
  for (const id of MUST_LEAD_911) {
    const e = entries.find((x) => x.id === id);
    if (!e) errors.push(`missing required entry ${id}`);
    else if (!e.answer.startsWith(LINE_911))
      errors.push(`${id}: injury/danger answers must start with "${LINE_911}"`);
  }
  for (const [c, n] of perCat)
    if (n !== 10) errors.push(`category "${c}" has ${n} entries (expected 10)`);
  for (const [id, b] of Object.entries(routes.builtin || {})) {
    for (const hit of forbiddenHits(b.answer))
      errors.push(`builtin ${id}: forbidden phrase (${hit})`);
    if (!URGENCY.has(b.urgency)) errors.push(`builtin ${id}: bad urgency`);
    if (!CATEGORIES.includes(b.category)) errors.push(`builtin ${id}: bad category`);
  }
  for (const [id, list] of Object.entries(routes.clarify_routes || {})) {
    for (const r of list)
      if (r.say)
        for (const hit of forbiddenHits(r.say))
          errors.push(`clarify route ${id}: forbidden phrase (${hit})`);
  }
  return { errors, warnings };
}

module.exports = {
  loadBank,
  validateBank,
  forbiddenHits,
  CATEGORIES,
  FORBIDDEN,
  LINE_911,
  BANK_DIR,
};
