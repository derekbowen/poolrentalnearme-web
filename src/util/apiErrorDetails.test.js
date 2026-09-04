import { apiErrorDetails, likelyCause } from './apiErrorDetails';

// Shape produced by storableError() from a Sharetribe 400.
const err = (errors, status = 400) => ({ type: 'error', status, apiErrors: errors });

describe('apiErrorDetails', () => {
  it('names the field and repeats what the API said', () => {
    const { items } = apiErrorDetails(
      err([{ source: { pointer: '/profile/bio' }, details: 'Value is too long' }])
    );
    expect(items).toEqual([{ field: 'Bio', detail: 'Value is too long' }]);
  });

  it('humanises camelCase pointers', () => {
    const { items } = apiErrorDetails(
      err([{ source: { pointer: '/profile/lastName' }, details: 'must not be empty' }])
    );
    expect(items[0].field).toBe('Last Name');
  });

  it('falls back through details -> title -> code', () => {
    const { items } = apiErrorDetails(
      err([
        { source: { pointer: '/a' }, title: 'A title' },
        { source: { pointer: '/b' }, code: 'some-code' },
      ])
    );
    expect(items.map(i => i.detail)).toEqual(['A title', 'some-code']);
  });

  it('survives a malformed or empty payload rather than throwing', () => {
    expect(apiErrorDetails(null).items).toEqual([]);
    expect(apiErrorDetails({}).items).toEqual([]);
    expect(apiErrorDetails(err([{}])).items).toEqual([]);
    expect(apiErrorDetails(err([{ details: 'no pointer' }])).items).toEqual([
      { field: null, detail: 'no pointer' },
    ]);
  });
});

describe('likelyCause — conservative on purpose', () => {
  it('names a too-long field', () => {
    expect(
      likelyCause(err([{ source: { pointer: '/profile/bio' }, details: 'Value is too long' }]))
    ).toBe('Bio is too long.');
  });

  it('names an empty required field', () => {
    expect(
      likelyCause(
        err([{ source: { pointer: '/profile/lastName' }, details: 'must not be empty' }])
      )
    ).toBe('Last Name cannot be empty.');
  });

  it('explains the common status codes', () => {
    expect(likelyCause(err([], 401))).toMatch(/session expired/i);
    expect(likelyCause(err([], 403))).toMatch(/permission/i);
    expect(likelyCause(err([], 429))).toMatch(/too many/i);
  });

  it('says nothing when the payload does not support a confident answer', () => {
    // A wrong hint sends support down the wrong path, so silence beats a guess.
    expect(likelyCause(err([{ source: { pointer: '/x' }, details: 'unexpected' }]))).toBeNull();
    expect(likelyCause(err([]))).toBeNull();
    expect(likelyCause(null)).toBeNull();
  });
});
