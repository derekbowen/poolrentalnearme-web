# Why release c158 lost `Secure` from session cookies

**Traced from code and configuration, not recalled.** Every claim below cites a file and line.

**Answer in one sentence:** cookie security was derived from a string comparison against an
environment variable that only ever existed because a `.env` **file** was physically present —
first in the Docker build context, then inside the image — so deleting the file turned
`undefined === 'true'` into `false` and silently dropped `Secure` from every session cookie.

---

## The chain

**1. The value is read as a bare equality.**

Seven places read it. Before this change, five of them looked like
`server/api-util/rootURL.js:2`:

```js
const USING_SSL = process.env.VITE_SHARETRIBE_USING_SSL === 'true';
```

`undefined === 'true'` is `false`. No error, no warning, no log line.

**2. That value is the cookie's `secure` flag, directly.**

`server/api/auth/loginWithIdp.js:73` and `createUserWithIdp.js:33` — the session token store
for **every Google, Facebook and Apple sign-in**:

```js
const tokenStore = sharetribeSdk.tokenStore.expressCookieStore({
  clientId: CLIENT_ID, req, res,
  secure: USING_SSL,
});
```

Also `server/api-util/sdk.js:61,109` (the main session store), `initiate-login-as.js:65`, and
`login-as.js:39-42`. Client side: `src/entry-server.jsx:73,79` and `src/entry-client.jsx:148`
via `appSettings.usingSSL`.

**3. Nothing in production ever loaded a `.env` deliberately.**

`server/env.js` implements dotenv loading — and `configureEnv()` is imported by exactly one
file, `server/apiServer.js:5`, the **development** API server. `server/index-prod.js` never
calls it. Production has never used the application's own env loader.

**4. So where did the variable come from? Two accidents.**

- **Build time.** `vite.config.mjs:13` calls `loadEnv(mode, process.cwd())`. Vite populates
  `import.meta.env.VITE_*` **only from `.env` files**. This config never calls `define()` for
  them, so `process.env` and `--build-arg` do not reach the client bundle at all. In the
  Dockerfile, `COPY . .` pulled `.env` into the build stage — `.dockerignore` contained only
  three `awscliv2` entries and did not exclude it.
- **Run time.** `CMD ["bun", "run", "start"]`, and bun automatically loads a `.env` from the
  working directory. `Dockerfile:24` was `COPY .env .env`, so the file was there.

Both halves of the application therefore depended on a file nobody had deliberately wired in.

**5. Remove the file and the flag evaluates false, everywhere, silently.** That is c158.

---

## Why the first fix was not enough

A later change introduced a three-state read — explicit value, else default to production — in
**two** places: `src/config/settings.js:36-39` (falling back to `import.meta.env.PROD`) and
`server/api-util/sdk.js:10-12` (falling back to `NODE_ENV === 'production'`).

The other five call sites kept the bare comparison. Among them were the two that set the
session cookie for social sign-in. So until this change, **a missing variable still dropped
`Secure` from every Google/Facebook/Apple session** while the main session store was protected.
The fix looked complete because the release stopped failing.

---

## What changed now

`server/api-util/secureCookies.js` is the single decision, and every server call site imports
it. The rule is explicit:

```
explicit value set     -> honour it exactly (local HTTP development still works)
otherwise, production  -> true
otherwise              -> false
```

Production is detected from `NODE_ENV` or `VITE_ENV`, both set by the `start` script in
`package.json`, neither dependent on a file existing.

`src/config/settings.js` keeps its own copy because it is client code reading
`import.meta.env`; it already implements the same rule with `import.meta.env.PROD` as the
production signal.

### Tests that make this un-repeatable

`server/api-util/secureCookies.test.js`, 12 tests in three layers:

1. **The decision**, across every permutation — absent, empty string, explicit `true`/`false`,
   an unexpected value, production and development. The first case is literally the c158
   condition: production, no variable at all, expect `true`.
2. **The HTTP layer** — boots a real server, asserts the `Set-Cookie` header contains
   `Secure`, `HttpOnly` and `SameSite=Lax` under production-without-`.env`, and that
   development omits `Secure` while keeping `HttpOnly`.
3. **The structure** — asserts that no file under `server/` other than the helper reads
   `VITE_SHARETRIBE_USING_SSL`, and that anything passing `secure: USING_SSL` imports the
   helper. *This is the layer that would have caught the half-finished fix.*

The cookie test runs in the production release workflow before the deploy step.

---

## Related: `trust proxy`

`server/express-config.js:46-51` sets `trust proxy` from `SERVER_SHARETRIBE_TRUST_PROXY`
(`server/config/server.js:15`), defaulting to `null` — meaning express's default of *not*
trusting proxies. Behind nginx, `req.secure` and `req.protocol` therefore reflect the internal
hop, not the client's HTTPS.

This did **not** cause c158: the cookie flag is set from the environment variable, not from
`req.secure`, so proxy trust never entered that path. It is worth setting deliberately anyway —
anything that later reasons about `req.protocol` (redirects, absolute URL construction, rate
limiting by IP) is affected. Flagged, not changed, because altering proxy trust changes
`req.ip` for the rate limiters in `generate-listing.js`, `lead-capture.js` and `ical-feed.js`
and deserves its own test.
