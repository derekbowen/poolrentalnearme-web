const fs = require('fs');
const path = require('path');
const { parseProcessEdn } = require('./processEdn');
const {
  PROCESS_ALIAS,
  TRANSITIONS,
  STATES,
  INITIAL_STATE,
  TERMINAL_STATES,
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
} = require('./bookingProcess');

const EDN_PATH = path.join(
  __dirname,
  '../../ext/transaction-processes/default-booking/process.edn'
);

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 6, 1, 12, 0, 0); // arbitrary fixed instant

// ─────────────────────────────────────────────────────────────────────────────

describe('fidelity: the committed table matches the process definition', () => {
  const parsed = parseProcessEdn(fs.readFileSync(EDN_PATH, 'utf8'));

  it('has the same transitions, in the same order, with identical fields', () => {
    // If this fails, either process.edn changed (re-run
    // `bun server/shadow/generate.js`) or the table was hand-edited.
    expect(TRANSITIONS).toEqual(parsed.transitions);
  });

  it('has the same states', () => {
    expect(STATES).toEqual(parsed.states);
  });

  it('covers the whole process: 31 transitions, 15 states', () => {
    // The audit said 38 transitions. It was wrong — that number came from
    // counting keys rather than the definition. 31 is what the process has.
    expect(TRANSITIONS).toHaveLength(31);
    expect(STATES).toHaveLength(15);
  });

  it('identifies exactly the 8 scheduler-driven transitions', () => {
    expect(
      TRANSITIONS.filter((t) => t.automatic)
        .map((t) => t.name)
        .sort()
    ).toEqual([
      'complete',
      'expire',
      'expire-customer-review-period',
      'expire-no-payment',
      'expire-offer',
      'expire-payment',
      'expire-provider-review-period',
      'expire-review-period',
    ]);
  });

  it('identifies the 5 privileged transitions', () => {
    expect(
      TRANSITIONS.filter((t) => t.privileged)
        .map((t) => t.name)
        .sort()
    ).toEqual([
      'accept-offer',
      'request',
      'request-after-inquiry',
      'request-payment',
      'request-payment-after-inquiry',
    ]);
  });

  it('never gives a transition both an actor and a timer', () => {
    // One is a person pressing a button, the other is Sharetribe's scheduler.
    TRANSITIONS.forEach((t) => {
      expect(t.automatic && !!t.actor).toBe(false);
      expect(t.automatic || !!t.actor).toBe(true);
    });
  });

  it('is the release the code elsewhere pins', () => {
    expect(PROCESS_ALIAS).toBe('default-booking/release-1');
  });
});

