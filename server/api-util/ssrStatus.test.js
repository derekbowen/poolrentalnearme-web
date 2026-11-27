const nodeFs = require('fs');
const nodePath = require('path');
const {
  isNotFoundContext,
  isNotFoundLocals,
  resolveRenderStatus,
  NOT_FOUND_ROUTE_NAME,
} = require('./ssrStatus');

describe('isNotFoundLocals()', () => {
  it('is false for a normal render', () => {
    expect(isNotFoundLocals({})).toBe(false);
    expect(isNotFoundLocals({ ssrSignal: { notFound: false } })).toBe(false);
    expect(isNotFoundLocals(undefined)).toBe(false);
    expect(isNotFoundLocals(null)).toBe(false);
  });

  it('honours the c194 router-miss flag', () => {
    expect(isNotFoundLocals({ ssrNotFound: true })).toBe(true);
  });

  it('honours the render-time signal: a matched route that rendered NotFoundPage', () => {
    // A dead listing id, a CMS page with no asset, or /P/How-It-Works matched
    // case-insensitively all land here — the router is happy, the page is not.
    expect(isNotFoundLocals({ ssrSignal: { notFound: true } })).toBe(true);
  });

  it('does not treat a truthy non-boolean as a miss', () => {
    expect(isNotFoundLocals({ ssrNotFound: 'yes' })).toBe(false);
    expect(isNotFoundLocals({ ssrSignal: { notFound: 'yes' } })).toBe(false);
    expect(isNotFoundLocals({ ssrSignal: 'notFound' })).toBe(false);
  });

  it('still yields a 404 through resolveRenderStatus, and a 500 still wins', () => {
    expect(resolveRenderStatus(200, isNotFoundLocals({ ssrSignal: { notFound: true } }))).toBe(404);
    expect(resolveRenderStatus(500, isNotFoundLocals({ ssrSignal: { notFound: true } }))).toBe(500);
  });
});

const ctx = (...names) => ({ matches: names.map(name => ({ route: { name } })) });

describe('isNotFoundContext()', () => {
  it('detects the catch-all not-found route as a miss', () => {
    expect(isNotFoundContext(ctx('NotFoundPage'))).toBe(true);
    expect(isNotFoundContext(ctx('RootRoute', 'NotFoundPage'))).toBe(true);
  });

  it('treats real routes as found — these must keep returning 200', () => {
    ['SearchPage', 'ListingPage', 'CheckoutPage', 'LoginPage', 'LandingPage',
     'ProfilePage', 'InboxPage', 'EditListingPage'].forEach(name => {
      expect(isNotFoundContext(ctx('RootRoute', name))).toBe(false);
    });
  });

  it('uses the LEAF route, not an ancestor', () => {
    // a parent must never make a real page look missing
    expect(isNotFoundContext(ctx('NotFoundPage', 'ListingPage'))).toBe(false);
  });

  it('honours an explicit router 404', () => {
    expect(isNotFoundContext({ statusCode: 404, matches: [] })).toBe(true);
  });

  it('does not treat a redirect Response as a miss', () => {
    // a loader redirect has its own status and must not become a 404
    const res = new Response(null, { status: 302, headers: { Location: '/s' } });
    expect(isNotFoundContext(res)).toBe(false);
  });

  it('is safe on malformed input', () => {
    [null, undefined, 'nope', 42].forEach(v => {
      expect(isNotFoundContext(v)).toBe(false);
    });
  });

  it('exports the route name routeConfiguration actually uses', () => {
    expect(NOT_FOUND_ROUTE_NAME).toEqual('NotFoundPage');
  });
});

describe('resolveRenderStatus()', () => {
  it('returns 404 only for a miss', () => {
    expect(resolveRenderStatus(200, true)).toEqual(404);
    expect(resolveRenderStatus(200, false)).toEqual(200);
  });

  it('never downgrades a shell error to 404', () => {
    expect(resolveRenderStatus(500, true)).toEqual(500);
    expect(resolveRenderStatus(500, false)).toEqual(500);
  });
});

const ssrStatusMod = require('./ssrStatus');

describe('canonicalPath', () => {
  const { canonicalPath } = ssrStatusMod;
  it('lowercases and strips a trailing slash, keeping the root', () => {
    expect(canonicalPath('/P/How-It-Works')).toBe('/p/how-it-works');
    expect(canonicalPath('/p/how-it-works/')).toBe('/p/how-it-works');
    expect(canonicalPath('/S/')).toBe('/s');
    expect(canonicalPath('/')).toBe('/');
    expect(canonicalPath('')).toBe('/');
  });
  it('collapses doubled slashes', () => {
    expect(canonicalPath('//p//faq')).toBe('/p/faq');
  });
  it('leaves an already-canonical path alone', () => {
    expect(canonicalPath('/l/backyard-oasis/6a94fb19-0000-0000-0000-000000000000')).toBe(
      '/l/backyard-oasis/6a94fb19-0000-0000-0000-000000000000'
    );
  });
});

