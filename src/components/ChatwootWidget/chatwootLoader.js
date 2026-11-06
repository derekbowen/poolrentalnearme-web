// Chatwoot website widget (self-hosted at chat.poolrentalnearme.com): pure helpers.
//
// No React and no import.meta here, so `bun test` can load this file directly and
// the root route can import it without pulling anything else into the bundle.
// Browser objects (window, document) are always passed in.
//
// How it works (decision D1):
// - The page shows a PRNM-owned launcher (#prnm-chat-launcher, bottom-left).
//   Chatwoot's SDK (sdk.js) is NOT loaded on page view. It is loaded when the
//   visitor clicks the launcher, or on page load when the visitor already has a
//   cw_conversation cookie (a returning chatter, so founder replies reach them).
//   Crawlers and visitors who never click create no Chatwoot contact and hold no
//   websocket.
// - The script tag carries integrity (VITE_CHATWOOT_SDK_SRI, sha384) and
//   crossorigin="anonymous": a changed sdk.js is refused by the browser. Its URL
//   carries ?v=<part of the SRI> (sdkSrc), so a new SRI always means a new URL.
// - Missing or malformed token or SRI: nothing renders and nothing loads.
// - Chatwoot's own bubble is hidden (hideMessageBubble). The launcher opens and
//   closes the chat; on desktop it is the only close control (the 4.16.2 widget
//   shows its own close button only at <=668px).
//
// The EAST marketing site has the same behaviour in
// ops/chatbot/ops/east/chatwoot-widget.tsx. Keep the CSS block between the
// prnm-cw-css markers byte-identical in both files (ops/chatbot/ops/selfcheck.py
// checks it).

export const CHATWOOT_BASE_URL = 'https://chat.poolrentalnearme.com';
export const SDK_URL = `${CHATWOOT_BASE_URL}/packs/js/sdk.js`;
export const SCRIPT_ID = 'prnm-chatwoot-sdk';
export const STYLE_ID = 'prnm-chatwoot-style';
export const LAUNCHER_ID = 'prnm-chat-launcher';
export const LAUNCHER_LABEL = 'Chat with Pool Rental Near Me';
// Shown only if sdk.js or the chat window fails to load (SRI mismatch, outage).
export const FALLBACK_EMAIL = 'support@poolrentalnearme.com';
// Set on <html> while the chat window or its unread-message preview is showing.
export const OPEN_CLASS = 'prnm-cw-open';
// Set on <html> while the widget is hidden (route, width, modal, filters sheet).
// WIDGET_CSS then keeps the SDK's window invisible, whatever the SDK does.
export const HIDDEN_CLASS = 'prnm-cw-hidden';
// Cookie the SDK sets on this site once the chat window has loaded.
export const CONVERSATION_COOKIE = 'cw_conversation';
// Element ids the 4.16.2 SDK creates (sdk/IFrameHelper.js).
export const HOLDER_ID = 'cw-widget-holder';
export const FRAME_ID = 'chatwoot_live_chat_widget';
// sdk.js loaded but no chatwoot:ready (the chat window never answered): give up.
export const LOAD_TIMEOUT_MS = 20000;

// Bottom-LEFT, because WEST injects #prnm-cta (/tools/cta.js) bottom-right.
// Attachments are also switched off on the inbox (ops/chatbot/ops/cw_setup.rb):
// the assistant cannot read files, and it keeps ID and card photos out of the
// chat. End-conversation is off on the inbox too (D3); the setting here only
// hides the menu item.
export const SDK_SETTINGS = Object.freeze({
  position: 'left',
  type: 'standard',
  locale: 'en',
  showPopoutButton: false,
  enableFileUpload: false,
  enableEndConversation: false,
  darkMode: 'light',
  hideMessageBubble: true,
});

