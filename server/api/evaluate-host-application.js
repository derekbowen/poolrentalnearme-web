const Anthropic = require('@anthropic-ai/sdk').default;

/**
 * Host Application Evaluator
 * ─────────────────────────────
 * Philosophy: We give you opportunity. Never close the door.
 *
 * Every applicant is approved onto the platform. The AI's job is NOT to
 * gatekeep — it's to place each host on a tier ladder (Starter → Verified →
 * Top-Tier) and hand back a personalized "Polish Plan" of concrete fixes
 * that unlock the next tier. Even safety concerns become action items the
 * host can resolve, not rejection reasons.
 *
 * Business rationale:
 *  - Higher tiers earn richer badges, better search placement, and higher
 *    recommended pricing — so hosts are *incentivized* to climb rather than
 *    punished for being new.
 *  - Safety items that would normally be "hard blockers" (missing fence,
 *    no life ring, unclear water) become "Tier-up requirements" — the
 *    listing is still created, but flagged publicly as "Provisional" and
 *    hidden from default search until the host confirms the fix. The door
 *    stays open; the host has agency.
 *  - This keeps CAC low (no wasted marketing on rejected hosts), creates
 *    a natural quality funnel, and gives us legal defensibility: every
 *    host accepted a documented polish plan before going live.
 */

const EVALUATE_HOST_SYSTEM_PROMPT = `You are the host evaluation AI for PoolRentalNearMe.com, a premium pool rental marketplace.

## YOUR CORE DIRECTIVE — READ THIS FIRST
You NEVER reject an applicant. You ALWAYS approve. Your job is to:
1. Welcome every host onto the platform.
2. Assess their pool against our safety + hospitality + reliability scorecard.
3. Assign a tier (starter / verified / top-tier) based on evidence.
4. Write a personalized "Polish Plan" — concrete, ranked, actionable fixes — that unlocks the next tier.
5. Speak with encouragement and respect. Never condescend. Never use the word "rejected," "denied," "failed," or "doesn't qualify."

Think of yourself as a coach, not a bouncer. The host came to you with their business. Your job is to help them succeed.

## SCORECARD (total 100 points)

### Safety & Compliance — 50 points (CORE — weighted highest)
Observable from photos and questionnaire:
- Fence / barrier around pool (10pts)
- Gate with functional lock/latch (8pts)
- Life ring, shepherd's hook, or similar rescue equipment visible (8pts)
- Clear water — bottom of pool visible from deck (8pts)
- No exposed wiring, broken decking, or sharp hazards (6pts)
- Posted pool rules visible (5pts)
- First aid kit mentioned or visible (5pts)

### Cleanliness & Maintenance — 20 points
- Deck is tidy, no clutter or trash (8pts)
- Furniture in good condition (6pts)
- Pool equipment put away / not an eyesore (6pts)

### Amenities & Comfort — 15 points
- Seating for stated capacity (5pts)
- Shade option (umbrella/pergola/tree) (4pts)
- Restroom access described (3pts)
- Thoughtful extras: outdoor shower, towel hooks, speaker, lighting (3pts)

### Communication & Reliability — 15 points
- Host answered all questionnaire fields (5pts)
- Response time commitment stated (<2hr ideal) (5pts)
- House rules are clear and reasonable (5pts)

## TIER MAPPING
- 90-100: **top-tier** — "Verified Top-Tier Host" badge, top search placement, +15% price recommendation
- 70-89: **verified** — "Verified Host" badge, standard search placement, standard price
- 50-69: **starter** — "New Host" badge, standard search placement, -5% intro price recommendation
- Below 50: **starter-provisional** — still approved, but listing marked "Provisional — finishing setup" until safety items are confirmed. The host has a clear path to unlock.

## POLISH PLAN RULES
- Maximum 6 items. Rank by (impact × effort-inverse).
- Each item = one sentence action + why it matters (one sentence).
- Use "you" voice. Be warm. Be specific.
- Never say "missing" — say "adding X would unlock the Verified tier."
- If safety items are absent, flag them as "priority" but still frame as opportunity.
- If the host is already top-tier, the polish plan is a "Maintain Excellence" checklist (3 items max) of things to keep doing.

## TONE EXAMPLES

BAD: "Your pool is missing a fence which is required for approval."
GOOD: "Add (or photograph) the fence line around the pool deck — this is the biggest single unlock for the Verified tier and gives guests the confidence to book immediately."

BAD: "Water clarity is insufficient."
GOOD: "Re-shoot the main hero photo after a chemical service — clear, sparkling water is the #1 signal guests look for. A single afternoon of cleaning can move you from Starter to Verified."

BAD: "Questionnaire incomplete."
GOOD: "Add a short 'What guests love most' line in your welcome blurb — even one sentence doubles message response quality."

## OUTPUT FORMAT
Return ONLY valid JSON (no markdown, no code fences) with this exact structure:
{
  "approved": true,
  "tier": "starter" | "starter-provisional" | "verified" | "top-tier",
  "scores": {
    "safety": number,
    "cleanliness": number,
    "amenities": number,
    "communication": number,
    "total": number
  },
  "welcomeMessage": "1-2 warm sentences acknowledging the host and their pool by name",
  "polishPlan": [
    {
      "priority": "high" | "medium" | "low",
      "category": "safety" | "cleanliness" | "amenities" | "communication",
      "action": "One sentence concrete action in 'you' voice",
      "why": "One sentence explaining the impact"
    }
  ],
  "tierUnlockMessage": "1 sentence describing exactly what moves them to the next tier",
  "nextTier": "verified" | "top-tier" | null,
  "estimatedEffort": "minutes" | "hours" | "afternoon" | "weekend",
  "listingVisibility": "standard" | "provisional",
  "priceRecommendationMultiplier": number
}

"approved" is ALWAYS true. No exceptions.`;

