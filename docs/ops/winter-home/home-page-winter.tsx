import { useEffect, useRef, useState, type FormEvent } from "react";
import { SiteHeader, SiteFooter } from "@/components/site-layout";
import { ErrorBoundary } from "@/components/error-boundary";
import { LiteYouTube } from "@/components/lite-youtube";
import { FredMascot } from "@/components/fred-mascot";
import { HOMEPAGE_FAQS } from "@/components/home-page";
import type { HomeCity, WinterHomeData, WinterCityCard, WinterListing } from "@/server/home-data.functions";
import {
  ACADEMY_CLASS_COUNT,
  BROWSE_CHIPS,
  HERO_CHIPS,
  HERO_FROM_PRICE,
  KATY_VIDEO_ID,
  SEARCH_URLS,
  SWITCH_FROM_SWIMPLY_URL,
  WINTER_FEATURED_COUNT,
} from "@/config/winter-home";
import heroDesktop from "@/assets/paradise-hero.webp";
import heroMobile from "@/assets/paradise-hero-mobile.webp";

/**
 * Winter homepage (Phase 1 of the 2026-09-09 brief). Reached only via
 * /?preview=winter until Derek says go. Renter-first: hero + search, trust
 * strip, six featured heated/indoor pools, one browse row, how it works,
 * ONE host band, FAQ + Text Derek, six city cards + collapsed full city list.
 *
 * Content rules: every number here is either from the live listing record,
 * from config (HERO_FROM_PRICE, reviewed monthly) or copy that already exists
 * on the site. No new claims.
 */
export function WinterHomePage({ data }: { data: WinterHomeData | null | undefined }) {
  const safe: WinterHomeData = data ?? { featured: [], cityCards: [], cities: [] };
  const featured = safe.featured.slice(0, WINTER_FEATURED_COUNT);
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <ErrorBoundary name="WinterHero" silent>
          <WinterHero />
        </ErrorBoundary>
        <TrustStrip />
        <ErrorBoundary name="WinterFeatured" silent>
          <FeaturedWinterPools listings={featured} />
        </ErrorBoundary>
        <BrowseRow />
        <HowItWorks />
        {/* Reviews (renter-facing) intentionally absent until Derek supplies 2–3 quotes. */}
        <HostBand />
        <FaqAndTextDerek />
        <ErrorBoundary name="WinterCities" silent>
          <CitiesSection cards={safe.cityCards} cities={safe.cities} />
        </ErrorBoundary>
      </main>
      <SiteFooter />
    </div>
  );
}

/* ────────────────────────────── Hero ────────────────────────────── */

function WinterHero() {
  return (
    <section aria-label="Swim all winter" className="relative overflow-hidden">
      <picture>
        <source media="(max-width: 767px)" srcSet={heroMobile} type="image/webp" />
        <img
          src={heroDesktop}
          alt=""
          width={1024}
          height={768}
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      </picture>
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: "linear-gradient(to top, rgba(11,39,51,0.86) 0%, rgba(11,39,51,0.55) 55%, rgba(11,39,51,0.15) 100%)" }}
      />
      <div className="relative mx-auto flex max-w-3xl flex-col items-center px-4 pb-8 pt-10 text-center text-white sm:pb-12 sm:pt-16">
        <h1 className="text-4xl font-extrabold leading-tight tracking-tight drop-shadow-md sm:text-5xl lg:text-6xl">
          Swim all winter.
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-base font-semibold text-white/95 drop-shadow sm:text-lg">
          Private heated and indoor pools, by the hour, from ${HERO_FROM_PRICE}. The price you see is the price you pay.
        </p>
        <HeroSearch />
        <ul className="mt-4 flex flex-wrap items-center justify-center gap-2" aria-label="Quick filters">
          {HERO_CHIPS.map((c) => (
            <li key={c.label}>
              <a
                href={c.href}
                className="inline-flex min-h-11 items-center rounded-full border border-white/70 bg-white/10 px-4 text-sm font-semibold text-white backdrop-blur-[2px] transition-colors hover:bg-white hover:text-[#0B4A6F]"
              >
                {c.label}
              </a>
            </li>
          ))}
        </ul>
        <a
          href="#host"
          className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-white/90 underline-offset-4 hover:underline"
        >
          Have a pool? Keep 100% &rarr;
        </a>
      </div>
    </section>
  );
}

