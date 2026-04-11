const Anthropic = require('@anthropic-ai/sdk').default;

const ANALYZE_PHOTOS_SYSTEM_PROMPT = `You are a pool rental listing generator for PoolRentalNearMe.com. You analyze pool photos and produce complete, SEO-optimized listing data.

## RULES — FOLLOW EXACTLY

### NEVER write:
- "oasis", "paradise", "escape", "retreat", "hidden gem", "slice of heaven", "piece of paradise"
- "Your [noun] awaits", "Welcome to", "Look no further"
- Any phrase that could describe ANY pool — be specific to THIS pool
- Vague quantities: "plenty of", "lots of", "ample", "spacious"
- Marketing fluff without substance

### ALWAYS write:
- SPECIFIC details visible in the photos: materials, colors, shapes, counts
- EXACT numbers when detectable: "6 lounge chairs", "40ft pool", "8ft deep end"
- The city/neighborhood name in the title AND first paragraph
- Search keywords renters actually Google: "[city] pool rental", "private pool near me", "pool party venue [city]"
- What makes THIS pool different from others — lead with the #1 differentiator

## BAD vs GOOD EXAMPLES

BAD title: "Beautiful Pool Oasis in California"
GOOD title: "Heated Saltwater Pool with Stone Waterfall & Fire Pit · Jurupa Valley"

BAD description: "Welcome to our beautiful backyard paradise! This stunning pool is perfect for families and friends looking to escape the heat."
GOOD description: "32ft heated saltwater pool with a natural stone waterfall cascading into the deep end. The freeform design sits in a landscaped backyard with mature palm trees, 6 cushioned lounge chairs, a built-in BBQ island with granite countertops, and string lights for evening swims. Located in the Riverview neighborhood of Jurupa Valley, 10 minutes from the 60 freeway."

## OUTPUT FORMAT

Return ONLY valid JSON (no markdown, no code fences) with this exact structure:
{
  "title": "SEO title with key feature + city",
  "description": "2-3 paragraphs of specific, photo-based description",
  "poolType": "inground" | "above-ground" | "natural" | "infinity" | "rooftop" | "indoor",
  "poolSize": "small" | "medium" | "large" | "olympic",
  "capacity": number,
  "heated": boolean,
  "depth": "Xft - Xft" or null,
  "amenities": ["amenity-key", ...],
  "safetyFeatures": ["feature-key", ...],
  "suggestedRules": {
    "childrenAllowed": boolean,
    "eventsAllowed": boolean,
    "alcoholAllowed": boolean,
    "petsAllowed": boolean,
    "musicAllowed": boolean,
    "smokingAllowed": boolean,
    "maxGuests": number,
    "minimumNotice": number
  },
  "suggestedStyle": "clean" | "resort" | "luxury" | "party" | "family" | "bold",
  "styleReason": "Brief reason",
  "seoKeywords": {
    "primary": "[city] pool rental",
    "secondary": ["keyword1", "keyword2", ...]
  },
  "uniqueAngle": "1 sentence differentiator",
  "pricing": {
    "suggestedRate": number,
    "rateRange": { "low": number, "high": number },
    "reasoning": "1-2 sentence explanation"
  }
}

## AMENITY KEYS
hot-tub, slide, diving-board, waterfall, grotto, lounge-chairs, umbrellas, outdoor-shower, grill, outdoor-kitchen, fire-pit, cabana, changing-room, restroom, towels, wifi, bluetooth-speaker, lighting, landscaping, playground

## SAFETY FEATURE KEYS
fence, gate-lock, pool-cover, alarm, enclosure, shallow-entry, non-slip, life-ring, first-aid

## STYLE GUIDE
- clean: Standard residential pool, no strong theme
- resort: Lush landscaping, tropical plants, tiki bar, water features
- luxury: High-end finishes, infinity edge, modern architecture, dark/moody
- party: Large deck, speakers, bar area, colorful lighting, big capacity
- family: Shallow end, play area, safety features prominent, warm suburban
- bold: Unique design, unusual shape, retro styling, artistic elements

Only include amenities/safety visible in photos. Do not fabricate.`;

// Simple in-memory rate limiting (1 generation per listing)
const generatedListings = new Map();

module.exports = async (req, res) => {
  try {
    const { imageUrls, address, city, state, coordinates, listingId } = req.body;

    // Validate required fields
    if (!imageUrls?.length) {
      return res.status(400).json({ message: 'At least one image URL is required.' });
    }
    if (!city || !state) {
      return res.status(400).json({ message: 'City and state are required.' });
    }

    // Rate limit: 1 generation per listing
    if (listingId && generatedListings.has(listingId)) {
      return res.status(429).json({
        message: 'Listing has already been generated. Edit fields manually.',
      });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY not set');
      return res.status(500).json({ message: 'AI service not configured.' });
    }

    const client = new Anthropic({ apiKey });

    // Build content array with images
    const content = [];

    // Add images (up to 5 to stay within token limits)
    const imagesToSend = imageUrls.slice(0, 5);
    for (const url of imagesToSend) {
      content.push({
        type: 'image',
        source: { type: 'url', url },
      });
    }

    // Add the text prompt
    const cityState = `${city}, ${state}`;
    content.push({
      type: 'text',
      text: `Analyze these pool photos and generate a complete listing.

Location: ${address || cityState}
City/State: ${cityState}

Generate the listing JSON. Remember:
- Title MUST include "${cityState}"
- Description first paragraph must mention the neighborhood/city
- Be specific to what you see in these photos — no generic filler
- Only list amenities visible in the photos
- Include pricing suggestion based on the pool quality and ${cityState} area`,
    });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: ANALYZE_PHOTOS_SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    });

    // Extract the text response
    const textBlock = response.content.find(block => block.type === 'text');
    if (!textBlock) {
      return res.status(500).json({ message: 'AI returned no text response.' });
    }

    // Parse the JSON from the response
    let listingData;
    try {
      // Strip any markdown code fences if present
      const jsonText = textBlock.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      listingData = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', textBlock.text);
      return res.status(500).json({ message: 'AI returned invalid response format.' });
    }

    // Mark this listing as generated (rate limit)
    if (listingId) {
      generatedListings.set(listingId, Date.now());
    }

    // Clean up old entries (older than 24 hours)
    const dayAgo = Date.now() - 86400000;
    for (const [id, timestamp] of generatedListings) {
      if (timestamp < dayAgo) generatedListings.delete(id);
    }

    res.status(200).json(listingData);
  } catch (error) {
    console.error('Generate listing error:', error);
    res.status(500).json({
      message: error.message || 'Failed to generate listing.',
    });
  }
};
