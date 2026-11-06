'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine, talk, botLines, lastPublic } = require('./helpers');
const { COPY, LINE_911 } = require('../engine/copy');

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
  const sw = talk(engine, [{ button: 'role:swimmer' }, 'instant book', 'promo code']);
  assert.deepEqual(answered(sw.transcript[1]), ['booking-instant-vs-request']);
  assert.deepEqual(answered(sw.transcript[2]), ['pay-promo-codes']);
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
  assert.equal(transcript[2].escalations[0].before.bookingRef, 'its PRNM-4421');
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
  // after a successful handoff the assistant stays silent
  const later = engine.handle(state, { kind: 'text', text: 'hello??' });
  assert.deepEqual(later.actions, []);
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
  const pick = talk(engine, ['can i cancel my listing', { button: 'entry:host-listing-08' }]);
  assert.deepEqual(answered(pick.transcript[1]), ['host-listing-08']);
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
      const st = role ? engine.handle(null, { kind: 'button', value: `role:${role}` }).state : null;
      const r = engine.handle(st, { kind: 'text', text });
      if (!r.events.some((x) => x.type === 'answered' && x.entry === e.id))
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
  const st = engine.hydrate(5, { ...attrs, prnm_booking_ref: 'X-1' });
  assert.equal(st.role, 'host');
  assert.equal(st.bookingRef, 'X-1');
  assert.equal(st.greeted, true);
});