type Prediction = { id: string; place_name: string; bbox?: number[]; center?: number[] };

/** Where · Guests → /s with the params the search page honors (address+bounds, pub_guestallowed). */
function HeroSearch() {
  const [where, setWhere] = useState("");
  const [bounds, setBounds] = useState("");
  const [guests, setGuests] = useState("");
  const [preds, setPreds] = useState<Prediction[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);

  const suggest = async (q: string): Promise<Prediction[]> => {
    try {
      const r = await fetch(`/api/geocode-suggest?q=${encodeURIComponent(q)}`, { headers: { Accept: "application/json" } });
      if (!r.ok) return [];
      const j = (await r.json()) as { predictions?: Prediction[] };
      return (j.predictions ?? []).filter((p) => Array.isArray(p.bbox) && p.bbox.length === 4).slice(0, 5);
    } catch {
      return [];
    }
  };

  const onWhere = (v: string) => {
    setWhere(v);
    setBounds("");
    if (timer.current) window.clearTimeout(timer.current);
    if (v.trim().length < 2) {
      setPreds([]);
      return;
    }
    timer.current = window.setTimeout(async () => {
      const list = await suggest(v.trim());
      setPreds(list);
      setOpen(list.length > 0);
    }, 250);
  };

  const boundsOf = (p: Prediction) => {
    const b = p.bbox as number[]; // [minLng, minLat, maxLng, maxLat]
    return `${b[3]},${b[2]},${b[1]},${b[0]}`; // neLat,neLng,swLat,swLng
  };

  const pick = (p: Prediction) => {
    setWhere(p.place_name);
    setBounds(boundsOf(p));
    setPreds([]);
    setOpen(false);
  };

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const params = new URLSearchParams();
    const q = where.trim();
    let b = bounds;
    if (q && !b) {
      // Typed but never picked a suggestion: resolve the first match so the
      // search page gets real bounds instead of an address it cannot geocode.
      const list = await suggest(q);
      if (list[0]) b = boundsOf(list[0]);
    }
    if (q) params.set("address", q);
    if (b) params.set("bounds", b);
    const g = parseInt(guests, 10);
    if (Number.isFinite(g) && g > 0) params.set("pub_guestallowed", `${g},`);
    const qs = params.toString();
    window.location.assign(qs ? `/s?${qs}` : "/s");
  };

  return (
    <form
      action="/s"
      method="get"
      onSubmit={submit}
      className="mt-6 w-full max-w-2xl rounded-3xl bg-white p-2 text-left shadow-xl"
      role="search"
      aria-label="Find a pool"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <div ref={wrapRef} className="relative flex-[1.6]">
          <label htmlFor="winter-where" className="sr-only">Where</label>
          <input
            id="winter-where"
            name="address"
            type="text"
            inputMode="text"
            autoComplete="off"
            value={where}
            onChange={(e) => onWhere(e.target.value)}
            onFocus={() => preds.length > 0 && setOpen(true)}
            placeholder="City or ZIP"
            className="h-14 w-full rounded-2xl border border-border bg-background px-4 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {open && preds.length > 0 && (
            <ul
              role="listbox"
              className="absolute inset-x-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-2xl border border-border bg-background shadow-xl"
            >
              {preds.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(p)}
                    className="flex min-h-11 w-full items-center px-4 text-left text-[15px] text-foreground hover:bg-secondary"
                  >
                    {p.place_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input type="hidden" name="bounds" value={bounds} />
        </div>
        <div className="flex-1">
          <label htmlFor="winter-guests" className="sr-only">Guests</label>
          <input
            id="winter-guests"
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            value={guests}
            onChange={(e) => setGuests(e.target.value)}
            placeholder="Guests"
            className="h-14 w-full rounded-2xl border border-border bg-background px-4 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-14 items-center justify-center rounded-2xl px-7 text-base font-semibold text-white shadow-lg transition-transform hover:scale-[1.02] disabled:opacity-70"
          style={{ backgroundColor: "#0EA5E9" }}
        >
          Find pools
        </button>
      </div>
    </form>
  );
}

/* ─────────────────────────── Trust strip ────────────────────────── */

