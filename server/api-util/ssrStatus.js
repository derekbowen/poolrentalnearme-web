/**
 * Deciding the SSR HTTP status for a route miss.
 *
 * c194: every unknown URL returned HTTP 200. `server/renderer.js` initialises
 * `status = 200` and only ever raises it to 500 on a shell error, so a
 * not-found page was served with a success status — a soft 404. Those pages do
 * carry `noindex, nofollow`, so they are not being indexed, but a 200 still
 * tells crawlers and monitoring that a missing page is fine, and a genuinely
 * removed page never signals that it is gone.
 *
 * The obvious fix — read `context.statusCode` from the React Router static
 * handler — does not work here. `src/routing/routeConfiguration.js` registers a
 * catch-all `{ path: '*', name: 'NotFoundPage' }`, so `matches` is never null
 * and @remix-run/router never produces its own 404. The reliable signal is the
 * NAME of the matched leaf route, which survives onto `context.matches` because
 * `convertRoutesToDataRoutes` spreads the original route object.
 *
 * Lives here, in CommonJS, so it is covered by `yarn test-server` — the `src/`
 * jest path cannot execute ESM in this repo.
 */

/** Route name used for the catch-all / not-found route. */
const NOT_FOUND_ROUTE_NAME = 'NotFoundPage';

/**
 * Is this static-handler context a genuine route miss?
 *
 * @param {Object} context result of the router's `query()` call
 * @returns {boolean} true when the matched leaf route is the not-found route
 */
const isNotFoundContext = context => {
  if (!context || typeof context !== 'object') {
    return false;
  }
  // A loader redirect yields a Response, which carries its own status.
  if (typeof Response !== 'undefined' && context instanceof Response) {
    return false;
  }
  if (context.statusCode === 404) {
    return true;
  }
  const matches = Array.isArray(context.matches) ? context.matches : [];
  if (matches.length === 0) {
    return true;
  }
  const leaf = matches[matches.length - 1];
  return !!(leaf && leaf.route && leaf.route.name === NOT_FOUND_ROUTE_NAME);
};

/**
 * The status a rendered response should carry.
 *
 * A shell error is a real server failure and outranks a route miss, so a 500
 * is never downgraded to 404.
 *
 * @param {number} current status decided so far
 * @param {boolean} notFound whether the route was a miss
 * @returns {number}
 */
const resolveRenderStatus = (current, notFound) => {
  if (current !== 200) {
    return current;
  }
  return notFound ? 404 : 200;
};

/**
 * Did this request end up on a not-found page by EITHER channel?
 *
 * Channel 1 (c194): the router itself missed — entry-server sets
 * `locals.ssrNotFound` after matching.
 * Channel 2: a route matched but the page rendered <NotFoundPage> anyway
 * (listing id that no longer resolves, CMS page id with no asset, path that
 * React Router matched case-insensitively). NotFoundPage flips
 * `locals.ssrSignal.notFound` during render.
 *
 * Read this only after the shell has rendered — channel 2 is set during
 * render, not before it.
 *
 * @param {Object} locals express res.locals
 * @returns {boolean}
 */
const isNotFoundLocals = locals => {
  if (!locals || typeof locals !== 'object') {
    return false;
  }
  if (locals.ssrNotFound === true || locals.ssrMalformed === true) {
    return true;
  }
  const signal = locals.ssrSignal;
  return !!(signal && typeof signal === 'object' && signal.notFound === true);
};

/**
 * The one canonical spelling of a request path: lowercase, single slashes,
 * no trailing slash (the root stays "/"). The query string is not part of
 * this — search parameters such as `?address=Lancaster, PA` are case-
 * significant and are carried over untouched by resolveCanonicalRedirect.
 *
 * Every public marketplace path is lowercase by construction (Sharetribe
 * slugs, UUIDs, CMS page ids, /go/<slug>-<uuid8>), so an uppercase letter or
 * a trailing slash is always an alternate spelling of a real URL, never a
 * distinct page.
 *
 * @param {string} pathname
 * @returns {string}
 */
