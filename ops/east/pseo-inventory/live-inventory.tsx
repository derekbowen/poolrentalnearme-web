import type { LiveListing } from "@/lib/live-inventory";
import type { CityInventory, InventoryListing } from "@/server/city-inventory.functions";

/**
 * Server-rendered listing cards. The markup is present in the initial HTML —
 * no client fetch, no loading state — so Google sees titles, links and
 * locations without executing JavaScript.
 */

type CardListing = {
  id: string;
  slug: string;
  title: string;
  city: string | null;
  stateCode: string | null;
  price: number | null;
  img: string | null;
  capacity?: number | null;
  amenities?: string[];
  mi?: number;
};

function fromLive(l: LiveListing & { mi?: number }): CardListing {
  return {
    id: l.id, slug: l.slug, title: l.title, city: l.city || null,
    stateCode: l.state || null, price: l.price ?? null, img: l.img ?? null, mi: l.mi,
  };
}

/**
 * One pool card. `eager` is passed for the first row so the LCP image is not
 * lazy; everything below the fold stays lazy so a city page never ships eight
 * full-resolution images up front.
 */
function PoolCard({ l, eager }: { l: CardListing; eager: boolean }) {
  // price_amount is Sharetribe minor units (7900 => $79). A missing price
  // renders nothing at all rather than a fake "$0".
  const price =
    typeof l.price === "number" && l.price > 0
      ? `$${Math.round(l.price / 100)}/hr`
      : null;
  const where = [l.city, l.stateCode].filter(Boolean).join(", ");
  return (
    <a
      href={`/l/${l.slug}/${l.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
    >
      {l.img ? (
        <img
          src={l.img}
          alt={l.title}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          width={640}
          height={360}
          className="aspect-video w-full object-cover transition group-hover:scale-[1.02]"
        />
      ) : (
        // No image: keep the grid cell the same height so the layout holds.
        <div className="flex aspect-video w-full items-center justify-center bg-muted text-sm text-muted-foreground">
          Photo coming soon
        </div>
      )}
      <div className="flex flex-1 flex-col p-4">
        <div className="line-clamp-2 min-h-[2.75rem] font-semibold text-foreground">
          {l.title}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span className="line-clamp-1">{where || "United States"}</span>
          {price ? <span className="shrink-0 font-semibold text-primary">{price}</span> : null}
        </div>
        {(l.capacity || (l.amenities && l.amenities.length > 0)) ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {l.capacity ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                Up to {l.capacity} guests
              </span>
            ) : null}
            {(l.amenities ?? []).slice(0, 3).map((a) => (
              <span key={a} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {a}
              </span>
            ))}
          </div>
        ) : null}
        <span className="mt-3 text-sm font-semibold text-primary group-hover:underline">
          View pool
        </span>
      </div>
    </a>
  );
}

function Grid({ listings }: { listings: CardListing[] }) {
  return (
    <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {listings.map((l, i) => (
        <PoolCard key={l.id} l={l} eager={i < 3} />
      ))}
    </div>
  );
}

/** Legacy snapshot-backed section, still used by the hand-built hub routes. */
export function LiveInventory({
  listings,
  heading,
}: {
  listings: (LiveListing & { mi?: number })[];
  heading: string;
}) {
  if (!listings.length) return null;
  return (
    <section className="border-b border-border py-10 sm:py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold text-foreground sm:text-3xl">{heading}</h2>
        <Grid listings={listings.slice(0, 9).map(fromLive)} />
      </div>
    </section>
  );
}

/**
 * THE reusable inventory section for pSEO city pages. Exact-city supply is
 * rendered first under its own heading; nearby supply is only ever shown under
 * a separate "near" heading so a pool is never described as being in a city it
 * is not in. Renders a truthful empty state instead of a skeleton grid.
 */
export function CityInventorySection({
  inventory,
  cityName,
  browseAllHref = "/s",
  becomeHostHref,
}: {
  inventory: CityInventory;
  cityName: string;
  browseAllHref?: string;
  becomeHostHref?: string;
}) {
  const { exact, nearby } = inventory;
  const has = exact.length > 0 || nearby.length > 0;

  return (
    <section className="border-b border-border py-10 sm:py-14" id="pools-available">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {exact.length > 0 ? (
          <>
            <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
              Pools available in {cityName}
            </h2>
            <p className="mt-2 text-muted-foreground">
              Browse real pools currently listed on Pool Rental Near Me.
            </p>
            <Grid listings={exact as unknown as CardListing[]} />
          </>
        ) : null}

        {nearby.length > 0 ? (
          <div className={exact.length > 0 ? "mt-12" : ""}>
            <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
              More pools near {cityName}
            </h2>
            <p className="mt-2 text-muted-foreground">
              These are nearby pools, not inside {cityName} itself. Distance is from
              the center of {cityName}.
            </p>
            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {(nearby as unknown as CardListing[]).map((l, i) => (
                <div key={l.id}>
                  <PoolCard l={l} eager={exact.length === 0 && i < 3} />
                  {typeof l.mi === "number" ? (
                    <div className="mt-1.5 text-xs text-muted-foreground">
                      {l.mi < 1 ? "Under 1 mile" : `${Math.round(l.mi)} miles`} from {cityName}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {!has ? (
          <>
            <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
              We're still adding pools in {cityName}
            </h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              There are no pools listed in {cityName} yet. New pools go live every
              week — here is what you can do in the meantime.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={browseAllHref}
                className="rounded-lg bg-primary px-5 py-2.5 font-semibold text-primary-foreground transition hover:opacity-90"
              >
                Browse all pools
              </a>
              {becomeHostHref ? (
                <a
                  href={becomeHostHref}
                  className="rounded-lg border border-border px-5 py-2.5 font-semibold text-foreground transition hover:bg-muted"
                >
                  List your pool
                </a>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

export type { InventoryListing };