describe('resolveCanonicalRedirect — recognised alternates 301, unknown slugs 404', () => {
  const { resolveCanonicalRedirect } = ssrStatusMod;
  const get = (path, search = '') => ({ method: 'GET', path, search });

  it('/P/FAQ that rendered a real page → one 301 to /p/faq', () => {
    expect(resolveCanonicalRedirect(get('/P/FAQ'), false)).toBe('/p/faq');
  });
  it('/P/FAQ whose page does not exist → no redirect (the 404 stands)', () => {
    expect(resolveCanonicalRedirect(get('/P/FAQ'), true)).toBeNull();
  });
  it('unknown CMS slug → 404, never a hop', () => {
    expect(resolveCanonicalRedirect(get('/p/no-such-page'), true)).toBeNull();
    expect(resolveCanonicalRedirect(get('/p/No-Such-Page/'), true)).toBeNull();
  });
  it('missing listing id → 404, never a hop', () => {
    expect(
      resolveCanonicalRedirect(get('/l/some-pool/00000000-0000-0000-0000-000000000000'), true)
    ).toBeNull();
  });
  it('trailing-slash variants of real pages → 301 without the slash', () => {
    expect(resolveCanonicalRedirect(get('/p/how-it-works/'), false)).toBe('/p/how-it-works');
    expect(resolveCanonicalRedirect(get('/s/'), false)).toBe('/s');
    expect(resolveCanonicalRedirect(get('/'), false)).toBeNull();
  });
  it('double-prefix paths are unknown routes → 404', () => {
    expect(resolveCanonicalRedirect(get('/p/p/how-it-works'), true)).toBeNull();
    expect(resolveCanonicalRedirect(get('/l/l/some-pool/abc'), true)).toBeNull();
  });
  it('keeps the query string byte-for-byte (search params are case-significant)', () => {
    expect(resolveCanonicalRedirect(get('/S/', '?address=Lancaster%2C%20PA'), false)).toBe(
      '/s?address=Lancaster%2C%20PA'
    );
  });
  it('reads the query from an express request (originalUrl), untouched', () => {
    expect(
      resolveCanonicalRedirect({ method: 'GET', path: '/P/FAQ/', originalUrl: '/P/FAQ/?a=B%20c' }, false)
    ).toBe('/p/faq?a=B%20c');
  });
  it('canonical path that rendered → nothing to do', () => {
    expect(resolveCanonicalRedirect(get('/p/how-it-works'), false)).toBeNull();
  });
  it('never redirects a non-GET', () => {
    expect(resolveCanonicalRedirect({ method: 'POST', path: '/P/FAQ', search: '' }, false)).toBeNull();
  });
  it('a router-level miss (channel 1) is a 404 even in an alternate spelling', () => {
    const locals = { ssrNotFound: true };
    expect(resolveCanonicalRedirect(get('/Unknown-Route/'), ssrStatusMod.isNotFoundLocals(locals))).toBeNull();
  });
});

describe('isMalformedEntityPath — ids that can never resolve are 404 before render', () => {
  const { isMalformedEntityPath } = ssrStatusMod;
  const UUID = '6a94fb19-fb02-4392-86fa-b32a205afdf1';
  it('flags non-UUID listing ids, including the double-prefix form', () => {
    expect(isMalformedEntityPath('/l/some-pool/abc')).toBe(true);
    expect(isMalformedEntityPath('/l/l/some-pool/abc')).toBe(true);
    expect(isMalformedEntityPath('/l/some-pool/abc/xyz')).toBe(true);
    expect(isMalformedEntityPath('/L/Some-Pool/abc')).toBe(true);
  });
  it('flags non-UUID profile ids', () => {
    expect(isMalformedEntityPath('/u/abc')).toBe(true);
    expect(isMalformedEntityPath('/u/abc/listings')).toBe(true);
  });
  it('leaves real ids and id-less listing routes alone', () => {
    expect(isMalformedEntityPath(`/l/some-pool/${UUID}`)).toBe(false);
    expect(isMalformedEntityPath(`/l/some-pool/${UUID}/pending-approval`)).toBe(false);
    expect(isMalformedEntityPath(`/l/draft/${UUID}/new/details`)).toBe(false);
    expect(isMalformedEntityPath('/l/new')).toBe(false);
    expect(isMalformedEntityPath(`/u/${UUID}`)).toBe(false);
    expect(isMalformedEntityPath('/p/how-it-works')).toBe(false);
    expect(isMalformedEntityPath('/')).toBe(false);
  });
  it('is read by isNotFoundLocals so the status and the no-redirect rule follow', () => {
    const locals = { ssrMalformed: true };
    expect(ssrStatusMod.isNotFoundLocals(locals)).toBe(true);
    expect(ssrStatusMod.resolveRenderStatus(200, ssrStatusMod.isNotFoundLocals(locals))).toBe(404);
    expect(
      ssrStatusMod.resolveCanonicalRedirect({ method: 'GET', path: '/L/L/Some-Pool/abc', originalUrl: '/L/L/Some-Pool/abc' }, true)
    ).toBeNull();
  });
});

