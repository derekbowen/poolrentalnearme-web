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
