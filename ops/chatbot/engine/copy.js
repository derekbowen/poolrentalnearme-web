'use strict';
/**
 * Every line the assistant says that is not a bank answer. Voice: warm,
 * relaxed, short, contractions, one question at a time. None of these lines
 * states a policy fact; facts live only in bank/entries.json.
 *
 * Rules baked in here (tests enforce them):
 *  - "I've sent ..." is only ever said by handoffConfirmed(), which the
 *    executor calls after every Chatwoot call succeeded.
 *  - Nothing promises how fast Derek or Brandon will reply.
 *  - Reply options are chat or email only. No texting, no phone.
 *  - One question per message.
 */

const SUPPORT_EMAIL = 'support@poolrentalnearme.com';
const LINE_911 = 'If anyone is hurt or in danger, call 911 first.';

const COPY = {
  greeting:
    "Hey, glad you're here. Quick heads-up: I'm an automated assistant, not a person. What can I help you with?",
  labelLine: "Hey, glad you're here. Quick heads-up: I'm an automated assistant, not a person.",
  labelLineAfter: "(Quick heads-up: I'm an automated assistant, not a person.)",
  // first message from an upset customer: same label, no cheerful greeting
  labelLineCalm: "Quick heads-up: I'm an automated assistant, not a person.",
  roleSwimmer: 'Okay, cool. What can I help you with?',
  roleHost: 'Nice. What can I help you with?',
  askRole: "Yeah, I've got you. Are you booking a swim or hosting?",
  roleButtons: [
    { title: 'Booking a swim', value: 'role:swimmer' },
    { title: 'Hosting a pool', value: 'role:host' },
  ],
  disambiguate: "Just so I don't guess, which one's closest?",
  confirmOne: "Just so I don't guess, is this what you mean?",
  somethingElse: 'Something else',
  // one question per message; "Talk to the founder" is the button, not a second question
  firstMiss: "Hmm, I don't want to guess on that one. Can you say it another way?",
  founderButton: { title: 'Talk to the founder', value: 'founder' },
  rephrase: 'No worries. Can you tell me a bit more, in your own words?',
  twoStrikes: "Good question. I don't want to guess on that, so I'll bring in Derek and Brandon.",
  askQuestion: "What's it about, so they don't have to ask you again?",
  askBookingRef: "What's your booking reference? No stress if you don't have it.",
  noRefButton: { title: "I don't have it", value: 'ref:none' },
  askBookingRefYesNo: "What's the booking reference? If there isn't one yet, just say so.",
  askReplyMethod: 'Want them to reply here in chat, or by email?',
  addedAskReply: "Got it, I'll add that. Want them to reply here in chat, or by email?",
  noTexts: 'Sorry, from here they can only reply in chat or by email. Which works for you?',
  replyButtons: [
    { title: 'Here in chat', value: 'reply:chat' },
    { title: 'By email', value: 'reply:email' },
  ],
  askEmail: "What's the best email for them to use?",
  emailInvalid: "Hmm, that doesn't look like an email. Mind checking it?",
  emailGiveUp: "No worries, they'll reply here in chat instead.",
  cardWarning:
    "Heads-up: that looked like a card number. Please don't share card details here. We'll never need your full card number in chat.",
  passwordWarning: "Heads-up: please don't share your password here. We'll never ask for it.",
  thanks: 'Anytime. Anything else I can help with?',
  ok: 'Cool. Anything else I can help with?',
  okCalm: 'Okay. Anything else I can help with?',
  noThanks: "All good. I'm here if you need anything else.",
  bye: 'Take care!',
  attachmentOnly: 'I can only read text here. What can I help with?',
  helloAgain: 'Hey! What can I help you with?',
  // flood caps (D3): only ever said after the label calls succeeded, and only what is true
  cappedAlready: "I've already flagged this for Derek and Brandon. They'll see everything here.",
  cappedAlreadyUrgent:
    "I've already flagged this for Derek and Brandon, and marked it urgent. They'll see everything here.",
  cappedLogged: "I've logged this for Derek and Brandon. It may take a bit longer than usual.",
  cappedLoggedUrgent:
    "I've logged this for Derek and Brandon and marked it urgent. It may take a bit longer than usual for them to see it.",
  // a message that might be an emergency, which the assistant could not place: ask before anything else
  safetyCheck: `${LINE_911} Is someone hurt or in danger right now?`,
  safetyButtons: [
    { title: 'Yes, someone needs help', value: 'safety:yes' },
    { title: "No, it's something else", value: 'safety:no' },
  ],
  // said only after the label and priority calls succeeded
  markedUrgent: "I've marked this urgent for Derek and Brandon.",
  // a button from an older message that no longer fits what we're doing
  staleTap: 'Can you tell me in your own words?',
  // a message in another language: no guessing, the founder is one tap away
  englishOnly: "Sorry, I can only read English here for now. You can write it in English, or talk to the founder.",
  // a message with several questions: the first is answered, the others are buttons (no second question mark)
  alsoAsked: 'You asked about this too:',
  // said once while the handoff waits for a person, to anything that isn't danger (no new alert)
  waitingAckSent: 'Got it. Derek and Brandon have this, and anything you add here goes to them.',
  waitingAckCapped: 'Got it. Anything you add here goes to Derek and Brandon.',
};

/** Shown only after every Chatwoot call of the handoff returned 2xx. */
function handoffConfirmed({ replyMethod, email, urgent, calm }) {
  const lead = calm || urgent ? '' : 'Cool. ';
  let s = urgent
    ? `${lead}I've sent Derek and Brandon the rundown and marked it urgent, so you don't have to explain everything again.`
    : `${lead}I've sent Derek and Brandon the rundown so you don't have to explain everything again.`;
  if (replyMethod === 'email' && email) s += ` They'll reply by email to ${email}.`;
  else
    s += urgent
      ? ' Anything you add here goes straight to them.'
      : " They'll reply right here in this chat.";
  return s;
}

/** Shown when a Chatwoot call failed. Honest, keeps the chat, offers email. */
function handoffFailed({ injury }) {
  const s = `Hmm, I couldn't get this over to Derek and Brandon just now, sorry about that. This chat stays open, and you can also email ${SUPPORT_EMAIL}.`;
  return injury ? `${LINE_911} ${s}` : s;
}

/** Calm, direct tone for upset customers and urgent topics: drop the playful openers. */
const PLAYFUL_OPENERS = [
  [/^Okay, cool, here's how (that|it) works\.\s*/, ''],
  [/^Okay, cool\.\s*/, ''],
  [/^Nice\.\s*/, ''],
  [/^Yep\.\s*/, ''],
  [/^Love that\.\s*/, ''],
  [/^Ugh, sorry\.\s*/, 'Sorry about that. '],
  [/^Ugh, that's annoying\.\s*/, 'Sorry about that. '],
  [/^Sorry, that's a bummer\.\s*/, 'Sorry about that. '],
  [/^Sure thing\.\s*/, ''],
  [/^Good call checking\.\s*/, ''],
  [/^Yeah, I've got you\.\s*/, ''],
  [/^Got it\.\s*/, ''],
];
function calm(text) {
  let s = text;
  for (const [re, rep] of PLAYFUL_OPENERS) s = s.replace(re, rep);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

module.exports = { COPY, SUPPORT_EMAIL, LINE_911, handoffConfirmed, handoffFailed, calm };
