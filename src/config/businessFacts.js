/**
 * Approved business facts — the ONE reviewed source for numbers and policy
 * statements that appear in customer-facing copy.
 *
 * Every value here traces to an authoritative document. Nothing in this file
 * is a marketing estimate. If a fact is not here, it is not approved for
 * copy: the 2026-09-01 SEO audit found the same fee stated as 0%, 10% and
 * "after 15%" on different pages, five mutually incompatible "typical host
 * earnings" figures, and two different free-cancellation windows — none of
 * them traceable to product logic. Copy must import from here, never hard-
 * code, and server/api-util/businessFacts.test.js fails the build if the
 * marketplace's own translation strings drift from these values.
 *
 * Authority column: ToS = Terms of Service 2026.3 (effective 2026-05-06,
 * updated 2026-08-17) in src/containers/TermsOfServicePage/terms-2026-1.js.
 */

const BUSINESS_FACTS = Object.freeze({
  fees: Object.freeze({
    /** ToS §4.1: "Host Service Fee: Zero percent (0%)". */
    hostServiceFeePercent: 0,
    /** ToS §4.1: "Renter Service Fee: Fifteen percent (15%) of the gross Booking amount". */
    renterServiceFeePercent: 15,
    /** ToS §4.1: hosts "receive one hundred percent (100%) of their listed Booking price". */
    hostKeepsPercent: 100,
    /** ToS §4.2: the renter sees the all-in price before payment. */
    allInPricingShownBeforePayment: true,
    authority: 'ToS 2026.3 §4.1–4.2',
  }),

  waivers: Object.freeze({
    /** ToS §8.1: every Swimmer must execute the PRNM waiver before entering a Pool Space. */
    guestWaiverRequiredPerBooking: true,
    authority: 'ToS 2026.3 §8.1',
  }),

  insurance: Object.freeze({
    /**
     * Deliberately NOT a fact. Insurance and liability statements are
     * founder-reviewed per house rule 8; copy may not derive them from code.
     * Any page needing one must be reviewed by Derek and cite the reviewed
     * text verbatim. This key exists so a grep for "insurance" lands here.
     */
    approvedStatement: null,
    authority: 'Derek Bowen (house rule 8) — never inferred',
  }),

  /**
   * Explicitly unapproved. These were live in copy on 2026-09-01 with no
   * source. Keeping the list here is the audit trail for removing them.
   * The only carve-out from any entry is listed in `approvedExceptions`.
   */
  notApproved: Object.freeze([
    'typical host earnings per month or per year (any figure)',
    'payout speed ("24 hours", "instant")',
    'a platform-wide free-cancellation window (policies are per listing)',
    '"24/7 support line" and any support phone number',
    'city / host / customer / course counts',
    'a starting price per hour ("Starting at $25/hour")',
  ]),

  /**
   * The ONE phone number approved for customer-facing copy, and only where
   * `approvedFor` says. Derek Bowen approved it on 2026-11-05 for the "Text us"
   * help bubble: a visitor taps "Text us" and either their SMS app opens
   * addressed to this line or the number is shown with Copy and "Email us".
   *
   * It is approved as that widget's TEXT line only. It is not approved as a
   * "24/7 support line", as a number to call, or on any other surface; every
   * other phone number in copy remains unapproved (notApproved above).
   *
   * Stored in pieces so the number never appears as one string in page HTML
   * or in the client bundle; src/components/TextUsBubble/textUsContent.js joins
   * them only when a visitor taps "Text us".
   */
  textUsLine: Object.freeze({
    e164Parts: Object.freeze(['+1', '855', '617', '82', '07']),
    approvedFor: 'src/components/TextUsBubble/ ("Text us" help bubble), text only',
    approvedBy: 'Derek Bowen',
    approvedOn: '2026-11-05',
  }),

  /**
   * Narrow, dated carve-outs from `notApproved`. Each names the entry it
   * narrows, exactly what is allowed, who approved it and when. An entry here
   * never widens beyond its `allows` text.
   */
  approvedExceptions: Object.freeze([
    Object.freeze({
      notApproved: '"24/7 support line" and any support phone number',
      allows: 'textUsLine, shown only by the "Text us" help bubble, as a number to text',
      approvedBy: 'Derek Bowen',
      approvedOn: '2026-11-05',
    }),
  ]),
});

export default BUSINESS_FACTS;
