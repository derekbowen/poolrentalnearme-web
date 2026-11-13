'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('./helpers');
const { roleOfCategory } = require('../engine/matcher');

const { entries, engine } = loadEngine();
const m = engine.matcher;

test('every question and every variant matches its own entry (923 phrasings)', () => {
  const misses = [];
  let n = 0;
  for (const e of entries) {
    // The same wording can belong to a guest entry and a host entry ("instant book");
    // the remembered role picks between them, so self-match runs with the entry's role.
    const role = roleOfCategory(e.category);
    for (const text of [e.question, ...e.variants]) {
      n++;
      const r = m.match(text, { role });
      if (r.status !== 'confident' || r.top.id !== e.id)
        misses.push(`${e.id}: "${text}" -> ${r.status} ${r.top && r.top.id}`);
    }
  }
  assert.equal(n, 923);
  assert.deepEqual(misses, []);
});

test('guest/host twins without a known role: never guess, ask the role', () => {
  for (const text of ['instant book?', 'promo code', 'discount code', 'update price']) {
    const r = m.match(text, {});
    assert.notEqual(r.status, 'confident', text);
    assert.equal(r.needsRole, true, text);
  }
  assert.equal(m.match('instant book', { role: 'swimmer' }).top.id, 'booking-instant-vs-request');
  assert.equal(m.match('instant book', { role: 'host' }).top.id, 'host-pricing-08');
});

// Invented typo / slang / shorthand phrasings, at least 3 per category. None of these strings is in the bank.
const TYPO_CASES = [
  // booking
  ['hw do i book a pool', 'booking-how-to-book'],
  ['can i book for 2morrow', 'booking-same-day'],
  ['do i hav to make an acount to book', 'booking-account-required'],
  ['host aint replied to my request yet', 'booking-host-no-reply'],
  ['how many ppl can i bring', 'booking-guest-count'],
  ['can i book a pool rn', 'booking-same-day'],
  ['is my bookin confirmd', 'booking-status'],
  // prices and payments
  ['r there any hidden fees', 'pay-all-in-price'],
  ['can i venmo the owner', 'pay-off-platform'],
  ['do u guys take paypal', 'pay-methods'],
  ['my card got declind', 'pay-payment-failed'],
  ['wen will my card get charged', 'pay-when-charged'],
  // cancellations and changes
  ['i need 2 cancel my reservaton', 'cancel-how'],
  ['can i reschedual my booking', 'cancel-reschedule'],
  ['wats the cancelation policy', 'cancel-policy'],
  ['can we stay longer pls', 'cancel-extend-time'],
  // pool rules and amenities
  ['can i bring my pupy', 'rules-pets'],
  ['is alchohol ok at the pool', 'rules-alcohol-glass'],
  ['can my kids swim w/o an adult', 'rules-kids-supervision'],
  ['is the water heatd', 'amenity-heated'],
  ['wat r the house rulez', 'rules-house-rules'],
  // arrival and access
  ['wheres the gate code', 'arrive-entry'],
  ['were runnin late', 'arrive-running-late'],
  ['is there parkin', 'arrive-parking'],
  ['is it wheelchair accesible', 'arrive-accessibility'],
  ['when do i get the adress', 'arrive-address'],
  // safety, disputes, and human help
  ['r u a bot', 'human-are-you-a-bot'],
  ['whats ur email', 'human-contact-support'],
  ['is this listin a scam', 'safety-scam-report'],
  ['can i talk 2 a human', 'human-talk-to-person'],
  // creating a host listing
  ['how do i lsit my pool on here', 'host-listing-01'],
  ['can i upload iphone pics', 'host-listing-02'],
  ['can i import from swimplly', 'host-listing-03'],
  ['how do i pause my listin', 'host-listing-08'],
  // host pricing and calendars
  ['how do i chnage my hourly rate', 'host-pricing-02', 'host'],
  ['can i block off my calender for vacation', 'host-pricing-05'],
  ['wknd pricing', 'host-pricing-03'],
  // payouts
  ['wen do i get payed', 'payouts-02'],
  ['how do i add my bank acct', 'payouts-01'],
  ['do i get a 1099k', 'payouts-08'],
  ['stripe wont verify me', 'payouts-05'],
  // accounts and technical problems
  ['forgot my pw', 'account-01'],
  ['cant sign in', 'account-02'],
  ['didnt get the verifcation email', 'account-03'],
  ['stop txting me', 'account-06'],
  ['how do i delete my acount', 'account-07'],
];

