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

// Minimal DOM stand-in: enough for the loader (no jsdom dependency).
//
// The fake SDK models Chatwoot as read from the v4.19.1 tag (4.16.2 is the same on
// these paths), both sides of the iframe:
// - Parent page (sdk/bubbleHelpers.js, sdk/IFrameHelper.js): run() creates
//   #cw-widget-holder (woot--hide). $chatwoot.toggle(how) is onBubbleClick: nothing
//   when already in that state, else flip woot--hide, post toggle-open {isOpen} to
//   the iframe, fire chatwoot:opened / chatwoot:closed. setUnreadMode adds
//   has-unread-view and opens; resetUnreadMode removes has-unread-view.
// - Inside the iframe (widget/App.vue): toggle-open sets isWidgetOpen; opening on
//   'home' with messages goes to 'messages'. CLOSING on 'unread-messages' (or
//   'campaigns') runs conversation/setUserLastSeen (counted in app.seen: the reply
//   is now read), posts resetUnreadMode and goes 'home'. A bot or founder reply
//   (agentReply) is marked seen at once only while the chat is open on 'messages';
//   if the widget is closed it goes to 'unread-messages' and posts setUnreadMode;
//   if the preview already shows, it only grows.
// postMessage both ways and MutationObserver records are asynchronous: they queue
// up and flush() delivers them.
const fakeDom = ({ cookie = '', messages = 0 } = {}) => {
  const byId = {};
  const listeners = {};
  const timers = [];
  const observers = [];
  const queue = [];
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
  const app = { route: 'home', isWidgetOpen: false, messages, unread: 0, seen: 0 };
  const later = (fn) => queue.push(fn);
  const flush = () => {
    for (let i = 0; queue.length; i += 1) {
      if (i > 1000) throw new Error('fake SDK did not settle');
      queue.shift()();
    }
  };
  const holder = () => byId[HOLDER_ID];
  const mutated = () => later(() => observers.forEach((o) => o.target === holder() && o.cb()));
  const setUserLastSeen = () => {
    if (!app.messages) return;
    app.seen += 1;
    app.unread = 0;
  };
  let toParent;
  // widget/App.vue registerListeners, 'toggle-open'
  const toIframe = (msg) =>
    later(() => {
      if (msg.event !== 'toggle-open') return;
      app.isWidgetOpen = msg.isOpen;
      if (app.route === 'home' && msg.isOpen && app.messages) app.route = 'messages';
      if (!msg.isOpen && ['unread-messages', 'campaigns'].includes(app.route)) {
        setUserLastSeen();
        toParent({ event: 'resetUnreadMode' });
        app.route = 'home';
      }
    });
  // sdk/bubbleHelpers.js onBubbleClick
  const onBubbleClick = (toggleValue) => {
    const { isOpen } = win.$chatwoot;
    if (isOpen === toggleValue) return;
    const next = toggleValue === undefined ? !isOpen : toggleValue;
    win.$chatwoot.isOpen = next;
    holder().classList.toggle('woot--hide');
    mutated();
    toIframe({ event: 'toggle-open', isOpen: next });
    fire(next ? 'chatwoot:opened' : 'chatwoot:closed');
  };
  // sdk/IFrameHelper.js events
  toParent = (msg) =>
    later(() => {
      if (msg.event === 'setUnreadMode') {
        holder().classList.add('has-unread-view');
        mutated();
        onBubbleClick(true);
      } else if (msg.event === 'resetUnreadMode') {
        holder().classList.remove('has-unread-view');
        mutated();
      }
    });
  // widget/App.vue registerUnreadEvents (ON_AGENT_MESSAGE_RECEIVED) + setUnreadView
  const agentReply = () => {
    app.messages += 1;
    app.unread += 1;
    if (app.isWidgetOpen && app.route === 'messages') setUserLastSeen();
    if (app.route === 'unread-messages') return; // the preview on screen just grows
    if (app.unread > 0 && !app.isWidgetOpen) {
      app.route = 'unread-messages';
      toParent({ event: 'setUnreadMode' });
    }
  };
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
      const h = el('div');
      h.id = HOLDER_ID;
      h.classList.add('woot-widget-holder', 'woot--hide', 'woot-elements--left');
      byId[HOLDER_ID] = h;
      const frame = el('iframe');
      frame.id = FRAME_ID;
      byId[FRAME_ID] = frame;
      win.$chatwoot = {
        isOpen: false,
        // sdk.js: toggle(state) -> IFrameHelper.events.toggleBubble -> onBubbleClick
        toggle: (how) => {
          toggles.push(how);
          onBubbleClick({ open: true, close: false }[how]);
        },
      };
    },
  };
  // `toggles` records only $chatwoot.toggle calls (the loader's); setUnreadMode
  // opens through onBubbleClick directly, as the real SDK does.
  return {
    win,
    doc,
    byId,
    root,
    timers,
    observers,
    sdk,
    runs,
    toggles,
    holder,
    fire,
    app,
    agentReply,
    flush,
  };
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
    const d = readyDom({ messages: 1 });
    d.agentReply(); // the bot or Derek replies while the chat is closed
    d.flush();
    expect(d.app.route).toBe('unread-messages');
    expect(getChatSnapshot(d.win).view).toBe('unread');
    expect(d.root.classList.contains(OPEN_CLASS)).toBe(true);
    expect(d.toggles).toEqual([]); // the SDK opened its preview itself
    toggleChat(d.win, d.doc, CONFIG);
    expect(d.toggles).toEqual(['close', 'open']);
    d.flush(); // App.vue: resetUnreadMode, then the messages view
    expect(d.holder().classList.contains('has-unread-view')).toBe(false);
    expect(d.app.route).toBe('messages');
    expect(getChatSnapshot(d.win).view).toBe('open');
  });
  test('the fake SDK is App.vue: closing the preview marks the reply read and dismisses it', () => {
    const d = readyDom({ messages: 1 });
    d.agentReply();
    d.flush();
    expect(d.app.seen).toBe(0);
    d.win.$chatwoot.toggle('close');
    d.flush();
    expect(d.app.seen).toBe(1);
    expect(d.app.unread).toBe(0);
    expect(d.app.route).toBe('home');
    expect(d.holder().classList.contains('has-unread-view')).toBe(false);
    expect(getChatSnapshot(d.win).view).toBe('closed');
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

    const r = readyDom({ messages: 1 });
    toggleChat(r.win, r.doc, CONFIG);
    r.flush();
    setChatHidden(r.win, true);
    r.flush();
    expect(r.toggles).toEqual(['open', 'close']);
    expect(getChatSnapshot(r.win).view).toBe('closed');
    setChatHidden(r.win, false); // the full chat does not come back by itself
    expect(getChatSnapshot(r.win).view).toBe('closed');
    expect(r.root.classList.contains(OPEN_CLASS)).toBe(false);
  });
  test('a reply while hidden (checkout, modal) stays off screen, then shows on return', () => {
    const d = readyDom({ messages: 1 });
    toggleChat(d.win, d.doc, CONFIG); // the visitor asks something, then goes to book
    d.flush();
    setChatHidden(d.win, true); // SPA navigation to checkout: the chat closes
    d.flush();
    expect(d.toggles).toEqual(['open', 'close']);
    expect(d.root.classList.contains(HIDDEN_CLASS)).toBe(true);
    expect(d.root.classList.contains(OPEN_CLASS)).toBe(false);
    d.agentReply(); // the bot or Derek replies: the SDK opens its unread preview
    d.flush();
    // Recorded, not fought: no toggle from us (closing would mark the reply read),
    // and the <html> class keeps the preview invisible.
    expect(d.toggles).toEqual(['open', 'close']);
    expect(d.app.seen).toBe(0);
    expect(getChatSnapshot(d.win).view).toBe('unread');
    expect(d.root.classList.contains(HIDDEN_CLASS)).toBe(true);
    expect(d.root.classList.contains(OPEN_CLASS)).toBe(false); // #prnm-cta is left alone
    expect(WIDGET_CSS).toContain(
      `html.${HIDDEN_CLASS} #${HOLDER_ID} { visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }`
    );
    toggleChat(d.win, d.doc, CONFIG); // no launcher while hidden; a stray click does nothing
    expect(d.toggles).toEqual(['open', 'close']);
    setChatHidden(d.win, false); // back on a page where the widget shows
    d.flush();
    expect(d.root.classList.contains(HIDDEN_CLASS)).toBe(false);
    expect(d.root.classList.contains(OPEN_CLASS)).toBe(true); // the preview is on screen now
    expect(getChatSnapshot(d.win).view).toBe('unread');
    expect(d.app.seen).toBe(0);
    toggleChat(d.win, d.doc, CONFIG); // a click opens the full chat from the preview
    d.flush();
    expect(d.toggles).toEqual(['open', 'close', 'close', 'open']);
    expect(getChatSnapshot(d.win).view).toBe('open');
  });
  test('a preview on screen when hiding starts is not closed (that marks it read) and is back on return', () => {
    // Returning chatter on /s; Derek's reply opens the preview; the visitor then taps
    // into a listing (hidden at <=1024px), checkout, a modal or the mobile menu.
    const d = readyDom({ cookie: 'cw_conversation=abc', messages: 2 });
    d.agentReply();
    d.flush();
    expect(getChatSnapshot(d.win).view).toBe('unread');
    expect(d.root.classList.contains(OPEN_CLASS)).toBe(true);
    setChatHidden(d.win, true);
    d.flush();
    expect(d.toggles).toEqual([]); // no toggle('close'): App.vue would mark the reply seen
    expect(d.app.seen).toBe(0);
    expect(d.app.unread).toBe(1);
    expect(d.app.route).toBe('unread-messages');
    expect(d.holder().classList.contains('has-unread-view')).toBe(true);
    expect(d.holder().classList.contains('woot--hide')).toBe(false);
    expect(getChatSnapshot(d.win).view).toBe('unread');
    expect(d.root.classList.contains(HIDDEN_CLASS)).toBe(true); // invisible and unclickable
    expect(d.root.classList.contains(OPEN_CLASS)).toBe(false);
    d.agentReply(); // a second reply while hidden: the same preview grows, still unread
    d.flush();
    expect(d.toggles).toEqual([]);
    expect(d.app.seen).toBe(0);
    expect(d.app.unread).toBe(2);
    setChatHidden(d.win, false); // back on /s
    d.flush();
    expect(d.root.classList.contains(HIDDEN_CLASS)).toBe(false);
    expect(d.root.classList.contains(OPEN_CLASS)).toBe(true);
    expect(getChatSnapshot(d.win).view).toBe('unread');
    expect(d.app.seen).toBe(0);
    // Hide and show again several times (listing, back, checkout, back): still there.
    [true, false, true, false].forEach((h) => {
      setChatHidden(d.win, h);
      d.flush();
    });
    expect(d.toggles).toEqual([]);
    expect(d.app.seen).toBe(0);
    expect(getChatSnapshot(d.win).view).toBe('unread');
    toggleChat(d.win, d.doc, CONFIG); // the visitor reads it: only now is it marked seen
    d.flush();
    expect(d.toggles).toEqual(['close', 'open']);
    expect(d.app.seen).toBe(1);
    expect(getChatSnapshot(d.win).view).toBe('open');
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
  // The rules of one @media block, by its exact query.
  const mediaBlock = (query) => {
    const parts = WIDGET_CSS.split(`\n@media ${query} {\n`);
    expect(parts.length).toBe(2);
    return parts[1].split('\n}\n')[0].split('\n');
  };
  const OPEN_CARD =
    '.woot-widget-holder.woot-elements--left:not(.woot--hide):not(.has-unread-view) {';
  const PREVIEW = '.woot-widget-holder.has-unread-view.woot-elements--left:not(.woot--hide) {';
  test('the open card is capped at 640px on tablets as on desktop', () => {
    const tablet = mediaBlock('(min-width: 667px) and (max-width: 1024px)');
    expect(tablet[0]).toContain('max-height: min(640px, calc(100% - 156px)) !important');
    expect(WIDGET_CSS).toContain('max-height: min(640px, calc(100% - 96px)) !important');
  });
  test('tablets: the open card leaves the sticky top bar free (1024x768 card top was 24.8px)', () => {
    const tablet = mediaBlock('(min-width: 667px) and (max-width: 1024px)');
    expect(tablet).toHaveLength(2);
    expect(tablet[0]).toContain(
      'bottom: calc(136px + env(safe-area-inset-bottom, 0px)) !important'
    );
    expect(tablet[0]).toContain('min-height: 0 !important');
    // The open card only (the preview keeps 156px, so a short preview is not cut).
    expect(tablet[1]).toBe(
      `  ${OPEN_CARD} max-height: min(640px, calc(100% - 216px)) !important; }`
    );
    // 136px bottom offset + 68px for the top bar (WEST 60px, EAST 65px) + 12px gap.
    const top = (h) => h - 136 - Math.min(640, 0.9 * h - 84, h - 216); // SDK height: calc(90% - 84px)
    [
      [768, 80],
      [600, 80],
      [500, 80],
      [1366, 590],
    ].forEach(([h, want]) => expect(top(h)).toBeCloseTo(want, 5));
    expect(466 - 216).toBe(250); // the SDK's own min-height: below this, short-landscape mode
  });
  test('short landscape: full-height chat beside the launcher tile, never over it', () => {
    const short = mediaBlock('(min-width: 667px) and (max-width: 1024px) and (max-height: 465px)');
    expect(short).toHaveLength(3);
    const tile = WIDGET_CSS.split('@media (max-width: 480px) {\n')[1].split('\n')[0];
    expect(short[0]).toBe(tile); // the same 48x52 tile as on phones, at left 10px
    expect(tile).toContain('left: 10px; width: 48px;');
    expect(short[1].startsWith(`  ${OPEN_CARD} `)).toBe(true);
    [
      'top: env(safe-area-inset-top, 0px) !important',
      'bottom: env(safe-area-inset-bottom, 0px) !important',
      'left: 68px !important', // 10px + 48px tile + 10px: the launcher stays uncovered
      'max-height: none !important',
    ].forEach((d) => expect(short[1]).toContain(d));
    const phonePreview = mediaBlock('(max-width: 666px)');
    expect(short[2]).toBe(phonePreview[0]); // the preview sits above the tile, as on phones
    expect(short[2].startsWith(`  ${PREVIEW} `)).toBe(true);
  });
});
