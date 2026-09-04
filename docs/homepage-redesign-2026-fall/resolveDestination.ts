// Homepage search destination resolver — Phase 1.
//
// The rule: never send every search into Sharetribe /s?address=. Our pSEO city
// pages are server-rendered, indexable and already carry inventory context, so
// they win whenever one exists.
//
//   location entered
//     -> exact canonical PRNM city page?      -> that page
//     -> ZIP / geocode to a nearby city page? -> nearest viable market page
//     -> otherwise                            -> /s?address=... (Sharetribe)
//
// TWO TRAPS THIS AVOIDS, both learned the hard way:
//
// 1. NEVER derive a city slug by pattern. On /p/all-locations there are 6,143
//    slugs, and a naive "-<2 letter state>$" regex captures
//    `airbnb-vs-pool-rental-near-me` as Maine. Matching must be against a
//    curated table of real city pages, keyed by an exact normalised name.
//    (Same family as the `%melbourne%` bug that swept in Melbourne FL.)
//
// 2. Canonical collisions are real: /p/arlington AND /p/arlington-va both
//    exist, as do /p/aurora and /p/aurora-il. A bare-name match is ambiguous,
//    so an entry without a state resolves ONLY when exactly one candidate
//    exists; otherwise we fall through rather than guess a city for the user.

export type Destination = {
  href: string;
  kind: 'pseo' | 'sharetribe';
  /** Why this destination was chosen — logged, useful when a route looks wrong. */
  reason: 'exact' | 'city-state' | 'unique-name' | 'nearby' | 'fallback';
};

export type CityPage = {
  /** Canonical path, exactly as it exists in production. Never constructed. */
  href: string;
  city: string;
  state: string;
  /** Normalised "city|state", e.g. "agoura hills|ca". */
  key: string;
  lat?: number;
  lon?: number;
  liveListings?: number;
};

const norm = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

const ZIP_RE = /^\d{5}(-\d{4})?$/;

/** Split "Coeur d'Alene, ID" into parts. Tolerates missing state. */
function parseQuery(raw: string): { city: string; state: string | null } {
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const tail = parts[parts.length - 1];
    if (/^[A-Za-z]{2}$/.test(tail)) return { city: norm(parts.slice(0, -1).join(' ')), state: tail.toLowerCase() };
  }
  return { city: norm(raw), state: null };
}

export type ResolverDeps = {
  /** The curated city table. Loaded server-side or from a small index — never a client blob of 6,143 rows. */
  lookup: (key: string) => CityPage | undefined;
  /** All pages whose city name matches, ignoring state. Used to detect collisions. */
  byName: (city: string) => CityPage[];
  /** ZIP -> nearest city pages, nearest first. Server-side; may return []. */
  nearestForZip?: (zip: string) => Promise<CityPage[]>;
  /** A market is only worth routing to if it has inventory. */
  minListings?: number;
};

export async function resolveDestinationWith(
  { query, occasion, date }: { query: string; occasion?: string; date?: string },
  deps: ResolverDeps,
): Promise<Destination> {
  const raw = (query || '').trim();
  const fallback = (): Destination => ({
    href: `/s?address=${encodeURIComponent(raw)}`,
    kind: 'sharetribe',
    reason: 'fallback',
  });
  if (!raw) return fallback();

  const min = deps.minListings ?? 1;
  const viable = (c: CityPage | undefined) =>
    !!c && (c.liveListings === undefined || c.liveListings >= min);

  // 1. "City, ST" — the unambiguous case.
  const { city, state } = parseQuery(raw);
  if (state) {
    const hit = deps.lookup(`${city}|${state}`);
    if (viable(hit)) return { href: hit!.href, kind: 'pseo', reason: 'city-state' };
  }

  // 2. Bare city name — only when it is unambiguous. /p/arlington vs
  //    /p/arlington-va must not be resolved by coin flip.
  if (!state) {
    const candidates = deps.byName(city).filter(viable);
    if (candidates.length === 1) {
      return { href: candidates[0].href, kind: 'pseo', reason: 'unique-name' };
    }
  }

  // 3. ZIP -> nearest viable market page.
  if (ZIP_RE.test(raw) && deps.nearestForZip) {
    const near = (await deps.nearestForZip(raw)).filter(viable);
    if (near.length > 0) return { href: near[0].href, kind: 'pseo', reason: 'nearby' };
  }

  // 4. Sharetribe search. Always reachable, never a dead end.
  return fallback();
}

/**
 * App-facing wrapper. Wire `deps` to the curated city table on the server;
 * the default below deliberately resolves nothing so an unwired build falls
 * back to Sharetribe rather than routing users to invented URLs.
 */
export async function resolveDestination(args: {
  query: string; occasion?: string; date?: string;
}): Promise<Destination> {
  return resolveDestinationWith(args, { lookup: () => undefined, byName: () => [] });
}