test(`typo / slang phrasings land on the right entry (${TYPO_CASES.length} cases)`, () => {
  const bad = [];
  for (const [text, id, role = null] of TYPO_CASES) {
    const r = m.match(text, { role });
    if (r.status !== 'confident' || r.top.id !== id)
      bad.push(`"${text}" -> ${r.status} ${r.top && r.top.id} (want ${id})`);
  }
  assert.deepEqual(bad, []);
  const cats = new Set(TYPO_CASES.map(([, id]) => entries.find((e) => e.id === id).category));
  assert.equal(cats.size, 10);
});

// Everyday rewordings (no typos). Must be answered correctly or clarified, never answered wrongly.
const PARAPHRASES = [
  ['how do i reserve a pool for saturday', 'booking-how-to-book'],
  ['does the owner need to approve my request', 'booking-instant-vs-request'],
  ["host hasn't gotten back to me", 'booking-host-no-reply'],
  ['the host never replied to my request', 'booking-host-no-reply'],
  ['can i ask the host something before booking', 'booking-message-host'],
  ['where can i check if my reservation went through', 'booking-status'],
  ['whats the max number of guests', 'booking-guest-count'],
  ['the host sent me a custom offer what do i do', 'booking-custom-offer'],
  ['whats the service fee for', 'pay-service-fee'],
  ['can i pay with venmo', 'pay-off-platform'],
  ['why did my total go up', 'pay-price-changes'],
  ['is this in usd or aud', 'pay-currency'],
  ['can i move my booking to sunday', 'cancel-reschedule'],
  ['what if it rains', 'cancel-weather'],
  ['is my dog allowed', 'rules-pets'],
  ['can my kids use the diving board', 'rules-diving-slides'],
  ['can we play music', 'rules-music-noise'],
  ['when do i get the address', 'arrive-address'],
  ['how do i add this to my calendar', 'arrive-add-calendar'],
  ['can we get there early', 'arrive-early'],
  ['whats your email address', 'human-contact-support'],
  ['do you have a phone number', 'human-contact-support'],
  ['im a renter can i list', 'host-listing-04'],
  ['does my listing need to be approved', 'host-listing-06'],
  ['do you charge hosts a fee', 'host-pricing-01', 'host'],
  ['can i set different prices on weekends', 'host-pricing-03', 'host'],
  ['can i sync my swimply calendar', 'host-pricing-07'],
  ['why is my payout less than what the guest paid', 'payouts-09'],
  ['i live in canada can i get paid', 'payouts-10'],
  ['the accept button doesnt work', 'account-08'],
  ['my listing says outdated listing', 'account-09'],
];

test('everyday rewordings: right answer or a clarifying question, never a wrong answer', () => {
  let confident = 0;
  const wrong = [];
  for (const [text, id, role = null] of PARAPHRASES) {
    const r = m.match(text, { role });
    if (r.status === 'confident') {
      if (r.top.id === id) confident++;
      else wrong.push(`"${text}" -> ${r.top.id} (want ${id})`);
    } else {
      assert.ok(
        r.candidates.some((c) => c.id === id) || r.needsRole,
        `"${text}" should at least offer ${id}`
      );
    }
  }
  assert.deepEqual(wrong, []);
  assert.ok(
    confident >= PARAPHRASES.length - 4,
    `${confident}/${PARAPHRASES.length} answered outright`
  );
});

