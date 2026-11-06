import { useState } from "react";
import { Outlet, Link, createRootRoute, HeadContent, Scripts, useRouterState } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import appCss from "../styles.css?url";
import { SiteHeader, SiteFooter, GlobalChromeProvider, FooterDataProvider } from "@/components/site-layout";
import { HydrationDebug } from "@/components/hydration-debug";
import { AffiliateRefCapture } from "@/components/affiliate-ref-capture";

import { getSiteFooter } from "@/server/site-footer.functions";
import { getSharetribeAuthState } from "@/server/sharetribe-session.functions";
import {
  buildMeta,
  ldJsonScript,
  organizationJsonLd,
  websiteJsonLd,
  SITE_NAME,
} from "@/lib/seo";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-20">
        <div className="max-w-md text-center">
          <h1 className="text-7xl font-bold text-foreground">404</h1>
          <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <div className="mt-6">
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-glow"
            >
              Go home
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

export const Route = createRootRoute({
  loader: async () => {
    const [footerRes, authRes] = await Promise.allSettled([
      getSiteFooter(),
      getSharetribeAuthState(),
    ]);
    const footer = footerRes.status === "fulfilled" ? footerRes.value : null;
    const isAuthed =
      authRes.status === "fulfilled" ? !!authRes.value?.isAuthed : false;
    return { footer, isAuthed };
  },
  head: () => {
    const meta = buildMeta({
      title: "Pool Rental Near Me - Starting at $25 hour - Rent a pool now",
      description:
        "Rent a private pool by the hour or become a pool host.",
      path: "/",
      // Do NOT set og:image here. Root head() concatenates into every match,
      // so a root-level og:image would override every leaf route's share
      // preview. Each shareable route sets its own og:image via buildMeta().
      image: null,
    });
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { name: "author", content: SITE_NAME },
        { name: "theme-color", content: "#0ea5e9" },
        { name: "google-site-verification", content: "nDLvX6F18GNzJw-bLU6J4HjK3kfbuRIJENjW-6O5ZpU" },
        ...meta.meta,
      ],
      links: [
        { rel: "stylesheet", href: appCss },
        { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
        { rel: "icon", type: "image/png", sizes: "192x192", href: "/favicon-192.png" },
        { rel: "icon", type: "image/png", sizes: "512x512", href: "/favicon-512.png" },
        { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
        { rel: "mask-icon", href: "/icon.svg", color: "#0ea5e9" },
        // Do NOT spread meta.links here — it would emit a root-level
        // <link rel="canonical" href="/"> on every page, duplicating the
        // per-route canonical. Each shareable route emits its own canonical
        // via buildMeta() in its head().
        ...meta.links.filter((l) => l.rel !== "canonical"),
      ],
      scripts: [ldJsonScript(organizationJsonLd()), ldJsonScript(websiteJsonLd())],
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false } },
  }));
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const data = Route.useLoaderData();
  const isAdmin = pathname.startsWith("/admin");
  const footer = data?.footer;
  const isAuthed = !!data?.isAuthed;
  const content = (
    <>
      <HydrationDebug />
      <AffiliateRefCapture />
      <div className="flex min-h-screen flex-col">
        {!isAdmin && <SiteHeader isAuthed={isAuthed} />}
        <div className="flex flex-1 flex-col">
          <GlobalChromeProvider>
            <Outlet />
          </GlobalChromeProvider>
        </div>
        {!isAdmin && <SiteFooter />}
      </div>
    </>
  );
  const wrapped = footer ? (
    <FooterDataProvider value={footer}>{content}</FooterDataProvider>
  ) : content;
  return <QueryClientProvider client={queryClient}>{wrapped}</QueryClientProvider>;
}
