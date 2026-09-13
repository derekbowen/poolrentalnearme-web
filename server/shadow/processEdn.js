/**
 * Parser for a Sharetribe transaction process definition (`process.edn`).
 *
 * Pure: text in, plain data out. No file I/O, no network, no clock.
 *
 * WHY THIS EXISTS
 * ---------------
 * Sharetribe runs the transaction process — the state machine, and critically a
 * durable scheduler that fires `expire-payment` at 15 minutes, `complete` two
 * days after a booking ends, and so on. Nothing in PRNM computes any of that,
 * and a missed `complete` means a host is never paid. Before we can replace the
 * engine we have to be able to state exactly what it does, from the definition
 * rather than from memory.
 *
 * This is a deliberately small subset of EDN — enough for the two process files
 * we actually ship (`default-booking` and `additional-charge`), not a general
 * reader. It is used to generate the committed transition table and, in the
 * tests, to re-parse the real `.edn` and prove that table still matches.
 *
 * SHADOW ONLY. Nothing here executes a transition, calls Stripe, or writes
 * anywhere. It answers "what would Sharetribe do", so we can diff.
 */

/** Strip `;;` line comments. EDN has no block comments, and we ship none. */
const stripComments = (edn) => edn.replace(/;;[^\n]*/g, '');

/**
 * Split the `:transitions` vector into one chunk per transition map.
 *
 * Each transition map starts with `{:name :transition/...`, which is a reliable
 * boundary in these files: `:name` is always first, and no nested map uses a
 * `:transition/` keyword for its `:name` (actions use `:action/`, notifications
 * live in a separate top-level vector and use `:notification/`).
 */
const splitTransitions = (edn) => {
  const transitionsStart = edn.indexOf(':transitions');
  if (transitionsStart === -1) return [];
  // `:notifications` is the next top-level key; everything before it is ours.
  const notificationsStart = edn.indexOf(':notifications', transitionsStart);
  const section = edn.slice(
    transitionsStart,
    notificationsStart === -1 ? undefined : notificationsStart
  );
  return section.split(/\{:name :transition\//).slice(1);
};

/**
 * Parse an `:at` expression into a small tree.
 *
 * The grammar in use, in full:
 *
 *   {:fn/plus     [<expr> <expr>]}          sum of a timepoint and a period
 *   {:fn/min      [<expr> <expr> ...]}      earliest of several
 *   {:fn/timepoint [:time/booking-start]}   a named instant
 *   {:fn/timepoint [:time/booking-end]}
 *   {:fn/timepoint [:time/first-entered-state :state/<name>]}
 *   {:fn/period   ["P3D"]}                  an ISO 8601 duration
 *
 * Returned as `{op, args}` / `{op:'timepoint', name, state}` / `{op:'period', iso}`
 * so the evaluator stays a plain recursive walk.
 */
const parseAtExpression = (src) => {
  let i = 0;

  const ws = () => {
    while (i < src.length && /[\s,]/.test(src[i])) i += 1;
  };

  const parseExpr = () => {
    ws();
    if (src[i] !== '{') {
      throw new Error(`expected '{' at ${i} in :at expression`);
    }
    i += 1; // {
    ws();

    const fnMatch = /^:fn\/([a-z-]+)/.exec(src.slice(i));
    if (!fnMatch) {
      throw new Error(`expected :fn/... at ${i} in :at expression`);
    }
    const op = fnMatch[1];
    i += fnMatch[0].length;
    ws();

    if (src[i] !== '[') {
      throw new Error(`expected '[' after :fn/${op}`);
    }
    i += 1; // [

    let node;
    if (op === 'timepoint') {
      ws();
      const tp = /^:time\/([a-z-]+)/.exec(src.slice(i));
      if (!tp) throw new Error('expected :time/... inside :fn/timepoint');
      i += tp[0].length;
      ws();
      const st = /^:state\/([a-z-]+)/.exec(src.slice(i));
      const state = st ? st[1] : null;
      if (st) i += st[0].length;
      node = { op: 'timepoint', name: tp[1], state };
    } else if (op === 'period') {
      ws();
      const per = /^"([^"]+)"/.exec(src.slice(i));
      if (!per) throw new Error('expected "P..." inside :fn/period');
      i += per[0].length;
      node = { op: 'period', iso: per[1] };
    } else {
      const args = [];
      for (;;) {
        ws();
        if (src[i] === ']') break;
        args.push(parseExpr());
      }
      node = { op, args };
    }

    ws();
    if (src[i] !== ']') throw new Error(`expected ']' closing :fn/${op}`);
    i += 1; // ]
    ws();
    if (src[i] !== '}') throw new Error(`expected '}' closing :fn/${op}`);
    i += 1; // }
    return node;
  };

  const tree = parseExpr();
  return tree;
};

/** Pull the balanced `{...}` that follows `:at` in a transition chunk. */
const extractAtSource = (chunk) => {
  const at = /:at\s*/.exec(chunk);
  if (!at) return null;
  const start = chunk.indexOf('{', at.index);
  if (start === -1) return null;
  let depth = 0;
  for (let j = start; j < chunk.length; j += 1) {
    if (chunk[j] === '{') depth += 1;
    else if (chunk[j] === '}') {
      depth -= 1;
      if (depth === 0) return chunk.slice(start, j + 1);
    }
  }
  return null;
};

/**
 * Parse a process definition.
 *
 * @param {string} edn contents of a process.edn
 * @returns {{
 *   transitions: Array<{
 *     name: string,
 *     from: string,
 *     to: string,
 *     actor: string|null,
 *     automatic: boolean,
 *     privileged: boolean,
 *     actions: string[],
 *     at: object|null,
 *   }>,
 *   states: string[],
 * }}
 */
const parseProcessEdn = (edn) => {
  const clean = stripComments(String(edn));
  const chunks = splitTransitions(clean);

  const transitions = chunks.map((chunk) => {
    const name = /^([a-z0-9-]+)/.exec(chunk)[1];

    // `:to` always appears; `:from` is absent for transitions out of the
    // initial (not-yet-created) state.
    const from = /:from :state\/([a-z0-9-]+)/.exec(chunk);
    const to = /:to :state\/([a-z0-9-]+)/.exec(chunk);
    const actor = /:actor :actor\.role\/([a-z]+)/.exec(chunk);

    const atSource = extractAtSource(chunk);

    return {
      name,
      from: from ? from[1] : 'initial',
      to: to ? to[1] : null,
      // A transition has either an actor or an `:at` — never both. One is
      // somebody pressing a button, the other is Sharetribe's scheduler.
      actor: actor ? actor[1] : null,
      automatic: !!atSource,
      privileged: /:privileged\?\s+true/.test(chunk),
      actions: [...chunk.matchAll(/:name :action\/([a-z0-9-]+)/g)].map((m) => m[1]),
      at: atSource ? parseAtExpression(atSource) : null,
    };
  });

  const states = [...new Set(transitions.flatMap((t) => [t.from, t.to]).filter(Boolean))].sort();

  return { transitions, states };
};

module.exports = { parseProcessEdn, parseAtExpression, stripComments };
