'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('../engine/safety');
const { loadEngine } = require('./helpers');
const { correctedText } = require('../engine/normalize');

const { SAFETY_TARGETS } = require('../engine/flows');

const { engine } = loadEngine();
const guard = (t) => s.detectGuards(t, correctedText(t, engine.matcher.speller, SAFETY_TARGETS));

test('Luhn: real test card numbers pass, near-misses fail', () => {
  assert.ok(s.luhnValid('4242424242424242'));
  assert.ok(s.luhnValid('4111111111111111'));
  assert.ok(s.luhnValid('378282246310005'));
  assert.ok(!s.luhnValid('4242424242424241'));
  assert.ok(!s.luhnValid('1234567890123456'));
});

test('card numbers are redacted and never echoed; phone numbers and booking ids are left alone', () => {
  const r = s.scanSensitive('card 4242-4242-4242-4242 exp 12/28 cvv 123, call me 555-201-3344');
  assert.equal(r.cards, 1);
  assert.equal(r.cvv, 1);
  assert.doesNotMatch(r.text, /4242/);
  assert.doesNotMatch(r.text, /\b123\b/);
  assert.match(r.text, /555-201-3344/);
  assert.equal(s.scanSensitive('order 6abaf08c-023d-4f34-8e87-74ea4a6efac4').found, false);
  assert.equal(s.scanSensitive('my card 1234 5678 9012 3456 (not a real number)').cards, 0);
});

test('passwords are redacted', () => {
  const r = s.scanSensitive('my password is Hunter2!! please reset it');
  assert.equal(r.passwords, 1);
  assert.doesNotMatch(r.text, /Hunter2/);
});

test('log redaction removes cards, emails, phones and booking ids', () => {
  const out = s.redactForLog(
    '4111 1111 1111 1111 me@example.com +1 (555) 201-3344 6abaf08c-023d-4f34-8e87-74ea4a6efac4'
  );
  assert.doesNotMatch(out, /4111|example\.com|201-3344|6abaf08c/);
});

test('booking reference: UUIDs, order links, "booking ref: X"', () => {
  assert.equal(
    s.findBookingRef('https://www.poolrentalnearme.com/order/6ABAF08C-023d-4f34-8e87-74ea4a6efac4'),
    '6abaf08c-023d-4f34-8e87-74ea4a6efac4'
  );
  assert.equal(s.findBookingRef('booking reference: PRNM-1234'), 'PRNM-1234');
  assert.equal(s.findBookingRef('my booking is tomorrow'), null);
});

test('urgent: injury and danger (including typos) → safety-injury', () => {
  for (const t of [
    'someone is drowning',
    'my sun is drowing',
    'my kid got injurd',
    'guest slipped and fell',
    'there was an accident',
    'call an ambulance',
    'he hit his head',
  ]) {
    const g = guard(t);
    assert.ok(g, t);
    assert.equal(g.kind, 'urgent', t);
    assert.equal(g.route, 'safety-injury', t);
  }
});

test('urgent routing for every rule-8 / safety / dispute topic', () => {
  const cases = {
    'i was harassed by the host': 'safety-harassment',
    'i feel unsafe right now': 'safety-harassment',
    'the gate doesnt latch': 'safety-unsafe-pool',
    'water looks green and cloudy': 'safety-unsafe-pool',
    'locked out of the pool and host isnt answering': 'arrive-cant-get-in',
    'host didnt show up and were here': 'arrive-cant-get-in',
    'guests broke my patio chair': 'safety-damage',
    'how do i file a damage claim': 'safety-damage',
    'do you have insurance': 'safety-insurance',
    'am i covered if a guest gets hurt': 'safety-insurance',
    'who pays if a guest sues me': 'safety-insurance',
    'is this listing a scam': 'safety-scam-report',
    'someone asked for my password': 'safety-scam-report',
    'my guests wont leave': 'dispute-guest-breaking-rules',
    'i was charged twice': 'builtin:dispute-charge',
    'im filing a chargeback': 'builtin:dispute-charge',
  };
  for (const [t, route] of Object.entries(cases)) {
    const g = guard(t);
    assert.ok(g, t);
    assert.equal(g.kind, 'urgent', t);
    assert.equal(g.route, route, t);
  }
  assert.equal(guard('am i covered if a guest gets hurt').rule8, true);
});

test('near-miss handoffs: questions the bank must not answer', () => {
  const cases = {
    'can i get my deposit back': 'builtin:deposit-question',
    'can i bring my service dog': 'builtin:service-animal',
    'can i list my apartment complex pool': 'builtin:host-eligibility',
    'can i rent out my backyard without a pool': 'builtin:host-eligibility',
    'what happens to my bookings if i close my listing': 'builtin:closed-listing-bookings',
    'how do i change my minimum hours': 'builtin:host-booking-limits',
    'how long does a refund take': 'builtin:refund-question',
    // a plain refund request is a normal handoff, not a billing dispute
    'i want a refund': 'builtin:refund-question',
    'what if the host doesnt show up': 'builtin:host-no-show',
    'is there a liability waiver': 'rules-waiver',
  };
  for (const [t, route] of Object.entries(cases)) {
    const g = guard(t);
    assert.ok(g, t);
    assert.equal(g.kind, 'handoff', t);
    assert.equal(g.route, route, t);
  }
});

