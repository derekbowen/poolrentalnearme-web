const {
  isNotFoundContext,
  resolveRenderStatus,
  NOT_FOUND_ROUTE_NAME,
} = require('./ssrStatus');

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
