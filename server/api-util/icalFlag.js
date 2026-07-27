// Feature flag for iCal feeds. OFF unless ICAL_FEED_ENABLED=true.
// Optional ICAL_FEED_ALLOWLIST = comma-separated listing UUIDs and/or author
// UUIDs — when set, ONLY those are enabled (so we can ship to Jeremy first,
// then widen by clearing the allowlist). Empty allowlist + enabled = all.
const enabledGlobally = () => process.env.ICAL_FEED_ENABLED === 'true';

const allowlist = () =>
  (process.env.ICAL_FEED_ALLOWLIST || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

function icalEnabledFor({ listingId, authorId }) {
  if (!enabledGlobally()) return false;
  const list = allowlist();
  if (list.length === 0) return true;
  return list.includes(listingId) || (authorId && list.includes(authorId));
}

module.exports = { icalEnabledFor, enabledGlobally };
