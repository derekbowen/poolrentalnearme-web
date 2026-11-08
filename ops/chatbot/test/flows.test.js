'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine, talk, botLines, lastPublic } = require('./helpers');
const { COPY, LINE_911 } = require('../engine/copy');
const { newState } = require('../engine/flows');

const { engine, entries } = loadEngine();
const byId = (id) => entries.find((e) => e.id === id);
const SENT = /I've sent|sent it over/;
const answered = (t) => t.events.filter((e) => e.type === 'answered').map((e) => e.entry);
const hasEscalate = (t) => t.actions.some((a) => a.type === 'escalate');
const selects = (t) => t.actions.filter((a) => a.type === 'select');

/** No message produced before an escalation succeeded may claim it was sent. */
function assertNoEarlySent(transcript) {
  for (const t of transcript) {
    for (const a of t.actions) {
      if ((a.type === 'say' || a.type === 'select') && SENT.test(a.content)) {
        assert.ok(
          a.afterEscalation,
          `"${a.content}" claims it was sent before the handoff calls succeeded`
        );
        const esc = t.escalations[t.escalations.length - 1];
        assert.ok(esc && esc.result.ok, 'only after a successful escalation');
      }
    }
  }
}

test('greeting: automated-assistant label and the three starter buttons', () => {
  const { transcript } = talk(engine, ['hi']);
  const s = selects(transcript[0]);
  assert.equal(s.length, 1);
  assert.equal(
    s[0].content,
    "Hey, glad you're here. Quick heads-up: I'm an automated assistant, not a person. What can I help you with?"
  );
  assert.deepEqual(
    s[0].items.map((i) => i.title),
    ['Booking a swim', 'Hosting a pool', 'Talk to the founder']
  );
  for (const i of s[0].items)
    assert.deepEqual(
      Object.keys(i).sort(),
      ['title', 'value'],
      'Chatwoot 4.16.2 allows only title + value'
    );
});

test('first message is a real question: label first, then the answer with an absolute link', () => {
  const { transcript } = talk(engine, ['how do i book a pool']);
  const pub = transcript[0].actions.filter((a) => a.type === 'say' || a.type === 'select');
  assert.equal(pub[0].content, COPY.labelLine);
  assert.ok(pub[1].content.startsWith(byId('booking-how-to-book').answer));
  assert.match(pub[1].content, /\nhttps:\/\/www\.poolrentalnearme\.com\/s$/);
  assert.deepEqual(answered(transcript[0]), ['booking-how-to-book']);
});

test('role buttons show role starters; the role is remembered for later questions', () => {
  const { transcript, state } = talk(engine, [
    'hi',
    { button: 'role:host', title: 'Hosting a pool' },
    'instant book',
    'promo code',
  ]);
  assert.equal(state.role, 'host');
  assert.deepEqual(
    selects(transcript[1])[0].items.map((i) => i.value),
    routesStarters('host')
  );
  assert.deepEqual(answered(transcript[2]), ['host-pricing-08']);
  assert.deepEqual(answered(transcript[3]), ['host-pricing-10']);
  // the same words as a swimmer
  const sw = talk(engine, ['hi', { button: 'role:swimmer' }, 'instant book', 'promo code']);
  assert.deepEqual(answered(sw.transcript[2]), ['booking-instant-vs-request']);
  assert.deepEqual(answered(sw.transcript[3]), ['pay-promo-codes']);
});
function routesStarters(role) {
  return loadEngine().routes.starters[role].map((b) => b.value);
}

test('unknown role on a guest/host twin: one question ("booking a swim or hosting?"), then the answer', () => {
  const { transcript, state } = talk(engine, [
    'instant book?',
    { button: 'role:swimmer', title: 'Booking a swim' },
  ]);
  const ask = selects(transcript[0])[0];
  assert.equal(ask.content, "Yeah, I've got you. Are you booking a swim or hosting?");
  assert.deepEqual(answered(transcript[1]), ['booking-instant-vs-request']);
  assert.equal(state.role, 'swimmer');
  // typed instead of tapped
  const typed = talk(engine, ['discount code', "i'm hosting"]);
  assert.deepEqual(answered(typed.transcript[1]), ['host-pricing-10']);
});

test('booking reference given early is remembered and never asked again', () => {
  const ref = '6abaf08c-023d-4f34-8e87-74ea4a6efac4';
  const { transcript, state } = talk(engine, [
    `hey my booking is https://www.poolrentalnearme.com/order/${ref}`,
    'i need to cancel',
    { button: 'reply:chat' },
  ]);
  assert.equal(state.bookingRef, ref);
  const lines = botLines(transcript);
  assert.ok(
    !lines.some((l) => /booking reference/i.test(l)),
    'never asks for the booking reference'
  );
  assert.ok(
    lines.includes(
      "Yeah, I've got you. There's no cancel button on your end, so I'll bring in Derek and Brandon to handle it here."
    )
  );
  assert.equal(lastPublic(transcript[1]).content, COPY.askReplyMethod);
  assert.ok(hasEscalate(transcript[2]));
  assert.match(
    engine.buildNote(transcript[2].escalations[0].before, {}),
    new RegExp(`Booking ref: ${ref}`)
  );
});

test('booking reference asked once: answered → next question is the reply method, not the ref again', () => {
  const { transcript } = talk(engine, [
    'how do i cancel my booking',
    'its PRNM-4421',
    { button: 'reply:chat' },
  ]);
  assert.equal(lastPublic(transcript[0]).content.endsWith("What's your booking reference?"), true);
  assert.equal(lastPublic(transcript[1]).content, COPY.askReplyMethod);
  // only the reference itself is kept, not the words around it
  assert.equal(transcript[2].escalations[0].before.bookingRef, 'PRNM-4421');
  assertNoEarlySent(transcript);
});

test('"talk to the founder": immediate handoff, asks only what is missing, note @mentions both', () => {
  const { transcript } = talk(engine, [
    'talk to the founder',
    'I want to list two pools and have questions',
    { button: 'reply:email' },
    'me@example.com',
  ]);
  assert.deepEqual(answered(transcript[0]), ['human-talk-to-person']);
  assert.ok(
    lastPublic(transcript[0]).content.endsWith(
      "What's it about, so they don't have to ask you again?"
    )
  );
  assert.equal(
    lastPublic(transcript[1]).content,
    COPY.askReplyMethod,
    'no booking ref for a listing question'
  );
  assert.equal(lastPublic(transcript[2]).content, COPY.askEmail);
  assert.ok(hasEscalate(transcript[3]));
  const note = engine.buildNote(transcript[3].escalations[0].before, {
    agents: [
      { id: 1, name: 'Derek Bowen' },
      { id: 2, name: 'Brandon Elias' },
    ],
    conversationUrl: 'https://chat.poolrentalnearme.com/app/accounts/7/conversations/9',
  });
  assert.match(note, /\[@Derek Bowen\]\(mention:\/\/user\/1\/Derek%20Bowen\)/);
  assert.match(note, /\[@Brandon Elias\]\(mention:\/\/user\/2\/Brandon%20Elias\)/);
  assert.match(note, /> I want to list two pools and have questions/);
  assert.match(note, /Reply method: email to me@example\.com/);
  assert.match(
    note,
    /Conversation: https:\/\/chat\.poolrentalnearme\.com\/app\/accounts\/7\/conversations\/9/
  );
  assert.match(note, /assign it to yourself before replying/);
  assert.doesNotMatch(
    note.split('\n')[0],
    /list two pools/,
    'push-notification line carries no customer text'
  );
  assert.match(
    lastPublic(transcript[3]).content,
    /^Cool\. I've sent Derek and Brandon the rundown so you don't have to explain everything again\. They'll reply by email to me@example\.com\.$/
  );
  assertNoEarlySent(transcript);
});

