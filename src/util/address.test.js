import { hasStreetAddress, publicLocationLabel } from './address';

// Every token that must never reach a guest-facing surface, drawn from real
// addresses that were published verbatim before 2026-09-22.
const STREET_TOKENS = [
  '15623',
  'Skylark',
  'Nicholas Dr',
  'Catherine St',
  'Temple City Blvd',
  '2 Gal',
  'Gal Cres',
  'Gal Crescent',
  'Park Creek',
  '11914',
  '123 Main',
  'Main St',
  'Downing',
];

const expectNoStreet = label => {
  const l = String(label).toLowerCase();
  STREET_TOKENS.forEach(t => {
    expect(l).not.toContain(t.toLowerCase());
  });
};

describe('hasStreetAddress', () => {
  it('detects a street line with a house number', () => {
    expect(hasStreetAddress('123 Main St')).toBe(true);
    expect(hasStreetAddress('2 Gal Cres')).toBe(true);
  });

  it('detects a street line with NO house number', () => {
    // These two were published verbatim: the old rules only fired on a number.
    expect(hasStreetAddress('Nicholas Dr')).toBe(true);
    expect(hasStreetAddress('Catherine St')).toBe(true);
    expect(hasStreetAddress('Gal Crescent')).toBe(true);
  });

  it('does not flag an ordinary locality', () => {
    expect(hasStreetAddress('Austin')).toBe(false);
    expect(hasStreetAddress('Moorebank')).toBe(false);
    expect(hasStreetAddress('Panama City')).toBe(false);
    expect(hasStreetAddress('Bloomfield Hills')).toBe(false);
  });

  it('does not flag real cities whose names end in a street-ish word', () => {
    // Over-eager suffix matching would blank the location on these listings.
    [
      'Elk Grove',
      'Garden Grove',
      'Pacific Grove',
      'Mountain View',
      'Morgan Hill',
      'Cedar Rapids',
      'Grand Terrace',
      'Buena Park',
      'Coeur d’Alene',
    ].forEach(name => {
      expect(hasStreetAddress(name)).toBe(false);
    });
  });
});

describe('publicLocationLabel', () => {
  it('prefers structured city and state', () => {
    const label = publicLocationLabel({
      address: '123 Main St, Austin, TX 78701, USA',
      city: 'Austin',
      state: 'TX',
    });
    expect(label).toBe('Austin, TX');
    expectNoStreet(label);
  });

  it('US four-part address, no structured fields', () => {
    const label = publicLocationLabel({ address: '123 Main St, Austin, TX 78701, USA' });
    expect(label).toBe('Austin, TX');
    expectNoStreet(label);
  });

  it('Australian three-part address does not resolve to the street', () => {
    // The whole reason this function exists: addressArray[length - 3] returned
    // "2 Gal Cres" here.
    const label = publicLocationLabel({
      address: '2 Gal Cres, Moorebank NSW 2170, Australia',
    });
    expect(label).toBe('Moorebank, NSW');
    expectNoStreet(label);
  });

  it('UK address with an outcode/incode postcode', () => {
    const label = publicLocationLabel({ address: '10 Downing St, London SW1A 2AA, UK' });
    expect(label).toBe('London');
    expectNoStreet(label);
  });

  it('street with no house number is still not published', () => {
    expect(publicLocationLabel({ address: 'Nicholas Dr, Carlisle, PA 17015, USA' })).toBe(
      'Carlisle, PA'
    );
    expect(publicLocationLabel({ address: 'Catherine St, Union, NJ 07088, USA' })).toBe(
      'Union, NJ'
    );
    expectNoStreet(publicLocationLabel({ address: 'Nicholas Dr, Carlisle, PA 17015, USA' }));
  });

  it('street name with no house number in the FIRST segment is skipped', () => {
    // shortLocationLabel (social/meta link previews) delegates here. Its old
    // parser took parts[length - 2] and guarded only on a leading digit, so
    // this exact input put a street name into the link preview.
    const label = publicLocationLabel({ address: 'Gal Crescent, Moorebank' });
    expect(label).toBe('Moorebank');
    expectNoStreet(label);
  });

  it('malformed address degrades rather than leaking', () => {
    // Real data. The old helper rendered "11914".
    const label = publicLocationLabel({ address: '11914, Park Creek Drive' });
    expect(label).toBe('');
    expectNoStreet(label);
  });

  it('two-component address does not assume the first segment is safe', () => {
    expect(publicLocationLabel({ address: 'Albuquerque, NM' })).toBe('Albuquerque, NM');
    // ...but when the first segment IS a street, it is skipped, not trusted.
    const label = publicLocationLabel({ address: '2 Gal Cres, Moorebank' });
    expect(label).toBe('Moorebank');
    expectNoStreet(label);
  });

  it('address-only with no determinable locality degrades to region/country', () => {
    expect(publicLocationLabel({ address: '123 Main St, USA' })).toBe('USA');
    expect(publicLocationLabel({ address: '2 Gal Cres', state: 'NSW' })).toBe('NSW');
    expect(publicLocationLabel({ address: '2 Gal Cres' })).toBe('');
  });

  it('never emits a structured field that is itself a street', () => {
    // publicData written by an older client sometimes put the street in `city`.
    const label = publicLocationLabel({
      address: '15623 Skylark Ave, Fontana, CA 92336, USA',
      city: '15623 Skylark Ave',
      state: 'CA',
    });
    expect(label).toBe('Fontana, CA');
    expectNoStreet(label);
  });

  it('survives hostile and empty input', () => {
    expect(publicLocationLabel()).toBe('');
    expect(publicLocationLabel(null)).toBe('');
    expect(publicLocationLabel({})).toBe('');
    expect(publicLocationLabel({ address: '' })).toBe('');
    expect(publicLocationLabel({ city: '   ', state: '  ' })).toBe('');
    expect(publicLocationLabel({ city: 123 })).toBe('');
  });

  it('no input in the corpus can produce a house number or street name', () => {
    const corpus = [
      '15623 Skylark Ave, Fontana, CA 92336, USA',
      '11914 Park Creek Dr, Houston, TX 77070, USA',
      'Nicholas Dr, Carlisle, PA 17015, USA',
      '3908 Temple City Blvd, Rosemead, CA 91770, USA',
      'Catherine St, Union, NJ 07088, USA',
      '2 Gal Cres, Moorebank NSW 2170, Australia',
      '10 Downing St, London SW1A 2AA, UK',
      '11914, Park Creek Drive',
      '123 Main St',
      'Albuquerque, NM',
      'Panama City, FL 32401',
      'Bloomfield Hills, Michigan 48301',
    ];
    corpus.forEach(address => {
      const label = publicLocationLabel({ address });
      expectNoStreet(label);
      expect(hasStreetAddress(label)).toBe(false);
      expect(/\d{1,6}\s+\w/.test(label)).toBe(false);
    });
  });
});
