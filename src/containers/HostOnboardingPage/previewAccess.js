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
 * Viewing and WRITING are deliberately separated. Session opt-in is enough to
 * look at unfinished screens; it is NOT enough to create real listing data in a
 * production marketplace, so persistence is gated on an operator allowlist
 * instead (see canWritePreviewData below).
 */

const KEY = 'prnm-host-preview';
const PARAM = 'hostpreview';

/**
 * Marketplace user ids allowed to persist data from the preview flow.
 *
 * Build-time and comma-separated, e.g. VITE_HOST_PREVIEW_OPERATOR_IDS="uuid,uuid".
 * These are user ids, not secrets — nothing here grants a session or stands in
 * for authentication, and the SDK still only ever lets a user touch their own
 * listings. The allowlist exists so an unfinished flow cannot create draft
 * listings for a real host who wandered in.
 *
 * Empty by default. That is the safe state: with no allowlist configured the
 * flow runs read-only and says so on screen, rather than failing open.
 */
const OPERATOR_IDS = String(import.meta.env.VITE_HOST_PREVIEW_OPERATOR_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

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

/**
 * True when this user may persist data from the preview flow.
 *
 * Viewing the screens is not sufficient — see OPERATOR_IDS above. Callers must
 * treat a false answer as "render the flow, save nothing", never as a redirect:
 * the screens are still worth reviewing without a write path.
 *
 * @param {string} [currentUserId] marketplace user id (uuid) of the signed-in user
 * @returns {boolean}
 */
export const canWritePreviewData = (currentUserId) =>
  !!currentUserId && OPERATOR_IDS.includes(String(currentUserId));

/**
 * True when any operator allowlist is configured at all.
 *
 * Lets the UI distinguish "you personally are not an operator" from "nobody is,
 * because the env var was never set on this deploy" — two very different bugs.
 *
 * @returns {boolean}
 */
export const hasOperatorAllowlist = () => OPERATOR_IDS.length > 0;

export const PREVIEW_PARAM = PARAM;
