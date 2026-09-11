import { lazy, Suspense, useEffect, useState } from "react";
import { SiteHeader, SiteFooter } from "@/components/site-layout";

import { ErrorBoundary } from "@/components/error-boundary";
import type { ListingSummary } from "@/server/sharetribe.functions";
import type { HomeCity, HomeData } from "@/server/home-data.functions";
import { ACADEMY_HERO_MAP } from "@/lib/academy-images";
import { LiteYouTube } from "@/components/lite-youtube";
import { FredMascot } from "@/components/fred-mascot";

// Below-the-fold form components — pull react-hook-form + zod resolvers.
// Lazy-load so they don't bloat the homepage entry chunk.
const PoolWaitlistForm = lazy(() =>
  import("@/components/pool-waitlist-form").then((m) => ({ default: m.PoolWaitlistForm })),
);
import heroPool from "@/assets/pool-hero-default.webp";
import heroFamilyPool from "@/assets/hero-family-pool-card.webp";
import loveHero from "@/assets/love-hero.jpg";
import paradiseHero from "@/assets/paradise-hero.webp";
import loveFriends from "@/assets/love-friends.jpg";
import laSaltwaterFeatured from "@/assets/la-saltwater/hero-night.jpg";

const HIDE_LISTING_RE = /swim\s*spa|aquatic|rehab/i;

const NEARBY_RADIUS_MILES = 500;

type CuratedListing = NonNullable<HomeData["curated"]>[number];

// Real courses from the `courses` table — link straight to /p/elearning-academy-{slug}.
// Hand-picked to only include "rich" courses (cover image + video + long-form content)
// so every tile leads to a fully-populated lesson page, not a stub.
const FEATURED_OCCASIONS = [
  { slug: "pool-host-income-modeling-city-by-city-earnings-forecast", title: "Pool host income: city-by-city earnings forecast", img: "academy/income.jpg" },
  { slug: "multi-platform-hosting-cross-listing-prnm-swimply-peerspace", title: "Cross-listing on PRNM, Swimply & Peerspace", img: "academy/multi-platform.jpg" },
  { slug: "migrating-from-swimply-to-prnm-complete-switch-guide", title: "Switching from Swimply to PRNM", img: "academy/migrate.jpg" },
  { slug: "holiday-premium-playbook-memorial-day-july-4th-labor-day-halloween", title: "Holiday premium playbook: charging more on peak days", img: "academy/holiday.jpg" },
  { slug: "photoshoot-content-creator-ugc-pool-hosting", title: "Renting to photoshoots & content creators", img: "academy/photoshoot.jpg" },
  { slug: "aqua-fitness-senior-wellness-therapeutic-class-hosting", title: "Aqua fitness & wellness class hosting", img: "academy/wellness.jpg" },
];

export const HOMEPAGE_FAQS = [
  {
    q: "How do I rent a pool near me?",
    a: "Type your city or zip into the search, pick a private pool you like, choose a date and hours, and book — the host approves and you're set. Most pools rent by the hour, and the total you see includes everything before you pay.",
  },
  {
    q: "How much does it cost to rent a pool?",
    a: "Hosts set their own hourly rates — most private pool rentals run $45–$150 per hour depending on size, amenities, and location. The all-in price is shown up front, and hosts pay 0% fees, so they keep 100% of their rate.",
  },
  {
    q: "Is the pool host insured if a guest gets hurt?",
    a: "Pool Rental Near Me does not provide or arrange insurance. Every booking requires a signed guest waiver, and we do not verify whether hosts carry insurance — most homeowner policies exclude paid rentals, so check with your carrier before you host.",
  },
  {
    q: "How do I contact a pool owner before booking?",
    a: "Once you've found a pool you like, message the host directly through the listing page. Hosts typically reply within an hour. You can ask about pool depth, parking, sound rules, and bring-your-own-food policies before you confirm.",
  },
  {
    q: "Can strangers really swim in my private pool safely?",
    a: "Yes — and the data is on your side. Most hosts say guests treat the pool more carefully than friends do.",
  },
  {
    q: "Is it free for kids and families?",
    a: "Pricing is set per-hour by each host, often with a per-guest fee for groups over a threshold (e.g. 6 guests). Many family-friendly hosts include kids under 12 free. Check each listing's price breakdown before booking.",
  },
  {
    q: "How does Pool Rental Near Me make money?",
    a: "Hosts never pay a fee. We make money from one clear service fee guests pay at checkout, which covers payment processing and 24/7 support. Hosts are the business — we don't tax the business.",
  },
];

// Family pool hero — used for the in-page hero AND the og:image / twitter:image
// share preview so social CTR matches what visitors actually see on the page.
export const HOMEPAGE_HERO_IMAGE = paradiseHero;
// Kept exported so existing call sites that wanted the stock fallback still resolve.
export const HOMEPAGE_HERO_FALLBACK = heroPool;

export function HomePageContent({ data }: { data: HomeData | undefined | null }) {
  return (
    <ErrorBoundary>
      <HomePageInner data={data} />
    </ErrorBoundary>
  );
}

