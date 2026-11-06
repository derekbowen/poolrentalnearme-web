// bun test src/components/ChatwootWidget/chatwootLoader.test.js
import {
  CHATWOOT_BASE_URL,
  FRAME_ID,
  HIDE_ON_COMPACT_ROUTES,
  HIDDEN_CLASS,
  HIDE_ON_ROUTES,
  HOLDER_ID,
  IDLE_SNAPSHOT,
  LAUNCHER_ID,
  LOAD_TIMEOUT_MS,
  OPEN_CLASS,
  SCRIPT_ID,
  SDK_URL,
  SEARCH_FILTERS_SHEET_ID,
  STYLE_ID,
  WIDGET_CSS,
  ensureStyle,
  getChatSnapshot,
  hasConversationCookie,
  isSearchFiltersSheetOpen,
  loadChatwoot,
  sanitizeSri,
  sanitizeToken,
  sdkSrc,
  setChatHidden,
  shouldHide,
  subscribeChat,
  toggleChat,
  widgetConfig,
} from './chatwootLoader';

const TOKEN = 'AbCdEf1234567890xyzQ';
const SRI = `sha384-${'A1b2+/C3'.repeat(8)}`;
const CONFIG = widgetConfig(TOKEN, SRI);

const classSet = () => {
  const set = new Set();
  return {
    add: (...c) => c.forEach((x) => set.add(x)),
    remove: (...c) => c.forEach((x) => set.delete(x)),
    toggle: (c) => (set.has(c) ? set.delete(c) : set.add(c)),
    contains: (c) => set.has(c),
    set,
  };
};

// Minimal DOM stand-in: enough for the loader (no jsdom dependency). The fake SDK
// below does what the 4.16.2 SDK does in the parent page: run() creates
// #cw-widget-holder (class woot--hide), toggle() flips woot--hide on it and fires
// chatwoot:opened / chatwoot:closed.
const fakeDom = ({ cookie = '' } = {}) => {
  const byId = {};
  const listeners = {};
  const timers = [];
  const observers = [];
  const root = { classList: classSet() };
  const el = (tag) => ({ tagName: tag, id: '', classList: classSet(), focus: () => {} });
  const append = (e) => {
    if (e.id) byId[e.id] = e;
  };
  const doc = {
    cookie,
    activeElement: null,
    getElementById: (id) => byId[id] || null,
    createElement: el,
    head: { appendChild: append },
    body: { appendChild: append },
    documentElement: root,
  };
  const fire = (name) => (listeners[name] || []).forEach((fn) => fn());
  const runs = [];
  const toggles = [];
  const win = {
    addEventListener: (name, fn) => {
      listeners[name] = listeners[name] || [];
      listeners[name].push(fn);
    },
    setTimeout: (fn, ms) => timers.push({ fn, ms }) && timers.length,
    clearTimeout: (id) => {
      if (timers[id - 1]) timers[id - 1].fn = null;
    },
    MutationObserver: class {
      constructor(cb) {
        this.cb = cb;
        observers.push(this);
      }

      observe(target, opts) {
        this.target = target;
        this.opts = opts;
      }
    },
    fire,
    document: doc,
  };
  const sdk = {
    run: (o) => {
      runs.push(o);
      const holder = el('div');
      holder.id = HOLDER_ID;
      holder.classList.add('woot-widget-holder', 'woot--hide', 'woot-elements--left');
      byId[HOLDER_ID] = holder;
      const frame = el('iframe');
      frame.id = FRAME_ID;
      byId[FRAME_ID] = frame;
      win.$chatwoot = {
        isOpen: false,
        toggle: (how) => {
          toggles.push(how);
          let next = !win.$chatwoot.isOpen;
          if (how === 'open') next = true;
          if (how === 'close') next = false;
          if (next === win.$chatwoot.isOpen) return;
          win.$chatwoot.isOpen = next;
          holder.classList.toggle('woot--hide');
          fire(next ? 'chatwoot:opened' : 'chatwoot:closed');
        },
      };
    },
  };
  const holder = () => byId[HOLDER_ID];
  // What the SDK's setUnreadMode does on each bot or founder reply (IFrameHelper.js):
  // addUnreadClass(), then onBubbleClick({ toggleValue: true }), which fires
  // chatwoot:opened. It does not go through $chatwoot.toggle, so `toggles` stays put.
  const sdkUnread = () => {
    holder().classList.add('has-unread-view');
    if (win.$chatwoot.isOpen) return;
    win.$chatwoot.isOpen = true;
    holder().classList.remove('woot--hide');
    fire('chatwoot:opened');
  };
  return { win, doc, byId, root, timers, observers, sdk, runs, toggles, holder, fire, sdkUnread };
};

