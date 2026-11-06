'use strict';
/**
 * Question matcher: scores a customer message against every entry's question,
 * variants and keywords.
 *
 *  - tokens are canonicalised (normalize.js): slang, typos, stems, synonyms
 *  - each token is weighted by IDF over the 100 entries, so "pool" counts for
 *    little and "venmo" for a lot
 *  - a doc's score is the weighted F1 of query-vs-doc token overlap, where a
 *    token pair can match fuzzily (token-level Damerau-Levenshtein)
 *  - an entry's score = its best doc + a small keyword bonus + role/topic bias
 *  - the caller decides: confident (score ≥ CONFIDENT and margin ≥ MARGIN over
 *    the runner-up), clarify (score ≥ CLARIFY), or unmatched
 */
const { surfaceTokens, createSpeller, canonicalTokens, STOPWORDS } = require('./normalize');
const { tokenSimilarity, maxEdits, damerau } = require('./fuzzy');
const { SYNONYMS, SLANG, CONTEXT_WORDS, COMMON } = require('./lexicon');
const { canonStem } = require('./normalize');
const CONTEXT = new Set([...CONTEXT_WORDS].map((w) => canonStem(w)));

const THRESHOLDS = Object.freeze({
  CONFIDENT: 0.6, // top score needed to answer without asking
  MARGIN: 0.08, // ...and this much ahead of the next entry
  COVERAGE: 0.75, // ...and the entry must explain this share of the query's weight
  CLARIFY: 0.4, // below this: unmatched
});

const HOST_CATEGORIES = new Set([
  'creating a host listing',
  'host pricing and calendars',
  'payouts',
]);
const SWIMMER_CATEGORIES = new Set([
  'booking',
  'prices and payments',
  'cancellations and changes',
  'pool rules and amenities',
  'arrival and access',
]);

function roleOfCategory(category) {
  if (HOST_CATEGORIES.has(category)) return 'host';
  if (SWIMMER_CATEGORIES.has(category)) return 'swimmer';
  return null;
}

function uniq(arr) {
  return [...new Set(arr)];
}

class Matcher {
  /**
   * @param {Array} entries  bank entries (entries.json)
   * @param {object} [opts]  { extraVocab: string[] } words the speller may correct towards (e.g. safety terms)
   */
  constructor(entries, opts = {}) {
    this.entries = entries;
    this._simCache = new Map();
    this.byId = new Map(entries.map((e) => [e.id, e]));

    // --- vocabularies for the speller -----------------------------------
    const cleanVocab = new Set();
    const knownVocab = new Set();
    const freq = new Map();
    const addAll = (text, set) => {
      for (const t of surfaceTokens(text)) {
        set.add(t);
        knownVocab.add(t);
        freq.set(t, (freq.get(t) || 0) + 1);
      }
    };
    for (const e of entries) {
      addAll(e.question, cleanVocab);
      for (const k of e.keywords || []) addAll(k, cleanVocab);
      addAll(e.answer, cleanVocab);
      for (const v of e.variants || []) addAll(v, knownVocab);
    }
    for (const [canon, words] of Object.entries(SYNONYMS)) {
      cleanVocab.add(canon);
      for (const w of words) cleanVocab.add(w);
    }
    for (const v of Object.values(SLANG)) for (const w of v.split(' ')) cleanVocab.add(w);
    for (const w of opts.extraVocab || []) cleanVocab.add(w);
    // Deliberate typos in variants ("reservaton", "listin") map to the word of
    // the same entry they misspell; real words in variants ("safe") stay put.
    const typoMap = new Map();
    for (const e of entries) {
      const own = new Set();
      for (const t of [e.question, ...(e.keywords || []), e.answer])
        for (const w of surfaceTokens(t)) own.add(w);
      for (const v of e.variants || []) {
        for (const t of surfaceTokens(v)) {
          if (
            cleanVocab.has(t) ||
            typoMap.has(t) ||
            t.length <= 3 ||
            /\d/.test(t) ||
            STOPWORDS.has(t) ||
            COMMON.has(t)
          )
            continue;
          const limit = maxEdits(t.length);
          let best = null;
          let bestD = limit + 1;
          let tie = false;
          for (const w of own) {
            if (Math.abs(w.length - t.length) > limit || w.length <= 3) continue;
            if (w[0] !== t[0]) continue;
            const d = damerau(t, w, limit);
            if (d < bestD) {
              bestD = d;
              best = w;
              tie = false;
            } else if (d === bestD && w !== best) tie = true;
          }
          if (best && bestD <= limit && !tie) typoMap.set(t, best);
        }
      }
    }
    this.typoMap = typoMap;
    this.speller = createSpeller(cleanVocab, knownVocab, freq, typoMap);

    // --- docs -------------------------------------------------------------
    this.docs = []; // { entryId, kind, text, tokens:Set, key }
    this.exact = new Map(); // canonical key → Set(entryId)
    const df = new Map();
    this.kw = new Map(); // entry id → keyword token lists
    this.vocab = new Map(); // entry id → every canonical token of its docs + keywords
    for (const e of entries) {
      const entryTokens = new Set();
      const texts = [
        { kind: 'question', text: e.question },
        ...(e.variants || []).map((v) => ({ kind: 'variant', text: v })),
      ];
      for (const t of texts) {
        const toks = uniq(this.canon(t.text));
        if (!toks.length) continue;
        const key = [...toks].sort().join(' ');
        this.docs.push({ entryId: e.id, kind: t.kind, text: t.text, tokens: toks, key });
        if (!this.exact.has(key)) this.exact.set(key, new Set());
        this.exact.get(key).add(e.id);
        toks.forEach((x) => entryTokens.add(x));
      }
      const kwSeen = new Set();
      const kw = [];
      for (const k of e.keywords || []) {
        const toks = uniq(this.canon(k));
        const key = [...toks].sort().join(' ');
        if (!toks.length || kwSeen.has(key)) continue;
        kwSeen.add(key);
        kw.push(toks);
      }
      kw.forEach((k) => k.forEach((x) => entryTokens.add(x)));
      this.kw.set(e.id, kw);
      this.vocab.set(e.id, [...entryTokens]);
      for (const t of entryTokens) df.set(t, (df.get(t) || 0) + 1);
    }
    const N = entries.length;
    this.canonVocab = new Set(df.keys());
    this.idf = new Map();
    this.df = df;
    for (const [t, n] of df) this.idf.set(t, Math.log(1 + N / n));
    this.unknownWeight = Math.log(1 + N) * 0.6;
    this.docsByEntry = new Map();
    for (const d of this.docs) {
      if (!this.docsByEntry.has(d.entryId)) this.docsByEntry.set(d.entryId, []);
      this.docsByEntry.get(d.entryId).push(d);
    }
  }

