'use strict';
/**
 * Everything that must win over normal question matching:
 *   - sensitive data (card numbers via Luhn, CVV, passwords) → warn + redact
 *   - urgent topics (injury, danger, harassment, unsafe pool, lockout, damage,
 *     insurance/liability, scams, disputes) → immediate human handoff
 *   - questions the bank must not answer (deposits, service animals, unusual
 *     host spaces, ...) → handoff instead of a near-miss answer
 *   - "talk to a human / the founder" → immediate handoff
 * Plus small helpers: booking reference, email, yes/no, mood.
 */
const { clean } = require('./normalize');

// ---------------------------------------------------------------- Luhn / cards
function luhnValid(digits) {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return digits.length > 0 && sum % 10 === 0;
}

const CARD_RUN = /(?:\d[ \-.]?){12,22}\d/g;
const CVV = /\b(?:cvv2?|cvc2?|cv2|csc|security code)\b\s*(?:is|:|#|=)?\s*\d{3,4}\b/gi;
const PASSWORD = /\b(?:my\s+)?(?:password|passcode|passwd|pwd|pw)\s*(?:is|was|=|:|-)\s*\S+/gi;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?:\+?\d[\d\s().-]{8,}\d)/g;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/**
 * Find card-like numbers (13–19 digits passing Luhn). Returns the redacted text
 * and how many were removed. The digits themselves are never returned.
 */
function scanSensitive(text) {
  let s = String(text || '');
  let cards = 0;
  s = s.replace(CARD_RUN, (run) => {
    const digits = run.replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) {
      cards++;
      return '[card number removed]';
    }
    return run;
  });
  let cvv = 0;
  s = s.replace(CVV, () => {
    cvv++;
    return '[security code removed]';
  });
  let passwords = 0;
  s = s.replace(PASSWORD, () => {
    passwords++;
    return '[password removed]';
  });
  return { text: s, cards, cvv, passwords, found: cards + cvv + passwords > 0 };
}