test('known real words are never fuzzed into neighbours ("safe" ≠ "save", "bank" ≠ "back")', () => {
  const r = m.match('is it safe to swim', {});
  assert.ok(!(r.status === 'confident' && r.top.id === 'host-listing-05'));
  assert.equal(m.speller('safe'), 'safe');
  assert.equal(m.speller('bank'), 'bank');
  assert.equal(m.speller('reservaton'), 'reservation');
});

test('one generic word is not enough to answer outright', () => {
  const r = m.match('work', {});
  assert.notEqual(r.status, 'confident');
});

// ------------------------------------------------------------------ round-3 review: confident wrong first answers
const { talk } = require('./helpers');
const answeredIn = (tr) => tr.events.filter((e) => e.type === 'answered').map((e) => e.entry);
const offeredIn = (tr) =>
  tr.actions.filter((a) => a.type === 'select').flatMap((a) => a.items.map((i) => i.value.replace(/^entry:/, '')));

test('round 3: common first questions get the right entry, never the 15% fee or a host answer', () => {
  const want = {
    'are there pools near me': 'booking-how-to-book',
    'what is pool rental near me': 'booking-how-to-book',
    'what is prnm': 'booking-how-to-book',
    'how do i contact you': 'human-contact-support',
    'how do i get in touch with you guys': 'human-contact-support',
    'how do i delete my listing': 'host-listing-08',
    'can i remove my listing': 'host-listing-08',
    'what is a booking request': 'booking-instant-vs-request',
    'how long does the host have to accept': 'booking-host-no-reply',
  };
  for (const [t, id] of Object.entries(want)) {
    const tr = talk(engine, [t]).transcript[0];
    assert.deepEqual(answeredIn(tr), [id], t);
  }
  // never these answers for these questions
  const never = {
    'are there pools near me': 'pay-service-fee',
    'what is pool rental near me': 'pay-service-fee',
    'is there a grill': 'host-pricing-04',
    'how do i contact you': 'booking-message-host',
    'where are you located': 'arrive-address',
    'how do i delete my listing': 'account-07',
    'do you have an app': 'account-10',
    'what is a booking request': 'account-08',
    'how long does the host have to accept': 'host-listing-06',
  };
  for (const [t, id] of Object.entries(never)) {
    const tr = talk(engine, [t]).transcript[0];
    assert.ok(!answeredIn(tr).includes(id), `${t} answered ${id}`);
  }
});

test('round 3: "how much does it cost" with no known role asks who they are; a guest never gets host pricing advice', () => {
  for (const t of ['how much does it cost', 'how much is a pool']) {
    const r = talk(engine, [t]);
    const tr = r.transcript[0];
    assert.deepEqual(answeredIn(tr), [], t);
    assert.ok(tr.events.some((e) => e.type === 'clarify' && e.kind === 'role'), t);
    assert.equal(r.state.role, null, `${t}: the role is not guessed as host`);
    const guest = talk(engine, [t, { button: 'role:swimmer' }]).transcript[1];
    assert.ok(!answeredIn(guest).some((id) => /^host-pricing-0[49]$/.test(id)), `${t}: host advice to a guest`);
    assert.ok(!offeredIn(guest).some((id) => /^host-pricing-0[49]$/.test(id)), `${t}: host advice offered to a guest`);
  }
  // a host still gets it
  assert.deepEqual(answeredIn(talk(engine, ['as a host, how much should i charge per hour']).transcript[0]), ['host-pricing-09']);
});

test('round 3: the SMS opt-out entry is offered only when the message is about texts or notifications (C62)', () => {
  for (const t of ['he wouldnt stop touching my hair', 'shes shaking and wont stop', 'stop it', 'make it stop']) {
    const tr = talk(engine, [t]).transcript[0];
    assert.ok(!offeredIn(tr).includes('account-06') && !answeredIn(tr).includes('account-06'), t);
  }
  for (const t of ['how do i stop getting text messages', 'stop txting me', 'too many notifications'])
    assert.ok(answeredIn(talk(engine, [t]).transcript[0]).includes('account-06') || offeredIn(talk(engine, [t]).transcript[0]).includes('account-06'), t);
});

