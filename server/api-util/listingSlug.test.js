const { createSlug } = require('./listingSlug');

// Pinned to src/util/urlHelpers.js createSlug(): the listing page canonical and
// the /go/ share redirect must agree on every title, or shares take two hops.
describe('listingSlug.createSlug', () => {
  it.each([
    ['The Orange Grove Lagoon', 'the-orange-grove-lagoon'],
    ["Rob & Evette's Pool", 'rob-evette-s-pool'],
    ['  Heated   Salt_Water Pool!! ', 'heated-salt-water-pool'],
    ['Piscina Climatizada Ñandú', 'piscina-climatizada-nandu'],
    ['20x40 Heated, Salt-Water Pool', '20x40-heated-salt-water-pool'],
    ['', 'no-slug'],
    [null, 'no-slug'],
    ['水池', 'no-slug'],
  ])('%j -> %s', (title, slug) => {
    expect(createSlug(title)).toBe(slug);
  });
});
