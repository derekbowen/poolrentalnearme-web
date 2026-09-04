import { classifyApiError, safeLabelKey, isGenericOnly } from './apiErrorDetails';

// The shape storableError() produces from a Sharetribe 4xx.
const err = (apiErrors, status = 400) => ({ type: 'error', status, apiErrors });

describe('the five cases from the Lathrop investigation', () => {
  it('bio too long -> field label + tooLong', () => {
    const c = classifyApiError(
      err([{ source: { pointer: '/profile/bio' }, details: 'Value is too long (maximum is 5000)' }])
    );
    expect(c.items).toEqual([{ labelKey: 'ApiError.field.bio', messageKey: 'ApiError.tooLong' }]);
  });

  it('required field empty -> field label + required', () => {
    const c = classifyApiError(
      err([{ source: { pointer: '/profile/lastName' }, details: 'must not be empty' }])
    );
    expect(c.items).toEqual([
      { labelKey: 'ApiError.field.lastName', messageKey: 'ApiError.required' },
    ]);
  });

  it('expired session -> sessionExpired, no field noise', () => {
    const c = classifyApiError(err([], 401));
    expect(c.statusKey).toBe('ApiError.sessionExpired');
    expect(c.items).toEqual([]);
  });

  it('rate limited -> rateLimited', () => {
    expect(classifyApiError(err([], 429)).statusKey).toBe('ApiError.rateLimited');
  });

  it('unknown 400 payload -> nothing specific, generic message only', () => {
    const c = classifyApiError(
      err([{ source: { pointer: '/profile/bio' }, details: 'flux capacitor desynchronised' }])
    );
    expect(c.items).toEqual([]);
    expect(c.statusKey).toBeNull();
    expect(c.hasUnclassified).toBe(true);
    expect(isGenericOnly(err([{ details: 'unrecognised' }]))).toBe(true);
  });
});

describe('sanitisation — no backend payload may reach the DOM', () => {
  const NASTY = [
    'Bearer eyJhbGciOiJIUzI1NiJ9.SECRETTOKEN.sig',
    'user 8f3a1c2e-0000-4d5e-9abc-deadbeef1234 rejected',
    'at Object.<anonymous> (/srv/app/server/index.js:42:13)',
    "value 'my private note' is too long",
    'ssn=123-45-6789',
  ];

  it('returns only translation keys — never any backend substring', () => {
    NASTY.forEach(detail => {
      const c = classifyApiError(err([{ source: { pointer: '/profile/bio' }, details: detail }]));
      const serialised = JSON.stringify(c);
      // Nothing from the backend string survives.
      detail.split(/\s+/).filter(w => w.length > 6).forEach(word => {
        expect(serialised).not.toContain(word);
      });
      // Only keys under our own namespace are ever emitted.
      c.items.forEach(i => {
        expect(i.messageKey).toMatch(/^ApiError\./);
        if (i.labelKey) expect(i.labelKey).toMatch(/^ApiError\.field\./);
      });
    });
  });

  it('never labels a privateData / protectedData / metadata field', () => {
    ['/profile/privateData/ssn', '/profile/protectedData/phone', '/profile/metadata/internalFlag']
      .forEach(pointer => {
        expect(safeLabelKey(pointer)).toBeNull();
        const c = classifyApiError(err([{ source: { pointer }, details: 'must not be empty' }]));
        expect(c.items[0].labelKey).toBeNull(); // message shown, field name withheld
      });
  });

  it('does not label fields outside the allowlist', () => {
    expect(safeLabelKey('/profile/publicData/someInternalKey')).toBeNull();
    expect(safeLabelKey('/profile/bio')).toBe('ApiError.field.bio');
  });

  it('tolerates malformed pointers and payloads without throwing', () => {
    expect(safeLabelKey(null)).toBeNull();
    expect(safeLabelKey('')).toBeNull();
    expect(safeLabelKey(42)).toBeNull();
    expect(classifyApiError(null).items).toEqual([]);
    expect(classifyApiError({}).items).toEqual([]);
    expect(classifyApiError(err(null)).items).toEqual([]);
    expect(classifyApiError(err([{}])).items).toEqual([]);
    expect(classifyApiError({ apiErrors: 'not-an-array' }).items).toEqual([]);
  });

  it('ignores a non-string details value rather than rendering an object', () => {
    const c = classifyApiError(err([{ source: { pointer: '/profile/bio' }, details: { a: 1 } }]));
    expect(c.items).toEqual([]);
  });
});

describe('behaviour details', () => {
  it('de-duplicates identical field+message pairs', () => {
    const one = { source: { pointer: '/profile/bio' }, details: 'too long' };
    expect(classifyApiError(err([one, one, one])).items).toHaveLength(1);
  });

  it('reports several distinct fields at once', () => {
    const c = classifyApiError(
      err([
        { source: { pointer: '/profile/bio' }, details: 'too long' },
        { source: { pointer: '/profile/firstName' }, details: 'must not be empty' },
      ])
    );
    expect(c.items).toHaveLength(2);
  });

  it('falls back through details -> title -> code', () => {
    const c = classifyApiError(
      err([
        { source: { pointer: '/profile/bio' }, title: 'Value is too long' },
        { source: { pointer: '/profile/lastName' }, code: 'is required' },
      ])
    );
    expect(c.items.map(i => i.messageKey)).toEqual(['ApiError.tooLong', 'ApiError.required']);
  });

  it('403 and 409 are classified too', () => {
    expect(classifyApiError(err([], 403)).statusKey).toBe('ApiError.forbidden');
    expect(classifyApiError(err([], 409)).statusKey).toBe('ApiError.conflict');
  });

  it('an unmapped status yields no status message', () => {
    expect(classifyApiError(err([], 500)).statusKey).toBeNull();
  });
});