test('no false alarms on ordinary questions', () => {
  for (const t of [
    'i accidentally broke a chair', // damage, not injury
    'how do i get paid',
    'set up direct deposit',
    'is the pool heated',
    'host not responding',
    'the umbrella is broken',
    'will i get a refund if i cancel',
    'refund policy',
    'what if someone gets hurt',
    'locked out of my account',
    'im filing my taxes',
    'how do i manage my listing',
    'i used my card',
    'treat yourself',
    'press inquiry',
  ]) {
    const g = guard(t);
    if (t === 'i accidentally broke a chair') assert.equal(g.route, 'safety-damage');
    else if (t === 'press inquiry') assert.equal(g.route, 'builtin:partnership', 'not "injury"');
    else if (t === 'what if someone gets hurt') assert.ok(!g || g.route !== 'safety-injury', t);
    else assert.equal(g, null, t);
  }
});

test('"locked out" alone asks which kind', () => {
  const g = guard("I'm locked out");
  assert.equal(g.kind, 'clarify');
  assert.deepEqual(g.routes, ['arrive-cant-get-in', 'account-02']);
});

test('human / founder requests, but not identity questions or "talk to the host"', () => {
  for (const t of [
    'human please',
    'agent',
    'talk to the founder',
    'speak to someone',
    'i want a person not a bot',
    'can i talk to derek',
    'connect me to support',
    'let me talk to whoever runs this',
    'are you able to connect me to a person',
  ]) {
    assert.ok(s.wantsHuman(t), t);
  }
  for (const t of [
    'are you a real person',
    'am i chatting with a human',
    'talk to the pool owner first',
    'how do i contact the host',
    'how do i reach customer service',
    'who am i talking to',
  ]) {
    assert.ok(!s.wantsHuman(t), t);
  }
  assert.equal(s.questionRemains('talk to the founder'), false);
  assert.equal(s.questionRemains('I want to talk to a human about my refund'), true);
});

test('mood: upset customers get flagged', () => {
  assert.equal(s.mood('THIS IS RIDICULOUS I WANT MY MONEY'), 'upset');
  assert.equal(s.mood('this is unacceptable'), 'upset');
  assert.equal(s.mood('hey how do i book'), 'neutral');
});

// ------------------------------------------------------------------ review fixes (fix2)
const guardFn = (t) =>
  s.detectGuards(t, (p) => correctedText(p, engine.matcher.speller, SAFETY_TARGETS));
const { entries } = loadEngine();

/** Every phrase quoted in the two reviews, plus close variants, with the route it must take. */
const MUST_ROUTE = {
  'safety-injury': [
    'my son passed out',
    'he is still not waking up',
    'someone fainted',
    'someone collapsed',
    'my kid got shocked by the pool light',
    'the pool cover trapped my kid',
    'my daughter is having an allergic reaction',
    'cut her foot',
    'she cut her foot on the step',
    'sprained her ankle',
    'the hosts dog bit my son',
    "the host's dog bit my son",
    'chlorine burned my eyes',
    'swallowed a lot of water and is coughing',
    'heat stroke',
    'my friend has heat stroke',
    'my son slipped and hit his head on the pool deck',
    "my daughter got hurt at the pol, she's bleding",
    'someone is not breathing at the pool',
    'my kid just fell in the pool and isnt breathing',
    'my kid was stung by a bee',
    'my eyes are burning from the chlorine',
    'her face is swelling',
    'he is having a seizure',
    'my daughter is unresponsive',
    'my kid hair got stuck in the drain',
    'he went under and isnt coming up',
    'i think he broke his arm',
    // an actual slip plus a liability question: the 911 line leads, rule 8 is flagged
    'my guest says she slipped. am i liable?',
  ],
  'safety-harassment': [
    'the host touched my daughter',
    'the host kept making sexual comments to my friend',
    'a guest exposed himself',
    'the host is drunk and yelling at us',
    'the host is watching us from the window',
    'the host was being weird with my kids',
    'he was being weird with my kids',
    'the host was rude and kept staring at us',
    'the host wont let us leave',
    'the host made me feel uncomfortable',
    'the guest was naked in front of my kids',
  ],
  'safety-unsafe-pool': [
    'there is a fire near the pool',
    'gas smell by the pool heater',
    'there is a snake in the pool',
    'i smell gas near the hot tub',
    'theres smoke coming from the pump',
    'the pool light is sparking',
    'we just got here and the water is green',
  ],
  'safety-insurance': [
    'am i liable if someone gets hurt',
    'is the host liable if i get hurt',
    'who is responsible if something breaks',
    'am I protected as a host',
    'do i need an umbrella policy',
    'what if a guest breaks something',
    'what if a guest breaks something at my place',
    'what happens if a guest gets hurt at my pool?',
    'am i legally responsible if a guest drowns',
    'what if a guest drowns, am i responsible',
    "I'm thinking about listing my pool. how much does it cost to list, and what if someone gets hurt, am I liable?",
    'am i liable if a swimmer gets hurt',
    'who is responsible if a guest messes up my pool',
    'what if someone gets hurt',
  ],
  'safety-damage': [
    'a guest scratched my pool liner',
    'the guest stained my deck',
    'clogged the filter and now its broken',
    'my guest damaged my pool furniture and I want them to pay for it',
  ],
  'builtin:theft-report': [
    'my phone got stolen at the pool',
    'someone took my bag',
    'the host kept my sunglasses and wont give them back',
    'someone stole my stuff at the pool',
  ],
  'builtin:trust-question': [
    'is this site legit or a scam?',
    'is this legit',
    'is it safe to pay on this site',
    'are you guys a scam',
  ],
  'safety-scam-report': ['is this listing a scam', 'this host seems like a scammer'],
  'builtin:refund-question': [
    'I want a refund',
    'booked a pool for sunday but my kid is sick, can i move it to next week or get my money back? also does the pool have a bathroom',
    'where is my refund',
  ],
  'builtin:dispute-charge': [
    "If you don't refund me I'm filing a chargeback with my bank",
    'i got charged twice for the same booking',
  ],
};
const LEAD_911 = new Set(['safety-injury', 'safety-harassment', 'safety-unsafe-pool']);

