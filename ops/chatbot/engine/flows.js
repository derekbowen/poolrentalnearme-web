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
 *   { type: 'escalate', deferred: true }        retry a handoff logged over a ceiling: the executor sends it only
 *                                               if a flood slot is free now, else does nothing at all
 *   { type: 'flag_urgent', labels, note, okText }  no new alert: add labels, set urgent priority, post a
 *                                               plain note (no @mention); say okText only if all succeeded
 *
 * Events (for tracking.js): answered, clarify, unmatched, handoff, escalated,
 * escalation_failed, card_warning, password_warning, role_set, cancelled_handoff.
 */
const { Matcher, roleOfCategory, THRESHOLDS } = require('./matcher');
const safety = require('./safety');
const { correctedText, clean } = require('./normalize');
const { COPY, LINE_911, handoffConfirmed, handoffFailed, calm } = require('./copy');

const SAFETY_VOCAB = [
  'fainted',
  'collapsed',
  'unresponsive',
  'sprained',
  'allergic',
  'breathing',
  'choking',
  'stolen',
  'liable',
  'scratched',
  'stained',
  'clogged',
  'electrocuted',
  'harassing',
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
  // round-2 review: typos of these must still reach the safety checks ("consussion")
  'concussion',
  'wheezing',
  'struggling',
  'stabbed',
  'weapon',
  'creepy',
  'unresponsive',
  'breathe',
  // round-3 review: "heart atack", "chemicles", "swalowed", "grabed"
  'attack',
  'chemicals',
  'swallowed',
  'foaming',
  'poisoned',
  'grabbed',
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

// host-side answers that only fit a host: with no host words and no known role, ask "booking or hosting?" first
const HOST_CONTEXT_ENTRIES = new Set(['host-pricing-04', 'host-pricing-09', 'host-pricing-01', 'host-listing-06', 'host-listing-08']);
const HOST_WORDS =
  /\b(?:host|hosts|hosting|my pool|my listing|my listings|list|listing|listed|guests|my guests|payout|payouts|charge (?:my|guests)|per hour i|should i charge|i charge|my calendar|my backyard)\b/;
// an entry that needs one of its own words to be offered or answered (a shared "stop" is not "stop text
// messages", "contact you" is not "contact the host", "delete my listing" is not "delete my account")
const ENTRY_GATES = {
  'account-06': /\b(?:te?xt\w*|txt\w*|sms|messag\w*|notif\w*|alerts?|reminders?|unsubscrib\w*|opt out|optout|stop (?:sending|texting|messaging)|spam\w*)\b/,
  'host-pricing-04': /\b(?:extra|extras|add on|addon|add ons|addons|charg\w*|fee|fees|pric\w*|cost\w*|paid|amenit\w*|upsell\w*|upgrade\w*)\b/,
  'booking-custom-offer': /\b(?:offer|offers|custom|special price|quote|deal|accept)\b/,
  'booking-message-host': /\b(?:host\w*|owner\w*|them|they|him|her|listing|before i book|b4)\b/,
  'arrive-address': /\b(?:pool|address|addy|directions|map|maps|booking|host|listing|place|house|street|gps|location|located at|zip|get there|wheres the|where is the|where s the|where is it|wheres it|where s it)\b/,
  'account-07': (s) => /\b(?:account|acount|acc|profile|data|info|information|me|myself|login|user)\b/.test(s) || !/\b(?:listing|listings|pool)\b/.test(s),
  'account-10': /\b(?:broke|broken|error\w*|eror\w*|bug\w*|glitch\w*|not working|isnt working|wont|doesnt|didnt|cant|cannot|issue\w*|problem\w*|crash\w*|fail\w*|stuck|load\w*|wrong|freez\w*|blank)\b/,
  'account-08': /\b(?:accept\w*|accpet\w*|approv\w*|aprov\w*|button)\b/,
  'host-listing-06': /\b(?:listing\w*|listin|live|approv\w*|publish\w*|pool|visible|review\w*|up|pending|people book)\b/,
  'booking-same-day': (s) => !/\b(?:cancel\w*|refund\w*|reschedul\w*|move|change|extend|late)\b/.test(s),
  'pay-off-platform': /\b(?:cash|venmo|zelle|paypal|cashapp|cash app|directly|direct|off|outside|apple pay|check|at the pool|in person|when i get there|when we arrive)\b/,
};
const passesGate = (id, s) => {
  const g = ENTRY_GATES[id];
  return !g || (typeof g === 'function' ? g(s) : g.test(s));
};
const MAX_HISTORY = 12;
const MAX_ESCALATION_TRIES = 5;
const MAX_EXTRA = 5; // "They also said" lines kept per handoff (the note shows these five)
const MAX_OFFERED = 12; // button values remembered from the last select
const MAX_OFFERED_LOG = 30; // button values remembered across earlier selects
const MAX_PARTS = 6; // questions of one message matched on their own (multiPart)
const MAX_SPLIT = 12; // more pieces than this is not a list of questions: one text
const DANGER_REPEAT_MS = 10 * 60 * 1000; // the 911 line while waiting for a person: at most once per 10 minutes
// taps whose meaning depends on the question on screen right now; from an older message they need words
const CONTEXT_VALUES = /^(?:other|yes:|no:|ref:none|reply:|safety:)/;
const cap = (t) => (t == null ? t : safety.capText(t, safety.MAX_STORED_CHARS));

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
    upsetSeen: false,
    // values (and our own titles) of the buttons in the last select we sent
    offered: [],
    // every button we offered recently (bounded): an older but genuine tap is still answered, a forged one never
    offeredLog: [],
    // the founders were alerted (@mention note) for the thread that is open now; cleared on resolve / back to the bot
    alertThread: false,
    // when the 911 line was last said while waiting for a person (said once, not on every message)
    dangerAt: null,
    replyNoTextSaid: false,
    history: [],
    createdAt: now,
    updatedAt: now,
  };
}

