// Chatwoot website widget (self-hosted at chat.poolrentalnearme.com): pure helpers.
//
// No React and no import.meta here, so `bun test` can load this file directly and
// the root route can import it without pulling anything else into the bundle.
// Browser objects (window, document) are always passed in.
//
// The EAST marketing site uses the same settings, CSS and show/hide behaviour:
// ops/chatbot/ops/east/chatwoot-widget.tsx. Keep the CSS block between the
// prnm-cw-css markers byte-identical in both files (ops/chatbot/ops/selfcheck.py
// checks it).

export const CHATWOOT_BASE_URL = 'https://chat.poolrentalnearme.com';
export const SCRIPT_ID = 'prnm-chatwoot-sdk';
export const STYLE_ID = 'prnm-chatwoot-style';
// Set on <html> while the chat window is open (Chatwoot's chatwoot:opened /
// chatwoot:closed window events).
export const OPEN_CLASS = 'prnm-cw-open';

// Bottom-LEFT, because WEST injects #prnm-cta (/tools/cta.js) bottom-right at
// z-index 2147483000. Attachments are also switched off on the inbox
// (ops/chatbot/ops/cw_setup.py): the assistant cannot read files, and it keeps ID
// and card photos out of the chat.
export const SDK_SETTINGS = Object.freeze({
  position: 'left',
  type: 'standard',
  locale: 'en',
  showPopoutButton: false,
  enableFileUpload: false,
  darkMode: 'light',
});

// The SDK's own CSS puts a 64px launcher at left/bottom 20px. Below 1025px WEST
// has a fixed 58px BottomNav and some pages have 61-70px sticky action bars, so
// the launcher moves up to 80px. At <=480px it shrinks to 48px at left 12px: there
// #prnm-cta (cta.js: right 10px, bottom 88px, max-width min(78vw, 300px)) can
// reach x = 60.4px, and a 64px launcher would sit under it. Between 667px and
// 1024px the open panel is a floating card above the launcher, so it moves up with
// it; below 667px the panel is full screen and only the unread-message preview
// moves. While the chat is open, #prnm-cta is hidden so it cannot cover the
// composer's send button on a phone (both use z-index 2147483000).
/* prnm-cw-css:start */
export const WIDGET_CSS = `
@media (max-width: 1024px) {
  .woot-widget-bubble.woot-elements--left:not(.woot--hide) { bottom: calc(80px + env(safe-area-inset-bottom, 0px)) !important; }
}
@media (max-width: 480px) {
  .woot-widget-bubble.woot-elements--left { left: 12px !important; width: 48px !important; height: 48px !important; }
  .woot-widget-bubble.woot-elements--left svg { margin: 12px !important; }
}
@media (max-width: 666px) {
  .woot-widget-holder.has-unread-view.woot-elements--left:not(.woot--hide) { bottom: calc(154px + env(safe-area-inset-bottom, 0px)) !important; max-height: calc(100% - 174px) !important; }
}
@media (min-width: 667px) and (max-width: 1024px) {
  .woot-widget-holder.woot-elements--left:not(.woot--hide) { bottom: calc(164px + env(safe-area-inset-bottom, 0px)) !important; max-height: calc(100% - 184px) !important; }
}
html.prnm-cw-open #prnm-cta { display: none !important; }
`;
/* prnm-cw-css:end */

// Routes where the widget never shows: each has a card or payout form.
// Names are route `name`s from src/routing/routeConfiguration.js.
export const HIDE_ON_ROUTES = Object.freeze([
  'CheckoutPage',
  'PaymentMethodsPage',
  'StripePayoutPage',
  'StripePayoutOnboardingPage',
  'EditListingStripeOnboardingPage',
]);

