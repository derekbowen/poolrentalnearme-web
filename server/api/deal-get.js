const { getDeal } = require('./dealstore');

/**
 * GET /api/deal/:token   (public)
 *
 * Returns the display details of a package-deal link so the listing page can
 * show the guest the agreed price. Returns only what the guest needs — no host
 * PII. The authoritative price is re-read server-side at accept time.
 */
module.exports = async (req, res) => {
  try {
    const deal = await getDeal(req.params.token);
    if (!deal) {
      return res.status(404).json({ error: 'This deal link is invalid or has expired.' });
    }
    res.status(200).json({
      listingId: deal.listingId,
      priceCents: deal.negotiatedPriceCents,
      currency: deal.currency,
      note: deal.note,
    });
  } catch (e) {
    res.status(500).json({ error: 'Could not load this deal.' });
  }
};
