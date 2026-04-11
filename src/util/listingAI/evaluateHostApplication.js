/**
 * Host Application Evaluator — Client Helper
 *
 * Calls the server endpoint that runs the AI scorecard and returns a
 * tiered Polish Plan. The contract is:
 *
 *   - approved is ALWAYS true. Every applicant is welcomed onto the platform.
 *   - tier places them on a ladder: starter → verified → top-tier.
 *   - polishPlan is a ranked list of concrete fixes that unlock the next tier.
 *   - listingVisibility tells the caller whether to mark the listing as
 *     "provisional" (safety items outstanding) or "standard".
 *
 * The door never closes. The host always has agency.
 */

export const evaluateHostApplication = async ({
  imageUrls,
  poolName,
  hostName,
  city,
  state,
  questionnaire,
}) => {
  const response = await fetch('/api/evaluate-host-application', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      imageUrls,
      poolName,
      hostName,
      city,
      state,
      questionnaire,
    }),
  });

  // Even on a non-200 we try to parse the body; the server is designed to
  // always return an approval payload. If parsing fails we throw so the UI
  // can show a retry affordance — but this should effectively never happen.
  const body = await response.json().catch(() => null);
  if (!body) {
    throw new Error('Could not reach host evaluation service. Please retry.');
  }
  return body;
};

/**
 * Visual helpers — centralize tier → copy/color mapping so the wizard,
 * status page, and admin dashboard all speak the same language.
 */
export const TIER_META = {
  'top-tier': {
    label: 'Top-Tier Host',
    tagline: 'Featured placement + premium price recommendation',
    accent: '#d4af37', // gold
    badgeEmoji: '⭐',
  },
  verified: {
    label: 'Verified Host',
    tagline: 'Standard placement + market-rate pricing',
    accent: '#3ba776', // emerald
    badgeEmoji: '✓',
  },
  starter: {
    label: 'New Host',
    tagline: 'Standard placement + intro pricing',
    accent: '#5b9dd9', // soft blue
    badgeEmoji: '◆',
  },
  'starter-provisional': {
    label: 'New Host — Finishing Setup',
    tagline: 'A few safety touches unlock full visibility',
    accent: '#c98a3c', // warm amber
    badgeEmoji: '◷',
  },
};

export const getTierMeta = tier => TIER_META[tier] || TIER_META.starter;
