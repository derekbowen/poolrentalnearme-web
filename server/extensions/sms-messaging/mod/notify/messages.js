// In-code SMS copy (per the 1C spec). Kept in code — not the Console
// SMS.Content.* keys — so notifications never depend on an unconfigured hosted
// asset again. Kept short; links are the only thing that push past 160 chars.

const ROOT = process.env.VITE_MARKETPLACE_ROOT_URL || 'https://www.poolrentalnearme.com';
const saleLink = txId => `${ROOT}/sale/${txId}`;
const orderLink = txId => `${ROOT}/order/${txId}`;

// "Sat Jul 12, 1–4pm"
const when = (booking, tz) => {
  const zone = tz || 'America/New_York';
  if (!booking?.start) return 'your requested time';
  try {
    const s = new Date(booking.start);
    const e = booking.end ? new Date(booking.end) : null;
    const day = s.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: zone });
    const t = d => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: d.getMinutes() ? '2-digit' : undefined, timeZone: zone }).replace(':00', '');
    const abbr = s.toLocaleTimeString('en-US', { timeZone: zone, timeZoneName: 'short' }).split(' ').pop();
    return e ? `${day}, ${t(s)}–${t(e)} ${abbr}` : `${day} ${t(s)} ${abbr}`;
  } catch (err) {
    return 'your requested time';
  }
};

const clip = (s, n) => {
  const str = String(s || '').replace(/\s+/g, ' ').trim();
  return str.length > n ? `${str.slice(0, n - 1)}…` : str;
};

// kind → (ctx) => string. ctx: { listing, booking, txId, guestName, hostName, snippet }
const TEMPLATES = {
  HOST_NEW_REQUEST: c =>
    `🏊 New booking request for ${clip(c.listing, 40)} — ${when(c.booking, c.tz)}. Guest already paid. Accept before it expires: ${saleLink(c.txId)}`,

  // Fires ONLY for message-less inquiries (poller skips it when the inquiry
  // carried a message — the 💬 NEW_MESSAGE text covers that case).
  INQUIRY_RECEIVED: c =>
    `🏊 ${c.guestName || 'A guest'} is interested in ${clip(c.listing, 40)} — they sent an inquiry without a message. Say hi and win the booking: ${saleLink(c.txId)}`,

  HOST_EXPIRING_SOON: c =>
    `⏰ Heads up — your booking request for ${clip(c.listing, 40)} expires in ~3 hrs. Accept or decline: ${saleLink(c.txId)}`,

  HOST_CANCELLED: c =>
    `❌ ${c.guestName || 'Your guest'} cancelled the booking for ${clip(c.listing, 40)} (${when(c.booking, c.tz)}).`,

  HOST_PAYOUT: c =>
    `💰 You've been paid for ${clip(c.listing, 45)}. Nice work! ${saleLink(c.txId)}`,

  GUEST_ACCEPTED: c =>
    `✅ Your booking for ${clip(c.listing, 40)} on ${when(c.booking, c.tz)} is confirmed! Details: ${orderLink(c.txId)}`,

  GUEST_DECLINED: c =>
    `Your request for ${clip(c.listing, 40)} wasn't accepted. Your card was only authorized, not charged — the hold releases automatically (your bank may show it pending a few days). ${orderLink(c.txId)}`,

  // c109: the guest paid and previously heard NOTHING until the host acted.
  GUEST_REQUEST_RECEIVED: c =>
    `🏊 Got your request for ${clip(c.listing, 40)} — ${when(c.booking, c.tz)}! ${c.hostName || 'The host'} has been notified and usually replies fast. Your card is only authorized until they accept. Track it: ${orderLink(c.txId)}`,

  // c109: cancels only texted the host; the guest could show up to a cancelled pool.
  GUEST_CANCELLED: c =>
    `❌ Your booking for ${clip(c.listing, 40)} (${when(c.booking, c.tz)}) was cancelled. Any charge is refunded automatically. Find another great pool: ${ROOT}`,

  // c109: day-before reminder, sent by sweepReminders.
  GUEST_REMINDER: c =>
    `🏊 Reminder: your swim at ${clip(c.listing, 40)} is tomorrow — ${when(c.booking, c.tz)}. Details & house rules: ${orderLink(c.txId)}. Have fun!`,

  // c154: review window opens at completion and quietly closes ~7 days later.
  GUEST_REVIEW_INVITE: c =>
    `⭐ How was your swim at ${clip(c.listing, 40)}? Reviews just opened — it takes a minute and means the world to ${c.hostName || 'your host'}. Leave yours: ${orderLink(c.txId)} (reviews close in 7 days)`,

  // c148: hosts previously got NO day-before reminder (guests only) - backwards.
  HOST_REMINDER: c =>
    `🏊 Reminder: ${c.guestName || 'your guest'} booked ${clip(c.listing, 40)} tomorrow — ${when(c.booking, c.tz)}. Time to get the pool ready! Details: ${saleLink(c.txId)}`,

  // Custom Offers — host sends a package deal from an inquiry thread.
  // OFFER_RECEIVED → guest; OFFER_ACCEPTED → host. offerAmount is a "$150" string.
  OFFER_RECEIVED: c =>
    `🏊 ${c.hostName || 'The host'} sent you a custom offer${c.offerAmount ? ` — ${c.offerAmount}` : ''} for ${clip(c.listing, 35)}. Review & accept: ${orderLink(c.txId)}`,

  OFFER_ACCEPTED: c =>
    `✅ ${c.guestName || 'Your guest'} accepted your ${c.offerAmount ? `${c.offerAmount} ` : ''}offer for ${clip(c.listing, 40)} — they're paying now. ${saleLink(c.txId)}`,

  // to whichever party did NOT send the message
  NEW_MESSAGE_TO_HOST: c =>
    `💬 New message about ${clip(c.listing, 35)} from ${c.guestName || 'a guest'}: "${clip(c.snippet, 80)}" Reply: ${saleLink(c.txId)}`,
  NEW_MESSAGE_TO_GUEST: c =>
    `💬 New message about ${clip(c.listing, 35)} from ${c.hostName || 'the host'}: "${clip(c.snippet, 80)}" Reply: ${orderLink(c.txId)}`,
};

const buildMessage = (kind, ctx) => {
  const t = TEMPLATES[kind];
  return t ? t(ctx) : null;
};

module.exports = { buildMessage, TEMPLATES };
