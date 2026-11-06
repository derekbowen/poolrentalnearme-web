'use strict';
/**
 * Text normalisation shared by the bank index and incoming messages, so both
 * sides are canonicalised by exactly the same function.
 *
 *   raw text → clean() → phrases → tokens → slang → spell-correct → stem → synonym → drop stopwords
 */
const { PHRASES, SLANG, SYNONYMS, STOPWORDS, COMMON } = require('./lexicon');
const { maxEdits, damerau } = require('./fuzzy');

/** Lower-case, strip accents/emoji/punctuation, keep letters, digits, spaces. */
function clean(text) {
  let s = String(text == null ? '' : text)
    .normalize('NFKC')
    .toLowerCase();
  s = s.replace(/https?:\/\/\S+/g, ' ');
  s = s.replace(/[‘’ʼ`´']/g, ''); // can't → cant, what’s → whats
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/%/g, ' percent ').replace(/&/g, ' and ').replace(/\+/g, ' plus ');
  s = s.replace(/[^a-z0-9]+/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

function applyPhrases(s) {
  let out = ` ${s} `;
  for (const [re, rep] of PHRASES) out = out.replace(re, rep).replace(/\s+/g, ' ');
  return out.trim();
}

function undouble(s) {
  return /([bdgmnpt])\1$/.test(s) || /ll$/.test(s) ? s.slice(0, -1) : s;
}

/** Light suffix stripper. Deterministic; it only has to agree with itself. */
function stem(w) {
  if (w.length <= 3 || /\d/.test(w)) return w;
  let s = w;
  if (s.endsWith('ies') && s.length > 4) s = s.slice(0, -3) + 'y';
  else if (/(ss|us|is)$/.test(s)) {
    /* keep: glass, status, analysis */
  } else if (/(ches|shes|xes|sses|zes)$/.test(s)) s = s.slice(0, -2);
  else if (s.endsWith('s')) s = s.slice(0, -1);
  if (s.length > 5 && s.endsWith('ing')) s = undouble(s.slice(0, -3));
  else if (s.length > 4 && s.endsWith('ed')) s = undouble(s.slice(0, -2));
  if (s.length > 3 && s.endsWith('e')) s = s.slice(0, -1);
  return s;
}

// stem(surface) → canonical concept (also stemmed)
const SYN_MAP = new Map();
const SYN_COLLISIONS = [];
for (const canon of Object.keys(SYNONYMS)) SYN_MAP.set(stem(canon), stem(canon));
for (const [canon, words] of Object.entries(SYNONYMS)) {
  const c = stem(canon);
  for (const w of words) {
    const k = stem(w);
    const prev = SYN_MAP.get(k);
    if (prev && prev !== c) {
      SYN_COLLISIONS.push(`${w} (stem "${k}") is in "${canon}" but "${k}" already means "${prev}"`);
      continue; // never let a surface form hijack another concept
    }
    SYN_MAP.set(k, c);
  }
}
// surface words that are synonyms (for "is this word known" checks)
const SYN_SURFACE = new Set();
for (const [canon, words] of Object.entries(SYNONYMS)) {
  SYN_SURFACE.add(canon);
  for (const w of words) SYN_SURFACE.add(w);
}

function canonStem(token) {
  const s = stem(token);
  return SYN_MAP.get(s) || s;
}

/** Split a cleaned string into surface tokens with slang expanded. */
function surfaceTokens(text) {
  const s = applyPhrases(clean(text));
  if (!s) return [];
  const out = [];
  for (const t of s.split(' ')) {
    const rep = SLANG[t];
    if (rep) out.push(...rep.split(' '));
    else out.push(t);
  }
  return out;
}

/**
 * A spell-corrector bound to a vocabulary. `clean` holds words we trust as
 * correctly spelled (questions, keywords, answers, lexicon) and is the only
 * correction target; `known` holds every token seen anywhere in the bank
 * (including deliberate typo variants). A token found in either is left
 * alone, so a real word like "safe" is never "corrected" into "save".
 */
/**
 * Edits the speller may make. Stricter than the matcher's fuzzy limit: rewriting a
 * word is riskier than scoring it, and a 6-letter real word is often 2 edits from a
 * bank word ("scared" → "started", "invoice" → "invite"). Two edits only for long words.
 */
function spellEdits(len) {
  if (len <= 3) return 0;
  if (len <= 7) return 1;
  return Math.min(2, maxEdits(len));
}

function createSpeller(cleanVocab, knownVocab, freq = new Map(), typoMap = new Map()) {
  const cache = new Map();
  const byLen = new Map();
  for (const w of cleanVocab) {
    if (!byLen.has(w.length)) byLen.set(w.length, []);
    byLen.get(w.length).push(w);
  }
  function best(token, pool) {
    const limit = spellEdits(token.length);
    if (limit === 0) return null;
    let bestW = null;
    let bestD = limit + 1;
    let tie = false;
    for (let len = token.length - limit; len <= token.length + limit; len++) {
      const list = pool.get(len);
      if (!list) continue;
      for (const w of list) {
        if (w[0] !== token[0]) continue; // first letter must agree (see fuzzy.js)
        if (Math.min(w.length, token.length) <= 3) continue;
        const d = damerau(token, w, limit);
        if (d < bestD) {
          bestD = d;
          bestW = w;
          tie = false;
        } else if (d === bestD && d <= limit) {
          // prefer the more frequent word; exact frequency tie = ambiguous
          const fa = freq.get(w) || 0;
          const fb = freq.get(bestW) || 0;
          if (fa > fb) bestW = w;
          else if (fa === fb) tie = true;
        }
      }
    }
    if (!bestW || bestD > limit || tie) return null;
    return bestW;
  }
  return function correct(token) {
    if (cache.has(token)) return cache.get(token);
    if (typoMap.has(token)) return typoMap.get(token);
    let out = token;
    // bounded: every junk token a visitor sends would otherwise stay in memory for good
    if (cache.size >= 20000) cache.clear();
    if (
      token.length > 3 &&
      token.length <= 30 &&
      !/\d/.test(token) &&
      !STOPWORDS.has(token) &&
      !COMMON.has(token) &&
      !cleanVocab.has(token) &&
      !knownVocab.has(token) &&
      !SYN_SURFACE.has(token)
    ) {
      const fixed = best(token, byLen);
      if (fixed) out = fixed;
    }
    cache.set(token, out);
    return out;
  };
}

/**
 * Canonical tokens for scoring. `speller` is optional (the bank index is built
 * with the same speller the live matcher uses).
 */
function canonicalTokens(text, speller) {
  const out = [];
  for (const t of surfaceTokens(text)) {
    const fixed = speller ? speller(t) : t;
    if (STOPWORDS.has(fixed)) continue;
    const c = canonStem(fixed);
    if (!c || STOPWORDS.has(c)) continue;
    out.push(c);
  }
  return out;
}

/**
 * Surface string with typos fixed, for the safety guards ("drowing" → "drowning").
 * With `only`, a correction is kept only when it lands on one of those words,
 * so an ordinary word is never turned into an alarming one.
 */
function correctedText(text, speller, only = null) {
  return surfaceTokens(text)
    .map((t) => {
      if (!speller) return t;
      const c = speller(t);
      if (!only || c === t) return c;
      // an alarming word only from a one-letter slip ("drowing"), never a two-letter stretch ("inquiry" → "injury")
      const lim = t.length >= 9 ? 2 : 1;
      return only.has(c) && damerau(t, c, lim) <= lim ? c : t;
    })
    .join(' ');
}

module.exports = {
  clean,
  applyPhrases,
  stem,
  canonStem,
  surfaceTokens,
  createSpeller,
  canonicalTokens,
  correctedText,
  STOPWORDS,
  SYN_COLLISIONS,
};