// Layout (checked in headless Chromium at 12 widths, 320-1440px):
// - Launcher: a 44px "Chat" pill at left 20px / bottom 20px. At <=1024px WEST has
//   a fixed 58px BottomNav, so it moves up to bottom 80px. At <=480px it becomes
//   a 48x52 tile (icon over the word) at left 10px: there #prnm-cta (cta.js:
//   right 10px, bottom 88px, max-width min(78vw, 300px)) reaches x = 60.4px.
// - Open chat: below 667px the SDK makes it full screen (the widget has its own
//   close button there). From 667px it is a floating card, moved up to sit 12px
//   above the launcher, which stays visible as the close toggle. The unread
//   message preview below 667px moves above the launcher too.
// - While the chat or the preview shows, #prnm-cta is hidden so it cannot cover
//   the composer (both use z-index 2147483000; the launcher sits just below).
// - On tablets the open card is capped at 640px, as on desktop.
// - While the widget is hidden (html.prnm-cw-hidden), the SDK's window is made
//   invisible the same way the SDK hides a closed chat (visibility, so the window
//   keeps its layout). A reply that arrives then (the SDK's unread preview) stays
//   out of sight over checkout or a modal, is not marked read, and shows once the
//   visitor is back on a page where the widget shows.
/* prnm-cw-css:start */
export const WIDGET_CSS = `
#prnm-chat-launcher { position: fixed; left: 20px; bottom: calc(20px + env(safe-area-inset-bottom, 0px)); z-index: 2147482999; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 44px; margin: 0; padding: 0 18px 0 14px; border: 0; border-radius: 22px; background: #0b6ea8; color: #fff; font: 700 15px/1 system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; letter-spacing: 0; text-transform: none; text-decoration: none; white-space: nowrap; box-shadow: 0 6px 20px rgba(10, 40, 70, .28); cursor: pointer; -webkit-tap-highlight-color: transparent; }
#prnm-chat-launcher:hover { background: #095d8e; color: #fff; }
#prnm-chat-launcher:focus-visible { outline: 3px solid #12212e; outline-offset: 2px; }
#prnm-chat-launcher svg { display: block; flex: none; width: 20px; height: 20px; }
#prnm-chat-launcher[aria-busy="true"] { cursor: progress; }
#prnm-chat-launcher[aria-busy="true"] svg { animation: prnm-cw-pulse .8s ease-in-out infinite alternate; }
@keyframes prnm-cw-pulse { to { opacity: .3; } }
@media (prefers-reduced-motion: reduce) {
  #prnm-chat-launcher[aria-busy="true"] svg { animation: none; }
}
@media (max-width: 1024px) {
  #prnm-chat-launcher { bottom: calc(80px + env(safe-area-inset-bottom, 0px)); }
}
@media (max-width: 480px) {
  #prnm-chat-launcher { left: 10px; width: 48px; height: 52px; padding: 7px 0 6px; flex-direction: column; gap: 4px; border-radius: 14px; font-size: 11px; }
}
@media (min-width: 1025px) {
  .woot-widget-holder.woot-elements--left:not(.woot--hide) { bottom: calc(76px + env(safe-area-inset-bottom, 0px)) !important; max-height: min(640px, calc(100% - 96px)) !important; }
}
@media (min-width: 667px) and (max-width: 1024px) {
  .woot-widget-holder.woot-elements--left:not(.woot--hide) { top: auto !important; bottom: calc(136px + env(safe-area-inset-bottom, 0px)) !important; max-height: min(640px, calc(100% - 156px)) !important; min-height: 0 !important; }
}
@media (max-width: 666px) {
  .woot-widget-holder.has-unread-view.woot-elements--left:not(.woot--hide) { bottom: calc(144px + env(safe-area-inset-bottom, 0px)) !important; max-height: calc(100% - 164px) !important; }
}
html.prnm-cw-open #prnm-cta { display: none !important; }
html.prnm-cw-hidden #cw-widget-holder { visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }
@media print {
  #prnm-chat-launcher { display: none !important; }
}
`;
/* prnm-cw-css:end */

// Routes where the widget never shows, at any width: checkout and the card and
// payout forms, and the host's payout dashboard (real Stripe balance and payout
// history). Names are route `name`s from src/routing/routeConfiguration.js.
export const HIDE_ON_ROUTES = Object.freeze([
  'CheckoutPage',
  'PaymentMethodsPage',
  'StripePayoutPage',
  'StripePayoutOnboardingPage',
  'EditListingStripeOnboardingPage',
  'PayoutDashboardPage',
]);

// Routes where the widget is hidden only at COMPACT_QUERY widths, because a
// fixed full-width bar sits at the bottom of the screen there: the listing
// page's "Request to book" bar, the transaction pages' action bar and message
// composer, and the listing editor's Save/Publish button. BottomNav hides on the
// same pages for the same reason (Topbar/BottomNav/BottomNav.js HIDE_ON_PAGES).
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

// The /s mobile filters sheet: SearchFiltersMobile opens a ModalInMobile with
// this id, and its Modal registers the id in state.ui.disableScrollRequests while
// the sheet is open (at <=768px, MODAL_BREAKPOINT in SearchPageWith{Grid,Map}).
export const SEARCH_FILTERS_SHEET_ID = 'SearchFiltersMobile.filters';

export const isSearchFiltersSheetOpen = (state) => {
  const requests = state?.ui?.disableScrollRequests;
  return Array.isArray(requests)
    ? requests.some((r) => r?.componentId === SEARCH_FILTERS_SHEET_ID && !!r.disableScrolling)
    : false;
};

