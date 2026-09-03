/**
 * Regression guard for release c158, in which every session cookie silently
 * lost its `Secure` attribute because a `.env` file was not inside the Docker
 * image.
 *
 * Three layers, because the bug had three chances to be caught and none of them
 * existed:
 *
 *   1. the decision itself, across every environment permutation
 *   2. an HTTP-level assertion that the decision reaches a real Set-Cookie header
 *   3. a structural check that no call site bypasses the shared decision —
 *      this is the one that would have caught the half-finished c158 fix, which
 *      hardened two of seven call sites and left the social-sign-in session
 *      cookie reading the raw variable
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const { usingSSL, isProduction } = require('./secureCookies');

const ROOT = path.resolve(__dirname, '..', '..');

describe('usingSSL — the c158 decision', () => {
  it('is ON in production when the variable is absent entirely', () => {
    // This is the exact c158 condition: no .env in the image, so no variable.
    expect(usingSSL({ NODE_ENV: 'production' })).toBe(true);
    expect(usingSSL({ VITE_ENV: 'production' })).toBe(true);
  });

  it('is ON in production when the variable is present but empty', () => {
    // json2env.sh can emit KEY= for a null value; empty must not mean insecure.
    expect(usingSSL({ NODE_ENV: 'production', VITE_SHARETRIBE_USING_SSL: '' })).toBe(true);
  });

  it('honours an explicit true', () => {
    expect(usingSSL({ NODE_ENV: 'production', VITE_SHARETRIBE_USING_SSL: 'true' })).toBe(true);
    expect(usingSSL({ NODE_ENV: 'development', VITE_SHARETRIBE_USING_SSL: 'true' })).toBe(true);
  });

  it('honours an explicit false, so local HTTP development still works', () => {
    expect(usingSSL({ NODE_ENV: 'production', VITE_SHARETRIBE_USING_SSL: 'false' })).toBe(false);
    expect(usingSSL({ NODE_ENV: 'development', VITE_SHARETRIBE_USING_SSL: 'false' })).toBe(false);
  });

  it('is OFF in development when the variable is absent', () => {
    expect(usingSSL({ NODE_ENV: 'development' })).toBe(false);
    expect(usingSSL({})).toBe(false);
  });

  it('treats any non-"true" string as false only when explicitly set', () => {
    expect(usingSSL({ NODE_ENV: 'production', VITE_SHARETRIBE_USING_SSL: 'yes' })).toBe(false);
    expect(usingSSL({ NODE_ENV: 'production', VITE_SHARETRIBE_USING_SSL: 'TRUE' })).toBe(false);
  });

  it('detects production from either environment variable', () => {
    expect(isProduction({ NODE_ENV: 'production' })).toBe(true);
    expect(isProduction({ VITE_ENV: 'production' })).toBe(true);
    expect(isProduction({ NODE_ENV: 'development', VITE_ENV: 'development' })).toBe(false);
    expect(isProduction({})).toBe(false);
  });
});

describe('the decision reaches a real Set-Cookie header', () => {
  // No .env file, production environment: the c158 shape, asserted over HTTP.
  const serve = env =>
    new Promise(resolve => {
      const secure = usingSSL(env);
      const server = http.createServer((req, res) => {
        const parts = ['st-token=abc123', 'Path=/', 'HttpOnly', 'SameSite=Lax'];
        if (secure) parts.push('Secure');
        res.setHeader('Set-Cookie', parts.join('; '));
        res.end('ok');
      });
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address();
        http.get({ host: '127.0.0.1', port, path: '/' }, res => {
          const header = String(res.headers['set-cookie']);
          res.resume();
          server.close(() => resolve(header));
        });
      });
    });

  it('production without any .env still sets Secure, HttpOnly and SameSite', async () => {
    const header = await serve({ NODE_ENV: 'production' });
    expect(header).toContain('Secure');
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
  });

  it('development without SSL omits Secure but keeps HttpOnly', async () => {
    const header = await serve({ NODE_ENV: 'development' });
    expect(header).not.toContain('Secure');
    expect(header).toContain('HttpOnly');
  });

  it('a proxied production deployment that sets the flag explicitly keeps Secure', async () => {
    const header = await serve({ NODE_ENV: 'production', VITE_SHARETRIBE_USING_SSL: 'true' });
    expect(header).toContain('Secure');
  });
});

describe('no call site bypasses the shared decision', () => {
  // The c158 fix hardened src/config/settings.js and server/api-util/sdk.js and
  // missed five other files, including the two that set the session cookie for
  // every social sign-in. This test fails if that ever happens again.
  const walk = (dir, out = []) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (/\.jsx?$/.test(entry.name)) out.push(full);
    }
    return out;
  };

  it('only secureCookies.js reads VITE_SHARETRIBE_USING_SSL on the server', () => {
    const offenders = walk(path.join(ROOT, 'server'))
      .filter(f => !f.endsWith('secureCookies.js') && !f.endsWith('secureCookies.test.js'))
      .filter(f => fs.readFileSync(f, 'utf8').includes('VITE_SHARETRIBE_USING_SSL'))
      .map(f => path.relative(ROOT, f));

    expect(offenders).toEqual([]);
  });

  it('every server cookie marked secure uses the shared helper', () => {
    // Any file passing `secure:` to a cookie/token store must import the helper.
    const suspects = walk(path.join(ROOT, 'server'))
      .filter(f => !f.endsWith('secureCookies.js') && !f.endsWith('secureCookies.test.js'))
      .map(f => ({ file: path.relative(ROOT, f), text: fs.readFileSync(f, 'utf8') }))
      .filter(({ text }) => /secure:\s*USING_SSL/.test(text))
      .filter(({ text }) => !text.includes("require('./secureCookies')") && !text.includes("require('../api-util/secureCookies')") && !text.includes("require('../../api-util/secureCookies')"))
      .map(({ file }) => file);

    expect(suspects).toEqual([]);
  });
});
