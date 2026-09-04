const {
  ALIASES,
  resolveOne,
  integrationCredentials,
  describeIntegrationCredentials,
} = require('./sharetribeCredentials');

const WEST = {
  SHARETRIBE_INTEGRATION_SDK_CLIENT_ID: 'west-id',
  SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET: 'west-secret',
};
const EAST = {
  SHARETRIBE_INTEG_CLIENT_ID: 'east-id',
  SHARETRIBE_INTEG_CLIENT_SECRET: 'east-secret',
};

describe('integrationCredentials', () => {
  it('resolves the WEST spelling', () => {
    const c = integrationCredentials(WEST);
    expect(c.ok).toBe(true);
    expect(c.sources.clientId).toBe('SHARETRIBE_INTEGRATION_SDK_CLIENT_ID');
  });

  it('resolves the EAST spelling — the case integration.js used to miss', () => {
    // Before this module, server/api-util/integration.js read only the WEST
    // names, so on EAST the SDK instance was null and every Integration call
    // silently no-opped.
    const c = integrationCredentials(EAST);
    expect(c.ok).toBe(true);
    expect(c.clientId).toBe('east-id');
    expect(c.sources.clientSecret).toBe('SHARETRIBE_INTEG_CLIENT_SECRET');
  });

  it('prefers the canonical name when both are present', () => {
    const c = integrationCredentials({ ...EAST, ...WEST });
    expect(c.clientId).toBe('west-id');
    expect(c.sources.clientId).toBe('SHARETRIBE_INTEGRATION_SDK_CLIENT_ID');
  });

  it('accepts the .env-template spelling that nothing else reads', () => {
    const c = integrationCredentials({
      SHARETRIBE_INTEGRATION_CLIENT_ID: 'tpl-id',
      SHARETRIBE_INTEGRATION_CLIENT_SECRET: 'tpl-secret',
    });
    expect(c.ok).toBe(true);
  });

  it('treats empty and whitespace-only values as missing', () => {
    ['', '   '].forEach(v => {
      const c = integrationCredentials({
        SHARETRIBE_INTEGRATION_SDK_CLIENT_ID: v,
        SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET: v,
      });
      expect(c.ok).toBe(false);
      expect(c.missing).toHaveLength(2);
    });
  });

  it('trims surrounding whitespace, which a copied secret often carries', () => {
    const c = integrationCredentials({
      SHARETRIBE_INTEGRATION_SDK_CLIENT_ID: '  id  ',
      SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET: '\tsecret\n',
    });
    expect(c.clientId).toBe('id');
    expect(c.clientSecret).toBe('secret');
  });

  it('reports a half-configured pair rather than pretending it is usable', () => {
    const c = integrationCredentials({ SHARETRIBE_INTEG_CLIENT_ID: 'only-id' });
    expect(c.ok).toBe(false);
    expect(c.missing).toEqual(['SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET']);
  });
});

describe('describeIntegrationCredentials — must never leak a value', () => {
  const secrets = ['west-id', 'west-secret', 'east-id', 'east-secret'];

  it('names variables and sources only, on success', () => {
    const line = describeIntegrationCredentials(EAST);
    secrets.forEach(s => expect(line).not.toContain(s));
    expect(line).toContain('SHARETRIBE_INTEG_CLIENT_ID');
    expect(line).toContain('[via alias]');
  });

  it('leaks nothing when fully configured the canonical way', () => {
    const line = describeIntegrationCredentials(WEST);
    secrets.forEach(s => expect(line).not.toContain(s));
    expect(line).not.toContain('[via alias]');
  });

  it('lists what is missing and which aliases are accepted', () => {
    const line = describeIntegrationCredentials({});
    expect(line).toContain('MISSING');
    expect(line).toContain('SHARETRIBE_INTEG_CLIENT_ID');
  });
});

describe('alias map', () => {
  it('covers both halves of the pair', () => {
    expect(Object.keys(ALIASES).sort()).toEqual([
      'SHARETRIBE_INTEGRATION_SDK_CLIENT_ID',
      'SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET',
    ]);
  });

  it('resolveOne returns a null result rather than throwing on an unknown name', () => {
    expect(resolveOne('NOT_A_REAL_VAR', {})).toEqual({
      value: null,
      source: null,
      canonical: 'NOT_A_REAL_VAR',
    });
  });
});