test('review phrases: injury, danger, harassment, rule 8, theft, trust, refunds go where they must', () => {
  const bad = [];
  for (const [route, list] of Object.entries(MUST_ROUTE)) {
    for (const t of list) {
      const g = guardFn(t);
      if (!g || g.route !== route) bad.push(`${t} -> ${g ? g.route : 'null'} (want ${route})`);
      else if (LEAD_911.has(route) && !g.lead911) bad.push(`${t}: no 911 lead`);
    }
  }
  assert.deepEqual(bad, []);
});

test('hypothetical liability questions: rule-8 insurance handoff, urgent, no 911 lead', () => {
  for (const t of MUST_ROUTE['safety-insurance']) {
    const g = guardFn(t);
    assert.equal(g.kind, 'urgent', t);
    assert.equal(g.rule8, true, t);
    assert.equal(g.lead911, false, t);
  }
  // an actual injury in the same message still leads with 911 (and carries rule 8)
  const actual = guardFn('my son slipped and hit his head, am i liable?');
  assert.equal(actual.route, 'safety-injury');
  assert.equal(actual.lead911, true);
  assert.equal(actual.rule8, true);
});

test('refunds and reschedules are normal handoffs; real disputes stay urgent', () => {
  for (const t of MUST_ROUTE['builtin:refund-question']) assert.equal(guardFn(t).kind, 'handoff', t);
  for (const t of MUST_ROUTE['builtin:dispute-charge']) assert.equal(guardFn(t).kind, 'urgent', t);
  assert.equal(guardFn('is this site legit or a scam?').kind, 'handoff', '"is this legit" is not a scam report');
});

const BENIGN_PHRASES = [
  'how do i cut my price',
  'can we fire up the grill',
  "I'm drowning in booking requests",
  'is the pool heated',
  'burned through my budget',
  'is it kid friendly',
  'can I bite-size the hours',
  'my card got declined',
  'can i book a bit later',
  'is there a fire pit',
  'can i smoke at the pool',
  'is there a gas grill',
  'do hosts need cpr certification',
  'the host is unresponsive',
  'host not responding',
  'would it hurt my listing to decline',
  'my booking got cut short',
  'take a break by the pool',
  'what if it rains',
  'what if im late',
  'what if the host cancels',
  'i was shocked by the price',
  'i cant wake up that early',
  'what is your cut',
  'how many peeps can come',
  'can the kids jump in the deep end',
  'my birthday falls on a sunday',
  'is there an emergency contact',
  'i am allergic to dogs, are pets allowed',
  'is smoking allowed',
  'can i cut the booking short',
  'my kid is sick can i reschedule',
  'we fell in love with the pool',
  'the booking fell through',
  'i slipped up and booked the wrong day',
  'can my 12 yr old swim alone',
  'are you a real person',
  'the price is a steal',
  'is it safe for kids',
  'what if extra friends show up',
  'in case of emergency what do we do',
  'the umbrella is broken',
  'renter is breaking my house rules',
  'music to drown out the noise',
];