describe('resolveListingRedirect — every listing spelling 301s once to /l/<slug>/<id>', () => {
  const { resolveListingRedirect } = require('./ssrStatus');
  const ID = '689d6690-2fad-40ab-bf82-f89b07771533';
  const CANON = `/l/the-orange-grove-lagoon/${ID}`;
  const signal = { notFound: false, canonicalPath: CANON };
  const get = (path, query = '') => ({ method: 'GET', path, originalUrl: path + query });

  it('redirects the bare id form', () => {
    expect(resolveListingRedirect(get(`/l/${ID}`), signal, false)).toBe(CANON);
  });

  it('redirects a stale or wrong slug, keeping the query (share attribution)', () => {
    expect(
      resolveListingRedirect(get(`/l/the-orange-grove-lagoon-689d6690/${ID}`, '?ref=host-share'), signal, false)
    ).toBe(`${CANON}?ref=host-share`);
  });

  it('leaves the canonical path alone — no loop', () => {
    expect(resolveListingRedirect(get(CANON), signal, false)).toBeNull();
    expect(resolveListingRedirect(get(CANON, '?orderOpen=true'), signal, false)).toBeNull();
  });

  it('never redirects a not-found render, a POST, or without a declared path', () => {
    expect(resolveListingRedirect(get(`/l/${ID}`), signal, true)).toBeNull();
    expect(resolveListingRedirect({ ...get(`/l/${ID}`), method: 'POST' }, signal, false)).toBeNull();
    expect(resolveListingRedirect(get(`/l/${ID}`), { notFound: false }, false)).toBeNull();
    expect(resolveListingRedirect(get(`/l/${ID}`), null, false)).toBeNull();
  });

  it('ignores a declared path that is not exactly /l/<slug>/<uuid>', () => {
    for (const bad of [`/l/${ID}`, `/l/x/${ID}/draft`, `//evil.com/l/x/${ID}`, `/l/Upper/${ID}`, `/p/x/${ID}`]) {
      expect(resolveListingRedirect(get('/l/other/' + ID), { canonicalPath: bad }, false)).toBeNull();
    }
  });
});
// ---------------------------------------------------------------------------
// 2026-11-15: listing load failures (404 vs 503), bare /l, and the full
// response decision. See docs/OPS_RECORD_2026-11-15_seo-status-codes.md.
// ---------------------------------------------------------------------------

// The stored error shape (src/util/errors.js storableError) for each case.
// The 400 is the body production returned on 2026-11-15 for /l/fargo-nd and
// five more city-slug URLs, with the per-request error id replaced.
const apiError = (status, code, extra = {}) => ({
  type: 'error',
  name: 'AxiosError',
  message: `Request failed with status code ${status}`,
  status,
  statusText: '',
  apiErrors: [{ id: { uuid: '00000000-0000-0000-0000-000000000000' }, status, code, ...extra }],
});
const LISTING_ERRORS = {
  notFound404: apiError(404, 'not-found', { title: 'Not found.' }),
  gone410: apiError(410, 'gone'),
  invalidId400: apiError(400, 'validation-invalid-value', {
    title: 'Invalid value.',
    details: '(not (instance? java.util.UUID "fargo-nd"))',
    source: { path: ['id'], type: 'query' },
  }),
  forbidden403: apiError(403, 'forbidden'),
  // A 403 that did not come from the Marketplace API's own permission check:
  // an edge or WAF block, a suspended client credential. storableError gives
  // apiErrors [] when the body has no data.errors (HTML, empty).
  bareForbidden403: { type: 'error', name: 'AxiosError', status: 403, apiErrors: [] },
  otherCodeForbidden403: apiError(403, 'some-other-code'),
  otherBadRequest400: apiError(400, 'validation-invalid-params', {
    source: { path: ['fields.image'], type: 'query' },
  }),
  bareBadRequest400: { type: 'error', name: 'AxiosError', status: 400, apiErrors: [] },
  unauthorized401: apiError(401, 'unauthorized'),
  conflict409: apiError(409, 'conflict'),
  rateLimited429: apiError(429, 'too-many-requests'),
  server500: apiError(500, 'internal-server-error'),
  badGateway502: { type: 'error', name: 'AxiosError', status: 502, apiErrors: [] },
  unavailable503: { type: 'error', name: 'AxiosError', status: 503, apiErrors: [] },
  gatewayTimeout504: { type: 'error', name: 'AxiosError', status: 504, apiErrors: [] },
  // No response at all: storableError keeps name/message, status is undefined.
  network: { type: 'error', name: 'AxiosError', message: 'Network Error', apiErrors: [] },
  timeout: {
    type: 'error',
    name: 'AxiosError',
    message: 'timeout of 10000ms exceeded',
    apiErrors: [],
  },
  thrownInApp: { type: 'error', name: 'TypeError', message: 'x is not a function' },
  empty: {},
};

