/**
 * POST /api/ai-generate-listing   { imageUrls: string[] }  ->  { listing }
 *
 * Host uploads photos in the wizard, we read them with Claude and hand back a
 * complete, schema-valid listing draft. Turns the wizard from authorship into
 * approval, which is what actually strands hosts mid-flow.
 *
 * Auth: authenticatedUser() at the router. Image URLs are additionally pinned
 * to the Sharetribe CDN so this can never be used to fetch arbitrary hosts.
 * Requires process.env.ANTHROPIC_API_KEY.
 */
const Anthropic = require('@anthropic-ai/sdk');

const MODEL = process.env.ANTHROPIC_LISTING_MODEL || 'claude-opus-4-8';
const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
// Sharetribe serves uploaded listing images from these hosts. Anything else is
// rejected -- without this, an authenticated user could point the server at any
// https endpoint and have it fetched server-side.
const ALLOWED_IMAGE_HOSTS = /^(sharetribe\.imgix\.net|.*\.sharetribe\.com)$/i;

// Mirrors src/config/configListing.js. If those enums change, change these.
// c145: production has no poolType key - removed. Verified via 30-listing census.
const AMENITIES = ['ada', 'bbq', 'cameras', 'changing_area', 'covered_seating', 'deep_end', 'diving_board', 'evening_lights', 'fenced', 'heated', 'hot_tub', 'indoor', 'parking', 'pet_friendly', 'restroom', 'saltwater', 'slide', 'sound_system', 'wifi'];
const CATEGORIES = ['privatepool', 'dogfriendly', 'heatedpools', 'familyfriendly', 'indoorpools', 'swimlessons'];
const VIBES = ['party_ready', 'family_friendly', 'luxury', 'quiet', 'dog_day'];

const LISTING_TOOL = {
  name: 'draft_listing',
  description: 'Return the drafted pool rental listing.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: {
        type: 'string',
        description:
          'Compelling listing title, max ~60 characters. Lead with the standout feature. No city, no price.',
      },
      description: {
        type: 'string',
        description:
          'Two short paragraphs. P1: the experience and standout features visible in the photos. ' +
          'P2: practical details renters care about (space, seating, shade, water type if visible). ' +
          'Warm, concrete, no invented facts.',
      },
      guestallowed: {
        type: 'integer', minimum: 1, maximum: 100,
        description: 'Conservative max capacity estimated from visible pool and deck size.',
      },
      categoryLevel2: { type: 'string', enum: CATEGORIES, description: 'Best-fit subcategory for this pool.' },
      poolAmenities: {
        type: 'array', items: { type: 'string', enum: AMENITIES },
        description: 'Only amenities clearly visible in the photos. Omit anything uncertain.',
      },
      vibe: { type: 'array', items: { type: 'string', enum: VIBES } },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      notes: {
        type: 'string',
        description: 'One short sentence to the host about anything you could not determine.',
      },
    },
    required: ['title', 'description', 'guestallowed', 'poolAmenities', 'vibe', 'confidence', 'notes'],
  },
};

const SYSTEM_PROMPT = [
  'You write listings for Pool Rental Near Me, a marketplace for renting private backyard',
  'pools by the hour. You are looking at photos a real host just uploaded of their own pool.',
  '',
  'Write the listing a great host would write about their own backyard: specific, warm, honest.',
  'Never invent facts. If a photo does not show it, it does not go in the listing.',
  'Never mention price, fees, address, or availability. Write to the guest in second person.',
].join('\n');

const handleError = (res, status, message, detail) => {
  if (detail) console.error('[ai-generate-listing]', detail);
  return res.status(status).json({ error: message });
};

const fetchImageBlock = async url => {
  let host;
  try {
    host = new URL(url).hostname;
  } catch (e) {
    throw new Error(`bad url: ${String(url).slice(0, 80)}`);
  }
  if (!ALLOWED_IMAGE_HOSTS.test(host)) throw new Error(`host not allowed: ${host}`);

  const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!resp.ok) throw new Error(`image fetch failed (${resp.status})`);
  const ct = (resp.headers.get('content-type') || '').split(';')[0].trim();
  const mediaType = ALLOWED_MEDIA_TYPES.includes(ct) ? ct : 'image/jpeg';
  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.length === 0) throw new Error('empty image');
  if (buf.length > MAX_IMAGE_BYTES) throw new Error(`image too large (${buf.length})`);
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data: buf.toString('base64') } };
};

module.exports = async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return handleError(res, 500, 'AI listing generation is not configured.', 'Missing ANTHROPIC_API_KEY');
  }

  const rawUrls = Array.isArray(req.body && req.body.imageUrls) ? req.body.imageUrls : null;
  const imageUrls = rawUrls
    ? rawUrls.filter(u => typeof u === 'string' && /^https:\/\//i.test(u)).slice(0, MAX_IMAGES)
    : [];
  if (imageUrls.length === 0) {
    return handleError(res, 400, 'Provide 1-3 https image URLs in `imageUrls`.');
  }

  let imageBlocks;
  try {
    imageBlocks = await Promise.all(imageUrls.map(fetchImageBlock));
  } catch (e) {
    return handleError(res, 400, 'Could not read one or more uploaded photos.', e.message);
  }

  let msg;
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 90000 });
    msg = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: [LISTING_TOOL],
      tool_choice: { type: 'tool', name: 'draft_listing' },
      messages: [
        {
          role: 'user',
          content: [
            ...imageBlocks,
            {
              type: 'text',
              text:
                `Here ${imageBlocks.length === 1 ? 'is 1 photo' : `are ${imageBlocks.length} photos`} of my pool. ` +
                'Build my listing.',
            },
          ],
        },
      ],
    });
  } catch (e) {
    const status = e && e.status;
    return handleError(
      res,
      status && status < 500 ? 400 : 502,
      'AI listing generation failed. Please try again.',
      `${status || ''} ${(e && e.message) || e}`
    );
  }

  const use = (msg.content || []).find(b => b.type === 'tool_use');
  if (!use || !use.input) {
    return handleError(res, 502, 'AI did not return a listing. Please try again.', `stop_reason=${msg.stop_reason}`);
  }

  // Re-filter server-side. The schema already constrains these, but nothing
  // invalid should ever be able to reach a Sharetribe listing write.
  const d = use.input;
  const listing = {
    title: String(d.title || '').slice(0, 120),
    description: String(d.description || '').slice(0, 3000),
    guestallowed: Number.isInteger(d.guestallowed) ? Math.min(100, Math.max(1, d.guestallowed)) : null,
    poolAmenities: Array.isArray(d.poolAmenities) ? d.poolAmenities.filter(a => AMENITIES.includes(a)) : [],
    categoryLevel2: CATEGORIES.includes(d.categoryLevel2) ? d.categoryLevel2 : null,
    vibe: Array.isArray(d.vibe) ? d.vibe.filter(v => VIBES.includes(v)) : [],
    confidence: ['high', 'medium', 'low'].includes(d.confidence) ? d.confidence : 'medium',
    notes: String(d.notes || '').slice(0, 400),
  };
  return res.json({ listing, photosUsed: imageBlocks.length, model: MODEL });
};
