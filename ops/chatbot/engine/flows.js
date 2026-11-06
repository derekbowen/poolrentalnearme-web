'use strict';
/**
 * The conversation engine. Pure: given the remembered state and one customer
 * input, it returns the new state plus a list of actions for the executor
 * (bot.js) to carry out against Chatwoot. No I/O happens here, so every flow
 * is unit-testable.
 *
 * Actions:
 *   { type: 'say', content }                    public text message
 *   { type: 'select', content, items }          public message with buttons (free typing still works)
 *   { type: 'note', content }                   private note (customers never see it)
 *   { type: 'escalate' }                        run the Chatwoot handoff (handoff.js), then call afterEscalation()
 *
 * Events (for tracking.js): answered, clarify, unmatched, handoff, escalated,
 * escalation_failed, card_warning, password_warning, role_set, cancelled_handoff.
 */
const { Matcher, roleOfCategory, THRESHOLDS } = require('./matcher');
const safety = require('./safety');
const { correctedText, clean } = require('./normalize');
const { COPY, LINE_911, handoffConfirmed, handoffFailed, calm } = require('./copy');

const SAFETY_VOCAB = [
  'drowning',
  'drowned',
  'injured',
  'injury',
  'bleeding',
  'unconscious',
  'ambulance',
  'emergency',
  'accident',
  'harassed',
  'harassment',
  'threatened',
  'assaulted',
  'inappropriate',
  'aggressive',
  'dangerous',
  'unsafe',
  'hazard',
  'damaged',
  'damage',
  'vandalism',
  'insurance',
  'liability',
  'coverage',
  'covered',
  'lawsuit',
  'scam',
  'scammer',
  'fraud',
  'phishing',
  'chargeback',
  'dispute',
  'refund',
  'overcharged',
  'locked',
  'deposit',
  'waiver',
  'seizure',
  'hospital',
  'medical',
  'guarantee',
];

const SAFETY_TARGETS = new Set(SAFETY_VOCAB);

// Rule 8 topics: Derek answers. Brandon is notified too, the note says so.
const RULE8_ENTRIES = new Set([
  'safety-insurance',
  'safety-damage',
  'safety-injury',
  'rules-waiver',
]);
const BOOKING_CATEGORIES = new Set(['booking', 'cancellations and changes', 'arrival and access']);
const INFER_ROLE_CATEGORIES = new Set([
  'booking',
  'cancellations and changes',
  'arrival and access',
  'creating a host listing',
  'host pricing and calendars',
  'payouts',
]);
const CATEGORY_SLUG = {
  booking: 'booking',
  'prices and payments': 'payments',
  'cancellations and changes': 'cancellations',
  'pool rules and amenities': 'rules',
  'arrival and access': 'arrival',
  'safety, disputes, and human help': 'safety',
  'creating a host listing': 'host-listing',
  'host pricing and calendars': 'host-pricing',
  payouts: 'payouts',
  'accounts and technical problems': 'account',
};

const MAX_HISTORY = 12;
const MAX_ESCALATION_TRIES = 5;

function newState(convId = null, now = Date.now()) {
  return {
    v: 1,
    convId,
    greeted: false,
    role: null,
    topic: null,
    entryIds: [],
    tried: [],
    misses: [],
    bookingRef: null,
    bookingRefDeclined: false,
    replyMethod: null,
    email: null,
    emailTries: 0,
    replyTries: 0,
    attempts: 0,
    clarifiedOnce: false,
    awaiting: null,
    lastAnswerId: null,
    lastQuestion: null,
    handoff: null,
    humanOwned: false,
    history: [],
    createdAt: now,
    updatedAt: now,
  };
}

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

function mentionsBooking(text) {
  return /\b(book|booking|bookings|booked|reservation|reserved|order|swim|cancel\w*|refund\w*|charge\w*|payout\w*|paid|request\w*|host accepted|guest)\b/i.test(
    String(text || '')
  );
}

function explicitRole(text) {
  const s = clean(text);
  if (
    /\b(i am|im|i m) (a |the )?(host|pool owner|homeowner with a pool)\b|\bas a host\b|\bi (host|list|rent out) (my )?pool\b|\bmy listings?\b/.test(
      s
    )
  )
    return 'host';
  if (
    /\b(i am|im|i m) (a |the )?(guest|swimmer|renter|customer)\b|\bas a (guest|swimmer|renter)\b|\bi (booked|want to book|am booking)\b/.test(
      s
    )
  )
    return 'swimmer';
  return null;
}

const GREETING_ONLY =
  /^(hi|hey|hello|hiya|howdy|yo|sup|heya|hola|good (morning|afternoon|evening)|whats up|wassup|hey there|hi there|hello there|greetings|help|hi help|hey help|start|menu|\?+)$/;
const THANKS =
  /^(thanks|thank you|thank u|thx|ty|tysm|cheers|appreciate it|much appreciated|thanks so much|thank you so much|awesome thanks|great thanks|perfect thanks|cool thanks|ok thanks|okay thanks|got it thanks)\b/;
const BYE = /^(bye|goodbye|good bye|see ya|see you|later|cya|have a good (one|day|night)|peace)\b/;
const ACK =
  /^(ok|okay|k|kk|cool|got it|great|perfect|awesome|nice|sweet|sounds good|alright|all right|makes sense|understood|gotcha)$/;
const CANCEL_HANDOFF =
  /^(never ?mind|nvm|forget it|cancel that|all good|im good|i am good|its fine|it is fine|dont worry about it)$/;

class Engine {
  /**
   * @param {object} opts
   * @param {Array}  opts.bank     entries.json
   * @param {object} opts.routes   routes.json
   * @param {string} [opts.siteUrl]  absolute base for bank links
   */
  constructor({ bank, routes, siteUrl = 'https://www.poolrentalnearme.com' }) {
    this.bank = bank;
    this.routes = routes || {};
    this.byId = new Map(bank.map((e) => [e.id, e]));
    this.matcher = new Matcher(bank, { extraVocab: SAFETY_VOCAB });
    this.siteUrl = siteUrl.replace(/\/+$/, '');
    this.checkRoutes();
  }