describe('classifyListingLoadError — missing listing (404) versus failed fetch (503)', () => {
  const { classifyListingLoadError, LISTING_LOAD_NOT_FOUND, LISTING_LOAD_UNAVAILABLE } =
    ssrStatusMod;

  it('no error is no classification', () => {
    expect(classifyListingLoadError(null)).toBeNull();
    expect(classifyListingLoadError(undefined)).toBeNull();
    expect(classifyListingLoadError('404')).toBeNull();
  });

  it('API 404 stays "not found" (the rule that existed before)', () => {
    expect(classifyListingLoadError(LISTING_ERRORS.notFound404)).toBe(LISTING_LOAD_NOT_FOUND);
  });

  it('the live case: 400 because the id in the URL is not a UUID → not found', () => {
    expect(classifyListingLoadError(LISTING_ERRORS.invalidId400)).toBe(LISTING_LOAD_NOT_FOUND);
  });

  it('403 (the API will not show this listing to this viewer) and 410 → not found', () => {
    expect(classifyListingLoadError(LISTING_ERRORS.forbidden403)).toBe(LISTING_LOAD_NOT_FOUND);
    expect(classifyListingLoadError(LISTING_ERRORS.gone410)).toBe(LISTING_LOAD_NOT_FOUND);
  });

  it('a 403 with no Marketplace API "forbidden" error (edge, WAF, credentials) → temporary', () => {
    // Classing every 403 as "gone" would 404 every healthy listing the moment
    // something in front of the API, or the client credential, started
    // refusing requests: the mass de-indexing "unknown means try again" is
    // there to prevent.
    expect(classifyListingLoadError(LISTING_ERRORS.bareForbidden403)).toBe(
      LISTING_LOAD_UNAVAILABLE
    );
    expect(classifyListingLoadError(LISTING_ERRORS.otherCodeForbidden403)).toBe(
      LISTING_LOAD_UNAVAILABLE
    );
    expect(classifyListingLoadError({ type: 'error', status: 403, apiErrors: [null, {}] })).toBe(
      LISTING_LOAD_UNAVAILABLE
    );
    expect(classifyListingLoadError({ type: 'error', status: 403 })).toBe(LISTING_LOAD_UNAVAILABLE);
  });

  it('a 400 that is NOT about the id is this app sending a bad request → temporary', () => {
    // If a deploy ever breaks the query this app builds, every listing would
    // answer 400. That must read as "try again", never as "all listings gone".
    expect(classifyListingLoadError(LISTING_ERRORS.otherBadRequest400)).toBe(
      LISTING_LOAD_UNAVAILABLE
    );
    expect(classifyListingLoadError(LISTING_ERRORS.bareBadRequest400)).toBe(
      LISTING_LOAD_UNAVAILABLE
    );
    // right code, wrong parameter
    expect(
      classifyListingLoadError(
        apiError(400, 'validation-invalid-value', { source: { path: ['include'], type: 'query' } })
      )
    ).toBe(LISTING_LOAD_UNAVAILABLE);
    // right parameter, wrong code
    expect(
      classifyListingLoadError(
        apiError(400, 'validation-missing-key', { source: { path: ['id'], type: 'query' } })
      )
    ).toBe(LISTING_LOAD_UNAVAILABLE);
  });

  it('API 5xx, 429, 401, 409 → temporary', () => {
    [
      'server500',
      'badGateway502',
      'unavailable503',
      'gatewayTimeout504',
      'rateLimited429',
      'unauthorized401',
      'conflict409',
    ].forEach((key) => {
      expect([key, classifyListingLoadError(LISTING_ERRORS[key])]).toEqual([
        key,
        LISTING_LOAD_UNAVAILABLE,
      ]);
    });
  });

  it('network failure, timeout and anything unrecognised → temporary, never "gone"', () => {
    ['network', 'timeout', 'thrownInApp', 'empty'].forEach((key) => {
      expect([key, classifyListingLoadError(LISTING_ERRORS[key])]).toEqual([
        key,
        LISTING_LOAD_UNAVAILABLE,
      ]);
    });
    expect(classifyListingLoadError({ status: '404' })).toBe(LISTING_LOAD_UNAVAILABLE);
    expect(classifyListingLoadError({ status: 418 })).toBe(LISTING_LOAD_UNAVAILABLE);
  });

  it('survives malformed apiErrors', () => {
    expect(classifyListingLoadError({ status: 400, apiErrors: 'nope' })).toBe(
      LISTING_LOAD_UNAVAILABLE
    );
    expect(classifyListingLoadError({ status: 400, apiErrors: [null, {}, { source: null }] })).toBe(
      LISTING_LOAD_UNAVAILABLE
    );
    expect(
      classifyListingLoadError({
        status: 400,
        apiErrors: [{ code: 'validation-invalid-value', source: { path: 'id' } }],
      })
    ).toBe(LISTING_LOAD_UNAVAILABLE);
  });
});

