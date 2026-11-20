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
 * is never downgraded to 404. A miss outranks "temporarily unavailable": a URL
 * that can never resolve is a 404 even if a fetch for it also failed.
 *
 * @param {number} current status decided so far
 * @param {boolean} notFound whether the route was a miss
 * @param {boolean} [unavailable] whether the page rendered a temporary
 *   load-failure view (see isUnavailableLocals)
 * @returns {number}
 */
const resolveRenderStatus = (current, notFound, unavailable = false) => {
  if (current !== 200) {
    return current;
  }
  if (notFound) {
    return 404;
  }
  return unavailable === true ? 503 : 200;
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
 * Did this request render a "temporarily unavailable" view?
 *
 * Third signal, same per-request object as channel 2. A listing whose fetch
 * failed for a reason that says nothing about the listing itself (API 5xx,
 * 429, network error, timeout, anything unrecognised) renders the friendly
 * error page and flips `locals.ssrSignal.unavailable`. That used to go out as
 * HTTP 200 with `index, follow` and the title "Error in loading the listing"
 * — a page a crawler could index in place of a healthy listing. It now goes
 * out as 503 with UNAVAILABLE_HEADERS, which tells a crawler to keep what it
 * has and come back.
 *
 * Read this only after the shell has rendered, like isNotFoundLocals.
 *
 * @param {Object} locals express res.locals
 * @returns {boolean}
 */
const isUnavailableLocals = (locals) => {
  if (!locals || typeof locals !== 'object') {
    return false;
  }
  const signal = locals.ssrSignal;
  return !!(signal && typeof signal === 'object' && signal.unavailable === true);
};

/**
 * Headers for a 503 render. Retry-After asks crawlers to come back in two
 * minutes; no-store keeps the edge and browsers from holding on to an error
 * page; noindex is the belt to the status code's braces.
 */
const UNAVAILABLE_HEADERS = Object.freeze({
  'Retry-After': '120',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex',
});

/**
 * Why did a listing fetch fail: is the listing not there for this viewer, or
 * did the fetch itself break?
 *
 * LISTING_LOAD_NOT_FOUND — answer 404, render NotFoundPage:
 *   - 404: the API has no such listing (the pre-existing rule).
 *   - 410: gone, by the definition of the status.
 *   - 400 whose API error is `validation-invalid-value` on the `id` query
 *     parameter: the id in the URL is not a UUID, so no retry can ever succeed.
 *     Observed live on 2026-11-15 for all six `/l/<city-slug>` URLs linked
 *     from /p/ pages (/l/fargo-nd and friends).
 *   - 403 that carries the Marketplace API error code `forbidden`: the API
 *     refuses to show this listing to this viewer. NOT observed live; taken
 *     from the template's own handling (a 403 from the listing endpoints means
 *     "not yours to see": a draft or pending-approval listing opened by
 *     someone other than its author). See
 *     docs/OPS_RECORD_2026-11-15_seo-status-codes.md — this is the one rule an
 *     owner may want to flip to "unavailable".
 *     A 403 WITHOUT that code (no API error body: an edge, a WAF, a suspended
 *     client credential, a plan limit) says nothing about the listing and
 *     would otherwise 404 every listing at once. It is "unavailable".
 *
 * LISTING_LOAD_UNAVAILABLE — answer 503, render the friendly error page:
 *   everything else. 5xx, 429, 401, a 403 with no `forbidden` API error, a
 *   400 that is not about the id (a request
 *   this app built wrongly is this app's fault, not the listing's), and an
 *   error with no status at all (network failure, timeout). Unknown means
 *   "try again", never "gone": a wrong 503 costs a retry, a wrong 404 costs
 *   the page its place in the index.
 *
 * Works on the stored error shape (src/util/errors.js storableError):
 * `{ status, apiErrors: [{ code, source: { path } }] }`.
 *
 * @param {Object} error stored showListingError
 * @returns {string|null} one of the two constants, or null when there is no error
 */
const LISTING_LOAD_NOT_FOUND = 'not-found';
const LISTING_LOAD_UNAVAILABLE = 'unavailable';

const isInvalidListingIdError = (error) => {
  const apiErrors = error && Array.isArray(error.apiErrors) ? error.apiErrors : [];
  return apiErrors.some((apiError) => {
    const path = apiError && apiError.source ? apiError.source.path : null;
    return (
      !!apiError &&
      apiError.code === 'validation-invalid-value' &&
      Array.isArray(path) &&
      path.includes('id')
    );
  });
};

const isApiForbiddenError = (error) => {
  const apiErrors = error && Array.isArray(error.apiErrors) ? error.apiErrors : [];
  return apiErrors.some((apiError) => !!apiError && apiError.code === 'forbidden');
};

const classifyListingLoadError = (error) => {
  if (!error || typeof error !== 'object') {
    return null;
  }
  const { status } = error;
  if (status === 404 || status === 410) {
    return LISTING_LOAD_NOT_FOUND;
  }
  // Only the Marketplace API's own "forbidden" answer is about the listing.
  if (status === 403 && isApiForbiddenError(error)) {
    return LISTING_LOAD_NOT_FOUND;
  }
  if (status === 400 && isInvalidListingIdError(error)) {
    return LISTING_LOAD_NOT_FOUND;
  }
  return LISTING_LOAD_UNAVAILABLE;
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
 * Should a rendered listing be answered with one 301 to its canonical path?
 *
 * A listing is reachable as /l/<id>, /l/<any slug>/<id> and — after a title
 * edit — its old slug. All render the same page. The listing page declares
 * its one public path, /l/<createSlug(title)>/<id>, on the per-request SSR
 * signal while rendering; any other spelling gets a single 301 there, query
 * kept (?ref attribution survives). The target is built from the listing's
 * own title, so it renders the same listing and declares the same path: no
 * second hop and no loop.
 *
 * Only GET/HEAD, only a page that actually rendered (not NotFoundPage), and
 * only a declared path of the exact /l/<slug>/<uuid> shape.
 *
 * @param {Object} req express request (method, path, originalUrl)
 * @param {Object} signal per-request SSR signal (res.locals.ssrSignal)
 * @param {boolean} notFound whether the render ended on NotFoundPage
 * @returns {string|null} redirect target (canonical path + original query) or null
 */
const LISTING_CANONICAL_RE = new RegExp(
  '^/l/[a-z0-9_-]+/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
);
const resolveListingRedirect = (req, signal, notFound) => {
  if (!req || typeof req !== 'object' || notFound) {
    return null;
  }
  const method = typeof req.method === 'string' ? req.method.toUpperCase() : 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    return null;
  }
  const target = signal && typeof signal === 'object' ? signal.canonicalPath : null;
  if (typeof target !== 'string' || !LISTING_CANONICAL_RE.test(target)) {
    return null;
  }
  const path = typeof req.path === 'string' ? req.path : '';
  if (path === target) {
    return null;
  }
  const raw = typeof req.originalUrl === 'string' ? req.originalUrl : req.url;
  const q = typeof raw === 'string' ? raw.indexOf('?') : -1;
  return target + (q >= 0 ? raw.slice(q) : '');
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
 * Two shapes were missed the first time (2026-11-15):
 *   - `/l/<x>` is the `/l/:id` route, so `<x>` must be a UUID too. `/l/fargo-nd`
 *     and five more city slugs linked from /p/ pages answered 200, indexable,
 *     "Error in loading the listing".
 *   - bare `/l` (and `/l/`) has no id at all. It rendered an empty shell that
 *     sent the browser to the homepage, and — because that shell counted as a
 *     page — `/l/` was 301ed to `/l`, which nginx 301s back to `/l/`: a loop.
 *     As a miss it is a plain 404 and resolveCanonicalRedirect leaves it alone.
 *
 * `/l/new` and `/l/draft/<uuid>/new/details` are left alone (no id segment /
 * a real UUID), as is everything outside these two prefixes. Bare `/u` is
 * left alone too: Avatar links there for banned and deleted users.
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
  if (seg.length === 0) {
    return false;
  }
  const [prefix] = seg;
  if (prefix.toLowerCase() === 'l') {
    // Bare /l: no id, nothing to show.
    if (seg.length === 1) {
      return true;
    }
    // /l/new has no id; anything else in that position is /l/:id.
    if (seg.length === 2) {
      return seg[1].toLowerCase() !== 'new' && !UUID_RE.test(seg[1]);
    }
    // /l/<slug>/<id>… must carry a UUID in position 3.
    return !UUID_RE.test(seg[2]);
  }
  if (seg.length < 2) {
    return false;
  }
  if (prefix.toLowerCase() === 'u') {
    return !UUID_RE.test(seg[1]);
  }
  return false;
};

/**
 * Everything the renderer needs to answer a rendered request: status, an
 * optional single redirect, and the headers that go with either.
 *
 * This is the order of precedence, in one place:
 *   1. a shell error (500) stands, with no extra headers beyond Content-Type;
 *   2. a miss — router miss, NotFoundPage rendered, or an entity path whose id
 *      can never resolve — is a 404 + `X-Robots-Tag: noindex, follow`, and is
 *      never redirected anywhere (not to a canonical spelling, not to the
 *      homepage, not to /s);
 *   3. a temporary load failure is a 503 + UNAVAILABLE_HEADERS, also never
 *      redirected;
 *   4. a page that rendered may get ONE 301: a listing to its declared
 *      /l/<slug>/<id> path, anything else to its lowercase slash-free spelling;
 *   5. otherwise 200, untouched.
 *
 * Pure: reads `req` and `locals`, changes neither. Call it only after the
 * shell has rendered (the signal is written during render).
 *
 * @param {Object} req express request (method, path, originalUrl)
 * @param {Object} locals express res.locals (ssrNotFound, ssrSignal)
 * @param {number} [shellStatus] 200, or 500 when the shell failed
 * @returns {{status: number, redirectTo: string|null, headers: Object}}
 */
const REDIRECT_HEADERS = Object.freeze({ 'Cache-Control': 'public, max-age=86400' });
const resolveRenderOutcome = (req, locals, shellStatus = 200) => {
  const safeLocals = locals && typeof locals === 'object' ? locals : {};
  const path = req && typeof req === 'object' ? req.path : undefined;
  const notFound = isMalformedEntityPath(path) || isNotFoundLocals(safeLocals);
  const unavailable = isUnavailableLocals(safeLocals);
  const status = resolveRenderStatus(shellStatus, notFound, unavailable);

  const redirectTo =
    status === 200
      ? resolveListingRedirect(req, safeLocals.ssrSignal, notFound) ||
        resolveCanonicalRedirect(req, notFound)
      : null;
  if (redirectTo) {
    return { status: 301, redirectTo, headers: { ...REDIRECT_HEADERS } };
  }

  const headers = { 'Content-Type': 'text/html' };
  if (status === 404) {
    headers['X-Robots-Tag'] = 'noindex, follow';
  }
  if (status === 503) {
    Object.assign(headers, UNAVAILABLE_HEADERS);
  }
  return { status, redirectTo: null, headers };
};

module.exports = {
  NOT_FOUND_ROUTE_NAME,
  LISTING_LOAD_NOT_FOUND,
  LISTING_LOAD_UNAVAILABLE,
  UNAVAILABLE_HEADERS,
  canonicalPath,
  classifyListingLoadError,
  isMalformedEntityPath,
  resolveCanonicalRedirect,
  resolveListingRedirect,
  resolveRenderOutcome,
  isNotFoundContext,
  isNotFoundLocals,
  isUnavailableLocals,
  resolveRenderStatus,
};