// `scrollLocked`: a Modal holds the scroll lock (ducks/ui.duck isScrollingDisabled):
// the mobile menu, the map sheet, any dialog. `sheetOpen`: the /s filters sheet.
export const shouldHide = (
  routeName,
  { compact = false, scrollLocked = false, sheetOpen = false } = {}
) => {
  if (scrollLocked || sheetOpen) return true;
  if (!routeName) return false;
  if (HIDE_ON_ROUTES.includes(routeName)) return true;
  return compact && HIDE_ON_COMPACT_ROUTES.includes(routeName);
};

// Chatwoot website tokens are has_secure_token values (base58). Anything else
// (unset, empty, a typo, markup) turns the widget off.
export const sanitizeToken = (value) => {
  const t = typeof value === 'string' ? value.trim() : '';
  return /^[A-Za-z0-9]{16,64}$/.test(t) ? t : '';
};

// Subresource Integrity for sdk.js: exactly "sha384-" + base64 of a 48-byte
// digest (64 characters, no padding). Anything else turns the widget off.
export const sanitizeSri = (value) => {
  const t = typeof value === 'string' ? value.trim() : '';
  return /^sha384-[A-Za-z0-9+/]{64}$/.test(t) ? t : '';
};

// Both values valid, or null: the widget renders nothing (fail closed).
export const widgetConfig = (token, sri) => {
  const t = sanitizeToken(token);
  const s = sanitizeSri(sri);
  return t && s ? Object.freeze({ token: t, sri: s }) : null;
};

// The sdk.js URL for one SRI. Chatwoot serves sdk.js with a one-year
// cache-control, so a browser or CDN may keep an old copy at the bare URL; after
// a Chatwoot image change that old copy fails the new integrity check and is not
// refetched. A query that changes with the SRI makes every new SRI a new URL
// (nginx and Rails ignore the query; the CSP source matches any query).
// The 16 characters after "sha384-" are 96 bits of the digest.
export const sdkSrc = (sri) => `${SDK_URL}?v=${encodeURIComponent(String(sri || '').slice(7, 23))}`;

export const hasConversationCookie = (doc) => {
  try {
    return new RegExp(`(?:^|;\\s*)${CONVERSATION_COOKIE}=[^;\\s]`).test(String(doc.cookie || ''));
  } catch (e) {
    return false;
  }
};

// ---------------------------------------------------------------- state ----
// Per-window state in a WeakMap: nothing extra is hung on window, and each test's
// fake window starts fresh.
//   phase: idle -> loading -> ready, or failed (load error / timeout)
//   view:  closed | unread (Chatwoot's unread-message preview) | open
const states = new WeakMap();

const snapshotOf = (s) => ({
  phase: s.phase,
  view: s.view,
  busy: s.wantOpen && s.phase === 'loading',
});

const stateOf = (win) => {
  if (!states.has(win)) {
    const s = {
      phase: 'idle',
      view: 'closed',
      wantOpen: false,
      hidden: false,
      timer: null,
      listeners: new Set(),
    };
    s.snapshot = snapshotOf(s);
    states.set(win, s);
  }
  return states.get(win);
};

export const IDLE_SNAPSHOT = Object.freeze({ phase: 'idle', view: 'closed', busy: false });

const emit = (win) => {
  const s = stateOf(win);
  const next = snapshotOf(s);
  const prev = s.snapshot;
  if (prev.phase === next.phase && prev.view === next.view && prev.busy === next.busy) return;
  s.snapshot = next;
  s.listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      // A listener must never break the widget.
    }
  });
};

// For React's useSyncExternalStore: a stable snapshot that changes only on change.
export const getChatSnapshot = (win) => (win ? stateOf(win).snapshot : IDLE_SNAPSHOT);

export const subscribeChat = (win, fn) => {
  if (!win) return () => {};
  const s = stateOf(win);
  s.listeners.add(fn);
  return () => s.listeners.delete(fn);
};

const callToggle = (win, how) => {
  try {
    const cw = win.$chatwoot;
    if (cw && typeof cw.toggle === 'function') cw.toggle(how);
  } catch (e) {
    // The widget must never break the page.
  }
};

const viewOf = (win, doc) => {
  const holder = doc.getElementById(HOLDER_ID);
  if (holder && holder.classList) {
    if (holder.classList.contains('woot--hide')) return 'closed';
    return holder.classList.contains('has-unread-view') ? 'unread' : 'open';
  }
  return win.$chatwoot && win.$chatwoot.isOpen ? 'open' : 'closed';
};

// Keep the <html> classes in step: HIDDEN_CLASS while hidden (WIDGET_CSS keeps
// the SDK's window invisible), OPEN_CLASS while the chat or preview is on screen.
const syncRoot = (win, doc) => {
  const s = stateOf(win);
  try {
    const root = doc.documentElement;
    if (s.hidden) root.classList.add(HIDDEN_CLASS);
    else root.classList.remove(HIDDEN_CLASS);
    if (!s.hidden && s.view !== 'closed') root.classList.add(OPEN_CLASS);
    else root.classList.remove(OPEN_CLASS);
  } catch (e) {
    // The widget must never break the page.
  }
};

