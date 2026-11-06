'use strict';
/**
 * Language data for the matcher. Edit here, then run `npm test`.
 *
 *  PHRASES   multi-word expressions folded into one token before tokenising
 *  SLANG     shorthand / texting spellings → plain words (token level)
 *  SYNONYMS  canonical concept ← surface words (matched after stemming)
 *  STOPWORDS dropped before scoring (question words when/where/who/why are kept)
 *  COMMON    real English words that must never be "spell-corrected" into a bank word
 */

// Applied in order to the lower-cased, punctuation-light string.
const PHRASES = [
  // chat shorthand that phrases below depend on
  [/\bur\b/g, ' your '],
  [/\bu\b/g, ' you '],
  [/\br\b/g, ' are '],
  [/\bw o\b/g, ' without '],
  [/\bhot ?tubs?\b/g, ' hottub '],
  [/\bjacuzzis?\b/g, ' hottub '],
  [/\bcold ?plunges?\b/g, ' coldplunge '],
  [/\b(?:log|sign) ?(?:in|on)\b/g, ' login '],
  [/\bsign ?up\b/g, ' signup '],
  [/\b(?:log|sign) ?out\b/g, ' logout '],
  [/\bcash ?app\b/g, ' cashapp '],
  [/\bapple ?pay\b/g, ' applepay '],
  [/\bgoogle ?pay\b/g, ' googlepay '],
  [/\bpay ?pal\b/g, ' paypal '],
  [/\bmoney back\b/g, ' refund '],
  [/\b(?:back(?:ed|ing|s)? out)\b/g, ' backout '],
  [
    /\b(?:get|gets|getting|got|gotten|heard|hear|write|wrote|written|reply|replied|respond|responded) back(?: to (?:me|us))?\b/g,
    ' reply ',
  ],
  [/\bemail address(?:es)?\b/g, ' email '],
  // asking for OUR contact details ("do you have a phone number") vs changing their own
  [
    /\b(?:do you(?: guys)? have|whats your|what is your|is there|give me|can i get|need|got) (?:an? |the |your |a support )?(?:support )?(?:phone(?: number)?|number to call|email|contact(?: info| details)?)\b/g,
    ' contactinfo ',
  ],
  [/\bhow much\b/g, ' howmuch '],
  [/\bhow long\b/g, ' howlong '],
  [/\bhow many\b/g, ' howmany '],
  [/\breal (?:person|human)\b/g, ' realperson '],
  // "my booking got cancelled" (someone else cancelled) vs "cancel my booking"
  [/\b(got|was|been|were|get|gets|is) ((?:[a-z]+ ){0,2})cancell?ed\b/g, ' $1 $2 hostcancelled '],
  [/\be ?mail\b/g, ' email '],
  [/\bcheck ?in\b/g, ' checkin '],
  [/\bopt ?out\b/g, ' optout '],
  [/\badd ?ons?\b/g, ' addon '],
  [/\bset ?up\b/g, ' setup '],
  [/\b1099 ?k\b/g, ' 1099k '],
  [/\bpromocodes?\b/g, ' promo code '],
  [/\binstabook(?:ing)?\b/g, ' instant book '],
  [/\bwi ?fi\b/g, ' wifi '],
  [/\bshow(?:ed|ing|s)? up\b/g, ' arrive '],
  [/\bcan ?not\b/g, ' not '],
];

const SLANG = {
  u: 'you',
  ur: 'your',
  r: 'are',
  ya: 'you',
  yu: 'you',
  pls: 'please',
  plz: 'please',
  plez: 'please',
  thx: 'thanks',
  thanx: 'thanks',
  ty: 'thanks',
  tysm: 'thanks',
  ppl: 'people',
  peeps: 'people',
  ppls: 'people',
  msg: 'message',
  msgs: 'message',
  dm: 'message',
  txt: 'text',
  txts: 'text',
  txting: 'text',
  texting: 'text',
  rn: 'now',
  b4: 'before',
  bc: 'because',
  cuz: 'because',
  coz: 'because',
  bcuz: 'because',
  wanna: 'want',
  gonna: 'going',
  gotta: 'got',
  lemme: 'let',
  im: 'i',
  ive: 'i',
  ill: 'i',
  dont: 'not',
  doesnt: 'not',
  didnt: 'not',
  cant: 'not',
  wont: 'not',
  isnt: 'not',
  arent: 'not',
  wasnt: 'not',
  werent: 'not',
  havent: 'not',
  hasnt: 'not',
  hadnt: 'not',
  shouldnt: 'not',
  couldnt: 'not',
  wouldnt: 'not',
  aint: 'not',
  cnt: 'not',
  dnt: 'not',
  nt: 'not',
  wat: 'what',
  wut: 'what',
  whut: 'what',
  wen: 'when',
  whn: 'when',
  whr: 'where',
  hw: 'how',
  tho: 'though',
  thru: 'through',
  nite: 'night',
  tmrw: 'tomorrow',
  tmr: 'tomorrow',
  tmrow: 'tomorrow',
  '2day': 'today',
  '2nite': 'tonight',
  tonite: 'tonight',
  '2morrow': 'tomorrow',
  2: 'to',
  4: 'for',
  wknd: 'weekend',
  wkend: 'weekend',
  wknds: 'weekend',
  hlp: 'help',
  halp: 'help',
  acct: 'account',
  pw: 'password',
  pwd: 'password',
  passwd: 'password',
  pix: 'photo',
  cal: 'calendar',
  k: 'ok',
  kk: 'ok',
  okk: 'ok',
  okey: 'ok',
  yea: 'yes',
  yeah: 'yes',
  yah: 'yes',
  yep: 'yes',
  yup: 'yes',
  yeh: 'yes',
  nah: 'no',
  nope: 'no',
  payed: 'paid',
  hav: 'have',
  w: 'with',
  went: 'go',
  gone: 'go',
  goes: 'go',
  bok: 'book',
  boook: 'book',
  bookin: 'booking',
  resrve: 'reserve',
  abt: 'about',
  bday: 'birthday',
  hrs: 'hours',
  hr: 'hour',
  mins: 'minutes',
};