test('round 3: a message with several questions answers one and offers the others, or hands off with all of it (C11, C12, D37)', () => {
  const d37 = talk(engine, ['can i import my swimply listing and also sync the calendar?']).transcript[0];
  const ids = [...answeredIn(d37), ...offeredIn(d37)];
  assert.ok(ids.includes('host-listing-03') && ids.includes('host-pricing-07'), ids.join(','));
  for (const t of [
    'hi so im thinking of booking a pool for my daughters bday saturday, how many people can we bring, can we bring a speaker and also is there parking? also do i need to pay upfront',
    'Hey there! So I listed my pool last week and set the price at $50 but i think thats too low, also I want to block off thanksgiving and also when do I get paid?',
  ]) {
    const r = talk(engine, [t]);
    const tr = r.transcript[0];
    const got = answeredIn(tr).length > 0 || (r.state.handoff && r.state.handoff.question && r.state.handoff.question.length > 60);
    assert.ok(got, `${t.slice(0, 40)}: neither answered nor handed off with the text`);
    assert.ok(!tr.events.some((e) => e.type === 'unmatched' && !e.multi_part), `${t.slice(0, 40)}: plain "say it another way"`);
    // one question per message: the extra buttons carry no question mark
    const sels = tr.actions.filter((a) => a.type === 'select' && a.content === require('../engine/copy').COPY.alsoAsked);
    for (const sel of sels) assert.doesNotMatch(sel.content, /\?/);
  }
});

// ------------------------------------------------------------------ round-3 review (engine): multiPart cost (redos2.js)
test('round 3: a 1,500-char "x?x?…" message is one text, not 750 questions: a bounded number of matches, fast', () => {
  const { newState } = require('../engine/flows');
  let calls = 0;
  const orig = engine.matcher.match;
  engine.matcher.match = function (...a) {
    calls++;
    return orig.apply(this, a);
  };
  try {
    const shapes = ['x?'.repeat(750), 'pool? '.repeat(250), 'pool and also '.repeat(110), 'pool. host '.repeat(140), 'pool, can '.repeat(150), 'can i book a pool? '.repeat(80)].map((s) => s.slice(0, 1500));
    for (const t of shapes) {
      assert.deepEqual(engine.multiPart(t), [], `${t.slice(0, 12)}: a pathological split is no list of questions`);
      calls = 0;
      const r = engine.handle(null, { kind: 'text', text: t });
      assert.ok(calls <= 8, `${t.slice(0, 12)}: ${calls} matcher calls (was 752 for x?x?…)`);
      assert.ok(r.actions.some((a) => a.type === 'say' || a.type === 'select'), 'still answered (never silence)');
      // the matching path itself (safety checks aside): well under 25 ms per message
      const run = () => {
        const turn = { say() {}, select() {}, log() {}, note() {}, escalate() {}, actions: [], events: [] };
        engine.answerOrClarify(newState(), t, turn, { safetyChecked: true });
      };
      run();
      const t0 = process.hrtime.bigint();
      for (let i = 0; i < 10; i++) run();
      const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 10;
      assert.ok(ms < 25, `${t.slice(0, 12)}: ${ms.toFixed(1)} ms per message`);
    }
    // a real list of questions still splits, and at most six parts are ever matched
    const qs = ['how do i book a pool for saturday', 'can we bring towels', 'is there parking', 'can we bring a dog', 'is the pool heated', 'how deep is it', 'are there lifeguards', 'can i cancel'];
    const many = qs.join('? ');
    assert.equal(engine.multiPart(many).length, 6);
    calls = 0;
    engine.handle(null, { kind: 'text', text: many });
    assert.ok(calls <= 8, `${calls} matcher calls for eight questions`);
    assert.equal(engine.multiPart(Array.from({ length: 13 }, () => 'is there parking').join('? ')).length, 0, 'thirteen pieces: one text');
  } finally {
    engine.matcher.match = orig;
  }
});

