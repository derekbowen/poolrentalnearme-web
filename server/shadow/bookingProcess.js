/**
 * Shadow model of `default-booking/release-1`.
 *
 * Pure: no network, no database, no Stripe, no clock of its own. Nothing here
 * executes a transition or mutates anything. It answers two questions about a
 * transaction, from the process definition:
 *
 *   1. what state is it in, given its transition history
 *   2. what would Sharetribe's scheduler fire next, and exactly when
 *
 * (2) is the reason this exists. Sharetribe runs a durable scheduler that fires
 * `expire-payment` 15 minutes after a payment is pending, `complete` two days
 * after a booking ends, and six more besides. PRNM has no equivalent anywhere.
 * A missed `complete` is a host who never gets paid, and that failure is silent.
 * Before replacing the engine we have to be able to compute its timing exactly,
 * and diff that against what Sharetribe actually did.
 *
 * The transition table in ./bookingProcess.data.json is generated from
 * ext/transaction-processes/default-booking/process.edn. The test re-parses that
 * .edn and asserts the table still matches, so the two cannot drift apart.
 */

const data = require('./bookingProcess.data.json');

const TRANSITIONS = data.transitions;
const STATES = data.states;
const PROCESS_ALIAS = data.processAlias;

/** name -> transition */
const BY_NAME = new Map(TRANSITIONS.map((t) => [t.name, t]));

/** state -> transitions leaving it */
const BY_FROM = TRANSITIONS.reduce((acc, t) => {
  (acc[t.from] = acc[t.from] || []).push(t);
  return acc;
}, {});

const INITIAL_STATE = 'initial';

/** States with no outgoing transition. A transaction here is finished. */
const TERMINAL_STATES = STATES.filter((s) => !(BY_FROM[s] || []).length);

// ─────────────────────────────────────────────────────────────────────────────
// ISO 8601 durations
// ─────────────────────────────────────────────────────────────────────────────

const DURATION_RE = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

/**
 * Parse the ISO 8601 durations this process uses: P3D, P6D, P1D, P2D, P7D, PT15M.
 *
 * Deliberately refuses years, months and weeks. Sharetribe's periods are exact
 * offsets, and a month is not a fixed number of milliseconds — silently picking
 * 30 days would produce a scheduler that drifts from the real one by days on
 * exactly the transitions where money moves. If a process ever adds one, this
 * must throw rather than guess.
 */
const parseDurationMs = (iso) => {
  const m = DURATION_RE.exec(String(iso));
  if (!m) {
    throw new Error(
      `Unsupported ISO 8601 duration "${iso}". Only day/hour/minute/second ` +
        'offsets are supported; years, months and weeks are not fixed-length.'
    );
  }
  const [, d, h, min, s] = m;
  const ms =
    (Number(d || 0) * 86400 + Number(h || 0) * 3600 + Number(min || 0) * 60 + Number(s || 0)) *
    1000;
  if (ms === 0 && iso !== 'P0D' && iso !== 'PT0S') {
    throw new Error(`Duration "${iso}" parsed to zero — probably malformed.`);
  }
  return ms;
};

// ─────────────────────────────────────────────────────────────────────────────
// Replay
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Walk a transition history and report the resulting state.
 *
 * Returns `{ ok, state, steps, error }` rather than throwing, because the point
 * of replaying real transactions is to FIND the histories this model cannot
 * explain. A throw would lose the partial walk that tells you where it broke.
 *
 * `steps` records the state after each transition, so a divergence can be
 * pinpointed to one step rather than just "ended up somewhere unexpected".
 *
 * @param {Array<string|{transition: string}>} history transition names, oldest first
 */