test('founder request with the question in the same message: no extra question, straight to reply method', () => {
  const { transcript } = talk(engine, ['can i talk to a human about my payout from saturday']);
  const pub = transcript[0].actions
    .filter((a) => a.type === 'say' || a.type === 'select')
    .map((a) => a.content);
  assert.ok(pub.includes("Sure thing. I'll bring in Derek and Brandon, the founders."));
  assert.equal(
    pub[pub.length - 1],
    COPY.askBookingRef,
    'payout question → booking ref is relevant'
  );
  for (const t of ['human', 'agent', 'human please', 'i want a person not a bot']) {
    const r = talk(engine, [t]);
    assert.deepEqual(answered(r.transcript[0]), ['human-talk-to-person'], t);
  }
});

test('asking for a person in the middle of a handoff skips the remaining question', () => {
  const { transcript } = talk(engine, ['how do i cancel my booking', 'just get me a human']);
  assert.equal(lastPublic(transcript[1]).content, COPY.askReplyMethod);
  assert.equal(transcript[1].state.bookingRefDeclined, true);
});

test('urgent injury: 911 line first, escalated in the same turn with urgency high', () => {
  const { transcript, state } = talk(engine, ['someone is drowning at the pool']);
  const pub = transcript[0].actions.filter((a) => a.type === 'say' || a.type === 'select');
  assert.ok(pub[0].content.startsWith(LINE_911));
  assert.ok(hasEscalate(transcript[0]));
  const before = transcript[0].escalations[0].before;
  assert.equal(before.handoff.urgency, 'high');
  assert.deepEqual(engine.labelsFor(before).slice(0, 2), ['handoff', 'urgent']);
  assert.match(engine.buildNote(before, {}), /^PRNM handoff \(URGENT\)/);
  assert.match(lastPublic(transcript[0]).content, /marked it urgent/);
  assert.equal(state.handoff.status, 'sent');
  // after a successful handoff: one short "they have it", then silence
  const later = engine.handle(state, { kind: 'text', text: 'hello??' });
  assert.deepEqual(later.actions, [{ type: 'say', content: COPY.waitingAckSent }]);
  assert.deepEqual(engine.handle(later.state, { kind: 'text', text: 'hello???' }).actions, []);
});

test('urgent topics without injury still escalate immediately (high), no factual answer', () => {
  for (const [text, entry] of [
    ['we are here and the gate code doesnt work', 'arrive-cant-get-in'],
    ['do i need insurance to host', 'safety-insurance'],
    ['i want to dispute a charge', 'builtin:dispute-charge'],
    ['my guests wont leave', 'dispute-guest-breaking-rules'],
    ['someone threatened me at the pool', 'safety-harassment'],
  ]) {
    const { transcript } = talk(engine, [text]);
    assert.ok(hasEscalate(transcript[0]), text);
    assert.equal(transcript[0].escalations[0].before.handoff.urgency, 'high', text);
    assert.equal(transcript[0].escalations[0].before.handoff.entryId, entry, text);
  }
  const ins = talk(engine, ['am i covered by insurance if a guest gets hurt']);
  const note = engine.buildNote(ins.transcript[0].escalations[0].before, {});
  assert.match(note, /House rule 8/);
  assert.ok(
    !botLines(ins.transcript).some(
      (l) => /\bcover(s|ed)?\b/i.test(l) && !/Insurance questions go to Derek/.test(l)
    ),
    'no coverage claim'
  );
});

test('two unmatched attempts → handoff with both questions in the note', () => {
  const { transcript } = talk(engine, [
    'zorp blat quux',
    'xqzv wkrpt jjj',
    { button: 'reply:chat' },
  ]);
  const first = selects(transcript[0])[0];
  assert.equal(first.content, COPY.firstMiss);
  assert.deepEqual(first.items, [{ title: 'Talk to the founder', value: 'founder' }]);
  const second = transcript[1].actions
    .filter((a) => a.type === 'say' || a.type === 'select')
    .map((a) => a.content);
  assert.ok(second.includes(COPY.twoStrikes));
  assert.ok(hasEscalate(transcript[2]));
  const before = transcript[2].escalations[0].before;
  assert.equal(before.handoff.reason, 'two_unmatched');
  assert.match(engine.buildNote(before, {}), /zorp blat quux \/ xqzv wkrpt jjj/);
});

test('clarify once: ambiguous → options; "Something else" counts as a miss; next miss hands off', () => {
  const { transcript } = talk(engine, ['can i cancel my listing', { button: 'other' }, 'qwop zzz']);
  const opts = selects(transcript[0])[0];
  assert.equal(opts.content, COPY.disambiguate);
  assert.equal(opts.items[opts.items.length - 1].value, 'other');
  assert.ok(opts.items.length >= 3);
  assert.equal(lastPublic(transcript[1]).content, COPY.rephrase);
  const third = transcript[2].actions.map((a) => a.content);
  assert.ok(third.includes(COPY.twoStrikes));
  // picking an option answers it and resets the counter
  const pick = talk(engine, ['can i cancel my listing', { button: 'entry:cancel-how' }]);
  assert.deepEqual(answered(pick.transcript[1]), ['cancel-how']);
  assert.equal(pick.state.attempts, 0);
});