// a few very common words of the languages visitors most often write in, none of them English words
const FOREIGN_WORDS = new Set(
  (
    // (no word that is also English: "favor", "die", "pour", "hay", "con", "ma" ...)
    'hola necesito ayuda quiero reservar piscina gracias como puedo donde cuanto cuesta una los las que ' +
    'tengo esta buenos dias alquilar usted ustedes hijo hija niños ninos para pero tambien mañana manana ' +
    'bonjour je voudrais reserver une piscine merci sil vous plait comment avec des les bonsoir louer ' +
    'nous avez pouvez enfant enfants demain ' +
    'hallo ich habe mochte möchte ein eine schwimmbad danke bitte wie kann und der das mit mein guten morgen frage ' +
    'ola preciso ajuda obrigado obrigada voce você quero alugar amanha'
  ).split(' ')
);
function notEnglish(text) {
  const raw = String(text || '');
  // letters, but none of them Latin (Cyrillic, Chinese, Arabic, ...)
  if (/\p{L}/u.test(raw) && !clean(raw).replace(/[0-9 ]/g, '')) return true;
  const toks = clean(raw).split(' ').filter(Boolean);
  if (toks.length < 2) return false;
  const foreign = toks.filter((t) => FOREIGN_WORDS.has(t)).length;
  return foreign >= 2 && foreign / toks.length >= 0.5;
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
  /^(hi|hey|hello|hiya|howdy|yo|sup|heya|hola|bonjour|bonsoir|hallo|salut|ciao|ola|oi|hej|buongiorno|buenas|buenos dias|bom dia|guten tag|good (morning|afternoon|evening)|whats up|wassup|hey there|hi there|hello there|greetings|(?:hi |hey |pls |please |plz |someone |somebody )?help+(?: help+| me| us| pls| please| plz)*|start|menu|\?+)$/;
// "can someone help me?", "is anyone there?": no question yet, so offer the starters (with the founder button)
const HELP_ONLY =
  /^(?:hi |hey |hello |yo )?(?:(?:can|could|will|would) )?(?:some ?one|some ?body|any ?one|any ?body|you|u) (?:please |pls |plz )?help(?: me| us)?(?: please| pls| plz| out| here| quick)?$|^(?:hi |hey |hello )?(?:i )?(?:need|want) (?:some )?help(?: please| pls| plz| here)?$|^(?:hi |hey |hello+ )?(?:is )?(?:any ?one|any ?body|someone|somebody) (?:there|here|around|on|online|available|awake|home)$|^hello+ any ?one$|^(?:help me|help us)(?: please| pls| plz)?$/;
// "i'm a host" on its own: set the role and offer that role's starters, don't guess a question
const BARE_ROLE =
  /^(?:(?:hi|hey|hello|yo|hiya|so|ok|okay|hola) )?(?:i am|im|i m) (?:a |an |the )?(?:(host|pool host|pool owner|homeowner with a pool|hosting)|(guest|swimmer|renter|customer|booking a swim))(?: here| too| btw| on here| now| lol)?$/;
function bareRole(s) {
  const m = s.match(BARE_ROLE);
  if (!m) return null;
  return m[1] ? 'host' : 'swimmer';
}
// buttons that only ever say "who I am" or "get me a person": safe to accept from an older message
const STANDING_VALUES = new Set(['founder', 'role:swimmer', 'role:host']);
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
  /** The spell-corrector the safety checks use: typos of alarming words only ("drowing" → "drowning"). */
  safetyFix() {
    return (part) => correctedText(part, this.matcher.speller, SAFETY_TARGETS);
  }

  abs(link) {
    if (!link) return '';
    if (/^https?:\/\//.test(link)) return link;
    return `${this.siteUrl}${link.startsWith('/') ? '' : '/'}${link}`;
  }

  format(entry, st, text = entry.answer) {
    let s = this.isCalm(st) ? calm(text) : text;
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
    return {
      id: e.id,
      category: e.category,
      score: round(m.top.score),
      confident: m.status === 'confident' && m.top.id === e.id,
    };
  }

  /** Fill in category / booking-ref relevance for a handoff whose question we only just learned. */
  enrichHandoff(st, h) {
    const near = this.closest(h.question, st);
    if (!near) return;
    h.closest = { id: near.id, score: near.score };
    // a weak guess ("payout question" ≈ "can I message the host" at 0.6) names no topic and asks for no booking ref
    const strong = near.confident && near.score >= THRESHOLDS.CONFIDENT;
    if (!strong) return;
    if (!h.category || h.category === 'safety, disputes, and human help')
      h.category = near.category;
    if (
      strong &&
      !h.bookingRefAsked &&
      (BOOKING_CATEGORIES.has(near.category) || near.id === 'payouts-04')
    )
      h.needBookingRef = true;
  }

  pushHistory(st, from, text) {
    st.history.push({ from, text: safety.redactForLog(text, 300) });
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
    if (!Array.isArray(st.offered)) st.offered = null; // state from before offered buttons were tracked
    if (!Array.isArray(st.offeredLog)) st.offeredLog = [];
    st.updatedAt = ctx.now || Date.now();
    const turn = new Turn();
    // A person owns the conversation now: the assistant stays silent.
    if (st.humanOwned) return turn.result(st);
    // Handed off (alert sent) or logged without an alert (flood cap): stay quiet while they wait,
    // except to keep what they add and to answer danger with the 911 line.
    if (st.handoff && (st.handoff.status === 'sent' || st.handoff.status === 'capped')) {
      if (input.kind === 'text') this.whileWaiting(st, input, turn);
      // logged over the hourly or per-visitor ceiling: not final. Ask the executor to try the alert
      // again; it sends nothing unless a slot is free now (D3).
      if (this.deferred(st)) turn.actions.push({ type: 'escalate', deferred: true });
      if (turn.actions.length) this.finish(st, turn);
      return turn.result(st);
    }

    if (input.kind === 'button') {
      st.mood = st.upsetSeen ? 'upset' : 'neutral';
      this.onButton(st, input, turn);
    } else {
      this.onText(st, input, turn);
    }
    this.finish(st, turn);
    return turn.result(st);
  }

  /**
   * A message while the handoff waits for a person (alert sent, or logged under a flood cap).
   * No new @mention and no reopen (D3). What they add is kept; danger gets the 911 line
   * once and the conversation is marked urgent (label + priority + a plain note).
   */
  whileWaiting(st, input, turn) {
    const sens = safety.prepareInput(input.text);
    const t = sens.text;
    if (!t) return;
    const h = st.handoff;
    this.pushHistory(st, 'customer', t);
    // keep a booking ref or email they add now (mirrored into Chatwoot attributes by the executor)
    const ref = safety.findBookingRef(t);
    if (ref && !st.bookingRef) st.bookingRef = cap(ref);
    const email = safety.findEmail(t);
    if (email && !st.email) st.email = cap(email);
    if (sens.cards || sens.cvv) {
      turn.say(COPY.cardWarning);
      turn.note(
        `Possible card details in customer message${input.messageId ? ` #${input.messageId}` : ''}. The assistant did not repeat them. Please delete that message.`
      );
      turn.log('card_warning', { waiting: h.status });
    }
    if (sens.passwords) {
      turn.say(COPY.passwordWarning);
      turn.note(
        `A customer message${input.messageId ? ` (#${input.messageId})` : ''} looked like it contained a password. The assistant did not repeat it. Please delete that message.`
      );
      turn.log('password_warning', { waiting: h.status });
    }
    // the same checks as a fresh message: typos ("he is drowing"), soft shapes and a bare "HELP"
    if (!safety.dangerSignal(t, this.safetyFix())) {
      // anything else (a "yes" to the booking-ref question, "hello??", "real person pls"): keep it
      // for the founders and say once that they will see it here
      if (safety.questionRemains(t)) this.addDetail(h, t);
      if (!st.waitAckSaid && !sens.cards && !sens.cvv && !sens.passwords) {
        st.waitAckSaid = true;
        turn.say(h.status === 'capped' ? COPY.waitingAckCapped : COPY.waitingAckSent);
      }
      return;
    }
    this.addDetail(h, t);
    const now = st.updatedAt;
    if (st.dangerAt && now - st.dangerAt < DANGER_REPEAT_MS) return;
    st.dangerAt = now;
    h.urgency = 'high';
    h.lead911 = true;
    turn.actions.unshift({ type: 'say', content: LINE_911 });
    turn.flagUrgent({
      labels: h.status === 'capped' ? ['handoff', 'urgent', h.capped === 'global' ? 'handoff-overflow' : 'handoff-capped'] : ['handoff', 'urgent'],
      note: this.dangerNote(st, t),
      okText: COPY.markedUrgent,
    });
    turn.log('danger_while_waiting', { status: h.status });
  }

  /** A handoff logged over the hourly or per-visitor ceiling may still alert once a slot frees up (D3). */
  deferred(st) {
    const h = st && st.handoff;
    return !!(
      h &&
      h.status === 'capped' &&
      (h.capped === 'global' || h.capped === 'contact') &&
      !st.humanOwned &&
      // an alert that already went out (a sentAt, or its @mention note done) is never retried as a new one
      !h.sentAt &&
      !(h.done && h.done.note)
    );
  }

  /** Plain private note (no @mention, so no new push: D3) about danger reported while waiting. */
  dangerNote(st, text) {
    const h = st.handoff || {};
    const lines = [
      `PRNM update (URGENT, no new alert): the customer reported possible danger ${h.status === 'capped' ? 'after the alert limit was reached' : 'after the handoff'}.`,
      'Message:',
      quoteNote(safety.redactForLog(text, 500)),
    ];
    if (st.bookingRef) lines.push(`Booking ref: ${defang(st.bookingRef)}`);
    return lines.join('\n');
  }

  /** Calm, direct voice: an upset customer stays "upset" for the rest of the conversation. */
  isCalm(st) {
    return st.mood === 'upset' || st.mood === 'urgent' || !!st.upsetSeen;
  }

  /**
   * The offered item for a tapped value: { value, title, stale } or null when we never offered it (forged).
   * `stale` = genuine, but from an older message than the last one with buttons.
   */
  offeredItem(st, value) {
    const list = Array.isArray(st.offered) ? st.offered : [];
    const hit = list.find((i) => i.value === value);
    if (hit) return { ...hit, stale: false };
    const old = (st.offeredLog || []).find((i) => i.value === value);
    if (old) return { ...old, stale: true };
    if (STANDING_VALUES.has(value) && (st.offered === null || (st.offeredEver || []).includes(value))) {
      const g = ((this.routes.starters || {}).greeting || []).find((b) => b.value === value);
      return { value, title: g ? g.title : value, stale: true };
    }
    return null;
  }

  /** Does a context-dependent tap (other / yes: / no: / ref: / reply: / safety:) still fit what is on screen? */
  tapFits(st, v) {
    const a = st.awaiting || {};
    const collecting = st.handoff && st.handoff.status === 'collecting';
    if (v === 'other') return a.kind === 'disambiguate' || a.kind === 'guard';
    if (v.startsWith('yes:') || v.startsWith('no:'))
      return a.kind === 'followup' && a.entryId === v.slice(v.indexOf(':') + 1);
    if (v === 'ref:none') return collecting && a.kind === 'slot' && /^booking_ref/.test(a.slot || '');
    if (v.startsWith('reply:')) return collecting && a.kind === 'slot' && a.slot === 'reply_method';
    if (v.startsWith('safety:')) return a.kind === 'safety-check';
    return true;
  }

  addDetail(h, text) {
    const t = cap(text);
    if (!t) return;
    if (!h.question || h.question === '(not given)') h.question = t;
    else if (!h.extra.includes(t)) {
      h.extra.push(t);
      if (h.extra.length > MAX_EXTRA) h.extra.splice(0, h.extra.length - MAX_EXTRA);
    }
  }

  /** Rule 8 is decided by what the customer actually wrote, on every handoff path. */
  customerRule8(st, h) {
    const texts = [
      h.question,
      h.context,
      ...(h.extra || []),
      ...(st.misses || []),
      st.lastQuestion,
      ...(st.history || []).filter((x) => x.from === 'customer').map((x) => x.text),
    ].filter(Boolean);
    return texts.some((t) => safety.rule8Text(t));
  }

  /** Same canonical words as before: a re-asked question, not a pick. */
  sameQuestion(a, b) {
    const x = new Set(this.matcher.canon(a));
    const y = new Set(this.matcher.canon(b));
    if (!x.size || !y.size) return false;
    const both = [...x].filter((t) => y.has(t)).length;
    return both / Math.max(x.size, y.size) >= 0.8;
  }

  /** How closely typed text copies an option title (shared words over the longer of the two). */
  titleOverlap(text, title) {
    const x = new Set(this.matcher.canon(text));
    const y = new Set(this.matcher.canon(title));
    if (!x.size || !y.size) return 0;
    const both = [...x].filter((t) => y.has(t)).length;
    return both / Math.max(x.size, y.size);
  }

  onText(st, input, turn) {
    // D4: only the first MAX_INPUT_CHARS are ever processed (redacted first, over a slightly longer window)
    const sens = safety.prepareInput(input.text);
    const raw = sens.text;
    if (!raw) {
      if (input.attachments) turn.say(COPY.attachmentOnly);
      return;
    }
    if (sens.truncated) turn.log('truncated', { chars: sens.originalLength });
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
    if (st.mood === 'upset') st.upsetSeen = true;

    // Remember what they already told us.
    const ref = safety.findBookingRef(text);
    if (ref) st.bookingRef = ref;
    const email = safety.findEmail(text);
    if (email) st.email = cap(email);
    const role = explicitRole(text);
    if (role && role !== st.role) {
      st.role = role;
      turn.log('role_set', { role, via: 'text' });
    }

    // Only the redacted remainder is left?
    if (sens.found && !clean(text.replace(/\[[a-z ]+ removed\]/g, ''))) return;

    const fix = this.safetyFix();
    const guard = safety.detectGuards(text, fix);
    // a complaint, dispute, scam or theft report, or an accusation: calm, direct voice from here on
    if (guard && guard.upset) {
      st.upsetSeen = true;
      if (st.mood !== 'urgent') st.mood = 'upset';
    }
    const retrying = st.handoff && st.handoff.status === 'failed';
    if (guard && guard.kind === 'urgent' && !(retrying && st.handoff.urgency === 'high'))
      return this.startUrgent(st, guard, text, turn);

    // The reply to "Is someone hurt or in danger right now?" (round 4). Anything that is not clearly
    // "no" is a yes ("hurry", "my son", "he is 4", "idk", "she is in the water"): the urgent handoff,
    // with what they wrote kept. "no" alone carries on; "no, it's about my booking" is matched afresh.
    let safetyChecked = false;
    let rematch = null;
    if (st.awaiting && st.awaiting.kind === 'safety-check') {
      const reply = safety.safetyReply(text);
      turn.log('safety_check_reply', { reply: reply.kind });
      if (reply.kind === 'yes') return this.safetyAnswer(st, true, turn, safety.yesNo(text) === 'yes' ? null : text);
      if (reply.kind === 'no') return this.safetyAnswer(st, false, turn);
      st.awaiting = null;
      safetyChecked = true;
      rematch = reply.rest || null;
    }

    // A previous handoff failed: try again with whatever they just added.
    if (retrying) {
      this.addDetail(st.handoff, text);
      return this.escalate(st, turn);
    }

    // "HELP!!!", "pls help", "she's not responding" and nothing else: one question, 911 line first.
    // Asked again while that question is on screen, it is a yes.
    if (guard && guard.kind === 'check' && !safetyChecked) {
      if (st.awaiting && st.awaiting.kind === 'safety-check') return this.safetyAnswer(st, true, turn, text);
      return this.safetyCheck(st, text, turn);
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
      st.awaiting = { kind: 'guard', routes: guard.routes, text: cap(text) };
      turn.select(
        guard.prompt,
        guard.routes.map((r, i) => ({ title: guard.titles[i], value: `entry:${r}` }))
      );
      turn.log('clarify', { kind: 'guard', candidates: guard.routes.map((id) => ({ id })) });
      return;
    }
    const plain = safety
      .stripRefs(rematch || text)
      .replace(/\[[a-z ]+ removed\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (st.awaiting && this.onTypedReply(st, plain, turn)) return;
    if (this.smallTalk(st, plain, turn)) return;
    st.lastQuestion = cap(text);
    // another language: say so plainly instead of guessing an English answer (an emergency in another
    // language was already caught above, with the 911 line)
    if (notEnglish(text)) {
      turn.log('not_english', {});
      // it counts as a miss: a second one brings in Derek and Brandon with both messages kept
      if (st.attempts >= 1) return this.miss(st, plain, turn, null, { safetyChecked: true });
      st.attempts += 1;
      st.misses.push(safety.redactForLog(plain, 300));
      if (st.misses.length > 4) st.misses.splice(0, st.misses.length - 4);
      st.awaiting = null;
      return turn.select(COPY.englishOnly, [COPY.founderButton]);
    }
    return this.answerOrClarify(st, plain, turn, { safetyChecked });
  }

  onButton(st, input, turn) {
    const v = String(input.value || '').slice(0, 200);
    // the widget lets a visitor submit any value/title: accept only what we offered, with our own title
    const item = this.offeredItem(st, v);
    if (!item) {
      turn.log('button_rejected', { value: safety.redactForLog(v, 60) });
      return;
    }
    if (item.stale) {
      turn.log('stale_tap', { value: safety.redactForLog(v, 60) });
      // an older yes/no or "something else" means nothing now: ask for words instead of going quiet
      if (CONTEXT_VALUES.test(v) && !this.tapFits(st, v)) return turn.say(COPY.staleTap);
    }
    const offeredTitle = cap(safety.scanSensitive(String(item.title || '')).text);
    const awaiting = st.awaiting;
    if (v === 'safety:yes' || v === 'safety:no') return this.safetyAnswer(st, v === 'safety:yes', turn);
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
      const title = offeredTitle || e.question;
      // keep their own words when the tap answers our clarifying question (not when it is from an older message)
      const text = cap(awaiting && awaiting.text && !item.stale ? `${awaiting.text} → ${title}` : title);
      return this.answerEntry(st, e, turn, { via: 'button', score: 1, text });
    }
    if (v === 'other') {
      turn.log('clarify_rejected', {});
      return this.miss(st, (awaiting && awaiting.text) || '', turn, null, {
        fromClarify: true,
        safetyChecked: !!(awaiting && awaiting.safetyChecked),
      });
    }
    if (v.startsWith('route:')) {
      const parts = v.split(':');
      const idx = Number(parts[2]);
      if (!Number.isInteger(idx) || idx < 0) return;
      return this.followClarifyRoute(st, parts[1], idx, turn);
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
  answerOrClarify(st, text, turn, { safetyChecked = false, whole = null } = {}) {
    const m = this.gate(this.matcher.match(text, { role: st.role, topic: st.topic }), text, st);
    // a statement that a person is in or at the water ("my son is in the deep end", "she is by the drain")
    // is asked about (911 line first), never answered with a bank fact or a menu (round 4)
    const atWater = !safetyChecked && !whole && safety.personAtWater(text);
    if (m.status === 'confident') {
      const top = this.byId.get(m.top.id);
      if (atWater) return this.safetyCheck(st, text, turn);
      // An urgent entry (911 line, founders paged) only through a safety guard, never from a
      // look-alike question ("is the pool safe for kids?" ≈ "the pool is unsafe"): ask first.
      if (top.urgency === 'high' && top.mode === 'handoff') {
        // "im so mad right now" is not "I feel unsafe right now": calm voice, no 911 line, no confirm (round 4)
        if (safety.plainAnger(text)) return this.miss(st, text, turn, m, { safetyChecked });
        return this.confirmEntry(st, top, text, turn, m, { safetyChecked });
      }
      // a host-side answer to a question with no host words and no known role: ask who they are first
      if (!st.role && HOST_CONTEXT_ENTRIES.has(top.id) && !HOST_WORDS.test(clean(text))) {
        st.awaiting = { kind: 'role', text: cap(text) };
        turn.select(COPY.askRole, COPY.roleButtons);
        turn.log('clarify', { kind: 'role', candidates: [{ id: top.id, score: round(m.top.score) }] });
        return;
      }
      this.answerEntry(st, top, turn, {
        via: 'match',
        score: m.top.score,
        text: whole || text,
      });
      // "can I import my Swimply listing and also sync the calendar?": offer the other question too
      if (!whole && top.mode === 'auto') this.offerOtherParts(st, text, top.id, turn);
      return;
    }
    // Not sure what they mean, and it reads like someone may be hurt or in danger (or it is about a
    // person and not a booking question): ask that first, with the 911 line, instead of offering
    // unrelated answers. A false positive costs one question.
    if (!safetyChecked && (atWater || safety.softDanger(text) || safety.personConcern(text)))
      return this.safetyCheck(st, text, turn);
    // nothing but anger ("im so annoyed right now"): calm voice, never a menu of unrelated answers
    if (safety.plainAnger(text)) return this.miss(st, text, turn, m, { safetyChecked });
    // several questions in one message: answer the first part we are sure about
    if (!whole && this.answerParts(st, text, turn)) return;
    if (m.status === 'ambiguous') {
      if (m.needsRole) {
        st.awaiting = { kind: 'role', text: cap(text) };
        turn.select(COPY.askRole, COPY.roleButtons);
        turn.log('clarify', {
          kind: 'role',
          candidates: m.candidates.map((c) => ({ id: c.id, score: round(c.score) })),
        });
        return;
      }
      if (st.clarifiedOnce) return this.miss(st, text, turn, m, { safetyChecked });
      st.clarifiedOnce = true;
      const opts = m.candidates.slice(0, 3);
      st.awaiting = { kind: 'disambiguate', options: opts.map((o) => o.id), text: cap(text), safetyChecked };
      // one candidate: a yes/no ("is this what you mean?"), not a one-item menu
      turn.select(opts.length === 1 ? COPY.confirmOne : COPY.disambiguate, [
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
    // a long message with several questions and nothing we are sure about: a person, with all of it kept
    if (!whole && this.multiPart(text).length >= 2 && text.length >= 120) {
      st.attempts += 1;
      turn.log('unmatched', { text: safety.redactForLog(text), best: m.top ? { id: m.top.id, score: round(m.top.score) } : null, attempt: st.attempts, multi_part: true });
      return this.startHandoff(st, turn, {
        reason: 'multi_unmatched',
        question: text,
        lead: COPY.twoStrikes,
        needBookingRef: mentionsBooking(text),
      });
    }
    return this.miss(st, text, turn, m, { safetyChecked });
  }

  /**
   * Bank answers that need a reason to be offered (a shared word like "stop" is not one):
   * a candidate whose gate fails is dropped, and a confident hit on it is not confident.
   */
  gate(m, text, st) {
    const s = clean(text);
    // a guest asking "how much does it cost" is never given host pricing advice
    const hostOnly = (id) => st && st.role === 'swimmer' && HOST_CONTEXT_ENTRIES.has(id) && !HOST_WORDS.test(s);
    const ok = (id) => passesGate(id, s) && !hostOnly(id);
    if (!m.top || ok(m.top.id)) {
      if (m.candidates) m.candidates = m.candidates.filter((c) => ok(c.id));
      return m;
    }
    const candidates = (m.candidates || []).filter((c) => ok(c.id));
    const top = candidates[0] || null;
    if (!top || top.score < THRESHOLDS.CLARIFY) return { ...m, status: 'unmatched', top, candidates, needsRole: false };
    return { ...m, status: 'ambiguous', top, candidates: candidates.slice(0, 3), needsRole: false };
  }

  /**
   * "how many people can we bring, can we bring a speaker and also is there parking?" → the separate questions.
   * Bounded (round 3, redos2.js): a split into more than MAX_SPLIT pieces ("x?x?x?…", 750 of them) is not a
   * list of questions, so it is treated as one text (no parts); otherwise at most MAX_PARTS are matched.
   */
  multiPart(text) {
    const pieces = String(text || '')
      .split(
        /\?+|\s+(?:and also|also|plus|oh and|and another thing)\s+|[.!;]\s+(?=[a-z])|,\s*(?=(?:and )?(?:can|could|do|does|did|is|are|how|what|whats|when|where|will|would|should|any)\b)/i
      )
      .map((p) => (p || '').replace(/^\s*(?:and|also|so|ok|okay|hi|hey|hello|but)\b[\s,]*/i, '').trim())
      .filter(Boolean);
    if (pieces.length > MAX_SPLIT) return [];
    return pieces.filter((p) => this.matcher.canon(p).length >= 1).slice(0, MAX_PARTS);
  }

  /** Answer the first confidently matched part of a multi-question message; offer the others as buttons. */
  answerParts(st, text, turn) {
    const parts = this.multiPart(text);
    if (parts.length < 2) return false;
    const hits = [];
    for (const p of parts) {
      // each part on its own merits: no topic bias from the answer we are about to give
      const m = this.gate(this.matcher.match(p, { role: st.role, topic: null }), p, st);
      if (m.status !== 'confident') continue;
      const e = this.byId.get(m.top.id);
      if (e.urgency === 'high' || hits.some((h) => h.e.id === e.id)) continue;
      hits.push({ e, part: p, score: m.top.score });
    }
    if (!hits.length) return false;
    const [first, ...rest] = hits;
    turn.log('multi_part', { parts: parts.length, answered: hits.map((h) => h.e.id) });
    // a handoff entry keeps the whole message as the question, so nothing they asked is lost
    this.answerEntry(st, first.e, turn, { via: 'match', score: first.score, text: first.e.mode === 'auto' ? first.part : text });
    if (first.e.mode === 'auto' && rest.length) this.offerParts(st, rest, turn);
    return true;
  }

  /** The other questions of a message whose best part we just answered. */
  offerOtherParts(st, text, answeredId, turn) {
    const parts = this.multiPart(text);
    if (parts.length < 2) return;
    const rest = [];
    for (const p of parts) {
      const m = this.gate(this.matcher.match(p, { role: st.role, topic: null }), p, st);
      if (m.status !== 'confident') continue;
      const e = this.byId.get(m.top.id);
      if (e.id === answeredId || e.urgency === 'high' || rest.some((h) => h.e.id === e.id)) continue;
      rest.push({ e, part: p });
    }
    if (rest.length) this.offerParts(st, rest, turn);
  }

  offerParts(st, rest, turn) {
    // a yes/no follow-up of the first answer stays open: a typed "yes" still works, a tap answers the other part
    turn.select(
      COPY.alsoAsked,
      rest.slice(0, 2).map((h) => ({ title: h.e.question, value: `entry:${h.e.id}` }))
    );
  }

  miss(st, text, turn, m, { fromClarify = false, safetyChecked = false } = {}) {
    // The structural fallback (round 4): a statement about a person and water, a drain, a gate or a
    // fence ("my son is in the deep end", "she is by the drain") is never answered "say it another way".
    // Ask the safety question first (911 line); a "no" brings the message back here, checked.
    if (!safetyChecked && text && (safety.personAtWater(text) || safety.bodyState(text))) {
      turn.log('structural_fallback', { text: safety.redactForLog(text) });
      return this.safetyCheck(st, text, turn);
    }
    st.attempts += 1;
    if (text) st.misses.push(safety.redactForLog(text, 300));
    if (st.misses.length > 4) st.misses.splice(0, st.misses.length - 4);
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
    // an upset customer with no harm word ("im so mad right now"): calm, one question, the founder one tap away
    if (safety.plainAnger(text)) return turn.select(COPY.upsetTellMore, [COPY.founderButton]);
    if (fromClarify) return turn.say(COPY.rephrase);
    // one question per message: "say it another way?", with the founder as a button, not a second question
    turn.select(COPY.firstMiss, [COPY.founderButton]);
  }

  /** "Is this what you mean?" for an urgent entry the matcher reached without a safety guard. */
  confirmEntry(st, entry, text, turn, m, { safetyChecked = false } = {}) {
    if (st.clarifiedOnce) return this.miss(st, text, turn, m, { safetyChecked });
    st.clarifiedOnce = true;
    st.awaiting = { kind: 'disambiguate', options: [entry.id], text: cap(text), safetyChecked };
    // a statement that matched a 911 entry ("my kid got hurt ...") still hears the 911 line first;
    // a question ("is the pool safe for kids?") does not
    // ... and only when something in it is about harm (round 4: "im so over this right now" ≈ "i feel unsafe right now")
    const lead = entry.answer.startsWith(LINE_911) && !safety.isQuestion(text) && safety.harmCue(text);
    turn.select(lead ? `${LINE_911} ${COPY.confirmOne}` : COPY.confirmOne, [
      { title: entry.question, value: `entry:${entry.id}` },
      { title: COPY.somethingElse, value: 'other' },
    ]);
    turn.log('clarify', {
      kind: 'confirm_urgent',
      text: safety.redactForLog(text),
      candidates: [{ id: entry.id, score: round(m.top.score) }],
    });
  }

  /** "If anyone is hurt or in danger, call 911 first. Is someone hurt or in danger right now?" */
  safetyCheck(st, text, turn) {
    st.awaiting = { kind: 'safety-check', text: cap(text) };
    turn.select(COPY.safetyCheck, COPY.safetyButtons);
    turn.log('clarify', { kind: 'safety_check', text: safety.redactForLog(text) });
  }

  safetyAnswer(st, yes, turn, extra = null) {
    const a = st.awaiting && st.awaiting.kind === 'safety-check' ? st.awaiting : { text: '' };
    st.awaiting = null;
    turn.log('safety_check_answer', { yes });
    if (yes) {
      this.startUrgent(
        st,
        { id: 'distress', route: 'safety-injury', topics: ['possible emergency'], lead911: true, after911: true },
        a.text || 'Customer said someone is hurt or in danger.',
        turn
      );
      // the note is built from the final state, so what they just added still reaches it
      if (extra) this.addDetail(st.handoff, extra);
      return;
    }
    // a handoff we were collecting details for: carry on where we were
    if (st.handoff && st.handoff.status === 'collecting') return this.nextSlot(st, turn);
    if (!a.text) return turn.say(COPY.rephrase);
    // "help" → no: offer the starters, not "say it another way"
    if (this.smallTalk(st, a.text, turn)) return;
    return this.answerOrClarify(st, a.text, turn, { safetyChecked: true });
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
    if (this.isCalm(st)) content = calm(content);
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
      const say = this.isCalm(st) ? calm(route.say) : route.say;
      return turn.say(route.link ? `${say}\n\n${this.abs(route.link)}` : say);
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
    if (!route) return turn.say(this.isCalm(st) ? COPY.okCalm : COPY.ok);
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
    if (a.kind === 'safety-check') {
      // onText answers this question before anything else (safetyReply); kept here so no path drops it
      const reply = safety.safetyReply(text);
      if (reply.kind === 'yes') {
        this.safetyAnswer(st, true, turn, safety.yesNo(text) === 'yes' ? null : text);
        return true;
      }
      if (reply.kind === 'no') {
        this.safetyAnswer(st, false, turn);
        return true;
      }
      // "no, it's about my booking": their new words are the question now
      st.awaiting = null;
      return false;
    }
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
        this.miss(st, a.text, turn, null, { fromClarify: true, safetyChecked: !!a.safetyChecked });
        return true;
      }
      // the same question again is not a pick: run it fresh (it counts towards the two misses)
      if (a.text && this.sameQuestion(text, a.text)) {
        st.awaiting = null;
        return false;
      }
      // typed one of the option titles? Only a near-copy, or a pick the matcher would also choose.
      const titles = opts.map((id) => this.byId.get(id).question);
      const pick = this.pickOption(text, titles);
      if (pick >= 0) {
        const nearCopy = this.titleOverlap(text, titles[pick]) >= 0.8;
        const fresh = nearCopy ? null : this.matcher.match(text, { role: st.role, topic: st.topic });
        if (
          nearCopy ||
          (fresh.top && fresh.top.id === opts[pick] && fresh.top.score >= THRESHOLDS.CLARIFY)
        ) {
          this.answerEntry(st, this.byId.get(opts[pick]), turn, { via: 'clarify', score: 1, text });
          return true;
        }
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
    if (GREETING_ONLY.test(s) || HELP_ONLY.test(s)) {
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
    const bare = bareRole(s);
    if (bare) {
      if (st.role !== bare) {
        st.role = bare;
        turn.log('role_set', { role: bare, via: 'text' });
      }
      st.awaiting = null;
      turn.select(
        bare === 'host' ? COPY.roleHost : COPY.roleSwimmer,
        (this.routes.starters || {})[bare] || []
      );
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
      turn.say(this.isCalm(st) ? COPY.okCalm : COPY.ok);
      return true;
    }
    const yn = safety.yesNo(text);
    if (yn && words <= 3) {
      st.awaiting = null;
      turn.say(yn === 'no' ? COPY.noThanks : this.isCalm(st) ? COPY.okCalm : COPY.ok);
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
      lead911: !!o.lead911,
      question: cap(o.question) || null,
      questionPrompt: o.questionPrompt || null,
      context: cap(o.context) || null,
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
      // no topic label from "talk to a person" itself: the topic comes only from a confident match of their question
      category: null,
      title: 'Customer asked for the founders',
      question: question || (previous && previous.question) || null,
      needBookingRef: mentionsBooking(question),
    });
    // the question we were still clarifying is what they want help with: don't make them repeat it
    // (frustration alone, "your stupid bot is useless", is not a question: then we ask what it's about)
    if (
      !st.handoff.question &&
      st.awaiting &&
      st.awaiting.text &&
      st.awaiting.kind !== 'slot' &&
      safety.questionRemains(st.awaiting.text)
    )
      st.handoff.question = cap(st.awaiting.text);
    const realMisses = st.misses.filter((x) => safety.questionRemains(x));
    if (!st.handoff.question && realMisses.length) st.handoff.question = cap(realMisses.join(' / '));
    if (st.handoff.question) this.enrichHandoff(st, st.handoff);
    if (!st.handoff.question) {
      st.awaiting = { kind: 'slot', slot: 'question' };
      turn.say(this.isCalm(st) ? calm(entry.answer) : entry.answer);
      return;
    }
    const ack = entry.answer.replace(
      /\s*What's it about, so they don't have to ask you again\?\s*$/,
      ''
    );
    turn.say(this.isCalm(st) ? calm(ack) : ack);
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
    const content = urgent || this.isCalm(st) ? calm(answer) : answer;
    st.handoff.lead911 = content.startsWith(LINE_911);
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
      st.lastQuestion = cap(text);
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
    const content = urgent || this.isCalm(st) ? calm(answer) : answer;
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
    st.lastQuestion = cap(text);
    // the rule that answers decides the 911 lead: a hypothetical liability question gets none
    let content = calm(this.stripKnownAsks(answer, st));
    if (guard.lead911 && !content.startsWith(LINE_911)) content = `${LINE_911} ${content}`;
    const lead911 = content.startsWith(LINE_911);
    // they just saw the 911 line in our "is someone hurt?" question: don't say it twice in a row
    if (guard.after911 && lead911) content = content.slice(LINE_911.length).trim();
    // the 911 line is the first thing they see, even ahead of a card-number warning
    if (content.startsWith(LINE_911)) turn.actions.unshift({ type: 'say', content });
    else turn.say(content);
    // a long ramble that ends in an emergency: the note quotes the emergency, the rest is context
    let question = text;
    let context = null;
    if (String(text || '').length > safety.MAX_STORED_CHARS && guard.id) {
      const ex = safety.triggerExcerpt(text, guard.id, this.safetyFix());
      if (ex) {
        question = ex;
        context = `Start of their message: ${safety.capText(text, 300)}`;
      }
    }
    st.handoff = this.baseHandoff(st, {
      reason: 'urgent',
      urgency,
      entryId,
      category,
      title,
      topics: guard.topics || [],
      rule8: !!guard.rule8 || RULE8_ENTRIES.has(entryId),
      lead911,
      question,
      context,
    });
    if (previous) {
      for (const x of [previous.question, ...previous.extra])
        if (x && x !== '(not given)') this.addDetail(st.handoff, x);
    }
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
          this.addDetail(h, text);
          if (!h.needBookingRef && !h.bookingRefAsked) h.needBookingRef = mentionsBooking(text);
          this.enrichHandoff(st, h);
        }
        break;
      }
      case 'detail': {
        this.addDetail(h, text);
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
        // "yeah" to "what's your booking reference?": they have one, so ask for it once more
        if (slot === 'booking_ref' && yn === 'yes' && !h.refReasked) {
          h.refReasked = true;
          return turn.select(COPY.askBookingRefYesNo, [COPY.noRefButton]);
        }
        if (
          human ||
          yn === 'no' ||
          safety.declinesBookingRef(text) ||
          /\?\s*$/.test(text) ||
          /^(where|what|how)\b/.test(s)
        ) {
          st.bookingRefDeclined = true;
          if (!human && !yn && !safety.declinesBookingRef(text)) this.addDetail(h, text);
        } else if (slot === 'booking_ref_yesno') {
          this.addDetail(h, text);
          st.bookingRefDeclined = true;
        } else {
          // only something that looks like a reference ("PRNM-4421", a booking link), never "joe at gmail"
          const ref = safety.findRefToken(text);
          if (ref) st.bookingRef = cap(ref);
          else {
            if (safety.questionRemains(text) && !yn) this.addDetail(h, text);
            st.bookingRefDeclined = true;
          }
        }
        break;
      }
      case 'reply_method': {
        const email = safety.findEmail(text);
        const short = s.split(' ').length <= 5;
        const textOrCall =
          /\b(text|texts|texting|txt|sms|call|calls|calling|phone|cell|ring me|whatsapp)\b/.test(s) ||
          /\d{3}\D{0,2}\d{3}\D?\d{4}/.test(text);
        const wantsEmail =
          /\b(by email|via email|over email|email me|send me an email|email is (better|fine|good|best)|email would be (better|fine|good|best))\b/.test(
            s
          ) ||
          (short && /\b(email|mail|inbox|gmail|outlook)\b/.test(s));
        // a short answer ("chat is fine", "here") or a clear phrase; a long sentence is part of their question
        const wantsChat =
          human ||
          /\b(in chat|this chat|right here|here in chat|in here|reply here|either is fine|either works|either way|doesnt matter|whatever works|chat is fine|here is fine)\b/.test(
            s
          ) ||
          (short && /\b(chat|here|either|whatever|messages?|any|this)\b/.test(s));
        if (email) {
          st.replyMethod = 'email';
          st.email = cap(email);
        } else if (wantsEmail) st.replyMethod = 'email';
        else if (textOrCall && !st.replyNoTextSaid) {
          // say once that texts and calls aren't an option here, then offer the two that are
          st.replyNoTextSaid = true;
          st.replyTries += 1;
          return turn.select(COPY.noTexts, COPY.replyButtons);
        } else if (wantsChat && !textOrCall) st.replyMethod = 'chat';
        else {
          // not an answer: anything with substance is part of their question, never dropped
          const substantive = !textOrCall && safety.questionRemains(text) && !safety.yesNo(text);
          if (substantive) this.addDetail(h, text);
          if (st.replyTries >= 1) st.replyMethod = 'chat';
          else {
            st.replyTries += 1;
            return turn.select(
              substantive ? COPY.addedAskReply : COPY.askReplyMethod,
              COPY.replyButtons
            );
          }
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
      return turn.say(handoffFailed({ injury: !!h.lead911 }));
    }
    // rule 8 comes from what the customer wrote, whichever path led here (founder, two misses, guard, entry)
    if (!h.rule8 && this.customerRule8(st, h)) h.rule8 = true;
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
    if (result.ok && result.capped) {
      // flood cap (D3): logged and labelled, no @mention, not opened. Say only what is true.
      h.status = 'capped';
      h.capped = result.capped;
      h.cappedAt = st.updatedAt;
      h.done = { ...(h.done || {}), ...(result.done || {}) };
      st.awaiting = null;
      const urgent = h.urgency === 'high';
      // "already flagged" only when the founders were alerted about this same open thread;
      // after a resolve or a hand-back it is a new thread, logged in a fresh note without an alert
      const already = result.capped === 'conversation' && st.alertThread;
      turn.say(
        already
          ? urgent
            ? COPY.cappedAlreadyUrgent
            : COPY.cappedAlready
          : urgent
            ? COPY.cappedLoggedUrgent
            : COPY.cappedLogged
      );
      turn.log('escalation_capped', { cap: result.capped, urgency: h.urgency, entry: h.entryId, same_thread: !!already });
      return turn.result(st);
    }
    // the @mention note went out (a full success always includes it): this thread has been alerted
    if (result.ok || (result.done && result.done.note)) st.alertThread = true;
    if (result.ok) {
      h.status = 'sent';
      h.sentAt = st.updatedAt;
      h.done = { ...(h.done || {}), ...(result.done || {}), note: true };
      turn.say(
        handoffConfirmed({
          replyMethod: st.replyMethod,
          email: st.email,
          urgent: h.urgency === 'high',
          calm: this.isCalm(st),
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
      turn.say(handoffFailed({ injury: !!h.lead911 }));
      turn.log('escalation_failed', {
        step: result.step || 'unknown',
        status: result.status || null,
        tries: h.tries,
      });
    }
    return turn.result(st);
  }

  /** No customer message: just try the alert of a handoff logged over a ceiling again (executor sweep). */
  retryDeferred(prevState, ctx = {}) {
    const st = clone(prevState);
    const turn = new Turn();
    if (!this.deferred(st)) return turn.result(st);
    st.updatedAt = ctx.now || Date.now();
    turn.actions.push({ type: 'escalate', deferred: true });
    turn.log('deferred_retry', { cap: st.handoff.capped });
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
    // a new thread: "already flagged" no longer applies, and the 911 line may be said again
    st.alertThread = false;
    st.dangerAt = null;
    st.waitAckSaid = false;
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
        // "am I talking to a bot?" is answered by the label itself: don't say it twice
        const isIdentity = turn.events.some((e) => e.type === 'answered' && e.entry === 'human-are-you-a-bot');
        if (!isGreeting && !isIdentity) {
          const urgent =
            st.handoff &&
            st.handoff.urgency === 'high' &&
            turn.actions.some((x) => x.type === 'escalate');
          if (urgent) {
            const esc = turn.actions.findIndex((x) => x.type === 'escalate');
            turn.actions.splice(esc, 0, { type: 'say', content: COPY.labelLineAfter });
          } else if (a.content.startsWith(LINE_911)) {
            // the 911 line stays the first thing they read
            turn.actions.splice(firstPublic + 1, 0, { type: 'say', content: COPY.labelLineAfter });
          } else if (this.isCalm(st)) {
            // no cheerful "glad you're here" to an angry first message
            turn.actions.splice(firstPublic, 0, { type: 'say', content: COPY.labelLineCalm });
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
    const selects = turn.actions.filter((a) => a.type === 'select');
    if (selects.length) {
      const items = selects[selects.length - 1].items.slice(0, MAX_OFFERED);
      st.offered = items.map((i) => ({ value: String(i.value), title: cap(String(i.title)) }));
      const ever = new Set(st.offeredEver || []);
      for (const i of items) if (STANDING_VALUES.has(i.value)) ever.add(i.value);
      st.offeredEver = [...ever];
      // every select we sent (newest last, one entry per value): older genuine taps are still ours
      const log = (st.offeredLog || []).filter((o) => !st.offered.some((n) => n.value === o.value));
      for (const sel of selects)
        for (const i of sel.items.slice(0, MAX_OFFERED)) {
          const value = String(i.value);
          const k = log.findIndex((o) => o.value === value);
          if (k >= 0) log.splice(k, 1);
          log.push({ value, title: cap(String(i.title)) });
        }
      st.offeredLog = log.slice(-MAX_OFFERED_LOG);
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
    // a brand-new conversation has offered nothing yet: a "founder" tap before any button is forged
    if (!any) return st;
    st.offered = null; // state lost mid-conversation: we can't know which buttons were on screen
    /*
     * A visitor can set conversation custom attributes through the widget, so
     * nothing here is trusted: each value is checked against what the engine
     * itself would have written, and anything else is dropped.
     */
    st.greeted = true;
    if (attrs.prnm_role === 'host' || attrs.prnm_role === 'swimmer') st.role = attrs.prnm_role;
    if (typeof attrs.prnm_topic === 'string' && Object.prototype.hasOwnProperty.call(CATEGORY_SLUG, attrs.prnm_topic))
      st.topic = attrs.prnm_topic;
    if (attrs.prnm_booking_ref) {
      // the engine only ever stores a bare reference token: anything else was not written by us
      const v = String(attrs.prnm_booking_ref).trim();
      const ref = v.length <= 40 && /^[A-Za-z0-9][A-Za-z0-9-]{3,39}$/.test(v) ? safety.findRefToken(v) : null;
      if (ref === v || (ref && ref === v.toLowerCase())) st.bookingRef = ref;
    }
    // prnm_reply_method / prnm_reply_email are ignored: an email reply goes only to an address the customer typed to us
    const attempts = Number(attrs.prnm_attempts);
    if (Number.isFinite(attempts)) st.attempts = attempts >= 1 ? 1 : 0;
    if (attrs.prnm_entry_ids)
      st.entryIds = [
        ...new Set(
          String(attrs.prnm_entry_ids)
            .slice(0, 2000)
            .split(',')
            .filter((id) => this.byId.has(id))
        ),
      ].slice(0, 20);
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
  buildNote(st, { agents = [], conversationUrl = '', capped = null } = {}) {
    const h = st.handoff || {};
    const urgent = h.urgency === 'high';
    // every customer-derived field goes through defang(): only our own agents line may @mention
    const quote = (t) => quoteNote(t || '');
    const mention = (a) => `[@${a.name}](mention://user/${a.id}/${encodeURIComponent(a.name)})`;
    const topic = defang(h.title || (h.category ? h.category : 'customer question'));
    const lines = [];
    lines.push(`PRNM handoff${urgent ? ' (URGENT)' : ''}${capped ? ' (logged, no alert)' : ''}: ${topic}`);
    if (agents.length) lines.push(agents.map(mention).join(' '));
    if (capped) lines.push(CAP_TEXT[capped] || CAP_TEXT.global);
    // a deferred handoff finally alerting: say it waited, so nobody wonders why it is late
    else if (h.status === 'capped' && h.capped)
      lines.push(
        `Logged earlier without an alert (${h.capped === 'global' ? 'hourly ceiling' : 'per-visitor limit'} reached); sent now that a slot is free.`
      );
    lines.push("Either of you: assign it to yourself before replying, so you don't both answer.");
    lines.push('');
    lines.push('Customer question:');
    lines.push(quote(h.question || '(not given)'));
    if (h.context) lines.push(`Context: ${defang(h.context)}`);
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
      `Booking ref: ${st.bookingRef ? defang(st.bookingRef) : st.bookingRefDeclined ? 'customer does not have it' : 'not provided'}`
    );
    lines.push(
      `Reply method: ${
        st.replyMethod === 'email' && st.email
          ? `email to ${defang(st.email)} (reply from support@)`
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

/** Break any Chatwoot mention link in customer text (only the agents line of a note may @mention). */
function defang(t) {
  return String(t == null ? '' : t).replace(/mention:\/\//gi, 'mention:/ /');
}
function quoteNote(t) {
  return defang(t)
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n');
}

const CAP_TEXT = {
  conversation:
    'Not sent as an alert: this conversation already reached its alert limit for the last 24 hours. It stays pending, labelled handoff-capped.',
  contact:
    'Not sent as an alert: this visitor already reached the alert limit for the last 24 hours. It stays pending, labelled handoff-capped.',
  global:
    'Not sent as an alert: the hourly ceiling of handoff alerts was reached. It stays pending, labelled handoff-overflow.',
};

const REASON_TEXT = {
  founder_request: 'customer asked for a person / the founders',
  two_unmatched: "two questions the assistant couldn't match",
  multi_unmatched: "a long message with several questions the assistant couldn't match",
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
  /** Mark the conversation urgent without a new alert: labels + priority + a plain note, then okText. */
  flagUrgent({ labels, note, okText }) {
    this.actions.push({ type: 'flag_urgent', labels, note, okText });
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