function TrustStrip() {
  const items = [
    "All-in hourly pricing — no fees at checkout",
    "Real humans, 24/7",
    // Third slot: the booking process pre-authorizes on request and captures on
    // host accept, but instant-book listings accept automatically. Wording is
    // Derek's call — visible placeholder until he decides (brief §2).
    "[Third trust line — pending Derek]",
  ];
  return (
    <section aria-label="Why book here" className="border-b border-border bg-secondary/30">
      <ul className="mx-auto grid max-w-5xl grid-cols-1 gap-x-8 gap-y-2 px-4 py-4 text-center text-sm font-semibold text-foreground sm:grid-cols-3 sm:py-5">
        {items.map((t) => (
          <li key={t} className="min-h-6">{t}</li>
        ))}
      </ul>
    </section>
  );
}

/* ───────────────────────── Featured pools ───────────────────────── */

function formatAllIn(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

function WinterPoolCard({ listing }: { listing: WinterListing }) {
  const place = [listing.city, listing.state].filter(Boolean).join(", ");
  const hasReviews = typeof listing.reviewCount === "number" && listing.reviewCount > 0 && typeof listing.rating === "number";
  return (
    <a
      href={`/l/${listing.slug}/${listing.id}`}
      className="group relative block w-[82vw] max-w-[340px] shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-card transition-all hover:shadow-lg md:w-auto md:max-w-none"
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
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">No photo yet</div>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-1 text-base font-semibold text-foreground">{listing.title}</h3>
          {hasReviews && (
            <span className="shrink-0 text-sm font-semibold text-foreground" aria-label={`Rated ${listing.rating} out of 5 from ${listing.reviewCount} reviews`}>
              ★ {Number(listing.rating).toFixed(1)}
              <span className="font-normal text-muted-foreground"> ({listing.reviewCount})</span>
            </span>
          )}
        </div>
        <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
          {[place || null, listing.guests ? `Fits ${listing.guests}` : null].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-3 flex items-center justify-between gap-3">
          {listing.allInCents != null ? (
            <p className="text-sm font-semibold text-foreground">
              from {formatAllIn(listing.allInCents)}
              <span className="font-normal text-muted-foreground">/hr all-in</span>
            </p>
          ) : (
            <span />
          )}
          <span className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-transform group-hover:scale-105">
            Book now →
          </span>
        </div>
      </div>
    </a>
  );
}

function NearMeButton() {
  const [state, setState] = useState<"idle" | "locating" | "denied" | "unsupported">("idle");
  const go = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState("unsupported");
      return;
    }
    setState("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        // ~50 km box; the search page needs bounds, not a point.
        const dLat = 0.45;
        const dLng = 0.45 / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
        const bounds = `${(lat + dLat).toFixed(5)},${(lng + dLng).toFixed(5)},${(lat - dLat).toFixed(5)},${(lng - dLng).toFixed(5)}`;
        window.location.assign(`/s?bounds=${encodeURIComponent(bounds)}&origin=${lat.toFixed(5)},${lng.toFixed(5)}`);
      },
      () => setState("denied"),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={go}
        disabled={state === "locating"}
        className="inline-flex min-h-12 items-center justify-center rounded-full border border-border bg-background px-6 text-base font-semibold text-foreground transition-colors hover:bg-secondary disabled:opacity-70"
      >
        {state === "locating" ? "Finding pools near you…" : "📍 Pools near me"}
      </button>
      {state === "denied" && (
        <p className="text-sm text-muted-foreground">Location is off. Type your city above instead.</p>
      )}
      {state === "unsupported" && (
        <p className="text-sm text-muted-foreground">This browser can't share your location. Type your city above instead.</p>
      )}
    </div>
  );
}