describe('isUnavailableLocals() and the 503 it produces', () => {
  const { isUnavailableLocals, UNAVAILABLE_HEADERS } = ssrStatusMod;

  it('is false for a normal render and for a not-found render', () => {
    expect(isUnavailableLocals({})).toBe(false);
    expect(isUnavailableLocals(null)).toBe(false);
    expect(isUnavailableLocals({ ssrSignal: { notFound: false, unavailable: false } })).toBe(false);
    expect(isUnavailableLocals({ ssrSignal: { notFound: true } })).toBe(false);
  });

  it('is true only for the boolean the error page sets', () => {
    expect(isUnavailableLocals({ ssrSignal: { unavailable: true } })).toBe(true);
    expect(isUnavailableLocals({ ssrSignal: { unavailable: 'yes' } })).toBe(false);
    expect(isUnavailableLocals({ ssrSignal: 'unavailable' })).toBe(false);
    expect(isUnavailableLocals({ unavailable: true })).toBe(false);
  });

  it('resolveRenderStatus: 503 only when nothing outranks it', () => {
    expect(resolveRenderStatus(200, false, true)).toBe(503);
    expect(resolveRenderStatus(200, true, true)).toBe(404);
    expect(resolveRenderStatus(500, false, true)).toBe(500);
    expect(resolveRenderStatus(500, true, true)).toBe(500);
    expect(resolveRenderStatus(200, false, 'yes')).toBe(200);
  });

  it('resolveRenderStatus: the two-argument form answers as it always did', () => {
    expect(resolveRenderStatus(200, false)).toBe(200);
    expect(resolveRenderStatus(200, true)).toBe(404);
    expect(resolveRenderStatus(500, false)).toBe(500);
  });

  it('carries exactly Retry-After 120, no-store and noindex, and cannot be mutated', () => {
    expect(UNAVAILABLE_HEADERS).toEqual({
      'Retry-After': '120',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    });
    expect(Object.isFrozen(UNAVAILABLE_HEADERS)).toBe(true);
  });
});

describe('isMalformedEntityPath — /l/<not-a-uuid> and bare /l (2026-11-15)', () => {
  const { isMalformedEntityPath } = ssrStatusMod;
  const UUID = '6a94fb19-fb02-4392-86fa-b32a205afdf1';

  it('flags the six city-slug URLs that answered 200 "Error in loading the listing"', () => {
    [
      'francisville-ky',
      'fargo-nd',
      'naperville-illinois',
      'rocky-point-ny',
      'roseville-ca',
      'wayne-nj',
    ].forEach((slug) => {
      expect([slug, isMalformedEntityPath(`/l/${slug}`)]).toEqual([slug, true]);
      expect([slug, isMalformedEntityPath(`/l/${slug}/`)]).toEqual([slug, true]);
    });
    expect(isMalformedEntityPath('/L/Fargo-ND')).toBe(true);
  });

  it('flags bare /l in every spelling', () => {
    ['/l', '/l/', '/L', '/L/', '//l', '/l//'].forEach((p) => {
      expect([p, isMalformedEntityPath(p)]).toEqual([p, true]);
    });
  });

  it('still leaves /l/new, /l/<uuid> and real listing paths alone', () => {
    [
      '/l/new',
      '/l/new/',
      '/L/New',
      `/l/${UUID}`,
      `/l/${UUID.toUpperCase()}`,
      `/l/some-pool/${UUID}`,
      `/l/some-pool/${UUID}/draft`,
      `/l/some-pool/${UUID}/pending-approval`,
      `/l/some-pool/${UUID}/checkout`,
      `/l/some-pool/${UUID}/edit/details`,
      `/l/draft/00000000-0000-0000-0000-000000000000/new/details`,
    ].forEach((p) => {
      expect([p, isMalformedEntityPath(p)]).toEqual([p, false]);
    });
  });

  it('does not touch bare /u, or paths that only start with the letter l', () => {
    ['/u', '/u/', '/login', '/lessons', '/listings', '/s', '/', ''].forEach((p) => {
      expect([p, isMalformedEntityPath(p)]).toEqual([p, false]);
    });
  });
});