const canonicalPath = pathname => {
  if (typeof pathname !== 'string' || pathname === '') {
    return '/';
  }
  let p = pathname.replace(/\/{2,}/g, '/').toLowerCase();
  if (p.length > 1) {
    p = p.replace(/\/+$/, '');
  }
  if (!p.startsWith('/')) {
    p = '/' + p;
  }
  return p || '/';
};

/**
 * Should this request be answered with one 301 to its canonical spelling?
 *
 * The rule (2026-09-02): a recognised URL in an alternate form — wrong
 * capitalisation, trailing slash, doubled slash — gets a single 301 to the
 * lowercase canonical. A genuinely unknown slug gets a 404 and never a hop,
 * so this is decided AFTER the shell rendered: only a page that actually
 * rendered (not NotFoundPage) is worth redirecting to. `/P/How-It-Works`
 * therefore 301s to `/p/how-it-works`, while `/P/No-Such-Page` is a 404.
 *
 * Only GET/HEAD are redirected; a POST to an odd spelling is left alone.
 *
 * @param {Object} req  express request (method, path, originalUrl) or { method, path, search }
 * @param {boolean} notFound whether the render ended on NotFoundPage
 * @returns {string|null} redirect target (path + original query) or null
 */
const resolveCanonicalRedirect = (req, notFound) => {
  if (!req || typeof req !== 'object') {
    return null;
  }
  const method = typeof req.method === 'string' ? req.method.toUpperCase() : 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    return null;
  }
  if (notFound) {
    return null;
  }
  const path = typeof req.path === 'string' ? req.path : '';
  const canonical = canonicalPath(path);
  if (canonical === path) {
    return null;
  }
  // express has no req.search; the raw query lives on originalUrl / url.
  let search = typeof req.search === 'string' ? req.search : '';
  if (!search) {
    const raw = typeof req.originalUrl === 'string' ? req.originalUrl : req.url;
    const q = typeof raw === 'string' ? raw.indexOf('?') : -1;
    search = q >= 0 ? raw.slice(q) : '';
  }
  return canonical + search;
};

/**
 * Entity routes whose id segment cannot possibly resolve.
 *
 * `/l/:slug/:id[/…]` and `/u/:id[/…]` take a Sharetribe UUID. When the id
 * segment is not one — `/l/some-pool/abc`, the double-prefix
 * `/l/l/some-pool/abc` (slug "l", id "some-pool"), `/u/abc` — the page
 * renders a permanent loading shell (the SDK call never returns a listing, so
 * NotFoundPage is never reached) and used to answer 200. There is nothing to
 * fetch: treat it as not found before rendering.
 *
 * `/l/new` and `/l/draft/<uuid>/new/details` are left alone (no id segment /
 * a real UUID), as is everything outside these two prefixes.
 *
 * @param {string} pathname
 * @returns {boolean}
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isMalformedEntityPath = pathname => {
  if (typeof pathname !== 'string') {
    return false;
  }
  const seg = pathname.split('/').filter(Boolean);
  if (seg.length < 2) {
    return false;
  }
  const [prefix] = seg;
  if (prefix.toLowerCase() === 'l') {
    // /l/new has no id; /l/<slug>/<id>… must carry a UUID in position 3.
    if (seg.length === 2) {
      return false;
    }
    return !UUID_RE.test(seg[2]);
  }
  if (prefix.toLowerCase() === 'u') {
    return !UUID_RE.test(seg[1]);
  }
  return false;
};

module.exports = {
  NOT_FOUND_ROUTE_NAME,
  canonicalPath,
  isMalformedEntityPath,
  resolveCanonicalRedirect,
  isNotFoundContext,
  isNotFoundLocals,
  resolveRenderStatus,
};