// canonical ← surface forms. The canonical word itself is also mapped.
const SYNONYMS = {
  book: [
    'booking',
    'bookings',
    'booked',
    'reserve',
    'reserved',
    'reservation',
    'reservations',
    'reserving',
  ],
  cancel: [
    'cancelled',
    'canceled',
    'cancelling',
    'canceling',
    'cancellation',
    'cancellations',
    'cancelation',
    'cancle',
    'cancels',
  ],
  refund: ['refunds', 'refunded', 'refundable', 'reimburse', 'reimbursement', 'reimbursed'],
  guest: ['guests', 'people'],
  price: ['prices', 'pricing', 'priced', 'cost', 'costs', 'rate', 'rates'],
  pay: ['payment', 'payments', 'paying', 'pays'],
  photo: ['photos', 'picture', 'pictures', 'pic', 'pics', 'image', 'images'],
  bathroom: ['bathrooms', 'restroom', 'restrooms', 'toilet', 'toilets', 'washroom', 'loo'],
  pet: [
    'pets',
    'dog',
    'dogs',
    'puppy',
    'puppies',
    'pup',
    'pups',
    'cat',
    'cats',
    'animal',
    'animals',
  ],
  alcohol: [
    'booze',
    'beer',
    'beers',
    'wine',
    'liquor',
    'alchohol',
    'byob',
    'drink',
    'drinks',
    'drinking',
    'alcoholic',
  ],
  kid: [
    'kids',
    'child',
    'children',
    'minor',
    'minors',
    'teen',
    'teens',
    'teenager',
    'teenagers',
    'toddler',
    'toddlers',
  ],
  heated: ['heat', 'heater', 'heating', 'warm', 'warmer'],
  hottub: ['spa', 'hottubs'],
  accessible: [
    'wheelchair',
    'ada',
    'handicap',
    'handicapped',
    'accessibility',
    'disabled',
    'disability',
    'mobility',
    'walker',
  ],
  park: ['parking', 'parked'],
  hurt: ['injury', 'injured', 'injuries', 'injure', 'hurting'],
  scam: ['scams', 'scammer', 'scammers', 'fraud', 'fraudulent', 'phishing'],
  weather: ['rain', 'raining', 'rainy', 'storm', 'storms', 'thunderstorm', 'thunder'],
  tax: ['taxes', 'taxable'],
  verify: ['verification', 'verified', 'verifying'],
  list: ['listing', 'listings', 'listed'],
  host: ['hosts', 'hosting', 'hosted', 'owner', 'owners'],
  swim: ['swimming', 'swims', 'swam'],
  rule: ['rules', 'rulez', 'regulation', 'regulations'],
  arrive: ['arrival', 'arriving', 'arrived'],
  dive: ['diving', 'dived'],
  earn: ['earnings', 'earned', 'earning', 'income'],
  calendar: ['calendars', 'calender'],
  message: ['messages', 'messaging'],
  text: ['texts', 'sms'],
  stop: ['unsubscribe', 'optout'],
  human: ['humans', 'agent', 'agents', 'representative', 'rep', 'operator'],
  bot: ['robot', 'robots', 'ai', 'chatbot', 'automated', 'chatgpt'],
  founder: ['founders', 'derek', 'brandon'],
  address: ['adress', 'addres', 'location', 'located'],
  discount: ['discounts', 'coupon', 'coupons', 'voucher', 'vouchers', 'deal', 'deals'],
  fee: ['fees', 'commission', 'commissions', 'commision', 'cut'],
  phone: ['phones', 'cell', 'mobile', 'cellphone'],
  account: ['accounts', 'acount', 'profile'],
  payout: ['payouts', 'payot'],
  music: ['song', 'songs', 'speaker', 'speakers'],
  noise: ['loud', 'noisy'],
  damage: ['damaged', 'damages', 'damge'],
  insurance: ['insured', 'insurence', 'insure'],
  unsafe: ['dangerous', 'danger', 'hazard', 'hazardous'],
  harass: ['harassed', 'harassment', 'harassing'],
  change: [
    'changes',
    'changing',
    'changed',
    'chnage',
    'modify',
    'modified',
    'edit',
    'edits',
    'editing',
    'edited',
    'update',
    'updating',
    'updated',
    'updte',
  ],
  extend: ['extension', 'extended'],
  hide: ['hidden'],
  weekend: ['weekends', 'saturday', 'saturdays', 'sunday', 'sundays'],
  confirm: ['confirmed', 'confirmation', 'confirming'],
  accept: [
    'accepted',
    'accepting',
    'accepts',
    'approve',
    'approved',
    'approval',
    'approving',
    'aprove',
  ],
  request: ['requests', 'requested', 'requesting'],
  reply: [
    'replied',
    'replies',
    'respond',
    'responding',
    'responded',
    'response',
    'answer',
    'answered',
    'answering',
    'answerd',
  ],
  problem: ['issue', 'issues', 'problems', 'trouble'],
  error: ['errors', 'glitch', 'glitches', 'bug', 'bugs'],
  dirty: ['gross', 'filthy'],
  fence: ['fencing', 'barrier'],
  allow: ['allowed', 'allowing', 'permitted', 'alowed'],
  bring: ['brought', 'bringing'],
  decline: ['declined', 'declines', 'rejected', 'reject', 'denied'],
  expire: ['expired', 'expires', 'expiring', 'expiry'],
  hour: ['hours', 'hourly'],
  minimum: ['min', 'minimun'],
  maximum: ['max'],
  friend: ['friends'],
  family: ['families'],
  party: ['parties'],
  late: ['delayed'],
};

