/**
 * Canonical resolution for Sharetribe credentials.
 *
 * WHY THIS EXISTS
 *
 * The same two Integration API credentials are injected under different names
 * depending on the host:
 *
 *   WEST (marketplace)  SHARETRIBE_INTEGRATION_SDK_CLIENT_ID / _SECRET
 *   EAST (fresh-web)    SHARETRIBE_INTEG_CLIENT_ID          / _SECRET
 *
 * `scripts/check-env.js` and `server/startupEnvCheck.js` both already knew
 * about that aliasing. `server/api-util/integration.js` did not — it read only
 * the WEST spelling, so on a host that injects the EAST spelling the SDK
 * instance silently resolved to `null` and every Integration API call became a
 * no-op with no startup error. This module is the single place that mapping
 * lives, so the three call sites cannot drift apart again.
 *
 * A third pair, SHARETRIBE_INTEGRATION_CLIENT_ID / _SECRET, appears in
 * `.env-template` and is read by nothing. It is accepted here as a last-resort
 * alias rather than left as a trap for whoever copies that template.
 *
 * NOTHING IN HERE LOGS A VALUE. Callers get the credential or a description of
 * what is missing — never the secret itself, not even truncated.
 */

/** Canonical name -> accepted aliases, most-preferred first. */
const ALIASES = {
  SHARETRIBE_INTEGRATION_SDK_CLIENT_ID: [
    'SHARETRIBE_INTEG_CLIENT_ID',
    'SHARETRIBE_INTEGRATION_CLIENT_ID',
  ],
  SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET: [
    'SHARETRIBE_INTEG_CLIENT_SECRET',
    'SHARETRIBE_INTEGRATION_CLIENT_SECRET',
  ],
};

/**
 * Resolve one canonical variable, falling back through its aliases.
 * @returns {{ value: string|null, source: string|null, canonical: string }}
 */
const resolveOne = (canonical, env = process.env) => {
  const candidates = [canonical, ...(ALIASES[canonical] || [])];
  for (const name of candidates) {
    const raw = env[name];
    if (typeof raw === 'string' && raw.trim() !== '') {
      return { value: raw.trim(), source: name, canonical };
    }
  }
  return { value: null, source: null, canonical };
};

/**
 * The Integration API pair.
 * @returns {{ clientId: string|null, clientSecret: string|null,
 *             ok: boolean, sources: object, missing: string[] }}
 */
const integrationCredentials = (env = process.env) => {
  const id = resolveOne('SHARETRIBE_INTEGRATION_SDK_CLIENT_ID', env);
  const secret = resolveOne('SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET', env);
  const missing = [id, secret].filter(r => !r.value).map(r => r.canonical);
  return {
    clientId: id.value,
    clientSecret: secret.value,
    ok: missing.length === 0,
    // Which variable NAME each value came from. Names only — never values.
    sources: { clientId: id.source, clientSecret: secret.source },
    missing,
  };
};

/**
 * A one-line, value-free description for logs and health output.
 * e.g. "Sharetribe Integration: resolved (id<-SHARETRIBE_INTEG_CLIENT_ID, secret<-SHARETRIBE_INTEG_CLIENT_SECRET)"
 */
const describeIntegrationCredentials = (env = process.env) => {
  const c = integrationCredentials(env);
  if (!c.ok) {
    return `Sharetribe Integration: MISSING ${c.missing.join(', ')} (accepted aliases: ${c.missing
      .map(m => (ALIASES[m] || []).join('/'))
      .join('; ')})`;
  }
  const alias = c.sources.clientId !== 'SHARETRIBE_INTEGRATION_SDK_CLIENT_ID' ? ' [via alias]' : '';
  return `Sharetribe Integration: resolved (id<-${c.sources.clientId}, secret<-${c.sources.clientSecret})${alias}`;
};

module.exports = { ALIASES, resolveOne, integrationCredentials, describeIntegrationCredentials };