function FeaturedWinterPools({ listings }: { listings: WinterListing[] }) {
  return (
    <section aria-label="Heated and indoor pools" className="bg-background">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Heated &amp; indoor pools, open all winter.
        </h2>
        <p className="mt-2 text-muted-foreground">Prices are per hour with every fee included.</p>
        {listings.length > 0 ? (
          <div className="-mx-4 mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 md:mx-0 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:px-0 md:pb-0">
            {listings.map((l) => (
              <ErrorBoundary key={l.id} name={`WinterPoolCard:${l.id}`} fallback={null}>
                <WinterPoolCard listing={l} />
              </ErrorBoundary>
            ))}
          </div>
        ) : (
          <p className="mt-6 text-muted-foreground">Pools are loading slowly right now — browse everything on the search page.</p>
        )}
        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-5">
          <NearMeButton />
          <a href={SEARCH_URLS.all} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">
            See all pools &rarr;
          </a>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────── Browse row ───────────────────────── */

function BrowseRow() {
  return (
    <section aria-label="Browse pools" className="border-y border-border bg-secondary/20">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <h2 className="text-lg font-bold tracking-tight text-foreground">Browse by what you're planning</h2>
        <ul className="-mx-4 mt-3 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {BROWSE_CHIPS.map((c) => (
            <li key={c.label} className="shrink-0 snap-start">
              <a
                href={c.href}
                className="inline-flex min-h-11 items-center rounded-full border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary"
              >
                {c.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ───────────────────────────── How it works ─────────────────────── */

function HowItWorks() {
  // Existing homepage copy, each step cut to one sentence.
  const steps = [
    { icon: "🔍", title: "Search pools near you", text: "Enter your city or ZIP and browse private pools with photos, hourly rates, and guest limits." },
    { icon: "📅", title: "Pick your hours and book", text: "Choose a date and time; the all-in total is shown before you pay." },
    { icon: "🏊", title: "Sign the waiver and swim", text: "Every booking includes a signed guest waiver, then the pool is all yours for your hours." },
  ];
  return (
    <section aria-label="How it works" className="bg-background">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">How it works</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3 sm:gap-6">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-2xl border border-border bg-card p-5">
              <span className="text-2xl" aria-hidden>{s.icon}</span>
              <h3 className="mt-2 text-base font-semibold text-foreground">{i + 1}. {s.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ───────────────────────────── Host band ────────────────────────── */

function HostBand() {
  return (
    <section
      id="host"
      aria-label="For pool hosts"
      className="relative overflow-hidden text-white"
      style={{ background: "linear-gradient(135deg, #0B4A6F 0%, #0EA5E9 62%, #38BDF8 100%)" }}
    >
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid items-start gap-8 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-7">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/85 sm:text-sm">For hosts</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">0% host fees. Forever.</h2>
            <p className="mt-3 max-w-xl text-lg font-semibold text-white/95">
              Heated or indoor pool? Winter guests have nowhere else to go.
            </p>
            <p className="mt-4 max-w-xl text-sm font-medium text-white/90 sm:text-base">
              Swimply&rsquo;s 15% host fee leaves you $850 on a $1,000 month. Ours is 0%. You keep $1,000.
            </p>
            <div className="mt-6 flex items-center gap-4 rounded-2xl bg-white/10 p-4 ring-1 ring-white/20">
              <FredMascot variant="full" className="h-16 w-16 shrink-0 drop-shadow-lg sm:h-20 sm:w-20" />
              <p className="text-sm text-white/95 sm:text-base">
                <a href="/p/learningacademy" className="font-semibold underline underline-offset-4">
                  Learn with Fred — {ACADEMY_CLASS_COUNT} free classes
                </a>
                <span className="block text-white/80">
                  Already on Swimply?{" "}
                  <a href={SWITCH_FROM_SWIMPLY_URL} className="underline underline-offset-4">Read the switching guide &rarr;</a>
                </span>
              </p>
            </div>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                ["“I love you guys over at Pool Rental Near Me — the founder and co-founder personally called me to make sure I’m all right.”", "Demarco", "Queens, NY"],
                ["“Rock on, Derek. I see your hustle this year and it’s legit.”", "Salty Without The Sharks", "CA"],
              ].map(([q, who, where]) => (
                <li key={who} className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/20">
                  <p className="text-sm font-medium leading-relaxed text-white">{q}</p>
                  <p className="mt-2 text-xs font-semibold text-white/85">{who} · {where}</p>
                </li>
              ))}
            </ul>
            <div className="mt-7">
              <a
                href="/wizard/"
                aria-label="List your pool — keep 100%, zero host fees"
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-white px-8 text-base font-bold text-[#0B4A6F] shadow-xl transition-transform hover:scale-[1.03]"
              >
                List your pool
              </a>
            </div>
          </div>
          <div className="lg:col-span-5">
            <LiteYouTube videoId={KATY_VIDEO_ID} title="Tour Katy's Staycation Saltwater Getaway" />
            <p className="mt-2 text-sm text-white/85">Katy&rsquo;s pool — one of our hosts. Tap to play.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── FAQ + Text Derek ───────────────────── */

function FaqAndTextDerek() {
  return (
    <section aria-label="Questions" className="bg-background">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Questions? <span className="text-primary">We've thought of everything.</span>
            </h2>
            <div className="mt-6 space-y-3">
              {HOMEPAGE_FAQS.map((f, i) => (
                <details key={i} className="group rounded-2xl border border-border bg-card p-5 open:shadow-md">
                  <summary className="flex min-h-6 cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-foreground">
                    {f.q}
                    <span className="text-muted-foreground transition-transform group-open:rotate-45" aria-hidden>+</span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
          <div className="lg:col-span-5">
            <div className="rounded-3xl p-7 text-center lg:sticky lg:top-8" style={{ backgroundColor: "#ffb8d9", border: "3px dashed #ffd21f" }}>
              <div className="text-2xl" aria-hidden>👋</div>
              <h3 className="mt-1 text-xl font-extrabold" style={{ color: "#22303c" }}>Stuck on anything? Text Derek.</h3>
              <p className="mx-auto mt-1 max-w-md text-sm font-medium" style={{ color: "#46323c" }}>
                He founded Pool Rental Near Me and answers hosts himself, usually within the hour.
              </p>
              <a
                href={"sms:+18556178207?&body=" + encodeURIComponent("Hi Derek! I’m looking at Pool Rental Near Me and I have a question.")}
                className="mt-4 inline-flex min-h-12 w-full max-w-md items-center justify-center rounded-full bg-white px-6 text-[15px] font-extrabold"
                style={{ color: "#0EA5E9" }}
              >
                Text Derek
              </a>
              <p className="mt-4 text-sm font-medium" style={{ color: "#46323c" }}>
                Planning a 30-person reunion or a film shoot?{" "}
                <a href="mailto:hello@poolrentalnearme.com" className="font-bold underline underline-offset-2">Email the concierge</a>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────── Cities ─────────────────────────── */

function CityCard({ card }: { card: WinterCityCard }) {
  const href = `/s?address=${encodeURIComponent(`${card.name}, ${card.state}`)}&bounds=${encodeURIComponent(card.bounds)}`;
  return (
    <a href={href} className="group relative block overflow-hidden rounded-2xl border border-border bg-card transition-all hover:shadow-lg">
      <div className="aspect-[4/3] overflow-hidden bg-muted">
        {card.imageUrl ? (
          <img
            src={card.imageUrl}
            alt={`A pool for rent in ${card.name}, ${card.state}`}
            width={800}
            height={533}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-sky-400 to-emerald-500 text-lg font-semibold text-white">
            {card.name}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 p-4">
        <h3 className="text-base font-semibold text-foreground">
          {card.name}, {card.state}
        </h3>
        {card.count > 0 && (
          <span className="text-sm text-muted-foreground">{card.count} {card.count === 1 ? "pool" : "pools"}</span>
        )}
      </div>
    </a>
  );
}

function CitiesSection({ cards, cities }: { cards: WinterCityCard[]; cities: HomeCity[] }) {
  return (
    <section aria-label="Pool rentals by city" className="border-t border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Pool rentals by city</h2>
        {cards.length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 lg:gap-6">
            {cards.map((c) => (
              <CityCard key={c.slug} card={c} />
            ))}
          </div>
        )}
        {cities.length > 0 && (
          <details className="mt-8 rounded-2xl border border-border bg-card p-5">
            <summary className="flex min-h-6 cursor-pointer list-none items-center justify-between text-base font-semibold text-foreground">
              All cities
              <span className="text-muted-foreground" aria-hidden>+</span>
            </summary>
            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {cities.map((c) => (
                <a
                  key={c.slug}
                  href={`/p/${c.slug}`}
                  className="flex min-h-9 items-center text-sm text-muted-foreground transition-colors hover:text-primary hover:underline"
                >
                  {c.name}, {c.state_code}
                </a>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2">
              <a href="/p/pool-rentals" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">
                Browse all states &rarr;
              </a>
              <a href="/p/all-locations" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">
                Pool rentals near me &rarr;
              </a>
            </div>
          </details>
        )}
      </div>
    </section>
  );
}
