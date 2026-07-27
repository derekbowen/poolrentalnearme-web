// POST /api/ical/regenerate  { listingId }  — owner-gated.
// Bumps publicData.icalTokenVersion (invalidates the old URL) and returns the new one.
const { getSdk } = require('../api-util/sdk');
const integrationSdk = require('../api-util/integration');
const icalToken = require('../api-util/icalToken');
const { icalEnabledFor } = require('../api-util/icalFlag');
const { feedUrl } = require('./ical-link');

module.exports = async (req, res) => {
  const { listingId } = req.body || {};
  if (!listingId) return res.status(400).json({ error: 'listingId is required' });
  if (!icalToken.configured() || !integrationSdk) {
    return res.status(503).json({ error: 'Calendar feeds are not enabled.' });
  }

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
    const authorId =
      listing.relationships && listing.relationships.author && listing.relationships.author.data
        ? listing.relationships.author.data.id.uuid
        : null;
    if (!icalEnabledFor({ listingId, authorId })) {
      return res.status(403).json({ error: 'Calendar feeds are not enabled for this listing.' });
    }
    const current = Number.isInteger(pd.icalTokenVersion) ? pd.icalTokenVersion : icalToken.DEFAULT_VERSION;
    const next = current + 1;
    await integrationSdk.listings.update({ id: listingId, publicData: { icalTokenVersion: next } });
    return res.json({ url: feedUrl(listingId, next), version: next });
  } catch (e) {
    console.error('[ical-regenerate]', e && e.message);
    return res.status(500).json({ error: 'Could not regenerate the link.' });
  }
};
