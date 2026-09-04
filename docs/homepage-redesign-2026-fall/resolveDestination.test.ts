import { test, expect } from 'bun:test';
import { resolveDestinationWith, type CityPage, type ResolverDeps } from './resolveDestination';

// A miniature stand-in for the curated city table, built from REAL production
// paths verified 2026-09-04. Note the deliberate collisions.
const PAGES: CityPage[] = [
  { href: '/p/agoura-hills-ca', city: 'agoura hills', state: 'ca', key: 'agoura hills|ca', liveListings: 4 },
  { href: '/p/arlington',       city: 'arlington',    state: 'tx', key: 'arlington|tx',    liveListings: 6 },
  { href: '/p/arlington-va',    city: 'arlington',    state: 'va', key: 'arlington|va',    liveListings: 3 },
  { href: '/p/aurora',          city: 'aurora',       state: 'co', key: 'aurora|co',       liveListings: 5 },
  { href: '/p/aurora-il',       city: 'aurora',       state: 'il', key: 'aurora|il',       liveListings: 2 },
  { href: '/p/akron',           city: 'akron',        state: 'oh', key: 'akron|oh',        liveListings: 3 },
  { href: '/p/scottsdale-az',   city: 'scottsdale',   state: 'az', key: 'scottsdale|az',   liveListings: 0 },
];

const deps: ResolverDeps = {
  lookup: (k) => PAGES.find((p) => p.key === k),
  byName: (c) => PAGES.filter((p) => p.city === c),
  nearestForZip: async (zip) => (zip === '44301' ? [PAGES.find((p) => p.href === '/p/akron')!] : []),
  minListings: 1,
};

const run = (query: string) => resolveDestinationWith({ query }, deps);

test('exact "City, ST" routes to the canonical pSEO page', async () => {
  const d = await run('Agoura Hills, CA');
  expect(d).toEqual({ href: '/p/agoura-hills-ca', kind: 'pseo', reason: 'city-state' });
});

test('an unambiguous bare city name resolves', async () => {
  const d = await run('Akron');
  expect(d.href).toBe('/p/akron');
  expect(d.kind).toBe('pseo');
});

test('an AMBIGUOUS bare city name falls back rather than guessing', async () => {
  // /p/arlington (TX) and /p/arlington-va both exist. Picking one would send
  // half of these users to the wrong state.
  const d = await run('Arlington');
  expect(d.kind).toBe('sharetribe');
  expect(d.reason).toBe('fallback');
});

test('the same ambiguity resolves once a state is supplied', async () => {
  expect((await run('Arlington, VA')).href).toBe('/p/arlington-va');
  expect((await run('Arlington, TX')).href).toBe('/p/arlington');
});

test('Aurora is ambiguous too, and is treated the same way', async () => {
  expect((await run('Aurora')).kind).toBe('sharetribe');
  expect((await run('Aurora, IL')).href).toBe('/p/aurora-il');
});

test('a city page with zero live inventory is not routed to', async () => {
  // Scottsdale has a page but no pools. Sending a searcher there shows an empty
  // market; Sharetribe search at least widens the radius.
  const d = await run('Scottsdale, AZ');
  expect(d.kind).toBe('sharetribe');
});

test('a ZIP resolves to the nearest viable market page', async () => {
  const d = await run('44301');
  expect(d).toEqual({ href: '/p/akron', kind: 'pseo', reason: 'nearby' });
});

test('an unknown ZIP falls back to Sharetribe', async () => {
  expect((await run('99999')).kind).toBe('sharetribe');
});

test('THE REGEX TRAP: an editorial slug is never treated as a city', async () => {
  // A naive /-(al|ak|...|me|...)$/ suffix match reads
  // "airbnb-vs-pool-rental-near-me" as Maine. The curated table cannot.
  const d = await run('airbnb-vs-pool-rental-near-me');
  expect(d.kind).toBe('sharetribe');
});

test('free text and empty input always land somewhere usable', async () => {
  expect((await run('somewhere with a slide')).kind).toBe('sharetribe');
  expect((await run('')).kind).toBe('sharetribe');
  // Never a dead end, never a 404.
  expect((await run('')).href.startsWith('/s')).toBe(true);
});

test('the query is URL-encoded into the Sharetribe fallback', async () => {
  const d = await run('Coeur d\'Alene, ID');
  // encodeURIComponent leaves apostrophes alone by design; spaces and commas
  // are what actually need escaping in the query string.
  expect(d.href).toBe("/s?address=Coeur%20d'Alene%2C%20ID");
  expect(d.href.startsWith('/s?address=')).toBe(true);
});