test('benign phrasings never trigger an urgent guard (no false 911 / founder page)', () => {
  const bad = BENIGN_PHRASES.filter((t) => {
    const g = guardFn(t);
    return g && g.kind === 'urgent' && t !== 'renter is breaking my house rules';
  });
  assert.deepEqual(bad, []);
  // a host reporting rule-breaking is the guest-dispute entry, not damage
  assert.notEqual((guardFn('renter is breaking my house rules') || {}).route, 'safety-damage');
});

test('918 bank phrasings: no safety guard hijacks a question unless it belongs to a safety/dispute/rule-8 entry', () => {
  const allowed = new Set(
    entries
      .filter((e) => e.category === 'safety, disputes, and human help')
      .map((e) => e.id)
      .concat(['rules-waiver', 'cancel-refund', 'arrive-cant-get-in', 'arrive-not-as-listed'])
  );
  const hijacked = [];
  let n = 0;
  for (const e of entries) {
    for (const t of [e.question, ...e.variants]) {
      n++;
      const g = guardFn(t);
      if (g && g.kind !== 'clarify' && g.route !== e.id && !allowed.has(e.id))
        hijacked.push(`${e.id}: "${t}" -> ${g.id}`);
      // safety entries' own phrasings stay on their own entry too
      if (g && g.kind !== 'clarify' && allowed.has(e.id) && g.route !== e.id && e.mode !== 'auto')
        hijacked.push(`${e.id}: "${t}" -> ${g.id}`);
    }
  }
  assert.equal(n, 918);
  assert.deepEqual(hijacked, []);
});

test('rule 8 from the customer text: liability, coverage, claims, damage, injury words', () => {
  for (const t of [
    'am i liable',
    'does my homeowners cover it',
    'how do i file a claim',
    'they damaged the deck',
    'my kid got hurt',
    'who is responsible if something breaks',
    'liability waiver',
  ])
    assert.equal(s.rule8Text(t), true, t);
  for (const t of ['how do i book', 'my payout is late', 'is the pool heated', 'can i bring my dog'])
    assert.equal(s.rule8Text(t), false, t);
});

test('dangerSignal: medical or danger words about a person, never ordinary questions', () => {
  for (const t of ['my son passed out', 'there is a snake in the pool', 'someone is bleeding'])
    assert.equal(s.dangerSignal(t), true, t);
  for (const t of BENIGN_PHRASES.slice(0, 12)) assert.equal(s.dangerSignal(t), false, t);
});

test('input cap (D4): only the first 1,500 chars, card straddling the cut still redacted', () => {
  const pad = 'x'.repeat(s.MAX_INPUT_CHARS - 8);
  const r = s.prepareInput(`${pad} 4242 4242 4242 4242 tail`);
  assert.equal(r.truncated, true);
  assert.ok(r.text.length <= s.MAX_INPUT_CHARS);
  assert.doesNotMatch(r.text, /4242/);
  assert.equal(r.cards, 1);
  assert.equal(s.capText('a'.repeat(600)).length, s.MAX_STORED_CHARS);
  assert.equal(s.capText('short'), 'short');
});

test('booking reference tokens: a reference, never free text or a phone number', () => {
  assert.equal(s.findRefToken('its PRNM-4421'), 'PRNM-4421');
  assert.equal(s.findRefToken('6abaf08c-023d-4f34-8e87-74ea4a6efac4'), '6abaf08c-023d-4f34-8e87-74ea4a6efac4');
  assert.equal(s.findRefToken('joe at gmail'), null);
  assert.equal(s.findRefToken('512-555-0199'), null);
  assert.equal(s.findRefToken('no idea'), null);
});

test('founder request: filler and complaints are not "the question"', () => {
  for (const t of [
    'great, another useless bot. get me a human NOW',
    'actually yes i want a person',
    'just get me a real person already',
    'hello?? anyone there? i need a human',
  ])
    assert.equal(s.questionRemains(t), false, t);
  for (const t of ['I want to talk to a human about my refund', 'talk to the founder about a partnership'])
    assert.equal(s.questionRemains(t), true, t);
});

// ------------------------------------------------------------------ round-2 review (fix2, round 2)
const { LINE_911 } = require('../engine/copy');
const H2 = require('./helpers');

