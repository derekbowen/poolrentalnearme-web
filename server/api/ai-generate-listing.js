/**
 * AI "list a pool in 30 seconds" endpoint.
 *
 * Input:  { imageUrls: string[] }  — 1–3 Sharetribe image variant URLs the host
 *         just uploaded (client uploads via sdk.images.upload first, then sends
 *         the variant URLs here).
 * Output: { listing: { title, description, poolType, maxGuests, amenities[],
 *           vibe[], suggestedHourlyPriceUsd, confidence, notes } }
 *
 * Uses OpenRouter (https://openrouter.ai) so the model is swappable via env.
 * Default: google/gemini-2.5-flash — vision + structured JSON output, ~$0.00005
 * per call. The structured fields map 1:1 onto the `hourly-pool` listing schema
 * in src/config/configListing.js.
 *
 * Gated behind authenticatedUser() in apiRouter.js so it can't burn AI credits
 * anonymously. Requires process.env.OPENROUTER_API_KEY.
 *   - OPENROUTER_MODEL  (optional) override the model, e.g. "google/gemini-3.5-flash".
 */
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'google/gemini-2.5-flash';
const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB/image
const FETCH_TIMEOUT_MS = 15000;
const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Option keys MUST match src/config/configListing.js (the `hourly-pool` fields)
// so the AI output drops straight into publicData.
const POOL_TYPES = ['in_ground', 'above_ground', 'indoor', 'infinity', 'lap', 'natural'];
const AMENITIES = [
  'heated', 'hot_tub', 'bathroom', 'outdoor_shower', 'wifi', 'grill', 'lounge_seating',
  'shade', 'sound_system', 'changing_room', 'parking', 'towels', 'pool_toys', 'dog_friendly',
];
const VIBES = ['party_ready', 'family_friendly', 'luxury', 'quiet', 'dog_day'];

// Strict JSON schema for response_format. Every property is required and
// additionalProperties:false (required by strict structured-output mode).
const LISTING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: {
      type: 'string',
      description:
        'Compelling, search-friendly listing title, max ~60 characters. Lead with the standout feature.',
    },
    description: {
      type: 'string',
      description:
        'Two short paragraphs. P1: the experience and standout features visible in the photos. P2: practical details renters care about (space, seating, shade, water type if visible). Warm, concrete, no invented facts.',
    },
    poolType: { type: 'string', enum: POOL_TYPES },
    maxGuests: {
      type: 'integer',
      description: 'Reasonable max guest capacity estimated from visible pool + deck size (typically 8–30).',
    },
    poolAmenities: {
      type: 'array',
      items: { type: 'string', enum: AMENITIES },
      description:
        'FREE/included amenities clearly VISIBLE or strongly implied by the photos. Do NOT guess heated/wifi without visible evidence. Better to omit than invent.',
    },
    addOns: {
      type: 'array',
      description:
        'Optional PAID extras the host could charge for (e.g. hot tub session, grill/BBQ use, sound system, towels). Suggest 0–4 only if visible/plausible, with a conservative suggested price; empty is fine. The host edits these.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', description: 'Short add-on name, e.g. "Hot tub session".' },
          suggestedPriceUsd: { type: 'integer', description: 'Suggested price in whole US dollars.' },
        },
        required: ['name', 'suggestedPriceUsd'],
      },
    },
    vibe: {
      type: 'array',
      items: { type: 'string', enum: VIBES },
      description: 'One to three vibe tags that match what the photos convey.',
    },
    suggestedHourlyPriceUsd: {
      type: 'integer',
      description:
        'Suggested hourly rate in whole US dollars based on apparent size/quality/amenities. Typical private pools $40–150/hr; reserve $120+ for clearly luxury/large pools.',
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    notes: {
      type: 'string',
      description:
        'One short sentence to the host: what you could not determine from photos and should confirm (e.g. "Confirm whether the pool is heated and add your address").',
    },
  },
  required: [
    'title', 'description', 'poolType', 'maxGuests', 'poolAmenities', 'addOns', 'vibe',
    'suggestedHourlyPriceUsd', 'confidence', 'notes',
  ],
};