  canon(text) {
    return canonicalTokens(text, this.speller);
  }

  weight(token) {
    return this.idf.has(token) ? this.idf.get(token) : this.unknownWeight;
  }

  sim(a, b) {
    if (a === b) return 1;
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    let v = this._simCache.get(k);
    if (v === undefined) {
      v = tokenSimilarity(a, b);
      if (this._simCache.size > 200000) this._simCache.clear();
      this._simCache.set(k, v);
    }
    return v;
  }

  /**
   * Best similarity of `tok` against a token list. Fuzzy matching only applies
   * to tokens the bank does not know: a real, known word ("safe", "bank") is
   * never stretched into a neighbour ("save", "back").
   */
  bestSim(tok, list) {
    const fuzzy = !this.canonVocab.has(tok);
    let best = 0;
    for (const t of list) {
      if (t === tok) return 1;
      if (!fuzzy || this.canonVocab.has(tok)) continue;
      const s = this.sim(tok, t);
      if (s > best) best = s;
    }
    return best;
  }

  docScore(q, d) {
    let mq = 0;
    let tq = 0;
    for (const t of q) {
      const w = this.weight(t);
      tq += w;
      mq += w * this.bestSim(t, d);
    }
    let md = 0;
    let td = 0;
    for (const t of d) {
      const w = this.weight(t);
      td += w;
      let best = 0;
      for (const x of q) {
        const v = x === t ? 1 : this.canonVocab.has(x) ? 0 : this.sim(x, t);
        if (v > best) best = v;
        if (best === 1) break;
      }
      md += w * best;
    }
    if (!tq || !td) return 0;
    const P = mq / tq;
    const R = md / td;
    if (P + R === 0) return 0;
    return (2 * P * R) / (P + R);
  }