const replay = (history) => {
  const steps = [];
  let state = INITIAL_STATE;

  const names = (history || []).map((h) =>
    typeof h === 'string' ? h : h && (h.transition || h.name)
  );

  for (let idx = 0; idx < names.length; idx += 1) {
    const rawName = names[idx];
    if (!rawName) {
      return {
        ok: false,
        state,
        steps,
        error: { kind: 'malformed-entry', index: idx, transition: rawName },
      };
    }
    // Sharetribe returns fully-qualified names ("transition/accept"); the table
    // is keyed on the bare name. Accept either.
    const name = String(rawName).replace(/^transition\//, '');

    const t = BY_NAME.get(name);
    if (!t) {
      return {
        ok: false,
        state,
        steps,
        error: { kind: 'unknown-transition', index: idx, transition: name, from: state },
      };
    }
    if (t.from !== state) {
      return {
        ok: false,
        state,
        steps,
        error: {
          kind: 'illegal-transition',
          index: idx,
          transition: name,
          from: state,
          expectedFrom: t.from,
        },
      };
    }
    state = t.to;
    steps.push({ transition: name, state });
  }

  return { ok: true, state, steps, error: null };
};

/** Transitions legally available from a state, optionally filtered by actor. */
const availableTransitions = (state, actor = null) => {
  const out = BY_FROM[state] || [];
  return actor ? out.filter((t) => t.actor === actor) : out.slice();
};

const isTerminal = (state) => TERMINAL_STATES.includes(state);

// ─────────────────────────────────────────────────────────────────────────────
// The scheduler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate an `:at` expression to an epoch-millisecond instant.
 *
 * @param {object} expr parsed tree from processEdn.js
 * @param {object} ctx
 * @param {number} [ctx.bookingStart] epoch ms
 * @param {number} [ctx.bookingEnd] epoch ms
 * @param {Object<string, number>} [ctx.firstEnteredState] state -> epoch ms
 * @returns {number|null} null when a timepoint the expression needs is unknown
 */
const evaluateAt = (expr, ctx) => {
  if (!expr) return null;

  switch (expr.op) {
    case 'period':
      // A period is a duration, not an instant. It is only meaningful as the
      // second argument of `plus`, which handles it directly.
      return null;

    case 'timepoint': {
      if (expr.name === 'booking-start') return ctx.bookingStart ?? null;
      if (expr.name === 'booking-end') return ctx.bookingEnd ?? null;
      if (expr.name === 'first-entered-state') {
        const at = (ctx.firstEnteredState || {})[expr.state];
        return at ?? null;
      }
      throw new Error(`Unknown timepoint :time/${expr.name}`);
    }

    case 'plus': {
      // Periods are offsets; everything else is an instant. A `plus` with no
      // instant has nothing to offset from, so it has no answer.
      const offsetMs = expr.args
        .filter((a) => a.op === 'period')
        .reduce((sum, a) => sum + parseDurationMs(a.iso), 0);
      const instants = expr.args.filter((a) => a.op !== 'period').map((a) => evaluateAt(a, ctx));
      // An unknown timepoint makes the whole sum unknown; guessing would invent
      // a due time and this is the one place that must not happen.
      if (!instants.length || instants.some((v) => v === null)) return null;
      return instants.reduce((sum, v) => sum + v, 0) + offsetMs;
    }

    case 'min': {
      const values = expr.args.map((a) => evaluateAt(a, ctx));
      // `min` over a partially-known set is still wrong: the unknown arm could
      // be the earliest. Only answer when every arm is known.
      if (values.some((v) => v === null)) return null;
      return Math.min(...values);
    }

    default:
      throw new Error(`Unknown :at operator :fn/${expr.op}`);
  }
};

/**
 * What the scheduler has armed for a transaction in `state`, and when.
 *
 * At most one automatic transition leaves any state in this process, but the
 * shape is a list so a future process with several cannot silently lose one.
 *
 * @returns {Array<{transition: string, to: string, dueAt: number|null, actions: string[], reason: string|null}>}
 */
const scheduledTransitions = (state, ctx = {}) =>
  (BY_FROM[state] || [])
    .filter((t) => t.automatic)
    .map((t) => {
      let dueAt = null;
      let reason = null;
      try {
        dueAt = evaluateAt(t.at, ctx);
        if (dueAt === null) reason = 'missing-timepoint';
      } catch (e) {
        reason = e.message;
      }
      return { transition: t.name, to: t.to, dueAt, actions: t.actions, reason };
    });

/**
 * The single next scheduled fire for a transaction, or null.
 *
 * `now` is passed in rather than read from the clock so this stays pure and so
 * the shadow can be run against historical transactions.
 */
const nextScheduled = (state, ctx = {}) => {
  const due = scheduledTransitions(state, ctx).filter((d) => d.dueAt !== null);
  if (!due.length) return null;
  return due.reduce((a, b) => (b.dueAt < a.dueAt ? b : a));
};

/** True when `now` is at or past the armed transition's due time. */
const isOverdue = (scheduled, now) =>
  !!scheduled && scheduled.dueAt !== null && now >= scheduled.dueAt;

// ─────────────────────────────────────────────────────────────────────────────
// Actions (groundwork for the Stripe shadow — nothing here calls Stripe)
// ─────────────────────────────────────────────────────────────────────────────

/** Every action the process would run for a transition, in declared order. */
const actionsFor = (transitionName) => {
  const t = BY_NAME.get(String(transitionName).replace(/^transition\//, ''));
  return t ? t.actions.slice() : [];
};

/** Actions that move money. The C2 shadow will assert against exactly these. */
const STRIPE_ACTIONS = [
  'stripe-create-payment-intent',
  'stripe-confirm-payment-intent',
  'stripe-capture-payment-intent',
  'stripe-refund-payment',
  'stripe-create-payout',
];

const stripeActionsFor = (transitionName) =>
  actionsFor(transitionName).filter((a) => STRIPE_ACTIONS.includes(a));

module.exports = {
  PROCESS_ALIAS,
  TRANSITIONS,
  STATES,
  INITIAL_STATE,
  TERMINAL_STATES,
  STRIPE_ACTIONS,
  parseDurationMs,
  replay,
  availableTransitions,
  isTerminal,
  evaluateAt,
  scheduledTransitions,
  nextScheduled,
  isOverdue,
  actionsFor,
  stripeActionsFor,
};
