import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import analyzePhotos from "./anthropic-photos.js";
const app = express();
const PORT = process.env.PORT || 3099;

const SHARETRIBE_BASE = "https://flex-integ-api.sharetribe.com";
const MP_BASE = "https://flex-api.sharetribe.com"; // Marketplace API (verify host session)

// Verify a marketplace access token (from the shared session cookie) -> the host.
async function userFromToken(req) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) {
    console.error("[auth] no Bearer token on request — host not signed in (or SSO cookie not read).");
    return null;
  }
  try {
    const r = await fetch(`${MP_BASE}/v1/api/current_user/show`, { headers: { Authorization: "Bearer " + token } });
    if (!r.ok) {
      // Most common real failure: the SSO cookie held an ANONYMOUS or EXPIRED token.
      // Expected for every anonymous visitor — throttle to once/10min so real
      // [create-listing]/[upload-images] errors aren't buried in log triage.
      const now = Date.now();
      if (!global.__authNoiseAt || now - global.__authNoiseAt > 600000) {
        global.__authNoiseAt = now;
        console.error(`[auth] Marketplace rejected the session token HTTP ${r.status} (anonymous/expired token?). (throttled: logged max once/10min)`);
      }
      return null;
    }
    const j = await r.json().catch(() => ({}));
    const id = j.data && (j.data.id?.uuid || j.data.id);
    if (!id) {
      console.error("[auth] token accepted but resolved to NO user id (anonymous app token, not a logged-in host).");
      return null;
    }
    const name = (j.data.attributes && j.data.attributes.profile && (j.data.attributes.profile.displayName || j.data.attributes.profile.firstName)) || "";
    return { sub: id, name };
  } catch (e) {
    console.error("[auth] current_user/show network error:", e.message);
    return null;
  }
}

async function getToken() {
  const clientId = process.env.SHARETRIBE_CLI_API_KEY;
  const clientSecret = process.env.SHARETRIBE_CLI_API_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("SHARETRIBE_CLI_API_KEY and SHARETRIBE_CLI_API_SECRET must be set");
  }
  const res = await fetch(`${SHARETRIBE_BASE}/v1/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "integ",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[getToken] Integration API auth FAILED HTTP ${res.status}: ${body.slice(0, 400)} — check SHARETRIBE_CLI_API_KEY/SECRET in merlin.env`);
    throw new Error(`Auth failed: ${res.status} ${body}`);
  }
  return (await res.json()).access_token;
}

// Print the FULL Sharetribe JSON:API error array (status, code, title, source/details)
// so a rejected write names the bad attribute instead of failing silently.
function logStErrors(tag, status, data) {
  const errs = (data && data.errors) || [];
  console.error(`[${tag}] Sharetribe REJECTED — HTTP ${status}`);
  for (const e of errs) {
    console.error(
      `  - ${e.status || ""} ${e.code || ""} :: ${e.title || ""}` +
        (e.source ? ` :: source=${JSON.stringify(e.source)}` : "") +
        (e.details ? ` :: details=${JSON.stringify(e.details)}` : ""),
    );
  }
  if (!errs.length) console.error("  raw:", JSON.stringify(data).slice(0, 1500));
}

