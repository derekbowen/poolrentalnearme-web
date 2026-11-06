// bun test src/components/ChatwootWidget/chatwootLoader.test.js
import {
  CHATWOOT_BASE_URL,
  HIDE_ON_COMPACT_ROUTES,
  HIDE_ON_ROUTES,
  OPEN_CLASS,
  SCRIPT_ID,
  STYLE_ID,
  loadChatwoot,
  sanitizeToken,
  setChatwootVisible,
  shouldHide,
} from './chatwootLoader';

const TOKEN = 'AbCdEf1234567890xyzQ';

// Minimal DOM stand-in: enough for the loader (no jsdom dependency).
const fakeDom = () => {
  const byId = {};
  const listeners = {};
  const classes = new Set();
  const append = (el) => {
    if (el.id) byId[el.id] = el;
  };
  const doc = {
    getElementById: (id) => byId[id] || null,
    createElement: (tag) => ({ tagName: tag, id: '' }),
    head: { appendChild: append },
    body: { appendChild: append },
    documentElement: {
      classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) },
    },
  };
  const win = {
    addEventListener: (name, fn) => {
      listeners[name] = listeners[name] || [];
      listeners[name].push(fn);
    },
    fire: (name) => (listeners[name] || []).forEach((fn) => fn()),
  };
  return { win, doc, byId, classes };
};

describe('shouldHide', () => {
  test('payment and payout form routes always hide', () => {
    HIDE_ON_ROUTES.forEach((name) => {
      expect(shouldHide(name)).toBe(true);
      expect(shouldHide(name, { compact: true })).toBe(true);
    });
  });
  test('fixed-bar routes hide only at compact widths', () => {
    HIDE_ON_COMPACT_ROUTES.forEach((name) => {
      expect(shouldHide(name, { compact: false })).toBe(false);
      expect(shouldHide(name, { compact: true })).toBe(true);
    });
  });
  test('an open Modal hides it everywhere; ordinary routes and NotFound show it', () => {
    expect(shouldHide('LandingPage', { scrollLocked: true })).toBe(true);
    expect(shouldHide('SearchPage', { compact: true })).toBe(false);
    expect(shouldHide('PayoutDashboardPage')).toBe(false);
    expect(shouldHide(undefined)).toBe(false);
  });
});

describe('sanitizeToken', () => {
  test('accepts a base58 token and trims it', () => {
    expect(sanitizeToken(` ${TOKEN} `)).toBe(TOKEN);
  });
  test('rejects unset, short, and anything that is not a plain token', () => {
    [undefined, null, '', 'short', 'abc"onload="x', '<script>', 'a'.repeat(65), 42].forEach((v) => {
      expect(sanitizeToken(v)).toBe('');
    });
  });
});

describe('loadChatwoot', () => {
  test('inserts style + script once, bottom-left, no file upload', () => {
    const { win, doc, byId } = fakeDom();
    expect(loadChatwoot(win, doc, TOKEN)).toBe(true);
    expect(loadChatwoot(win, doc, TOKEN)).toBe(false);
    expect(byId[SCRIPT_ID].src).toBe(`${CHATWOOT_BASE_URL}/packs/js/sdk.js`);
    expect(byId[STYLE_ID].textContent).toContain('#prnm-cta');
    expect(win.chatwootSettings.position).toBe('left');
    expect(win.chatwootSettings.enableFileUpload).toBe(false);
  });
  test('no token or no window: nothing happens', () => {
    const { win, doc, byId } = fakeDom();
    expect(loadChatwoot(win, doc, '')).toBe(false);
    expect(loadChatwoot(undefined, doc, TOKEN)).toBe(false);
    expect(byId[SCRIPT_ID]).toBeUndefined();
  });
  test('onload runs the SDK with the token and base URL; a throwing SDK is contained', () => {
    const { win, doc, byId } = fakeDom();
    const calls = [];
    win.chatwootSDK = { run: (o) => calls.push(o) };
    loadChatwoot(win, doc, TOKEN);
    byId[SCRIPT_ID].onload();
    expect(calls).toEqual([{ websiteToken: TOKEN, baseUrl: CHATWOOT_BASE_URL }]);
    win.chatwootSDK = {
      run: () => {
        throw new Error('boom');
      },
    };
    expect(() => byId[SCRIPT_ID].onload()).not.toThrow();
  });
  test('open/close events toggle the <html> class that hides #prnm-cta', () => {
    const { win, doc, classes } = fakeDom();
    loadChatwoot(win, doc, TOKEN);
    win.fire('chatwoot:opened');
    expect(classes.has(OPEN_CLASS)).toBe(true);
    win.fire('chatwoot:closed');
    expect(classes.has(OPEN_CLASS)).toBe(false);
  });
});

describe('setChatwootVisible', () => {
  test('before ready: remembered and applied on chatwoot:ready', () => {
    const { win, doc } = fakeDom();
    loadChatwoot(win, doc, TOKEN);
    const seen = [];
    win.$chatwoot = {
      isOpen: false,
      toggleBubbleVisibility: (v) => seen.push(v),
      toggle: () => {},
    };
    setChatwootVisible(win, false);
    expect(seen).toEqual([]);
    expect(win.chatwootSettings.hideMessageBubble).toBe(true);
    win.fire('chatwoot:ready');
    expect(seen).toEqual(['hide']);
  });
  test('after ready: hiding closes an open chat first; showing shows the launcher', () => {
    const { win, doc } = fakeDom();
    loadChatwoot(win, doc, TOKEN);
    const seen = [];
    win.$chatwoot = {
      isOpen: true,
      toggle: (v) => seen.push(`toggle:${v}`),
      toggleBubbleVisibility: (v) => seen.push(v),
    };
    win.fire('chatwoot:ready');
    setChatwootVisible(win, false);
    setChatwootVisible(win, true);
    expect(seen).toEqual(['show', 'toggle:close', 'hide', 'show']);
  });
  test('never throws, even with a broken SDK or no window', () => {
    expect(() => setChatwootVisible(undefined, true)).not.toThrow();
    const { win, doc } = fakeDom();
    loadChatwoot(win, doc, TOKEN);
    win.$chatwoot = {
      toggleBubbleVisibility: () => {
        throw new Error('x');
      },
    };
    win.fire('chatwoot:ready');
    expect(() => setChatwootVisible(win, true)).not.toThrow();
  });
});
