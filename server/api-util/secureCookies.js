/**
 * The one place that decides whether cookies get the `Secure` attribute.
 *
 * WHY THIS EXISTS
 *
 * Release c158 aborted because `Secure` disappeared from session cookies. The
 * mechanism, traced from the code rather than remembered:
 *
 *   1. `VITE_SHARETRIBE_USING_SSL` was read as `x === 'true'` in seven places.
 *   2. Vite reads `.env` off disk at build time (`vite.config.mjs:13`,
 *      `loadEnv(mode, process.cwd())`), and bun auto-loads `.env` from the
 *      working directory at run time. The app's own loader, `server/env.js`,
 *      is imported by `server/apiServer.js` only — never by `index-prod.js` —
 *      so production has never called it.
 *   3. So the flag's value depended entirely on a `.env` FILE being present,
 *      first in the Docker build context and then inside the image.
 *   4. Remove the file and `undefined === 'true'` is `false`. Not an error, not
 *      a warning: every session cookie silently loses `Secure`.
 *
 * A later fix hardened exactly two call sites — `src/config/settings.js` and
 * `server/api-util/sdk.js` — to fall back to "on in production". The other five
 * kept the bare comparison, including `createUserWithIdp.js` and
 * `loginWithIdp.js`, which set the session token cookie for every Google,
 * Facebook and Apple sign-in. Half-fixed is how this comes back.
 *
 * THE RULE
 *
 * Cookie security is a property of the deployment, not of whether a file
 * happened to get copied into an image. In production, `Secure` is on. An
 * explicit environment variable can still override it — that is what local
 * HTTPS-less development needs — but absence never means "insecure".
 *
 *   explicit value set  -> honour it exactly
 *   otherwise, production -> true
 *   otherwise             -> false
 *
 * Production is detected from NODE_ENV or VITE_ENV. Both are set by
 * `package.json`'s start script, so neither depends on a file existing.
 */

const TRUE = 'true';

/**
 * Is this process running as production?
 *
 * @param {Object} env process.env-like
 * @returns {boolean}
 */
const isProduction = (env = process.env) =>
  env.NODE_ENV === 'production' || env.VITE_ENV === 'production';

/**
 * Should cookies carry the `Secure` attribute?
 *
 * @param {Object} env process.env-like
 * @returns {boolean}
 */
const usingSSL = (env = process.env) => {
  const raw = env.VITE_SHARETRIBE_USING_SSL;
  const explicitlySet = raw != null && raw !== '';
  if (explicitlySet) {
    return raw === TRUE;
  }
  // Absent. Never fall back to insecure in production.
  return isProduction(env);
};

module.exports = { usingSSL, isProduction };
