'use strict';
/**
 * Everything that must win over normal question matching:
 *   - sensitive data (card numbers via Luhn, CVV, passwords) → warn + redact
 *   - urgent topics (injury, danger, harassment, unsafe pool, lockout, damage,
 *     insurance/liability, scams, theft, disputes) → immediate human handoff
 *   - questions the bank must not answer (refunds, deposits, service animals,
 *     unusual host spaces, "is this site legit", ...) → handoff instead of a near-miss answer
 *   - "talk to a human / the founder" → immediate handoff
 * Plus small helpers: booking reference, email, yes/no, mood, rule-8 detection.
 *
 * Safety vocabulary is deliberately broad (many ways to describe an emergency)
 * AND precise: idioms such as "drowning in requests", "fire up the grill" or
 * "cut my price" are removed before the checks run, and every bank phrasing is
 * tested so a guard never hijacks an ordinary question (test/safety.test.js).
 */
const { clean } = require('./normalize');

// ---------------------------------------------------------------- limits (D4)
/** Only this much of one customer message is ever processed. */
const MAX_INPUT_CHARS = 1500;
/** Every string the assistant stores (state, notes) is capped at this length. */
const MAX_STORED_CHARS = 500;

/** Cap a string without splitting a surrogate pair; adds "…" when cut. */
function capText(text, max = MAX_STORED_CHARS) {
  const s = String(text == null ? '' : text);
  if (s.length <= max) return s;
  let cut = s.slice(0, Math.max(0, max - 1));
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return `${cut}…`;
}

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
const EMAIL = /[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{1,190}\.[A-Z]{2,24}/gi;
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

/**
 * Cap an incoming message to MAX_INPUT_CHARS, redacting first over a slightly
 * longer window so a card number that straddles the cut is still removed whole.
 */
function prepareInput(text) {
  const raw = String(text == null ? '' : text);
  const truncated = raw.length > MAX_INPUT_CHARS;
  const windowed = truncated ? raw.slice(0, MAX_INPUT_CHARS + 64) : raw;
  const sens = scanSensitive(windowed);
  let out = sens.text;
  if (out.length > MAX_INPUT_CHARS) {
    out = out.slice(0, MAX_INPUT_CHARS);
    const last = out.charCodeAt(out.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1);
  }
  return { ...sens, text: out.trim(), truncated, originalLength: raw.length };
}

/** Redaction for logs: cards, codes, passwords, emails, phones, booking ids. */
function redactForLog(text, max = 300) {
  let s = scanSensitive(capText(text, MAX_INPUT_CHARS)).text;
  s = s
    .replace(EMAIL, '[email]')
    .replace(UUID, '[booking-ref]')
    .replace(PHONE, (m) => (m.replace(/\D/g, '').length >= 9 ? '[phone]' : m));
  s = s.replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// ----------------------------------------------------------------- extraction
/** The question without the booking ids and email addresses we already captured (they only add noise to matching). */
function stripRefs(text) {
  return String(text || '')
    .replace(UUID, ' ')
    .replace(EMAIL, ' ');
}

function findEmail(text) {
  const m = String(text || '').match(EMAIL);
  return m ? m[0].toLowerCase() : null;
}

function isValidEmail(s) {
  return /^[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{1,190}\.[A-Z]{2,24}$/i.test(String(s || '').trim());
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

/**
 * A reference typed at the "what's your booking reference?" prompt: a UUID, or
 * one token of 4-40 letters/digits/hyphens that contains a digit ("PRNM-4421").
 * Anything else ("joe at gmail") is not a reference.
 */
function findRefToken(text) {
  const exact = findBookingRef(text);
  if (exact) return exact;
  const toks = String(text || '').match(/[A-Za-z0-9][A-Za-z0-9-]{2,39}/g) || [];
  for (const t of toks) {
    if (t.length >= 4 && t.length <= 40 && /\d/.test(t) && /^[A-Za-z0-9-]+$/.test(t)) {
      // a phone number is not a booking reference
      if (/^\d{7,}$/.test(t) || /^\d{3}-\d{3}-\d{4}$/.test(t)) continue;
      return t;
    }
  }
  return null;
}

const YES_WORDS =
  'y|ya|yes|yeah|yea|yep|yup|sure|ok|okay|k|please|please do|yes please|definitely|absolutely|do it|go ahead|sounds good|that would be great|for sure|i do|correct|right|thats it|that one';
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
  /\b(ridiculous|unacceptable|terrible|awful|worst|furious|angry|pissed|wtf|horrible|disgusting|outrageous|useless|livid|fed up|sick of|joke|unbelievable|scam artists|bullshit|bs|garbage|trash|pathetic|incompetent|insane|crazy|fuming|mad|frustrat\w*|annoy\w*|disappoint\w*|upset|ruin\w*|complain\w*|bbb|better business bureau|sue|suing|lawyer\w*|attorney\w*|not happy|unhappy|so done|irritat\w*|scammers?|thieves|thief|rip ?off|ripped off)\b/;
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

// ----------------------------------------------------------------- vocabulary
const alt = (words) => `(?:${words})`;
// people, as nouns ("my son", "the guest")
const PNOUN = alt(
  'guest|guests|kid|kids|child|children|son|sons|daughter|daughters|baby|babies|toddler|infant|boy|boys|girl|girls|' +
    'friend|friends|wife|husband|mom|mum|dad|mother|father|brother|sister|swimmer|swimmers|man|woman|guy|lady|' +
    'person|people|grandma|grandpa|grandmother|grandfather|nephew|niece|cousin|partner|boyfriend|girlfriend|' +
    'teen|teenager|renter|nanny|sitter|neighbor|neighbour|student|students|stepson|stepdaughter|grandson|granddaughter|' +
    'homie|buddy|kiddo|dude|bf|gf|hubby|bestie|twin|twins|grandkid|grandkids|toddlers|infants|teens|teenagers|' +
    'men|women|guys|ladies|lifeguard|stranger|bro|sis|lil bro|lil sis|little bro|little sis|little brother|little sister|' +
    'little one|lil one|aunt|auntie|uncle|fiance|fiancee|mama|papa|mommy|daddy'
);
// a child or young person, including "my 4 year old"
const AGE = '\\d+ ?(?:year old|yr old|yrs old|yo|years old|month old|months old)s?';
const CHILD = alt(
  'son|sons|daughter|daughters|kid|kids|child|children|baby|babies|toddler|toddlers|infant|boy|boys|girl|girls|' +
    'teen|teens|teenager|teenagers|nephew|niece|grandson|granddaughter|grandkid|grandkids|stepson|stepdaughter|' +
    `little one|little ones|lil one|kiddo|kiddos|minor|${AGE}`
);
// who something happens to, as a sentence subject. No possessives: "my booking got cut" is not a person.
const SUBJ = alt(`i|im|we|he|hes|she|shes|they|theyre|someone|somebody|anyone|anybody|everyone|${PNOUN}`);
// third person only, for checks where "I" would be ambiguous ("I can't wake up that early")
const OTHERSUBJ = alt(`he|hes|she|shes|they|theyre|someone|somebody|${PNOUN}`);
const OBJ = alt(`me|us|him|her|them|${PNOUN}`);
const POSS = alt('my|his|her|their|our|your|a|the|its|one of|both|one of my|one of the');
// a body part, unless it is a modifier ("the back door", "the arm of the chair")
const BODY = `${alt(
  'head|face|eye|eyes|foot|feet|toe|toes|hand|hands|finger|fingers|thumb|arm|arms|leg|legs|knee|knees|ankle|ankles|' +
    'wrist|wrists|back|neck|chin|lip|lips|mouth|tooth|teeth|nose|skin|shoulder|shoulders|hip|hips|elbow|elbows|ear|ears|' +
    'forehead|chest|stomach|belly|bone|bones|rib|ribs|scalp|heel|heels|throat|tongue|jaw'
)}\\b(?! (?:door|doors|gate|gates|yard|deck|porch|patio|wall|fence|seat|seats|window|windows|steps|stairs|side|of the|of my|of a|light|lights|end|towel|towels|rest|board|pain medicine))`;
const ADJ = '(?:(?:left|right|own|little|big|poor) )?';
const ELEC = alt(
  'light|lights|water|ladder|rail|railing|handrail|pump|heater|outlet|wire|wires|panel|cord|switch|fence|electricity|' +
    'metal|filter|socket|plug|hottub|spa|lamp|pool light|pool lights|jets'
);
const PROP = alt(
  'pool|liner|deck|patio|filter|pump|heater|chair|chairs|furniture|umbrella|umbrellas|grill|table|tables|fence|gate|' +
    'door|doors|window|windows|glass|tile|tiles|light|lights|cover|ladder|slide|diving board|toilet|toilets|bathroom|' +
    'towel|towels|floor|floors|wall|walls|lawn|yard|backyard|garden|plants|car|couch|cushion|cushions|speaker|tv|house|' +
    'home|property|stuff|things|something|anything|everything|place|hottub|spa|skimmer|drain|jets|lounger|loungers|' +
    'cabana|shed|rug|mat|pavers|concrete|plaster|screen|screens|sprinkler|hose|float|floats|toys|equipment|railing|' +
    'stairs|steps|sink|shower|kitchen|appliance|appliances|bbq|fire pit|firepit|pergola|gazebo|landscaping|pool liner'
);
const PROP_FIXED = alt(
  'pool|liner|deck|patio|filter|pump|heater|furniture|fence|gate|tile|tiles|cover|ladder|slide|diving board|hottub|' +
    'spa|skimmer|drain|plaster|concrete|pavers|screen|screens|window|windows|door|glass|light|lights|toilet|chair|chairs|' +
    'table|grill|umbrella|couch|car'
);
const BELONG = alt(
  'phone|cell|cellphone|iphone|bag|bags|purse|wallet|keys|key|stuff|things|belongings|sunglasses|glasses|towel|towels|' +
    'clothes|shoes|sandals|flip flops|watch|jewelry|ring|necklace|bracelet|earrings|laptop|ipad|tablet|camera|speaker|' +
    'cooler|float|floats|toys|backpack|airpods|headphones|charger|kindle|cash|car|bike|goggles|swimsuit|hat|jacket|stroller'
);
const r = (src) => new RegExp(src);

// Idioms that look alarming but are not ("drowning in requests", "fire up the grill").
const BENIGN = [
  /\bdrown(?:ing|ed|s)? in (?!(?:the |a |my |our |their |this |that )?(?:pool|water|deep end|deep|hottub|spa|lake|river|ocean|sea)\b)\w+/g,
  /\bdrown(?:ed|ing|s)? out\b/g,
  /\bfire (?:up|it up|them up|pit|pits|place|places|works|wood|fly|flies|extinguishers?|safety|code|codes|marshal|department rules)\b/g,
  /\bfired up\b/g,
  /\b(?:burn|burns|burned|burnt|burning) (?:through|thru|out on|my budget|money|cash|a hole)\b/g,
  /\bcut (?:my |the |your |our |their |a |his |her |any |some |down on |back on )?(?:price|prices|rate|rates|cost|costs|fee|fees|hours|hour|time|booking|bookings|session|sessions|listing|budget|deal|losses|ties|corners|check|checks|it short|short|off|out|back|down|in line|me some slack|a deal)\b/g,
  /\b(?:your|the|their|a|our|my|platform|service|prnm|host s|hosts) cut\b/g,
  /\b(?:a|little|tiny|wee|quite a|just a|bit of a) bit\b|\bbit by bit\b/g,
  /\bbite ?sized?\b|\bbitesize\b|\bbite to eat\b/g,
  /\b(?:sticker )?shock(?:ed)? (?:at|by|about|with) (?:the |that |this |how |your |my )?(?:price|prices|bill|fee|fees|cost|costs|total|charge|charges|amount|reply|response|message|much)\b/g,
  /\bsticker shock\b/g,
  /\b(?:price|prices|fee|fees|cost|costs|total|bill|charge|charges|amount|number|quote)s? (?:\w+ )?(?:shocked|shocks|shocking) (?:me|us)\b/g,
  // "cough up the money" is an idiom; "coughing up water / blood" is a drowning sign
  /\bcough(?:ed|ing|s)? up\b(?! (?:water|blood|pool water|chlorine|foam|vomit))/g,
  // toys and tools, not weapons
  /\b(?:water|squirt|nerf|toy|bb|super ?soaker|glue|heat|massage|nail|spray|staple|paint|caulk|caulking) guns?\b/g,
  /\bhit (?:me|us|him|her|them) up\b|\bit (?:just |finally |suddenly )?hit me (?=that|how|when|what|why)|\bkick(?:ed|ing|s)? (?:me|us|him|her|them) out\b/g,
  // a phone or laptop screen is the customer's own device, not the host's property
  /\b(?:my|his|her|our|their|the|a) (?:phone|cell|cellphone|iphone|android|laptop|tablet|ipad|computer|kindle|watch|tv) (?:screen|screens|glass)\b/g,
  /\bsmoke ?free\b|\bno smoking\b|\bnon smoking\b|\bsmoking (?:allowed|ok|okay|area|policy|rules?)\b|\bcan (?:i|we|guests) smoke\b|\bsmoke (?:weed|cigarettes|cigars|a cigar|a vape|vape)\b/g,
  /\bgas (?:grill|grills|heater|heaters|bbq|money|station|fireplace|fire pit|firepit|stove|prices?)\b/g,
  /\bemergency contacts?\b|\bin case of (?:an )?emergenc\w*|\bfor emergencies\b|\bemergency (?:fund|plan|policy|procedures?|number for the host)\b/g,
  /\bcpr (?:certif\w*|cert|certs|certified|trained|training|class|classes|card)\b|\b(?:know|knows|learn) cpr\b/g,
  // "the booking fell through" is a plan; "my son fell through the pool cover" is a fall
  /\bfell (?:in love|asleep|behind|apart|short|for)\b|\bf[ae]ll through\b(?! (?:the|a|an|my|our|his|her|their|into|onto|ice|thin|some|that|this)\b)|\bfall (?:asleep|behind|apart|in love)\b|\bslipped (?:up|my mind|through|away|out)\b|\btripped (?:up|the breaker|a breaker)\b/g,
  // "my kids are drowning me in requests", "the kids are gonna drown me in questions"
  /\bdrown(?:ing|s|ed)? (?:me|us|him|her|them|you) (?:in|with)\b/g,
  // "choking on how expensive this is", "almost passed out when he saw the price"
  /\bchok\w* on (?:the |how |that |this |your |these |those )?(?:price|prices|bill|fee|fees|cost|costs|total|expensive|much|quote|number)\b/g,
  /\b(?:almost |nearly |practically |about to |gonna |going to )?(?:passed|pass|passing) out (?:when|after|at|over|seeing|from) (?:(?:he|she|i|we|they|my \w+) (?:saw|seen|looked at|got|read|checked) )?(?:the |that |this |our |my |your )?(?:price|prices|bill|total|fee|fees|cost|costs|quote|charge|charges|number)\b/g,
  /\bdying (?:of|from|in|with) (?:the |this )?(?:boredom|laughter|laughing|heat|thirst|hunger|excitement|curiosity|cuteness|anticipation)\b/g,
  // "my kid is crying because we can't swim today", "struggling to decide which pool to book"
  /\bcr(?:y|ies|ying|ied) (?:because|cause|cuz|bc|about|over|that|for|when) (?:we|they|i|he|she|it|the|our|his|her|there|theres|there s|you|its)\b/g,
  /\bstruggl\w* (?:to|with) (?:decide|deciding|choose|choosing|pick|picking|find|finding|figure|figuring|book|booking|understand|use|using|log|login|sign|signing|pay|paying|upload|uploading|list|listing|set up|setting up|get the|navigate)\b/g,
  /\bf[ae]lls? on (?:a |the |my )?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|weekend|holiday|day|date|birthday)\b/g,
  /\bhurt (?:my|our|the|your|his|her) (?:listing|listings|ranking|rankings|rating|ratings|reviews?|chances|business|bookings?|wallet|budget|feelings|search|visibility|profile)\b/g,
  /\bpass(?:ed|ing)? out (?:the |some )?(?:flyers|fliers|cards|towels|snacks|drinks|food|invites|invitations|candy|waters)\b/g,
  /\bchoking hazard\b/g,
  /\bkid ?friendly\b|\bkids friendly\b|\bchild ?friendly\b|\bfamily friendly\b/g,
  /\bsexual orientation\b/g,
  /\btouch(?:ed|ing)? (?:base|up|bases)\b|\bin touch\b|\bkeep in touch\b/g,
  /\bheated\b/g,
  /\b(?:dying|die) to\b/g,
  /\bbreak (?:even|the ice|a sweat)\b|\bbroke even\b|\bbreak down (?:the|of)\b|\bbreakdown\b/g,
  /\bbleeding (?:money|cash)\b|\blightning (?:fast|quick)\b/g,
  // "I almost had a heart attack at the price" (not "I think he's about to have a heart attack")
  /\b(?:almost|nearly|practically|about to|gonna|going to|could have|could ve)\b(?: \w+){0,2} heart attack\b(?= (?:\w+ ){0,4}(?:price|prices|pricing|pricey|bill|fee|fees|cost|costs|total|charge|charges|quote|number|cheap|expensive|much|deal|rate|rates|lol|lmao|haha|jk)\b)|\bheart attack (?:at|over|when i saw|from) (?:the |that |this |your )?(?:price|prices|bill|fee|fees|cost|costs|total|charge|charges)\b/g,
];
function benign(s) {
  let out = ` ${s} `;
  for (const re of BENIGN) out = out.replace(re, ' ');
  return out.replace(/\s+/g, ' ').trim();
}

// "if", "what if", "in case" open a hypothetical clause that runs to the end of the sentence part
const HYPO = /\b(?:what if|whatif|what happens if|what would happen if|if|in case|incase|suppose|supposing|hypothetically|in the event)\b/;
const stripHypo = (p) => {
  const m = p.match(HYPO);
  return m ? p.slice(0, m.index).trim() : p;
};

// ----------------------------------------------------------------- injury and danger
const INJURY_STRONG = r(
  `\\b(?:${[
    'emergency',
    'ambulance',
    '911',
    'paramedics?',
    'emergency room',
    'urgent care',
    'drown\\w*',
    'bleed\\w*',
    'blood',
    'unconscious',
    'not breathing',
    'stopped breathing',
    'stop breathing',
    'barely breathing',
    '(?:cant|cannot|can t|couldnt|could not|not able to|unable to) breathe?',
    'trouble breathing',
    '(?:hard time|a hard time|problems?) breathing',
    '(?:screaming|yelling|calling|crying|shouting) for help',
    'hard to breathe',
    'struggling to breathe',
    'difficulty breathing',
    'short of breath',
    'gasping',
    // CPR being done, not "do hosts know CPR" (BENIGN removes that) or "do I need CPR to host"
    '(?:doing|giving|performing|started|starting|start|gave|did|do|give) cpr(?: on| to)?',
    'cpr (?:on|now|right now)',
    'needs cpr',
    'seizure\\w*',
    'seizing',
    'convuls\\w*',
    'choking',
    'choked',
    'concuss\\w*',
    'face ?down',
    'chest pains?',
    'chest (?:hurts|is hurting|is tight|feels tight|tightness|pressure)',
    'tight chest',
    '(?:panic|anxiety) attack',
    'wheez\\w*',
    'cough(?:ing|ed|s)? (?:up )?(?:water|blood|pool water)',
    '(?:isnt|wasnt|aint|stopped|stop|not) breath(?:ing|in)',
    'zapped',
    'hit (?:his |her |their |my |its )?(?:head )?(?:on )?the bottom',
    '(?:turning|turned|went|gone|going) (?:purple|grey|gray)',
    '(?:lips?|face|skin|fingers|nails) (?:is |are |went |turned |turning |going |gone |looks? |looking |getting )?(?:blue|purple|grey|gray)',
    '(?:cant|cannot|can t|couldnt|could not|unable to|not able to) (?:feel|move) (?:his|her|my|their|our) (?:legs?|arms?|body|hands?|feet|foot|toes|fingers|neck|face)',
    '(?:cant|cannot|can t|couldnt|could not|unable to|trying to|struggling to) catch (?:his|her|my|their|our) breath',
    'struggling to (?:swim|stay up|stay afloat|keep (?:his|her|their|my) head)',
    'stabb?(?:ed|ing)',
    'shots? fired',
    'active shooter',
    '(?:got|been|was|is|were|being) shot',
    'shot (?:him|her|them|me|us|someone|somebody|at)',
    'electrocut\\w*',
    'electric shock',
    'electrical shock',
    'lightning',
    'passed out',
    'passing out',
    '(?:gonna|going to|about to|might|could) pass out',
    'fainted',
    'fainting',
    'feel(?:s|ing)? faint',
    'about to faint',
    'not waking(?: up)?',
    'allergic reaction',
    'anaphyla\\w*',
    'epi ?pen',
    'asthma attack',
    'heart attack',
    'cardiac',
    '(?:having|had|has|is having) a stroke',
    'heat ?stroke',
    'sun ?stroke',
    'heat exhaustion',
    'overdos\\w*',
    'hives',
    'swallowed (?:a lot of |a bunch of |some |too much |so much )?(?:pool )?(?:water|chlorine|chemicals?)',
    '(?:chlorine|chemical) (?:burn|burns|poisoning)',
    'poisoned',
    'sprain\\w*',
    'fractur\\w*',
    'dislocat\\w*',
    'stung',
    '(?:bee|wasp|hornet|jellyfish|scorpion) stings?',
    'stitches',
    'vomit\\w*',
    'throwing up',
    'threw up',
    'puking',
    'puked',
    'medical (?:emergency|help|attention)',
    // on the way to / at the hospital, not "I work at a hospital"
    '(?:taken|took|take|taking|rushed|rushing|rush|going|went|go|headed|heading|drive|driving|drove|bring|brought|bringing) (?:\\w+ )?(?:to )?(?:the |a )?(?:hospital|er)',
    '(?<!work |works |working |worked |nurse |doctor |volunteer )(?:in|at) the (?:hospital|er)',
    'on (?:the|our|my) way to the (?:hospital|er)',
    'injur\\w*',
    // an accident with a person, not "an accident in my booking dates"
    '(?:there was|there s|theres|there has been|had|has had|have had|got in|been in|was in|were in|is an|bad|terrible|serious|horrible|scary|nasty) (?:an? )?(?:\\w+ )?accident(?! (?:in|with|on|for) (?:my|the|our|this) (?:booking|bookings|dates?|reservation|order|time|times|payment|calendar|listing|checkout|account|app|request))',
    'accident (?:at|in|by|near|on) the (?:pool|house|backyard|yard|spa|hot tub|hottub|deck|patio|property|stairs|steps)',
    'went under',
    'turned blue',
    'turning blue',
    'is limp',
    'went limp',
    'knocked out',
    'broken (?:arm|leg|wrist|ankle|nose|tooth|teeth|bone|bones|finger|toe|foot|hand|neck|back|rib|ribs|jaw|collarbone)',
    // round 3: plain-word emergencies the vocabulary missed
    'foaming (?:at|from) the mouth',
    'foam (?:coming )?(?:out of|from) (?:his|her|their|the|my) mouth',
    '(?:shaking|twitching|jerking|trembling|convulsing) (?:and )?(?:wont|will not|cant|can t|doesnt|does not|isnt|is not) stop',
    '(?:wont|will not|cant|can t|wouldnt|would not) stop (?:shaking|twitching|jerking|trembling)',
    '(?:clutching|holding|grabbing|clenching) (?:his|her|their|my) (?:chest|heart)',
    'no pulse',
    '(?:slurring|slurred) (?:his |her |their |my )?(?:words|speech)',
    '(?:face|mouth|smile) (?:is )?(?:drooping|droopy|numb)',
    '(?:cant|cannot|can t|couldnt) find (?:a|his|her|their) pulse',
    'lifeless',
    '(?:a|the|theres a|there s a|there is a|found a) (?:dead )?body (?:in|at|on|by|floating|under|near|of) (?:the |a )?(?:pool|water|deep end|hot tub|hottub|spa|lake|bottom)',
    'dead body',
    '(?:theres|there s|there is|we found|i found|found) (?:a|the) body',
    // poisoning: drank / ate / swallowed pool chemicals or a chlorine tablet
    '(?:drank|drink|drinks|drinking|ate|eaten|eat|eats|eating|swallowed|swallow|swallows|swallowing|ingested|licked|chewed|chewing|bit into|got into) (?:\\w+ ){0,3}(?:chemicals?|chlorine|tablets?|pool shock|shock powder|bleach|acid|muriatic|cleaner|detergent|pills|poison\\w*|antifreeze|pesticide|tide pods?|batter(?:y|ies))',
    '(?:chlorine|chemical|pool) (?:tablet|tablets|puck|pucks) (?:in|into) (?:his|her|their|my) mouth',
    // a person not moving in or near the water
    '(?:not|isnt|is not|aint|stopped|wont|will not) (?:moving|move|responding|breathing|waking up)(?: \\w+){0,4} (?:in|at|on|under|near|by) the (?:pool|water|deep end|bottom|hot tub|hottub|spa|lake)',
  ].join('|')})\\b`
);
const INJURY_CONTEXT = [
  // someone (got|is|was) hurt / injured / cut / burned / bitten / stung / trapped
  r(
    `\\b${SUBJ} (?:\\w+ ){0,3}(?:got|gotten|is|was|were|are|been|has been|have been|just got|just) (?:\\w+ )?(?:hurt|injured|cut|burned|burnt|bitten|bit|stung|trapped|pinned|attacked|mauled|scratched)\\b`
  ),
  r(`\\b(?:hurt|injured) (?:${POSS} )?${PNOUN}\\b`),
  r(`\\b(?:hurt|injured|cut|burned|burnt|scraped) (?:himself|herself|myself|themselves|ourselves|yourself)\\b`),
  r(`\\b(?:got|gotten|been|getting) (?:hurt|injured|bitten|bit|stung)\\b`),
  // the dog bit my son / stung by a bee
  r(`\\b(?:bit|bitten|bites|stung|attacked|mauled|knocked over) (?:${POSS} )?${OBJ}\\b`),
  r(
    `\\b(?:dog|dogs|puppy|snake|spider|bee|bees|wasp|wasps|hornet|hornets|insect|bug|animal|cat|raccoon|scorpion|jellyfish|tick|ant|ants|mosquito) (?:\\w+ )?(?:bit|bite|bites|bitten|biting|stung|sting|stings|attacked|attacking|attacks|mauled|mauling)\\b(?! (?:the|a|an|my|his|her|their|our|its) (?:\\w+ )?(?:toy|toys|ball|balls|float|floats|stick|bone|towel|towels|shoe|shoes|chair|cushion|cushions|frisbee|noodle|raft|tube|leash|bed|food)\\b)`
  ),
  r(`\\b(?:bitten|stung) by\\b|\\b(?:bit|attacked) by (?:a|an|the|his|her|their|some|our|my) \\w+`),
  r(`\\b(?:dog|spider|snake|bug|insect|tick|animal|cat) bites?\\b`),
  // cut her foot / chlorine burned my eyes / broke his arm
  r(
    `\\b(?:cut|cuts|sliced|gashed|scraped|burned|burnt|burns|broke|broken|sprained|twisted|fractured|bruised|injured|hurt|hurts|banged|smashed|crushed|jammed|stubbed|split|busted|bumped|hit|smacked|cracked) (?:open )?(?:${POSS} )?${ADJ}${BODY}`
  ),
  // her face is swelling / my eyes are burning
  r(
    `\\b${BODY} (?:is |are |was |were |got |keeps |kept |wont stop |started |starts |is still |are still |looks |look |looks really |looks so |seems |feels |might be |may be |could be |is really |is so )?(?:bleeding|swelling|swollen|burning|broken|bruised|cut open|gushing|dislocated|bent wrong|blistering)\\b`
  ),
  r(`\\b(?:cut|gash|burn|wound|bruise|bite|sting) (?:on|in) (?:${POSS} )?${ADJ}${BODY}`),
  r(`\\b(?:deep|bad|big|huge|nasty|bleeding) (?:cut|gash|burn|wound)\\b|\\b(?:gash|head wound|open wound|broken bone)\\b`),
  // someone collapsed / my son fainted / she slipped / he fell in
  r(
    `\\b${SUBJ} (?:\\w+ ){0,2}(?:collapsed|fainted|passed out|choking|went under|drowning|drowned|stopped breathing|not breathing|unconscious|convulsing|seizing|coughing|keeps coughing|cant stop coughing|vomiting|throwing up|threw up|slipped|fell|tripped|bleeding|isnt moving|not moving|aint moving|stopped moving|dizzy|lightheaded|light headed)\\b(?! (?:his|her|their|the|it|my|our)\\b)`
  ),
  // the water or chlorine burning someone's skin or eyes
  r(
    `\\b(?:water|chlorine|chemicals?|pool|it) (?:is |was |keeps |kept )?(?:burning|stinging|blistering) (?:my|his|her|their|our|the)(?: \\w+){0,2} (?:skin|eyes?|face|throat|arms?|legs?|body)\\b`
  ),
  r(`\\b(?:broke|broken|breaking) out in (?:a |an )?(?:rash|hives|blisters|welts|bumps)\\b|\\bchemical burns?\\b`),
  // jumped in and cannot swim (not "my kid can't swim, is there a shallow end?")
  r(
    `\\b(?:jumped|fell|went|got|wandered|slipped|ran|is|was|hes|shes|still) (?:in|into)(?: the (?:pool|water|deep end|deep|lake|hot tub))?\\b(?: \\w+){0,6} (?:cant|cannot|can t|doesnt|does not|dont|do not|didnt) (?:know how to )?swim\\b`
  ),
  r(`\\b(?:cant|cannot|can t|doesnt|does not) swim\\b(?: \\w+){0,4} (?:jumped|fell|went|got|wandered|slipped) (?:in|into)\\b`),
  // dying / dead, about someone else ("i'm dead lol" is slang; "dying to swim" is removed by BENIGN)
  r(
    `\\b(?:he|hes|she|shes|they|theyre|someone|somebody|(?:my|our|a|the|his|her|their|this|that) (?:\\w+ )?${PNOUN}) (?:is |are |was |were |s |might be |may be |could be |is not |isnt |looks |seems |is literally )?(?:dying|dead|not alive)\\b(?! (?:tired|serious|set|wrong|last|end|sure|broke|asleep|zone|weight|beat|center|on|of (?:boredom|laughter|laughing|heat|thirst|hunger|excitement|curiosity)))`
  ),
  // a person not moving / not responding with water in the same part (any number of words between)
  {
    re: r(
      `\\b(?:he|hes|she|shes|someone|somebody|(?:my|our|a|the|his|her|their|this|that|some) (?:\\w+ )?(?:${PNOUN}|${CHILD}))\\b(?: \\w+){0,7} (?:not|isnt|is not|aint|stopped|wont|will not) (?:moving|move|breathing)\\b`
    ),
    test(p) {
      return /\b(?:pool|water|deep end|hot tub|hottub|spa|lake|bottom)\b/.test(p) && this.re.test(p);
    },
  },
  r(`\\b(?:slipped|fell|tripped) (?:and|in|into|down|off|over|on|at|near|by|from|onto|head first|headfirst)\\b`),
  r(`\\b(?:falls|slips|trips) (?:in|into|off|down|over|and)\\b`),
  r(`\\b(?:hit|bumped|banged|smacked|cracked|split) (?:his|her|their|my|its|a|the|our) head\\b`),
  // the pool cover trapped my kid / stuck under the cover / hair caught in the drain
  r(`\\b(?:trapped|pinned) (?:under|beneath|below|underwater|under water|in|by|against)\\b`),
  r(
    `\\b(?:stuck|caught|sucked) (?:under the water|underwater|under water|in the drain|by the drain|to the drain|against the drain|in the (?:pool )?cover|under the (?:pool )?cover)\\b`
  ),
  r(`\\b(?:trapped|pinned) (?:${POSS} )?${OBJ}\\b`),
  r(
    `\\b(?:hair|arm|leg|foot|hand|finger|swimsuit) (?:is |got |was )?(?:stuck|caught|sucked|trapped) (?:in|on|by) (?:the )?(?:drain|filter|skimmer|jets?|suction)\\b`
  ),
  // got shocked by the pool light (not "shocked by the price": BENIGN removes that first)
  r(`\\b(?:got|gotten|been|getting) shocked\\b`),
  r(`\\bshock\\w* (?:by|from|on|off|when touching|touching|in) (?:the |a |our |my )?(?:pool )?${ELEC}\\b`),
  r(`\\bshocked (?:${POSS} )?(?:${PNOUN}|him|her|them)\\b`),
  r(`\\b(?:im|i am|we are|were) (?:really |badly )?hurt\\b`),
  r(`\\b(?:cant|cannot|can t|couldnt|could not) wake (?:him|her|them|${PNOUN}|my \\w+)\\b|\\b${OTHERSUBJ} (?:\\w+ ){0,3}(?:wont|will not|isnt|is not|not) wak(?:e|ing)(?: up)?\\b`),
  r(`\\b${SUBJ} (?:\\w+ ){0,2}(?:died|is dying|not alive)\\b`),
  // drowning in everyday words: not coming up, at the bottom, under the water, struggling, face down
  r(
    `\\b${SUBJ}\\b(?: \\w+){0,5} (?:not|isnt|is not|hasnt|has not|havent|have not|didnt|did not|never|wont|still hasnt|still not|aint) (?:(?:come|came|coming|popped) (?:back )?up|resurfaced|surfaced|come back to the surface)\\b(?! with\\b| to (?:the|my|our) (?:house|gate|door|front|room|office|pool area|backyard|yard)\\b| (?:in|on|for|when|under) (?:the |a |my |our |any )?(?:search|searches|google|results|map|maps|app|site|page|list|listings?|screen|calendar|filter|filters)\\b)`
  ),
  r(`\\b${SUBJ}\\b(?: \\w+){0,3} (?:at|on|to|near) the bottom of the (?:pool|deep end|water|hot tub|hottub|spa|lake)\\b`),
  r(`\\b(?:sank|sunk|sinking|went down|gone down|going down|lying|laying) (?:to|at|on) the bottom\\b`),
  r(`\\b${SUBJ} (?:is |was |are |were |went |has been |been |stuck |is stuck |still |is still |got |keeps going )?(?:under (?:the )?water|underwater|under the surface)\\b`),
  r(
    `\\b${SUBJ}\\b(?: \\w+){0,2} (?:struggling|thrashing|flailing|sinking|bobbing|going under|panicking|in trouble|in distress) (?:in|at|around|near|by) the (?:water|pool|deep end|deep|hot tub|hottub|spa|lake)\\b`
  ),
  r(`\\b${SUBJ}\\b(?: \\w+){0,2} (?:floating|lying|laying) (?:face|motionless|still|lifeless|not moving|there not|on the bottom|at the bottom)\\b`),
  // one person pulled out ("we pulled the kids out when it started raining" is not an emergency)
  r(
    `\\b(?:pull|pulled|pulling|drag|dragged|dragging|fished|carried) (?:him|her|someone|somebody|(?:my|our|a|the|his|her|their) (?:son|daughter|kid|child|baby|toddler|boy|girl|friend|brother|sister|husband|wife|guest|swimmer|nephew|niece|cousin|man|woman|guy|lady|person|grandson|granddaughter|infant|homie|buddy)) out of the (?:pool|water|deep end|hot tub|hottub|spa|lake)\\b`
  ),
  r(`\\b${SUBJ} (?:\\w+ ){0,2}(?:wandered|crawled|toddled|stumbled|fell) (?:in|into) the (?:pool|water|deep end|hot tub|hottub|spa|lake)\\b(?! area| house| room)`),
  // (not responding: see unresponsivePerson(), which needs the whole message)
  // neck or chest pain after a dive or a fall, burning eyes, a sting, a zap
  r(`\\b(?:neck|spine|chest)\\b (?:really |so |still |is |is really |is so )?(?:hurts|hurting|is hurting|is killing|in pain|aches|is aching)\\b`),
  r(`\\b(?:dove|dived|diving|jumped|hit|fell|landed)\\b.*\\b(?:neck|head|spine|back)\\b.*\\b(?:hurts|hurting|pain|aches|aching|numb)\\b`),
  r(`\\b(?:burning|stinging|burned|burnt|irritating) (?:my|his|her|their|our|the kids|the) (?:eyes|eye|skin|throat|face|lungs)\\b`),
  r(`\\b(?:got|gotten|been|getting|was|is) (?:zapped|electrocuted|shocked)\\b`),
  // a missing child at the pool (not "I can't find my friend's listing")
  r(
    `\\b(?:cant|cannot|can t|couldnt|could not|unable to) find (?:my|our|the|his|her) (?:\\w+ )?(?:${PNOUN}|${CHILD})\\b(?! (?:listing|listings|booking|bookings|pool|page|profile|account|link|message|messages|email|review|reviews|number|address|place|house|calendar|request|offer|code|name|post|invite|reservation)\\b)|\\b(?:my|our) (?:\\w+ )?(?:${PNOUN}|${CHILD}) (?:(?:is|are|got|was|were|went|has gone|have gone|is still|has been) (?:missing|lost|gone)|wandered off|ran off|disappeared)\\b(?! (?:his|her|their|a|an|the|some|out|school|class|my|our|it|them)\\b)`
  ),
];
// injury words used as the name of a policy ("injury waiver", "accident insurance") are rule 8, not an injury
const INJURY_POLICY = /\b(?:injur\w*|accidents?|medical|hurt) (?:waivers?|insurance|coverage|liability|claims?|protection|polic(?:y|ies)|forms?|lawyer|attorney|lawsuit)\b/g;
function unresponsive(p) {
  return (
    /\bunresponsive\b/.test(p) &&
    !/\b(?:host|hosts|owner|support|team|you|website|site|app|messages?|texts?|emails?|inbox|chat)\b/.test(p)
  );
}
function injuryActual(p) {
  const q = p.replace(INJURY_POLICY, ' ');
  return INJURY_STRONG.test(q) || unresponsive(q) || INJURY_CONTEXT.some((re) => re.test(q));
}
// An old injury mentioned as background ("I hurt my back last week, is there a ramp?") is not happening now.
const HISTORY =
  /\b(?:last (?:week|month|year|summer|spring|winter|fall|time)|(?:a|one|two|three|four|five|six|few|couple of|couple|several|\d+) (?:days?|weeks?|months?|years?) ago|years ago|a while (?:ago|back)|while back|in the past|old (?:injury|injuries)|recovering from|recovery from|surgery|disabilit\w*|disabled|chronic|ever since)\b/;
const NOW = /\b(?:now|right now|currently|still|again|today|tonight|just|this morning)\b/;
const STRONG_NOW =
  /\b(?:drown\w*|bleed\w*|blood|unconscious|not breathing|cant breathe|seiz\w*|chok\w*|passed out|fainted|ambulance|911|emergency)\b/;
function historyOnly(p) {
  if (!HISTORY.test(p) || STRONG_NOW.test(p)) return false;
  // "my son hurt his knee last week and now it's swelling again" is happening now
  return !NOW.test(p.replace(HISTORY, ' '));
}
/*
 * "Not responding" is about a person after something happened, or about a host who hasn't answered
 * messages. Read the whole message: a named person (my son, the kid) or water / medical words make it
 * urgent; host, message or booking words make it not an injury; a bare "she's not responding" is asked
 * about first (the safety check), never answered with the "host hasn't replied" entry.
 */
const NOT_RESPONDING = r(
  `\\b${OTHERSUBJ}\\b(?: \\w+){0,2} (?:not responding|isnt responding|wont respond|stopped responding|not responsive|nonresponsive|non responsive|isnt moving|is not moving|not moving|aint moving|wont move|wont wake|not waking)\\b(?! to (?:my|our|the|any|messages?|texts?|emails?|calls?|requests?|booking|inquir\\w*))`
);
const UNRESP_NAMED = r(`\\b(?:${PNOUN}|${CHILD})\\b`);
const UNRESP_CONTEXT =
  /\b(?:pool|water|deep end|hot tub|hottub|spa|lake|bottom|pulled|fell|fall|hit|head|breath\w*|blood|bleed\w*|unconscious|limp|blue|purple|seiz\w*|drown\w*|chok\w*|collaps\w*|faint\w*|passed out|cpr|911|ambulance|emergency|eyes|pulse)\b/;
const HOSTISH =
  /\b(?:host|hosts|owner|owners|guest|guests|renter|renters|support|messages?|texts?|texted|emails?|emailed|inbox|chat|app|site|website|replies|reply|replied|request|requests|booking|bookings|inquiry|calls?|called|phone)\b/;
function unresponsivePerson(v) {
  const hit = v.parts.some((p) => {
    const q = stripHypo(p);
    return q && !QUESTION_START.test(q) && !historyOnly(q) && NOT_RESPONDING.test(q);
  });
  if (!hit || HOSTISH.test(v.s)) return null;
  return UNRESP_NAMED.test(v.s) || UNRESP_CONTEXT.test(v.s) ? 'urgent' : 'check';
}

/*
 * "The water burned my eyes a little but it's fine now": a minor injury the customer says is over.
 * Asked about (the safety question, 911 line first), not paged. Bleeding, drowning, not breathing and
 * the other strong signs stay urgent whatever else the message says.
 */
const RESOLVED =
  /\b(?:(?:its|it s|it is|thats|that s|were|we re|we are|everyone is|everybody is|hes|he s|he is|shes|she s|she is|theyre|they re|they are|im|i m|i am) (?:all |totally |completely |totally fine and |perfectly )?(?:fine|ok|okay|good|alright|all right|better)(?: now)?\b(?! (?:with|to|if|for|but))|all good now|no harm done|nobody (?:got |was )?hurt|no one (?:got |was )?hurt|noone (?:got |was )?hurt)/;
function injuryResolved(v) {
  return RESOLVED.test(v.s) && !STRONG_NOW.test(v.s);
}
/** True when some sentence part reports an injury outside an "if ..." clause (and not as old history). */
function injuryInFact(v) {
  if (injuryResolved(v)) return false;
  return (
    v.parts.some((p) => {
      const q = stripHypo(p);
      return !historyOnly(q) && injuryActual(q);
    }) || unresponsivePerson(v) === 'urgent'
  );
}
function injuryAnywhere(v) {
  return v.parts.some((p) => injuryActual(p));
}

const DANGER = [
  // fire / smoke / gas
  /\bon fire\b|\bcaught fire\b|\bcatching fire\b|\bfire (?:near|in|at|by|on|behind|next to|started|broke out|is spreading|spreading|everywhere|in the)\b|\b(?:a|the|small|big|grill|house|brush|electrical|kitchen|grease) fire\b|\bflames?\b|\bfire alarm (?:is )?(?:going off|went off)\b|\bthere s a fire\b/,
  /\bsmoke (?:coming|everywhere|from|in the|is|filling|pouring)\b|\b(?:full of|filled with|lots of|so much|a lot of|thick) smoke\b|\bsmell(?:s|ing)? (?:like |of )?(?:smoke|burning|something burning)\b|\bburning smell\b/,
  /\bgas (?:smell|leak\w*|is leaking)\b|\b(?:propane|gas) leak\w*\b|\bleaking (?:gas|propane)\b|\bsmell(?:s|ing)? (?:like |of )?(?:gas|propane)\b|\bcarbon monoxide\b/,
  /\b(?:chlorine|chemical|chemicals) (?:fumes|spill\w*|leak\w*|smell is (?:so )?(?:strong|bad|overwhelming))\b|\btoxic fumes\b|\bfumes\b/,
  // animals
  /\b(?:snakes?|rattlesnakes?|rattler|copperheads?|water moccasin|cottonmouth|alligators?|gators?|crocodiles?|scorpions?)\b/,
  /\b(?:bees|wasps|hornets|yellow jackets?) (?:everywhere|nest|swarm\w*|attacking|all over|in the pool)\b|\b(?:bee|wasp|hornet) (?:nest|hive|swarm)\b|\bswarm of\b/,
  // electrical
  /\b(?:sparks?|sparking|arcing)\b|\bexposed wir\w*|\blive wires?\b|\belectrified\b|\btingl\w* in the water\b|\bwater (?:is |feels |was |keeps )?(?:tingl\w*|buzz\w*|shocking)\b|\bpower lines? (?:down|in the)\b|\bdowned (?:power )?lines?\b/,
  // intruders
  /\b(?:intruders?|trespass\w*|prowler)\b|\b(?:someone|somebody|they|people|guys|a guy|a man|some guy|he|she) (?:\w+ ){0,2}(?:broke|breaking|break|tried to break|trying to break) in(?:to)?\b|\bbroke into (?:the|my|our) (?:house|home|yard|backyard|pool|property|gate|shed|cabana)\b|\b(?:stranger|strangers|drunk (?:guy|man|dude|person|people|woman|guys|men)|random (?:guy|man|dude|person|people|guys|men)|some (?:guy|man|dude|people) (?:i|we) dont know)\b(?: \w+){0,4} (?:trying to (?:get|come|climb|break|jump)|climbing|jumping|hopping|came|got|walked|is|are|was) (?:in|into|over|on)\b/,
];
function dangerInFact(v) {
  return v.parts.some((p) => DANGER.some((re) => re.test(stripHypo(p))));
}

// ----------------------------------------------------------------- violence and weapons
const QUESTION_START =
  /^(?:will|would|does|do|did|is|are|was|were|can|could|should|may|might|how|what|whats|when|where|which|who|whos|why|any|anyone know|is it|are there|is there|do you|does anyone)\b/;
const VIOLENCE = [
  // someone hit / punched / attacked a person
  r(
    `\\b(?:hit|hitting|hits|punched|punching|punches|slapped|slapping|slaps|kicked|kicking|shoved|shoving|pushed|choked|strangled|strangling|headbutted|attacked|assaulted|beat|beating|beat up|spit on|spat on|smacked|smacking|(?:threw|throwing|throws|thrown|chucked|hurled) (?:\\w+ ){0,3}at) (?:me|us|him|her|them|my (?:\\w+ )?(?:${PNOUN})|our (?:\\w+ )?(?:${PNOUN})|a (?:${PNOUN})|the (?:${PNOUN})|someone|somebody|another (?:${PNOUN}))\\b(?! (?:up|out|off|back|that|to (?:book|pay|leave|cancel|change|the booking|it)|into (?:booking|paying|leaving)|with (?:a|the|an) (?:price|fee|bill|charge|invoice|message|text|email)))`
  ),
  // fights
  /\bfist ?fights?\b|\bbrawl\w*\b|\b(?:theres|there is|there s|got into|getting into|started|starting|broke out|breaking out|having|had|in) (?:a |an )?(?:fist |physical |big |huge |bad |real )?fight\b(?! (?:with|over|about) (?:the |my |our |a )?(?:charge|fee|refund|bank|card|dispute|price|cancellation|booking|host about))|\b(?:a|the) fight (?:at|in|by|near|outside|going on|broke out|breaking out|started|happening)\b|\b(?:are|is|were|was|started|keep|kept|theyre|they re|guys|men|people|guests) (?:physically |literally )?fighting(?: (?:at|in|by|near|outside|each other|in the))?\b(?! (?:the|this|a|my|over the|about the|for (?:a|my|the)) (?:charge|fee|refund|dispute|ticket|bill|price|cancellation|booking))/,
  // a knife or bat pulled on someone
  r(
    `\\b(?:pulled|pulling|pulls|has|had|have|holding|held|waving|waved|pointed|pointing|brandish\\w*|carrying|came at (?:\\w+ )?with|threatened (?:\\w+ )?with|swinging) (?:out )?(?:a |his |her |their |an |the )?(?:knife|knives|machete|blade|bat|crowbar|hammer|gun|pistol)\\b`
  ),
];
// a weapon on its own ("someone has a gun"), unless the part is a question ("are guns allowed?")
const WEAPON = /\b(?:guns?|firearms?|pistols?|rifles?|shotguns?|handguns?|weapons?|armed (?:man|guy|person|people|robbery|with))\b/;
function violenceInFact(v) {
  return v.parts.some((p) => {
    const q = stripHypo(p);
    if (!q) return false;
    if (VIOLENCE.some((re) => re.test(q))) return true;
    return WEAPON.test(q) && !QUESTION_START.test(q);
  });
}

// ----------------------------------------------------------------- harassment
const HARASS = [
  /\b(?:harass\w*|threat\w*|assault\w*|creep\w*|stalk\w*|groped|grope|groping|molest\w*|inappropriate\w*|aggressive|abusive|abuse|abused|indecent\w*|lewd|obscene|masturbat\w*|peeping|peeper|peeping tom|voyeur\w*|racist|racial slurs?|slurs?|homophobic|hate speech|predator\w*|pervert\w*|perv|touchy)\b/,
  /\bsexual\w*\b/,
  /\btouch(?:ed|ing|es)? (?:me|her|him|us|my (?:\w+ )?(?:daughter|son|kid|kids|child|children|wife|girlfriend|boyfriend|friend|friends|body|leg|legs|butt|chest|breasts?|sister|niece|nephew|baby|toddler)|our (?:kids|daughter|son|child|children)|the kids)\b|\binappropriately touch\w*|\btouched (?:me|her|him|them|us) inappropriately\b/,
  /\bexpos(?:ed|ing) (?:him|her|them|my|it)sel(?:f|ves)\b|\bflash(?:ed|ing) (?:us|me|my|her|the kids|our)\b|\bsent (?:me |her )?(?:nudes|nude|explicit|dick)\b|\bexplicit (?:photos|pictures|pics|messages|texts|comments)\b/,
  /\b(?:host|guest|owner|man|guy|woman|someone|somebody|he|she|they|neighbor|neighbour|renter) (?:\w+ ){0,2}(?:was|is|were|walked around|came out|showed up|got|kept walking around|walking around) naked\b|\bnaked (?:in front of|around) (?:us|me|my|the kids|our|her)\b/,
  /\bweird (?:with|around|towards|toward|to) (?:us|me|my|our|the kids|her|him|them)\b/,
  /\b(?:host|guest|owner|man|guy|woman|he|she|they|neighbor|someone|somebody|renter) (?:\w+ ){0,2}(?:acting|being) (?:really |very |super |so )?(?:weird|strange|sketchy|shady|threatening|hostile|scary|creepy|pushy|handsy)\b/,
  /\b(?:made|making|makes|make) (?:me|us|my \w+|her|him|them|everyone|my kids|our kids) (?:feel )?(?:really |very |so )?(?:unsafe|uncomfortable|scared|nervous|afraid|threatened)\b/,
  /\b(?:kept|keeps|keep|was|is|been|wont stop|would not stop|wouldnt stop) (?:staring|leering|ogling|watching us|following us)\b/,
  /\bhidden cameras?\b|\bsecret cameras?\b|\bcameras? (?:in|inside) the (?:bathroom|changing room|changing area|shower|showers|restroom|dressing room|toilet)\b|\bspy\w* on\b/,
  // a camera aimed at a changing area
  /\bcameras?\b(?: \w+){0,3} (?:pointed|pointing|facing|aimed|aiming|watching|looking|set up|recording|filming)\b(?: \w+){0,2} (?:at|toward|towards|into|on|in) (?:the |our |my )?(?:changing|bathroom|bathrooms|restroom|shower|showers|dressing|toilet|bedroom)\b/,
  // photos of someone's kids or family by someone else
  r(
    `\\b(?:host|hosts|guest|guests|owner|he|she|they|someone|somebody|guy|man|woman|dude|neighbor|neighbour|person|renter|husband|stranger)\\b(?: \\w+){0,3} (?:took|taken|taking|takes|snapped|snapping|filmed|filming|recorded|recording|shot|shooting) (?:a |some |several |lots of |a bunch of )?(?:pictures?|photos?|pics?|videos?|video|footage) (?:of|with) (?:me|us|her|him|them|my (?:\\w+ )?(?:${PNOUN})|our (?:\\w+ )?(?:${PNOUN})|the kids|the children)\\b`
  ),
  /\b(?:pictures?|photos?|pics?|videos?) (?:of (?:me|us|my \w+|our \w+|the kids|her|him) )?without (?:asking|permission|consent|my permission|our permission)\b/,
  // an adult trying to be alone with a child
  /\b(?:be|get|being|getting|left|stay|staying|was|were|is|wants to be) alone with (?:my|our|the) \w+/,
  /\b(?:talk(?:ing)? to|be with|get|take|meet|see|hang out with|play with|drive|walk) (?:my|our) (?:\d+ ?(?:year old|yr old|yo|years old)|kids?|sons?|daughters?|child|children|baby|toddler|teen\w*|little (?:girl|boy|one|ones)) alone\b/,
  // grabbed / followed / made a pass / late-night texts
  /\b(?:grabbed|grabbing|grabs|yanked|yanking) (?:me|her|him|us|them)\b|\b(?:grabbed|grabbing|grabs|yanked|yanking|pulled|pulling|twisted) (?:my|her|his|our|their) (?:arm|arms|wrist|wrists|hand|hands|hair|neck|shirt|waist|butt|chest|breasts?|leg|legs|swimsuit|bikini|top)\b|\b(?:wouldnt|would not|wont|will not|didnt|did not) let (?:me |her |him |us |them )?go\b/,
  r(
    `\\bfollow(?:ed|ing|s)? (?:me|her|us|him|them|my (?:${PNOUN})|our (?:${PNOUN})) (?:into|to|around|in|inside|everywhere|home)\\b`
  ),
  /\b(?:made|making|makes|make) (?:a )?pass(?:es)? at\b|\b(?:asked|asking|asks|keeps asking|kept asking) (?:me|her|my \w+) out\b|\b(?:asked|asking|asks|keeps asking|kept asking|wants|wanted|trying|tried) (?:me |her |us )?to (?:hang out|hook up|come over|come inside|come in his|come in her|go out|get a drink|get drinks|meet up|send (?:pics|photos|pictures|nudes))\b(?! of (?:the|your|my|our|his|her) (?:pool|deck|yard|area|damage|place|house|listing|space|backyard|patio|cleanup|mess|receipt|id|license|check ?out|hot tub|gate))|\b(?:texting|texted|texts|messaging|messaged|calling|called|dming|dmed|snapping) (?:me|her|my \w+) (?:at night|late at night|late|all night|in the middle of the night|at \d+ ?(?:am|pm)|at midnight)\b/,
  /\b(?:said|saying|says|say|made|making|makes|told|telling|texted|sent) (?:me |her |him |us )?(?:something|things|stuff|some (?:\w+ )?(?:things|stuff)|comments?|remarks?|jokes?|a comment|a remark|a joke) (?:really |so |super |very |kinda |kind of )?(?:gross|sexual|nasty|creepy|inappropriate|disgusting|vulgar|lewd|dirty|racist|sexist|perverted|pervy|graphic)\b|\b(?:gross|sexual|nasty|creepy|disgusting|vulgar|lewd|dirty|racist|sexist|pervy) (?:comments?|remarks?|jokes?|things|stuff|messages|texts) (?:to|about|at)\b/,
  // afraid of a person (not "afraid of the host cancelling")
  /\b(?:scared|afraid|terrified|frightened|fearful) (?:of|by) (?:the |this |that |my |our |a )?(?:host|hosts|guest|guests|owner|guy|man|woman|dude|neighbor|neighbour|renter|husband|him|her|them|people there)\b(?! (?:cancel\w*|not|declin\w*|reject\w*|say\w*|being late|charg\w*|getting|finding|seeing my|knowing|thinking|leaving|rating|reviewing|showing up late))/,
  /\b(?:yelling|screaming|shouting|cursing|swearing|cussing|raging|hollering) (?:at|towards|toward) (?:us|me|my|our|her|him|them|the kids)\b|\b(?:yelled|screamed|shouted|cursed|swore|cussed) at (?:us|me|my|our|her|him|them|the kids)\b/,
  /\b(?:drunk|wasted|intoxicated|stoned) (?:host|owner)\b|\b(?:host|owner) (?:\w+ ){0,2}(?:is|was|seems|got|looks|is so|was so) (?:drunk|wasted|intoxicated|stoned)\b/,
  /\b(?:wont|will not|didnt|did not|isnt|is not|refuses to|refused to|not|wouldnt|would not) let(?:ting)? (?:us|me|my \w+|them|her|him|the kids) (?:leave|go|out|get out)\b|\b(?:locked|trapped) (?:us|me|them|her|him) (?:in|inside)\b/,
  /\b(?:tried to kiss|kissed me|kissed her|hit on (?:me|her|my)|hitting on (?:me|her|my)|came on to (?:me|her)|asked (?:me|her) out|grabbed (?:me|her|him))\b/,
  /\brecording (?:us|me)\b|\bfilming us\b/,
  // round 3 -----------------------------------------------------------------
  // grabbed / dragged a person ("the host grabbed my daughter", "he grabbed my son by the arm")
  r(
    `\\b(?:grabbed|grabbing|grabs|yanked|yanking|dragged|dragging|shoved|shoving|pinned|restrained|cornered) (?:my|our|the|his|her|their|a) (?:\\w+ )?(?:${PNOUN}|${CHILD})\\b(?! (?:\\w+ )?(?:${BELONG}|stuff|things|drink|food|plate|seat|spot|chair|float|toy|toys)\\b)`
  ),
  // walked in on someone changing
  /\b(?:walked|walks|walking|came|comes|coming|barged|burst|busted|stormed|opened the door|peeked|looked) (?:in|into|in on|right in)\b(?: \w+){0,4} (?:while|when|as) (?:i|we|she|he|they|my \w+|our \w+) (?:was|were|is|are) (?:changing|showering|undressing|undressed|naked|getting changed|getting dressed|dressing|peeing|in the shower|using the (?:bathroom|restroom|toilet))\b|\bwalked in on (?:me|us|her|him|them|my \w+)\b/,
  // slurs
  /\b(?:n word|n words|f word|racial slur\w*|slurs?|nigg\w*)\b/,
  // touching that won't stop, or touching a body part
  /\b(?:wouldnt|would not|wont|will not|didnt|did not|kept|keeps|keep|kept on|keeps on) (?:stop )?(?:touching|rubbing|stroking|hugging|kissing|massaging|feeling up|groping)\b|\btouch(?:ed|ing|es)? (?:my|her|his|our|their) (?:\w+ )?(?:hair|face|arm|arms|shoulder|shoulders|back|waist|thigh|thighs|hip|hips|neck|knee|stomach|belly|bottom|rear|privates|private parts|breast|breasts|chest|butt|leg|legs|body)\b/,
  // comments on someone's body
  /\bcomment\w* (?:on|about) (?:my|her|his|our|their) (?:\w+ )?(?:body|bodies|looks|figure|chest|breasts?|boobs|butt|ass|legs|appearance|weight|swimsuit|bikini|outfit)\b|\b(?:said|says|saying|told|called) (?:\w+ ){0,3}(?:nice|sexy|hot) (?:body|ass|butt|legs|bikini)\b/,
  // an ex or someone dangerous showing up
  /\bmy ex\b(?: \w+){0,4} (?:showed up|is here|came|followed|wont leave|will not leave|is threatening|threatened|is outside|found us|keeps|kept|is at)\b|\b(?:abusive|violent) ex\b|\b(?:restraining|protective) order\b/,
  // asked for pictures in exchange for something ("said he'd give us a discount if I sent him pics")
  /\b(?:asked|asking|asks|wants|wanted|told|said|offered|begged|kept asking|keeps asking|tried)\b(?: \w+){0,8} (?:send|sent|sending|text|texting) (?:him|her|them|the host) (?:\w+ )?(?:pics|pictures|photos|nudes|selfies|a picture|a photo|a pic|pic)\b/,
  // an adult and a child, with a grooming cue ("asked my 14 year old for her snapchat", "told my son to keep it a secret")
  (s) => GROOM_SHAPE.test(s) && GROOM_CUE.test(s),
  // an adult contacting someone's young child directly
  r(
    `\\b(?:texting|texted|texts|messaging|messaged|messages|dming|dmed|dms|snapchatting|snapping|calling|called|contacting|contacted|added|friended|following|followed) (?:my|our) (?:\\d+ ?(?:year old|yr old|yo|years old)s?|teen\\w*|little \\w+|young \\w+|minor|underage \\w+|kid|kids|child|children)\\b`
  ),
];
// an adult (host, guest, a man, he) doing something to someone's child
const GROOM_SHAPE = r(
  `\\b(?:host|hosts|owner|owners|guest|guests|man|men|guy|guys|dude|woman|lady|he|hes|she|shes|they|stranger|neighbor|neighbour|someone|somebody|adult|husband|boyfriend|son|brother|uncle|dad|father|grandpa|renter|lifeguard|employee|worker|cleaner)\\b(?: \\w+){0,4} (?:asked|asking|asks|told|telling|tells|gave|giving|gives|wanted|wants|tried|trying|tries|kept|keeps|offered|offering|offers|invited|inviting|invites|begged|pressured|bribed|dared|got|made|showed|showing|sent|sending|texted|messaged|followed|took|taking|let|bought|promised|whispered|called) (?:\\w+ ){0,3}(?:my|our) (?:\\w+ )?${CHILD}\\b`
);
const GROOM_CUE = new RegExp(
  [
    '\\b(?:secret|secrets|lap|snapchat|snap|instagram|insta|tiktok|whatsapp|discord|facebook|messenger|phone number|cell number|his number|her number|personal number|pics|pictures|photos|selfies|nudes|naked|undress\\w*|kiss|kisses|kissed|hug|hugs|hugged|massage|privately|dm|dms|sit on|candy|gift|gifts|sweetheart|his room|her room|bedroom|basement|his car|her car|come over|sleep over|sleepover|on a date|go out with)\\b',
    '\\b(?:be|stay|get|left|leave|meet|go|come|alone) (?:\\w+ )?alone\\b|\\balone with\\b',
    '\\b(?:she|he|they|you) (?:is|was|are|were|looks|look|looked) (?:so |really |very |super )?(?:pretty|beautiful|cute|gorgeous|hot|sexy)\\b',
    '\\b(?:gave|giving|offered|offering|bought|let|letting) (?:\\w+ ){0,4}(?:beer|beers|alcohol|vape|weed|a drink|wine|liquor|shots)\\b',
    '\\b(?:come|go|get|follow|lure|lured|walk|walked|led|lead) (?:\\w+ ){0,3}(?:inside|in the house|into the house|upstairs|in his|into his|in her|into her|to his|to her)\\b(?: \\w+){0,3} (?:with him|with her|alone)\\b',
  ].join('|')
);
/*
 * Reports that only count as a statement about a person, never as a question
 * ("will the host be watching us?") or a privacy worry ("I feel uncomfortable
 * sharing my address, is that normal?").
 */
const HARASS_REPORT = [
  /\b(?:feel|feels|felt|feeling) (?:really |very |so |super |kind of |kinda |extremely |a bit |a little )?(?:unsafe|scared|threatened|in danger|afraid|violated|harassed|uncomfortable)\b(?! (?:about|sharing|giving|to share|to give|booking|paying|using|entering|putting|posting|having to|leaving|swimming|in (?:the|deep|cold) water|of (?:sharing|giving|booking|paying|the water|deep water|heights)|with (?:sharing|giving|booking|paying|the price|this site|the site)))/,
  /\b(?:watching|staring at|leering at|ogling|filming|recording|photographing|taking (?:pictures|photos|pics|videos|video) of|spying on|peeping on|stalking) (?:us|me|my (?:\w+ )?(?:daughter|son|kid|kids|wife|friend|friends|family|girlfriend|boyfriend|children|child)|our (?:kids|daughter|son|family)|her|him|them|the kids)\b/,
  // "the host's son is peeking over the fence at us"
  /\b(?:peek|peeks|peeking|peeked|peering|peered|looking|looked|watching) (?:over|through|into|in on|in|under)\b(?: (?:the|a|our|my|his|her))? (?:fence|window|windows|wall|gate|bushes|door|blinds|curtains|bathroom|changing room|shower|crack)\b(?: \w+){0,3} (?:at )?(?:us|me|my|our|her|him|them|the kids)\b|\bpeek(?:ing|ed|s)? (?:at|on) (?:us|me|my \w+|our \w+|her|the kids)\b/,
];
const PRIVACY_WORRY =
  /\b(?:is (?:that|it|this) normal|normal to|sharing my (?:address|info|information|number|email|details|location)|share my (?:address|info|information|number|email|details|location))\b/;
function harassment(s, v) {
  if (HARASS.some((re) => (typeof re === 'function' ? re(s) : re.test(s)))) return true;
  const parts = v ? v.parts : [s];
  if (PRIVACY_WORRY.test(s) && !/\b(?:host|guest|owner|he|she|they|him|her|them)\b(?: \w+){0,4} (?:made|makes|making)\b/.test(s))
    return false;
  return parts.some((p) => {
    const q = stripHypo(p);
    return q && !QUESTION_START.test(q) && HARASS_REPORT.some((re) => re.test(q));
  });
}

// ----------------------------------------------------------------- damage / rule 8
const DAMAGE = [
  /\b(?:damag\w*|vandal\w*)\b/,
  r(
    `\\b(?:broke|smashed|shattered|cracked|scratched|scratching|stained|staining|clogged|clogging|ripped|tore|dented|chipped|punctured|trashed|wrecked|ruined|destroyed|melted|flooded|burned|burnt|messed up|messes up|messing up|keyed|spilled (?:\\w+ )?on) (?:\\w+ ){0,3}${PROP}\\b(?! rules?\\b)`
  ),
  r(`\\b(?:breaks|break|breaking) (?:something|anything|stuff|things|everything)\\b`),
  r(`\\b(?:breaks|break|breaking|broken) (?:my|the|a|an|our|their|his|her|some) (?:\\w+ ){0,2}${PROP}\\b(?! rules?\\b)`),
  r(
    `\\b${PROP_FIXED} (?:is |are |was |were |got |has been |have been |now |is now |got all )?(?:cracked|smashed|shattered|scratched|damaged|dented|ripped|torn|chipped|vandalized|ruined|destroyed)\\b`
  ),
  // a host's pool or hot tub fouled by guests
  /\b(?:peed|pooped|pooping|poop|diarrhea|vomited|threw up|puked) in my (?:pool|hot tub|hottub|spa)\b/,
  // a claim about damage or insurance, not "how do I claim my payout" / "claim my listing"
  /\bcaused a leak\b|\b(?:file|filing|filed|make|making|submit|submitting|open|opening|start|starting) (?:a |an )?(?:damage |insurance |property |injury )?claims?\b|\b(?:damage|insurance|property|injury|liability) claims?\b|\bclaims? (?:for|against|on|about) (?:the |my |a |an )?(?:damage|damages|injury|insurance|policy|guest|host|repairs?|broken)\b/,
];
// "do you offer damage protection?", "I'm worried guests will damage my pool": a rule-8 question, not a damage report
const DAMAGE_QUESTION =
  /\b(?:damage (?:protection|coverage|policy|insurance|guarantee|waiver|deposit|plan)|(?:worried|worry|worries|worrying|concerned|nervous|afraid|scared) (?:about|that|of) (?:\w+ ){0,4}(?:damag\w*|break\w*|ruin\w*|wreck\w*)|protect\w* (?:me |my \w+ |hosts |us |against |from )(?:against |from )?(?:damage|guests))\b/;
function damageQuestion(s, v) {
  if (DAMAGE_QUESTION.test(s)) return true;
  // every part that mentions damage is a question about it ("does prnm cover damage?")
  const hits = (v ? v.parts : [s]).filter((p) => DAMAGE.some((re) => re.test(p)));
  return (
    hits.length > 0 &&
    hits.every(
      (p) =>
        QUESTION_START.test(p) &&
        // "how do I file a damage claim" and "can you help, the guest broke my chair" are reports
        !/\b(?:file|filing|report|reporting|submit|submitting|claims?)\b/.test(p) &&
        !/\b(?:guest|guests|renter|renters|they|he|she|someone|somebody|kids?|people) (?:\w+ ){0,2}(?:broke|smashed|cracked|ruined|destroyed|damaged|scratched|stained|wrecked|trashed)\b/.test(p)
    )
  );
}
const damage = (s) => DAMAGE.some((re) => re.test(s));
const damageInFact = (s, v) => damage(s) && !damageQuestion(s, v);

const HARM_RE =
  /\b(?:hurt|hurts|injur\w*|accidents?|drown\w*|bleed\w*|seizures?|chok\w*|electrocut\w*|stung|bitten|bites (?:someone|somebody|a|my|the|him|her|them)|sue|sues|sued|suing|lawsuit\w*|concussion|emergency|(?:someone|somebody|anyone|a guest|a kid|a child|he|she|they|guest|kid|child) (?:dies|died|die))\b/;
const harmful = (p) => HARM_RE.test(p) || injuryActual(p) || damage(p);
const LIAB =
  /\b(?:liab\w*|insur\w*|insurence|indemn\w*|lawsuit\w*|sue|sues|sued|suing|lawyer\w*|attorney\w*|legal action|legally|financially responsible|responsib\w*|at fault|on the hook|to blame|accountable|homeowner\w*|protected|coverage)\b/;

// "is the pool covered or indoor?": a roof, not a policy
const COVER_PHYSICAL =
  /\b(?:indoor|indoors|outdoor|outdoors|shade|shaded|shady|roof|roofed|awning|canopy|enclosed|enclosure|screened|sun|sunny|rain|raining|weather|tarp|winter|solar cover|pool cover|uncovered|umbrella|pergola|gazebo)\b/;
// a guarantee about the pool itself (clean, heated, available) is a normal question, not a host guarantee
const GUARANTEE_PLAIN =
  /\bguarantee\w* (?:that )?(?:the |my |a |it |its |this )?(?:pool|water|place|listing|it|spot|booking|reservation|price|weather)? ?(?:is |will be |be |stays )?(?:clean|cleaned|available|availability|heated|warm|open|sunny|nice|the lowest|lowest|best|cheapest|spot)\b|\bguarantee\w* (?:on |for |of )?(?:my |the |a |your )?(?:booking|bookings|reservation|spot|date|time|slot|payouts?|payments?|price|prices|availability|lowest price|best price)\b|\bmoney back guarantee\b/;
const HARM_WORDS =
  /\b(?:damag\w*|break|breaks|broke|broken|crack\w*|ruin\w*|hurt\w*|injur\w*|sue\w*|accident\w*|repairs?|medical|hospital|drown\w*|lawsuit\w*|liab\w*|insur\w*|slip\w*|fall|falls|fell|dies|died|stolen|theft)\b/;
const INSURANCE = [
  /\b(?:insur\w*|insurence|liab\w*|coverage|homeowner\w*|lawsuit\w*|sue|sues|sued|suing|lawyer\w*|attorney\w*|legal action|indemn\w*|protection plan|host protection|guest protection|damage protection)\b/,
  (s) => /\bguarantee\w*\b/.test(s) && !GUARANTEE_PLAIN.test(s),
  (s) =>
    /\b(?:am i|are we|are you|is (?:my|the|our) (?:pool|home|house|property|backyard|stuff)|is it|is this|are hosts|are guests|would i be|will i be|am i still) (?:\w+ )?covered\b/.test(s) &&
    !COVER_PHYSICAL.test(s),
  (s) => /\bcovered (?:by|if|for|under|when|in case)\b/.test(s) && !COVER_PHYSICAL.test(s),
  // "who pays if a guest cracks my tile", not "who pays the stripe fee"
  (s) => /\b(?:who|what) (?:pays|covers|is paying|will pay|has to pay)\b/.test(s) && HARM_WORDS.test(s),
  /\bcover (?:the )?(?:damage|costs? of (?:the )?(?:damage|repairs?|injur\w*)|bills? for|me if|us if|injur\w*|medical|repairs?)\b/,
  (s) => /\bcover (?:the )?(?:costs?|bills?|it|this|that|me|us)\b/.test(s) && HARM_WORDS.test(s) && !COVER_PHYSICAL.test(s),
  /\b(?:legally|financially) (?:responsible|liable|on the hook|accountable)\b|\bon the hook\b|\bat fault\b/,
  /\bresponsib\w* (?:if|when|for|in case) (?:\w+ ){0,6}(?:hurt|hurts|injur\w*|accidents?|drown\w*|break|breaks|broke|broken|damag\w*|mess(?:es|ed)? up|ruin\w*|scratch\w*|stain\w*|clog\w*|leak\w*|slips?|slipped|falls?|fell|sue\w*|lawsuit\w*|something happens|anything happens|something goes wrong|anything goes wrong|dies|died)\b/,
  // "am I protected as a host", not "is the site protected by SSL"
  (s) =>
    /\b(?:am i|are we|are hosts|are guests|is my (?:pool|home|house|property|backyard)|are you|is prnm|will i be|would i be) (?:\w+ )?protected\b|\bprotected (?:as a host|as a guest|if|from|against)\b|\b(?:any|some|what) protection\b/.test(s) &&
    !/\b(?:ssl|https|encrypt\w*|password|2fa|two factor|hack\w*|data|privacy|card details|spam|virus)\b/.test(s),
  /\bumbrella (?:policy|insurance|coverage)\b/,
  // "what does your policy cover", not "what does the cancellation policy cover"
  (s) =>
    /\bpolic(?:y|ies) (?:\w+ ){0,2}cover\w*\b/.test(s) &&
    !/\b(?:cancel\w*|refund\w*|privacy|pet|pets|house|booking|weather|rain|return|alcohol|guest|noise|smoking)\b(?: \w+){0,2} polic(?:y|ies)\b/.test(s),
  /\b(?:pay|pays|paying|cover|covers|reimburs\w*|compensat\w*) (?:me |us )?for (?:the |my |any )?(?:damage\w*|repairs?|injur\w*|medical|hospital|bills?|broken|replacement|fixing)\b/,
];
const insurance = (s) => INSURANCE.some((re) => (typeof re === 'function' ? re(s) : re.test(s)));

/*
 * "What should I do if someone is drowning?", "what do I do if my kid is choking": an emergency
 * procedure asked with "if", maybe typed in the middle of one. Not an insurance question unless it
 * also asks who is liable / pays / is covered: the 911 line leads and a person is brought in.
 */
const EMERGENCY_TERM =
  /\b(?:drown\w*|chok\w*|not breathing|stopped breathing|stops breathing|stop breathing|cant breathe|can t breathe|bleed\w*|seizure\w*|seizing|unconscious|passed out|passes out|pass out|faint\w*|heart attack|cpr|electrocut\w*|allergic reaction|anaphyla\w*|stroke|overdos\w*|unresponsive|goes under|went under|under water|underwater)\b/;
const LIAB_ASK =
  /\b(?:liab\w*|insur\w*|responsib\w*|sue|sues|sued|suing|lawsuit\w*|lawyer\w*|cover|covers|covered|coverage|pay|pays|paying|paid|fault|blame|claim\w*|protected|protection|waiver\w*|legal\w*|hospital bill\w*|medical bill\w*)\b/;
// asking what to DO ("what should I do if"), not what happens afterwards ("what if a guest drowns in my pool")
const PROCEDURE_ASK =
  /\b(?:what (?:should|do|would|can|could|must) (?:i|we|you|one|they|guests|hosts|parents|people) do|what to do|what do (?:i|we) do|how (?:do|should|can|would) (?:i|we|you) (?:help|handle|respond|react|save|treat|deal)|what are the steps|what steps|whats the procedure|what is the procedure|who do (?:i|we) call|who should (?:i|we) call)\b/;
function emergencyQuestion(v) {
  if (LIAB_ASK.test(v.s) || !PROCEDURE_ASK.test(v.s)) return false;
  return v.parts.some((p) => {
    const m = p.match(HYPO);
    return m && EMERGENCY_TERM.test(p.slice(m.index));
  });
}

/** "am I liable if…", "what if a guest drowns, am I responsible", "what happens if someone gets hurt". */
function liabilityHypothetical(v) {
  if (injuryInFact(v) || dangerInFact(v) || emergencyQuestion(v)) return false;
  const hypoParts = v.parts.filter((p) => HYPO.test(p));
  if (!hypoParts.length) return false;
  if (hypoParts.some((p) => harmful(p.slice(p.match(HYPO).index)))) return true;
  return LIAB.test(v.s);
}

// ----------------------------------------------------------------- trust / scams / theft / refunds
const TRUST =
  /\b(?:legit|legitimate|trustworthy|trust (?:you|you guys|this|this site|the site|prnm|pool rental near me|your site|this website|this company))\b|\bsafe to (?:use|book|pay|book with|pay with|book on|pay on|book through|pay through|give my card|enter my card|put my card|use my card)\b|\breal (?:site|company|website|business|platform|service)\b|\b(?:is|are) (?:this|this site|the site|this website|this company|you|you guys|yall|prnm|pool rental near me|this app|your site|your website|this platform|this service) (?:a |an |even )?(?:scam|fraud|fake|ripoff|rip off|legit)\b/;
const SCAM_SIGNALS =
  /\b(?:asked (?:me )?(?:to|for)|asking (?:me )?(?:to|for)|sent me|texted me|emailed me|messaged me|called me|wants me to|told me to|venmo|zelle|cashapp|wire|gift cards?|bitcoin|crypto|western union|phish\w*|impersonat\w*|pretending|outside the (?:app|site|platform)|off (?:the )?(?:app|site|platform)|link|password|stolen|hacked|charged|took my money)\b/;
const SCAM = [
  /\b(?:scam\w*|fraud\w*|phish\w*|impersonat\w*|pretending to be|identity theft|stolen card)\b/,
  /\bfake (?:listing|host|guest|text|email|message|link|site|website|account|review|profile)\b/,
  /\basked (?:me )?for my (?:password|card|bank|login|code|ssn|social)\b/,
  /\bsuspicious (?:link|text|email|message|listing|host|call)\b/,
  /\b(?:card|credit card|debit card|identity|account|info|information|login) (?:was |got |has been |is |been )?(?:stolen|hacked|compromised)\b/,
];
const THEFT = [
  /\b(?:stole|stolen|stealing|theft|thief|thieves|robbed|robbery|burglar\w*|pickpocket\w*|broke into my car)\b/,
  r(`\\b(?:took|taken|grabbed|swiped|kept|keeping|is keeping|walked off with|ran off with|left with) (?:my|our|her|his) (?:\\w+ )?${BELONG}\\b`),
  /\b(?:wont|will not|refuses to|refused to|not|didnt|did not|never|wouldnt|would not) (?:give|gave|giving|return|returned|returning|send|sent|hand) (?:it|them|those|that|my (?!deposit|money|refund|payment|card)\w+|our (?!deposit|money|refund|payment)\w+) back\b/,
  r(`\\b(?:wont|will not|refuses to|refused to|didnt|did not|never|wouldnt|would not) return (?:my|our) (?:\\w+ )?${BELONG}\\b`),
  r(`\\b(?:my|our) ${BELONG} (?:is |are |was |were |went |got |has gone |have gone )?(?:missing|gone|disappeared)\\b`),
];
const DISPUTE =
  /\b(?:chargeback\w*|charge back|dispute\w*|charged (?:\w+ ){0,2}(?:twice|double|two times|2 times)|charg\w* (?:me|us) (?:twice|double|two times)|double charg\w*|charged double|charged two times|overcharg\w*|over charged|wrong (?:charge|amount)|charged (?:the )?wrong|billing (?:error|mistake)|unauthori[sz]ed (?:charge|payment|transaction)|did not authori[sz]e|didnt authori[sz]e|never authori[sz]ed|fraudulent charge|charged for a booking i (?:didnt|did not|never) make|charged for something i (?:didnt|did not|never)|(?:reverse|reversing|reversed) (?:the |this |that |my |your )?(?:charge|charges|payment|transaction)|cancel(?:ling|ing)? (?:the |this |my )?(?:charge|payment) (?:with|through) (?:my|the) bank)\b|\b(?:call|calling|called|contact|contacting|contacted|tell|telling|told|go to|going to) (?:my|the) (?:bank|card company|credit card company)\b(?=.*\b(?:charge\w*|payment|money|refund|reverse|dispute|fraud)\b)|\b(?:charge\w*|payment|money|refund)\b(?=.*\b(?:call|calling|called|contact|contacting|tell|telling) (?:my|the) (?:bank|card company|credit card company)\b)/;
// angry accusations or legal threats aimed at us: a calm founder handoff, no facts, no scam/theft panic
const ACCUSE_TARGET =
  '(?:you|you guys|you people|yall|ya ll|u|u guys|your company|your site|your website|your business|your app|this site|this website|this company|this app|this platform|this business|this place|the site|the company|prnm|pool rental near me|pool rental)';
const ACCUSE = [
  r(
    `\\b${ACCUSE_TARGET}\\b(?: \\w+){0,3} (?:scam\\w*|fraud\\w*|thie(?:f|ves)|crooks?|rip ?offs?|ripping (?:me|us|people) off|ripped (?:me|us) off|stole|steal\\w*|robbed|robbing|liars?|lying|criminals?|con artists?)\\b`
  ),
  /\b(?:scam|scammy|fraud|fraudulent|rip ?off|fake) (?:company|site|website|business|app|platform|operation|service)\b/,
];
const accusation = (s) => ACCUSE.some((re) => re.test(s));
const LEGAL_THREAT = [
  r(`\\b(?:sue|suing|take|taking|report|reporting) ${ACCUSE_TARGET}\\b(?: to court)?`),
  /\b(?:i|im|i am|we|were|we are|ill|i will|we will|gonna|going to|about to)\b(?: \w+){0,3} (?:sue|suing|lawyer|attorney|legal action|court|small claims)\b/,
  /\bmy (?:lawyer|attorney|legal team)\b/,
];
const LEGAL_ELSEWHERE =
  /\b(?:host|hosts|guest|guests|renter|renters|swimmer|neighbor|neighbour|homeowner\w*|insur\w*|liab\w*|covered|coverage|cover|damag\w*|hurt|injur\w*|accident\w*|slip\w*|fell|drown\w*|if|what if)\b/;
const legalThreat = (s) => LEGAL_THREAT.some((re) => re.test(s)) && !LEGAL_ELSEWHERE.test(s);

// ----------------------------------------------------------------- guards
/*
 * Each rule: { id, kind, route, topics, rule8, lead911, test(s, v) }
 *   kind 'urgent'  → immediate handoff, urgency high
 *   kind 'handoff' → handoff with slot collection, never a factual answer
 *   kind 'clarify' → one question between two routes
 * route: a bank entry id, or "builtin:<id>" (copy in bank/routes.json)
 * lead911: the 911 line leads the reply when this rule is the one that answers
 * Order matters: the first matching rule picks the reply; every matching rule's
 * topics (and any rule8 flag) go into the handoff note.
 * s = cleaned text with benign idioms removed; v.parts = the same per sentence part.
 */
const NOT_ACCOUNT = (s) =>
  !/\b(account|login|password|app|profile|signin|sign in|email|website|site)\b/.test(s);

const RULES = [
  {
    // "what should I do if someone is drowning?": maybe a real emergency typed as a question. No insurance copy.
    id: 'emergency-question',
    kind: 'urgent',
    route: 'builtin:emergency-question',
    topics: ['emergency question'],
    lead911: true,
    test: (s, v) => emergencyQuestion(v),
  },
  {
    id: 'liability-hypothetical',
    kind: 'urgent',
    route: 'safety-insurance',
    topics: ['liability'],
    rule8: true,
    test: (s, v) => liabilityHypothetical(v),
  },
  {
    id: 'injury',
    kind: 'urgent',
    route: 'safety-injury',
    topics: ['injury'],
    rule8: true,
    lead911: true,
    test: (s, v) => injuryInFact(v),
  },
  {
    id: 'violence',
    kind: 'urgent',
    route: 'safety-harassment',
    topics: ['violence'],
    lead911: true,
    test: (s, v) => violenceInFact(v),
  },
  {
    id: 'harassment',
    kind: 'urgent',
    route: 'safety-harassment',
    topics: ['harassment'],
    lead911: true,
    test: (s, v) => harassment(s, v),
  },
  {
    id: 'unsafe',
    kind: 'urgent',
    route: 'safety-unsafe-pool',
    topics: ['unsafe'],
    lead911: true,
    test: (s, v) =>
      dangerInFact(v) ||
      // "something seems dangerous here" is a report; "is the deep end dangerous for kids?" is a question
      v.parts.some(
        (p) =>
          /\b(unsafe|not safe|dangerous|danger|hazard\w*|electrical (issue|problem|hazard)|drain cover)\b/.test(p) &&
          !QUESTION_START.test(p)
      ) ||
      /\bgate (does not|doesnt|wont|will not|isnt|not) (latch|close|shut|lock)\w*\b/.test(s) ||
      /\b(no|missing|broken) (fence|fencing|barrier|pool fence)\b/.test(s) ||
      /\b(?:pool )?(?:fence|fencing|gate|barrier) (?:is |was |got |has been )?(?:broken|down|missing|left open|wide open)\b/.test(s) ||
      /\bbroken glass\b/.test(s) ||
      /\b(green|cloudy|murky|black) water\b|\bwater (looks|is) (green|cloudy|murky)\b/.test(s) ||
      /\b(?:pool|hot tub|hottub|spa|water|it) (?:is |looks |got |went |turned |is now |looks really |is really )(?:now )?(?:green|cloudy|murky|black|brown)\b/.test(s) ||
      /\b(?:peed|pooped|pooping|poop|diarrhea|vomited|threw up|puked) in (?:the|our) (?:pool|hot tub|hottub|spa|water)\b/.test(s) ||
      /\b(ladder|railing|rail|handrail|diving board)\b.*\b(loose|wobbly|broken|cracked)\b/.test(s),
  },
  {
    // the shape of an emergency the vocabulary missed: a cry for help (or shouting) about a person near water
    id: 'distress',
    kind: 'urgent',
    route: 'safety-injury',
    topics: ['possible emergency'],
    lead911: true,
    test: (s, v) => structuralDanger(v.raw, v),
  },
  {
    // a non-English emergency ("mi hijo se está ahogando"): the 911 line and a person, nothing else
    id: 'foreign-emergency',
    kind: 'urgent',
    route: 'safety-injury',
    topics: ['possible emergency (not in English)'],
    lead911: true,
    test: (s) => foreignEmergency(s),
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
    test: (s, v) => damageInFact(s, v),
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
    // "I'm going to sue you", "my lawyer will be in touch": calm, no insurance copy; Derek owns it (rule 8)
    id: 'legal-threat',
    kind: 'handoff',
    route: 'builtin:complaint',
    topics: ['legal threat'],
    rule8: true,
    upset: true,
    test: (s) => legalThreat(s) && !DISPUTE.test(s),
  },
  {
    id: 'insurance',
    kind: 'urgent',
    route: 'safety-insurance',
    topics: ['insurance'],
    rule8: true,
    // a question about damage ("do you offer damage protection?") is a rule-8 question: Derek, no 911 line
    test: (s, v) => insurance(s) || damageQuestion(s, v),
  },
  {
    id: 'trust-question',
    kind: 'handoff',
    route: 'builtin:trust-question',
    topics: ['is PRNM legit'],
    test: (s) => TRUST.test(s) && !SCAM_SIGNALS.test(s),
  },
  {
    // "you guys are scammers", "you stole my money": an angry customer, not a scam or theft report
    id: 'accusation',
    kind: 'handoff',
    route: 'builtin:complaint',
    topics: ['complaint'],
    upset: true,
    test: (s) => accusation(s) && !DISPUTE.test(s),
  },
  {
    id: 'scam',
    kind: 'urgent',
    route: 'safety-scam-report',
    topics: ['scam'],
    upset: true,
    test: (s) => SCAM.some((re) => re.test(s)) && !accusation(s),
  },
  {
    id: 'theft',
    kind: 'urgent',
    route: 'builtin:theft-report',
    topics: ['theft'],
    upset: true,
    test: (s) => THEFT.some((re) => re.test(s)) && !accusation(s),
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
    upset: true,
    // only real disputes: a plain "I want a refund" or "can I move my booking" is a normal handoff
    test: (s) => DISPUTE.test(s),
  },
  // ----- near-misses the bank must not answer -----------------------------
  {
    id: 'refund-question',
    kind: 'handoff',
    route: 'builtin:refund-question',
    topics: ['refund'],
    // refunds outside "if I cancel" / "the host cancelled" have no published rule
    test: (s) =>
      /\b(refund\w*|money back)\b/.test(s) &&
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
  {
    // a complaint or a threat to report us: a calm founder handoff, no facts
    id: 'complaint',
    kind: 'handoff',
    route: 'builtin:complaint',
    topics: ['complaint'],
    upset: true,
    test: (s) =>
      /\b(?:bbb|better business bureau|consumer protection|attorney general|ftc|complain|complaining|complained|complaint|complaints)\b/.test(s) ||
      /\b(?:report|reporting|reported) (?:you|you guys|yall|this (?:site|company|website|app|business)|prnm|pool rental near me|your (?:site|company|website|app|business))\b/.test(s) ||
      /\b(?:leave|leaving|write|writing|post|posting|give|giving) (?:you |yall |you guys )?(?:a )?(?:bad|negative|1 star|one star|terrible|horrible|awful) reviews?\b|\breview (?:you|you guys|yall|this (?:site|company))\b/.test(s),
  },
  {
    // last: only when nothing else fits. A bare cry ("HELP!!!", "pls help") or "she's not responding"
    // with nothing else: one question (911 line first), never a page on the cry alone
    id: 'possible-emergency-check',
    kind: 'check',
    topics: ['possible emergency'],
    test: (s, v) =>
      cryCheck(v.raw, v) ||
      unresponsivePerson(v) === 'check' ||
      (injuryResolved(v) && v.parts.some((p) => injuryActual(stripHypo(p)))),
  },
];

const SPLIT = /[.?!;,:\n]+/;
// dropped-g slang ("he aint movin", "she not respondin", "hes havin a seizure")
const DROPPED_G =
  /\b(mov|breath|respond|bleed|drown|chok|wak|seiz|shak|foam|fall|faint|puk|throw|vomit|cry|scream|hav|gett|com|go|sink|struggl|convuls|twitch|swell|burn|dy|attack|bit|follow|touch|grabb|star|watch|threaten|yell|hitt|punch|kick|swimm|float|lay|ly|gasp|cough|wheez|shiver|trembl|jerk)in\b/g;
const unDropG = (s) => s.replace(DROPPED_G, '$1ing');
function view(text) {
  const raw = String(text || '');
  const parts = raw
    .split(SPLIT)
    .map((p) => benign(unDropG(clean(p))))
    .filter(Boolean);
  return { s: benign(unDropG(clean(raw))), parts: parts.length ? parts : [''], raw };
}

/**
 * @param {string} raw        customer text (already card/password-redacted)
 * @param {string|Function} [alt]  spell-corrected version of the same text, or a
 *                            function that corrects one sentence part (keeps the
 *                            sentence boundaries "if …" clauses depend on)
 * @returns {null | { id, kind, route, topics, rule8, lead911, routes?, titles?, prompt?, all: string[] }}
 */
function detectGuards(raw, alt) {
  const variants = [view(raw)];
  if (alt) {
    const a =
      typeof alt === 'function'
        ? view(
            String(raw || '')
              .split(/([.?!;,:\n]+)/)
              .map((p, i) => (i % 2 ? p : alt(p)))
              .join('')
          )
        : view(alt);
    if (a.s && a.s !== variants[0].s) variants.push(a);
  }
  const hits = [];
  for (const rule of RULES) {
    if (variants.some((v) => v.s && rule.test(v.s, v))) hits.push(rule);
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
    lead911: !!first.lead911,
    topics,
    rule8: hits.some((h) => h.rule8),
    // an angry customer (complaint, dispute, scam, theft, accusation): calm voice from here on
    upset: hits.some((h) => h.upset),
    all: hits.map((h) => h.id),
  };
}

/**
 * The sentence part(s) of a long message that made a rule fire ("... wait my son is not breathing"),
 * so the founders' note quotes the emergency, not the first 500 characters of a ramble.
 * @returns {string|null}
 */
function triggerExcerpt(raw, ruleId, alt) {
  const rule = RULES.find((x) => x.id === ruleId);
  if (!rule) return null;
  const pieces = String(raw || '').split(/(?<=[.?!;\n])\s*/).filter((p) => p.trim());
  const fits = (p) => {
    const vs = [view(p)];
    if (typeof alt === 'function') vs.push(view(alt(p)));
    return vs.some((v) => v.s && rule.test(v.s, v));
  };
  for (let i = pieces.length - 1; i >= 0; i--) {
    if (!fits(pieces[i])) continue;
    // the matching sentence, with the one before it when that still fits
    const withPrev = i > 0 ? `${pieces[i - 1]} ${pieces[i]}` : pieces[i];
    if (withPrev.length <= MAX_STORED_CHARS) return withPrev;
    if (pieces[i].length <= MAX_STORED_CHARS) return pieces[i];
    // one long run-on sentence: the window of words where it happens, searched from the end
    const words = pieces[i].split(/\s+/);
    for (let end = words.length; end > 0; end -= 12) {
      const win = words.slice(Math.max(0, end - 24), end).join(' ');
      if (fits(win)) return `…${win}`;
    }
    return `…${pieces[i].slice(-(MAX_STORED_CHARS - 1))}`;
  }
  return null;
}

/**
 * Any injury, medical, violence or danger signal, soft ones included (used where no new alert may
 * start: after a sent or capped handoff, where the 911 line and an urgent label are cheap).
 * @param {string} text
 * @param {Function} [alt]  corrects one sentence part (the same speller detectGuards uses)
 */
function dangerSignal(text, alt) {
  const views = [view(text)];
  if (typeof alt === 'function') {
    const a = view(
      String(text || '')
        .split(/([.?!;,:\n]+)/)
        .map((p, i) => (i % 2 ? p : alt(p)))
        .join('')
    );
    if (a.s && a.s !== views[0].s) views.push(a);
  }
  return views.some(
    (v) =>
      injuryInFact(v) ||
      dangerInFact(v) ||
      violenceInFact(v) ||
      harassment(v.s, v) ||
      structuralDanger(text, v) ||
      cryCheck(text, v) ||
      unresponsivePerson(v) === 'check' ||
      foreignEmergency(v.s) ||
      softDangerView(v)
  );
}

// ----------------------------------------------------------------- structural checks
/*
 * Vocabulary never covers every way of saying "someone is in trouble". These
 * checks look at the SHAPE of a message instead: a person, plus a medical,
 * distress or violence cue (or a cry for help near water). They never answer
 * anything by themselves: a strong shape is an urgent handoff, a soft one
 * makes the assistant ask "is someone hurt or in danger?" (with the 911 line
 * first) instead of offering unrelated bank answers.
 */
const THIRD = r(`\\b(?:he|hes|she|shes|someone|somebody|him|her|they|theyre|them|${PNOUN})\\b`);
const ANY_PERSON = r(`\\b(?:i|im|me|my|we|us|our|he|hes|she|shes|someone|somebody|anyone|him|her|they|theyre|them|${PNOUN})\\b`);
// a named family member, child or a person as a noun phrase, or he / she (not just "my" or "I", and not
// "the host" on its own: most support questions are about the host)
const FAMILY = alt(
  'son|sons|daughter|daughters|kid|kids|child|children|baby|babies|toddler|toddlers|infant|boy|boys|girl|girls|' +
    'friend|friends|wife|husband|mom|mum|mommy|mother|dad|daddy|father|brother|sister|bro|sis|grandma|grandpa|' +
    'grandmother|grandfather|nephew|niece|cousin|partner|boyfriend|girlfriend|bf|gf|hubby|teen|teens|teenager|' +
    'teenagers|grandson|granddaughter|grandkid|grandkids|stepson|stepdaughter|homie|buddy|kiddo|aunt|auntie|uncle|' +
    'fiance|fiancee|little one|lil one|lil bro|lil sis|little brother|little sister|swimmer|swimmers'
);
const PERSON_REF = r(
  `\\b(?:(?:my|our|his|her|their|a|the|this|that|some|one of my|one of the) (?:\\w+ )?(?:${FAMILY}|${AGE})|(?:a|the|some|this|that) (?:\\w+ )?(?:man|guy|woman|lady|dude|person|stranger|kid|child|body)|someone|somebody|he|hes|she|shes|him)\\b`
);
const WATER_WORDS =
  /\b(?:pool|water|deep end|shallow end|deep|hot tub|hottub|spa|jacuzzi|lake|underwater|diving board|slide|swimming)\b/;
// a cry for help, not "can you help me find a pool" (checked on the raw text: capitals and "!" matter)
const HELP_CAPS = /\bHELP\b/;
const HELP_CRY =
  /\bhelp+\s*!|\b(?:help|hlp|helpp+)[\s,.!]+(?:help|hlp|helpp+)\b|\b(?:someone|somebody|anyone|anybody|please|pls|plz|send|get) help\b(?!\s+(?:me|us)?\s*(?:find|book|with|to|get|understand|figure|choose|pick|change|cancel|list|set|out|on|please with|for my))|\bneed help (?:now|right now|asap|fast|quick|quickly|immediately)\b|^\W*(?:help|hlp|helpp+)\W*$/i;
// "help my son ..." at the very start: a cry only together with a distress cue ("help, my booking ..." is not)
const HELP_START =
  /^\W*(?:help|hlp|helpp+)\b[\s,.!:-]+(?:my|our|someone|somebody|he|hes|she|shes|they|a kid|the kid|kid|child|baby|son|daughter|there s|theres)\b/i;
// help with a task ("HELP ME FIND A POOL", "I NEED HELP WITH MY BOOKING"), or a polite "can someone help me": not a cry
const HELP_TASK =
  /\bhelp(?:ing)? (?:me |us |my \w+ )?(?:to )?(?:find|book|booking|with|pick|choose|get a|understand|figure|change|cancel|plan|planning|out with|on|list|listing|set up|setup|decide|reserve|pay|sign|log|choosing|picking|finding|organize)\b/;
const POLITE_HELP =
  /^(?:hi |hey |hello )?(?:(?:can|could|will|would) )?(?:some ?one|some ?body|any ?one|any ?body|you|u) (?:please |pls |plz )?help(?: me| us)?(?: please| pls| plz| out| here| quick)?$|^(?:hi |hey |hello )?(?:i )?(?:need|want) (?:some )?help(?: please| pls| plz| here)?$|^(?:help me|help us)(?: please| pls| plz)?$/;
// a booking or how-to question: never treated as a possible emergency by shape alone
const PLAIN =
  /\b(?:book|books|booking|bookings|booked|reserv\w*|price\w*|cost\w*|fee|fees|pay|paid|pays|paying|payment\w*|payout\w*|refund\w*|cancel\w*|reschedul\w*|listing\w*|listed|calendar|availab\w*|account|login|log in|sign in|sign up|password|email|app|site|website|link|promo|discount\w*|coupon|code|review|reviews|rating|heated|heater|bathroom|restroom|parking|grill|music|speaker|snacks|food|drinks|alcohol|pets?|dog|floaties|floats|toys|towels|lifeguard|fence|how deep|hours|hour|minimum|today|tomorrow|tonight|weekend|saturday|sunday|monday|tuesday|wednesday|thursday|friday|birthday|bday|party|how many|message|messages|messaged|messaging|replied|reply|replies|accept\w*|declin\w*|request\w*|offer|invite|stripe|bank|tax\w*|swimply|instant|confirm\w*|receipt|invoice|charge\w*|swim|swimming|visit|bring|slide|diving|wants to know|want to know|asking (?:if|whether|about|for)|asked (?:if|whether|about)|wondering|curious)\b/;
// medical, distress or violence cue words (broad on purpose: this only ever asks a question)
const CUE =
  /\b(?:breath|breathe|breathing|breathin|unresponsive|limp|underwater|drown\w*|struggl\w*|distress|sinking|chok\w*|wheez\w*|blood|bloody|bleed\w*|bleedin|unconscious|dizzy|faint\w*|seiz\w*|convuls\w*|swelling|swollen|vomit\w*|puk\w*|throwing up|threw up|injur\w*|zapped|stung|bitten|sprain\w*|fractur\w*|concus\w*|knocked out|collaps\w*|emergency|ambulance|911|cpr|punch\w*|slapp\w*|shoved|grabbed|grabbing|guns?|knife|knives|weapons?|stab\w*|threaten\w*|terrified|creep\w*|stalk\w*|harass\w*|naked|not moving|isnt moving|wont move|wont wake|not waking|passed out|went under|going under|foaming|shaking|trembling|twitching|attacking|slurs?|n word)\b/;
// cue words that only mean something next to a named person ("my son is missing", not "my payout is missing")
const PERSON_CUE =
  /\b(?:missing|cant find|cannot find|lap|secret|snapchat|instagram|insta|(?:was|were|is|are|while|when) (?:\w+ )?changing|changing room|undress\w*|phone number|alone with|upstairs|bedroom|screaming|wont stop|hurt|hurts|hurting)\b/;
const SHOUTED = (raw) => {
  const letters = raw.replace(/[^A-Za-z]/g, '');
  return letters.length >= 10 && raw.replace(/[^A-Z]/g, '').length / letters.length > 0.7;
};
function cries(raw, v) {
  const t = String(raw || '');
  const task = HELP_TASK.test(v.s) || POLITE_HELP.test(v.s);
  return {
    strong: !task && (HELP_CAPS.test(t) || HELP_CRY.test(t)),
    weak: !task && (HELP_START.test(t) || SHOUTED(t)),
  };
}
/** A strong shape: a cry for help (or shouting) with a person near water and a distress cue. Urgent. */
function structuralDanger(raw, v = view(raw)) {
  const { strong, weak } = cries(raw, v);
  if (!strong && !weak) return false;
  if (!WATER_WORDS.test(v.s)) return false;
  const person = v.parts.some((p) => {
    const q = stripHypo(p);
    return q && THIRD.test(q);
  });
  // every cry needs a distress cue: "HELP! how do I book a pool for my son's birthday" is a booking question
  return person && CUE.test(v.s);
}
/**
 * A cry for help with no cue and no booking question in it ("HELP!!!", "pls help", "help"): ask whether
 * someone is hurt (the 911 line, one question), never page anyone on the cry alone.
 */
function cryCheck(raw, v = view(raw)) {
  const { strong } = cries(raw, v);
  return strong && !PLAIN.test(v.s);
}
// pain words count only about someone else ("my son's neck hurts"), not "my back hurts from work"
const PAIN_CUE = /\b(?:pain|pains|painful|hurt|hurts|hurting|ache|aching|sick|crying|cries)\b/;
const WORRY = /\b(?:might|could|would|worried|worry|worries|concerned|nervous|in case|chronic|always|usually|sometimes|from work|from sitting)\b/;
function softDangerView(v) {
  return v.parts.some((p) => {
    const q = stripHypo(p);
    if (!q || historyOnly(q) || QUESTION_START.test(q) || WORRY.test(q)) return false;
    return (
      (ANY_PERSON.test(q) && CUE.test(q)) ||
      (THIRD.test(q) && PAIN_CUE.test(q) && !PLAIN.test(clean(v.raw))) ||
      (PERSON_REF.test(q) && PERSON_CUE.test(q) && !PLAIN.test(clean(v.raw)) && !LIGHT.test(clean(v.raw)))
    );
  });
}
/**
 * A soft shape: a person plus a medical / distress / violence cue in the same
 * sentence part (not a question, not a worry about what might happen, not an
 * old injury). The assistant asks before offering anything else.
 */
function softDanger(raw) {
  const t = String(raw || '');
  const v = view(t);
  return structuralDanger(t, v) || cryCheck(t, v) || unresponsivePerson(v) === 'check' || softDangerView(v);
}
/**
 * The structural fallback for a message the matcher could not place: it describes a person (my son,
 * a 4 year old, he / she, a man) and is not a booking or how-to question. The assistant asks the
 * safety question (911 line first) instead of "say it another way" or an unrelated bank answer.
 * A false positive costs one question.
 */
function personConcern(raw) {
  const v = view(raw);
  const full = clean(raw);
  // a plain statement about a person ("my dad uses a wheelchair", "my son lost his phone") is not a
  // reason to ask about an emergency: the shape needs some urgency in how it is written
  if (!URGENCY_MARK.test(full) && !/!{2,}/.test(String(raw || '')) && !SHOUTED(String(raw || ''))) return false;
  // a statement only: "my kid is scared of the deep end, is there a shallow pool?" is a question
  if (PLAIN.test(full) || HOSTISH_ONLY.test(full) || LIGHT.test(full) || HELP_TASK.test(full) || /\?/.test(String(raw || ''))) return false;
  if (v.parts.some((p) => QUESTION_START.test(p) || QUESTION_INSIDE.test(p))) return false;
  return v.parts.some((p) => {
    const q = stripHypo(p);
    if (!q || historyOnly(q) || QUESTION_START.test(q) || WORRY.test(q)) return false;
    return PERSON_REF.test(q);
  });
}
// how people write when something is wrong right now
const URGENCY_MARK =
  /\b(?:omg|oh my god|oh god|oh no|hurry|quick|quickly|fast|right now|asap|immediately|help|what do i do|what do we do|what should i do|idk what to do|dont know what to do|freaking out|freakin out|panicking|panic|scared|terrified|emergency|urgent|cant tell|not sure if (?:he|she|they) (?:is|are) ok|is (?:he|she) ok)\b/;
// a joke, thanks or praise ("the host was really nice to my kids", "... drown me in questions lol")
const LIGHT =
  /\b(?:lol|lmao|lmfao|haha\w*|hehe\w*|jk|rofl|nice|great|awesome|amazing|kind|sweet|friendly|loved|love|loves|enjoyed|enjoy|fun|joy|laughing|playing|giggling|thank|thanks|thx|appreciate\w*|perfect|wonderful|helpful|best|happy|excited|cant wait|recommend\w*|pick|choose|find (?:a|me|us|some|the best|good)|looking for|suggest\w*|expensive|cheap|pricey)\b/;
// a question asked mid-sentence ("my kid fell asleep in the car can we arrive late")
const QUESTION_INSIDE =
  /\b(?:can|could|will|would|should|do|does|did|may|might) (?:we|i|you|u|they|he|she|it|my|our|the|someone|anyone|guests|kids)\b|\b(?:is|are) there\b|\bis it (?:ok|okay|fine|safe|possible|allowed)\b|\b(?:how|what|when|where|which|why) (?:do|does|can|should|is|are|long|much|many)\b/;
// account and site words: "he can't log in", "she never got the email" are support questions
const HOSTISH_ONLY =
  /\b(?:log ?in|logged|sign ?in|password|verify|verification|profile|photo upload|upload|publish|published|outdated|stripe|payout|tax form)\b/;

/*
 * A tiny non-English emergency fallback (no translation, no cost): "mi hijo se está ahogando",
 * "au secours mon fils se noie", "Hilfe, mein Sohn ertrinkt". It answers with the 911 line and a
 * founder handoff; it never tries to answer anything else in another language.
 */
const FOREIGN_EMERGENCY = [
  /\b(?:ahog\w*|se esta ahogando|socorro|auxilio|emergencia|ambulancia|no respira|sangr\w*|inconscient\w*|desmay\w*|convulsion\w*)\b/,
  /\bayuda\b.*\b(?:hijo|hija|nino|nina|ninos|bebe|bebé|mi esposo|mi esposa|alguien|piscina|agua)\b|\b(?:hijo|hija|nino|nina|bebe|alguien)\b.*\bayuda\b/,
  /\b(?:se noie|noyade|au secours|a l aide|à l aide|ne respire pas|saigne|inconscient\w*|urgence)\b/,
  /\b(?:hilfe|ertrinkt|ertrinken|atmet nicht|bewusstlos|blutet|notfall|notarzt)\b/,
  /\b(?:afogando|socorro|nao respira|inconsciente)\b/,
];
function foreignEmergency(s) {
  return FOREIGN_EMERGENCY.some((re) => re.test(s));
}

const RULE8_WORDS =
  /\b(insur\w*|insurence|liab\w*|coverage|indemn\w*|lawsuit\w*|sue|sues|sued|suing|lawyer\w*|attorney\w*|claims?|damag\w*|injur\w*|waiver\w*|waver|guarantee\w*|homeowner\w*|umbrella policy|legally responsible|financially responsible|at fault|on the hook)\b/;
/**
 * Does the customer's own text touch a rule-8 topic (injury, insurance,
 * liability, coverage, claims or damage)? Computed for every handoff, whatever
 * path led there, so Derek is always named as the one who answers.
 */
function rule8Text(text) {
  const t = String(text || '');
  if (!t.trim()) return false;
  const v = view(t);
  if (RULE8_WORDS.test(v.s)) return true;
  return (
    insurance(v.s) || damage(v.s) || liabilityHypothetical(v) || injuryAnywhere(v)
  );
}

// ----------------------------------------------------------------- founder / human request
const HUMAN_TARGET =
  '(human|humans|person|someone|somebody|agent|representative|rep|founder|founders|derek|brandon|support|team|staff|manager|supervisor|operator|real person|realperson|customer service|customer support|management|someone in charge|whoever runs this|whoever runs it)';
const ASK_FOR_HUMAN = new RegExp(
  `\\b(talk|speak|chat|connect|transfer|put me through|get me|give me|gimme|lemme talk|lemme speak|reach|contact|escalate|complain)\\b.{0,30}\\b${HUMAN_TARGET}\\b`
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
  // "live agent", "a live person please"
  if (
    !/^(am i|are you|r u|are u|is this|is that|is it|who)\b/.test(s) &&
    /\b(live|real|human|actual) (agent|agents|rep|representative|operator)\b|^(a |the )?live (person|chat)( please| pls| plz| now)?$/.test(s)
  )
    return true;
  // "I don't want to talk to a robot"
  if (/\b(dont|do not|dont wanna|do not wanna|no more|stop|tired of|sick of|done with) (want (to )?)?((talk|talking|speak|speaking|chat|chatting) (to|with) )?(a |an |this |the |your )?(bot|bots|robot|robots|machine|computer|automated (thing|assistant|system))\b/.test(s))
    return true;
  // "I want to talk to the owner of this site" is about us, not a pool owner
  if (/\b(owner|owners|founder|founders|boss|ceo|head|manager|people who run|person who runs|whoever owns) (of|behind|that runs|who runs) (this|the|your) (site|website|company|business|app|platform|place|chat)\b/.test(s))
    return true;
  // "this app sucks, human please", "human. now. my payout"
  if (/\b(human|real person|agent|representative) (please|pls|plz|now|asap)\b/.test(s)) return true;
  // "can a human help me", "help from a real person"
  if (/\b(a |an |the |some )?(human|real person|actual person|live person|agent|representative)\b.{0,15}\bhelp\b|\bhelp from (a |an )?(human|real person|actual person|live person|person|agent)\b/.test(s))
    return true;
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

// Words that only express "get me a person" (or frustration, or filler); anything else left over is the question itself.
const HUMAN_REQUEST_WORDS = new Set(
  (
    'talk speak chat connect transfer reach contact escalate put through get give human humans person someone somebody ' +
    'agent representative rep founder founders derek brandon support team staff manager operator real realperson ' +
    'whoever runs run this bot bots not no please pls plz want need like would could may can let me now asap ' +
    // filler and frustration: "great, another useless bot. get me a human NOW" has no question in it
    'actually yes yeah yep yup yea okay sure great another useless stupid dumb idiotic pointless worthless terrible ' +
    'awful worst garbage trash joke ridiculous wtf omg ugh seriously literally really honestly right away immediately ' +
    'robot robots machine automated assistant thing hello hey hii there anyone anybody somebody already again still ' +
    'over fine whatever just quick quickly urgent urgently help helpful thank thanks thx sorry kidding damn dammit hell ' +
    'freaking frickin fricking fucking real live actual one talking speaking chatting with hurry ok lol come ' +
    // slang and complaints about us: "lemme speak to a manager", "your site is a joke get me a human NOW"
    'lemme wanna gimme gotta gonna site website app sucks sucked suck supervisor customer service owner complain ' +
    'management ' +
    // round 3: "i dont want to talk to a robot", "live agent", "the owner of this site"
    'dont does doesnt not more tired done sick live boss ceo head runs behind company business platform owners ' +
    'agents reps people chatbot computer automated system'
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
          !/^(the|and|for|you|are|with|about|just|okay|thanks|that|this|its|was|were|has|have|had|but|they|them|your|yours|our|from|into|what|who|why|how)$/.test(
            w
          )
      ).length > 0
  );
}

/** Is the message (or its first sentence part) phrased as a question ("is the pool safe for kids?")? */
function isQuestion(text) {
  const raw = String(text || '');
  const v = view(raw);
  return v.parts.some((p) => QUESTION_START.test(p)) || /\?/.test(raw);
}

module.exports = {
  MAX_INPUT_CHARS,
  isQuestion,
  MAX_STORED_CHARS,
  capText,
  prepareInput,
  luhnValid,
  scanSensitive,
  redactForLog,
  findEmail,
  isValidEmail,
  findBookingRef,
  findRefToken,
  stripRefs,
  yesNo,
  declinesBookingRef,
  mood,
  detectGuards,
  dangerSignal,
  softDanger,
  personConcern,
  triggerExcerpt,
  rule8Text,
  wantsHuman,
  questionRemains,
  RULES,
};