// The whole response decision, one row per line of the behaviour table in
// docs/OPS_RECORD_2026-11-15_seo-status-codes.md. `locals` is what the render
// leaves on res.locals: `ssrNotFound` from entry-server (router miss), and
// the ssrSignal object the pages write to while rendering.
describe('resolveRenderOutcome — the behaviour table', () => {
  const { resolveRenderOutcome } = ssrStatusMod;
  const ID = '689d6690-2fad-40ab-bf82-f89b07771533';
  const CANON = `/l/the-orange-grove-lagoon/${ID}`;
  const get = (path, query = '') => ({ method: 'GET', path, originalUrl: path + query });
  const signal = (over = {}) => ({ ssrSignal: { notFound: false, unavailable: false, ...over } });

  const HTML = { 'Content-Type': 'text/html' };
  const NOT_FOUND = { 'Content-Type': 'text/html', 'X-Robots-Tag': 'noindex, follow' };
  const UNAVAILABLE = {
    'Content-Type': 'text/html',
    'Retry-After': '120',
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex',
  };

  describe('healthy pages are untouched', () => {
    it('a healthy listing on its canonical path: 200, Content-Type only', () => {
      const out = resolveRenderOutcome(get(CANON), signal({ canonicalPath: CANON }));
      expect(out).toEqual({ status: 200, redirectTo: null, headers: HTML });
    });

    it('…with a query string (share attribution, open order panel): still 200', () => {
      const out = resolveRenderOutcome(
        get(CANON, '?ref=host-share'),
        signal({ canonicalPath: CANON })
      );
      expect(out).toEqual({ status: 200, redirectTo: null, headers: HTML });
    });

    it('a healthy listing by bare id or stale slug: the same single 301 as before', () => {
      expect(resolveRenderOutcome(get(`/l/${ID}`), signal({ canonicalPath: CANON }))).toEqual({
        status: 301,
        redirectTo: CANON,
        headers: { 'Cache-Control': 'public, max-age=86400' },
      });
      expect(
        resolveRenderOutcome(get(`/l/old-title/${ID}`, '?ref=x'), signal({ canonicalPath: CANON }))
      ).toEqual({
        status: 301,
        redirectTo: `${CANON}?ref=x`,
        headers: { 'Cache-Control': 'public, max-age=86400' },
      });
    });

    it('owner variants (draft, pending-approval) declare no canonical path: 200, no redirect', () => {
      ['draft', 'pending-approval'].forEach((variant) => {
        const out = resolveRenderOutcome(get(`${CANON}/${variant}`), signal());
        expect([variant, out]).toEqual([variant, { status: 200, redirectTo: null, headers: HTML }]);
      });
    });

    it('other pages: 200, and the alternate-spelling 301 still works', () => {
      expect(resolveRenderOutcome(get('/s'), signal())).toEqual({
        status: 200,
        redirectTo: null,
        headers: HTML,
      });
      expect(resolveRenderOutcome(get('/confirm'), signal())).toEqual({
        status: 200,
        redirectTo: null,
        headers: HTML,
      });
      expect(resolveRenderOutcome(get(`/u/${ID}`), signal())).toEqual({
        status: 200,
        redirectTo: null,
        headers: HTML,
      });
      expect(
        resolveRenderOutcome(get('/S/', '?address=Lancaster%2C%20PA'), signal()).redirectTo
      ).toBe('/s?address=Lancaster%2C%20PA');
    });

    it('a healthy response never carries Retry-After, no-store or X-Robots-Tag', () => {
      const out = resolveRenderOutcome(get(CANON), signal({ canonicalPath: CANON }));
      expect(Object.keys(out.headers)).toEqual(['Content-Type']);
    });
  });

  describe('missing or not-viewable listing → 404, never a redirect', () => {
    it('NotFoundPage rendered (API 404, 403, or a non-UUID id): 404 + noindex, follow', () => {
      const out = resolveRenderOutcome(get(`/l/some-pool/${ID}`), signal({ notFound: true }));
      expect(out).toEqual({ status: 404, redirectTo: null, headers: NOT_FOUND });
    });

    it('…in an alternate spelling: still a plain 404, no hop', () => {
      const out = resolveRenderOutcome(get(`/L/Some-Pool/${ID}/`), signal({ notFound: true }));
      expect(out).toEqual({ status: 404, redirectTo: null, headers: NOT_FOUND });
    });

    it('/l/<city-slug>: 404 from the path alone, whatever the page rendered', () => {
      [signal(), signal({ notFound: true }), signal({ unavailable: true }), {}].forEach(
        (locals) => {
          const out = resolveRenderOutcome(get('/l/fargo-nd'), locals);
          expect(out).toEqual({ status: 404, redirectTo: null, headers: NOT_FOUND });
        }
      );
    });

    it('an invalid listing (no listingType / process / unitType) flags notFound: 404', () => {
      const out = resolveRenderOutcome(get(CANON), signal({ notFound: true }));
      expect(out).toEqual({ status: 404, redirectTo: null, headers: NOT_FOUND });
    });

    it('a router miss is still a 404', () => {
      const out = resolveRenderOutcome(get('/no-such-route'), { ssrNotFound: true, ...signal() });
      expect(out).toEqual({ status: 404, redirectTo: null, headers: NOT_FOUND });
    });
  });

  describe('temporary load failure → 503 + Retry-After, never a redirect', () => {
    it('the error page rendered: 503 with Retry-After 120, no-store, noindex', () => {
      const out = resolveRenderOutcome(get(CANON), signal({ unavailable: true }));
      expect(out).toEqual({ status: 503, redirectTo: null, headers: UNAVAILABLE });
    });

    it('…by bare id, stale slug, uppercase or trailing slash: 503, no hop', () => {
      [`/l/${ID}`, `/l/old-title/${ID}`, `/L/Old-Title/${ID}`, `${CANON}/`].forEach((path) => {
        const out = resolveRenderOutcome(get(path), signal({ unavailable: true }));
        expect([path, out]).toEqual([
          path,
          { status: 503, redirectTo: null, headers: UNAVAILABLE },
        ]);
      });
    });

    it('…on an owner variant: 503 too (same error page as before, honest status)', () => {
      const out = resolveRenderOutcome(get(`${CANON}/draft`), signal({ unavailable: true }));
      expect(out).toEqual({ status: 503, redirectTo: null, headers: UNAVAILABLE });
    });

    it('never points a failed listing at the homepage or at /s', () => {
      const outs = [
        resolveRenderOutcome(get(CANON), signal({ unavailable: true })),
        resolveRenderOutcome(get(CANON), signal({ notFound: true })),
        resolveRenderOutcome(get('/l/fargo-nd'), signal()),
        resolveRenderOutcome(get('/l'), signal()),
        resolveRenderOutcome(get('/l/'), signal()),
      ];
      outs.forEach((out) => {
        expect(out.redirectTo).toBeNull();
        expect(out.headers.Location).toBeUndefined();
      });
    });
  });

  describe('precedence', () => {
    it('a shell error (500) outranks everything and gets no robots or retry headers', () => {
      [signal(), signal({ notFound: true }), signal({ unavailable: true })].forEach((locals) => {
        expect(resolveRenderOutcome(get(CANON), locals, 500)).toEqual({
          status: 500,
          redirectTo: null,
          headers: HTML,
        });
      });
      expect(resolveRenderOutcome(get('/l/fargo-nd'), signal(), 500).status).toBe(500);
    });

    it('not found outranks unavailable', () => {
      const out = resolveRenderOutcome(get(CANON), signal({ notFound: true, unavailable: true }));
      expect(out).toEqual({ status: 404, redirectTo: null, headers: NOT_FOUND });
    });

    it('still honours the old res.locals.ssrMalformed flag', () => {
      expect(resolveRenderOutcome(get('/x'), { ssrMalformed: true }).status).toBe(404);
    });

    it('does not mutate what it is given', () => {
      const req = Object.freeze(get(CANON));
      const locals = Object.freeze({
        ssrSignal: Object.freeze({ notFound: false, unavailable: true }),
      });
      expect(() => resolveRenderOutcome(req, locals)).not.toThrow();
      const a = resolveRenderOutcome(get(`/l/${ID}`), signal({ canonicalPath: CANON }));
      a.headers['X-Test'] = '1';
      const b = resolveRenderOutcome(get(`/l/${ID}`), signal({ canonicalPath: CANON }));
      expect(b.headers['X-Test']).toBeUndefined();
    });

    it('is safe on missing input', () => {
      expect(resolveRenderOutcome(get('/s'), undefined).status).toBe(200);
      expect(resolveRenderOutcome(get('/s'), null).status).toBe(200);
      expect(resolveRenderOutcome(undefined, {}).status).toBe(200);
    });

    it('a POST is never redirected, and still gets the right status', () => {
      const post = (path) => ({ method: 'POST', path, originalUrl: path });
      expect(resolveRenderOutcome(post(`/l/${ID}`), signal({ canonicalPath: CANON }))).toEqual({
        status: 200,
        redirectTo: null,
        headers: HTML,
      });
      expect(resolveRenderOutcome(post(CANON), signal({ unavailable: true })).status).toBe(503);
    });
  });

  describe('/l and /l/ — no loop, no homepage', () => {
    it('bare /l is a 404', () => {
      expect(resolveRenderOutcome(get('/l'), signal())).toEqual({
        status: 404,
        redirectTo: null,
        headers: NOT_FOUND,
      });
    });

    it('/l/ is a 404 and is NOT redirected to /l (nginx sends /l back to /l/)', () => {
      // Before: the route rendered an empty shell (no notFound), so the
      // trailing-slash rule answered 301 → /l, and nginx answered 301 → /l/.
      expect(ssrStatusMod.resolveCanonicalRedirect(get('/l/'), false)).toBe('/l');
      // Now, with or without the page having flagged anything:
      [signal(), signal({ notFound: true }), {}].forEach((locals) => {
        expect(resolveRenderOutcome(get('/l/'), locals)).toEqual({
          status: 404,
          redirectTo: null,
          headers: NOT_FOUND,
        });
      });
    });

    it('following redirects from /l or /l/ through nginx and this app always terminates', () => {
      // nginx (observed live 2026-11-15): /l → 301 /l/. Everything else under
      // /l/ is passed to this app. Model that hop and walk the chain.
      const nginxHop = (path) => (path === '/l' ? '/l/' : null);
      const walk = (start) => {
        const seen = [start];
        let path = start;
        for (let i = 0; i < 10; i += 1) {
          const viaNginx = nginxHop(path);
          const next = viaNginx || resolveRenderOutcome(get(path), signal()).redirectTo;
          if (!next) {
            return { seen, status: resolveRenderOutcome(get(path), signal()).status };
          }
          if (seen.includes(next)) {
            return { seen, loop: true };
          }
          seen.push(next);
          path = next;
        }
        return { seen, loop: true };
      };
      expect(walk('/l')).toEqual({ seen: ['/l', '/l/'], status: 404 });
      expect(walk('/l/')).toEqual({ seen: ['/l/'], status: 404 });
    });

    it('if nginx later passes bare /l straight through, it is a 404 with no hop', () => {
      expect(resolveRenderOutcome(get('/l'), signal()).redirectTo).toBeNull();
    });

    it('/l/new (the "create a listing" entry) is not caught by any of this', () => {
      expect(resolveRenderOutcome(get('/l/new'), signal())).toEqual({
        status: 200,
        redirectTo: null,
        headers: HTML,
      });
    });
  });
});

describe('the page-level proof is wired to a package script', () => {
  // This file tests the pure decision with hand-made locals. Whether the React
  // pages actually raise `notFound` / `unavailable` is proven only by the
  // render harness, so it must stay runnable by name (yarn test-ssr-status)
  // and listed in the release gate.
  const root = nodePath.join(__dirname, '..', '..');

  it('package.json has test-ssr-status, and the script it runs exists', () => {
    const pkg = JSON.parse(nodeFs.readFileSync(nodePath.join(root, 'package.json'), 'utf8'));
    const cmd = pkg.scripts && pkg.scripts['test-ssr-status'];
    expect(cmd).toBe('bun scripts/ssr-status-harness/run.mjs');
    expect(nodeFs.existsSync(nodePath.join(root, 'scripts/ssr-status-harness/run.mjs'))).toBe(true);
  });

  it('the ops record lists the harness in the release gate', () => {
    const doc = nodeFs.readFileSync(
      nodePath.join(root, 'docs/OPS_RECORD_2026-11-15_seo-status-codes.md'),
      'utf8'
    );
    expect(doc).toMatch(/yarn test-ssr-status/);
  });
});
