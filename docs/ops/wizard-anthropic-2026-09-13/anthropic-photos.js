// POST /wizard/api/analyze-photos
//
// Server-side replacement for the wizard's old browser->OpenRouter call, which
// shipped a live OpenRouter key inside dist/assets/index-*.js where any visitor
// could read it. The key never reaches the browser now:
//
//     browser -> /wizard/api/analyze-photos -> ANTHROPIC_API_KEY (server) -> Claude
//
// The response is deliberately returned in OpenAI/OpenRouter envelope shape
// ({choices:[{message:{content}}]}) because the wizard bundle already parses
// that shape. Keeping the envelope means the client patch is only a URL swap
// and a removed Authorization header, not a rewrite of minified React.
import Anthropic from "@anthropic-ai/sdk";

// The wizard sends photos the host just picked, as data: URLs. Nothing is
// uploaded yet at that point in the flow, so there is no https URL to pin to a
// CDN host the way /api/ai-generate-listing does on the marketplace.
const ALLOWED_MEDIA = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

// This endpoint spends real money per call, so it is not an open proxy: callers
// must hold the shared marketplace session, and each IP gets a bounded number of
// analyses per hour.
const RATE_LIMIT_PER_HOUR = Number(process.env.WIZARD_ANALYZE_RPH || 40);
const hits = new Map(); // ip -> number[] of epoch ms
function rateLimited(ip) {
  const now = Date.now();
  const cutoff = now - 3600_000;
  const recent = (hits.get(ip) || []).filter((t) => t > cutoff);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => t > cutoff)) hits.delete(k);
  return recent.length > RATE_LIMIT_PER_HOUR;
}

function imageBlockFromDataUrl(url) {
  const m = /^data:([a-z/+-]+);base64,(.+)$/i.exec(String(url || "").trim());
  if (!m) throw new Error("photo was not a base64 data URL");
  const mediaType = m[1].toLowerCase();
  if (!ALLOWED_MEDIA.has(mediaType)) throw new Error(`unsupported image type ${mediaType}`);
  const buf = Buffer.from(m[2], "base64");
  if (buf.length === 0) throw new Error("empty image");
  if (buf.length > MAX_IMAGE_BYTES) throw new Error(`image too large (${buf.length} bytes)`);
  return {
    block: { type: "image", source: { type: "base64", media_type: mediaType, data: m[2] } },
    bytes: buf.length,
  };
}

// Accepts the body the wizard already sends: an OpenAI-shaped chat request whose
// user content mixes {type:"image_url"} and {type:"text"} parts.
function parseRequest(body) {
  const messages = Array.isArray(body && body.messages) ? body.messages : [];
  const system = messages
    .filter((m) => m && m.role === "system")
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .join("\n\n")
    .trim();

  const parts = [];
  for (const m of messages) {
    if (!m || m.role !== "user") continue;
    if (typeof m.content === "string") parts.push({ type: "text", text: m.content });
    else if (Array.isArray(m.content)) parts.push(...m.content);
  }

  const imageBlocks = [];
  let total = 0;
  const text = [];
  for (const p of parts) {
    if (!p) continue;
    if (p.type === "image_url" && p.image_url && p.image_url.url) {
      if (imageBlocks.length >= MAX_IMAGES) continue; // mirror the client's own 5-photo slice
      const { block, bytes } = imageBlockFromDataUrl(p.image_url.url);
      total += bytes;
      if (total > MAX_TOTAL_BYTES) throw new Error("photos exceed the total size limit");
      imageBlocks.push(block);
    } else if (p.type === "text" && p.text) {
      text.push(String(p.text));
    }
  }
  return { system, imageBlocks, text: text.join("\n\n") };
}

export default async function analyzePhotos(req, res) {
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.ip || "";
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[analyze-photos] ANTHROPIC_API_KEY is not set");
    return res.status(500).json({ error: "Photo analysis is not configured." });
  }
  if (rateLimited(ip)) {
    return res.status(429).json({ error: "Too many photo analyses from this address. Try again later." });
  }

  let parsed;
  try {
    parsed = parseRequest(req.body);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  if (parsed.imageBlocks.length === 0) {
    return res.status(400).json({ error: "Attach at least one photo." });
  }

  const model = process.env.ANTHROPIC_WIZARD_MODEL || "claude-opus-5";
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 90_000 });
    const msg = await client.messages.create({
      model,
      max_tokens: 2048,
      // Classifying photos into a fixed code list does not need deep reasoning,
      // and low effort keeps per-host cost and latency down.
      output_config: { effort: "low" },
      ...(parsed.system ? { system: parsed.system } : {}),
      messages: [{ role: "user", content: [...parsed.imageBlocks, { type: "text", text: parsed.text }] }],
    });

    if (msg.stop_reason === "refusal") {
      console.error("[analyze-photos] refusal", msg.stop_details && msg.stop_details.category);
      return res.status(422).json({ error: "Those photos could not be analyzed. Please try different photos." });
    }
    const content = (msg.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    // OpenAI/OpenRouter envelope: the wizard bundle reads
    // choices[0].message.content and then regex-matches the JSON object out of it.
    return res.json({
      choices: [{ index: 0, finish_reason: msg.stop_reason, message: { role: "assistant", content } }],
      model: msg.model,
      usage: msg.usage,
      photosUsed: parsed.imageBlocks.length,
    });
  } catch (err) {
    // Never echo the upstream error body to the browser - it can carry request
    // metadata. Log server-side, return something a host can act on.
    console.error("[analyze-photos]", err && err.status, err && err.message);
    const status = err && err.status === 429 ? 429 : 502;
    return res.status(status).json({
      error: status === 429
        ? "Photo analysis is busy right now. Please try again in a moment."
        : "Photo analysis failed. You can fill the details in manually and keep going.",
    });
  }
}