// Routes where the widget is hidden only at COMPACT_QUERY widths, because a
// fixed full-width bar sits at the bottom of the screen there: the listing
// page's "Request to book" bar, the transaction pages' action bar and message
// composer, and the listing editor's Save/Publish button. BottomNav hides on the
// same pages for the same reason (BottomNav.js HIDE_ON_PAGES).
export const HIDE_ON_COMPACT_ROUTES = Object.freeze([
  'ListingPage',
  'ListingPageVariant',
  'ListingPageCanonical',
  'OrderDetailsPage',
  'SaleDetailsPage',
  'EditListingPage',
]);

// Same raw query BottomNav.module.css uses for the mobile/tablet layout.
export const COMPACT_QUERY = '(max-width: 1024px)';

// `scrollLocked`: a Modal holds the scroll lock (ducks/ui.duck isScrollingDisabled).
// The SDK's launcher sits at z-index 2147483000, above every Modal, so it is
// hidden while one is open (the /s filter sheet, the mobile menu, the map sheet).
export const shouldHide = (routeName, { compact = false, scrollLocked = false } = {}) => {
  if (scrollLocked) return true;
  if (!routeName) return false;
  if (HIDE_ON_ROUTES.includes(routeName)) return true;
  return compact && HIDE_ON_COMPACT_ROUTES.includes(routeName);
};

// Chatwoot website tokens are has_secure_token values (base58). Anything else
// (unset, empty, a typo, markup) turns the widget into a no-op.
export const sanitizeToken = (value) => {
  const t = typeof value === 'string' ? value.trim() : '';
  return /^[A-Za-z0-9]{16,64}$/.test(t) ? t : '';
};

// Per-window state in a WeakMap: nothing extra is hung on window, and each test's
// fake window starts fresh.
const states = new WeakMap();
const stateOf = (win) => {
  if (!states.has(win)) states.set(win, { visible: true, ready: false, settings: null });
  return states.get(win);
};

// Show or hide the launcher (and close an open chat when hiding). Before the SDK
// is ready, the wish is stored and applied on chatwoot:ready.
export const setChatwootVisible = (win, visible) => {
  if (!win) return;
  const state = stateOf(win);
  state.visible = !!visible;
  if (state.settings) state.settings.hideMessageBubble = !visible;
  const cw = win.$chatwoot;
  if (!state.ready || !cw) return;
  try {
    if (!visible && cw.isOpen && typeof cw.toggle === 'function') cw.toggle('close');
    if (typeof cw.toggleBubbleVisibility === 'function') {
      cw.toggleBubbleVisibility(visible ? 'show' : 'hide');
    }
  } catch (e) {
    // The widget must never break the page.
  }
};

// Load the SDK once. Returns true only when this call inserted the script.
export const loadChatwoot = (win, doc, token) => {
  if (!win || !doc || !token || doc.getElementById(SCRIPT_ID)) return false;
  const state = stateOf(win);
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = WIDGET_CSS;
    doc.head.appendChild(style);
  }
  state.settings = { ...SDK_SETTINGS, hideMessageBubble: !state.visible };
  // The SDK reads its settings from window.chatwootSettings when it runs.
  // eslint-disable-next-line no-param-reassign
  win.chatwootSettings = state.settings;
  const root = doc.documentElement;
  win.addEventListener('chatwoot:opened', () => root.classList.add(OPEN_CLASS));
  win.addEventListener('chatwoot:closed', () => root.classList.remove(OPEN_CLASS));
  win.addEventListener('chatwoot:ready', () => {
    state.ready = true;
    setChatwootVisible(win, state.visible);
  });
  const script = doc.createElement('script');
  script.id = SCRIPT_ID;
  script.src = `${CHATWOOT_BASE_URL}/packs/js/sdk.js`;
  script.async = true;
  script.defer = true;
  script.onload = () => {
    try {
      if (win.chatwootSDK) win.chatwootSDK.run({ websiteToken: token, baseUrl: CHATWOOT_BASE_URL });
    } catch (e) {
      // SDK failed: no widget; the page itself is unaffected.
    }
  };
  doc.body.appendChild(script);
  return true;
};
