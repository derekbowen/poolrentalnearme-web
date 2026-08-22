/**
 * Canonical staff alert recipients.
 *
 * WHY THIS FILE EXISTS: staff phone numbers were duplicated across the box in
 * places the repo could not see - routing.js carried Derek via
 * CAMPAIGN_FORWARD_TO, while /home/ubuntu/stuck-detector/stuck-detector.js
 * carried `const AGENTS=['+19092728096','+19099177098']; // Derek, Brandon`.
 * Anything new that needed to page the team had to rediscover them. This is now
 * the one place, and new alerting code should import from here rather than
 * pasting a number.
 *
 * Resolution order per person: environment variable first, so a number can be
 * rotated without a deploy, then the value already in production use.
 *
 * NOTE ON BRANDON: the Supabase `route_config` row `brandon_number` is a
 * DIFFERENT setting - it controls whether inbound host conversations round-robin
 * to Brandon, and it is currently "off". That does not mean Brandon should not
 * receive staff alerts; the stuck-detector has been paging both numbers all
 * along. Do not conflate the two.
 */

const DEREK = process.env.CAMPAIGN_FORWARD_TO || '+19092728096';
const BRANDON = process.env.PRNM_BRANDON_PHONE || '+19099177098';

/** Everyone who should receive operational staff alerts. */
const STAFF_ALERT_RECIPIENTS = [
  { name: 'Derek', phone: DEREK },
  { name: 'Brandon', phone: BRANDON },
];

/**
 * Returns the recipients, or throws with a clear blocker if a number is missing
 * or malformed. Callers that page the team should fail loudly rather than
 * silently notifying half the team - a half-delivered alert reads as "all
 * clear" to whoever did not get it.
 */
const resolveStaffRecipients = () => {
  const bad = STAFF_ALERT_RECIPIENTS.filter(r => !/^\+1\d{10}$/.test(r.phone || ''));
  if (bad.length) {
    throw new Error(
      'staff recipient unresolved: ' + bad.map(b => `${b.name}=${b.phone || '(unset)'}`).join(', ')
    );
  }
  return STAFF_ALERT_RECIPIENTS;
};

module.exports = { STAFF_ALERT_RECIPIENTS, resolveStaffRecipients };