// Click-to-load up to a ready, closed widget.
const readyDom = (opts) => {
  const d = fakeDom(opts);
  d.win.chatwootSDK = d.sdk;
  loadChatwoot(d.win, d.doc, CONFIG);
  d.byId[SCRIPT_ID].onload();
  d.fire('chatwoot:ready');
  return d;
};

describe('shouldHide', () => {
  test('checkout, payment and payout routes always hide, at every width', () => {
    expect(HIDE_ON_ROUTES).toEqual([
      'CheckoutPage',
      'PaymentMethodsPage',
      'StripePayoutPage',
      'StripePayoutOnboardingPage',
      'EditListingStripeOnboardingPage',
      'PayoutDashboardPage',
    ]);
    HIDE_ON_ROUTES.forEach((name) => {
      expect(shouldHide(name)).toBe(true);
      expect(shouldHide(name, { compact: false })).toBe(true);
      expect(shouldHide(name, { compact: true })).toBe(true);
    });
  });
  test('fixed-bar routes hide only at compact widths', () => {
    HIDE_ON_COMPACT_ROUTES.forEach((name) => {
      expect(shouldHide(name, { compact: false })).toBe(false);
      expect(shouldHide(name, { compact: true })).toBe(true);
    });
  });
  test('an open Modal or the /s filters sheet hides it everywhere; ordinary routes show it', () => {
    expect(shouldHide('LandingPage', { scrollLocked: true })).toBe(true);
    expect(shouldHide('SearchPage', { sheetOpen: true })).toBe(true);
    expect(shouldHide('SearchPage', { compact: true })).toBe(false);
    expect(shouldHide('HostDashboardPage', { compact: true })).toBe(false);
    expect(shouldHide(undefined)).toBe(false);
  });
});

describe('isSearchFiltersSheetOpen', () => {
  const st = (reqs) => ({ ui: { disableScrollRequests: reqs } });
  const req = (componentId, disableScrolling) => st([{ componentId, disableScrolling }]);
  test('true only while the SearchFiltersMobile modal holds the scroll lock', () => {
    expect(isSearchFiltersSheetOpen(req(SEARCH_FILTERS_SHEET_ID, true))).toBe(true);
    expect(isSearchFiltersSheetOpen(req(SEARCH_FILTERS_SHEET_ID, false))).toBe(false);
    expect(isSearchFiltersSheetOpen(req('TopbarMobileMenu', true))).toBe(false);
    expect(isSearchFiltersSheetOpen({})).toBe(false);
    expect(isSearchFiltersSheetOpen(undefined)).toBe(false);
  });
});

describe('config validation (fail closed)', () => {
  test('sanitizeToken accepts a base58 token and trims it', () => {
    expect(sanitizeToken(` ${TOKEN} `)).toBe(TOKEN);
    [undefined, null, '', 'short', 'abc"onload="x', '<script>', 'a'.repeat(65), 42].forEach((v) => {
      expect(sanitizeToken(v)).toBe('');
    });
  });
  test('sanitizeSri accepts only sha384- plus 64 base64 characters', () => {
    expect(sanitizeSri(` ${SRI}\n`)).toBe(SRI);
    [
      undefined,
      '',
      SRI.slice(0, -1),
      `${SRI}A`,
      SRI.replace('sha384', 'sha256'),
      SRI.replace('A', '"'),
      `${SRI} sha384-x`,
      'sha384-',
    ].forEach((v) => {
      expect(sanitizeSri(v)).toBe('');
    });
  });
  test('widgetConfig needs both values', () => {
    expect(widgetConfig(TOKEN, SRI)).toEqual({ token: TOKEN, sri: SRI });
    expect(widgetConfig(TOKEN, '')).toBe(null);
    expect(widgetConfig('', SRI)).toBe(null);
    expect(widgetConfig(undefined, undefined)).toBe(null);
  });
  test('loadChatwoot without a valid config inserts nothing', () => {
    const { win, doc, byId } = fakeDom();
    expect(loadChatwoot(win, doc, null)).toBe(false);
    expect(loadChatwoot(win, doc, { token: TOKEN })).toBe(false);
    expect(loadChatwoot(undefined, doc, CONFIG)).toBe(false);
    expect(byId[SCRIPT_ID]).toBeUndefined();
  });
});