module.exports = async (req, res) => {
  try {
    const {
      imageUrls = [],
      poolName,
      hostName,
      city,
      state,
      questionnaire = {},
    } = req.body || {};

    if (!imageUrls.length) {
      return res.status(400).json({ message: 'At least one pool photo is required.' });
    }
    if (!poolName || !city) {
      return res.status(400).json({ message: 'Pool name and city are required.' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY not set');
      // Graceful fallback — still approve, still give a generic polish plan.
      // The door never closes, even if our AI is temporarily down.
      return res.status(200).json(buildFallbackEvaluation({ poolName, hostName, city }));
    }

    const client = new Anthropic({ apiKey });

    const content = [];
    for (const url of imageUrls.slice(0, 8)) {
      content.push({ type: 'image', source: { type: 'url', url } });
    }

    content.push({
      type: 'text',
      text: `Evaluate this host application for PoolRentalNearMe.com.

Host: ${hostName || 'New host'}
Pool: ${poolName}
Location: ${city}${state ? ', ' + state : ''}

Questionnaire answers:
${JSON.stringify(questionnaire, null, 2)}

Remember: you ALWAYS approve. Your job is to place them on the tier ladder and hand back a warm, specific Polish Plan that unlocks the next tier. Be their coach, not a gatekeeper. Address them by name in the welcome message.`,
    });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: EVALUATE_HOST_SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock) {
      return res.status(200).json(buildFallbackEvaluation({ poolName, hostName, city }));
    }

    let evaluation;
    try {
      const jsonText = textBlock.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      evaluation = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('Failed to parse host eval JSON:', textBlock.text);
      return res.status(200).json(buildFallbackEvaluation({ poolName, hostName, city }));
    }

    // Enforce the prime directive server-side no matter what the model returned.
    // The door NEVER closes. Ever.
    evaluation.approved = true;

    // Sanity-clamp the tier.
    const validTiers = ['starter', 'starter-provisional', 'verified', 'top-tier'];
    if (!validTiers.includes(evaluation.tier)) {
      evaluation.tier = 'starter';
    }

    // Ensure a price multiplier exists and is within safe bounds.
    const multiplier = Number(evaluation.priceRecommendationMultiplier);
    if (!Number.isFinite(multiplier) || multiplier < 0.85 || multiplier > 1.25) {
      evaluation.priceRecommendationMultiplier = defaultMultiplierForTier(evaluation.tier);
    }

    evaluation.evaluatedAt = new Date().toISOString();

    res.status(200).json(evaluation);
  } catch (error) {
    console.error('Evaluate host application error:', error);
    // Even on total failure, approve. Door stays open.
    res.status(200).json(
      buildFallbackEvaluation({
        poolName: req.body?.poolName,
        hostName: req.body?.hostName,
        city: req.body?.city,
      })
    );
  }
};

const defaultMultiplierForTier = (tier) => {
  switch (tier) {
    case 'top-tier': return 1.15;
    case 'verified': return 1.0;
    case 'starter': return 0.95;
    case 'starter-provisional': return 0.9;
    default: return 1.0;
  }
};

/**
 * Fallback evaluation used when the AI is unavailable or returns garbage.
 * Still approves. Still welcoming. Still gives a useful polish plan.
 */
const buildFallbackEvaluation = ({ poolName, hostName, city }) => ({
  approved: true,
  tier: 'starter',
  scores: {
    safety: 30,
    cleanliness: 12,
    amenities: 9,
    communication: 9,
    total: 60,
  },
  welcomeMessage: `Welcome aboard${hostName ? ', ' + hostName : ''} — ${poolName || 'your pool'} is officially on PoolRentalNearMe${city ? ' in ' + city : ''}. Let's get you set up for your first bookings.`,
  polishPlan: [
    {
      priority: 'high',
      category: 'safety',
      action: 'Upload a photo clearly showing the pool fence line and gate latch.',
      why: 'Safety photos are the #1 trust signal — guests book 3x faster when they see a secured perimeter.',
    },
    {
      priority: 'high',
      category: 'cleanliness',
      action: 'Re-shoot your hero photo on a sunny day right after a chemical service.',
      why: 'Crystal-clear water in the first image is the single biggest driver of click-through.',
    },
    {
      priority: 'medium',
      category: 'amenities',
      action: 'List your seating count and shade options in the amenities checklist.',
      why: 'Guests searching for events filter on capacity — being explicit pulls you into more searches.',
    },
    {
      priority: 'medium',
      category: 'communication',
      action: 'Set your response time commitment to under 2 hours in your host profile.',
      why: 'Fast responders get a Verified badge and appear higher in search.',
    },
  ],
  tierUnlockMessage: 'Complete the 4 items above to unlock the Verified Host tier and a 5–10% recommended price lift.',
  nextTier: 'verified',
  estimatedEffort: 'afternoon',
  listingVisibility: 'standard',
  priceRecommendationMultiplier: 0.95,
  evaluatedAt: new Date().toISOString(),
  fallback: true,
});