  checkRoutes() {
    const bad = [];
    const need = (id) => {
      if (!this.byId.has(id)) bad.push(id);
    };
    const starters = this.routes.starters || {};
    for (const list of Object.values(starters)) {
      for (const b of list) if (b.value.startsWith('entry:')) need(b.value.slice(6));
    }
    for (const [id, opts] of Object.entries(this.routes.clarify_routes || {})) {
      need(id);
      const e = this.byId.get(id);
      if (e && opts.length !== (e.clarify_options || []).length)
        bad.push(
          `${id} (clarify_routes has ${opts.length} routes for ${(e.clarify_options || []).length} options)`
        );
      for (const r of opts) if (r.entry) need(r.entry);
    }
    for (const [id, f] of Object.entries(this.routes.followups || {})) {
      need(id);
      if (f.yes && f.yes.entry) need(f.yes.entry);
    }
    for (const r of safety.RULES) {
      if (r.route && !r.route.startsWith('builtin:')) need(r.route);
      if (
        r.route &&
        r.route.startsWith('builtin:') &&
        !(this.routes.builtin || {})[r.route.slice(8)]
      )
        bad.push(r.route);
      for (const x of r.routes || []) need(x);
    }
    if (!this.byId.has('human-talk-to-person')) bad.push('human-talk-to-person');
    if (bad.length)
      throw new Error(`routes.json / safety rules point at unknown entries: ${bad.join(', ')}`);
  }

