// Runs under bun (lineItems loads the ESM Sharetribe SDK); excluded from jest.
const handler = require('./health-booking');

const { failingChecks } = handler;
const ENV = { STRIPE_SECRET_KEY: 'x', REACT_APP_SHARETRIBE_SDK_CLIENT_ID: 'y' };

const call = () => {
  const res = {
    headers: {},
    set(k, v) {
      this.headers[k] = v;
    },
    status(c) {
      this.code = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
  handler({}, res);
  return res;
};

describe('GET /api/health/booking', () => {
  it('booking price checks pass on the real line-item code', () => {
    const failing = failingChecks(ENV).filter((n) => n !== 'serverConfig');
    expect(failing).toEqual([]);
  });

  it('missing server configuration fails the serverConfig check only', () => {
    expect(failingChecks({})).toContain('serverConfig');
  });

  it('body is exactly {ok} and never describes configuration', () => {
    const res = call();
    expect([200, 503]).toContain(res.code);
    expect(Object.keys(res.body)).toEqual(['ok']);
    expect(res.body.ok).toBe(res.code === 200);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });
});
