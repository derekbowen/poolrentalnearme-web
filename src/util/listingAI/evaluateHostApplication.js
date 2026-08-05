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

  // A non-OK response is NEVER an evaluation result. Rendering an error
  // payload as an approval screen tells the applicant they applied when
  // nothing was recorded — so anything but a real approval throws, and the
  // wizard shows the error banner with their answers intact for retry.
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || body.approved !== true) {
    const detail = body?.errors?.[0]?.message || body?.message || null;
    if (response.status === 401 || detail === 'Unauthorized') {
      throw new Error(
        'Please log in (or create your free account) and then tap Submit again — your answers are saved on this page.'
      );
    }
    throw new Error(
      `We couldn't process your application just now${detail ? ` (${detail})` : ''}. Nothing was lost — please tap Submit again.`
    );
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
