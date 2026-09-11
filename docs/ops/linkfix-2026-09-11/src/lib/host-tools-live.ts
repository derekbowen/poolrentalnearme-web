/**
 * Verified registry of host tools that actually resolve to a published canonical
 * page. This is the single source of truth for the /p/pool-host-tools hub.
 *
 * WHY THIS FILE EXISTS
 * The hub previously listed 57 tools under a /host-tools/$slug prefix. The routes
 * `src/routes/host-tools.$slug.tsx` and `src/routes/host-tools.index.tsx` were
 * deleted (git 8eac8996), so every one of those 57 links had been returning 404.
 * `src/lib/host-tools-registry.ts` still describes those 56 removed tools and is
 * imported by nothing — it is historical metadata, NOT a list of live pages.
 *
 * RULE: a tool may only appear on the hub if it is listed here, and every `path`
 * here must return a canonical 200. `npm run check:tools-hub` enforces both.
 */

export interface LiveTool {
  /** Canonical path. Must be a published route or content_pages slug. */
  path: string;
  title: string;
  summary: string;
  category: "Calculator" | "Generator" | "Guide";
  /**
   * Old /host-tools/* slugs this tool genuinely replaces. Recorded for link
   * archaeology only — we do NOT emit redirects for these. See the note in
   * docs/ops about why the dead URLs are left as honest 404s.
   */
  supersedes?: string[];
}

export const LIVE_TOOLS: LiveTool[] = [
  {
    path: "/p/earnings-calculator",
    title: "Pool Rental Earnings Calculator",
    summary: "Estimate what your pool can earn by the hour, with amenities and location factored in.",
    category: "Calculator",
    supersedes: ["pool-rental-earnings-calculator", "pool-earnings"],
  },
  {
    path: "/p/pool-heating-cost-calculator",
    title: "Pool Heating Cost Calculator",
    summary: "What it costs to heat your pool, by heater type and target temperature.",
    category: "Calculator",
    supersedes: ["pool-heating-cost", "pool-heating-time-calculator"],
  },
  {
    path: "/p/waiver-generator",
    title: "Pool Liability Waiver Generator",
    summary: "Generate a printable liability waiver for guests before they swim.",
    category: "Generator",
    supersedes: ["pool-liability-waiver", "pool-guest-agreement"],
  },
  {
    path: "/p/pool-rules-generator",
    title: "Pool Rules Generator",
    summary: "Create a printable pool rules sign for your gate, deck, or listing.",
    category: "Generator",
    supersedes: ["pool-rules"],
  },
  {
    path: "/p/qr-code-generator",
    title: "Pool Listing QR Code Generator",
    summary: "Make a QR code that sends guests straight to your listing, WiFi, or rules.",
    category: "Generator",
    supersedes: ["pool-wifi-qr"],
  },
  {
    path: "/p/hoa-pool-rental-defense-kit",
    title: "HOA Pool Rental Defense Kit",
    summary: "Templates and citations for the conversation with your HOA or city.",
    category: "Guide",
    supersedes: ["hoa-pool-rental-defense-kit"],
  },
];

/** Paths only — used by the hub renderer and the validation script. */
export const LIVE_TOOL_PATHS: string[] = LIVE_TOOLS.map((t) => t.path);

/** URL prefix that no longer exists. Nothing may link to it. */
export const DEAD_TOOL_PREFIX = "/host-tools/";
