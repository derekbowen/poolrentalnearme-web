/**
 * Preview gate for the redesigned host onboarding.
 *
 * This is an OBSCURITY gate, not a security control, and it is deliberately not
 * a shared secret in source (see the repo rule about never committing tokens).
 * Three things keep normal hosts out of unfinished screens:
 *
 *   1. the route itself requires authentication (routeConfiguration)
 *   2. the page is noindex and Disallow-ed in robots.txt
 *   3. nothing anywhere links to it — you arrive by typing the opt-in below
 *
 * Opt in once with ?hostpreview=1 and it sticks for the browser session, so
 * refreshes and in-flow navigation keep working without re-typing it.
 *
 * When this flow starts writing listing data (Batch 2 onward), replace this with
 * an operator allowlist keyed on marketplace user id — session opt-in is not a
 * strong enough boundary once real drafts are being created.
 */

const KEY = 'prnm-host-preview';
const PARAM = 'hostpreview';

const canUseStorage = () => {
  try {
    return typeof window !== 'undefined' && !!window.sessionStorage;
  } catch (e) {
    // Safari private mode throws on access rather than returning null.
    return false;
  }
};

/**
 * True when this browser session has opted into the preview.
 *
 * @param {string} [search] location.search, e.g. '?hostpreview=1'
 * @returns {boolean}
 */
export const hasPreviewAccess = (search) => {
  if (typeof window === 'undefined') {
    // Server render: never grant access, so the preview can't be served to a
    // crawler or an unauthenticated fetch.
    return false;
  }

  const query = typeof search === 'string' ? search : window.location.search;
  const optingIn = new URLSearchParams(query || '').get(PARAM) === '1';

  if (optingIn && canUseStorage()) {
    try {
      window.sessionStorage.setItem(KEY, '1');
    } catch (e) {
      // Storage full or blocked — the query param alone still grants this view.
    }
  }

  if (optingIn) {
    return true;
  }

  if (!canUseStorage()) {
    return false;
  }

  try {
    return window.sessionStorage.getItem(KEY) === '1';
  } catch (e) {
    return false;
  }
};

export const PREVIEW_PARAM = PARAM;