/** Redaction for logs: cards, codes, passwords, emails, phones, booking ids. */
function redactForLog(text, max = 300) {
  let s = scanSensitive(text).text;
  s = s
    .replace(EMAIL, '[email]')
    .replace(UUID, '[booking-ref]')
    .replace(PHONE, (m) => (m.replace(/\D/g, '').length >= 9 ? '[phone]' : m));
  s = s.replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// ----------------------------------------------------------------- extraction
function findEmail(text) {
  const m = String(text || '').match(EMAIL);
  return m ? m[0].toLowerCase() : null;
}

function isValidEmail(s) {
  return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(String(s || '').trim());
}

/** Booking reference: a Sharetribe transaction UUID (alone or inside /order/… or /sale/… links), or "booking ref: X". */
function findBookingRef(text) {
  const s = String(text || '');
  const u = s.match(UUID);
  if (u) return u[0].toLowerCase();
  const m = s.match(
    /\b(?:booking|reservation|order|confirmation)\s*(?:ref(?:erence)?|number|no\.?|#|id|code)\s*(?:is|:|#|=)?\s*#?([A-Za-z0-9][A-Za-z0-9-]{3,39})\b/i
  );
  if (m && !/^(is|the|for|my|and)$/i.test(m[1])) return m[1];
  return null;
}

const YES_WORDS =
  'y|ya|yes|yeah|yea|yep|yup|sure|ok|okay|k|please|please do|yes please|definitely|absolutely|do it|go ahead|sounds good|that would be great|for sure|i do|correct|right';
// to accept an offer ("I can bring in Derek and Brandon"), a plain "ok" is only an acknowledgement
const STRICT_YES_WORDS =
  'y|ya|yes|yeah|yea|yep|yup|sure|please|please do|yes please|definitely|absolutely|do it|go ahead|that would be great|for sure|bring them in|get them|lets do it|yes do it|yeah do it';
const NO_WORDS =
  'n|no|nope|nah|no thanks|no thank you|not now|nevermind|never mind|all good|im good|i am good|thats all|that is all|i dont|no i dont';
const TAIL = '( please| pls| thanks| thank you| thx| that would be great| do it)?';
const whole = (words) => new RegExp(`^(${words})${TAIL}$`);
const lead = (words) => new RegExp(`^(${words})\\b`);
const YES = { whole: whole(YES_WORDS), lead: lead(YES_WORDS) };
const STRICT_YES = { whole: whole(STRICT_YES_WORDS), lead: lead(STRICT_YES_WORDS) };
const NO = { whole: whole(NO_WORDS), lead: lead(NO_WORDS) };
/**
 * 'yes' | 'no' | null. By default the whole message must be the yes/no ("no diving?" is a question,
 * not a no). `prefix: true` accepts a leading yes/no ("no, I don't have one").
 */
function yesNo(text, { strict = false, prefix = false } = {}) {
  const s = clean(text);
  if (!s) return null;
  const k = prefix ? 'lead' : 'whole';
  if (NO[k].test(s)) return 'no';
  if ((strict ? STRICT_YES : YES)[k].test(s)) return 'yes';
  return null;
}

function declinesBookingRef(text) {
  const s = clean(text);
  return (
    /^(no|nope|nah|none|skip|n a|na|not sure|unsure|idk|i dont know|dont know|dunno|i dont have (it|one)|dont have (it|one)|i dont have a booking|no booking|not yet|havent booked|i havent booked|not booked yet|no i dont)\b/.test(
      s
    ) ||
    /\b(dont|do not) have (a |the |my )?(booking|reference|ref|number|it|one)\b/.test(s) ||
    /\b(no|not|havent|have not) (booked|a booking)\b/.test(s)
  );
}

// ----------------------------------------------------------------- mood
const UPSET_WORDS =
  /\b(ridiculous|unacceptable|terrible|awful|worst|furious|angry|pissed|wtf|horrible|disgusting|outrageous|useless|livid|fed up|sick of|joke|unbelievable)\b/;
function mood(text) {
  const raw = String(text || '');
  const s = clean(raw);
  const letters = raw.replace(/[^A-Za-z]/g, '');
  const upper = raw.replace(/[^A-Z]/g, '');
  if (UPSET_WORDS.test(s)) return 'upset';
  if (/!{2,}/.test(raw) && /\?|not|never|still/.test(s)) return 'upset';
  if (letters.length >= 10 && upper.length / letters.length > 0.7) return 'upset';
  return 'neutral';
}

// ----------------------------------------------------------------- guards
/*
 * Each rule: { id, kind, route, topics, rule8, test(s, raw) }
 *   kind 'urgent'  → immediate handoff, entry urgency (high for these)
 *   kind 'handoff' → handoff with slot collection, never a factual answer
 *   kind 'clarify' → one question between two routes
 * route: a bank entry id, or "builtin:<id>" (copy in bank/routes.json)
 * Order matters: the first matching urgent rule picks the reply; every matching
 * rule's topics are collected for the handoff note.
 */
// "am I covered if a guest gets hurt?" is an insurance question, not an injury report
const HYPOTHETICAL_HURT = (s) =>
  /\b(if|what if|in case|incase|suppose|say)\b[^.?!]{0,40}\b(hurt|hurts|injur\w*|accident)\b/.test(
    s
  ) &&
  !/\b(is|got|was|were|been|just|has|have|am|are|im) (hurt|injured|in an accident)\b/.test(
    s.replace(/\b(if|what if|in case)\b[^.?!]*/g, '')
  );
const NOT_ACCOUNT = (s) =>
  !/\b(account|login|password|app|profile|signin|sign in|email|website|site)\b/.test(s);

const RULES = [
  {
    id: 'injury',
    kind: 'urgent',
    route: 'safety-injury',
    topics: ['injury'],
    test: (s) =>
      /\b(emergency|drown\w*|ambulance|911|bleed\w*|blood|unconscious|not breathing|stopped breathing|cpr|seizure|choking|paramedic\w*|hospital|concussion|electrocut\w*|lightning|medical)\b/.test(
        s
      ) ||
      (/\b(hurt|hurts|injur\w*|accident|accidents)\b/.test(s) && !HYPOTHETICAL_HURT(s)) ||
      /\b(slipped|fell|fall|falling) (and|in|into|down|off|over|on)\b/.test(s) ||
      /\bhit (his|her|their|my|its) head\b/.test(s) ||
      /\b(broke|broken) (his|her|their|my|a) (arm|leg|wrist|ankle|nose|tooth|teeth|bone)\b/.test(s),
  },
  {
    id: 'harassment',
    kind: 'urgent',
    route: 'safety-harassment',
    topics: ['harassment'],
    test: (s) =>
      /\b(harass\w*|threat\w*|assault\w*|creep\w*|stalk\w*|groped|grope|touched me|inappropriate\w*|aggressive|abusive|abuse|filming|recording us|recording me|hidden camera|spy\w* on)\b/.test(
        s
      ) ||
      /\b(feel|feels|feeling|felt) (unsafe|scared|threatened|in danger)\b/.test(s) ||
      /\bmade me (feel )?(unsafe|uncomfortable|scared)\b/.test(s),
  },
  {
    id: 'unsafe',
    kind: 'urgent',
    route: 'safety-unsafe-pool',
    topics: ['unsafe'],
    test: (s) =>
      /\b(unsafe|not safe|dangerous|danger|hazard\w*|exposed wire\w*|live wire|electrical (issue|problem|hazard)|sparking)\b/.test(
        s
      ) ||
      /\bgate (does not|doesnt|wont|will not|isnt|not) (latch|close|shut|lock)\w*\b/.test(s) ||
      /\b(no|missing|broken) (fence|fencing|barrier|pool fence)\b/.test(s) ||
      /\bdrain cover\b/.test(s) ||
      /\bbroken glass\b/.test(s) ||
      /\b(green|cloudy|murky|black) water\b|\bwater (looks|is) (green|cloudy|murky)\b/.test(s) ||
      /\b(ladder|railing|rail|handrail|diving board)\b.*\b(loose|wobbly|broken|cracked)\b/.test(s),
  },
  {
    id: 'lockout-or-account',
    kind: 'clarify',
    routes: ['arrive-cant-get-in', 'account-02'],
    titles: ['Locked out at the pool', 'Locked out of my account'],
    prompt: 'Got it. Locked out at the pool, or out of your account?',
    test: (s) =>
      /^(i am |im |we are |were |i got |we got |got )?locked out( again| now| please| help)?$/.test(
        s
      ),
  },
  {
    id: 'lockout',
    kind: 'urgent',
    route: 'arrive-cant-get-in',
    topics: ['lockout'],
    test: (s) =>
      (/\blocked out\b/.test(s) &&
        NOT_ACCOUNT(s) &&
        /\b(pool|gate|yard|backyard|door|house|property|here|outside|host)\b/.test(s)) ||
      (/\b(not|cant|unable to|not able to) (get|getting) (in|inside|into the|through the gate)\b/.test(
        s
      ) &&
        NOT_ACCOUNT(s)) ||
      /\bcnt get in\b/.test(s) ||
      /\bgate code\b.*\b(not|doesnt|wont|isnt|wrong|work)\b/.test(s) ||
      /\b(gate|door) is locked\b/.test(s) ||
      /\b(nobody|no one|noone) (is )?(here|home|answering|around|at the (pool|house))\b/.test(s) ||
      /\b(not|cant) find the (pool|house|place|property)\b/.test(s) ||
      /\b(address is wrong|wrong address)\b/.test(s) ||
      (/\b(were|we are|im|i am) (here|at the pool|at the house|outside)\b/.test(s) &&
        /\b(host|gate|locked|answer\w*|reply\w*|respond\w*|code)\b/.test(s)),
  },
  {
    id: 'host-no-show',
    kind: 'urgent',
    route: 'arrive-cant-get-in',
    topics: ['host no-show'],
    test: (s) =>
      !/\b(what if|if|in case|suppose)\b/.test(s) &&
      /\bhost\b.{0,20}\b(not|never|didnt|hasnt|isnt|wont) (show\w*|here|home|there|arriv\w*|come|came|turn\w* up)\b|\bno ?show\b/.test(
        s
      ),
  },
  {
    id: 'host-no-show-what-if',
    kind: 'handoff',
    route: 'builtin:host-no-show',
    topics: ['host no-show'],
    test: (s) =>
      /\b(what if|if|in case|suppose)\b/.test(s) &&
      /\bhost\b.{0,20}\b(not|never|didnt|doesnt|dont|wont) (show\w*|arriv\w*|come|turn\w* up)\b|\bno ?show\b/.test(
        s
      ),
  },
  {
    id: 'damage',
    kind: 'urgent',
    route: 'safety-damage',
    topics: ['damage'],
    rule8: true,
    test: (s) =>
      /\b(damag\w*|vandal\w*|cracked|ruined|destroyed|smashed|shattered)\b/.test(s) ||
      /\bbroke (a|an|the|my|our|his|her|their|some|something|stuff|things|it|furniture|chair)\b/.test(
        s
      ) ||
      /\b(file|filing|make|submit|open) (a )?(damage )?claim\b|\bclaims?\b/.test(s),
  },
  {
    id: 'waiver',
    kind: 'handoff',
    route: 'rules-waiver',
    topics: ['waiver'],
    rule8: true,
    test: (s) => /\b(waiver|waivers|waver|release form|liability form|sign a release)\b/.test(s),
  },
  {
    id: 'insurance',
    kind: 'urgent',
    route: 'safety-insurance',
    topics: ['insurance'],
    rule8: true,
    test: (s) =>
      /\b(insur\w*|insurence|liabilit\w*|coverage|homeowner\w*|lawsuit\w*|sue|sues|sued|suing|lawyer\w*|attorney|legal action|guarantee\w*|indemn\w*|protection plan|host protection)\b/.test(
        s
      ) ||
      /\b(am i|are we|are you|is (my|the|our) (pool|home|house|property|backyard)|is it|is this|are hosts|are guests|would i be|will i be) covered\b/.test(
        s
      ) ||
      /\bcovered (by|if|for|under|when)\b/.test(s) ||
      /\b(who|what) (pays|covers)\b|\bcover (the )?(damage|costs?|bills?|it|this|me|us|injur\w*|medical)\b/.test(
        s
      ),
  },
  {
    id: 'scam',
    kind: 'urgent',
    route: 'safety-scam-report',
    topics: ['scam'],
    test: (s) =>
      /\b(scam\w*|fraud\w*|phish\w*|impersonat\w*|pretending to be|identity theft|stolen card)\b/.test(
        s
      ) ||
      /\bfake (listing|host|guest|text|email|message|link|site|website|account|review)\b/.test(s) ||
      /\basked (me )?for my (password|card|bank|login|code)\b/.test(s) ||
      /\bsuspicious (link|text|email|message|listing|host|call)\b/.test(s),
  },
  {
    id: 'guest-breaking-rules',
    kind: 'urgent',
    route: 'dispute-guest-breaking-rules',
    topics: ['guest dispute'],
    test: (s) =>
      /\bguests? (wont|will not|refuse to|refuses to|not) leav\w*\b/.test(s) ||
      /\b(throwing|having) a party\b/.test(s) ||
      /\b(guest|guests|renter|renters)\b.*\b(brought|bringing) (too many|extra|more)\b/.test(s) ||
      /\btoo many (people|ppl|guests) (at|in) my (pool|house|yard|backyard)\b/.test(s) ||
      /\b(my|the) (guest|guests|renter|renters) (is|are) (breaking|being|drunk|rude|disrespectful)\b/.test(
        s
      ),
  },
  {
    id: 'dispute-charge',
    kind: 'urgent',
    route: 'builtin:dispute-charge',
    topics: ['billing dispute'],
    test: (s) =>
      /\b(chargeback\w*|charge back|dispute\w*|charged twice|double charged|charged double|overcharged|over charged|wrong (charge|amount)|charged (the )?wrong|billing (error|mistake|issue|problem)|unauthori[sz]ed (charge|payment)|did not authori[sz]e|didnt authori[sz]e)\b/.test(
        s
      ) ||
      (/\brefund\w*\b/.test(s) &&
        !/\b(cancel\w*|deposit\w*|policy|refundable|non refundable)\b/.test(s) &&
        /\b(want|need|give me|demand|deserve|request\w*|owe\w*|where is|wheres|still|never|not|asap|now|my refund|refund me|refund my|full refund|please|pls)\b/.test(
          s
        )),
  },
  // ----- near-misses the bank must not answer -----------------------------
  {
    id: 'refund-question',
    kind: 'handoff',
    route: 'builtin:refund-question',
    topics: ['refund'],
    // refunds outside "if I cancel" / "the host cancelled" have no published rule
    test: (s) =>
      /\brefund\w*\b/.test(s) &&
      !/\b(cancel\w*|hostcancelled|policy|refundable|non refundable|weather|rain\w*|storm\w*)\b/.test(
        s
      ) &&
      !/\bdeposits?\b/.test(s),
  },
  {
    id: 'deposit',
    kind: 'handoff',
    route: 'builtin:deposit-question',
    topics: ['deposit'],
    test: (s) => /\bdeposits?\b/.test(s) && !/\bdirect deposits?\b/.test(s),
  },
  {
    id: 'service-animal',
    kind: 'handoff',
    route: 'builtin:service-animal',
    topics: ['service animal'],
    test: (s) =>
      /\b(service|support|assistance|guide|therapy) (animal|dog|pet)s?\b|\besa\b/.test(s),
  },
  {
    id: 'host-eligibility',
    kind: 'handoff',
    route: 'builtin:host-eligibility',
    topics: ['host eligibility'],
    test: (s) =>
      /\b(apartment|apartments|condo|condos|hoa|community|complex|building|gym|hotel|motel|public|club|clubhouse|shared) (pool|pools|hottub)\b/.test(
        s
      ) ||
      /\b(no|without|dont have) (a )?pool\b/.test(s) ||
      /\b(only|just) (a |have a |has a )?(hottub|coldplunge|sauna|backyard|yard)\b/.test(s),
  },
  {
    id: 'host-booking-limits',
    kind: 'handoff',
    route: 'builtin:host-booking-limits',
    topics: ['booking limits'],
    test: (s) =>
      (/\b(change|edit|update|set|lower|raise|remove|adjust)\b.*\b(my )?(minimum|min|maximum|max) (hours?|booking|time|length)\b/.test(
        s
      ) &&
        /\bmy\b/.test(s)) ||
      /\b(change|edit|update|set|lower|raise|remove|adjust)\b.*\badvance notice\b/.test(s),
  },
  {
    id: 'payout-account-change',
    kind: 'handoff',
    route: 'builtin:payout-account-change',
    topics: ['payout account'],
    test: (s) =>
      /\b(change|switch|wrong|update)\b.*\b(payout|stripe|bank)\b.*\bcountry\b|\b(change|switch|wrong)\b.*\bcountry\b.*\b(payout|stripe|bank)\b/.test(
        s
      ) ||
      /\b(individual|company|business) account\b.*\b(wrong|change|switch|instead)\b|\b(wrong|change|switch)\b.*\b(individual|company) account\b/.test(
        s
      ),
  },
  {
    id: 'closed-listing-bookings',
    kind: 'handoff',
    route: 'builtin:closed-listing-bookings',
    topics: ['closing a listing'],
    test: (s) =>
      /\b(close|closed|closing|hide|pause|paused|deactivate|unlist|turn off|take down)\b.*\b(listing|pool)\b/.test(
        s
      ) &&
      /\b(existing|upcoming|already|accepted|current|future) (booking|bookings|reservation|reservations|guests)\b|\bwhat happens to\b/.test(
        s
      ),
  },
  {
    id: 'partnership',
    kind: 'handoff',
    route: 'builtin:partnership',
    topics: ['partnership/press'],
    test: (s) =>
      /\b(partnership|partner with|collab\w*|sponsor\w*|press|journalist|reporter|interview|media inquiry|investor|invest in)\b/.test(
        s
      ) ||
      /\b(work (for|with) (you|prnm|pool rental near me)|job|jobs|hiring|career|careers|employment|internship)\b/.test(
        s
      ),
  },
];

/**
 * @param {string} raw     customer text (already card/password-redacted)
 * @param {string} [alt]   spell-corrected version of the same text (catches typos)
 * @returns {null | { id, kind, route, topics, rule8, routes?, titles?, prompt?, all: string[] }}
 */
function detectGuards(raw, alt) {
  const variants = [clean(raw)];
  if (alt) {
    const a = clean(alt);
    if (a && a !== variants[0]) variants.push(a);
  }
  const hits = [];
  for (const rule of RULES) {
    if (variants.some((s) => rule.test(s))) hits.push(rule);
  }
  if (!hits.length) return null;
  const first = hits[0];
  const topics = [...new Set(hits.flatMap((h) => h.topics || []))];
  return {
    id: first.id,
    kind: first.kind,
    route: first.route,
    routes: first.routes,
    titles: first.titles,
    prompt: first.prompt,
    topics,
    rule8: hits.some((h) => h.rule8),
    all: hits.map((h) => h.id),
  };
}

// ----------------------------------------------------------------- founder / human request
const HUMAN_TARGET =
  '(human|humans|person|someone|somebody|agent|representative|rep|founder|founders|derek|brandon|support|team|staff|manager|operator|real person|realperson|whoever runs this|whoever runs it)';
const ASK_FOR_HUMAN = new RegExp(
  `\\b(talk|speak|chat|connect|transfer|put me through|get me|give me|reach|contact|escalate)\\b.{0,30}\\b${HUMAN_TARGET}\\b`
);

/** True when the customer is asking for a person (not asking whether this is a bot). */
function wantsHuman(text) {
  const s = clean(text);
  if (!s) return false;
  if (
    /^(a |the )?(human|humans|agent|person|founder|founders|operator|representative|real person|support)( please| pls| plz| now| asap)?$/.test(
      s
    )
  )
    return true;
  if (/^(human|agent|representative|operator) (please|pls|plz)\b/.test(s)) return true;
  // "talk to the host" is about the pool's host, not us
  if (
    /\b(talk|speak|chat|message|contact|reach)\b.{0,15}\b(the |a |my |this )?(host|hosts|pool owner|owner|guest|renter)\b/.test(
      s
    )
  )
    return false;
  const identityQuestion =
    /^(am i|are you|r u|are u|is this|is that|is it|who am i|who is this|who are you)\b/.test(s);
  const explicitAsk =
    /\b(i want|i need|id like|i would like|can i|could i|may i|let me|get me|give me|connect me|transfer me|put me|please|pls)\b/.test(
      s
    );
  if (identityQuestion && !explicitAsk) return false;
  // "how do I contact support?" asks for contact details (bank entry), not for a person right now
  if (/^(how|where|what|whats)\b/.test(s) && !/\b(talk|speak|chat|connect)\b/.test(s)) return false;
  if (ASK_FOR_HUMAN.test(s)) return true;
  if (/\b(not a bot|no bots?|stop the bot|enough bot)\b/.test(s)) return true;
  if (/\bi (want|need) (a|an) (human|person|real person|agent)\b/.test(s)) return true;
  if (/\b(want|need)\b.{0,12}\b(the )?founders?\b/.test(s)) return true;
  return false;
}

// Words that only express "get me a person"; anything else left over is the question itself.
const HUMAN_REQUEST_WORDS = new Set(
  (
    'talk speak chat connect transfer reach contact escalate put through get give human humans person someone somebody ' +
    'agent representative rep founder founders derek brandon support team staff manager operator real realperson ' +
    'whoever runs run this bot bots not no please pls want need like would could may can let me now asap'
  ).split(' ')
);
function questionRemains(text) {
  return (
    clean(text)
      .split(' ')
      .filter(
        (w) =>
          w &&
          !HUMAN_REQUEST_WORDS.has(w) &&
          w.length > 2 &&
          !/^(the|and|for|you|are|with|about|just|okay|thanks)$/.test(w)
      ).length > 0
  );
}

module.exports = {
  luhnValid,
  scanSensitive,
  redactForLog,
  findEmail,
  isValidEmail,
  findBookingRef,
  yesNo,
  declinesBookingRef,
  mood,
  detectGuards,
  wantsHuman,
  questionRemains,
  RULES,
};
