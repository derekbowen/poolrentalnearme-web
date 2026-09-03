import find from 'lodash/find';
import { matchPath } from 'react-router-dom';
import { compile } from 'path-to-regexp';
// NOTE: This file imports urlHelpers.js, which may lead to circular dependency
import { stringify } from './urlHelpers';

const findRouteByName = (nameToFind, routes) => find(routes, (route) => route.name === nameToFind);

/**
 * E.g. ```const toListingPath = toPathByRouteName('ListingPage', routes);```
 * Then we can generate listing paths with given params (```toListingPath({ id: uuidX })```)
 */
const toPathByRouteName = (nameToFind, routes) => {
  const route = findRouteByName(nameToFind, routes);
  if (!route) {
    throw new Error(`Path "${nameToFind}" was not found.`);
  }
  return compile(route.path);
};

/**
 * Shorthand for single path call. (```pathByRouteName('ListingPage', routes, { id: uuidX });```)
 */
export const pathByRouteName = (nameToFind, routes, params = {}) => {
  const hasEmptySlug = params && params.hasOwnProperty('slug') && params.slug === '';
  const pathParams = hasEmptySlug ? { ...params, slug: 'no-slug' } : params;
  return toPathByRouteName(nameToFind, routes)(pathParams);
};

/**
 * Find the matching routes and their params for the given pathname
 *
 * @param {String} pathname - Full URL path from root with possible
 * search params and hash included
 *
 * @return {Array<{ route, params }>} - All matches as { route, params }
 */
export const matchPathname = (pathname, routeConfiguration) =>
  routeConfiguration.reduce((matches, route) => {
    const { path } = route;
    // If path is '*' - NotFoundPage, it matches everything so ignore it
    if (path === '*') {
      return matches;
    }
    const match = matchPath(path, pathname);
    if (match) {
      matches.push({
        route,
        params: match.params || {},
      });
    }
    return matches;
  }, []);

/**
 * ResourceLocatorString is used to direct webapp to correct page.
 * In contrast to Universal Resource Locator (URL), this doesn't contain protocol, host, or port.
 */
export const createResourceLocatorString = (
  routeName,
  routes,
  pathParams = {},
  searchParams = {},
  hash = ''
) => {
  const searchQuery = stringify(searchParams);
  const includeSearchQuery = searchQuery.length > 0 ? `?${searchQuery}` : '';
  const path = pathByRouteName(routeName, routes, pathParams);
  return `${path}${includeSearchQuery}${hash}`;
};

/**
 * Find component related to route name
 * E.g. `const PageComponent = findComponentByRouteName('CheckoutPage', routes);`
 * Then we can call static methods of given component:
 * `dispatch(PageComponent.setInitialValues({ listing, bookingDates }));`
 *
 * @param {String} nameToFind - Route name
 * @param {Array<{ route }>} routes - Route configuration as flat array.
 *
 * @return {Route} - Route that matches the given route name.
 */
export const findRouteByRouteName = (nameToFind, routes) => {
  const route = findRouteByName(nameToFind, routes);
  if (!route) {
    throw new Error(`Component "${nameToFind}" was not found.`);
  }
  return route;
};

/**
 * Get the canonical URL from the given location
 *
 * @param {Array<{ route }>} routes - Route configuration as flat array
 * @param {Object} location - location object from React Router
 *
 * @return {String} Canonical URL of the given location
 *
 */
/**
 * Query parameters that never change what a page shows: click attribution and
 * campaign tags.
 *
 * Left in the canonical they mint a duplicate URL for every click. Every host
 * share link goes through /go/<slug>-<uuid8>, which 302s to the listing with
 * ?ref=host-share appended (server/api/go-redirect.js), so each shared listing
 * was advertising a second, self-canonicalising copy of itself to Google.
 */
const TRACKING_PARAM = /^(ref|gclid|fbclid|msclkid|mc_cid|mc_eid|igshid|utm_[a-z_]+)$/i;

const withoutTrackingParams = search => {
  if (!search || search === '?') {
    return '';
  }
  const params = new URLSearchParams(search.charAt(0) === '?' ? search.slice(1) : search);
  Array.from(params.keys())
    .filter(key => TRACKING_PARAM.test(key))
    .forEach(key => params.delete(key));
  const rest = params.toString();
  return rest ? `?${rest}` : '';
};

export const canonicalRoutePath = (routes, location, pathOnly = false) => {
  const { pathname, search, hash } = location;

  const matches = matchPathname(pathname, routes);
  const isListingRoute = matches.length === 1 && matches[0].route.name === 'ListingPage';

  if (isListingRoute) {
    // Remove the dynamic slug from the listing page canonical URL

    // Remove possible trailing slash
    const cleanedPathName = pathname.replace(/\/$/, '');
    const parts = cleanedPathName.split('/');

    if (parts.length !== 4) {
      throw new Error('Expected ListingPage route to have 4 parts');
    }
    // A listing page renders the same listing whatever the query says — ?ref,
    // ?orderOpen, prefilled dates — so its canonical carries no query at all.
    return canonicalListingPathname;
  }

  return pathOnly ? pathname : `${pathname}${withoutTrackingParams(search)}${hash}`;
};

// Regex that replaces {userId}, {listingId} or {userEmail} in the href string
// with URI encoded user email and ID
export const replaceParamsInHref = (href, params) => {
  return href.replace(/{(userId|userEmail|listingId)}/g, (match, key) => {
    if (params[key] != null) {
      return encodeURIComponent(params[key]);
    }
    return match;
  });
};

// This function generates data required to render ExternalLink and InternalLink components.
// It is given a URL and it replaces the {userId} and {userEmail} placeholders
// with the corresponding user data, encodes the values, and determines whether the URL
// is internal or external. If it's an internal link, the function resolves the appropriate
// route and returns an object containing route information. For external links, it returns
// the processed link without route details.
export const generateLinkProps = (type, href, routeConfiguration, userId, userEmail, listingId) => {
  const params = { userId, userEmail, listingId };
  const processedLink = replaceParamsInHref(href, params);

  const isInternalLink = type === 'internal' || href.charAt(0) === '/';

  if (isInternalLink) {
    const testURL = new URL('http://my.marketplace.com' + processedLink);

    const matchedRoutes = matchPathname(testURL.pathname, routeConfiguration);
    if (matchedRoutes.length > 0) {
      const found = matchedRoutes[0];
      const to = { search: testURL.search, hash: testURL.hash };

      // Return an object with route info
      return {
        link: processedLink,
        route: {
          name: found.route?.name,
          params: found.params,
          to,
        },
      };
    }
  }
  // If not internal, return the processed external link without route info
  return {
    link: processedLink,
  };
};