describe('hasConversationCookie', () => {
  test('finds a non-empty cw_conversation cookie only', () => {
    expect(hasConversationCookie({ cookie: 'a=1; cw_conversation=eyJhbGc.x.y; b=2' })).toBe(true);
    expect(hasConversationCookie({ cookie: 'cw_conversation=abc' })).toBe(true);
    expect(hasConversationCookie({ cookie: 'cw_conversation=; b=2' })).toBe(false);
    expect(hasConversationCookie({ cookie: 'xcw_conversation=abc' })).toBe(false);
    expect(hasConversationCookie({ cookie: '' })).toBe(false);
    const throwing = {};
    Object.defineProperty(throwing, 'cookie', {
      get() {
        throw new Error('blocked');
      },
    });
    expect(hasConversationCookie(throwing)).toBe(false);
  });
});

describe('loading on demand', () => {
  test('nothing is fetched until the launcher is clicked', () => {
    const { win, doc, byId } = fakeDom();
    ensureStyle(doc);
    expect(byId[STYLE_ID].textContent).toBe(WIDGET_CSS);
    expect(byId[SCRIPT_ID]).toBeUndefined();
    expect(getChatSnapshot(win)).toEqual(IDLE_SNAPSHOT);
  });
  test('first click inserts sdk.js once, with integrity and crossorigin, and shows busy', () => {
    const { win, doc, byId } = fakeDom();
    toggleChat(win, doc, CONFIG);
    const s = byId[SCRIPT_ID];
    expect(s.src).toBe(sdkSrc(SRI));
    expect(s.src).toBe(`${CHATWOOT_BASE_URL}/packs/js/sdk.js?v=A1b2%2B%2FC3A1b2%2B%2FC3`);
    expect(s.integrity).toBe(SRI);
    expect(s.crossOrigin).toBe('anonymous');
    expect(getChatSnapshot(win)).toEqual({ phase: 'loading', view: 'closed', busy: true });
    expect(win.chatwootSettings).toMatchObject({
      position: 'left',
      hideMessageBubble: true,
      enableFileUpload: false,
      enableEndConversation: false,
      showPopoutButton: false,
    });
    expect(loadChatwoot(win, doc, CONFIG)).toBe(false);
  });
  test('onload runs the SDK with token and base URL; chatwoot:ready opens the chat', () => {
    const d = fakeDom();
    d.win.chatwootSDK = d.sdk;
    toggleChat(d.win, d.doc, CONFIG);
    d.byId[SCRIPT_ID].onload();
    expect(d.runs).toEqual([{ websiteToken: TOKEN, baseUrl: CHATWOOT_BASE_URL }]);
    expect(d.observers[0].target).toBe(d.holder());
    expect(d.observers[0].opts.attributeFilter).toEqual(['class']);
    expect(d.timers[0].ms).toBe(LOAD_TIMEOUT_MS);
    d.fire('chatwoot:ready');
    expect(d.toggles).toEqual(['open']);
    expect(getChatSnapshot(d.win)).toEqual({ phase: 'ready', view: 'open', busy: false });
    expect(d.root.classList.contains(OPEN_CLASS)).toBe(true);
    expect(d.timers[0].fn).toBe(null); // the load timeout was cancelled
  });
  test('the sdk.js URL changes with the SRI, so no cache can serve an old copy', () => {
    expect(SDK_URL).toBe(`${CHATWOOT_BASE_URL}/packs/js/sdk.js`);
    const other = `sha384-${'Zz09'.repeat(16)}`;
    expect(sdkSrc(other)).toBe(`${SDK_URL}?v=${'Zz09'.repeat(4)}`);
    expect(sdkSrc(other)).not.toBe(sdkSrc(SRI));
    expect(sdkSrc(SRI).startsWith(`${SDK_URL}?v=`)).toBe(true);
    // Only URL-safe characters after ?v= (base64 + and / are escaped).
    expect(sdkSrc(SRI).split('?v=')[1]).toMatch(/^[A-Za-z0-9%]+$/);
    const d = fakeDom();
    loadChatwoot(d.win, d.doc, widgetConfig(TOKEN, other));
    expect(d.byId[SCRIPT_ID].src).toBe(sdkSrc(other));
    expect(d.byId[SCRIPT_ID].integrity).toBe(other);
  });
  test('returning chatter: load without a click does not open the chat', () => {
    const d = readyDom({ cookie: 'cw_conversation=abc' });
    expect(d.toggles).toEqual([]);
    expect(getChatSnapshot(d.win)).toEqual({ phase: 'ready', view: 'closed', busy: false });
  });
});

