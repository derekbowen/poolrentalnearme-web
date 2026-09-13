/**
 * Integration API credential resolution.
 *
 * Credentials have accumulated three spellings across our boxes:
 *
 *   SHARETRIBE_INTEGRATION_SDK_CLIENT_ID/_SECRET  WEST (what integration.js has always read)
 *   SHARETRIBE_INTEGRATION_CLIENT_ID/_SECRET      what .env-template has always shipped
 *   SHARETRIBE_INTEG_CLIENT_ID/_SECRET            EAST (fresh-web)
 *
 * Only the first worked, so a box provisioned from .env-template got a null SDK
 * with no signal — promo codes 500, iCal reports {enabled:false}, the SMS poller
 * stalls, wishlist writes fail. All three are accepted now, WEST's spelling first
 * so production resolution is byte-for-byte unchanged.
 *
 * Kept separate from integration.js so it is testable without instantiating the
 * SDK (integration.js exports the instance itself, so it has no room for named
 * exports).
 */

// Precedence order. Do not reorder: the first entry is what WEST production sets.
const ID_VARS = [
  'SHARETRIBE_INTEGRATION_SDK_CLIENT_ID',
  'SHARETRIBE_INTEGRATION_CLIENT_ID',
  'SHARETRIBE_INTEG_CLIENT_ID',
];

const SECRET_VARS = [
  'SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET',
  'SHARETRIBE_INTEGRATION_CLIENT_SECRET',
  'SHARETRIBE_INTEG_CLIENT_SECRET',
];

// First name holding a non-empty value, so an empty var can't shadow a set one.
const pick = (names, env) => {
  for (const name of names) {
    const value = env[name];
    if (typeof value === 'string' && value.trim() !== '') {
      return { name, value };
    }
  }
  return { name: null, value: undefined };
};

const prefixOf = (name) => (name ? name.replace(/_CLIENT_(ID|SECRET)$/, '') : null);

/**
 * @param {Object} [env] defaults to process.env
 * @returns {{
 *   clientId: string|undefined,
 *   clientSecret: string|undefined,
 *   idVar: string|null,
 *   secretVar: string|null,
 *   configured: boolean,
 *   mismatchedPrefix: boolean,
 *   missing: string[],
 * }}
 */
const resolveIntegrationCredentials = (env = process.env) => {
  const id = pick(ID_VARS, env);
  const secret = pick(SECRET_VARS, env);

  const missing = [];
  if (!id.value) missing.push('client id');
  if (!secret.value) missing.push('client secret');

  const configured = missing.length === 0;

  return {
    clientId: id.value,
    clientSecret: secret.value,
    idVar: id.name,
    secretVar: secret.name,
    configured,
    // Only meaningful when both are present: an id from one spelling paired with
    // a secret from another is almost always a half-finished rename.
    mismatchedPrefix: configured && prefixOf(id.name) !== prefixOf(secret.name),
    missing,
  };
};

module.exports = { resolveIntegrationCredentials, ID_VARS, SECRET_VARS };