const SYSTEM_PROMPT =
  'You are a listings expert for Pool Rental Near Me, a marketplace where people rent private pools by the hour. ' +
  'A host has uploaded photos of their pool. Build them a booking-ready listing draft. ' +
  'Ground every field in what the photos actually show — never invent amenities or features you cannot see. ' +
  'Highlight what drives bookings: shade, seating, restroom access, easy parking, water type, and overall vibe. ' +
  'You cannot see the address, whether the pool is heated, or wifi from photos alone unless there is direct visual evidence — ' +
  'omit those rather than guessing, and say in `notes` what the host should confirm. ' +
  'Put FREE included features in `poolAmenities`; put OPTIONAL paid extras the host could charge for in `addOns` (with conservative suggested prices, or leave empty). ' +
  'Respond ONLY with a JSON object matching the required schema.';

const handleError = (res, status, message, detail) => {
  if (detail) console.error('[ai-generate-listing]', message, detail);
  return res.status(status).json({ error: message });
};

// Fetch one image URL and return an OpenAI-style image_url content part (base64 data URL).
const fetchImagePart = async url => {
  const resp = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!resp.ok) throw new Error(`image fetch failed (${resp.status}) for ${url}`);

  const ct = (resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const mediaType = ALLOWED_MEDIA_TYPES.includes(ct) ? ct : 'image/jpeg';

  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.length === 0) throw new Error(`empty image for ${url}`);
  if (buf.length > MAX_IMAGE_BYTES) throw new Error(`image too large (${buf.length} bytes) for ${url}`);

  return { type: 'image_url', image_url: { url: `data:${mediaType};base64,${buf.toString('base64')}` } };
};

module.exports = async (req, res) => {
  if (!process.env.OPENROUTER_API_KEY) {
    return handleError(res, 500, 'AI listing generation is not configured.', 'Missing OPENROUTER_API_KEY');
  }

  const rawUrls = Array.isArray(req.body && req.body.imageUrls) ? req.body.imageUrls : null;
  const imageUrls = rawUrls
    ? rawUrls.filter(u => typeof u === 'string' && /^https:\/\//i.test(u)).slice(0, MAX_IMAGES)
    : [];

  if (imageUrls.length === 0) {
    return handleError(res, 400, 'Provide 1–3 https image URLs in `imageUrls`.');
  }

  let imageParts;
  try {
    imageParts = await Promise.all(imageUrls.map(fetchImagePart));
  } catch (e) {
    return handleError(res, 400, 'Could not read one or more uploaded photos.', e.message);
  }

  const body = {
    model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
    max_tokens: 2048,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              `Here ${imageParts.length === 1 ? 'is 1 photo' : `are ${imageParts.length} photos`} of my pool. ` +
              'Build my listing.',
          },
          ...imageParts,
        ],
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'pool_listing', strict: true, schema: LISTING_SCHEMA },
    },
  };

  let data;
  try {
    const apiRes = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Title': 'Pool Rental Near Me — listing generator',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
    data = await apiRes.json().catch(() => ({}));
    if (!apiRes.ok) {
      const msg = (data && data.error && data.error.message) || `OpenRouter ${apiRes.status}`;
      const status = apiRes.status >= 500 ? 502 : 400;
      return handleError(res, status, 'AI listing generation failed. Please try again.', msg);
    }
  } catch (e) {
    return handleError(res, 502, 'AI listing generation failed. Please try again.', e.message);
  }

  const choice = data && data.choices && data.choices[0];
  const content = choice && choice.message && choice.message.content;
  if (choice && (choice.message.refusal || choice.finish_reason === 'content_filter')) {
    return handleError(res, 422, 'These photos could not be processed. Try different photos of the pool.');
  }
  if (!content) {
    return handleError(res, 502, 'AI did not return a listing. Please try again.', `finish_reason=${choice && choice.finish_reason}`);
  }

  let listing;
  try {
    listing = JSON.parse(content);
  } catch (e) {
    return handleError(res, 502, 'AI returned an unexpected response. Please try again.', `parse: ${content.slice(0, 200)}`);
  }

  return res.json({ listing });
};