describe('launcher toggle', () => {
  test('click opens, click again closes; the <html> class follows', () => {
    const d = readyDom();
    toggleChat(d.win, d.doc, CONFIG);
    expect(getChatSnapshot(d.win).view).toBe('open');
    expect(d.root.classList.contains(OPEN_CLASS)).toBe(true);
    toggleChat(d.win, d.doc, CONFIG);
    expect(getChatSnapshot(d.win).view).toBe('closed');
    expect(d.root.classList.contains(OPEN_CLASS)).toBe(false);
    expect(d.toggles).toEqual(['open', 'close']);
  });
  test('unread preview counts as showing, and a click opens the full chat', () => {
    const d = readyDom();
    d.holder().classList.add('has-unread-view'); // SDK setUnreadMode
    d.win.$chatwoot.toggle('open');
    expect(getChatSnapshot(d.win).view).toBe('unread');
    expect(d.root.classList.contains(OPEN_CLASS)).toBe(true);
    d.toggles.length = 0;
    toggleChat(d.win, d.doc, CONFIG);
    expect(d.toggles).toEqual(['close', 'open']);
    d.holder().classList.remove('has-unread-view'); // SDK resetUnreadMode
    d.observers[0].cb();
    expect(getChatSnapshot(d.win).view).toBe('open');
  });
  test('closing from inside the chat window hands focus back to the launcher', () => {
    const d = readyDom();
    let focused = 0;
    d.byId[LAUNCHER_ID] = {
      id: LAUNCHER_ID,
      focus: () => {
        focused += 1;
      },
    };
    toggleChat(d.win, d.doc, CONFIG);
    d.doc.activeElement = d.byId[FRAME_ID];
    d.win.$chatwoot.toggle('close'); // the widget's own close button
    expect(focused).toBe(1);
  });
  test('subscribers hear each change once', () => {
    const d = readyDom();
    let n = 0;
    const off = subscribeChat(d.win, () => {
      n += 1;
    });
    toggleChat(d.win, d.doc, CONFIG);
    d.observers[0].cb(); // the observer re-reads the same state: no extra notification
    expect(n).toBe(1);
    off();
    toggleChat(d.win, d.doc, CONFIG);
    expect(n).toBe(1);
  });
});

describe('hiding', () => {
  test('hidden: no load, clicks ignored, and an open chat is closed', () => {
    const d = fakeDom();
    setChatHidden(d.win, true);
    toggleChat(d.win, d.doc, CONFIG);
    expect(loadChatwoot(d.win, d.doc, CONFIG)).toBe(false);
    expect(d.byId[SCRIPT_ID]).toBeUndefined();

    const r = readyDom();
    toggleChat(r.win, r.doc, CONFIG);
    setChatHidden(r.win, true);
    expect(r.toggles).toEqual(['open', 'close']);
    expect(getChatSnapshot(r.win).view).toBe('closed');
  });
  test('a reply while hidden (checkout, modal) stays off screen, then shows on return', () => {
    const d = readyDom();
    toggleChat(d.win, d.doc, CONFIG); // the visitor asks something, then goes to book
    setChatHidden(d.win, true); // SPA navigation to checkout: the chat closes
    expect(d.toggles).toEqual(['open', 'close']);
    expect(d.root.classList.contains(HIDDEN_CLASS)).toBe(true);
    expect(d.root.classList.contains(OPEN_CLASS)).toBe(false);
    d.sdkUnread(); // the bot or Derek replies: the SDK opens its unread preview
    d.observers[0].cb();
    // Recorded, not fought: no toggle from us (closing would mark the reply read),
    // and the <html> class keeps the preview invisible.
    expect(d.toggles).toEqual(['open', 'close']);
    expect(getChatSnapshot(d.win).view).toBe('unread');
    expect(d.root.classList.contains(HIDDEN_CLASS)).toBe(true);
    expect(d.root.classList.contains(OPEN_CLASS)).toBe(false); // #prnm-cta is left alone
    expect(WIDGET_CSS).toContain(
      `html.${HIDDEN_CLASS} #${HOLDER_ID} { visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }`
    );
    toggleChat(d.win, d.doc, CONFIG); // no launcher while hidden; a stray click does nothing
    expect(d.toggles).toEqual(['open', 'close']);
    setChatHidden(d.win, false); // back on a page where the widget shows
    expect(d.root.classList.contains(HIDDEN_CLASS)).toBe(false);
    expect(d.root.classList.contains(OPEN_CLASS)).toBe(true); // the preview is on screen now
    expect(getChatSnapshot(d.win).view).toBe('unread');
    toggleChat(d.win, d.doc, CONFIG); // a click opens the full chat from the preview
    expect(d.toggles).toEqual(['open', 'close', 'close', 'open']);
  });
  test('the hidden class follows hide and show even before sdk.js loads', () => {
    const d = fakeDom();
    setChatHidden(d.win, true);
    expect(d.root.classList.contains(HIDDEN_CLASS)).toBe(true);
    setChatHidden(d.win, false);
    expect(d.root.classList.contains(HIDDEN_CLASS)).toBe(false);
    expect(d.root.classList.contains(OPEN_CLASS)).toBe(false);
    expect(() => setChatHidden({}, true)).not.toThrow(); // a window without a document
  });
  test('hidden while loading: the pending open is dropped', () => {
    const d = fakeDom();
    d.win.chatwootSDK = d.sdk;
    toggleChat(d.win, d.doc, CONFIG);
    setChatHidden(d.win, true);
    d.byId[SCRIPT_ID].onload();
    d.fire('chatwoot:ready');
    expect(d.toggles).toEqual([]);
    setChatHidden(d.win, false);
    expect(d.toggles).toEqual([]);
  });
});