// ------------------------------------------------------------------ round-3 review (engine): host-only answers (wrong.tsv, E2E B04)
test('round 3: guest questions on a first message never get a host answer (calendar, payouts); "does it cost anything to list" is the free-listing entry', () => {
  const hostIds = (ids) => ids.filter((id) => engine.hostOnly.has(id));
  // must-not-answer: a guest search / booking question with no role known
  for (const t of [
    'my kids are dying to go swimming this weekend, any pools open saturday?',
    'are any pools open this saturday',
    'are any pools open saturday',
    'do you have pools in canada',
    'do you have pools in the uk',
    'is the pool open on sunday',
    'what time does the pool open',
    'where is my money',
    'is my address public',
  ]) {
    const tr = talk(engine, [t]).transcript[0];
    assert.deepEqual(hostIds(answeredIn(tr)), [], `${t}: answered with host copy`);
    assert.ok(!answeredIn(tr).includes('pay-all-in-price') || t !== 'does it cost anything to list');
  }
  for (const t of ['are any pools open this saturday', 'are any pools open saturday', 'do you have pools in canada'])
    assert.deepEqual(answeredIn(talk(engine, [t]).transcript[0]), ['booking-how-to-book'], t);
  assert.deepEqual(answeredIn(talk(engine, ['does it cost anything to list']).transcript[0]), ['host-pricing-01']);
  assert.ok(!answeredIn(talk(engine, ['does it cost anything to list']).transcript[0]).includes('pay-all-in-price'));
  // a host question with no host words: the role first, then the host answer
  const r = talk(engine, ['how long until it goes live', { button: 'role:host' }]);
  assert.ok(r.transcript[0].events.some((e) => e.type === 'clarify' && e.kind === 'role'));
  assert.deepEqual(answeredIn(r.transcript[1]), ['host-listing-06']);
  // and a guest who says so never gets it
  const g = talk(engine, ['do you have pools in the uk', { button: 'role:swimmer' }]);
  assert.deepEqual(hostIds([...answeredIn(g.transcript[1]), ...offeredIn(g.transcript[1])]), []);
  // a host who says so in words is answered outright
  for (const [t, id] of [
    ['how do i list my pool', 'host-listing-01'],
    ['when do i get paid', 'payouts-02'],
    ['can i charge more on weekends', 'host-pricing-03'],
    ['how do i block days', 'host-pricing-05'],
    ['why cant i publish', 'host-listing-05'],
    ['change my hourly rate', 'host-pricing-02'],
  ])
    assert.deepEqual(answeredIn(talk(engine, [t]).transcript[0]), [id], t);
});

test('round 3: every host-entry phrasing on a first message is its own answer (host words) or the role question, never another answer; no guest phrasing gets host copy', () => {
  const host = new Set(['creating a host listing', 'host pricing and calendars', 'payouts']);
  const wrong = [];
  for (const e of entries) {
    for (const t of [e.question, ...e.variants]) {
      const tr = talk(engine, [t]).transcript[0];
      const ans = answeredIn(tr);
      if (host.has(e.category)) {
        const askedRole = tr.events.some((x) => x.type === 'clarify' && x.kind === 'role');
        if (!ans.includes(e.id) && !askedRole) wrong.push(`${e.id}: "${t}" -> ${ans.join(',') || 'no answer, no role question'}`);
        // an outright host answer only when the words say they host
        for (const id of ans) if (engine.roleUnknownFor({ role: null }, id, t)) wrong.push(`ungated ${id}: "${t}"`);
      } else {
        for (const id of ans) if (engine.hostOnly.has(id)) wrong.push(`${e.id}: "${t}" -> host answer ${id}`);
      }
    }
  }
  assert.deepEqual(wrong, []);
});
