const integrationSdk = require('../api-util/integration');

// c153: tracked host share links. /go/<title-slug>-<uuid8> 302s to the listing
// page (with ?ref=host-share for signup attribution) and logs the click so the
// host's dashboard can show their off-platform posting actually working.
// Resolution is by the 8-hex uuid suffix; the slug part is cosmetic.
const slugify = t =>
  (t || 'pool')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'pool';

let cache = { at: 0, list: [] }; // [{uuid, slug}]
const CACHE_MS = 10 * 60 * 1000;

const refresh = async () => {
  if (Date.now() - cache.at < CACHE_MS || !integrationSdk) return;
  const list = [];
  let page = 1;
  let totalPages = 1;
  do {
    // The server integration helper wraps responses: it returns the denormalized
    // entity array directly; pagination meta only exists on _raw when requested.
    const r = await integrationSdk.listings.query(
      { perPage: 100, page, states: ['published'] },
      { allowRawResponse: true }
    );
    const entities = Array.isArray(r) ? r : [];
    for (const l of entities) {
      list.push({ uuid: l.id.uuid, slug: slugify(l.attributes.title) });
    }
    totalPages = (r && r._raw && r._raw.data && r._raw.data.meta && r._raw.data.meta.totalPages) || 1;
    page++;
  } while (page <= totalPages);
  cache = { at: Date.now(), list };
};

const logClick = (listingId, slug) => {
  const U = process.env.SUPABASE_URL;
  const K = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!U || !K) return;
  fetch(`${U}/rest/v1/sms_reply_ctx`, {
    method: 'POST',
    headers: {
      apikey: K,
      Authorization: 'Bearer ' + K,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      phone: '-',
      tx_id: listingId,
      kind: 'share_click',
      pool: String(slug || '').slice(0, 80),
      expires_at: '2099-01-01T00:00:00Z',
      resolved: true,
    }),
  }).catch(() => {});
};

module.exports = async (req, res) => {
  const token = slugify(req.params.token);
  try {
    await refresh();
  } catch (e) {
    // stale cache is fine; empty cache falls through to /s
  }
  const suffix = (token.match(/([0-9a-f]{8})$/) || [])[1];
  const hit =
    (suffix && cache.list.find(l => l.uuid.replace(/-/g, '').startsWith(suffix))) ||
    (suffix && cache.list.find(l => l.uuid.startsWith(suffix))) ||
    cache.list.find(l => l.slug === token);
  if (!hit) return res.redirect(302, '/s');
  logClick(hit.uuid, token);
  return res.redirect(302, `/l/${hit.slug}/${hit.uuid}?ref=host-share`);
};