function HomePageInner({ data }: { data: HomeData | undefined | null }) {
  // Geolocation-driven UI (the "X pools near {city}" badge, the waitlist
  // form, the personalized "Pools near {city}" heading, and the prefilled
  // search address) depends on Cloudflare request headers that exist only
  // on the server. Rendering them during SSR — but not during the first
  // client render — causes a hydration mismatch (React #418). We render
  // a neutral, location-free shell first, then reveal location-aware
  // content after hydration.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  // Intercom messenger on the public homepage (the app id is public client-side;
  // WEST already boots it on internal pages - this is the missing EAST half).
  // Deferred to idle so it never competes with the hero paint.
  useEffect(() => {
    const w = window as any;
    if (w.Intercom) return;
    const boot = () => {
      w.intercomSettings = { api_base: "https://api-iam.intercom.io", app_id: "nuuc4281" };
      const s = document.createElement("script");
      s.async = true;
      s.src = "https://widget.intercom.io/widget/nuuc4281";
      document.head.appendChild(s);
    };
    if ("requestIdleCallback" in w) w.requestIdleCallback(boot, { timeout: 4000 });
    else setTimeout(boot, 2500);
  }, []);

  const safe: HomeData = (data && typeof data === "object" ? data : null) ?? {
    cities: [],
    cityCount: 0,
    categories: [],
    listings: [],
    nearby: { city: null, region: null, count: 0, nearestMiles: null },
    academyAvailable: [],
    academyHealth: {},
  };
  const academyHealth: Record<string, "missing" | "short" | "published"> =
    safe.academyHealth && typeof safe.academyHealth === "object"
      ? (safe.academyHealth as Record<string, "missing" | "short" | "published">)
      : {};
  const isHealthy = (slug: string) => academyHealth[slug] === "published";
  // Real courses always render — they live in the `courses` table, not content_pages.
  const visibleOccasions = FEATURED_OCCASIONS;
  const learningAcademyAvailable = true;
  const showAcademySection = true;
  const cities = Array.isArray(safe.cities) ? safe.cities : [];
  const cityCount = typeof safe.cityCount === "number" ? safe.cityCount : cities.length;
  void safe.categories; // categories now rendered by static PoolTypeGrid below
  void cityCount; // heading is count-free; the directory link carries the full list
  const rawListings = Array.isArray(safe.listings) ? safe.listings : [];
  // distanceMiles is computed server-side from Cloudflare geo headers, which
  // may differ between the upstream SSR request (proxied via /landing-page)
  // and what the client would compute on rehydration. Strip the badge until
  // after hydration to keep server and client markup identical (avoids
  // React #418 hydration mismatches on listing cards).
  const listings = hydrated
    ? rawListings
    : rawListings.map((l) => ({ ...l, distanceMiles: null }));
  const curated: CuratedListing[] = Array.isArray(safe.curated) ? safe.curated : [];
  // Curated spa / heated / indoor picks lead the inventory row. If that fetch
  // failed, fall back to the newest generic listings (same all-in price math).
  const inventory: CuratedListing[] =
    curated.length > 0
      ? curated
      : listings
          .filter((l: ListingSummary) => !HIDE_LISTING_RE.test(l.title || ""))
          .slice(0, 9)
          .map((l: ListingSummary) => ({
            ...l,
            allInCents: l.price ? Math.round((l.price.amount / 100) * 1.15 * 100) : null,
            hasPriceVariants: false,
            guests: null,
            spa: null,
            category: null,
            rating: null,
            reviewCount: null,
          }));
  const rawNearby = (safe.nearby && typeof safe.nearby === "object" ? safe.nearby : null) ?? {
    city: null,
    region: null,
    count: 0,
    nearestMiles: null,
  };
  // Until hydrated, pretend we have no location signal at all so the
  // markup is identical regardless of where the request originated.
  const nearby = hydrated
    ? rawNearby
    : { city: null, region: null, count: 0, nearestMiles: null };

  const hasNearbyPools =
    nearby.nearestMiles !== null && nearby.nearestMiles <= NEARBY_RADIUS_MILES;
  const showWaitlist =
    hydrated &&
    nearby.city !== null &&
    (nearby.nearestMiles === null || nearby.nearestMiles > NEARBY_RADIUS_MILES);
  const nearbyLabel = nearby.city
    ? `${nearby.city}${nearby.region ? `, ${nearby.region}` : ""}`
    : null;
  const searchHref = nearbyLabel
    ? `/s?address=${encodeURIComponent(nearbyLabel)}`
    : "/s";

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        {/* ── HERO ─────────────────────────────────────────────── */}
        <section
          aria-label="Rent a backyard pool by the hour"
          className="relative overflow-hidden"
          style={{ minHeight: "60vh" }}
        >
          <img
            src={paradiseHero}
            alt=""
            width={1024}
            height={768}
            fetchPriority="high"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{ background: "linear-gradient(to top, rgba(11,39,51,0.82) 0%, rgba(11,39,51,0.45) 45%, rgba(11,39,51,0.05) 100%)" }}
          />
          <div className="relative mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center px-4 py-12 text-center text-white sm:py-16 lg:py-24">
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight drop-shadow-md sm:text-5xl lg:text-6xl">
              Rent a pool <span style={{ color: "#7fe0ff" }}>you&rsquo;ll fall in love with</span>.
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base font-semibold text-white/95 drop-shadow sm:text-lg">
              Private pool rentals by the hour, anywhere in America — real neighbors, real backyards, booked in minutes.
            </p>
            <div className="mt-7 flex flex-col items-center gap-3">
              <a
                href="/s"
                aria-label="Find a pool to rent near you"
                className="inline-flex items-center justify-center rounded-full px-8 py-4 text-base font-semibold text-white shadow-lg transition-transform hover:scale-[1.02] sm:text-lg"
                style={{ backgroundColor: "#0EA5E9" }}
              >
                Find a pool near me&nbsp;&nbsp;&rarr;
              </a>
              <a
                href="/wizard/"
                aria-label="List your pool — keep 100%, zero host fees"
                className="inline-flex min-h-12 items-center justify-center rounded-full border-2 border-white/90 px-8 py-3 text-base font-semibold text-white transition-transform hover:scale-[1.02] sm:text-lg"
              >
                Have a pool? Keep 100% &mdash; zero host fees&nbsp;&rarr;
              </a>
            </div>
          </div>
        </section>

        {/* ── HOST-LOVE BAND + REAL-POOLS TICKER (c-love) ───────── */}
        <section aria-label="We love pool hosts" className="overflow-hidden text-white" style={{ backgroundColor: "#0EA5E9" }}>
          <p className="mx-auto max-w-3xl px-4 pt-4 text-center text-base font-extrabold">
            We built this for hosts. ❤️ 0% host fees — you keep every dollar you earn.
          </p>
          <div className="mt-2 w-full overflow-hidden pb-3">
            <style>{`@keyframes prnmTicker{from{transform:translateX(0)}to{transform:translateX(-50%)}}.prnm-ticker{display:inline-block;white-space:nowrap;will-change:transform;animation:prnmTicker 45s linear infinite}@media (prefers-reduced-motion:reduce){.prnm-ticker{animation:none}}`}</style>
            <div className="prnm-ticker text-sm font-bold opacity-95">
              {"🏊 Hallico Outdoor Oasis — Spring Hill, TN  ·  🏊 Twin Palms Oasis — Las Vegas, NV  ·  🏊 Nobody Likes A Shady Beach — La Grange, KY  ·  🏊 Richmond Hideout — Richmond, TX  ·  🏊 Backyard Bliss — Union, NJ  ·  🏊 The Backyard Blue — Chestertown, MD  ·  🏊 Hallico Outdoor Oasis — Spring Hill, TN  ·  🏊 Twin Palms Oasis — Las Vegas, NV  ·  🏊 Nobody Likes A Shady Beach — La Grange, KY  ·  🏊 Richmond Hideout — Richmond, TX  ·  🏊 Backyard Bliss — Union, NJ  ·  🏊 The Backyard Blue — Chestertown, MD  ·  "}
            </div>
          </div>
        </section>

        {/* ── 0% HOST FEES PROMO ───────────────────── */}
        {/* ── SWITCHER STRIP: hosts already on Swimply / FBMP ── */}
        <section aria-label="Already renting your pool elsewhere?" className="border-b border-border bg-background">
          <div className="mx-auto max-w-3xl px-4 py-5 text-center sm:px-6">
            <h2 className="text-lg font-extrabold text-foreground sm:text-xl">
              Already renting your pool on Swimply or Facebook Marketplace?
            </h2>
            <p className="mx-auto mt-1.5 max-w-xl text-sm text-muted-foreground">
              Keep doing it. Add your pool here too and keep 100% of every booking we send you. No exclusivity, no host fees, no catch.
            </p>
            <div className="mt-3.5 flex flex-col items-center justify-center gap-2.5 sm:flex-row sm:gap-5">
              <a href="/p/elearning-academy-migrating-from-swimply-to-prnm-complete-switch-guide" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">Switching from Swimply &rarr;</a>
              <a href="/p/elearning-academy-multi-platform-hosting-cross-listing-prnm-swimply-peerspace" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">Cross-listing guide &rarr;</a>
              <a href="/wizard/" className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary-glow">List your pool &rarr;</a>
            </div>
          </div>
        </section>

        <section
          aria-label="Zero percent host fees — hosts never pay a fee"
          className="relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, #0B4A6F 0%, #0EA5E9 58%, #38BDF8 100%)" }}
        >
          <div className="mx-auto max-w-4xl px-4 py-10 text-center text-white sm:py-14">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/85 sm:text-sm">
              Hosts never pay a fee
            </p>
            <p className="mx-auto mt-5 max-w-2xl text-xl font-semibold leading-snug text-white sm:text-2xl">
              <span style={{ color: "#FFE08A" }}>It&rsquo;s permanent.</span> 0% host fees
              started as a thank-you to this community. It&rsquo;s now how we run the business.
            </p>
            <div className="mt-6 flex items-baseline justify-center gap-3 sm:gap-4">
              <span className="text-7xl font-black leading-none tracking-tighter drop-shadow-sm sm:text-8xl">
                0%
              </span>
            </div>
            <h2 className="mt-3 text-2xl font-extrabold uppercase tracking-tight sm:text-4xl">
              Host Fees&nbsp;—&nbsp;Now Permanent
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg font-semibold text-white sm:text-xl">
              You keep 100% of every booking. List your pool free.
            </p>
            <p className="mx-auto mt-3 max-w-md text-sm font-medium opacity-90">
              Swimply&rsquo;s 15% host fee leaves you $850 on a $1,000 month. Ours is 0%. You keep $1,000.
            </p>
            <div className="mt-7">
              <a
                href="/wizard/"
                aria-label="List your pool for free"
                className="inline-flex items-center justify-center rounded-full bg-white px-9 py-4 text-base font-bold text-[#0B4A6F] shadow-xl transition-transform hover:scale-[1.03] sm:text-lg"
              >
                List Your Pool&nbsp;&nbsp;&rarr;
              </a>
            </div>
            <p className="mx-auto mt-6 max-w-2xl text-[11px] leading-relaxed text-white/70 sm:text-xs">
              Hosts never pay a fee. We make money from one clear service fee guests pay at
              checkout, which covers payment processing and 24/7 support. Hosts are the business&nbsp;&mdash; we don&rsquo;t tax the business.{" "}
              <a
                href="/terms-of-service"
                className="underline underline-offset-2 hover:text-white"
              >
                Terms
              </a>{" "}
              apply.
            </p>
          </div>
        </section>

        {/* Trust line under hero */}
        <div className="border-b border-border bg-background">
          <p className="mx-auto max-w-5xl px-4 py-3 text-center text-xs text-muted-foreground sm:text-sm">
          </p>
        </div>

        {/* ── TWO DOORS ────────────────────────────────────────── */}
        <section aria-label="Two ways to use Pool Rental Near Me" className="bg-background">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
            <h2 className="text-center text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Two ways to fall for a pool.
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-muted-foreground sm:text-base">
              Book a swimming pool rental as a guest, or list your private pool — hosts like Katy charge $100/hour, and you keep all of it.
            </p>
            <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
              {/* Card A — Renter */}
              <a
                href="/s"
                aria-label="I'm going swimming — find a pool to rent"
                className="group relative flex min-h-[260px] flex-col items-start overflow-hidden rounded-xl border border-border bg-secondary/30 p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
              >
                <span className="text-4xl" aria-hidden>🏖</span>
                <h3 className="mt-3 text-xl font-semibold text-foreground">I'm going swimming</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Rent a private swimming pool by the hour and find private pools near you — simple, affordable, and the best Saturday your kids will remember.
                </p>
                <span
                  className="mt-auto inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold text-white"
                  style={{ backgroundColor: "#0EA5E9" }}
                >
                  Find a pool &rarr;
                </span>
              </a>

              {/* Card B — Host */}
              <a
                href="/p/hosting"
                aria-label="I'm sharing my pool — list my pool on Pool Rental Near Me"
                className="group relative flex min-h-[260px] flex-col items-start overflow-hidden rounded-xl p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
                style={{
                  backgroundColor: "#ffb8d9",
                  border: "3px dashed #ffd21f",
                  color: "#22303c",
                }}
              >
                <span className="text-4xl" aria-hidden>💙</span>
                <h3 className="mt-3 text-xl font-bold">I'm sharing my pool</h3>
                <p className="mt-2 text-sm font-medium" style={{ color: "#46323c" }}>
                  If you can text a photo, you can host. Hosts like Katy charge $100/hour — eight booked hours a weekend is $800.
                </p>
                <span
                  className="mt-auto inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-bold text-white"
                  style={{ backgroundColor: "#0EA5E9" }}
                >
                  List my pool &rarr;
                </span>
              </a>
            </div>
          </div>
        </section>

        {/* ── EVENT TILES ──────────────────────────────────────── */}
        <section aria-label="Browse pools by occasion" className="bg-secondary/20">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
            <h2 className="text-center text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Any excuse is a good one to dive in.
            </h2>
            <div className="mx-auto mt-6 grid max-w-2xl grid-cols-2 gap-3 sm:gap-4 md:max-w-4xl md:grid-cols-3">
              {[
                { emoji: "👰", label: "Bachelorette", href: "/s?keywords=bachelorette", aria: "bachelorette parties" },
                { emoji: "🎂", label: "Birthday", href: "/s?keywords=birthday", aria: "birthday parties" },
                { emoji: "👨‍👩‍👧", label: "Family Day", href: "/s?keywords=family", aria: "family days" },
                { emoji: "🏊", label: "Swim Lesson", href: "/s?keywords=lesson", aria: "swim lessons" },
                { emoji: "🎉", label: "Pool Party", href: "/s?keywords=party", aria: "pool parties" },
                { emoji: "🌤", label: "Just Tuesday", href: "/s", aria: "any day of the week" },
              ].map((t) => (
                <a
                  key={t.label}
                  href={t.href}
                  aria-label={`Browse pools for ${t.aria}`}
                  className="flex aspect-square max-h-[160px] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-background p-4 text-center transition-all duration-200 ease-in-out hover:-translate-y-1 hover:shadow-md"
                >
                  <span className="text-[36px] leading-none" aria-hidden>{t.emoji}</span>
                  <span className="text-sm font-bold text-foreground">{t.label}</span>
                </a>
              ))}
            </div>
          </div>
        </section>



        {/* ── SCRAPBOOK COLLAGE (c-love, from the approved preview) ── */}
        <section aria-label="Real swim days on Pool Rental Near Me" className="bg-background">
          <div className="relative mx-auto h-[300px] w-full max-w-3xl px-4 py-2">
            <div className="absolute left-4 top-8 w-[52%] -rotate-3">
              <div className="overflow-hidden rounded-[22px] bg-white p-1.5" style={{ boxShadow: "0 6px 18px rgba(34,48,60,0.14)" }}>
                <img src={loveHero} alt="Sunlit backyard pool" width={800} height={800} loading="lazy" decoding="async" className="h-[190px] w-full rounded-[18px] object-cover" />
              </div>
            </div>
            <div className="absolute right-4 top-0 w-[44%] rotate-2">
              <div className="relative overflow-hidden rounded-[22px] bg-white p-1.5" style={{ boxShadow: "0 6px 18px rgba(34,48,60,0.14)" }}>
                <img src={loveFriends} alt="Friends laughing poolside" width={800} height={447} loading="lazy" decoding="async" className="h-[230px] w-full rounded-[18px] object-cover" />
                <span className="absolute left-3 top-3 rounded-full px-3 py-1.5 text-[12px] font-extrabold text-white" style={{ backgroundColor: "#0EA5E9" }}>
                  Booked in 2 taps
                </span>
              </div>
            </div>
            <div className="absolute bottom-2 right-5 z-10 flex h-[70px] w-[70px] flex-col items-center justify-center rounded-full text-white" style={{ backgroundColor: "#ff6f52", boxShadow: "0 6px 18px rgba(34,48,60,0.2)" }}>
              <span className="text-[19px] font-extrabold leading-none">0%</span>
              <span className="mt-0.5 text-[10px] font-extrabold leading-none">host fees</span>
            </div>
          </div>
        </section>

        {/* Comparative trust strip */}
        <section aria-label="Why book with Pool Rental Near Me" className="border-b border-border bg-secondary/30">
          <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 text-center sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
            <div>
              <div className="text-2xl font-bold text-primary">0%</div>
              <div className="mt-1 text-sm font-semibold text-foreground">Host fees</div>
              <div className="mt-1 text-xs text-muted-foreground">Hosts keep every dollar</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-primary">40+</div>
              <div className="mt-1 text-sm font-semibold text-foreground">U.S. states</div>
              <div className="mt-1 text-xs text-muted-foreground">From Austin to Albany</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-primary">24/7</div>
              <div className="mt-1 text-sm font-semibold text-foreground">Live human support</div>
              <div className="mt-1 text-xs text-muted-foreground">Before, during & after</div>
            </div>
          </div>
        </section>

        {/* As Seen In media strip */}
        <section aria-label="Press" className="border-b border-border bg-background">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">As featured in</span>
              <a
                href="https://natlawreview.com/press-releases/two-truck-drivers-built-national-pool-rental-marketplace-their-hours"
                target="_blank"
                rel="noopener noreferrer"
                className="font-serif text-base font-semibold text-foreground/80 transition-colors hover:text-foreground"
              >
                National Law Review
              </a>
              <a
                href="https://esimoney.com/side-hustle-interview-12/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-serif text-base font-semibold text-foreground/80 transition-colors hover:text-foreground"
              >
                ESI Money
              </a>
            </div>
          </div>
        </section>

        {/* ── LOVE NOTES (c-love): real words from real people ── */}
        <section aria-label="Love notes from swimmers and hosts" className="bg-background">
          <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
            <h2 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">Love notes 💌</h2>
            <p className="mt-1 text-sm text-muted-foreground">Five hearts is our whole review system.</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {[
                ["“I love you guys over at Pool Rental Near Me — the founder and co-founder personally called me to make sure I&rsquo;m all right.”", "Demarco", "Queens, NY"],
                ["“Rock on, Derek. I see your hustle this year and it&rsquo;s legit.”", "Salty Without The Sharks", "CA"],
              ].map(([q, who, where]) => (
                <div key={who} className="rounded-2xl p-5" style={{ backgroundColor: "#e4f4fc" }}>
                  <div className="text-sm tracking-wide" style={{ color: "#ff6f52" }}>❤️❤️❤️❤️❤️</div>
                  <p className="mt-2 text-[15px] font-bold leading-relaxed text-foreground" dangerouslySetInnerHTML={{ __html: q }} />
                  <div className="mt-4">
                    <div className="text-sm font-extrabold text-foreground">{who}</div>
                    <div className="text-xs font-semibold text-muted-foreground">{where}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Featured listing video — real backyard, real host. Social proof above the academy CTA. */}
        <section aria-label="Featured pool tour" className="border-b border-border bg-background">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
            <div className="grid items-center gap-10 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <LiteYouTube videoId="jJF_OyufFQs" title="Tour Katy's Staycation Saltwater Getaway" />
              </div>
              <div className="lg:col-span-5">
                <p className="text-sm font-semibold uppercase tracking-wide text-primary">Featured pool</p>
                <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  Tour Katy's Staycation Saltwater Getaway
                </h2>
                <p className="mt-4 text-base text-muted-foreground">
                  Heated saltwater pool, private backyard, room for the whole crew. See what one of our top hosts built — then book it for your next reunion, birthday, or chill Sunday.
                </p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <a
                    href="/l/katy-staycation-saltwater-getaway/685b3bd3-1e5d-44b8-9483-5f6452306157"
                    className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-lg transition-transform hover:scale-105"
                  >
                    Book this pool →
                  </a>
                  <a
                    href="/s"
                    className="inline-flex items-center justify-center rounded-full border border-border bg-background px-6 py-3 text-base font-semibold text-foreground transition-colors hover:bg-secondary"
                  >
                    Browse all pools
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Free Pool Host Academy — unique e-learning differentiator */}
        {showAcademySection && (
        <section className="relative overflow-hidden border-y border-border bg-gradient-to-br from-primary/5 via-background to-primary/10">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
            <div className="grid items-center gap-10 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
                  Free · Only on PRNM
                </span>

                {/* Fred + headline — Fred is the focal point */}
                <div className="mt-4 flex items-start gap-4 sm:gap-6">
                  <div className="relative flex-shrink-0">
                    <FredMascot
                      variant="full"
                      className="h-32 w-32 drop-shadow-xl sm:h-44 sm:w-44 lg:h-56 lg:w-56"
                    />
                    <span className="absolute -right-2 -top-1 inline-flex items-center rounded-full bg-yellow-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-yellow-950 shadow-md sm:text-xs">
                      Your coach
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
                      Learn with Fred — the only Pool Host Academy on the internet.
                    </h2>
                    <div className="relative mt-3 inline-block rounded-2xl bg-card px-4 py-2 text-sm font-medium text-foreground shadow-md ring-1 ring-border sm:text-base">
                      <span className="font-semibold">Hi, I&rsquo;m Fred! 👋</span> I teach pool people how to earn more and stress less.
                      <div className="absolute -left-1.5 top-4 h-3 w-3 rotate-45 bg-card ring-1 ring-border" />
                    </div>
                  </div>
                </div>

                <p className="mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
                  193 free classes on safety, pricing, marketing, AI tools, guest experience, and the highest-paying booking niches. Five minutes each. Zero homework, all heart — Fred wrote the playbook.
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {[
                    "Safety & Rescue",
                    "Marketing & Pricing",
                    "AI & Automation",
                    "Occasion Playbooks",
                    "Legal & Insurance",
                    "Switch from Swimply",
                  ].map((t) => (
                    <div key={t} className="flex items-center gap-3 rounded-xl border border-border bg-card/60 px-4 py-2.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
                      <span className="text-sm font-medium text-foreground">{t}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-8 flex flex-wrap gap-3">
                  {learningAcademyAvailable && (
                    <a
                      href="/p/learningacademy"
                      className="inline-flex items-center justify-center rounded-full bg-primary px-7 py-3 text-base font-semibold text-primary-foreground shadow-lg transition-transform hover:scale-105"
                    >
                      Learn with Fred — 193 free classes →
                    </a>
                  )}
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  100% free · English & Español · No sign-up required
                </p>
              </div>
              <div className="lg:col-span-5">
                <div className="grid grid-cols-2 gap-3">
                  {visibleOccasions.slice(0, 4).map((o, idx) => (
                    <a
                      key={o.slug}
                      href={`/p/elearning-academy-${o.slug}`}
                      className={`group relative overflow-hidden rounded-2xl shadow-md transition-all hover:-translate-y-1 hover:shadow-xl ${idx % 2 === 0 ? "translate-y-4" : ""}`}
                    >
                      <div className="aspect-square overflow-hidden">
                        <img
                          src={ACADEMY_HERO_MAP[o.img]}
                          alt={`${o.title} hosting course`}
                          width={800}
                          height={440}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                      </div>
                      <div className="absolute inset-x-0 bottom-0 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wider text-white/80">Course</div>
                        <div className="text-sm font-bold text-white">{o.title}</div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
        )}

        {showWaitlist ? (
          <ErrorBoundary name="PoolWaitlistForm" silent>
            <Suspense fallback={null}>
              <PoolWaitlistForm
                nearestMiles={nearby.nearestMiles}
                city={nearby.city}
                region={nearby.region}
              />
            </Suspense>
          </ErrorBoundary>
        ) : (
          inventory.length > 0 && (
            <ErrorBoundary name="NearbyListingsSection" silent>
              <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
                <div className="flex flex-col items-center text-center">
                  <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                    {hasNearbyPools && nearbyLabel
                      ? `Rent a pool near ${nearbyLabel}`
                      : "Rent a pool near you"}
                  </h2>
                  <p className="mt-3 max-w-xl text-muted-foreground">
                    Real backyards from real hosts — heated pools, spas and indoor swims included. Prices are per hour, all fees in.
                  </p>
                </div>
                <div className="-mx-4 mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-6 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3">
                  <a
                    href="/p/la-saltwater-featured"
                    className="group relative block w-[78vw] max-w-[320px] shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-card transition-all hover:shadow-lg sm:w-auto sm:max-w-none"
                  >
                    <div className="aspect-[4/3] overflow-hidden bg-muted">
                      <img
                        src={laSaltwaterFeatured}
                        alt="La Saltwater Pool & Spa, Sherman Oaks"
                        width={400}
                        height={300}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-yellow-400 to-amber-500 px-2.5 py-1 text-[11px] font-bold text-black shadow">
                        🏆 Top 9 Pools in LA 2025
                      </div>
                    </div>
                    <div className="p-4">
                      <h3 className="line-clamp-1 text-base font-semibold text-foreground">
                        La Saltwater Pool & Spa
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Sherman Oaks, CA · Saltwater · Heated spa · Fits 45
                      </p>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                          PRNM Featured
                        </span>
                        <span className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm transition-transform group-hover:scale-105">
                          View pool →
                        </span>
                      </div>
                    </div>
                  </a>
                  <a
                    href="/p/jan"
                    className="group relative block w-[78vw] max-w-[320px] shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-card transition-all hover:shadow-lg sm:w-auto sm:max-w-none"
                  >
                    <div className="aspect-[4/3] overflow-hidden bg-muted">
                      {data?.janFeatured?.heroImage ? (
                        <img
                          src={data.janFeatured.heroImage}
                          alt="TheSwimpark, Bothell WA"
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-sky-400 to-emerald-500 text-white">
                          <span className="text-lg font-semibold">TheSwimpark</span>
                        </div>
                      )}
                      <div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-rose-500 to-pink-500 px-2.5 py-1 text-[11px] font-bold text-white shadow">
                        ✨ NEW · Newest featured pool
                      </div>
                    </div>
                    <div className="p-4">
                      <h3 className="line-clamp-1 text-base font-semibold text-foreground">
                        TheSwimpark — hosted by Jan
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Pacific Northwest · 85° heated · Mountain views · Fits 50
                      </p>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                          Top provider
                        </span>
                        <span className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm transition-transform group-hover:scale-105">
                          View pool →
                        </span>
                      </div>
                    </div>
                  </a>
                  {inventory.map((l) => (
                    <ErrorBoundary key={l.id} name={`FeaturedPoolCard:${l.id}`} fallback={null}>
                      <FeaturedPoolCard listing={l} />
                    </ErrorBoundary>
                  ))}
                </div>
                <div className="mt-10 text-center">
                  <a
                    href={searchHref}
                    className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-lg transition-transform hover:scale-105"
                  >
                    Find a pool near you →
                  </a>
                </div>
              </section>
            </ErrorBoundary>
          )
        )}


        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Questions? <span className="text-primary">We've thought of everything.</span>
              </h2>
              <p className="mt-3 text-muted-foreground">
                The questions first-time renters and hosts ask us most.
              </p>
              <div className="mt-8 space-y-3">
                {HOMEPAGE_FAQS.map((f, i) => (
                  <details key={i} className="group rounded-2xl border border-border bg-card p-5 open:shadow-md">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-foreground">
                      {f.q}
                      <span className="text-muted-foreground transition-transform group-open:rotate-45" aria-hidden>+</span>
                    </summary>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
                  </details>
                ))}
              </div>
            </div>
            <div className="lg:col-span-5">
              <div className="sticky top-8 flex h-full min-h-[280px] flex-col items-start justify-center rounded-3xl bg-gradient-to-br from-primary to-primary-glow p-8 text-primary-foreground shadow-xl">
                <h3 className="text-2xl font-bold">Talk to a real human.</h3>
                <p className="mt-3 text-primary-foreground/85">
                  Trying to plan a wedding-weekend takeover or a film shoot? Need a custom quote for a 30-person reunion? Skip the search — we'll help you book it.
                </p>
                <a
                  href="mailto:hello@poolrentalnearme.com"
                  className="mt-6 inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-primary shadow-lg transition-transform hover:scale-105"
                >
                  Contact concierge →
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Host resources — advocacy hub + blog. Educational, not promotional. */}
        <section aria-label="Resources for pool hosts" className="border-y border-border bg-background">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-wider text-primary">For pool hosts</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Host smarter, host legally.
              </h2>
              <p className="mt-3 text-muted-foreground">
                Free guides on local laws, permits, HOA rules, taxes, and the day-to-day playbook for renting your pool the right way.
              </p>
            </div>
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              <a
                href="/p/host-advocacy"
                className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-8 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl"
              >
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
                    Host advocacy hub
                  </span>
                  <h3 className="mt-4 text-2xl font-bold text-foreground">
                    State-by-state hosting laws and rights
                  </h3>
                  <p className="mt-3 text-sm text-muted-foreground">
                    What's allowed where you live, how to handle HOAs and neighbors, and how we fight for hosts when local rules get in the way.
                  </p>
                </div>
                <span className="mt-6 inline-flex items-center text-sm font-semibold text-primary">
                  Browse 50 state guides →
                </span>
              </a>
              <a
                href="/p/blog"
                className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-secondary/40 via-card to-card p-8 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl"
              >
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-wider text-foreground">
                    📝 The blog
                  </span>
                  <h3 className="mt-4 text-2xl font-bold text-foreground">
                    Honest stories from real pool hosts
                  </h3>
                  <p className="mt-3 text-sm text-muted-foreground">
                    The good, the awkward, and the lessons learned. Hosting tips, platform deep-dives, and the side of pool rentals nobody else writes about.
                  </p>
                </div>
                <span className="mt-6 inline-flex items-center text-sm font-semibold text-primary">
                  Read the blog →
                </span>
              </a>
            </div>
          </div>
        </section>

        <HowToRentSection />
        <PoolTypeGrid />

        {cities.length > 0 && (
          <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Pool rentals by city
            </h2>
            <p className="mt-2 text-muted-foreground">
              Find a private pool in your zip code, or browse the full{" "}
              <a
                href="/p/all-locations"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                pool rentals near me
              </a>{" "}
              directory.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {cities.map((c: HomeCity, i: number) => (
                <a
                  key={c.slug}
                  href={`/p/${c.slug}`}
                  className={`text-sm text-muted-foreground transition-colors hover:text-primary hover:underline${i >= 24 ? " hidden sm:block" : ""}`}
                >
                  {c.name}, {c.state_code}
                </a>
              ))}
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <a
                href="/s"
                className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
              >
                Find a pool near you
              </a>
              <a
                href="/wizard/"
                className="inline-flex items-center justify-center rounded-full border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground shadow-sm transition hover:border-primary hover:text-primary"
              >
                List your pool
              </a>
              <a
                href="/p/pool-rentals"
                className="inline-flex items-center justify-center px-2 py-3 text-sm font-semibold text-primary hover:underline"
              >
                Browse all states →
              </a>
              <a
                href="/p/all-locations"
                className="inline-flex items-center justify-center px-2 py-3 text-sm font-semibold text-primary hover:underline"
              >
                Pool rentals near me →
              </a>
            </div>
          </section>
        )}

        <section className="bg-primary text-primary-foreground">
          <div className="mx-auto flex max-w-7xl flex-col items-start gap-6 px-4 py-14 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <div>
              <h2 className="text-2xl font-bold sm:text-3xl">
                Got a pool? Turn it into income.
              </h2>
              <p className="mt-2 max-w-2xl text-primary-foreground/85">
                Hosts charge up to $100/hour — eight booked hours a weekend is $800, and you keep all of it. Free to list, 0% host fees.
              </p>
            </div>
            <a
              href="/wizard/"
              className="inline-flex shrink-0 items-center justify-center rounded-full bg-white px-7 py-3 text-base font-semibold text-primary shadow-lg transition-transform hover:scale-105"
            >
              List your pool →
            </a>
          </div>
        </section>
        {/* ── LOVE CLOSER: Text Derek + socials + smart app (c-love) ── */}
        <section aria-label="Text the founder and follow Pool Rental Near Me" className="bg-background">
          <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
            <div className="rounded-2xl p-7 text-center" style={{ backgroundColor: "#ffb8d9", border: "3px dashed #ffd21f" }}>
              <div className="text-2xl" aria-hidden>👋</div>
              <h2 className="mt-1 text-xl font-extrabold" style={{ color: "#22303c" }}>Stuck on anything? Text Derek.</h2>
              <p className="mx-auto mt-1 max-w-md text-sm font-medium" style={{ color: "#46323c" }}>
                He founded Pool Rental Near Me and answers hosts himself, usually within the hour.
              </p>
              <a
                href={"sms:+18556178207?&body=" + encodeURIComponent("Hi Derek! I\u2019m looking at Pool Rental Near Me and I have a question.")}
                className="mt-4 inline-flex min-h-[48px] w-full max-w-md items-center justify-center rounded-full bg-white px-6 text-[15px] font-extrabold"
                style={{ color: "#0EA5E9" }}
              >
                Text Derek
              </a>
            </div>
            <div className="mt-6 rounded-2xl border border-border bg-background p-6 text-center shadow-sm">
              <h2 className="text-lg font-extrabold text-foreground">Swim with us everywhere 💙</h2>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                {[
                  ["Facebook", "https://www.facebook.com/poolrentalnearme"],
                  ["Instagram", "https://www.instagram.com/poolrentalnearme"],
                  ["TikTok", "https://www.tiktok.com/@poolrentalnearme"],
                  ["YouTube", "https://www.youtube.com/@poolrentalnearme"],
                  ["X", "https://x.com/poolrentalnearm"],
                  ["LinkedIn", "https://www.linkedin.com/company/poolrentalnearme"],
                  ["Pinterest", "https://www.pinterest.com/poolrentalnearme"],
                ].map(([name, url]) => (
                  <a
                    key={name}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full px-4 py-2 text-[13px] font-bold"
                    style={{ backgroundColor: "#e4f4fc", color: "#0369a1" }}
                  >
                    {name}
                  </a>
                ))}
              </div>
              <p className="mt-4 text-[15px] font-extrabold text-foreground">Made with ❤️ for pool people.</p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

// --- Pool type discovery grid (12 cards with image backgrounds) ---
import poolTypeSalt from "@/assets/pool-types/saltwater.jpg";
import poolTypeHeated from "@/assets/pool-types/heated.jpg";
import poolTypeResort from "@/assets/pool-types/resort-style.jpg";
import poolTypeLap from "@/assets/pool-types/lap.jpg";
import poolTypeHotTub from "@/assets/pool-types/hot-tub.jpg";
import poolTypeKitchen from "@/assets/pool-types/outdoor-kitchen.jpg";
import poolTypeFire from "@/assets/pool-types/fire-pit.jpg";
import poolTypePet from "@/assets/pool-types/pet-friendly.jpg";
import poolTypeTheater from "@/assets/pool-types/outdoor-theater.jpg";
import poolTypeIndoor from "@/assets/pool-types/indoor.jpg";

// Each tile links to a marketplace search that actually narrows results
// (keyword search, or the indoor category). Result counts verified 2026-09-09.
const POOL_TYPES: { name: string; href: string; img: string }[] = [
  { name: "Saltwater Pools", href: "/s?keywords=saltwater", img: poolTypeSalt },
  { name: "Heated Pools", href: "/s?keywords=heated", img: poolTypeHeated },
  { name: "Resort-Style Pools", href: "/s?keywords=resort", img: poolTypeResort },
  { name: "Lap Pools", href: "/s?keywords=lap", img: poolTypeLap },
  { name: "Pools with Hot Tubs", href: "/s?keywords=hot%20tub", img: poolTypeHotTub },
  { name: "Pools with Outdoor Kitchens", href: "/s?keywords=kitchen", img: poolTypeKitchen },
  { name: "Pools with Fire Pits", href: "/s?keywords=fire%20pit", img: poolTypeFire },
  { name: "Pet-Friendly Pools", href: "/s?keywords=pet", img: poolTypePet },
  { name: "Pools with Outdoor Theaters", href: "/s?keywords=theater", img: poolTypeTheater },
  { name: "Indoor Pools", href: "/s?pub_categoryLevel1=pool&pub_categoryLevel2=indoorpools", img: poolTypeIndoor },
];

function HowToRentSection() {
  return (
    <section className="bg-background">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          How to rent a pool
        </h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Renting a pool near you takes about five minutes. Every listing is a real
          backyard from a real host — you book by the hour, and the price you see is
          the price you pay.
        </p>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-6">
            <span className="text-2xl" aria-hidden>🔍</span>
            <h3 className="mt-3 text-lg font-semibold text-foreground">1. Search pools near you</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter your city or zip and browse private pools, heated pools, and hot
              tubs — with photos, hourly rates, and guest limits on every listing.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6">
            <span className="text-2xl" aria-hidden>📅</span>
            <h3 className="mt-3 text-lg font-semibold text-foreground">2. Pick your hours and book</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Choose a date and time that works. The all-in total is shown before you
              pay, and the host approves every booking — no surprises on either side.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6">
            <span className="text-2xl" aria-hidden>🏊</span>
            <h3 className="mt-3 text-lg font-semibold text-foreground">3. Sign the waiver and swim</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Every booking includes a signed guest waiver, then the pool is all yours
              for your hours — birthday party, family swim, or a quiet float.
            </p>
          </div>
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <a
            href="/s"
            className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            Find a pool rental near you
          </a>
          <a href="/p/how-it-works" className="text-sm font-semibold text-primary hover:underline">
            How it works, in detail &rarr;
          </a>
          <a href="/p/hosting" className="text-sm font-semibold text-primary hover:underline">
            Got a pool? 0% host fees &rarr;
          </a>
        </div>
      </div>
    </section>
  );
}

function PoolTypeGrid() {
  return (
    <section className="bg-secondary/30">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Browse by pool type
        </h2>
        <p className="mt-2 text-muted-foreground">
          Heated pools, hot tubs, saltwater, fire pits, outdoor theaters — find your vibe.
        </p>
        <div className="-mx-4 mt-8 flex snap-x gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 md:grid-cols-4 lg:grid-cols-5">
          {POOL_TYPES.map((t) => (
            <a
              key={t.name}
              href={t.href}
              className="group relative aspect-[4/5] w-[150px] shrink-0 snap-start overflow-hidden rounded-2xl shadow-sm ring-1 ring-border transition-transform duration-200 hover:scale-[1.03] hover:shadow-lg sm:w-auto"
            >
              <img
                src={t.img}
                alt={t.name}
                width={640}
                height={800}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-3">
                <div className="text-sm font-semibold leading-tight text-white drop-shadow">
                  {t.name}
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

// --- Homepage inventory card: marketplace display price (all-in, cents kept) ---
function formatAllIn(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

function spaLabel(spa: { name: string; priceCents: number }): string {
  // Host-listed add-on amount, quoted as listed (not part of the hourly price).
  return spa.priceCents > 0 ? `Spa add-on +${formatAllIn(spa.priceCents)}` : "Spa included";
}

function FeaturedPoolCard({ listing }: { listing: CuratedListing }) {
  const place = [listing.city, listing.state].filter(Boolean).join(", ");
  const feature = listing.spa
    ? spaLabel(listing.spa)
    : listing.category === "indoorpools"
      ? "Indoor pool"
      : listing.category === "heatedpools"
        ? "Heated pool"
        : null;
  const meta = [place || null, listing.guests ? `Fits ${listing.guests}` : null, feature].filter(Boolean);
  return (
    <a
      href={`/l/${listing.slug}/${listing.id}`}
      className="group relative block w-[78vw] max-w-[320px] shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-card transition-all hover:shadow-lg sm:w-auto sm:max-w-none"
    >
      <div className="aspect-[4/3] overflow-hidden bg-muted">
        {listing.imageUrl ? (
          <img
            src={listing.imageUrl}
            alt={listing.title}
            width={800}
            height={533}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            No image
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="line-clamp-1 text-base font-semibold text-foreground">{listing.title}</h3>
        {meta.length > 0 && (
          <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{meta.join(" · ")}</p>
        )}
        <div className="mt-3 flex items-center justify-between gap-3">
          {listing.allInCents != null ? (
            <p className="text-sm font-semibold text-foreground">
              {listing.hasPriceVariants ? "from " : ""}
              {formatAllIn(listing.allInCents)}{" "}
              <span className="font-normal text-muted-foreground">/ hour, all-in</span>
            </p>
          ) : (
            <span />
          )}
          <span className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm transition-transform group-hover:scale-105">
            Book now →
          </span>
        </div>
      </div>
    </a>
  );
}