async function proxyToSharetribe(endpoint, body) {
  const token = await getToken();
  const res = await fetch(`${SHARETRIBE_BASE}/v1/integration_api/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) logStErrors(endpoint, res.status, data);
  return { status: res.status, data };
}

// Sharetribe needs availability-plan times as "HH:MM" with hours 00–23, and stores
// end-of-day as "00:00" (the wizard's midnight picker option is "24:00"). Sending
// "24:00" raw makes Sharetribe reject the whole publish with "End time must be in
// hh:mm format". Normalize here as a server-side safety net so even a host on a
// stale client bundle can publish. Mirrors the client-side toApiTime().
function toApiTime(t) {
  if (typeof t !== "string") return null;
  const m = t.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  if (h === 24) return `00:${m[2]}`; // midnight / end-of-day
  if (h < 0 || h > 23 || parseInt(m[2], 10) > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

// Normalize availabilityPlan entry times in place; drop entries whose times can't
// be coerced so a single bad value can't 400 the entire listing.
function normalizeAvailabilityTimes(body) {
  const entries = body && body.availabilityPlan && body.availabilityPlan.entries;
  if (!Array.isArray(entries)) return body;
  body.availabilityPlan.entries = entries
    .map((e) => {
      const startTime = toApiTime(e && e.startTime);
      const endTime = toApiTime(e && e.endTime);
      return startTime && endTime ? { ...e, startTime, endTime } : null;
    })
    .filter(Boolean);
  return body;
}

// UTC instant of local midnight on a 'YYYY-MM-DD' date in the given IANA tz.
// (merlin has no date lib, so derive the tz offset via Intl.)
function zonedMidnightUTC(dateStr, tz) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || "")) return null;
  const guess = new Date(dateStr + "T00:00:00Z");
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz || "Etc/UTC",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
    const p = dtf.formatToParts(guess).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
    let hour = parseInt(p.hour, 10);
    if (hour === 24) hour = 0;
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, hour, +p.minute, +p.second);
    const offset = asUTC - guess.getTime();
    return new Date(guess.getTime() - offset);
  } catch (e) {
    return guess;
  }
}

app.use(express.json({ limit: "80mb" }));

// Photo analysis runs SERVER-SIDE. The browser used to call OpenRouter
// directly with an API key compiled into dist/assets/index-*.js, which made that
// key readable by anyone who opened /wizard/. The key now lives only in
// merlin.env and never leaves this process.
app.post("/wizard/api/analyze-photos", analyzePhotos);

// --- Verify the shared marketplace session, return the host's display name ---
app.get("/wizard/api/auth/me", async (req, res) => {
  const u = await userFromToken(req);
  if (!u) return res.status(401).json({ ok: false });
  res.json({ ok: true, name: u.name });
});

app.post("/wizard/api/sharetribe/create-listing", async (req, res) => {
  const u = await userFromToken(req);
  if (!u) {
    // BLOCKED before Sharetribe: the host's marketplace session token was missing/invalid.
    console.error("[create-listing] BLOCKED (auth): no valid host session — 401, nothing sent to Sharetribe.");
    return res.status(401).json({ error: "Please sign in to publish your listing." });
  }
  try {
    // Author is the verified host from the marketplace session — never trust a client-supplied authorId.
    const body = normalizeAvailabilityTimes({ ...req.body, authorId: u.sub });
    // Safe default: new listings get a 1-day advance-notice rule unless the host
    // explicitly set one in the wizard. Hosts coming from Swimply assume their
    // notice carried over (it cannot be read from the public page), and a
    // same-hour booking surprise is worse than a too-cautious default.
    const pd = body.publicData || (body.publicData = {});
    const av = pd.availability || (pd.availability = {});
    const hasNotice = [pd.advanceNoticeHours, pd.advanceNoticeDays, av.advanceNoticeHours, av.advanceNoticeDays]
      .some((v) => Number.isFinite(typeof v === "string" ? parseFloat(v) : v));
    if (!hasNotice) {
      av.advanceNoticeDays = 1;
      pd.advanceNoticeDays = 1;
      console.log("[create-listing] defaulted advanceNoticeDays=1 (host set no notice rule)");
    }
    const result = await proxyToSharetribe("listings/create", body);
    if (result.status >= 400) {
      // NOTE: there is NO local validation gate — a failure here is a Sharetribe REJECT (logged above), not a block by us.
      console.error(`[create-listing] FAILED for host ${u.sub} (HTTP ${result.status}) — Sharetribe reject, see errors above.`);
    } else {
      const id = result.data?.data?.id?.uuid || result.data?.data?.id;
      console.log(`[create-listing] OK host=${u.sub} listing=${id} title=${JSON.stringify(req.body?.title)}`);

      // Enforce blocked dates: the wizard stores publicData.availability.blockedDates
      // but Sharetribe only stops bookings on availability EXCEPTIONS. Create a
      // full-day seats:0 exception per blocked date so a guest can't book them.
      const blocked = Array.isArray(body?.publicData?.availability?.blockedDates)
        ? body.publicData.availability.blockedDates
        : [];
      const tz = body?.availabilityPlan?.timezone || "Etc/UTC";
      if (id && blocked.length) {
        let made = 0;
        for (const d of blocked.slice(0, 120)) {
          try {
            const start = zonedMidnightUTC(d, tz);
            if (!start) continue;
            const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
            const ex = await proxyToSharetribe("availability_exceptions/create", {
              listingId: id,
              seats: 0,
              start: start.toISOString(),
              end: end.toISOString(),
            });
            if (ex.status < 400) made++;
          } catch (e) {
            console.error(`[create-listing] block-date exception failed for ${d}: ${e.message}`);
          }
        }
        console.log(`[create-listing] blocked-date exceptions created: ${made}/${blocked.length} listing=${id}`);
      }
    }
    res.status(result.status).json(result.data);
  } catch (err) {
    console.error("[create-listing] NETWORK/EXCEPTION:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/wizard/api/sharetribe/update-listing", async (req, res) => {
  if (!(await userFromToken(req))) return res.status(401).json({ error: "Please sign in." });
  try {
    const result = await proxyToSharetribe("listings/update", req.body);
    res.status(result.status).json(result.data);
  } catch (err) {
    console.error("[update-listing]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- URL import: Swimply / Peerspace / Giggster -> draft via Firecrawl ---
const IMPORT_ALLOW = /^https?:\/\/([a-z0-9-]+\.)*(swimply\.com|peerspace\.com|giggster\.com)\//i;
const IMPORT_SYSTEM = `You extract a pool-rental listing from a source page (Swimply/Peerspace/Giggster) into STRICT JSON for "Pool Rental Near Me". Use ONLY information present in the input; if a field is unknown use null (NEVER guess). Do NOT invent the exact street address (these sites hide it; city/state is OK). Return ONLY this JSON:
{"title":string|null,"description":string|null,"space":string[]|null,"water_type":string|null,"guestallowed":number|null,"pool_depth":string|null,"parking_size":string|null,"cancellation_policy":string|null,"basePriceCents":number|null,"amenities":[{"amenity":string,"price":number,"description":string}]|null,"poolAmenities":string[]|null,"photos":string[]|null,"city":string|null,"state":string|null}
Rules: basePriceCents = hourly price in CENTS ($60/hr -> 6000). amenities = PRICED add-ons (price in cents). poolAmenities = FREE amenity labels. photos = absolute image URLs found on the page.`;



// Append-only record of every import attempt (survives container rebuilds).
function logImport(rec) {
  try {
    fs.appendFileSync("/app/import-attempts.jsonl", JSON.stringify(rec) + "\n");
  } catch (e) { console.error("[logImport] FAILED:", e && e.message); }
}

const IMPORT_PROMPT = `Extract the pool-rental listing. Use ONLY information present on the page; if a value is unknown use null, or an empty array for lists - NEVER guess. Do not invent a street address (city/state only). description: reproduce the host's FULL description text as written, including every section and bullet - do NOT summarize, shorten, or paraphrase it. basePriceCents = hourly price in CENTS. amenities = PRICED add-ons only, price in cents; take each add-on's price from its OWN card or row, never from a neighbouring one or from prose elsewhere on the page. poolAmenities = FREE or included amenity labels - list every one you can find, including those the host marks as free in the description text.`;
const IMPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title","description","space","water_type","guestallowed","pool_depth","parking_size","cancellation_policy","basePriceCents","amenities","poolAmenities","city","state"],
  properties: {
    title: { type: ["string","null"] },
    description: { type: ["string","null"] },
    space: { type: "array", items: { type: "string" } },
    water_type: { type: ["string","null"] },
    guestallowed: { type: ["number","null"] },
    pool_depth: { type: ["string","null"] },
    parking_size: { type: ["string","null"] },
    cancellation_policy: { type: ["string","null"] },
    basePriceCents: { type: ["number","null"] },
    city: { type: ["string","null"] },
    state: { type: ["string","null"] },
    poolAmenities: { type: "array", items: { type: "string" } },
    amenities: { type: "array", items: {
      type: "object", additionalProperties: false,
      required: ["amenity","price","description"],
      properties: { amenity: { type: "string" }, price: { type: "number" }, description: { type: "string" } } } },
  },
};

function harvestImages(html) {
  const re = /https?:\/\/[^"'\s\\)]+?\.(?:jpe?g|png|webp)(?:\?[^"'\s\\)]*)?/gi;
  const junk = /(logo|icon|favicon|sprite|avatar|placeholder|blank|loading|pixel|badge|emoji|spinner|map|static\.|tile)/i;
  const seen = new Set();
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null && out.length < 40) {
    const u = m[0].replace(/\\u002[fF]/g, "/").replace(/\\\//g, "/");
    if (junk.test(u) || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

app.post("/wizard/api/import-listing", async (req, res) => {
  const url = ((req.body && req.body.url) || "").trim();
  const reqIp = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.ip || "";
  const startedAt = new Date().toISOString();
  if (!IMPORT_ALLOW.test(url)) {
    logImport({ at: startedAt, ip: reqIp, url, outcome: "rejected-url" });
    return res.status(400).json({ error: "Please paste a Swimply, Peerspace, or Giggster listing URL." });
  }
  try {
    // Extraction runs on Firecrawl (already paid for) instead of OpenRouter. OpenRouter
    // billed the model's full default output ceiling against the balance and started
    // returning HTTP 402, which surfaced to hosts as "AI extraction failed" - 43 failed
    // imports across 13 hosts. Firecrawl also renders JS, so Swimply's lazy-loaded
    // gallery and collapsed description are actually present in the HTML we harvest.
    // The "read more" click only exists on Swimply pages with a long description.
    // Firecrawl aborts the WHOLE scrape if an action's selector is missing, so a
    // short listing would 502. Try with actions, then fall back to a plain scrape.
    const expandActions = /swimply\.com/i.test(url)
      ? [
          { type: "wait", milliseconds: 4000 },
          { type: "click", selector: ".sc-ce77ffd6-2" },
          { type: "wait", milliseconds: 2000 },
          { type: "scroll", direction: "down" },
          { type: "wait", milliseconds: 1500 },
        ]
      : [{ type: "wait", milliseconds: 4000 }, { type: "scroll", direction: "down" }, { type: "wait", milliseconds: 1500 }];

    const scrape = async (actions) => {
      const r = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: { Authorization: "Bearer " + process.env.FIRECRAWL_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          formats: ["json", "html"],
          waitFor: 5000,
          timeout: 120000,
          ...(actions ? { actions } : {}),
          jsonOptions: { prompt: IMPORT_PROMPT, schema: IMPORT_SCHEMA },
        }),
      });
      const j = await r.json().catch(() => null);
      return { ok: r.ok && j && j.success === true, status: r.status, j };
    };

    let fc = await scrape(expandActions);
    if (!fc.ok) {
      console.error("[import-listing] retry without actions:", fc.status, String((fc.j || {}).code || "").slice(0, 60));
      fc = await scrape(null);
    }
    if (!fc.ok) {
      console.error("[import-listing] firecrawl", fc.status, JSON.stringify(fc.j || {}).slice(0, 400));
      logImport({ at: startedAt, ip: reqIp, url, outcome: "scrape-failed" });
      return res.status(502).json({ error: "We couldn't read that listing page. Please try again in a moment." });
    }
    const fcJson = fc.j;
    const html = (fcJson.data && fcJson.data.html) || "";
    const draft = fcJson.data && fcJson.data.json;
    if (!draft || typeof draft !== "object") {
      console.error("[import-listing] no json", String((fcJson.data || {}).warning || "").slice(0, 300));
      logImport({ at: startedAt, ip: reqIp, url, outcome: "extract-failed" });
      return res.status(502).json({ error: "We couldn't pull the details off that page. You can still build the listing manually." });
    }
    // Harvest gallery images directly from the page (more reliable than the LLM for photos)
    const merged = [];
    const seenImg = new Set();
    for (const u of [...harvestImages(html), ...(Array.isArray(draft.photos) ? draft.photos : [])]) {
      if (typeof u === "string" && u.startsWith("http") && !seenImg.has(u)) { seenImg.add(u); merged.push(u); }
    }
    draft.photos = merged.slice(0, 20);
    logImport({ at: startedAt, ip: reqIp, url, outcome: "ok", title: draft.title || null, photos: (draft.photos || []).length });
    res.json({ ok: true, source: url, draft });
  } catch (e) {
    logImport({ at: startedAt, ip: reqIp, url, outcome: "error", message: String(e.message).slice(0, 200) });
    console.error("[import-listing]", e.message);
    res.status(500).json({ error: e.message });
  }
});

// --- Upload images to Sharetribe: remote URLs (imported) and/or base64 data URLs (host files) ---
async function uploadBufferToSharetribe(token, buf, ct) {
  const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
  const fd = new FormData();
  fd.append("image", new Blob([buf], { type: ct }), `photo.${ext}`);
  const up = await fetch(`${SHARETRIBE_BASE}/v1/integration_api/images/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const uj = await up.json().catch(() => ({}));
  if (!up.ok) {
    console.error(`[upload-images] image upload REJECTED HTTP ${up.status}:`, JSON.stringify(uj).slice(0, 500));
    return null;
  }
  return (uj.data && (uj.data.id?.uuid || uj.data.id)) || null;
}

app.post("/wizard/api/sharetribe/upload-images", async (req, res) => {
  if (!(await userFromToken(req))) return res.status(401).json({ error: "Please sign in." });
  const urls = (req.body && req.body.urls) || [];
  const files = (req.body && req.body.files) || []; // array of base64 data URLs
  if ((!Array.isArray(urls) || urls.length === 0) && (!Array.isArray(files) || files.length === 0)) {
    return res.status(400).json({ error: "No images provided." });
  }
  try {
    const token = await getToken();
    const imageIds = [];
    // Host-uploaded files first (so the cover photo stays first in the listing)
    for (const dataUrl of files.slice(0, 20)) {
      try {
        const m = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(dataUrl || "");
        if (!m) continue;
        const buf = Buffer.from(m[2], "base64");
        if (buf.length === 0 || buf.length > 20 * 1024 * 1024) continue;
        const id = await uploadBufferToSharetribe(token, buf, m[1]);
        if (id) imageIds.push(id);
      } catch (e) {
        console.error("[upload-images] host-file upload error:", e.message);
      }
    }
    // Then imported photos by URL
    for (const url of urls.slice(0, 20)) {
      try {
        const imgRes = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36" } });
        if (!imgRes.ok) continue;
        const ct = imgRes.headers.get("content-type") || "image/jpeg";
        if (!ct.startsWith("image/")) continue;
        const buf = Buffer.from(await imgRes.arrayBuffer());
        if (buf.length === 0 || buf.length > 20 * 1024 * 1024) continue;
        const id = await uploadBufferToSharetribe(token, buf, ct);
        if (id) imageIds.push(id);
      } catch (e) {
        console.error("[upload-images] url upload error:", url, e.message);
      }
    }
    // SILENT-FAILURE FIX. Every failure path above is a `continue`, so a photo
    // that is rejected by Sharetribe, too large, or not a data URL is skipped
    // without a word. This used to still answer {ok:true} with an empty
    // imageIds, so the wizard believed the photo step had succeeded and the
    // host moved on with a listing that had no pictures. 13 of the 22 stuck
    // drafts look exactly like that: valid geocoded address, zero images.
    const requested = files.length + urls.length;
    const failed = requested - imageIds.length;
    if (imageIds.length === 0) {
      console.error("[upload-images] TOTAL FAILURE: 0 of", requested, "images uploaded");
      return res.status(502).json({
        error: "None of your photos could be uploaded. Please try again, or use smaller files.",
        requested, uploaded: 0, failed,
      });
    }
    if (failed > 0) console.error("[upload-images] PARTIAL:", imageIds.length, "of", requested, "uploaded");
    res.json({ ok: true, imageIds, requested, uploaded: imageIds.length, failed });
  } catch (err) {
    console.error("[upload-images]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Serve static wizard files
// Inject Google Maps key into HTML so AddressAutocomplete can load Places.
// Reads GOOGLE_MAPS_API_KEY env, falls back to the referrer-restricted public key shared with the marketplace.
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "REDACTED_GOOGLE_MAPS_API_KEY";
// Two-step injection: (1) substitute the inline-loader fallback so Google's loader uses the real key at parse time;
// (2) ALSO set window.__GOOGLE_MAPS_KEY before </head> so AddressAutocomplete's static-map preview can read it later.
const __INDEX_HTML = fs.readFileSync(path.join(__dirname, "../dist/index.html"), "utf8")
  .replace('window.__GOOGLE_MAPS_KEY || ""', JSON.stringify(GOOGLE_MAPS_API_KEY))
  .replace(
    "</head>",
    `<script>window.__GOOGLE_MAPS_KEY=${JSON.stringify(GOOGLE_MAPS_API_KEY)};</script></head>`
  );
const sendInjectedIndex = (req, res) => res.type("html").send(__INDEX_HTML);
app.get("/wizard", sendInjectedIndex);
app.get("/wizard/", sendInjectedIndex);
app.use("/wizard", express.static(path.join(__dirname, "../dist"), { index: false }));
app.get("/wizard/{*path}", sendInjectedIndex);

app.listen(PORT, () => {
  console.log(`Wizard server running on port ${PORT}`);
  // Boot self-check: one line, NAMES only (never values), non-fatal — so a
  // container started with a missing/renamed env var is obvious in the logs
  // instead of surfacing later as a mid-publish 500.
  const requiredEnv = ["SHARETRIBE_CLI_API_KEY", "SHARETRIBE_CLI_API_SECRET", "FIRECRAWL_API_KEY", "GOOGLE_MAPS_API_KEY"];
  console.log("[env-check] " + requiredEnv.map((k) => `${k}=${process.env[k] ? "SET" : "MISSING"}`).join(" "));
});