const STOPWORDS = new Set(
  (
    'a an the i me my mine myself you your yours yourself is are am was were be been being do does did doing done ' +
    'to of for in on at by with from up about into it its this that these those there here and or but if so as ' +
    'just any some can could would should will shall may might must have has had having get gets got getting gotten ' +
    'what which our ours we us they them their theirs he she him her his hers whats thats theres hows lets ' +
    'please hi hey hello thanks thank ok okay yes sure also too very really even then than want need like ' +
    'know tell help guys anyone anything something thing things way out off over again ever all each ' +
    'let make sure well oh um uh hmm lol ' +
    // feelings and filler carry no topic: "THIS IS RIDICULOUS the host cancelled" is about a cancellation
    'ridiculous unacceptable terrible awful horrible seriously honestly literally basically actually ' +
    'wtf omg ugh lmao smh idk tbh btw fyi asap urgent urgently quickly'
  ).split(/\s+/)
);
// "how" and "pool" are kept on purpose: IDF gives them little weight, but they keep
// "how do I book" apart from "my bookings" and "locked out of the pool" apart from "locked out".

// Real words the spell-corrector must leave alone (otherwise "feel" → "fell", "most" → "host", ...).
const COMMON = new Set(
  (
    'feel feels felt like most good well best nice fine cool love look looks looking sure great awesome amazing ' +
    'right left long short big small little lot lots many much more less few same different other another new old ' +
    'first last next week month year day days today tonight tomorrow yesterday morning evening night time times ' +
    'now soon later early late already still always never sometimes maybe probably actually ' +
    'one two three four five six seven eight nine ten hundred thousand ' +
    'yes no not okay ok thanks hello please sorry wait home house place area city town street ' +
    'mom dad wife husband son daughter brother sister friend friends family baby partner ' +
    'work job hand head leg arm face door window car cars road water wet dry clean hot cold sun shade ' +
    'happy sad mad upset angry weird strange stupid dumb bad worse worst better ' +
    'buy sell send sent give gave take took put keep kept call called come came go going went see saw ' +
    'say said ask asked try tried use used find found show showed open opened run ran turn turned ' +
    'real true false sure else ever every why when where who whom whose ' +
    'say says told tell talking talk speak spoke chat chatting ' +
    'file files filed filing filling fill form forms film treat treats treated great manage managed manager ' +
    'used using sure cure dancer ranger hunt hint harm farm heart hear heard sign signed signing sing ' +
    'inquiry inquiries enquiry query press'
  ).split(/\s+/)
);

// Incidental detail words (when, how many): they should not make an otherwise clear question look unexplained.
const CONTEXT_WORDS = new Set(
  (
    'weekend today tonight tomorrow morning afternoon evening night week month year day days time date next last this ' +
    'monday tuesday wednesday thursday friday am pm number kind type option options way thing stuff info detail details ' +
    'family friend kid soon later early please quick yet still already again anymore'
  ).split(' ')
);

module.exports = { PHRASES, SLANG, SYNONYMS, STOPWORDS, COMMON, CONTEXT_WORDS };
