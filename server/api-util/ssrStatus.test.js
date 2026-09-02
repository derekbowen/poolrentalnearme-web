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
