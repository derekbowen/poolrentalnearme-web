// POST /api/ical/link  { listingId }  — owner-gated.
// Returns { enabled, url? } so the host UI can show/copy the current feed URL.
const { getSdk } = require('../api-util/sdk');
const integrationSdk = require('../api-util/integration');
const icalToken = require('../api-util/icalToken');
const { icalEnabledFor } = require('../api-util/icalFlag');

const ROOT = () =>
  process.env.REACT_APP_MARKETPLACE_ROOT_URL ||
  process.env.MARKETPLACE_ROOT_URL ||
  'https://www.poolrentalnearme.com';

function feedUrl(listingId, version) {
  const token = icalToken.sign(listingId, version);
  return `${ROOT().replace(/\/$/, '')}/api/ical/${listingId}/${token}.ics`;
}

module.exports = async (req, res) => {
  const { listingId } = req.body || {};
  if (!listingId) return res.status(400).json({ error: 'listingId is required' });
  if (!icalToken.configured() || !integrationSdk) return res.json({ enabled: false });

  const sdk = getSdk(req, res);
  try {
    await sdk.ownListings.show({ id: listingId }); // ownership gate
  } catch {
    return res.status(403).json({ error: 'Could not verify listing ownership.' });
  }

  try {
    const lres = await integrationSdk.listings.show({ id: listingId }, { allowRawResponse: true });
    const listing = lres._raw.data.data;
    const pd = (listing.attributes || {}).publicData || {};
    const version = Number.isInteger(pd.icalTokenVersion) ? pd.icalTokenVersion : icalToken.DEFAULT_VERSION;
    const authorId =
      listing.relationships && listing.relationships.author && listing.relationships.author.data
        ? listing.relationships.author.data.id.uuid
        : null;
    if (!icalEnabledFor({ listingId, authorId })) return res.json({ enabled: false });
    return res.json({ enabled: true, url: feedUrl(listingId, version) });
  } catch (e) {
    console.error('[ical-link]', e && e.message);
    return res.json({ enabled: false });
  }
};

module.exports.feedUrl = feedUrl;