  // ------------------------------------------------------------------ helpers
  abs(link) {
    if (!link) return '';
    if (/^https?:\/\//.test(link)) return link;
    return `${this.siteUrl}${link.startsWith('/') ? '' : '/'}${link}`;
  }

  format(entry, st, text = entry.answer) {
    let s = st.mood === 'upset' ? calm(text) : text;
    if (entry.link) s += `\n\n${this.abs(entry.link)}`;
    return s;
  }

  /** Remove the trailing question of a bank answer when we already know the answer to it. */
  stripKnownAsks(answer, st) {
    let a = answer;
    if (st.bookingRef || st.bookingRefDeclined) {
      a = a
        .replace(/\s*What's (your|the) booking reference(, if you have one)?\?\s*$/, '')
        .replace(
          /\s*(Is this for a booking you already have|Is this about a specific booking)\?\s*$/,
          ''
        );
    }
    if (st.replyMethod) a = a.replace(/\s*Want them to reply here in chat or by email\?\s*$/, '');
    return a.trim();
  }

  slotAskedBy(answer) {
    if (/What's (your|the) booking reference(, if you have one)?\?\s*$/.test(answer))
      return 'booking_ref';
    if (
      /(Is this for a booking you already have|Is this about a specific booking)\?\s*$/.test(answer)
    )
      return 'booking_ref_yesno';
    if (/reply here in chat or by email\?\s*$/.test(answer)) return 'reply_method';
    if (/What's it about, so they don't have to ask you again\?\s*$/.test(answer))
      return 'question';
    if (/(Tell me what you were trying to do|tell me what the message said)/.test(answer))
      return 'detail';
    return null;
  }

  /** Closest bank entry for a free-text question (for labels and the note only; never sent to the customer). */
  closest(text, st) {
    if (!text) return null;
    const m = this.matcher.match(text, { role: st.role, topic: null });
    if (!m.top || m.top.score < THRESHOLDS.CLARIFY) return null;
    const e = this.byId.get(m.top.id);
    return { id: e.id, category: e.category, score: round(m.top.score) };
  }

  /** Fill in category / booking-ref relevance for a handoff whose question we only just learned. */
  enrichHandoff(st, h) {
    const near = this.closest(h.question, st);
    if (!near) return;
    h.closest = near;
    if (!h.category || h.category === 'safety, disputes, and human help')
      h.category = near.category;
    const strong = near.score >= THRESHOLDS.CONFIDENT;
    if (
      strong &&
      !h.bookingRefAsked &&
      (BOOKING_CATEGORIES.has(near.category) || near.id === 'payouts-04')
    )
      h.needBookingRef = true;
  }

  pushHistory(st, from, text) {
    st.history.push({ from, text: safety.redactForLog(text, 400) });
    if (st.history.length > MAX_HISTORY) st.history.splice(0, st.history.length - MAX_HISTORY);
  }

  // ------------------------------------------------------------------ entry points
  /**
   * @param {object|null} prevState
   * @param {{kind:'text', text, messageId?, attachments?} | {kind:'button', value, title?, messageId?}} input
   * @param {{now?: number}} [ctx]
   */
  handle(prevState, input, ctx = {}) {
    const st = prevState ? clone(prevState) : newState(null, ctx.now || Date.now());
    st.updatedAt = ctx.now || Date.now();
    const turn = new Turn();
    // A person owns the conversation now: the assistant stays silent.
    if (st.humanOwned || (st.handoff && st.handoff.status === 'sent')) return turn.result(st);

    if (input.kind === 'button') {
      st.mood = 'neutral';
      this.onButton(st, input, turn);
    } else {
      this.onText(st, input, turn);
    }
    this.finish(st, turn);
    return turn.result(st);
  }

  onText(st, input, turn) {
    const raw = String(input.text || '').trim();
    if (!raw) {
      if (input.attachments) turn.say(COPY.attachmentOnly);
      return;
    }
    const sens = safety.scanSensitive(raw);
    const text = sens.text;
    if (sens.cards || sens.cvv) {
      turn.say(COPY.cardWarning);
      turn.note(
        `Possible card details in customer message${input.messageId ? ` #${input.messageId}` : ''}. The assistant did not repeat them. Please delete that message.`
      );
      turn.log('card_warning', {});
    }
    if (sens.passwords) {
      turn.say(COPY.passwordWarning);
      turn.note(
        `A customer message${input.messageId ? ` (#${input.messageId})` : ''} looked like it contained a password. The assistant did not repeat it. Please delete that message.`
      );
      turn.log('password_warning', {});
    }
    this.pushHistory(st, 'customer', text);
    st.mood = safety.mood(raw);

    // Remember what they already told us.
    const ref = safety.findBookingRef(text);
    if (ref) st.bookingRef = ref;
    const email = safety.findEmail(text);
    if (email) st.email = email;
    const role = explicitRole(text);
    if (role && role !== st.role) {
      st.role = role;
      turn.log('role_set', { role, via: 'text' });
    }

    // Only the redacted remainder is left?
    if (sens.found && !clean(text.replace(/\[[a-z ]+ removed\]/g, ''))) return;

    const guard = safety.detectGuards(
      text,
      correctedText(text, this.matcher.speller, SAFETY_TARGETS)
    );
    const retrying = st.handoff && st.handoff.status === 'failed';
    if (guard && guard.kind === 'urgent' && !(retrying && st.handoff.urgency === 'high'))
      return this.startUrgent(st, guard, text, turn);

    // A previous handoff failed: try again with whatever they just added.
    if (retrying) {
      st.handoff.extra.push(text);
      return this.escalate(st, turn);
    }

    if (
      st.handoff &&
      st.handoff.status === 'collecting' &&
      st.awaiting &&
      st.awaiting.kind === 'slot'
    ) {
      return this.fillSlot(st, text, turn);
    }
    if (safety.wantsHuman(text)) return this.startFounder(st, text, turn);
    if (guard && guard.kind === 'handoff') {
      return this.startRouteHandoff(st, guard.route, text, turn, {
        topics: guard.topics,
        rule8: guard.rule8,
      });
    }
    if (guard && guard.kind === 'clarify') {
      st.awaiting = { kind: 'guard', routes: guard.routes, text };
      turn.select(
        guard.prompt,
        guard.routes.map((r, i) => ({ title: guard.titles[i], value: `entry:${r}` }))
      );
      turn.log('clarify', { kind: 'guard', candidates: guard.routes.map((id) => ({ id })) });
      return;
    }
    const plain = text
      .replace(/\[[a-z ]+ removed\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (st.awaiting && this.onTypedReply(st, plain, turn)) return;
    if (this.smallTalk(st, plain, turn)) return;
    st.lastQuestion = text;
    return this.answerOrClarify(st, plain, turn);
  }

  onButton(st, input, turn) {
    const v = String(input.value || '');
    const awaiting = st.awaiting;
    if (v.startsWith('role:')) {
      const role = v.slice(5) === 'host' ? 'host' : 'swimmer';
      st.role = role;
      turn.log('role_set', { role, via: 'button' });
      if (awaiting && awaiting.kind === 'role' && awaiting.text) {
        st.awaiting = null;
        return this.answerOrClarify(st, awaiting.text, turn);
      }
      st.awaiting = null;
      const starters = (this.routes.starters || {})[role] || [];
      return turn.select(role === 'host' ? COPY.roleHost : COPY.roleSwimmer, starters);
    }
    if (v === 'founder') return this.startFounder(st, '', turn);
    if (v.startsWith('entry:')) {
      const e = this.byId.get(v.slice(6));
      if (!e) return;
      if (st.handoff && st.handoff.status === 'collecting') st.handoff = null;
      const title = input.title || e.question;
      // keep their own words when the tap answers our clarifying question
      const text = awaiting && awaiting.text ? `${awaiting.text} → ${title}` : title;
      return this.answerEntry(st, e, turn, { via: 'button', score: 1, text });
    }
    if (v === 'other') {
      turn.log('clarify_rejected', {});
      return this.miss(st, (awaiting && awaiting.text) || '', turn, null, { fromClarify: true });
    }
    if (v.startsWith('route:')) {
      const parts = v.split(':');
      return this.followClarifyRoute(st, parts[1], Number(parts[2]), turn);
    }
    if (v.startsWith('yes:') || v.startsWith('no:')) {
      return this.followup(
        st,
        v.slice(v.indexOf(':') + 1),
        v.startsWith('yes:') ? 'yes' : 'no',
        turn
      );
    }
    if (v === 'ref:none') {
      if (!st.handoff || st.handoff.status !== 'collecting') return;
      st.bookingRefDeclined = true;
      return this.nextSlot(st, turn);
    }
    if (v === 'reply:chat' || v === 'reply:email') {
      if (!st.handoff || st.handoff.status !== 'collecting') return;
      st.replyMethod = v === 'reply:email' ? 'email' : 'chat';
      return this.nextSlot(st, turn);
    }
  }

  // ------------------------------------------------------------------ matching
  answerOrClarify(st, text, turn) {
    const m = this.matcher.match(text, { role: st.role, topic: st.topic });
    if (m.status === 'confident') {
      return this.answerEntry(st, this.byId.get(m.top.id), turn, {
        via: 'match',
        score: m.top.score,
        text,
      });
    }
    if (m.status === 'ambiguous') {
      if (m.needsRole) {
        st.awaiting = { kind: 'role', text };
        turn.select(COPY.askRole, COPY.roleButtons);
        turn.log('clarify', {
          kind: 'role',
          candidates: m.candidates.map((c) => ({ id: c.id, score: round(c.score) })),
        });
        return;
      }
      if (st.clarifiedOnce) return this.miss(st, text, turn, m);
      st.clarifiedOnce = true;
      const opts = m.candidates.slice(0, 3);
      st.awaiting = { kind: 'disambiguate', options: opts.map((o) => o.id), text };
      turn.select(COPY.disambiguate, [
        ...opts.map((o) => ({ title: this.byId.get(o.id).question, value: `entry:${o.id}` })),
        { title: COPY.somethingElse, value: 'other' },
      ]);
      turn.log('clarify', {
        kind: 'disambiguate',
        text: safety.redactForLog(text),
        candidates: opts.map((c) => ({ id: c.id, score: round(c.score) })),
      });
      return;
    }
    return this.miss(st, text, turn, m);
  }

  miss(st, text, turn, m, { fromClarify = false } = {}) {
    st.attempts += 1;
    if (text) st.misses.push(safety.redactForLog(text, 300));
    st.awaiting = null;
    turn.log('unmatched', {
      text: safety.redactForLog(text),
      best: m && m.top ? { id: m.top.id, score: round(m.top.score) } : null,
      attempt: st.attempts,
      from_clarify: fromClarify,
    });
    if (st.attempts >= 2) {
      const question = st.misses.filter(Boolean).join(' / ') || null;
      return this.startHandoff(st, turn, {
        reason: 'two_unmatched',
        question,
        lead: COPY.twoStrikes,
        needBookingRef: mentionsBooking(question),
      });
    }
    if (fromClarify) return turn.say(COPY.rephrase);
    turn.select(COPY.firstMiss, [COPY.founderButton]);
  }

  answerEntry(st, entry, turn, meta = {}) {
    st.attempts = 0;
    st.clarifiedOnce = false;
    st.awaiting = null;
    st.misses = [];
    st.topic = entry.category;
    if (!st.role && INFER_ROLE_CATEGORIES.has(entry.category)) {
      st.role = roleOfCategory(entry.category);
      turn.log('role_set', { role: st.role, via: 'inferred' });
    }
    st.tried.push({
      id: entry.id,
      score: round(meta.score == null ? 1 : meta.score),
      via: meta.via || 'match',
    });
    if (st.tried.length > 10) st.tried.splice(0, st.tried.length - 10);
    if (!st.entryIds.includes(entry.id)) st.entryIds.push(entry.id);
    turn.log('answered', {
      entry: entry.id,
      score: round(meta.score == null ? 1 : meta.score),
      mode: entry.mode,
      via: meta.via || 'match',
    });

    if (entry.mode === 'handoff') return this.startEntryHandoff(st, entry, turn, meta);
    if (entry.mode === 'clarify') return this.askEntryClarify(st, entry, turn);
    turn.say(this.format(entry, st));
    st.lastAnswerId = entry.id;
    if (this.followupRoute(entry)) st.awaiting = { kind: 'followup', entryId: entry.id };
  }

  askEntryClarify(st, entry, turn) {
    const items = (entry.clarify_options || []).map((t, i) => ({
      title: t,
      value: `route:${entry.id}:${i}`,
    }));
    let content;
    if ((this.routes.clarify_first || []).includes(entry.id)) content = entry.clarify_prompt;
    else if (entry.answer.includes(entry.clarify_prompt)) content = entry.answer;
    else content = `${entry.answer} ${entry.clarify_prompt}`;
    if (st.mood === 'upset') content = calm(content);
    st.awaiting = { kind: 'clarify-entry', entryId: entry.id };
    turn.select(content, items);
  }

  followClarifyRoute(st, entryId, idx, turn) {
    const entry = this.byId.get(entryId);
    const route = ((this.routes.clarify_routes || {})[entryId] || [])[idx];
    if (!entry || !route) return;
    const option = (entry.clarify_options || [])[idx] || '';
    turn.log('clarify_choice', { entry: entryId, option: idx });
    if (route.entry)
      return this.answerEntry(st, this.byId.get(route.entry), turn, {
        via: 'clarify',
        score: 1,
        text: option,
      });
    if (route.say) {
      st.awaiting = null;
      st.attempts = 0;
      return turn.say(route.link ? `${route.say}\n\n${this.abs(route.link)}` : route.say);
    }
    if (route.handoff) {
      const h = route.handoff;
      const context = `${entry.question} → ${option}`;
      if (h.use_entry_answer) {
        return this.startEntryHandoff(st, entry, turn, {
          reason: 'clarify_route',
          text: st.lastQuestion || context,
          context,
        });
      }
      if (h.question_prompt) {
        return this.startHandoff(st, turn, {
          reason: 'clarify_route',
          entry,
          question: null,
          questionPrompt: h.question_prompt,
          context,
          needBookingRef: !!h.booking_ref,
        });
      }
      return this.startHandoff(st, turn, {
        reason: 'customer_asked',
        entry,
        question: st.lastQuestion || entry.question,
        context,
        lead: null,
        needBookingRef: BOOKING_CATEGORIES.has(entry.category),
      });
    }
  }

  followupRoute(entry) {
    const f = (this.routes.followups || {})[entry.id];
    if (f && f.yes) return f.yes;
    if (entry.mode === 'auto' && /\b(bring in|with) Derek and Brandon\b/.test(entry.answer))
      return { handoff: {} };
    return null;
  }

  followup(st, entryId, answer, turn) {
    const entry = this.byId.get(entryId);
    if (!entry) return;
    st.awaiting = null;
    if (answer === 'no') return turn.say(COPY.noThanks);
    const route = this.followupRoute(entry);
    if (!route) return turn.say(COPY.ok);
    if (route.entry)
      return this.answerEntry(st, this.byId.get(route.entry), turn, { via: 'followup', score: 1 });
    return this.startHandoff(st, turn, {
      reason: 'customer_asked',
      entry,
      question: st.lastQuestion || entry.question,
      context: `Follow-up to: ${entry.question}`,
      needBookingRef:
        BOOKING_CATEGORIES.has(entry.category) || /booking|payout/i.test(entry.answer),
    });
  }

  /** Typed replies to the last question we asked. Returns true when handled. */
  onTypedReply(st, text, turn) {
    const a = st.awaiting;
    const s = clean(text);
    if (a.kind === 'role') {
      let role = explicitRole(text);
      if (!role && /\b(swim|swimming|swimmer|book|booking|guest|renter|renting)\b/.test(s))
        role = 'swimmer';
      if (!role && /\b(host|hosting|list|listing|my pool|owner)\b/.test(s)) role = 'host';
      if (!role) return false;
      st.role = role;
      st.awaiting = null;
      turn.log('role_set', { role, via: 'text' });
      return this.answerOrClarify(st, a.text, turn) || true;
    }
    if (a.kind === 'followup') {
      const yn = safety.yesNo(text, { strict: true });
      if (!yn) return false;
      this.followup(st, a.entryId, yn, turn);
      return true;
    }
    if (a.kind === 'disambiguate' || a.kind === 'guard') {
      const opts = a.kind === 'guard' ? a.routes : a.options;
      const n = { first: 0, 1: 0, one: 0, second: 1, 2: 1, two: 1, third: 2, 3: 2, three: 2 };
      const m = s.match(/^(?:the )?(first|second|third|1|2|3|one|two|three)(?: one)?$/);
      if (m && opts[n[m[1]]] !== undefined) {
        const e = this.byId.get(opts[n[m[1]]]);
        this.answerEntry(st, e, turn, { via: 'clarify', score: 1, text });
        return true;
      }
      if (opts.length === 1 && safety.yesNo(text) === 'yes') {
        this.answerEntry(st, this.byId.get(opts[0]), turn, { via: 'clarify', score: 1, text });
        return true;
      }
      if (/^(neither|none|no|nope|none of (those|them|these)|something else|other)$/.test(s)) {
        this.miss(st, a.text, turn, null, { fromClarify: true });
        return true;
      }
      // typed one of the option titles?
      const pick = this.pickOption(
        text,
        opts.map((id) => this.byId.get(id).question)
      );
      if (pick >= 0) {
        this.answerEntry(st, this.byId.get(opts[pick]), turn, { via: 'clarify', score: 1, text });
        return true;
      }
      if (a.kind === 'guard') {
        if (/\b(account|login|password|app|site|email)\b/.test(s)) {
          this.answerEntry(st, this.byId.get(opts[1]), turn, { via: 'clarify', score: 1, text });
          return true;
        }
        if (/\b(pool|gate|house|door|here|yard|outside|host)\b/.test(s)) {
          this.startUrgent(
            st,
            { route: opts[0], topics: ['lockout'], rule8: false },
            `${a.text} / ${text}`,
            turn
          );
          return true;
        }
      }
      st.awaiting = null;
      return false;
    }
    if (a.kind === 'clarify-entry') {
      const entry = this.byId.get(a.entryId);
      const pick = this.pickOption(text, entry.clarify_options || []);
      if (pick >= 0) {
        this.followClarifyRoute(st, entry.id, pick, turn);
        return true;
      }
      st.awaiting = null;
      return false;
    }
    return false;
  }

  /** Index of the option the customer typed, or -1. */
  pickOption(text, titles) {
    const q = new Set(this.matcher.canon(text));
    if (!q.size) return -1;
    let best = -1;
    let bestScore = 0;
    let second = 0;
    titles.forEach((t, i) => {
      const toks = this.matcher.canon(t);
      if (!toks.length) return;
      const hit = toks.filter((x) => q.has(x)).length / toks.length;
      const cover = toks.filter((x) => q.has(x)).length / q.size;
      const score = (hit + cover) / 2;
      if (score > bestScore) {
        second = bestScore;
        bestScore = score;
        best = i;
      } else if (score > second) second = score;
    });
    return bestScore >= 0.5 && bestScore - second >= 0.2 ? best : -1;
  }

  smallTalk(st, text, turn) {
    const s = clean(text);
    if (!s) return false;
    if (GREETING_ONLY.test(s)) {
      if (!st.greeted) {
        turn.select(COPY.greeting, (this.routes.starters || {}).greeting || []);
        st.greeted = true;
      } else {
        const starters = st.role
          ? (this.routes.starters || {})[st.role]
          : (this.routes.starters || {}).greeting;
        turn.select(COPY.helloAgain, starters || []);
      }
      return true;
    }
    const words = s.split(' ').length;
    if (THANKS.test(s) && words <= 6) {
      st.awaiting = null;
      turn.say(COPY.thanks);
      return true;
    }
    if (BYE.test(s) && words <= 5) {
      st.awaiting = null;
      turn.say(COPY.bye);
      return true;
    }
    if (ACK.test(s)) {
      st.awaiting = null;
      turn.say(COPY.ok);
      return true;
    }
    const yn = safety.yesNo(text);
    if (yn && words <= 3) {
      st.awaiting = null;
      turn.say(yn === 'no' ? COPY.noThanks : COPY.ok);
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ handoffs
  baseHandoff(st, o) {
    return {
      status: 'collecting',
      reason: o.reason,
      urgency: o.urgency || 'normal',
      entryId: o.entryId || null,
      category: o.category || null,
      title: o.title || null,
      topics: o.topics || [],
      rule8: !!o.rule8,
      question: o.question || null,
      questionPrompt: o.questionPrompt || null,
      context: o.context || null,
      needBookingRef: !!o.needBookingRef,
      bookingRefAsked: false,
      extra: [],
      done: {},
      tries: 0,
      startedAt: st.updatedAt,
    };
  }

  /** "Talk to the founder", "human", "agent", ... */
  startFounder(st, text, turn) {
    const entry = this.byId.get('human-talk-to-person');
    const question = text && safety.questionRemains(text) ? text : null;
    turn.log('answered', { entry: entry.id, score: 1, mode: entry.mode, via: 'founder_request' });
    if (!st.entryIds.includes(entry.id)) st.entryIds.push(entry.id);
    const previous = st.handoff && st.handoff.status === 'collecting' ? st.handoff : null;
    st.handoff = this.baseHandoff(st, {
      reason: 'founder_request',
      entryId: entry.id,
      category: entry.category,
      title: 'Customer asked for the founders',
      question: question || (previous && previous.question) || null,
      needBookingRef: mentionsBooking(question),
    });
    if (!st.handoff.question && st.misses.length) st.handoff.question = st.misses.join(' / ');
    if (st.handoff.question) this.enrichHandoff(st, st.handoff);
    if (!st.handoff.question) {
      st.awaiting = { kind: 'slot', slot: 'question' };
      turn.say(st.mood === 'upset' ? calm(entry.answer) : entry.answer);
      return;
    }
    const ack = entry.answer.replace(
      /\s*What's it about, so they don't have to ask you again\?\s*$/,
      ''
    );
    turn.say(st.mood === 'upset' ? calm(ack) : ack);
    return this.nextSlot(st, turn);
  }

  /** A bank entry whose mode is handoff (or a clarify route that hands off with the entry's own answer). */
  startEntryHandoff(st, entry, turn, meta = {}) {
    const urgent = entry.urgency === 'high';
    const answer = this.stripKnownAsks(entry.answer, st);
    const slot = this.slotAskedBy(answer);
    st.handoff = this.baseHandoff(st, {
      reason: meta.reason || (urgent ? 'urgent' : 'handoff_topic'),
      urgency: entry.urgency,
      entryId: entry.id,
      category: entry.category,
      title: entry.question,
      topics: meta.topics || [],
      rule8: !!meta.rule8 || RULE8_ENTRIES.has(entry.id),
      question: entry.id === 'human-talk-to-person' ? null : meta.text || st.lastQuestion || null,
      context: meta.context || null,
      needBookingRef:
        /booking reference|specific booking|booking you already have/i.test(entry.answer) ||
        BOOKING_CATEGORIES.has(entry.category),
    });
    const content = urgent || st.mood === 'upset' ? calm(answer) : answer;
    if (urgent) {
      turn.say(content);
      return this.escalate(st, turn);
    }
    if (slot === 'reply_method') {
      st.awaiting = { kind: 'slot', slot };
      return turn.select(content, COPY.replyButtons);
    }
    if (slot === 'booking_ref') {
      st.awaiting = { kind: 'slot', slot };
      st.handoff.bookingRefAsked = true;
      return turn.select(content, [COPY.noRefButton]);
    }
    if (slot) {
      st.awaiting = { kind: 'slot', slot };
      if (slot === 'booking_ref_yesno' || slot === 'detail')
        st.handoff.bookingRefAsked = /booking/.test(answer);
      return turn.say(content);
    }
    turn.say(content);
    return this.nextSlot(st, turn);
  }

  /** builtin:<id> or an entry id, reached through a safety/near-miss guard. */
  startRouteHandoff(st, route, text, turn, meta) {
    if (!route.startsWith('builtin:')) {
      const entry = this.byId.get(route);
      turn.log('answered', { entry: entry.id, score: 1, mode: entry.mode, via: 'guard' });
      if (!st.entryIds.includes(entry.id)) st.entryIds.push(entry.id);
      st.lastQuestion = text;
      return this.startEntryHandoff(st, entry, turn, { ...meta, text });
    }
    const id = route.slice(8);
    const b = this.routes.builtin[id];
    turn.log('guard_handoff', { route: id, urgency: b.urgency });
    const urgent = b.urgency === 'high';
    const answer = this.stripKnownAsks(b.answer, st);
    st.handoff = this.baseHandoff(st, {
      reason: urgent ? 'urgent' : 'handoff_topic',
      urgency: b.urgency,
      entryId: `builtin:${id}`,
      category: b.category,
      title: id.replace(/-/g, ' '),
      topics: meta.topics,
      rule8: meta.rule8,
      question: text,
      needBookingRef:
        /booking reference|booking you already have/i.test(b.answer) || mentionsBooking(text),
    });
    const content = urgent || st.mood === 'upset' ? calm(answer) : answer;
    if (urgent) {
      turn.say(content);
      return this.escalate(st, turn);
    }
    const slot = this.slotAskedBy(answer);
    if (slot === 'booking_ref') {
      st.awaiting = { kind: 'slot', slot };
      st.handoff.bookingRefAsked = true;
      return turn.select(content, [COPY.noRefButton]);
    }
    if (slot) {
      st.awaiting = { kind: 'slot', slot };
      return turn.say(content);
    }
    turn.say(content);
    return this.nextSlot(st, turn);
  }

  /** Urgent: say the bank's reply (911 line first where it applies), then escalate right away. */
  startUrgent(st, guard, text, turn) {
    // an unfinished or failed handoff becomes part of the urgent one (a fresh note is posted)
    const previous =
      st.handoff && (st.handoff.status === 'collecting' || st.handoff.status === 'failed')
        ? st.handoff
        : null;
    let answer;
    let entryId;
    let category;
    let title;
    let urgency = 'high';
    if (guard.route.startsWith('builtin:')) {
      const b = this.routes.builtin[guard.route.slice(8)];
      answer = b.answer;
      entryId = guard.route;
      category = b.category;
      title = guard.route.slice(8).replace(/-/g, ' ');
    } else {
      const entry = this.byId.get(guard.route);
      answer = entry.answer;
      entryId = entry.id;
      category = entry.category;
      title = entry.question;
      if (!st.entryIds.includes(entry.id)) st.entryIds.push(entry.id);
    }
    turn.log('answered', { entry: entryId, score: 1, mode: 'handoff', via: 'urgent' });
    st.lastQuestion = text;
    const injury = (guard.topics || []).some((t) => ['injury', 'unsafe', 'harassment'].includes(t));
    let content = calm(this.stripKnownAsks(answer, st));
    if (injury && !content.startsWith(LINE_911)) content = `${LINE_911} ${content}`;
    // the 911 line is the first thing they see, even ahead of a card-number warning
    if (content.startsWith(LINE_911)) turn.actions.unshift({ type: 'say', content });
    else turn.say(content);
    st.handoff = this.baseHandoff(st, {
      reason: 'urgent',
      urgency,
      entryId,
      category,
      title,
      topics: guard.topics || [],
      rule8: !!guard.rule8 || RULE8_ENTRIES.has(entryId),
      question: text,
    });
    if (previous) st.handoff.extra.push(...[previous.question, ...previous.extra].filter(Boolean));
    st.mood = 'urgent';
    return this.escalate(st, turn);
  }

  /** Generic handoff (founder, two strikes, follow-ups, clarify routes). */
  startHandoff(st, turn, o) {
    st.handoff = this.baseHandoff(st, {
      reason: o.reason,
      urgency: o.urgency || 'normal',
      entryId: o.entry ? o.entry.id : null,
      category: o.entry ? o.entry.category : st.topic,
      title: o.entry
        ? o.entry.question
        : o.reason === 'two_unmatched'
          ? "Question the assistant couldn't answer"
          : null,
      question: o.question,
      questionPrompt: o.questionPrompt,
      context: o.context,
      needBookingRef: o.needBookingRef,
    });
    if (st.handoff.question && !o.entry) this.enrichHandoff(st, st.handoff);
    turn.log('handoff_started', { reason: o.reason });
    if (o.lead) turn.say(o.lead);
    return this.nextSlot(st, turn);
  }

  nextSlot(st, turn) {
    const h = st.handoff;
    if (!h.question) {
      st.awaiting = { kind: 'slot', slot: 'question' };
      return turn.say(h.questionPrompt || COPY.askQuestion);
    }
    if (h.needBookingRef && !st.bookingRef && !st.bookingRefDeclined && !h.bookingRefAsked) {
      st.awaiting = { kind: 'slot', slot: 'booking_ref' };
      h.bookingRefAsked = true;
      return turn.select(COPY.askBookingRef, [COPY.noRefButton]);
    }
    if (!st.replyMethod) {
      st.awaiting = { kind: 'slot', slot: 'reply_method' };
      return turn.select(COPY.askReplyMethod, COPY.replyButtons);
    }
    if (st.replyMethod === 'email' && !st.email) {
      st.awaiting = { kind: 'slot', slot: 'email' };
      return turn.say(COPY.askEmail);
    }
    st.awaiting = null;
    return this.escalate(st, turn);
  }

  fillSlot(st, text, turn) {
    const h = st.handoff;
    const slot = st.awaiting.slot;
    const s = clean(text);
    if (CANCEL_HANDOFF.test(s) && h.urgency !== 'high') {
      st.handoff = null;
      st.awaiting = null;
      turn.log('cancelled_handoff', { slot });
      return turn.say(COPY.noThanks);
    }
    const human = safety.wantsHuman(text);
    switch (slot) {
      case 'question': {
        if (human || !safety.questionRemains(text)) {
          // they just want a person: don't keep asking
          h.question = h.question || '(not given)';
        } else {
          if (h.question) h.extra.push(text);
          else h.question = text;
          if (!h.needBookingRef && !h.bookingRefAsked) h.needBookingRef = mentionsBooking(text);
          this.enrichHandoff(st, h);
        }
        break;
      }
      case 'detail': {
        h.extra.push(text);
        if (!st.bookingRef && h.bookingRefAsked) st.bookingRefDeclined = true;
        break;
      }
      case 'booking_ref':
      case 'booking_ref_yesno': {
        if (st.bookingRef) break; // findBookingRef already caught it
        const yn = safety.yesNo(text, { prefix: true });
        if (slot === 'booking_ref_yesno' && yn === 'yes') {
          st.awaiting = { kind: 'slot', slot: 'booking_ref' };
          h.bookingRefAsked = true;
          return turn.select(COPY.askBookingRef, [COPY.noRefButton]);
        }
        if (
          human ||
          yn === 'no' ||
          safety.declinesBookingRef(text) ||
          /\?\s*$/.test(text) ||
          /^(where|what|how)\b/.test(s)
        ) {
          st.bookingRefDeclined = true;
          if (!human && !yn && !safety.declinesBookingRef(text)) h.extra.push(text);
        } else if (slot === 'booking_ref_yesno') {
          h.extra.push(text);
          st.bookingRefDeclined = true;
        } else {
          st.bookingRef = text.length > 120 ? `${text.slice(0, 119)}…` : text;
        }
        break;
      }
      case 'reply_method': {
        const email = safety.findEmail(text);
        if (email) {
          st.replyMethod = 'email';
          st.email = email;
        } else if (/\b(email|mail|inbox|gmail|outlook)\b/.test(s)) st.replyMethod = 'email';
        else if (
          /\b(chat|here|this|in here|in chat|messages?|this chat|right here|either|whatever|any|doesnt matter)\b/.test(
            s
          ) ||
          human
        )
          st.replyMethod = 'chat';
        else if (st.replyTries >= 1) st.replyMethod = 'chat';
        else {
          st.replyTries += 1;
          return turn.select(COPY.askReplyMethod, COPY.replyButtons);
        }
        break;
      }
      case 'email': {
        const email = safety.findEmail(text);
        if (email && safety.isValidEmail(email)) st.email = email;
        else if (/\b(chat|here|never ?mind|nvm)\b/.test(s) || human) st.replyMethod = 'chat';
        else {
          st.emailTries += 1;
          if (st.emailTries >= 2) {
            st.replyMethod = 'chat';
            turn.say(COPY.emailGiveUp);
          } else return turn.say(COPY.emailInvalid);
        }
        break;
      }
      default:
        break;
    }
    return this.nextSlot(st, turn);
  }

  escalate(st, turn) {
    const h = st.handoff;
    if (h.tries >= MAX_ESCALATION_TRIES) {
      return turn.say(handoffFailed({ injury: false }));
    }
    h.status = 'sending';
    st.awaiting = null;
    turn.log('handoff', {
      reason: h.reason,
      urgency: h.urgency,
      entry: h.entryId,
      topics: h.topics,
      rule8: h.rule8,
      booking_ref: !!st.bookingRef,
      reply_method: st.replyMethod || (h.urgency === 'high' ? 'chat (urgent, not asked)' : null),
      try: h.tries + 1,
    });
    turn.escalate();
  }

  /**
   * Called by the executor once the Chatwoot handoff calls finished.
   * @param {object} prevState
   * @param {{ok: boolean, step?: string, status?: number}} result
   */
  afterEscalation(prevState, result, ctx = {}) {
    const st = clone(prevState);
    st.updatedAt = ctx.now || Date.now();
    const turn = new Turn();
    const h = st.handoff;
    if (!h) return turn.result(st);
    if (result.ok) {
      h.status = 'sent';
      h.sentAt = st.updatedAt;
      h.done = { ...(h.done || {}), ...(result.done || {}), note: true };
      turn.say(
        handoffConfirmed({
          replyMethod: st.replyMethod,
          email: st.email,
          urgent: h.urgency === 'high',
          calm: st.mood === 'upset',
        })
      );
      turn.log('escalated', {
        reason: h.reason,
        urgency: h.urgency,
        entry: h.entryId,
        tries: h.tries + 1,
      });
    } else {
      h.status = 'failed';
      h.tries += 1;
      h.done = { ...(h.done || {}), ...(result.done || {}) };
      h.failedStep = result.step || 'unknown';
      const injury = (h.topics || []).some((t) => ['injury', 'unsafe', 'harassment'].includes(t));
      turn.say(handoffFailed({ injury }));
      turn.log('escalation_failed', {
        step: result.step || 'unknown',
        status: result.status || null,
        tries: h.tries,
      });
    }
    return turn.result(st);
  }

  /** Mark that a person replied in Chatwoot. */
  humanTookOver(prevState, ctx = {}) {
    const st = prevState ? clone(prevState) : newState(null, ctx.now || Date.now());
    st.humanOwned = true;
    st.awaiting = null;
    st.updatedAt = ctx.now || Date.now();
    return st;
  }

  /** An agent moved the conversation back to pending: the assistant may speak again. */
  returnedToBot(prevState, ctx = {}) {
    const st = prevState ? clone(prevState) : newState(null, ctx.now || Date.now());
    st.humanOwned = false;
    st.handoff = null;
    st.awaiting = null;
    st.attempts = 0;
    st.clarifiedOnce = false;
    st.misses = [];
    st.updatedAt = ctx.now || Date.now();
    return st;
  }

  // ------------------------------------------------------------------ for the executor
  finish(st, turn) {
    if (!st.greeted) {
      const firstPublic = turn.actions.findIndex((a) => a.type === 'say' || a.type === 'select');
      if (firstPublic >= 0) {
        const a = turn.actions[firstPublic];
        const isGreeting = a.content === COPY.greeting;
        if (!isGreeting) {
          const urgent =
            st.handoff &&
            st.handoff.urgency === 'high' &&
            turn.actions.some((x) => x.type === 'escalate');
          if (urgent) {
            const esc = turn.actions.findIndex((x) => x.type === 'escalate');
            turn.actions.splice(esc, 0, { type: 'say', content: COPY.labelLineAfter });
          } else {
            turn.actions.splice(firstPublic, 0, { type: 'say', content: COPY.labelLine });
          }
        }
        st.greeted = true;
      }
    }
    for (const a of turn.actions) {
      if (a.type === 'say' || a.type === 'select') this.pushHistory(st, 'bot', a.content);
    }
  }

  /** Conversation custom attributes mirrored into Chatwoot (prnm_*). */
  mirrorAttributes(st) {
    const h = st.handoff || {};
    const out = {};
    if (st.role) out.prnm_role = st.role;
    if (st.topic) out.prnm_topic = st.topic;
    if (st.bookingRef) out.prnm_booking_ref = st.bookingRef;
    if (st.replyMethod) out.prnm_reply_method = st.replyMethod;
    if (st.replyMethod === 'email' && st.email) out.prnm_reply_email = st.email;
    if (h.urgency) out.prnm_urgency = h.urgency;
    if (h.reason) out.prnm_handoff_reason = h.reason;
    if (st.attempts) out.prnm_attempts = st.attempts;
    if (st.entryIds.length) out.prnm_entry_ids = st.entryIds.join(',');
    return out;
  }

  /** Rebuild the essentials from Chatwoot custom attributes (after a restart that lost the local store). */
  hydrate(convId, attrs = {}, now = Date.now()) {
    const st = newState(convId, now);
    if (!attrs || typeof attrs !== 'object') return st;
    const any = Object.keys(attrs).some((k) => k.startsWith('prnm_'));
    if (!any) return st;
    st.greeted = true;
    if (attrs.prnm_role === 'host' || attrs.prnm_role === 'swimmer') st.role = attrs.prnm_role;
    if (typeof attrs.prnm_topic === 'string') st.topic = attrs.prnm_topic;
    if (attrs.prnm_booking_ref) st.bookingRef = String(attrs.prnm_booking_ref);
    if (attrs.prnm_reply_method === 'chat' || attrs.prnm_reply_method === 'email')
      st.replyMethod = attrs.prnm_reply_method;
    if (attrs.prnm_reply_email) st.email = String(attrs.prnm_reply_email);
    if (Number.isFinite(Number(attrs.prnm_attempts)))
      st.attempts = Number(attrs.prnm_attempts) || 0;
    if (attrs.prnm_entry_ids) st.entryIds = String(attrs.prnm_entry_ids).split(',').filter(Boolean);
    return st;
  }

  labelsFor(st) {
    const h = st.handoff || {};
    const labels = ['handoff'];
    if (h.urgency === 'high') labels.push('urgent');
    const cat = h.category || st.topic;
    if (cat && CATEGORY_SLUG[cat]) labels.push(`topic-${CATEGORY_SLUG[cat]}`);
    if (st.role) labels.push(`role-${st.role}`);
    return labels;
  }

  /**
   * The ONE private note per handoff. First line becomes the push-notification
   * body, so it carries no customer text.
   */
  buildNote(st, { agents = [], conversationUrl = '' } = {}) {
    const h = st.handoff || {};
    const urgent = h.urgency === 'high';
    const quote = (t) =>
      String(t || '')
        .replace(/mention:\/\//gi, 'mention:/ /')
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n');
    const mention = (a) => `[@${a.name}](mention://user/${a.id}/${encodeURIComponent(a.name)})`;
    const topic = h.title || (h.category ? h.category : 'customer question');
    const lines = [];
    lines.push(`PRNM handoff${urgent ? ' (URGENT)' : ''}: ${topic}`);
    lines.push(agents.map(mention).join(' '));
    lines.push("Either of you: assign it to yourself before replying, so you don't both answer.");
    lines.push('');
    lines.push('Customer question:');
    lines.push(quote(h.question || '(not given)'));
    if (h.context) lines.push(`Context: ${h.context}`);
    if (h.extra && h.extra.length) {
      lines.push('They also said:');
      for (const x of h.extra.slice(-5)) lines.push(quote(safety.redactForLog(x, 500)));
    }
    const tried = (st.tried || []).map(
      (t) => `${t.id} (${t.via}${t.via === 'match' ? `, score ${t.score}` : ''})`
    );
    const misses = (st.misses || []).length;
    lines.push(
      `What the assistant tried: ${tried.length ? tried.join('; ') : 'no bank answer'}${misses ? `; ${misses} question(s) it couldn't match` : ''}`
    );
    lines.push(`Urgency: ${urgent ? 'HIGH' : 'normal'}`);
    lines.push(
      `Booking ref: ${st.bookingRef ? st.bookingRef : st.bookingRefDeclined ? 'customer does not have it' : 'not provided'}`
    );
    lines.push(
      `Reply method: ${
        st.replyMethod === 'email' && st.email
          ? `email to ${st.email} (reply from support@)`
          : st.replyMethod === 'chat'
            ? 'here in chat'
            : urgent
              ? 'here in chat (urgent, not asked)'
              : 'not given'
      }`
    );
    lines.push(`Role: ${st.role || 'unknown'}`);
    lines.push(
      `Why handed off: ${REASON_TEXT[h.reason] || h.reason}${h.topics && h.topics.length ? ` (${h.topics.join(', ')})` : ''}`
    );
    if (h.closest)
      lines.push(`Closest bank entry (not sent): ${h.closest.id} (score ${h.closest.score})`);
    if (h.rule8) {
      lines.push(
        'House rule 8 topic (injury, insurance, liability, coverage, claims or damage): Derek answers this one, or refers it to the agent. Brandon, please leave the coverage answer to Derek.'
      );
    }
    if (conversationUrl) lines.push(`Conversation: ${conversationUrl}`);
    return lines.join('\n');
  }
}

const REASON_TEXT = {
  founder_request: 'customer asked for a person / the founders',
  two_unmatched: "two questions the assistant couldn't match",
  handoff_topic: 'topic the assistant must not answer',
  urgent: 'urgent topic',
  customer_asked: 'customer said yes to bringing you in',
  clarify_route: 'customer picked an option that needs a person',
};

function round(n) {
  return Math.round(n * 100) / 100;
}

class Turn {
  constructor() {
    this.actions = [];
    this.events = [];
  }
  say(content) {
    this.actions.push({ type: 'say', content });
  }
  select(content, items) {
    this.actions.push({
      type: 'select',
      content,
      items: items.map((i) => ({ title: String(i.title), value: String(i.value) })),
    });
  }
  note(content) {
    this.actions.push({ type: 'note', content });
  }
  escalate() {
    this.actions.push({ type: 'escalate' });
  }
  log(type, data) {
    this.events.push({ type, ...data });
  }
  result(state) {
    return { state, actions: this.actions, events: this.events };
  }
}

module.exports = {
  Engine,
  newState,
  explicitRole,
  mentionsBooking,
  CATEGORY_SLUG,
  RULE8_ENTRIES,
  SAFETY_VOCAB,
  SAFETY_TARGETS,
};
