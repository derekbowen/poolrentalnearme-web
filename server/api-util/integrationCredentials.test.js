const {
  resolveIntegrationCredentials,
  ID_VARS,
  SECRET_VARS,
} = require('./integrationCredentials');

const WEST = {
  SHARETRIBE_INTEGRATION_SDK_CLIENT_ID: 'west-id',
  SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET: 'west-secret',
};
const TEMPLATE = {
  SHARETRIBE_INTEGRATION_CLIENT_ID: 'template-id',
  SHARETRIBE_INTEGRATION_CLIENT_SECRET: 'template-secret',
};
const EAST = {
  SHARETRIBE_INTEG_CLIENT_ID: 'east-id',
  SHARETRIBE_INTEG_CLIENT_SECRET: 'east-secret',
};

describe('resolveIntegrationCredentials', () => {
  it('resolves the WEST spelling (unchanged production behaviour)', () => {
    const r = resolveIntegrationCredentials(WEST);
    expect(r.configured).toBe(true);
    expect(r.clientId).toBe('west-id');
    expect(r.clientSecret).toBe('west-secret');
    expect(r.idVar).toBe('SHARETRIBE_INTEGRATION_SDK_CLIENT_ID');
    expect(r.mismatchedPrefix).toBe(false);
  });

  it('resolves the .env-template spelling that used to be ignored', () => {
    const r = resolveIntegrationCredentials(TEMPLATE);
    expect(r.configured).toBe(true);
    expect(r.clientId).toBe('template-id');
    expect(r.clientSecret).toBe('template-secret');
    expect(r.idVar).toBe('SHARETRIBE_INTEGRATION_CLIENT_ID');
    expect(r.mismatchedPrefix).toBe(false);
  });

  it('resolves the EAST spelling', () => {
    const r = resolveIntegrationCredentials(EAST);
    expect(r.configured).toBe(true);
    expect(r.clientId).toBe('east-id');
    expect(r.clientSecret).toBe('east-secret');
    expect(r.idVar).toBe('SHARETRIBE_INTEG_CLIENT_ID');
    expect(r.mismatchedPrefix).toBe(false);
  });

  it('prefers WEST over the other two when several are set', () => {
    const r = resolveIntegrationCredentials({ ...EAST, ...TEMPLATE, ...WEST });
    expect(r.clientId).toBe('west-id');
    expect(r.clientSecret).toBe('west-secret');
  });

  it('prefers the template spelling over EAST when WEST is absent', () => {
    const r = resolveIntegrationCredentials({ ...EAST, ...TEMPLATE });
    expect(r.clientId).toBe('template-id');
  });

  it('treats empty and whitespace-only values as unset rather than letting them shadow', () => {
    const r = resolveIntegrationCredentials({
      SHARETRIBE_INTEGRATION_SDK_CLIENT_ID: '',
      SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET: '   ',
      ...EAST,
    });
    expect(r.configured).toBe(true);
    expect(r.clientId).toBe('east-id');
    expect(r.clientSecret).toBe('east-secret');
  });

  it('reports unconfigured with an empty environment', () => {
    const r = resolveIntegrationCredentials({});
    expect(r.configured).toBe(false);
    expect(r.clientId).toBeUndefined();
    expect(r.clientSecret).toBeUndefined();
    expect(r.missing).toEqual(['client id', 'client secret']);
    // Guards on `if (!integrationSdk)` must keep working, so this must not throw.
    expect(r.mismatchedPrefix).toBe(false);
  });

  it('names which half is missing when only the id is set', () => {
    const r = resolveIntegrationCredentials({
      SHARETRIBE_INTEGRATION_SDK_CLIENT_ID: 'west-id',
    });
    expect(r.configured).toBe(false);
    expect(r.missing).toEqual(['client secret']);
  });

  it('flags an id and secret taken from different spellings', () => {
    const r = resolveIntegrationCredentials({
      SHARETRIBE_INTEGRATION_SDK_CLIENT_ID: 'west-id',
      SHARETRIBE_INTEG_CLIENT_SECRET: 'east-secret',
    });
    expect(r.configured).toBe(true);
    expect(r.mismatchedPrefix).toBe(true);
    expect(r.idVar).toBe('SHARETRIBE_INTEGRATION_SDK_CLIENT_ID');
    expect(r.secretVar).toBe('SHARETRIBE_INTEG_CLIENT_SECRET');
  });

  it('does not flag a mismatch when only one half is present', () => {
    expect(
      resolveIntegrationCredentials({ SHARETRIBE_INTEG_CLIENT_ID: 'east-id' }).mismatchedPrefix
    ).toBe(false);
  });

  it('keeps id and secret var lists aligned one-to-one', () => {
    expect(ID_VARS).toHaveLength(SECRET_VARS.length);
    ID_VARS.forEach((idVar, i) => {
      expect(idVar.replace(/_CLIENT_ID$/, '')).toBe(
        SECRET_VARS[i].replace(/_CLIENT_SECRET$/, '')
      );
    });
  });

  it('defaults to process.env when called with no argument', () => {
    const saved = process.env.SHARETRIBE_INTEGRATION_SDK_CLIENT_ID;
    process.env.SHARETRIBE_INTEGRATION_SDK_CLIENT_ID = 'from-process-env';
    try {
      expect(resolveIntegrationCredentials().clientId).toBe('from-process-env');
    } finally {
      if (saved === undefined) delete process.env.SHARETRIBE_INTEGRATION_SDK_CLIENT_ID;
      else process.env.SHARETRIBE_INTEGRATION_SDK_CLIENT_ID = saved;
    }
  });
});
