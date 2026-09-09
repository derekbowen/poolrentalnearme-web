import { createFileRoute } from "@tanstack/react-router";
import { buildMeta, ldJsonScript } from "@/lib/seo";
import {
  getHomeData,
  getWinterHomeData,
  type HomeData,
  type WinterHomeData,
} from "@/server/home-data.functions";
import { HomePageContent, HOMEPAGE_FAQS, HOMEPAGE_HERO_IMAGE } from "@/components/home-page";
import { WinterHomePage } from "@/components/home-page-winter";

const EMPTY_HOME_DATA: HomeData = {
  cities: [],
  cityCount: 0,
  categories: [],
  listings: [],
  nearby: { city: null, region: null, count: 0, nearestMiles: null },
  academyAvailable: [],
  academyHealth: {},
};

const EMPTY_WINTER_DATA: WinterHomeData = { featured: [], cityCards: [], cities: [] };

/**
 * `/?preview=winter` renders the Phase 1 winter homepage (2026-09-09 brief)
 * server-side, for Derek's review only. Production visitors at `/` get the
 * current page untouched. The preview render carries a noindex meta tag,
 * canonicalises to `/`, and getWinterHomeData sets Cache-Control: no-store +
 * X-Robots-Tag on the response so no cache can hand it out at `/`. Nothing on
 * the site links to the preview URL.
 */
type HomeSearch = { preview?: "winter" };

type HomeLoaderData =
  | { preview: "winter"; winter: WinterHomeData }
  | { preview?: undefined; home: HomeData };

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): HomeSearch =>
    search.preview === "winter" ? { preview: "winter" } : {},
  loaderDeps: ({ search }) => ({ preview: search.preview }),
  loader: async ({ deps }): Promise<HomeLoaderData> => {
    if (deps.preview === "winter") {
      try {
        return { preview: "winter", winter: (await getWinterHomeData()) ?? EMPTY_WINTER_DATA };
      } catch (err) {
        console.error("winter preview loader failed:", err);
        return { preview: "winter", winter: EMPTY_WINTER_DATA };
      }
    }
    try {
      return { home: (await getHomeData()) ?? EMPTY_HOME_DATA };
    } catch (err) {
      console.error("index loader failed:", err);
      return { home: EMPTY_HOME_DATA };
    }
  },
  head: ({ loaderData }) => {
    const isPreview = loaderData?.preview === "winter";
    const meta = buildMeta({
      title: "Pool Rental Near Me — Rent a Pool by the Hour | Private Pools Near You",
      description:
        "Rent a pool near you by the hour — private backyard pools, heated pools & hot tubs from real hosts. 0% host fees, hosts keep 100%. Book a private pool rental in minutes.",
      path: "/",
      // Indexability is controlled by the X-Robots-Tag HTTP header in src/start.ts
      // (preview hosts get noindex; production www.poolrentalnearme.com is indexable).
      // Do NOT add a noindex meta tag here for the production render — it would
      // deindex the homepage. The ONLY noindex below is scoped to ?preview=winter.
      image: HOMEPAGE_HERO_IMAGE,
    });
    // Organization + WebSite JSON-LD are emitted once in __root.tsx and
    // inherited by every route — do NOT re-emit Organization here or
    // Google Rich Results flags the page for duplicate structured data.
    const faqLd = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: HOMEPAGE_FAQS.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    };
    return {
      ...meta,
      meta: [
        ...(meta.meta ?? []),
        ...(isPreview ? [{ name: "robots", content: "noindex, nofollow" }] : []),
      ],
      links: [
        ...(meta.links ?? []),
        // Speed up navigation to the Sharetribe marketplace search page.
        { rel: "prefetch", href: "/s" },
        // Warm up the connection to the imgix CDN that serves listing photos
        // (hero image + every featured-listing thumbnail).
        { rel: "preconnect", href: "https://sharetribe.imgix.net", crossOrigin: "" },
      ],
      scripts: [ldJsonScript(faqLd)],
    };
  },
  component: HomePage,
});

function HomePage() {
  const data = Route.useLoaderData();
  if (data?.preview === "winter") return <WinterHomePage data={data.winter} />;
  return <HomePageContent data={data?.home} />;
}