describe('graph shape', () => {
  it('every transition lands in a known state', () => {
    TRANSITIONS.forEach((t) => {
      expect(STATES).toContain(t.to);
      expect(STATES).toContain(t.from);
    });
  });

  it('only the initial state has no inbound transition', () => {
    const withInbound = new Set(TRANSITIONS.map((t) => t.to));
    const orphans = STATES.filter((s) => !withInbound.has(s));
    expect(orphans).toEqual([INITIAL_STATE]);
  });

  it('terminal states are the ones money and reviews come to rest in', () => {
    expect(TERMINAL_STATES.slice().sort()).toEqual([
      'cancelled',
      'declined',
      'expired',
      'payment-expired',
      'reviewed',
    ]);
  });

  it('every non-terminal state is reachable from initial', () => {
    const seen = new Set([INITIAL_STATE]);
    const queue = [INITIAL_STATE];
    while (queue.length) {
      const from = queue.shift();
      TRANSITIONS.filter((t) => t.from === from && !seen.has(t.to)).forEach((t) => {
        seen.add(t.to);
        queue.push(t.to);
      });
    }
    expect(STATES.filter((s) => !seen.has(s))).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('replay', () => {
  it('an empty history is the initial state', () => {
    expect(replay([])).toMatchObject({ ok: true, state: 'initial' });
    expect(replay(null)).toMatchObject({ ok: true, state: 'initial' });
  });

  it('walks the ordinary paid booking path', () => {
    const r = replay(['request-payment', 'confirm-payment', 'accept', 'complete']);
    expect(r.ok).toBe(true);
    expect(r.state).toBe('delivered');
    expect(r.steps.map((s) => s.state)).toEqual([
      'pending-payment',
      'preauthorized',
      'accepted',
      'delivered',
    ]);
  });

  it('walks the inquiry → offer → booking path', () => {
    const r = replay(['inquire', 'send-offer', 'accept-offer', 'confirm-payment', 'accept']);
    expect(r.ok).toBe(true);
    expect(r.state).toBe('accepted');
  });

  it('walks through to both reviews', () => {
    const r = replay([
      'request-payment',
      'confirm-payment',
      'accept',
      'complete',
      'review-1-by-customer',
      'review-2-by-provider',
    ]);
    expect(r.state).toBe('reviewed');
    expect(isTerminal(r.state)).toBe(true);
  });

  it('accepts fully-qualified names as Sharetribe returns them', () => {
    expect(replay(['transition/request-payment', 'transition/confirm-payment']).state).toBe(
      'preauthorized'
    );
  });

  it('accepts objects with a transition field, as st_transactions stores them', () => {
    const r = replay([{ transition: 'request-payment' }, { transition: 'confirm-payment' }]);
    expect(r.state).toBe('preauthorized');
  });

  it('reports an unknown transition without throwing, keeping the partial walk', () => {
    const r = replay(['request-payment', 'teleport', 'accept']);
    expect(r.ok).toBe(false);
    expect(r.error).toMatchObject({ kind: 'unknown-transition', index: 1, transition: 'teleport' });
    expect(r.state).toBe('pending-payment');
    expect(r.steps).toHaveLength(1);
  });

  it('reports an illegal transition and says what state it expected', () => {
    const r = replay(['request-payment', 'accept']);
    expect(r.ok).toBe(false);
    expect(r.error).toMatchObject({
      kind: 'illegal-transition',
      index: 1,
      transition: 'accept',
      from: 'pending-payment',
      expectedFrom: 'preauthorized',
    });
  });

  it('reports a malformed entry rather than crashing on real data', () => {
    expect(replay(['request-payment', null]).error).toMatchObject({ kind: 'malformed-entry' });
    expect(replay([{}]).error).toMatchObject({ kind: 'malformed-entry' });
  });

  it('refuses a second transition out of a terminal state', () => {
    const r = replay(['request-payment', 'expire-payment', 'confirm-payment']);
    expect(r.ok).toBe(false);
    expect(r.state).toBe('payment-expired');
  });
});

describe('availableTransitions', () => {
  it('lists what a provider can do with a preauthorized booking', () => {
    expect(
      availableTransitions('preauthorized', 'provider')
        .map((t) => t.name)
        .sort()
    ).toEqual(['accept', 'decline']);
  });

  it('lists the operator overrides separately', () => {
    expect(
      availableTransitions('preauthorized', 'operator')
        .map((t) => t.name)
        .sort()
    ).toEqual(['operator-accept', 'operator-decline']);
  });

  it('returns nothing for a terminal state', () => {
    TERMINAL_STATES.forEach((s) => expect(availableTransitions(s)).toEqual([]));
  });

  it('does not leak the internal table to callers', () => {
    // accept, operator-accept, decline, operator-decline, expire
    availableTransitions('preauthorized').push('nonsense');
    expect(availableTransitions('preauthorized')).toHaveLength(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('ISO 8601 durations', () => {
  it('parses every period this process uses', () => {
    expect(parseDurationMs('PT15M')).toBe(15 * 60 * 1000);
    expect(parseDurationMs('P1D')).toBe(DAY);
    expect(parseDurationMs('P2D')).toBe(2 * DAY);
    expect(parseDurationMs('P3D')).toBe(3 * DAY);
    expect(parseDurationMs('P6D')).toBe(6 * DAY);
    expect(parseDurationMs('P7D')).toBe(7 * DAY);
  });

  it('parses combined day/time forms', () => {
    expect(parseDurationMs('P1DT2H30M')).toBe(DAY + 2 * HOUR + 30 * 60 * 1000);
  });

  it('refuses months and years rather than guessing a length', () => {
    // Silently treating a month as 30 days would drift the scheduler by days on
    // exactly the transitions where money moves.
    expect(() => parseDurationMs('P1M')).toThrow(/not fixed-length/);
    expect(() => parseDurationMs('P1Y')).toThrow(/not fixed-length/);
    expect(() => parseDurationMs('P2W')).toThrow(/not fixed-length/);
  });

  it('refuses malformed input', () => {
    expect(() => parseDurationMs('')).toThrow();
    expect(() => parseDurationMs('3D')).toThrow();
    expect(() => parseDurationMs(null)).toThrow();
  });

  it('every period in the table parses', () => {
    const periods = [];
    const walk = (e) => {
      if (!e) return;
      if (e.op === 'period') periods.push(e.iso);
      (e.args || []).forEach(walk);
    };
    TRANSITIONS.forEach((t) => walk(t.at));
    expect(periods.length).toBeGreaterThan(0);
    periods.forEach((p) => expect(() => parseDurationMs(p)).not.toThrow());
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('scheduler — the part PRNM has no equivalent for', () => {
  const ctx = {
    bookingStart: T0 + 10 * DAY,
    bookingEnd: T0 + 10 * DAY + 4 * HOUR,
    firstEnteredState: {
      'pending-payment': T0,
      'offer-sent': T0,
      requested: T0,
      preauthorized: T0,
    },
  };

  it('expires an unpaid booking 15 minutes after it enters pending-payment', () => {
    const s = nextScheduled('pending-payment', ctx);
    expect(s.transition).toBe('expire-payment');
    expect(s.dueAt).toBe(T0 + 15 * 60 * 1000);
  });

  it('expires an unanswered offer 3 days in', () => {
    const s = nextScheduled('offer-sent', ctx);
    expect(s.transition).toBe('expire-offer');
    expect(s.dueAt).toBe(T0 + 3 * DAY);
  });

  it('completes a booking 2 days after it ends — this is what releases the payout', () => {
    const s = nextScheduled('accepted', ctx);
    expect(s.transition).toBe('complete');
    expect(s.dueAt).toBe(ctx.bookingEnd + 2 * DAY);
    expect(s.actions).toContain('stripe-create-payout');
  });

  it('closes the review window 7 days after the booking ends', () => {
    ['delivered', 'reviewed-by-customer', 'reviewed-by-provider'].forEach((state) => {
      expect(nextScheduled(state, ctx).dueAt).toBe(ctx.bookingEnd + 7 * DAY);
    });
  });

  it('expiry takes the EARLIEST of three deadlines, not a flat 6 days', () => {
    // min(entered + P6D, bookingStart + P1D, bookingEnd). With a booking 10 days
    // out, the 6-day arm wins.
    const s = nextScheduled('preauthorized', ctx);
    expect(s.transition).toBe('expire');
    expect(s.dueAt).toBe(T0 + 6 * DAY);
  });

  it('a booking starting tomorrow expires at booking end, not on a day count', () => {
    // The audit described this as "P3D after request". It is neither that nor a
    // flat 6 days: for a soon booking the bookingEnd arm wins.
    const soon = {
      bookingStart: T0 + 12 * HOUR,
      bookingEnd: T0 + 12 * HOUR + 3 * HOUR,
      firstEnteredState: { preauthorized: T0 },
    };
    expect(nextScheduled('preauthorized', soon).dueAt).toBe(soon.bookingEnd);
  });

  it('the bookingStart + P1D arm is unreachable for every booking PRNM sells', () => {
    // min(entered + P6D, bookingStart + P1D, bookingEnd). bookingEnd beats
    // bookingStart + P1D for any booking shorter than 24 hours, and the only
    // listing type in production is hourly-pool / unitType hour. So in practice
    // the rule is min(entered + P6D, bookingEnd) and the middle arm is dead.
    // It would only bite if a multi-day unit type were ever configured.
    const fourHours = {
      bookingStart: T0 + 5 * DAY,
      bookingEnd: T0 + 5 * DAY + 4 * HOUR,
      firstEnteredState: { preauthorized: T0 },
    };
    expect(nextScheduled('preauthorized', fourHours).dueAt).toBe(fourHours.bookingEnd);
    expect(nextScheduled('preauthorized', fourHours).dueAt).toBeLessThan(
      fourHours.bookingStart + DAY
    );

    // A hypothetical 48-hour booking is the only shape where it wins.
    const twoDays = {
      bookingStart: T0 + DAY,
      bookingEnd: T0 + 3 * DAY,
      firstEnteredState: { preauthorized: T0 },
    };
    expect(nextScheduled('preauthorized', twoDays).dueAt).toBe(twoDays.bookingStart + DAY);
  });

  it('a booking already under way expires at booking end', () => {
    const started = {
      bookingStart: T0 - 2 * HOUR,
      bookingEnd: T0 + HOUR,
      firstEnteredState: { preauthorized: T0 - 3 * HOUR },
    };
    expect(nextScheduled('preauthorized', started).dueAt).toBe(started.bookingEnd);
  });

  it('applies the same three-way rule to an unpaid request', () => {
    expect(nextScheduled('requested', ctx).dueAt).toBe(T0 + 6 * DAY);
  });

  it('arms nothing in a terminal state', () => {
    TERMINAL_STATES.forEach((s) => {
      expect(scheduledTransitions(s, ctx)).toEqual([]);
      expect(nextScheduled(s, ctx)).toBeNull();
    });
  });

  it('arms nothing in a state that only a human can leave', () => {
    expect(scheduledTransitions('inquiry', ctx)).toEqual([]);
  });

  it('returns null — never a guess — when a needed timepoint is missing', () => {
    // An invented due time is the one failure mode that must not happen: it
    // would fire a payout or an expiry at the wrong moment.
    const s = scheduledTransitions('accepted', { firstEnteredState: {} })[0];
    expect(s.dueAt).toBeNull();
    expect(s.reason).toBe('missing-timepoint');
  });

  it('will not answer a min() when any arm is unknown', () => {
    // The unknown arm could be the earliest, so a partial answer is a wrong one.
    const s = scheduledTransitions('preauthorized', {
      bookingStart: T0 + DAY,
      firstEnteredState: { preauthorized: T0 },
      // bookingEnd missing
    })[0];
    expect(s.dueAt).toBeNull();
  });

  it('isOverdue compares against a caller-supplied clock', () => {
    const s = nextScheduled('pending-payment', ctx);
    expect(isOverdue(s, s.dueAt - 1)).toBe(false);
    expect(isOverdue(s, s.dueAt)).toBe(true);
    expect(isOverdue(s, s.dueAt + 1)).toBe(true);
    expect(isOverdue(null, Date.now())).toBe(false);
  });

  it('every scheduled transition in the table evaluates with a full context', () => {
    const full = {
      bookingStart: T0 + 5 * DAY,
      bookingEnd: T0 + 5 * DAY + 2 * HOUR,
      firstEnteredState: Object.fromEntries(STATES.map((s) => [s, T0])),
    };
    TRANSITIONS.filter((x) => x.automatic).forEach((t) => {
      const due = evaluateAt(t.at, full);
      expect(typeof due).toBe('number');
      expect(Number.isFinite(due)).toBe(true);
    });
  });
});

describe('evaluateAt', () => {
  const ctx = { bookingStart: T0, bookingEnd: T0 + HOUR, firstEnteredState: { accepted: T0 } };

  it('resolves the three timepoint kinds', () => {
    expect(evaluateAt({ op: 'timepoint', name: 'booking-start', state: null }, ctx)).toBe(T0);
    expect(evaluateAt({ op: 'timepoint', name: 'booking-end', state: null }, ctx)).toBe(T0 + HOUR);
    expect(
      evaluateAt({ op: 'timepoint', name: 'first-entered-state', state: 'accepted' }, ctx)
    ).toBe(T0);
  });

  it('throws on an unknown timepoint or operator rather than returning a plausible number', () => {
    expect(() => evaluateAt({ op: 'timepoint', name: 'moon-phase' }, ctx)).toThrow(/timepoint/);
    expect(() => evaluateAt({ op: 'wat', args: [] }, ctx)).toThrow(/operator/);
  });

  it('a bare period has no instant of its own', () => {
    expect(evaluateAt({ op: 'period', iso: 'P1D' }, ctx)).toBeNull();
  });

  it('handles a null expression', () => {
    expect(evaluateAt(null, ctx)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('actions — groundwork for the Stripe shadow', () => {
  it('reports actions in declared order, which is the order they run', () => {
    expect(actionsFor('request-payment')).toEqual([
      'update-protected-data',
      'create-pending-booking',
      'privileged-set-line-items',
      'stripe-create-payment-intent',
    ]);
  });

  it('keeps decline-booking last, as the definition insists', () => {
    // process.edn carries an explicit comment: "Keep this action last".
    ['decline', 'operator-decline', 'expire', 'expire-payment'].forEach((name) => {
      const a = actionsFor(name);
      expect(a[a.length - 1]).toBe('decline-booking');
    });
  });

  it('names the money-moving actions per transition', () => {
    expect(stripeActionsFor('accept')).toEqual(['stripe-capture-payment-intent']);
    expect(stripeActionsFor('complete')).toEqual(['stripe-create-payout']);
    expect(stripeActionsFor('decline')).toEqual(['stripe-refund-payment']);
    expect(stripeActionsFor('accept-with-payment')).toEqual([
      'stripe-create-payment-intent',
      'stripe-capture-payment-intent',
    ]);
  });

  it('finds no Stripe action on the purely informational transitions', () => {
    ['inquire', 'send-offer', 'review-1-by-customer', 'expire-review-period'].forEach((n) => {
      expect(stripeActionsFor(n)).toEqual([]);
    });
  });

  it('accepts a fully-qualified name', () => {
    expect(actionsFor('transition/accept')).toEqual([
      'accept-booking',
      'stripe-capture-payment-intent',
    ]);
  });

  it('returns empty for an unknown transition instead of throwing', () => {
    expect(actionsFor('nope')).toEqual([]);
    expect(stripeActionsFor('nope')).toEqual([]);
  });

  it('every payout in the process is guarded by a completed booking', () => {
    // A payout must never be reachable from a state where the booking has not
    // been delivered. If this ever fails, money can leave before the service.
    const payoutTransitions = TRANSITIONS.filter((t) => t.actions.includes('stripe-create-payout'));
    expect(payoutTransitions.map((t) => t.name).sort()).toEqual(['complete', 'operator-complete']);
    payoutTransitions.forEach((t) => expect(t.from).toBe('accepted'));
  });

  it('every refund is paired with the full-refund calculation', () => {
    TRANSITIONS.filter((x) => x.actions.includes('stripe-refund-payment')).forEach((t) => {
      expect(t.actions).toContain('calculate-full-refund');
      expect(t.actions.indexOf('calculate-full-refund')).toBeLessThan(
        t.actions.indexOf('stripe-refund-payment')
      );
    });
  });
});
