/**
 * GET /api/calendar/demand/:listingId?from=YYYY-MM-DD&to=YYYY-MM-DD
 * ──────────────────────────────────────────────────────────────────
 * Returns an AI-generated demand forecast for each day in the window.
 * Used by PoolCalendar to overlay "hot day" signals and price suggestions.
 *
 * Uses Claude Haiku — fast and cheap (~$0.0002 per forecast window).
 * Cached in-memory per listingId+window for 6 hours.
 *
 * Response:
 *   {
 *     ok: true,
 *     forecast: [
 *       { date: 'YYYY-MM-DD', demand: 8, priceMultiplier: 1.25, tag: 'hot', reason: '...' },
 *       ...
 *     ]
 *   }
 */

const Anthropic = require('@anthropic-ai/sdk').default;
const { getTrustedSdk } = require('../../api-util/sdk');

const MODEL = 'claude-haiku-4-5-20251001';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const cache = new Map(); // key → { data, expiresAt }

const US_HOLIDAYS_2025_2026 = [
  '2025-05-26', // Memorial Day
  '2025-07-04', // Independence Day
  '2025-09-01', // Labor Day
  '2026-05-25',
  '2026-07-04',
  '2026-09-07',
];

const SYSTEM_PROMPT = `You are a demand forecasting model for a private pool rental marketplace.
Given a city, state, and date range, return a JSON array of daily demand scores.

Rules:
- Weekends (Fri/Sat/Sun) score higher than weekdays by default
- Summer (Jun-Aug) peaks; spring/fall shoulder; winter low (unless Sun Belt city like Phoenix, Miami, LA)
- Holiday weekends (Memorial Day, July 4th, Labor Day) score 9-10
- Weekday in January in Chicago scores 1-2; weekday in July in Miami scores 5-6
- Be specific to the city's climate and pool culture
- priceMultiplier range: 0.75 (slow) → 1.50 (holiday weekend peak)
- tag options: null | "slow" | "shoulder" | "hot" | "peak" | "holiday-weekend"
- reason: max 8 words, e.g. "July 4th weekend, peak demand"

Output ONLY a valid JSON array. No prose. No markdown. Example:
[{"date":"2025-07-04","demand":10,"priceMultiplier":1.5,"tag":"holiday-weekend","reason":"Independence Day, highest demand day"},...]`;

const addDays = (date, n) => {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
};

const buildDateRange = (from, to) => {
  const dates = [];
  let cur = from;
  while (cur <= to) {
    dates.push(cur);
    cur = addDays(cur, 1);
  }
  return dates;
};

module.exports = async (req, res) => {
  const { listingId } = req.params;
  if (!listingId) return res.status(400).json({ error: 'listingId required' });

  const today = new Date().toISOString().split('T')[0];
  const from = req.query.from || today;
  const to = req.query.to || addDays(today, 59); // default 60-day window

  const cacheKey = `${listingId}:${from}:${to}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return res.json({ ok: true, forecast: cached.data, cached: true });
  }

  try {
    const sdk = await getTrustedSdk(req);
    const listingRes = await sdk.listings.show({ id: listingId });
    const listing = listingRes?.data?.data;
    const publicData = listing?.attributes?.publicData || {};

    // Extract city/state from listing location
    const locationAddress = publicData?.location?.address || '';
    const parts = locationAddress.split(',').map(s => s.trim());
    const city = parts[1] || 'Unknown City';
    const state = (parts[2] || '').split(' ')[0] || 'US';

    const dates = buildDateRange(from, to);
    const holidayDates = US_HOLIDAYS_2025_2026.filter(h => h >= from && h <= to);

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const userMessage = `City: ${city}, ${state}
Date range: ${from} to ${to} (${dates.length} days)
Notable holidays in window: ${holidayDates.length > 0 ? holidayDates.join(', ') : 'none'}
Pool type: ${publicData.poolType || 'standard'} ${publicData.heated ? '(heated)' : '(unheated)'}

Return a JSON array with one entry per date for all ${dates.length} dates.`;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const raw = response.content[0]?.text || '[]';
    const clean = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    const forecast = JSON.parse(clean);

    // Validate structure
    if (!Array.isArray(forecast)) throw new Error('forecast must be an array');

    cache.set(cacheKey, { data: forecast, expiresAt: Date.now() + CACHE_TTL_MS });

    return res.json({ ok: true, forecast });
  } catch (err) {
    console.error('[calendar/demand-forecast]', err);
    // Graceful fallback: return neutral scores so calendar still renders
    const dates = buildDateRange(from, to);
    const fallback = dates.map(date => {
      const dow = new Date(date).getUTCDay();
      const isWeekend = dow === 0 || dow === 5 || dow === 6;
      return {
        date,
        demand: isWeekend ? 6 : 3,
        priceMultiplier: isWeekend ? 1.1 : 0.9,
        tag: isWeekend ? 'hot' : 'slow',
        reason: isWeekend ? 'Weekend' : 'Weekday',
      };
    });
    return res.json({ ok: true, forecast: fallback, fallback: true });
  }
};
