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

module.exports = { NOT_FOUND_ROUTE_NAME, isNotFoundContext, resolveRenderStatus };
