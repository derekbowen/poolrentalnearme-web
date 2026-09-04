// Homepage analytics — Phase 1.
//
// Rides the first-party beacon that ALREADY exists in production
// (/tools/cta.js, module "prnm-a"):
//
//     navigator.sendBeacon("/tools/cta-beacon?e=" + ev + "&f=" + fam)
//
// There is no Plausible, GA, PostHog or Segment anywhere in fresh-web, so this
// is the existing analytics architecture and the brief says not to add a
// second one. Same endpoint, same shape, new event names.

export type HomepageEvent =
  | 'homepage_search_started'
  | 'homepage_search_submitted'
  | 'homepage_search_to_pseo'
  | 'homepage_search_to_sharetribe'
  | 'homepage_listing_clicked'
  | 'homepage_indoor_clicked'
  | 'homepage_heated_clicked'
  | 'homepage_occasion_clicked'
  | 'homepage_host_cta_clicked'
  | 'homepage_market_clicked';

const ENDPOINT = '/tools/cta-beacon';
const FAMILY = 'home';

/** Fire-and-forget. Never throws, never blocks navigation, never retries. */
export function beacon(event: HomepageEvent, detail?: string): void {
  if (typeof navigator === 'undefined') return;
  try {
    const url =
      `${ENDPOINT}?e=${encodeURIComponent(event)}&f=${FAMILY}` +
      (detail ? `&d=${encodeURIComponent(detail.slice(0, 120))}` : '');
    if (navigator.sendBeacon) { navigator.sendBeacon(url); return; }
    void fetch(url, { method: 'POST', keepalive: true });
  } catch {
    /* analytics must never break a booking flow */
  }
}