// Re-read the chat window state from the SDK's DOM (holder classes), keep the
// <html> classes in step, and hand focus back to the launcher when the chat
// closes from inside its own window (the close button the widget shows on phones).
// While hidden, the SDK can still open its unread preview (it does on every bot
// or founder reply): the view is recorded, and HIDDEN_CLASS keeps it off screen.
const refreshView = (win, doc) => {
  const s = stateOf(win);
  const prev = s.view;
  s.view = viewOf(win, doc);
  syncRoot(win, doc);
  try {
    if (prev !== 'closed' && s.view === 'closed') {
      const active = doc.activeElement;
      const launcher = doc.getElementById(LAUNCHER_ID);
      if (launcher && active && active.id === FRAME_ID) launcher.focus({ preventScroll: true });
    }
  } catch (e) {
    // The widget must never break the page.
  }
  emit(win);
};

const fail = (win) => {
  const s = stateOf(win);
  if (s.phase === 'ready') return;
  s.phase = 'failed';
  s.wantOpen = false;
  emit(win);
};

export const ensureStyle = (doc) => {
  if (!doc || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = WIDGET_CSS;
  doc.head.appendChild(style);
};

// Load sdk.js once (integrity-checked) and start the widget. Returns true only
// when this call inserted the script. Does nothing while hidden.
export const loadChatwoot = (win, doc, config) => {
  if (!win || !doc || !config || !config.token || !config.sri) return false;
  const s = stateOf(win);
  if (s.hidden || s.phase !== 'idle' || doc.getElementById(SCRIPT_ID)) return false;
  ensureStyle(doc);
  s.phase = 'loading';
  // The SDK reads its settings from window.chatwootSettings when it runs.
  // eslint-disable-next-line no-param-reassign
  win.chatwootSettings = { ...SDK_SETTINGS };
  win.addEventListener('chatwoot:opened', () => refreshView(win, doc));
  win.addEventListener('chatwoot:closed', () => refreshView(win, doc));
  win.addEventListener('chatwoot:ready', () => {
    if (s.timer) win.clearTimeout(s.timer);
    s.timer = null;
    s.phase = 'ready';
    const open = s.wantOpen && !s.hidden;
    s.wantOpen = false;
    refreshView(win, doc);
    if (open) callToggle(win, 'open');
  });
  const script = doc.createElement('script');
  script.id = SCRIPT_ID;
  script.src = sdkSrc(config.sri);
  script.integrity = config.sri;
  script.crossOrigin = 'anonymous';
  script.async = true;
  script.onerror = () => fail(win);
  script.onload = () => {
    try {
      if (!win.chatwootSDK) throw new Error('no chatwootSDK');
      win.chatwootSDK.run({ websiteToken: config.token, baseUrl: CHATWOOT_BASE_URL });
      const holder = doc.getElementById(HOLDER_ID);
      if (holder && typeof win.MutationObserver === 'function') {
        new win.MutationObserver(() => refreshView(win, doc)).observe(holder, {
          attributes: true,
          attributeFilter: ['class'],
        });
      }
      s.timer = win.setTimeout(() => fail(win), LOAD_TIMEOUT_MS);
    } catch (e) {
      // SDK failed: no chat; the page itself is unaffected.
      fail(win);
    }
  };
  doc.body.appendChild(script);
  emit(win);
  return true;
};

// The launcher's click: open the chat (loading the SDK first if needed), or
// close it when it is open. From the unread preview it opens the full chat.
export const toggleChat = (win, doc, config) => {
  if (!win || !doc) return;
  const s = stateOf(win);
  if (s.hidden || s.phase === 'failed') return;
  if (s.phase === 'ready') {
    if (s.view === 'open') callToggle(win, 'close');
    else if (s.view === 'unread') {
      callToggle(win, 'close');
      callToggle(win, 'open');
    } else callToggle(win, 'open');
    return;
  }
  s.wantOpen = true;
  if (s.phase === 'idle') loadChatwoot(win, doc, config);
  emit(win);
};

// Hide (route, width, modal) or show again. Hiding closes an open chat or
// preview, drops a pending open, and sets HIDDEN_CLASS on <html> so that anything
// the SDK opens while hidden stays invisible. Showing again removes it: an unread
// preview that arrived meanwhile then appears.
export const setChatHidden = (win, hidden, doc = win && win.document) => {
  if (!win) return;
  const s = stateOf(win);
  s.hidden = !!hidden;
  if (s.hidden) {
    s.wantOpen = false;
    if (s.phase === 'ready' && s.view !== 'closed') callToggle(win, 'close');
  }
  if (doc) syncRoot(win, doc);
  emit(win);
};
