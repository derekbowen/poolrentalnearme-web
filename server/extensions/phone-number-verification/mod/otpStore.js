const crypto = require('crypto');

// Pending phone-verification challenges, keyed by email.
//
// This route is intentionally unauthenticated: the mobile app calls it during
// signup, before any session exists. Gating it behind a login is what took the
// app offline on 2026-06-18 — every request 401'd because a native client has
// no browser cookie to present.
//
// The security property that matters is preserved a different way. The original
// implementation derived the code from the caller's own email
// (totp.generate(email)), so anyone who knew an email address could compute a
// valid code offline and skip phone verification entirely. Here the code is
// server-generated, random, short-lived, and attempt-capped, so knowing the
// email tells an attacker nothing.
//
// Held in process on purpose: a challenge lives ten minutes, so a redeploy
// costs a user one re-request at worst. That is a better trade than writing a
// challenge onto a Sharetribe user record that a caller merely claims to own.

const TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_ENTRIES = 10000;

// Per-number send cap. The route is open, so this is what bounds using us as an
// SMS cannon at a single victim's phone.
const SEND_WINDOW_MS = 60 * 60 * 1000;
const MAX_SENDS_PER_NUMBER = 5;

const pending = new Map();
const sendHistory = new Map();

const normaliseEmail = (email) => String(email || '').trim().toLowerCase();

const sweep = () => {
  const now = Date.now();
  for (const [key, entry] of pending) {
    if (entry.expiresAt <= now) {
      pending.delete(key);
    }
  }
  for (const [number, timestamps] of sendHistory) {
    const recent = timestamps.filter((at) => now - at < SEND_WINDOW_MS);
    if (recent.length) {
      sendHistory.set(number, recent);
    } else {
      sendHistory.delete(number);
    }
  }
  // Oldest-first eviction so a flood of new emails cannot grow the map without
  // bound between sweeps.
  while (pending.size > MAX_ENTRIES) {
    pending.delete(pending.keys().next().value);
  }
};

const withinSendLimit = (phoneNumber) => {
  const now = Date.now();
  const timestamps = (sendHistory.get(phoneNumber) || []).filter(
    (at) => now - at < SEND_WINDOW_MS
  );
  if (timestamps.length >= MAX_SENDS_PER_NUMBER) {
    sendHistory.set(phoneNumber, timestamps);
    return false;
  }
  timestamps.push(now);
  sendHistory.set(phoneNumber, timestamps);
  return true;
};

// Returns the code to text, or null if this number has been sent too many
// recently. Callers must treat null as "do not send".
const issue = ({ email, phoneNumber }) => {
  sweep();
  if (!withinSendLimit(phoneNumber)) {
    return null;
  }
  const otp = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  pending.set(normaliseEmail(email), {
    otp,
    phoneNumber,
    expiresAt: Date.now() + TTL_MS,
    attempts: 0,
  });
  return otp;
};

const consume = ({ email, otp }) => {
  sweep();
  const key = normaliseEmail(email);
  const entry = pending.get(key);
  if (!entry) {
    return false;
  }
  if (entry.attempts >= MAX_ATTEMPTS) {
    pending.delete(key);
    return false;
  }
  entry.attempts += 1;

  const supplied = Buffer.from(String(otp || ''));
  const expected = Buffer.from(entry.otp);
  const matches =
    supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);

  if (matches) {
    pending.delete(key);
  }
  return matches;
};

module.exports = { issue, consume, TTL_MS, MAX_ATTEMPTS, MAX_SENDS_PER_NUMBER };
