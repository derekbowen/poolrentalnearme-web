/**
 * EAST-style env injection must produce a WORKING Integration SDK, not a null.
 *
 * The regression: server/api-util/integration.js destructured only the WEST
 * names (SHARETRIBE_INTEGRATION_SDK_CLIENT_ID/_SECRET). EAST injects the same
 * credential as SHARETRIBE_INTEG_CLIENT_ID/_SECRET, so on that host `clientId`
 * was undefined, the module exported `null`, and every Integration API call
 * became a silent no-op — while startupEnvCheck.js, which DID know the alias,
 * reported the environment as healthy. Nothing failed loudly.
 *
 * A resolver unit test alone would not have caught it: the resolver was fine,
 * the call site did not use it. This test therefore drives the real module and
 * asserts a mocked SDK call actually happens.
 */

const WEST_ID = 'SHARETRIBE_INTEGRATION_SDK_CLIENT_ID';
const WEST_SECRET = 'SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET';
const EAST_ID = 'SHARETRIBE_INTEG_CLIENT_ID';
const EAST_SECRET = 'SHARETRIBE_INTEG_CLIENT_SECRET';
const ALL = [WEST_ID, WEST_SECRET, EAST_ID, EAST_SECRET];

const mockCreateInstance = jest.fn();
const mockShowUser = jest.fn();

jest.mock('sharetribe-flex-integration-sdk', () => ({
  createInstance: (...args) => {
    mockCreateInstance(...args);
    return { users: { show: mockShowUser } };
  },
  util: {
    createRateLimiter: () => ({}),
    devQueryLimiterConfig: {},
    prodQueryLimiterConfig: {},
    devCommandLimiterConfig: {},
    prodCommandLimiterConfig: {},
  },
}));

// ./sdk transitively imports server/config/server.js, which is ESM and cannot be
// require()d under jest. Mocking it keeps the REAL integration.js under test —
// which matters, because the bug was in that file's call site, not in the
// resolver it now uses.
jest.mock('./sdk', () => ({ typeHandlers: [] }));

// The wrapper would otherwise need a live transit response to unwrap.
jest.mock('./wrapInstanceWithResponseTransformer', () => instance => instance);

const withEnv = (vars, fn) => {
  const saved = {};
  ALL.forEach(k => {
    saved[k] = process.env[k];
    delete process.env[k];
  });
  Object.entries(vars).forEach(([k, v]) => {
    process.env[k] = v;
  });
  jest.resetModules();
  mockCreateInstance.mockClear();
  mockShowUser.mockClear();
  try {
    return fn();
  } finally {
    ALL.forEach(k => {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    });
  }
};

describe('integration.js under EAST-style env injection', () => {
  it('builds a real SDK instance from the EAST variable names', () => {
    withEnv({ [EAST_ID]: 'east-client-id', [EAST_SECRET]: 'east-client-secret' }, () => {
      const instance = require('./integration');

      expect(instance).not.toBeNull();
      expect(mockCreateInstance).toHaveBeenCalledTimes(1);

      const passed = mockCreateInstance.mock.calls[0][0];
      expect(passed.clientId).toBe('east-client-id');
      expect(passed.clientSecret).toBe('east-client-secret');
    });
  });

  it('the instance actually issues a call rather than silently no-oping', () => {
    withEnv({ [EAST_ID]: 'east-client-id', [EAST_SECRET]: 'east-client-secret' }, () => {
      const instance = require('./integration');
      mockShowUser.mockReturnValue(Promise.resolve({ data: { data: { id: { uuid: 'u-1' } } } }));

      // The exact shape scripts/lookup-user.js uses.
      const result = instance.users.show({ email: 'host@example.com' }, { expand: true });

      expect(mockShowUser).toHaveBeenCalledTimes(1);
      expect(mockShowUser).toHaveBeenCalledWith({ email: 'host@example.com' }, { expand: true });
      return expect(result).resolves.toBeDefined();
    });
  });

  it('still works with the WEST names', () => {
    withEnv({ [WEST_ID]: 'west-client-id', [WEST_SECRET]: 'west-client-secret' }, () => {
      require('./integration');
      expect(mockCreateInstance.mock.calls[0][0].clientId).toBe('west-client-id');
    });
  });

  it('prefers WEST when a host somehow injects both', () => {
    withEnv(
      {
        [WEST_ID]: 'west-client-id',
        [WEST_SECRET]: 'west-client-secret',
        [EAST_ID]: 'east-client-id',
        [EAST_SECRET]: 'east-client-secret',
      },
      () => {
        require('./integration');
        expect(mockCreateInstance.mock.calls[0][0].clientId).toBe('west-client-id');
      }
    );
  });

  it('exports null and creates no instance when neither pair is present', () => {
    withEnv({}, () => {
      const instance = require('./integration');
      expect(instance).toBeNull();
      expect(mockCreateInstance).not.toHaveBeenCalled();
    });
  });

  it('a half-configured pair does not produce a half-working SDK', () => {
    withEnv({ [EAST_ID]: 'east-client-id' }, () => {
      expect(require('./integration')).toBeNull();
      expect(mockCreateInstance).not.toHaveBeenCalled();
    });
  });
});
