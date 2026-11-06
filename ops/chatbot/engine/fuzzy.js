'use strict';
/**
 * Token-level typo tolerance: restricted Damerau-Levenshtein (optimal string
 * alignment: insert, delete, substitute, swap two adjacent letters) with
 * length-aware limits so short words must match exactly.
 */

/** Max edits allowed for a token of this length. */
function maxEdits(len) {
  if (len <= 3) return 0;
  if (len <= 5) return 1;
  if (len <= 9) return 2;
  return 3;
}

/**
 * OSA distance between a and b. Returns limit + 1 as soon as the distance is
 * known to exceed `limit` (cheap rejection for the common case).
 */
function damerau(a, b, limit = Infinity) {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > limit) return limit + 1;
  if (la === 0) return lb;
  if (lb === 0) return la;
  let prev2 = null;
  let prev = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    const cur = new Array(lb + 1);
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > limit) return limit + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[lb];
}

/**
 * Similarity in [0,1] between two canonical tokens, or 0 when they are too far
 * apart for their length. Exact = 1, 1 edit = 0.85, 2 = 0.7, 3 = 0.55.
 */
function tokenSimilarity(a, b) {
  if (a === b) return 1;
  if (/\d/.test(a) || /\d/.test(b)) return 0; // numbers never fuzz ("911" vs "91")
  const limit = Math.min(maxEdits(a.length), maxEdits(b.length));
  if (limit === 0) return 0;
  // Typos almost never change the first letter; requiring it stops real words
  // being stretched into others ("manage" → "damage", "used" → "sued").
  if (a[0] !== b[0]) return 0;
  const d = damerau(a, b, limit);
  if (d > limit) return 0;
  return 1 - 0.15 * d;
}

module.exports = { maxEdits, damerau, tokenSimilarity };