describe('failures', () => {
  test('script error (SRI mismatch, network, CSP) -> failed; clicks do nothing more', () => {
    const d = fakeDom();
    toggleChat(d.win, d.doc, CONFIG);
    d.byId[SCRIPT_ID].onerror();
    expect(getChatSnapshot(d.win)).toEqual({ phase: 'failed', view: 'closed', busy: false });
    toggleChat(d.win, d.doc, CONFIG);
    expect(getChatSnapshot(d.win).phase).toBe('failed');
  });
  test('missing or throwing SDK -> failed, never throws', () => {
    const d = fakeDom();
    toggleChat(d.win, d.doc, CONFIG);
    expect(() => d.byId[SCRIPT_ID].onload()).not.toThrow();
    expect(getChatSnapshot(d.win).phase).toBe('failed');
    const e = fakeDom();
    e.win.chatwootSDK = {
      run: () => {
        throw new Error('boom');
      },
    };
    toggleChat(e.win, e.doc, CONFIG);
    expect(() => e.byId[SCRIPT_ID].onload()).not.toThrow();
    expect(getChatSnapshot(e.win).phase).toBe('failed');
  });
  test('no chatwoot:ready within the timeout -> failed; a late ready still recovers', () => {
    const d = fakeDom();
    d.win.chatwootSDK = d.sdk;
    toggleChat(d.win, d.doc, CONFIG);
    d.byId[SCRIPT_ID].onload();
    d.timers[0].fn();
    expect(getChatSnapshot(d.win).phase).toBe('failed');
    d.fire('chatwoot:ready');
    expect(getChatSnapshot(d.win).phase).toBe('ready');
    expect(d.toggles).toEqual([]); // the click was long ago: do not pop open now
  });
  test('a broken $chatwoot never throws into the page', () => {
    const d = readyDom();
    d.win.$chatwoot.toggle = () => {
      throw new Error('x');
    };
    expect(() => toggleChat(d.win, d.doc, CONFIG)).not.toThrow();
    expect(() => setChatHidden(d.win, true)).not.toThrow();
    expect(() => setChatHidden(undefined, true)).not.toThrow();
    expect(() => toggleChat(undefined, d.doc, CONFIG)).not.toThrow();
  });
});

describe('CSS', () => {
  test('launcher and panel rules are present; the old bubble overrides are gone', () => {
    expect(WIDGET_CSS).toContain(`#${LAUNCHER_ID} {`);
    expect(WIDGET_CSS).toContain('html.prnm-cw-open #prnm-cta { display: none !important; }');
    expect(WIDGET_CSS).not.toContain('.woot-widget-bubble');
  });
  test('the open card is capped at 640px on tablets as on desktop', () => {
    const tablet = WIDGET_CSS.split('@media (min-width: 667px) and (max-width: 1024px) {')[1];
    expect(tablet.split('}')[0]).toContain('max-height: min(640px, calc(100% - 156px)) !important');
    expect(WIDGET_CSS).toContain('max-height: min(640px, calc(100% - 96px)) !important');
  });
});