test('Chatwoot failure: honest fallback, support@ offered, conversation not marked sent, retried on next message', () => {
  let call = 0;
  const { transcript, state } = talk(
    engine,
    [
      'talk to the founder',
      'question about my listing photos',
      { button: 'reply:chat' },
      'hello? anyone?',
    ],
    {
      escalation: () =>
        ++call === 1
          ? {
              ok: false,
              step: 'toggle_status',
              status: 500,
              done: { attributes: true, labels: true, note: true },
            }
          : { ok: true },
    }
  );
  const fail = lastPublic(transcript[2]).content;
  assert.match(fail, /couldn't get this over to Derek and Brandon/);
  assert.match(fail, /support@poolrentalnearme\.com/);
  assert.doesNotMatch(fail, SENT);
  assert.equal(transcript[2].state.handoff.status, 'failed');
  assert.ok(
    transcript[2].events.some((e) => e.type === 'escalation_failed' && e.step === 'toggle_status')
  );
  // next message retries and only then confirms
  assert.ok(hasEscalate(transcript[3]));
  assert.match(
    lastPublic(transcript[3]).content,
    /^Cool\. I've sent Derek and Brandon the rundown/
  );
  assert.equal(state.handoff.status, 'sent');
  assert.equal(state.handoff.done.note, true, 'the note is not posted twice');
  assert.deepEqual(state.handoff.extra, ['hello? anyone?']);
  assertNoEarlySent(transcript);
});

test('an urgent message after a failed handoff becomes an urgent handoff, not a plain retry', () => {
  let n = 0;
  const { transcript } = talk(
    engine,
    [
      'talk to the founder',
      'question about my listing',
      { button: 'reply:chat' },
      'wait, a guest just slipped and fell',
    ],
    {
      escalation: () =>
        ++n === 1
          ? { ok: false, step: 'note', status: 500, done: { attributes: true, labels: true } }
          : { ok: true },
    }
  );
  const last = transcript[3];
  const pub = last.actions.filter((a) => a.type === 'say' || a.type === 'select');
  assert.ok(pub[0].content.startsWith(LINE_911));
  const before = last.escalations[0].before;
  assert.equal(before.handoff.urgency, 'high');
  assert.ok(
    before.handoff.extra.includes('question about my listing'),
    'earlier question carried over'
  );
  assert.match(lastPublic(last).content, /marked it urgent/);
});

test('card number: warning, private note to delete it, digits never repeated or logged, question still answered', () => {
  const { transcript } = talk(engine, ['my card 4111 1111 1111 1111 got declined at checkout']);
  const all = JSON.stringify(
    transcript.map((t) => ({ actions: t.actions, events: t.events, state: t.state }))
  );
  assert.doesNotMatch(all, /4111 1111|4111111111111111/);
  const t = transcript[0];
  assert.ok(t.actions.some((a) => a.type === 'say' && a.content === COPY.cardWarning));
  assert.ok(t.actions.some((a) => a.type === 'note' && /delete that message/.test(a.content)));
  assert.ok(t.events.some((e) => e.type === 'card_warning'));
  assert.deepEqual(answered(t), ['pay-payment-failed']);
  // a number that fails Luhn is not treated as a card
  const notCard = talk(engine, ['order 1234 5678 9012 3456 ?']);
  assert.ok(!notCard.transcript[0].actions.some((a) => a.content === COPY.cardWarning));
});

test('injury plus a card number: the 911 line still comes first', () => {
  const { transcript } = talk(engine, ['my son is bleeding, my card is 4242 4242 4242 4242']);
  const pub = transcript[0].actions.filter((a) => a.type === 'say' || a.type === 'select');
  assert.ok(pub[0].content.startsWith(LINE_911));
  assert.ok(pub.some((a) => a.content === COPY.cardWarning));
});

test('password in a message: warned, redacted, never repeated', () => {
  const { transcript } = talk(engine, ['my password is Sunny2026! and i cant log in']);
  assert.doesNotMatch(
    JSON.stringify(
      transcript.map((t) => ({ actions: t.actions, events: t.events, state: t.state }))
    ),
    /Sunny2026/
  );
  assert.ok(transcript[0].actions.some((a) => a.content === COPY.passwordWarning));
});

test('international customer: correct answers and no SMS / texting / phone anywhere', () => {
  const { transcript } = talk(engine, [
    "hi, I'm in the UK",
    'can i get paid if im outside the us',
    'what currency do guests pay in',
    'talk to the founder',
    'how do I set up payouts in pounds',
    'by email',
    'host@example.co.uk',
  ]);
  const lines = botLines(transcript);
  assert.ok(lines.some((l) => l.startsWith(byId('payouts-10').answer)));
  assert.ok(lines.some((l) => l.startsWith(byId('pay-currency').answer)));
  for (const l of lines)
    assert.doesNotMatch(l, /\b(sms|text us|texts?|texting|txt|phone|call us)\b/i, l);
  assert.match(lastPublic(transcript[6]).content, /reply by email to host@example\.co\.uk/);
});

test('upset customer: calm and direct, no playful openers', () => {
  const { transcript } = talk(engine, ['THIS IS RIDICULOUS the host cancelled on me!!']);
  const ans = lastPublic(transcript[0]).content;
  assert.ok(ans.startsWith('Sorry about that.'));
  assert.doesNotMatch(ans, /bummer|Okay, cool|Nice\./);
});

test('follow-up: "Need to add people?" → yes → the guest-count change handoff', () => {
  const { transcript } = talk(engine, ['can i bring more people than i booked for', 'yes']);
  assert.deepEqual(answered(transcript[0]), ['rules-guest-limit']);
  assert.deepEqual(answered(transcript[1]), ['cancel-change-guests']);
  // and "I can bring in Derek and Brandon" offers accept a yes
  const yes = talk(engine, ['host not responding', 'yes please']);
  assert.equal(yes.transcript[1].state.handoff.reason, 'customer_asked');
  // ...but a plain "ok" is just an acknowledgement
  const ok = talk(engine, ['host not responding', 'ok']);
  assert.equal(ok.state.handoff, null);
  assert.equal(lastPublic(ok.transcript[1]).content, COPY.ok);
});

test('clarify entries: buttons route to the right place (typed or tapped)', () => {
  const a = talk(engine, [
    'i need to make a change to my booking',
    { button: 'route:cancel-change-generic:1' },
  ]);
  assert.equal(selects(a.transcript[0])[0].items.length, 4);
  assert.deepEqual(answered(a.transcript[1]), ['cancel-reschedule']);
  const b = talk(engine, ["i can't log in", 'I forgot my password']);
  assert.deepEqual(answered(b.transcript[1]), ['account-01']);
  const c = talk(engine, [
    'the pool is not what the listing showed',
    { button: 'route:arrive-not-as-listed:0' },
  ]);
  assert.equal(selects(c.transcript[0])[0].content, byId('arrive-not-as-listed').clarify_prompt);
  assert.ok(
    lastPublic(c.transcript[1]).content.startsWith(LINE_911) ||
      c.transcript[1].actions.some((x) => x.content && x.content.startsWith(LINE_911))
  );
});

test('handoff asks for an email address only when the customer picks email', () => {
  const chat = talk(engine, ['talk to the founder', 'press inquiry', { button: 'reply:chat' }]);
  assert.ok(!botLines(chat.transcript).includes(COPY.askEmail));
  assert.ok(hasEscalate(chat.transcript[2]));
  const known = talk(engine, [
    'talk to the founder',
    'a question about hosting, my email is pat@example.com',
    { button: 'reply:email' },
  ]);
  assert.ok(
    !botLines(known.transcript).includes(COPY.askEmail),
    'email already given in this conversation'
  );
  assert.ok(hasEscalate(known.transcript[2]));
  assert.match(lastPublic(known.transcript[2]).content, /reply by email to pat@example\.com/);
});

test('near-miss questions get a clarifying question or a handoff, never a wrong answer', () => {
  const cases = [
    'whats the wifi password',
    'do hosts get paid for cancelled bookings',
    'can i get my deposit back',
    'can i bring my service dog',
    'is my pool covered if someone gets hurt',
    'how long does a refund take to hit my bank',
    'what happens to my bookings if i close my listing',
    'can i list my apartment complex pool',
    'is the pool salt water or chlorine',
    'how much do hosts make a month',
    'i want to work for you',
  ];
  for (const text of cases) {
    const { transcript } = talk(engine, [text]);
    const t = transcript[0];
    const autoAnswers = t.events.filter((e) => e.type === 'answered' && e.mode === 'auto');
    const clarified =
      t.events.some((e) => e.type === 'clarify') ||
      t.actions.some((a) => a.type === 'select' && a.items.some((i) => i.value === 'other'));
    const handedOff = t.state.handoff != null;
    const missed = t.events.some((e) => e.type === 'unmatched');
    assert.deepEqual(autoAnswers, [], `${text} must not get a confident answer`);
    assert.ok(
      clarified ||
        handedOff ||
        missed ||
        t.events.some((e) => e.type === 'answered' && e.mode !== 'auto'),
      text
    );
  }
});

test('full engine: every bank phrasing gets its own entry (only "locked out" asks pool-or-account first)', () => {
  const { roleOfCategory } = require('../engine/matcher');
  const off = [];
  for (const e of entries) {
    const role = roleOfCategory(e.category);
    for (const text of [e.question, ...e.variants]) {
      const st = role ? { ...newState(), role } : null;
      const r = engine.handle(st, { kind: 'text', text });
      if (r.events.some((x) => x.type === 'answered' && x.entry === e.id)) continue;
      // an urgent entry the matcher found without a safety guard is confirmed first (one tap), never paged blind
      const confirm = r.events.some((x) => x.type === 'clarify' && x.kind === 'confirm_urgent');
      const offers = r.actions.some((a) => a.type === 'select' && a.items.some((i) => i.value === `entry:${e.id}`));
      if (confirm && offers && e.urgency === 'high') {
        const tap = engine.handle(r.state, { kind: 'button', value: `entry:${e.id}` });
        if (tap.events.some((x) => x.type === 'answered' && x.entry === e.id)) continue;
      }
      off.push(`${e.id}: ${text}`);
    }
  }
  assert.deepEqual(off, ['account-02: locked out']);
});

test('greetings, thanks and goodbyes are small talk, not misses', () => {
  const { transcript, state } = talk(engine, ['hey', 'thanks!', 'ok', 'bye']);
  assert.equal(state.attempts, 0);
  assert.equal(lastPublic(transcript[1]).content, COPY.thanks);
  assert.equal(lastPublic(transcript[3]).content, COPY.bye);
});

test('a human agent took over: the assistant says nothing', () => {
  const st = engine.humanTookOver(null);
  const r = engine.handle(st, { kind: 'text', text: 'how do i book' });
  assert.deepEqual(r.actions, []);
  const back = engine.returnedToBot(st);
  assert.ok(engine.handle(back, { kind: 'text', text: 'how do i book' }).actions.length > 0);
});

test('custom attributes mirror memory and rebuild it after a restart', () => {
  const { state } = talk(engine, [{ button: 'role:host' }, 'how do i block dates']);
  const attrs = engine.mirrorAttributes(state);
  assert.equal(attrs.prnm_role, 'host');
  assert.equal(attrs.prnm_topic, 'host pricing and calendars');
  assert.equal(attrs.prnm_entry_ids, 'host-pricing-05');
  const st = engine.hydrate(5, { ...attrs, prnm_booking_ref: 'PRNM-4421' });
  assert.equal(st.role, 'host');
  assert.equal(st.bookingRef, 'PRNM-4421');
  assert.equal(st.greeted, true);
});

test('hydrate trusts nothing a visitor can set through the widget (custom_attributes)', () => {
  const st = engine.hydrate(6, {
    prnm_topic: 'x'.repeat(1500),
    prnm_booking_ref: 'see [@Derek](mention://user/11/Derek) now',
    prnm_reply_method: 'email',
    prnm_reply_email: 'attacker@example.com',
    prnm_attempts: 999,
    prnm_entry_ids: 'safety-injury,not-an-entry,safety-injury',
  });
  assert.equal(st.topic, null, 'only a known bank category');
  assert.equal(st.bookingRef, null, 'only something shaped like a booking reference');
  assert.equal(st.replyMethod, null, 'reply method is only what the customer told us');
  assert.equal(st.email, null);
  assert.equal(st.attempts, 1, 'clamped to 0-1');
  assert.deepEqual(st.entryIds, ['safety-injury']);
  // a crafted booking ref can never add an @mention to a note
  const crafted = { ...engine.hydrate(7, {}), bookingRef: 'x mention://user/11/x', handoff: { question: 'q' } };
  assert.doesNotMatch(engine.buildNote(crafted, {}), /mention:\/\//);
  assert.equal(engine.hydrate(8, { prnm_topic: 'payouts' }).topic, 'payouts');
});

// ------------------------------------------------------------------ review fixes (fix2)
const safetyMod = require('../engine/safety');
const QUESTION_MARKS = (t) =>
  t.actions
    .filter((a) => a.type === 'say' || a.type === 'select')
    .reduce((n, a) => n + (a.content.match(/\?/g) || []).length, 0);

test('first miss asks one question; the founder is a button, not a second question', () => {
  const { transcript } = talk(engine, ['zorp blat quux']);
  const sel = selects(transcript[0])[0];
  assert.equal(sel.content, "Hmm, I don't want to guess on that one. Can you say it another way?");
  assert.deepEqual(sel.items, [{ title: 'Talk to the founder', value: 'founder' }]);
  for (const t of ['bonjour', 'hallo', 'salut', 'ciao', 'olá', 'hola'])
    assert.equal(selects(talk(engine, [t]).transcript[0])[0].content, COPY.greeting, t);
});

test('urgent and safety turns: 911 line first, never a role question or a disambiguation', () => {
  for (const t of [
    'my son passed out',
    'someone fainted',
    'there is a snake in the pool',
    'the pool cover trapped my kid',
    'the host touched my daughter',
    'gas smell by the pool heater',
  ]) {
    const { transcript } = talk(engine, [t]);
    const pub = transcript[0].actions.filter((a) => a.type === 'say' || a.type === 'select');
    assert.ok(pub[0].content.startsWith(LINE_911), t);
    assert.ok(!pub.some((a) => a.content === COPY.askRole || a.content === COPY.disambiguate), t);
    assert.equal(transcript[0].escalations[0].before.handoff.urgency, 'high', t);
  }
});

test('hypothetical liability: rule-8 note, urgent, and no 911 lead', () => {
  for (const t of ['what happens if a guest gets hurt at my pool?', 'am i legally responsible if a guest drowns']) {
    const { transcript } = talk(engine, [t]);
    const pub = transcript[0].actions.filter((a) => a.type === 'say' || a.type === 'select');
    assert.ok(!pub[0].content.startsWith(LINE_911), t);
    const before = transcript[0].escalations[0].before;
    assert.equal(before.handoff.entryId, 'safety-insurance', t);
    assert.match(engine.buildNote(before, {}), /House rule 8/, t);
  }
});

test('rule 8 is computed from the customer text on every handoff path', () => {
  // a later, unrelated handoff in a conversation that touched liability still names Derek
  const first = talk(engine, ['am i liable if someone gets hurt']);
  const back = engine.returnedToBot(first.state);
  const again = talk(engine, ['talk to a person', 'question about my listing photos', { button: 'reply:chat' }], {
    state: back,
  });
  const esc = again.transcript.flatMap((t) => t.escalations);
  assert.match(engine.buildNote(esc[0].before, {}), /House rule 8/);
  // each source the check reads: question, extra, misses
  const h = { question: null, extra: [], context: null };
  const st = { ...newState(), handoff: h };
  assert.equal(engine.customerRule8(st, h), false);
  assert.equal(engine.customerRule8(st, { ...h, question: 'who covers the damage' }), true);
  assert.equal(engine.customerRule8(st, { ...h, extra: ['she got hurt last week'] }), true);
  assert.equal(engine.customerRule8({ ...st, misses: ['zorp homeowners policy'] }, h), true);
  const plain = talk(engine, ['talk to a person', 'question about my listing photos', { button: 'reply:chat' }]);
  assert.doesNotMatch(engine.buildNote(plain.transcript[2].escalations[0].before, {}), /House rule 8/);
});

test('a re-asked question during a disambiguation is not a pick (wifi password ≠ forgot password)', () => {
  const { transcript, state } = talk(engine, [
    'whats the wifi password',
    'what is the wifi password',
    'wifi password??',
  ]);
  assert.ok(!transcript.some((t) => answered(t).includes('account-01')));
  assert.equal(state.handoff && state.handoff.reason, 'two_unmatched');
});

test('a bare "i\'m a host" sets the role and offers host starters; a later guest question is answered', () => {
  const { transcript, state } = talk(engine, ["i'm a host", 'how do i book a pool']);
  assert.equal(selects(transcript[0])[0].content, COPY.roleHost);
  assert.equal(state.role, 'host');
  assert.deepEqual(answered(transcript[1]), ['booking-how-to-book']);
});

test('founder handoff keeps the real question: complaint is not the question, typed text is never dropped', () => {
  const a = talk(engine, [
    'great, another useless bot. get me a human NOW',
    'my booking got declined and i was still charged',
    { button: 'ref:none' },
    { button: 'reply:chat' },
  ]);
  assert.match(lastPublic(a.transcript[0]).content, /What's it about/);
  const note = engine.buildNote(a.transcript[3].escalations[0].before, {});
  assert.match(note, /> my booking got declined and i was still charged/);
  // the question typed at the reply-method prompt goes into the note, and the ask acknowledges it
  const b = talk(engine, ['talk to a person', 'my calendar sync is broken', 'also my listing photos wont upload', { button: 'reply:chat' }]);
  assert.equal(lastPublic(b.transcript[2]).content, COPY.addedAskReply);
  assert.match(engine.buildNote(b.transcript[3].escalations[0].before, {}), /> also my listing photos wont upload/);
});

test('reply method: texting/calling is declined once, honestly; then chat', () => {
  const { transcript, state } = talk(engine, [
    'talk to the founder',
    'my payout is missing',
    { button: 'ref:none' },
    'can you just text me',
    'text me at 512-555-0199',
  ]);
  assert.equal(lastPublic(transcript[3]).content, COPY.noTexts);
  assert.doesNotMatch(COPY.noTexts, /\b(sms|texts?|texting|txt)\b/i);
  assert.equal(state.replyMethod, 'chat');
  assert.match(lastPublic(transcript[4]).content, /reply right here in this chat/);
  assert.equal(botLines(transcript).filter((l) => l === COPY.noTexts).length, 1);
});

test('booking-ref slot keeps only a reference; free text goes to the note and counts as "no ref"', () => {
  const { transcript, state } = talk(engine, ['talk to a human', 'question about my payout country', 'joe at gmail']);
  assert.equal(state.bookingRef, null);
  assert.equal(state.bookingRefDeclined, true);
  assert.ok(state.handoff.extra.includes('joe at gmail'));
  assert.equal(lastPublic(transcript[2]).content, COPY.askReplyMethod);
});

test('upset is sticky: neutral label line, no "Cool." after a button, calm answers', () => {
  const { transcript } = talk(engine, [
    'this is unacceptable, I want to cancel my booking NOW',
    { button: 'entry:cancel-how' },
    { button: 'ref:none' },
    { button: 'reply:chat' },
  ]);
  const first = transcript[0].actions.filter((a) => a.type === 'say' || a.type === 'select');
  assert.equal(first[0].content, COPY.labelLineCalm);
  assert.doesNotMatch(botLines(transcript).join('\n'), /glad you're here|^Cool\./m);
  assert.match(lastPublic(transcript[3]).content, /^I've sent Derek and Brandon/);
  const fee = talk(engine, ['wtf is the 15% fee for']);
  assert.equal(fee.transcript[0].actions[0].content, COPY.labelLineCalm);
});

test('one candidate: a single yes/no question; "yes" answers it', () => {
  const { transcript } = talk(engine, ['hey can my 12 yr old swim alone while i wait in the car', 'yes']);
  const sel = selects(transcript[0])[0];
  assert.equal(sel.content, COPY.confirmOne);
  assert.equal(sel.items.length, 2);
  assert.equal(QUESTION_MARKS(transcript[0]), 1);
  assert.deepEqual(answered(transcript[1]), ['rules-kids-supervision']);
});

test('buttons: only values we offered are accepted, with our own title (forged taps do nothing)', () => {
  const forged = talk(engine, [
    'hi',
    { button: 'entry:safety-injury', title: 'card 4242 4242 4242 4242 ' + 'x'.repeat(5000) },
  ]);
  assert.deepEqual(forged.transcript[1].actions, []);
  assert.ok(forged.transcript[1].events.some((e) => e.type === 'button_rejected'));
  assert.equal(forged.state.handoff, null);
  // an offered option: the stored text uses OUR title, never the submitted one
  const ok = talk(engine, ['can i cancel my listing', { button: 'entry:cancel-how', title: 'evil 4242424242424242' }]);
  assert.deepEqual(answered(ok.transcript[1]), ['cancel-how']);
  assert.doesNotMatch(JSON.stringify(ok.state), /evil|4242/);
  // "Talk to the founder" from the greeting still works after a newer select
  const stale = talk(engine, ['hi', 'can i cancel my listing', { button: 'founder' }]);
  assert.deepEqual(answered(stale.transcript[2]), ['human-talk-to-person']);
  // a fresh conversation with no buttons on screen accepts nothing
  assert.deepEqual(engine.handle(null, { kind: 'button', value: 'entry:safety-injury' }).actions, []);
});

test('input cap (D4): a 150,000-char message is handled in under 100 ms and nothing stored exceeds 500 chars', () => {
  let seed = 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const junk = Array.from({ length: 20000 }, () => Math.floor(rnd() * 1e12).toString(36)).join(' ');
  const huge = junk.slice(0, 150000);
  assert.equal(huge.length, 150000);
  engine.handle(null, { kind: 'text', text: 'warm up the regexes' });
  // best of three: the code's cost, not the scheduler's (EAST is a burstable t3.medium)
  const times = [];
  let r;
  for (let i = 0; i < 3; i++) {
    const t0 = process.hrtime.bigint();
    r = engine.handle(null, { kind: 'text', text: huge });
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  assert.ok(Math.min(...times) < 100, `took ${times.map((t) => t.toFixed(1)).join(' / ')} ms`);
  assert.ok(Math.max(...times) < 1000, `took ${times.map((t) => t.toFixed(1)).join(' / ')} ms`);
  assert.ok(r.events.some((e) => e.type === 'truncated' && e.chars === 150000));
  // long rambles that hand off: every stored string is capped
  const long = `${'my pool question '.repeat(400)} talk to a human`;
  const h = talk(engine, ['talk to a person', long, long.replace('pool', 'deck'), { button: 'reply:chat' }]);
  const strings = [];
  const walk = (v) => {
    if (typeof v === 'string') strings.push(v);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(h.transcript.map((t) => t.state));
  assert.ok(strings.every((x) => x.length <= safetyMod.MAX_STORED_CHARS), 'a stored string is longer than 500');
});

test('cancel-host-cancelled states no refund outcome and hands the refund part to a person', () => {
  const e = byId('cancel-host-cancelled');
  assert.equal(e.mode, 'handoff');
  assert.doesNotMatch(e.answer, /refunded|refund is|any charge is|automatically/i);
  assert.match(e.answer, /Declined/);
  const { transcript, state } = talk(engine, ['the host cancelled my booking, do i get my money back?']);
  assert.ok(state.handoff && state.handoff.status === 'collecting');
  assert.ok(!botLines(transcript).some((l) => /refunded/i.test(l)));
});

test('after a capped handoff the assistant stays quiet, except for the 911 line on danger', () => {
  const { state } = talk(engine, ['talk to a person', 'question about my listing', { button: 'reply:chat' }], {
    escalation: () => ({ ok: true, capped: 'conversation', done: { attributes: true, labels: true } }),
  });
  assert.equal(state.handoff.status, 'capped');
  const hello = engine.handle(state, { kind: 'text', text: 'hello?' });
  assert.deepEqual(hello.actions, [{ type: 'say', content: COPY.waitingAckCapped }]);
  assert.deepEqual(engine.handle(hello.state, { kind: 'text', text: 'hello??' }).actions, []);
  const danger = engine.handle(state, { kind: 'text', text: 'my son is not breathing' });
  assert.deepEqual(danger.actions[0], { type: 'say', content: LINE_911 });
  const flag = danger.actions[1];
  assert.equal(flag.type, 'flag_urgent');
  assert.ok(flag.labels.includes('urgent') && flag.labels.includes('handoff-capped'));
  assert.doesNotMatch(flag.note, /mention:\/\//);
  assert.match(flag.note, /my son is not breathing/);
  assert.equal(danger.actions.length, 2, 'no escalate: no new @mention, no reopen');
  // once, not on every message
  assert.deepEqual(engine.handle(danger.state, { kind: 'text', text: 'he is still not breathing' }).actions, []);
});

test('a founder request during a clarification carries that question; a known ref is not asked again', () => {
  const ref = '3f2a1b4c-1111-2222-3333-444455556666';
  const { transcript, state } = talk(engine, [`my booking ${ref} has a problem`, 'can i talk to a person', { button: 'reply:chat' }]);
  assert.ok(!botLines(transcript).some((l) => /What's it about|booking reference/.test(l)));
  assert.equal(state.handoff.status, 'sent');
  const note = engine.buildNote(transcript[2].escalations[0].before, {});
  assert.match(note, /> my booking has a problem/);
  assert.match(note, new RegExp(`Booking ref: ${ref}`));
  // and a generic "problem with my booking" is never the host-side guest-dispute page
  for (const t of ['my booking has a problem', 'problem with my booking']) {
    const r = talk(engine, [t]);
    assert.ok(!r.transcript[0].actions.some((a) => a.type === 'escalate'), t);
  }
});

test('booking-ref slot: "yeah" asks once more; reply-method short answers are understood', () => {
  const { transcript, state } = talk(engine, ['bruh my payout aint hit my bank yet', 'yeah', 'PRNM-77']);
  assert.equal(lastPublic(transcript[1]).content, COPY.askBookingRefYesNo);
  assert.equal(state.bookingRef, 'PRNM-77');
  assert.deepEqual(state.handoff.extra, []);
  for (const [t, method] of [
    ['chat is good', 'chat'],
    ['either is fine', 'chat'],
    ['by email please', 'email'],
    ['here', 'chat'],
  ]) {
    const r = talk(engine, ['talk to a person', 'question about my listing photos', t]);
    assert.equal(r.state.replyMethod, method, t);
  }
});

test('review slang and angry phrasings: calm label, and clear slang questions answered directly', () => {
  const angry = talk(engine, ["your site is a joke, the accept button doesn't work wtf"]);
  assert.equal(angry.transcript[0].actions[0].content, COPY.labelLineCalm);
  for (const [t, id] of [
    ['yo can i bring my homies lol how many ppl can come', 'booking-guest-count'],
    ['how much do u take from hosts fr', 'host-pricing-01'],
    ['where da pool at, whats the address', 'arrive-address'],
    ['bruh my payout aint hit my bank yet', 'payouts-04'],
  ])
    assert.deepEqual(answered(talk(engine, [t]).transcript[0]), [id], t);
});

// ------------------------------------------------------------------ round-2 review (fix2, round 2)
test('round 2: an unclear message that reads like danger asks "is someone hurt?" (911 first), never unrelated answers', () => {
  const r = talk(engine, ['my little brother is crying in the pool and wont get out']);
  const t = r.transcript[0];
  const pub = t.actions.filter((a) => a.type === 'say' || a.type === 'select');
  assert.equal(pub[0].content, COPY.safetyCheck, 'the 911 line leads');
  assert.equal(pub[0].type, 'select');
  assert.deepEqual(pub[0].items.map((i) => i.value), ['safety:yes', 'safety:no']);
  assert.equal(pub[1].content, COPY.labelLineAfter, 'the automated-assistant label comes after the 911 line');
  // yes (tap or typed) → urgent handoff, the 911 line is not repeated
  for (const yes of [{ button: 'safety:yes' }, 'yes']) {
    const y = talk(engine, [yes], { state: r.state });
    assert.equal(y.state.handoff.urgency, 'high');
    assert.ok(hasEscalate(y.transcript[0]));
    assert.ok(!y.transcript[0].actions.some((a) => a.type === 'say' && a.content.startsWith(LINE_911)));
    assert.match(engine.buildNote(y.transcript[0].escalations[0].before, {}), /crying in the pool/);
  }
  // no → the normal path for their own words, no page
  const n = talk(engine, [{ button: 'safety:no' }], { state: r.state });
  assert.ok(!(n.state.handoff && n.state.handoff.urgency === 'high'));
  assert.ok(!hasEscalate(n.transcript[0]));
});

test('round 2: an urgent bank entry found by the matcher alone is confirmed first, never paged blind', () => {
  const r = talk(engine, ['is the pool safe for kids']);
  const t = r.transcript[0];
  assert.ok(!hasEscalate(t));
  assert.ok(t.events.some((e) => e.type === 'clarify' && e.kind === 'confirm_urgent'));
  assert.ok(!botLines(r.transcript).some((l) => l.includes(LINE_911)), 'a pre-booking question gets no 911 line');
  // the customer can still pick it
  const pick = talk(engine, [{ button: 'entry:safety-unsafe-pool' }], { state: r.state });
  assert.ok(hasEscalate(pick.transcript[0]));
  // "something else" → a gentle rephrase, no page
  const other = talk(engine, [{ button: 'other' }], { state: r.state });
  assert.ok(!hasEscalate(other.transcript[0]));
});

test('round 2: a genuine tap from an older message still gets a reply; a forged value still does not', () => {
  // S01: an older clarify option after a newer prompt
  let r = talk(engine, ['whats the wifi password', 'i want to cancel']);
  const old = r.transcript[0].actions.find((a) => a.type === 'select').items.find((i) => i.value === 'entry:account-01');
  assert.ok(old, 'the first menu offered account-01');
  let tap = talk(engine, [{ button: old.value, title: old.title }], { state: r.state });
  assert.deepEqual(answered(tap.transcript[0]), ['account-01']);
  // S02: a starter button while a cancel handoff is collecting
  r = talk(engine, ['hi', { button: 'role:swimmer' }, 'how do i cancel']);
  tap = talk(engine, [{ button: 'entry:rules-house-rules' }], { state: r.state });
  assert.deepEqual(answered(tap.transcript[0]), ['rules-house-rules']);
  // an old "Something else" or yes/no that no longer fits: ask for words, don't go quiet
  r = talk(engine, ['whats the wifi password', 'how do i book a pool']);
  tap = talk(engine, [{ button: 'other' }], { state: r.state });
  assert.ok(tap.transcript[0].actions.some((a) => a.type === 'say' || a.type === 'select'));
  // never offered: silent
  assert.deepEqual(talk(engine, [{ button: 'entry:safety-insurance' }], { state: r.state }).transcript[0].actions, []);
  assert.deepEqual(talk(engine, [{ button: 'founder' }]).transcript[0].actions, [], 'a "founder" tap before any button is forged');
});

test('round 2: capped copy is only ever true: "already flagged" for the same open thread, "logged" after a resolve', () => {
  const sent = talk(engine, ['talk to a person', 'question about my listing photos', { button: 'reply:chat' }]);
  assert.equal(sent.state.alertThread, true);
  // same thread (no resolve): already flagged
  const again = { ...sent.state, handoff: null, awaiting: null };
  const same = talk(engine, ['talk to a person', 'still about my photos', { button: 'reply:chat' }], {
    state: again,
    escalation: () => ({ ok: true, capped: 'conversation', done: {} }),
  });
  assert.ok(botLines(same.transcript).includes(COPY.cappedAlready));
  // after a resolve: a new thread, and a new emergency is never "already flagged"
  const fresh = engine.returnedToBot(sent.state);
  assert.equal(fresh.alertThread, false);
  const urgent = talk(engine, ['my son just fell and hit his head, hes bleeding'], {
    state: fresh,
    escalation: () => ({ ok: true, capped: 'conversation', done: {} }),
  });
  const lines = botLines(urgent.transcript);
  assert.ok(lines[0].startsWith(LINE_911));
  assert.ok(lines.includes(COPY.cappedLoggedUrgent));
  assert.ok(!lines.includes(COPY.cappedAlready) && !lines.includes(COPY.cappedAlreadyUrgent));
});

test('round 2: while a handoff waits (sent or capped), a booking ref they add is kept, and danger is flagged once', () => {
  const ref = '7a1c2e3f-aaaa-bbbb-cccc-1234567890ab';
  for (const escalation of [() => ({ ok: true }), () => ({ ok: true, capped: 'contact', done: {} })]) {
    const { state } = talk(engine, ['talk to a person', 'payout question', { button: 'ref:none' }, { button: 'reply:chat' }], { escalation });
    const r = engine.handle(state, { kind: 'text', text: `actually my ref is ${ref}` });
    // one short line; a contact-capped handoff also asks the executor to try the alert again (deferred)
    const capped = r.state.handoff.status === 'capped';
    assert.deepEqual(
      r.actions,
      [{ type: 'say', content: capped ? COPY.waitingAckCapped : COPY.waitingAckSent }, ...(capped ? [{ type: 'escalate', deferred: true }] : [])]
    );
    assert.equal(r.state.bookingRef, ref);
    assert.equal(engine.mirrorAttributes(r.state).prnm_booking_ref, ref);
    const d = engine.handle(r.state, { kind: 'text', text: 'omg my son is choking' });
    assert.deepEqual(d.actions[0], { type: 'say', content: LINE_911 });
    assert.equal(d.actions[1].type, 'flag_urgent');
    // no new @mention (D3); a capped one is only retried by the executor when a slot is free
    assert.ok(!d.actions.some((a) => a.type === 'escalate' && !a.deferred), 'no new @mention (D3)');
    assert.equal(d.state.handoff.urgency, 'high');
  }
});

test('round 2: "is this a bot?" as a first message says "automated assistant" once, not twice', () => {
  for (const t of ['is this a bot', 'are you even a real person??']) {
    const lines = botLines(talk(engine, [t]).transcript);
    assert.equal(lines.filter((l) => /automated assistant, not a person/.test(l)).length, 1, t);
  }
});

test('round 2: a founder request gets no topic label from "talk to a person" or a weak guess', () => {
  const r = talk(engine, ['your site is a joke get me a human NOW', 'my payout is missing']);
  const labels = engine.labelsFor(r.state);
  assert.ok(!labels.includes('topic-safety'), labels.join(','));
  const weak = talk(engine, ['talk to a person', 'payout question']);
  assert.ok(!engine.labelsFor(weak.state).includes('topic-booking'));
  assert.notEqual(weak.state.handoff.category, 'booking');
  // the note still carries their words
  assert.match(engine.buildNote({ ...r.state, handoff: { ...r.state.handoff } }, {}), /payout is missing/);
});

test('round 2: "can someone help me" / "is anyone there" offer the starters, never a guessed answer', () => {
  for (const t of ['can someone help me', 'is anyone there', 'hello??? anyone??', 'i need help']) {
    const tr = talk(engine, [t]).transcript[0];
    assert.deepEqual(answered(tr), [], t);
    const sel = tr.actions.find((a) => a.type === 'select');
    assert.ok(sel && sel.items.some((i) => i.value === 'founder'), t);
  }
});

// ------------------------------------------------------------------ round-3 review (fix2, round 3)
test('round 3: frustration alone is not the founder question; "What\'s it about?" is asked (F04)', () => {
  const { transcript, state } = talk(engine, ['your stupid bot is useless', 'talk to a human']);
  assert.equal(state.handoff.status, 'collecting');
  assert.ok(!state.handoff.question || state.handoff.question === null);
  assert.match(lastPublic(transcript[1]).content, /What's it about/);
  // a real question asked before the founder request is carried over (no repeat)
  const q = talk(engine, ['my payout from saturday never showed up and the host is not answering', 'talk to a human']);
  assert.ok(q.state.handoff.question && /payout/.test(q.state.handoff.question));
});

test('round 3: a card number pasted after the handoff: public warning AND a private "please delete" note (I03)', () => {
  const sent = talk(engine, ['talk to a person', 'question about my listing photos', { button: 'reply:chat' }]).state;
  const r = engine.handle(sent, { kind: 'text', text: '4242 4242 4242 4242', messageId: 77 });
  assert.equal(r.actions[0].content, COPY.cardWarning);
  const note = r.actions.find((a) => a.type === 'note');
  assert.ok(note && /#77/.test(note.content) && /delete that message/.test(note.content));
  assert.ok(!JSON.stringify(r).includes('4242 4242'));
});

test('round 3: a long ramble that ends in an emergency: the note quotes the emergency, not the first 500 chars (A20)', () => {
  const ramble = 'so we were thinking about maybe doing a pool day for the family this summer and i was reading through the site '.repeat(12);
  const t = `${ramble} wait my son is not breathing`;
  const { transcript } = talk(engine, [t]);
  const before = transcript[0].escalations[0].before;
  assert.equal(before.handoff.urgency, 'high');
  assert.match(before.handoff.question, /my son is not breathing/);
  assert.ok(before.handoff.question.length <= 500);
  const note = engine.buildNote(before, {});
  assert.match(note, /> .*my son is not breathing/);
  assert.match(note, /Context: Start of their message: so we were thinking/);
});

test('round 3: after an urgent handoff, a "no" to its booking-ref question gets one short line, not silence (K06)', () => {
  const { state } = talk(engine, ['my son is bleeding']);
  assert.equal(state.handoff.status, 'sent');
  const no = engine.handle(state, { kind: 'text', text: 'no' });
  assert.deepEqual(no.actions, [{ type: 'say', content: COPY.waitingAckSent }]);
  const again = engine.handle(no.state, { kind: 'text', text: 'real person pls' });
  assert.deepEqual(again.actions, [], 'said once per thread');
  // after the conversation goes back to the bot, a new thread may get the line again
  const back = engine.returnedToBot(again.state);
  assert.equal(back.waitAckSaid, false);
});

test('round 3: a message in another language gets a plain "English only" line with the founder button, never a guessed answer', () => {
  for (const t of ['Hola, necesito ayuda', 'bonjour je voudrais réserver une piscine', 'Привет', '你好']) {
    const tr = talk(engine, [t]).transcript[0];
    assert.deepEqual(answered(tr), [], t);
    const sel = selects(tr).pop();
    assert.equal(sel.content, COPY.englishOnly, t);
    assert.deepEqual(sel.items.map((i) => i.value), ['founder']);
  }
  // greetings stay greetings
  assert.equal(selects(talk(engine, ['hola']).transcript[0]).pop().content, COPY.greeting);
});

test('round 3: a cry for help while details are being collected asks the safety question; "no" resumes the handoff', () => {
  const r = talk(engine, ['talk to a person', 'HELP!!!', { button: 'safety:no' }]);
  assert.ok(r.transcript[1].events.some((e) => e.kind === 'safety_check'));
  assert.equal(r.state.handoff.status, 'collecting');
  assert.match(lastPublic(r.transcript[2]).content, /What's it about/);
  // typing the cry again while the question is on screen is a yes
  const y = talk(engine, ['pls help', 'HELP']);
  assert.equal(y.state.handoff.urgency, 'high');
});

test('round 3: the engine asks for a deferred alert only for a handoff logged over the hourly or per-visitor cap', () => {
  const capped = (cap) =>
    talk(engine, ['talk to a person', 'question about my listing', { button: 'reply:chat' }], {
      escalation: () => ({ ok: true, capped: cap, done: { attributes: true, labels: true } }),
    }).state;
  for (const cap of ['global', 'contact']) {
    const st = capped(cap);
    assert.ok(engine.deferred(st), cap);
    const r = engine.handle(st, { kind: 'text', text: 'hello?' });
    assert.ok(r.actions.some((a) => a.type === 'escalate' && a.deferred), cap);
    assert.deepEqual(engine.retryDeferred(st).actions, [{ type: 'escalate', deferred: true }]);
  }
  const conv = capped('conversation');
  assert.ok(!engine.deferred(conv), 'the per-conversation cap is final (D3)');
  assert.ok(!engine.handle(conv, { kind: 'text', text: 'hello?' }).actions.some((a) => a.type === 'escalate'));
  // a deferred retry that succeeds: the normal confirmation, said only after success
  const st = capped('global');
  const after = engine.afterEscalation(st, { ok: true, done: { note: true, status: true } });
  assert.equal(after.state.handoff.status, 'sent');
  assert.match(after.actions[0].content, /^Cool\. I've sent Derek and Brandon/);
});
