// Affirmative SMS marketing consent, as captured at signup into
// protectedData.smsConsentMarketing (AuthenticationPage, 'signup-form-v1').
//
// Why this module exists: the field was being written on every signup and
// read by nothing. Opt-out (STOP) was enforced, but the box a host ticked —
// or deliberately left unticked — never reached a send path, so unticking it
// did nothing at all.
//
// Three states, not two. An absent field is not a yes, but it is not a
// recorded no either, so it gets its own state and its own policy knob.
// Collapsing 'unknown' into either answer is how a blast either silently drops
// hosts who did consent, or texts hosts who never did.
//
// Who is actually in 'unknown': NOT just accounts that predate the checkbox.
// The checkbox lives on SignupForm (email/password) only. The IdP path —
// handleSubmitConfirm + ConfirmSignupForm, i.e. every Google and Facebook
// signup — collects a phone number but writes no consent keys at all. So the
// unknown bucket does not drain over time; it grows with every social signup.
// That makes SMS_MARKETING_UNKNOWN_POLICY=allow a decision to text a
// population that was never asked, not a backfill for old accounts. Adding
// the checkbox to ConfirmSignupForm is the actual fix, and is not done here.
//
// The policy knob governs ONLY the unknown state. A recorded 'denied' is
// never overridable by configuration.

const GRANTED = 'granted';
const DENIED = 'denied';
const UNKNOWN = 'unknown';

const POLICY_BLOCK = 'block';
const POLICY_ALLOW = 'allow';

/**
 * Classify one user's marketing consent from an Integration API user resource.
 *
 * Note the caller must have requested `profile.protectedData` in its
 * `fields.user` sparse fieldset. If it did not, protectedData is absent from
 * the response and every user reads as UNKNOWN — which, under the default
 * block policy, fails closed rather than blasting everyone.
 */
const marketingConsentState = user => {
  const pd = user && user.attributes && user.attributes.profile
    ? user.attributes.profile.protectedData
    : null;
  if (!pd || !Object.prototype.hasOwnProperty.call(pd, 'smsConsentMarketing')) {
    return UNKNOWN;
  }
  const value = pd.smsConsentMarketing;
  if (value === true) return GRANTED;
  if (value === false) return DENIED;
  // Anything non-boolean is a malformed record, not an answer.
  return UNKNOWN;
};

/**
 * How to treat accounts with no recorded answer. Defaults to blocking them.
 * Set SMS_MARKETING_UNKNOWN_POLICY=allow to include legacy accounts, and only
 * with an explicit decision behind it — that flag is the difference between
 * texting and not texting every host who signed up before the checkbox.
 */
const unknownPolicy = (env = process.env) =>
  env.SMS_MARKETING_UNKNOWN_POLICY === POLICY_ALLOW ? POLICY_ALLOW : POLICY_BLOCK;

/**
 * May we send a MARKETING message to a user in this consent state?
 * Transactional/service messages do not go through here — they are governed by
 * smsConsentService and by opt-out, which is checked separately and always.
 */
const isMarketingAllowed = (state, policy) => {
  if (state === GRANTED) return true;
  if (state === DENIED) return false;
  return policy === POLICY_ALLOW;
};

/**
 * Merge two consent states for the same recipient (two accounts, one phone).
 * Most restrictive wins: a recorded DENIED outranks everything, and UNKNOWN
 * outranks GRANTED, so a shared number is never texted on the strength of
 * whichever account happened to be paged first.
 */
const mostRestrictive = (a, b) => {
  if (a === DENIED || b === DENIED) return DENIED;
  if (a === UNKNOWN || b === UNKNOWN) return UNKNOWN;
  return GRANTED;
};

module.exports = {
  GRANTED,
  DENIED,
  UNKNOWN,
  mostRestrictive,
  POLICY_BLOCK,
  POLICY_ALLOW,
  marketingConsentState,
  unknownPolicy,
  isMarketingAllowed,
};
