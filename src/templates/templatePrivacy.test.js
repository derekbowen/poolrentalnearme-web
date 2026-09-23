import fs from 'fs';
import path from 'path';
import { mapListingToTemplateProps } from './dataMapper';

// Street-shaped inputs seen in real listings (redacted/altered examples).
const STREET_INPUTS = [
  { location: { address: '11914, Park Creek Drive' } },
  { location: { address: 'Park Creek Drive' } },
  { location: { address: '2 Gal Cres, Moorebank NSW 2170, Australia' } },
  { location: { address: '3005 Appaloosa St, Norco, CA 92860, USA' } },
  { location: { address: 'Nicholas Dr, Carlisle, PA 17015, USA' } },
  { location: { address: '123 Main Street', city: 'Austin', state: 'TX' } },
  { address: '45 Catherine St, Union, NJ 07088' }, // legacy top-level field
];
const STREET_TOKENS = /\b\d{1,6}\b,?\s+\w|\b(park creek|gal cres|appaloosa|nicholas dr|catherine st|main street)\b/i;

const listingWith = publicData => ({
  attributes: { title: 'Pool', description: '', publicData, geolocation: { lat: 1, lng: 2 } },
});

describe('template privacy backstop (dataMapper)', () => {
  it.each(STREET_INPUTS)('never hands a street to a template: %j', publicData => {
    const props = mapListingToTemplateProps(listingWith(publicData), null, [], {}, null);
    const everythingATemplateCanRead = JSON.stringify({
      location: props.location,
      publicDataLocation: props.publicData.location,
      publicDataAddress: props.publicData.address,
    });
    expect(everythingATemplateCanRead).not.toMatch(STREET_TOKENS);
  });

  it('keeps the locality: city/state and parsed city survive', () => {
    const a = mapListingToTemplateProps(listingWith(STREET_INPUTS[5]), null, [], {}, null);
    expect(a.location.address).toBe('Austin, TX');
    const b = mapListingToTemplateProps(listingWith(STREET_INPUTS[3]), null, [], {}, null);
    expect(b.location.address).toMatch(/Norco/);
  });

  it('leaves coordinates and unrelated publicData untouched', () => {
    const p = mapListingToTemplateProps(
      listingWith({ location: { address: '11914, Park Creek Drive' }, poolType: 'Saltwater' }),
      null, [], {}, null
    );
    expect(p.location.coordinates).toEqual({ lat: 1, lng: 2 });
    expect(p.publicData.poolType).toBe('Saltwater');
  });
});

describe('templates read addresses only through the mapper', () => {
  const dir = __dirname;
  const files = [];
  const walk = d =>
    fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.jsx?$/.test(e.name) && !/\.test\./.test(e.name) && e.name !== 'dataMapper.js') files.push(p);
    });
  walk(dir);

  it('finds the templates', () => {
    expect(files.length).toBeGreaterThan(6);
  });

  it.each(files.map(f => [path.relative(dir, f), f]))('%s has no raw address source', (_, f) => {
    const src = fs.readFileSync(f, 'utf8');
    expect(src).not.toMatch(/exactAddress|privateData|protectedData|formatted_address|publicData\??\.location|publicData\??\.address/);
  });
});
