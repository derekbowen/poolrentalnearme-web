// "Text us" bubble: pure helpers with no React, CSS or content imports, so the
// root route can import the hide rules without pulling the bubble's chunk into
// the main bundle. Browser objects are passed in (default: window) so tests
// can supply their own.

// Routes where the bubble must not render: each has a payment form, a fixed
// booking/accept bar at the bottom of the screen, or a sticky order panel.
// Names are route `name`s from src/routing/routeConfiguration.js. NotFound
// (no name) shows the bubble.
export const HIDE_ON_ROUTES = Object.freeze([
  'CheckoutPage', // Stripe payment form
  'OrderDetailsPage', // TransactionPanel fixed action bar + message composer
  'SaleDetailsPage', // TransactionPanel fixed Accept/Decline bar
  'ListingPage', // OrderPanel fixed "Request to book" bar / sticky order panel
  'ListingPageVariant',
  'ListingPageCanonical',
  'PaymentMethodsPage', // Stripe card form
  'StripePayoutPage', // Stripe Connect payout form
  'StripePayoutOnboardingPage', // Stripe return
  'EditListingStripeOnboardingPage', // Stripe return inside the listing editor
]);

// Routes where the bubble is hidden only at COMPACT_QUERY widths.
//
// EditListingPage: every editor tab ends in a full-width submit button
// ("Save & continue" / "Publish", .submitButton in EditListingWizard/*Form.
// module.css) with `margin-top: auto`, so on short tabs the form's flex column
// parks that button at the bottom of the screen, exactly where the launcher
// sits. Extra bottom padding would only clear it once a LONG tab is scrolled
// to its very end; on short tabs, and mid-scroll, it would still be covered.
// Hiding is the only option that guarantees the button is never covered, and
// it matches what the page already does: BottomNav hides on this route for
// the same reason (BottomNav.js HIDE_ON_PAGES). Above 1024px the button is
// 241px wide in the right-hand form column, clear of the bottom-left launcher,
// so the bubble stays there.
export const HIDE_ON_COMPACT_ROUTES = Object.freeze(['EditListingPage']);

// Same raw query BottomNav.module.css uses for the mobile/tablet layout.
export const COMPACT_QUERY = '(max-width: 1024px)';

// `compact`: COMPACT_QUERY matches. `scrollLocked`: a Modal holds scroll lock
// (ducks/ui.duck isScrollingDisabled). See TextUsMount in AppRouter.jsx for why
// an open Modal hides the bubble.
export const shouldHide = (routeName, { compact = false, scrollLocked = false } = {}) => {
  if (scrollLocked) return true;
  if (!routeName) return false;
  if (HIDE_ON_ROUTES.includes(routeName)) return true;
  return compact && HIDE_ON_COMPACT_ROUTES.includes(routeName);
};

const defaultWindow = () => (typeof window === 'undefined' ? undefined : window);

// The .co.uk, .com.au and .ca hosts serve the whole site. A text from abroad
// to the US toll-free line usually fails, and PRNM cannot reply to non-US
// numbers (twsend is US 10DLC only), so those hosts never get the sms: link:
// they get the number plus "Email us" instead.
const INTL_HOST = /\.(co\.uk|com\.au|ca)$/;

export const isIntlHost = (hostname) =>
  INTL_HOST.test(
    String(hostname == null ? '' : hostname)
      .toLowerCase()
      .replace(/\.$/, '')
  );

const hostnameOf = (win) => {
  try {
    return (win && win.location && win.location.hostname) || '';
  } catch (e) {
    return '';
  }
};

export const isIntlSite = (win = defaultWindow()) => isIntlHost(hostnameOf(win));

// True when tapping "Text us" should open the visitor's SMS app: a phone or
// tablet on a US (.com) host. iPadOS reports a desktop Mac user agent but
// matches (pointer: coarse).
export const canSms = (win = defaultWindow()) => {
  if (!win) return false;
  if (isIntlSite(win)) return false;
  try {
    if (typeof win.matchMedia === 'function' && win.matchMedia('(pointer: coarse)').matches) {
      return true;
    }
  } catch (e) {
    // matchMedia unavailable: fall through to the user agent
  }
  const ua = (win.navigator && win.navigator.userAgent) || '';
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
};

// Analytics step names. The EAST marketing-site bubble sends exactly the same
// names (ops/east/text-us-bubble/text-us-bubble.tsx), so one Plausible goal
// covers both sites. Topic ids are the approved ids in textUsContent.js.
export const STEP = Object.freeze({
  open: () => 'open',
  role: (roleId) => `role:${roleId}`,
  topic: (topicId) => `topic:${topicId}`,
  sms: (topicId) => `sms:${topicId}`, // "Text us" opened the SMS app
  reveal: (topicId) => `reveal:${topicId}`, // "Text us" showed the number + Email us
  copy: (topicId) => `copy:${topicId}`,
  email: (topicId) => `email:${topicId}`,
});

// Optional analytics: only when Plausible is already on the page. Never loads
// a script, never throws.
export const track = (step, win = defaultWindow()) => {
  try {
    if (win && typeof win.plausible === 'function') {
      win.plausible('TextUs', { props: { step } });
    }
  } catch (e) {
    // analytics must never break the widget
  }
};