  /**
   * @param {string} text
   * @param {object} [ctx] { role: 'host'|'swimmer'|null, topic: category|null }
   * @returns {{ tokens: string[], ranked: Array<{id, score, raw, doc}>, exact: string[] }}
   */
  rank(text, ctx = {}) {
    const q = uniq(this.canon(text));
    if (!q.length) return { tokens: q, ranked: [], exact: [] };
    const key = [...q].sort().join(' ');
    const exactIds = this.exact.has(key) ? [...this.exact.get(key)] : [];
    const ranked = [];
    for (const e of this.entries) {
      let best = 0;
      let bestDoc = null;
      for (const d of this.docsByEntry.get(e.id) || []) {
        const s = d.key === key ? 1 : this.docScore(q, d.tokens);
        if (s > best) {
          best = s;
          bestDoc = d;
        }
      }
      if (best <= 0) continue;
      // keyword bonus: whole keyword phrases present in the query
      let kwHits = 0;
      for (const k of this.kw.get(e.id)) {
        if (
          k.every((t) =>
            q.some((x) => x === t || (!this.canonVocab.has(x) && this.sim(x, t) >= 0.85))
          )
        )
          kwHits++;
      }
      // coverage: how much of the query this entry's whole vocabulary explains
      const vocab = this.vocab.get(e.id);
      let cq = 0;
      let tq = 0;
      for (const t of q) {
        const w = CONTEXT.has(t) || /^\d+$/.test(t) ? Math.min(1, this.weight(t)) : this.weight(t);
        tq += w;
        cq += w * this.bestSim(t, vocab);
      }
      const coverage = tq ? cq / tq : 0;
      let score =
        best === 1 ? 1 : Math.min(1, 0.8 * best + 0.2 * coverage + Math.min(0.06, 0.03 * kwHits));
      const raw = score;
      const role = roleOfCategory(e.category);
      if (ctx.role && role) score *= role === ctx.role ? 1 : 0.88;
      if (ctx.topic && ctx.topic === e.category) score = Math.min(1, score + 0.03);
      ranked.push({ id: e.id, score, raw, coverage, doc: bestDoc ? bestDoc.text : null });
    }
    ranked.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    return { tokens: q, ranked, exact: exactIds };
  }

  /**
   * Decide what to do with a message.
   * @returns {{ status: 'confident'|'ambiguous'|'unmatched', top, candidates, tokens, needsRole }}
   */
  match(text, ctx = {}) {
    const { tokens, ranked, exact } = this.rank(text, ctx);
    const top = ranked[0] || null;
    const second = ranked[1] || null;
    const base = { tokens, top, candidates: ranked.slice(0, 5) };
    if (!top) return { ...base, status: 'unmatched', needsRole: false };

    // Exact canonical hit on exactly one entry (after role filtering) wins outright.
    let exactIds = exact;
    if (exactIds.length > 1 && ctx.role) {
      const sameRole = exactIds.filter((id) => {
        const r = roleOfCategory(this.byId.get(id).category);
        return !r || r === ctx.role;
      });
      if (sameRole.length) exactIds = sameRole;
    }
    if (exactIds.length === 1) {
      const hit = ranked.find((r) => r.id === exactIds[0]);
      return { ...base, status: 'confident', top: hit, needsRole: false };
    }

    const margin = second ? top.score - second.score : top.score;
    // Ask "booking a swim or hosting?" only when strong guest-side and host-side answers tie.
    const close = ranked.filter(
      (r) => r.score >= THRESHOLDS.CONFIDENT && top.score - r.score < THRESHOLDS.MARGIN
    );
    const roles = new Set(
      close.map((r) => roleOfCategory(this.byId.get(r.id).category)).filter(Boolean)
    );
    const needsRole = !ctx.role && roles.size > 1;

    if (exactIds.length > 1) {
      return {
        ...base,
        status: 'ambiguous',
        candidates: exactIds.map((id) => ranked.find((r) => r.id === id)).filter(Boolean),
        needsRole:
          !ctx.role &&
          new Set(exactIds.map((id) => roleOfCategory(this.byId.get(id).category))).size > 1,
      };
    }
    // one informative word is never enough to answer outright (unless it is an exact variant)
    const enoughWords = tokens.length > 1 || (this.df.get(tokens[0]) || 0) <= 2;
    if (
      top.score >= THRESHOLDS.CONFIDENT &&
      margin >= THRESHOLDS.MARGIN &&
      top.coverage >= THRESHOLDS.COVERAGE &&
      enoughWords
    ) {
      return { ...base, status: 'confident', needsRole: false };
    }
    if (top.score >= THRESHOLDS.CLARIFY) {
      const cands = ranked
        .filter((r) => r.score >= THRESHOLDS.CLARIFY && top.score - r.score < 0.15)
        .slice(0, 3);
      return { ...base, status: 'ambiguous', candidates: cands, needsRole };
    }
    return { ...base, status: 'unmatched', needsRole: false };
  }
}

module.exports = {
  Matcher,
  THRESHOLDS,
  roleOfCategory,
  HOST_CATEGORIES,
  SWIMMER_CATEGORIES,
  STOPWORDS,
};