/** Everyday emergency phrasings from the round-2 review (probe/drown.js, probe/urgent.js, out/v2.txt). */
const EMERGENCY_911 = [
  // drowning, in plain words
  'someone dove in and hasnt come back up',
  'a kid is face down in the pool',
  'HELP HELP MY DAUGHTER IS UNDER THE WATER',
  'my kid is at the bottom of the pool',
  'i pulled my son out of the pool and hes not responding',
  'shes not coming up',
  'my son went under and didnt come up',
  'someone is struggling in the deep end',
  'a kid is in trouble in the pool',
  'we had to pull a kid out of the water',
  'toddler wandered into the pool',
  'kid fell in the deep end and cant swim',
  'my son nearly drowned',
  'my kid is drownding help',
  // medical
  'his lips are blue',
  'omg my son is turning purple in the pool',
  'my husband is having chest pains',
  'my friend jumped in the shallow end and cant feel his legs',
  'my wife is having a panic attack and cant catch her breath',
  'my son is coughing up water and wheezing',
  'kid hit the bottom diving and his neck hurts',
  'the chlorine is burning my eyes so bad i cant see',
  'the water is tingling and my kid got zapped',
  'she got a consussion i think',
  'she is unresponsive',
  'he isnt breathing right',
  'my sons not breathin',
  'my daughter wont wake up',
  'yo my homie just passed out by the pool fr',
  'bro my boy is bleedin bad',
  'HELP SOMEONE IS HURT',
  'emergancy at the pool',
  'i cant find my son at the pool',
  // violence and weapons
  'someone has a gun',
  'a guy pulled a knife',
  'theres a fight at the pool',
  'the host hit me',
  'the host punched my husband',
  'a drunk guy is trying to get in the pool area',
  'someone broke into the backyard while we were swimming',
  // harassment and child safety
  'the host took pictures of my kids without asking',
  'a guy at the pool keeps trying to talk to my 10 year old alone',
  'the host grabbed my arm and wouldnt let go',
  'the host followed me into the bathroom',
  'the host made a pass at me',
  'the host keeps texting me at night asking to hang out',
  'theres a camera pointed at the changing area',
  'the host said something gross to my teenage daughter',
  'im scared of the host',
  'dude was lowkey creepin on my gf the whole time',
  'the hosts husband was staring at my daughter the whole time',
];

test('round 2: everyday emergency, violence and harassment phrasings → urgent, 911 line first, founders alerted', () => {
  const bad = [];
  for (const t of EMERGENCY_911) {
    const { transcript, state } = H2.talk(engine, [t]);
    const pub = transcript[0].actions.filter((a) => a.type === 'say' || a.type === 'select');
    const urgent = state.handoff && state.handoff.urgency === 'high' && transcript[0].actions.some((a) => a.type === 'escalate');
    if (!urgent) bad.push(`${t}: no urgent handoff`);
    else if (!pub[0].content.startsWith(LINE_911)) bad.push(`${t}: 911 line not first`);
  }
  assert.deepEqual(bad, []);
});

/** Benign N01-N32 (out/v2.txt) and look-alikes: never urgent, never the 911 line, never "I'm sorry that happened". */
const BENIGN_FULL = [
  'is the pool safe for kids',
  'does the pool have a fence',
  'is there a fence around the pool',
  'who pays the stripe fee',
  'who covers the cleaning fee',
  'is the pool covered or indoor',
  'how do i claim my payout',
  'can i claim my listing',
  'i work at a hospital so i can only swim at night, any late pools',
  'i feel uncomfortable sharing my address before booking, is that normal',
  'will the host be watching us',
  'i broke my phone screen so i cant see the app, how do i log in on desktop',
  'i hurt my back last week, is there a pool with a ramp or steps',
  'there was an accident in my booking dates i picked wrong ones',
  'is the pool heated',
  'how do i cut my price for weekdays',
  'my kids are dying to swim this weekend any pools near me',
  'im drowning in booking requests how do i pause',
  'can i fire up the grill during my booking',
  'how do i shock my pool before a guest comes',
  'the price shocked me why is it so expensive',
  'do hosts have to know cpr',
  'whats the emergency contact for the host',
  'do you guarantee the pool is clean',
  'can i smoke at the pool',
  'how long until i break even on hosting',
  'can kids under 5 come',
  'whats your cut of each booking',
  'is this site legit',
  'do you have pools that are safe for toddlers',
  'my kid fell asleep in the car can we arrive 15 min late',
  // look-alikes found while fixing
  'how do i report a host',
  'does prnm guarantee my booking',
  'are you protected by ssl',
  'does the pool have a hot tub, my back hurts from work',
  'we will have kids, do you have a pool fence',
  'can i bring a water gun for the kids',
  'can we take a break in the middle of the booking',
  'can i take photos of my kids at the pool',
  'my kid is scared of the deep end, is there a shallow pool',
  'my son lost his goggles at the pool, can the host check',
  'can you help me find a pool for my kids',
  'help, how do i book a pool for my kids',
  'IS THE POOL HEATED FOR MY KIDS',
];

