/**
 * Client-error beacon for the listing wizard. The photo upload goes browser ->
 * Sharetribe API directly, so failures never touch our servers and were
 * invisible (a host says "it won't let me upload images" and there is nothing
 * to grep). The wizard now POSTs failures here.
 * Retrieve with: docker logs <container> | grep WIZARD_LOG
 * JSON body: { evt, message, meta } — all strings, truncated hard.
 */
const clean = (v, n) => (typeof v === 'string' ? v.replace(/[\r\n]+/g, ' ').slice(0, n) : '');

module.exports = (req, res) => {
  try {
    const { evt, message, meta } = req.body || {};
    const entry = {
      evt: clean(evt, 40) || 'unknown',
      message: clean(message, 300),
      meta: clean(meta, 300),
      ua: clean(req.headers['user-agent'], 140),
      at: new Date().toISOString(),
    };
    // eslint-disable-next-line no-console
    console.log('WIZARD_LOG ' + JSON.stringify(entry));
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(200).json({ ok: false });
  }
};