test('round 2: benign questions through the full engine are never urgent and never get the 911 line', () => {
  const bad = [];
  for (const t of BENIGN_FULL) {
    const { transcript, state } = H2.talk(engine, [t]);
    const pub = transcript[0].actions.filter((a) => a.type === 'say' || a.type === 'select').map((a) => a.content);
    if (state.handoff && state.handoff.urgency === 'high') bad.push(`${t}: urgent (${state.handoff.entryId})`);
    if (pub.some((c) => c.includes(LINE_911))) bad.push(`${t}: 911 line`);
    if (pub.some((c) => /I'm sorry that happened/.test(c))) bad.push(`${t}: "sorry that happened"`);
  }
  assert.deepEqual(bad, []);
});

test('round 2: damage or protection asked as a question is rule 8 (Derek), not a damage report with a 911 lead', () => {
  for (const t of ['do you offer damage protection for hosts', 'im worried about guests damaging my pool', 'does prnm cover damage']) {
    const g = guardFn(t);
    assert.equal(g && g.route, 'safety-insurance', t);
    assert.equal(g.rule8, true, t);
    assert.equal(g.lead911, false, t);
  }
  // a report stays a damage report
  assert.equal(guardFn('the guests broke my pool fence').route, 'safety-damage');
  assert.equal(guardFn('how do i file a damage claim').route, 'safety-damage');
  assert.equal(guardFn('what does your policy cover').route, 'safety-insurance');
  assert.equal(guardFn('what does the cancellation policy cover'), null);
});

test('round 2: real words are never spell-corrected or fuzzed into bank words', () => {
  const m = engine.matcher;
  for (const w of ['scared', 'invoice', 'lost', 'driving', 'police', 'sick', 'drive', 'fire', 'pain', 'kiss', 'store', 'story'])
    assert.equal(m.speller(w), w, w);
  for (const t of ['im scared', 'i need an invoice', 'i lost my towel', 'we are driving there now', 'scared'])
    assert.notEqual(m.match(t, {}).status, 'confident', t);
  // typos are still fixed
  assert.equal(m.speller('reservaton'), 'reservation');
  assert.equal(m.speller('drowing'), 'drowning');
  // one generic word is never enough, even when it equals a bank phrasing's only token
  assert.notEqual(m.match('someone', {}).status, 'confident');
});

test('round 2: every way of asking for a person is a founder request, with the real question kept', () => {
  for (const t of [
    'lemme speak to a manager',
    'gimme a human',
    'i wanna talk to a person',
    'your site is a joke get me a human NOW',
    'this app sucks, human please',
    'speak to customer service',
    'i want to complain to a person',
    'human. now. my payout',
    'can a human help me',
    'pls i need help from a human',
  ])
    assert.ok(s.wantsHuman(t), t);
  for (const t of ['lemme speak to a manager', 'i wanna talk to a person', 'your site is a joke get me a human NOW', 'gimme a human'])
    assert.equal(s.questionRemains(t), false, t);
  assert.equal(s.questionRemains('human. now. my payout'), true);
  assert.equal(s.questionRemains('talk to a human about a charge'), true);
  assert.ok(!s.wantsHuman('talk to the pool owner first'));
  assert.ok(!s.wantsHuman('are you a real person'));
});

test('round 2: a complaint or a threat to report us is a calm founder handoff with no facts', () => {
  for (const t of ['gonna report you to the BBB', 'i want to file a complaint', 'im going to leave you a bad review']) {
    const g = guardFn(t);
    assert.equal(g && g.route, 'builtin:complaint', t);
    assert.equal(g.kind, 'handoff', t);
  }
  const { transcript, state } = H2.talk(engine, ['gonna report you to the BBB']);
  assert.equal(state.handoff.status, 'collecting');
  assert.equal(state.handoff.urgency, 'normal');
  assert.ok(!transcript[0].actions.some((a) => a.type === 'say' && /refund|policy|guarantee/i.test(a.content)));
});

// ------------------------------------------------------------------ round-3 review (fix2, round 3)
/** Everyday emergency and child-safety phrasings the round-3 probes missed (verify2 adv1/adv3, convos3 A/B). */
const EMERGENCY_911_R3 = [
  // poisoning, burns, missing child, dying / dead
  'my toddler drank pool chemicals',
  'she ate a chlorine tablet',
  'my baby swallowed a pool tablet',
  'the pool water is burning my kids skin',
  'we cant find our 4 year old and the gate was open',
  'i think my friend is dead',
  'hes dying',
  'theres a body in the pool',
  'hes foaming at the mouth',
  'shes shaking and wont stop',
  'my moms ankle looks broken',
  // drowning and medical, in slang and typos
  'yo my lil bro aint movin in the water',
  'theres a kid floating in the deep end not moving',
  'my nephew jumped in and he cant swim',
  'i think hes havin a heart atack',
  // idiom strips that used to remove real emergencies
  'my son fell through the pool cover',
  'my dad is clutching his chest, i think hes about to have a heart attack',
  // child safety and harassment
  'the host asked my daughter to sit on his lap',
  'the host walked into the bathroom while i was changing',
  'host said hed give us a discount if i sent him pics',
  'he wouldnt stop touching my hair',
  'the host asked my 14 year old for her snapchat',
  'the host told my son to keep it a secret from us',
  'the host called us the n word',
  'the host gave my 10 year old his phone number',
  'the hosts adult son kept trying to get my daughter to come inside with him',
  "the host kept commenting on my wife's body",
  "the host's teenage son is peeking over the fence at us",
  'the host grabbed my daughter',
  'he grabbed my son by the arm',
  'the host threw a chair at us',
  'my ex showed up at the pool and wont leave',
  'the hosts dog is attacking people',
  // a tiny non-English fallback: 911 line and a person, no English guess
  'mi hijo se está ahogando',
  'au secours mon fils se noie',
];

test('round 3: plain-word emergencies and child safety → urgent, 911 line first, founders alerted', () => {
  const bad = [];
  for (const t of EMERGENCY_911_R3) {
    const { transcript, state } = H2.talk(engine, [t]);
    const pub = transcript[0].actions.filter((a) => a.type === 'say' || a.type === 'select');
    const urgent = state.handoff && state.handoff.urgency === 'high' && transcript[0].actions.some((a) => a.type === 'escalate');
    if (!urgent) bad.push(`${t}: no urgent handoff (${(transcript[0].events.find((e) => e.type === 'answered' || e.type === 'clarify') || {}).entry || 'none'})`);
    else if (!pub[0].content.startsWith(LINE_911)) bad.push(`${t}: 911 line not first`);
  }
  assert.deepEqual(bad, []);
});

test('round 3: a bare cry or a bare "she\'s not responding" asks the safety question (911 line), pages nobody', () => {
  for (const t of ['she not respondin', 'HELP!!!', 'pls help', 'help', 'HELP']) {
    const { transcript, state } = H2.talk(engine, [t]);
    const tr = transcript[0];
    assert.ok(tr.events.some((e) => e.type === 'clarify' && e.kind === 'safety_check'), t);
    assert.ok(!tr.actions.some((a) => a.type === 'escalate'), `${t}: no page on a cry alone`);
    assert.ok(tr.actions.some((a) => a.type === 'select' && a.content.startsWith(LINE_911)), t);
    assert.ok(!tr.events.some((e) => e.type === 'answered' && e.entry === 'booking-host-no-reply'), t);
    assert.equal(state.awaiting.kind, 'safety-check');
  }
  // "no" to the question after a bare "help": the starters, not "say it another way"
  const r = H2.talk(engine, ['help', { button: 'safety:no' }]);
  const sel = r.transcript[1].actions.find((a) => a.type === 'select');
  assert.ok(sel && sel.items.some((i) => i.value === 'founder'));
  // "yes": urgent, with the 911 line already shown
  const y = H2.talk(engine, ['HELP!!!', { button: 'safety:yes' }]);
  assert.equal(y.state.handoff.urgency, 'high');
  // a host who hasn't answered is still the "host hasn't replied" answer, never the safety question
  for (const t of ['the host is not responding to my messages', 'host not responding']) {
    const tr = H2.talk(engine, [t]).transcript[0];
    assert.ok(!tr.events.some((e) => e.kind === 'safety_check'), t);
  }
});

test('round 3: "what should I do if someone is drowning" leads with 911 and brings in a person, no insurance copy (A06, C04)', () => {
  for (const t of ['what should i do if someone is drowning', 'what do i do if my kid is choking']) {
    const g = guardFn(t);
    assert.equal(g.route, 'builtin:emergency-question', t);
    assert.equal(g.kind, 'urgent', t);
    const { transcript } = H2.talk(engine, [t]);
    const lines = H2.botLines(transcript);
    assert.ok(lines[0].startsWith(LINE_911), t);
    assert.ok(!lines.some((l) => /Insurance questions go to Derek|insurance/i.test(l)), t);
  }
  // a liability question asked with "if" is still Derek's insurance question, with no 911 line
  for (const t of ['what if the guests kid drowns in my pool', 'what should i do if someone drowns, am i liable', 'what if a guest drowns, am i responsible']) {
    const g = guardFn(t);
    assert.equal(g.route, 'safety-insurance', t);
    assert.equal(g.lead911, false, t);
    assert.equal(g.rule8, true, t);
  }
});

/** Benign look-alikes from the round-3 review: never urgent, never the 911 line. */
const BENIGN_FULL_R3 = [
  'HELP ME FIND A POOL FOR MY KIDS PARTY',
  "HELP! how do i book a pool for my son's birthday",
  'I NEED HELP WITH MY BOOKING FOR MY DAUGHTERS POOL PARTY',
  'can somebody help, my son wants to know if the pool has a slide',
  'my kids are drowning me in requests for a pool day',
  'the kids are gonna drown me in questions about this pool lol',
  'my daughter is choking on how expensive this is lol',
  'my husband almost passed out when he saw the price',
  'i almost had a heart attack when i saw how cheap it was',
  'my son is struggling to decide which pool to book',
  'my kid is crying because we cant swim today',
  'the host was really nice to my kids',
  'someone help me pick a pool for my wife lol',
  'the booking fell through',
  'my payout is missing',
  'i cant find my booking',
  "my son can't swim, is there a shallow end?",
  'my kids are dying to swim this weekend',
  'my phone is dead can i still get in',
  'can someone help me',
  'i need help',
  'is there a grill',
  'do you have an app',
];

test('round 3: benign look-alikes (shouted booking questions, idioms, praise) are never urgent and never get the 911 line', () => {
  const bad = [];
  for (const t of BENIGN_FULL_R3) {
    const { transcript, state } = H2.talk(engine, [t]);
    const pub = H2.botLines(transcript);
    if (state.handoff && state.handoff.urgency === 'high') bad.push(`${t}: urgent (${state.handoff.entryId})`);
    if (pub.some((c) => c.includes(LINE_911))) bad.push(`${t}: 911 line`);
  }
  assert.deepEqual(bad, []);
  // "we're at the pool and the host isn't responding" is a lockout, not an injury
  assert.equal(guardFn('we are at the pool and the host is not responding').route, 'arrive-cant-get-in');
});

test('round 3: after a handoff was sent, typos, poisoning, a grab and a bare "HELP" still get the 911 line once', () => {
  const sent = H2.talk(engine, ['talk to a person', 'question about my listing photos', { button: 'reply:chat' }]).state;
  assert.equal(sent.handoff.status, 'sent');
  for (const t of ['he is drowing', 'my toddler drank pool chemicals', 'the host just grabbed my daughter', 'HELP']) {
    const r = engine.handle(sent, { kind: 'text', text: t });
    assert.deepEqual(r.actions[0], { type: 'say', content: LINE_911 }, t);
    assert.ok(r.actions.some((a) => a.type === 'flag_urgent'), t);
    assert.ok(!r.actions.some((a) => a.type === 'escalate'), `${t}: no new alert`);
  }
});

test('round 3: accusations and legal threats against us are a calm founder handoff, not a scam/theft/insurance page', () => {
  const cases = {
    'you guys are scammers, i want my money back': false,
    'this is a scam company': false,
    'you people are thieves': false,
    'you stole my money': false,
    'im going to sue you': true,
    'my lawyer will be in touch': true,
  };
  for (const [t, rule8] of Object.entries(cases)) {
    const g = guardFn(t);
    assert.equal(g && g.route, 'builtin:complaint', t);
    assert.equal(g.kind, 'handoff', t);
    assert.equal(g.rule8, rule8, `${t}: rule 8`);
    const { transcript, state } = H2.talk(engine, [t]);
    const lines = H2.botLines(transcript);
    assert.equal(lines[0], require('../engine/copy').COPY.labelLineCalm, t);
    assert.ok(!lines.some((l) => /^Cool\b|Hold off on sending|Sorry, that's not okay|Insurance questions/.test(l)), t);
    assert.equal(state.upsetSeen, true, t);
    assert.notEqual(state.handoff.urgency, 'high', t);
  }
  // a scam message the customer received is still the protective scam report; the host stealing is theft
  assert.equal(guardFn('the host asked me to pay on zelle, is this a scam').route, 'safety-scam-report');
  assert.equal(guardFn('the host stole my sunglasses').route, 'builtin:theft-report');
  // a guest threatening the host with a lawsuit is Derek's liability question
  assert.equal(guardFn('my guest says she is going to sue me').route, 'safety-insurance');
});

test('round 3: upset customers get the calm label and no "Cool." anywhere (F05)', () => {
  const { COPY } = require('../engine/copy');
  for (const t of ['im so mad', 'frustrated', 'annoyed', 'disappointed', 'upset', 'this ruined my weekend', 'i want to file a complaint', 'im gonna report you to the BBB'])
    assert.equal(s.mood(t), 'upset', t);
  for (const t of ['i want to file a complaint', 'im gonna report you to the BBB', 'im so mad, how do i cancel my booking']) {
    const { transcript } = H2.talk(engine, [t, { button: 'reply:chat' }]);
    const lines = H2.botLines(transcript);
    assert.equal(lines[0], COPY.labelLineCalm, t);
    assert.ok(!lines.some((l) => /^Cool\b|Hey, glad you're here/.test(l)), `${t}: ${lines.join(' / ')}`);
  }
});

test('round 3: common dispute phrasings are urgent billing disputes (E02)', () => {
  for (const t of ['you charged me twice', 'im calling my bank to reverse the charge', 'you guys charged my card two times', 'i got double charged'])
    assert.equal((guardFn(t) || {}).route, 'builtin:dispute-charge', t);
  assert.equal(guardFn('i called my bank to update my payout account'), null);
});

test('round 3: "live agent", "I don\'t want to talk to a robot", "the owner of this site" are requests for a person', () => {
  for (const t of ['live agent', 'i dont want to talk to a robot', 'i want to talk to the owner of this site', 'no more bots'])
    assert.ok(s.wantsHuman(t), t);
  for (const t of ['live agent', 'i dont want to talk to a robot', 'i want to talk to the owner of this site'])
    assert.equal(s.questionRemains(t), false, t);
  assert.ok(!s.wantsHuman('can i talk to the pool owner first'));
  assert.ok(!s.wantsHuman('is this a live agent'));
});
