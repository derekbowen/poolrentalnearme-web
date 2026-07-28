// PRNM Host Preparedness & Issue Resolution Policy v2026.1 — source of record.
//
// Derived from the founder's draft. Every deviation from that draft is a
// correction of a statement the product does not currently support, or a
// conflict with Terms of Service v2026.1. The corrections, in order:
//
//   §3.1  "insurance eligibility" -> "eligibility under the Host Protection
//         Program". ToS §11.1 states PRNM is not an insurer; ToS §11.6 excludes
//         "injuries from overcrowding (exceeding Listing capacity)", so guest
//         count really does drive program eligibility — but not "insurance".
//   §3.2  Dropped "This authorization is disclosed and accepted at checkout."
//         There is no such disclosure anywhere in CheckoutPage or en.json.
//         Authorization is grounded in ToS §4.4 (card on file for post-rental
//         charges) plus acceptance of these Terms, which is true today.
//   §3.3  Dropped "processed automatically against the payment method on file."
//         The in-product additional-charge endpoint is not operational; the
//         charge is handled by support. Described the process that actually runs.
//   §5    "Voids insurance coverage" -> "Voids Host Protection Program
//         coverage", per ToS §11.1.
//   §6    States that claims are filed by email — no in-product claim form
//         exists. Separates the 72-hour damage/cleaning window from the ToS
//         §11.7 24-hour injury/incident window so the two documents agree, and
//         carries over the Guest's 48-hour response right from ToS §7.4.
//   §7.3  Added a narrow fraud / material-misrepresentation carve-out to the
//         no-clawback promise.
//   §9    Enforcement table rewritten as a list: the markdown pipeline has no
//         remark-gfm, so a pipe table renders as literal text.
//   §10   "0% host fees" -> no host service fee through December 31, 2026,
//         tied to the ToS §4.3 thirty-day notice requirement. NOTE: ToS §4.1
//         still reads "Host Service Fee: Ten percent (10%)" and needs a counsel
//         edit to match live pricing (provider commission is 0% today).
//   §11   14 days' notice -> 30 days, to match ToS §24 for material changes.
//
// Do not edit the policy text here without counsel review.
/* eslint-disable */
const HOST_PREPAREDNESS_2026_1 = `# HOST PREPAREDNESS & ISSUE RESOLUTION POLICY

## POOL RENTAL NEAR ME

**Published:** July 28, 2026
**Effective Date:** August 27, 2026
**Version:** 2026.1

---

> This policy forms part of the Pool Rental Near Me [Terms of Service](/terms-of-service) and is incorporated into it by reference. It applies to every Host who lists a property and every Guest who books one. By listing or booking on Pool Rental Near Me on or after the Effective Date, you agree to the terms below. Capitalized terms not defined here have the meanings given in the Terms of Service. Where this policy and the Terms of Service conflict, the Terms of Service control.

---

## 1. PURPOSE

Most problems on a marketplace like ours come from one of three things: a property that wasn't ready, a party that was bigger than the booking, or a disagreement handled in the wrong place at the wrong time.

This policy sets clear expectations for all three so Hosts get paid what they've earned, Guests get what they paid for, and neither party has to negotiate with the other in the middle of an event.

---

## 2. HOST PREPAREDNESS STANDARDS

Hosts are responsible for delivering the property in the condition their listing advertises. Before each booking begins, the Host must ensure the following.

### 2.1 Property readiness

- The pool and swim area are clean, safe, and ready for immediate use at the start of the reserved time.
- Trash, personal items, and debris are removed from the pool deck, lawn, and any Guest-accessible area.
- Surfaces the Guest is paying to use — tables, chairs, loungers, grills — are cleared and usable.
- Restroom facilities described in the listing are stocked, functional, and accessible.
- Entry instructions are accurate and the Guest can get in without assistance.

These standards are in addition to — not a substitute for — the mandatory pool safety requirements in Section 6 of the Terms of Service, including VGBA drain-cover compliance, barrier and gate requirements, water chemistry, and lifesaving equipment.

### 2.2 Amenity condition

Every amenity listed in your listing must be present and in working order at the start of the booking.

- **Shade structures.** If your listing advertises umbrellas, canopies, or covered areas, they must be intact, functional, and deployable by the Guest without repair or improvisation. Broken, damaged, or unusable shade must be removed from the listing or repaired before the next booking.
- **Furniture.** Damaged, unstable, or unsafe furniture must be removed from the Guest area.
- **Pool equipment and toys.** Items provided for Guest use must be clean and in good condition. Items not intended for Guest use must be stored away.
- **Pet items.** If your property is pet-friendly and you leave pet toys, bowls, waste bags, or equipment out as amenities, this must be **clearly stated in your listing description**. Guests who did not book expecting a pet-friendly environment may reasonably view unlisted pet items as uncleaned clutter.

### 2.3 Listing accuracy

Your listing is the contract. If a feature is listed, it must be delivered.

- Photos must reflect the property's current condition. Update photos when the property changes.
- Advertised amenities that are temporarily unavailable must be removed from the listing or disclosed to the Guest in writing before the booking begins.
- Maximum guest capacity, pet policy, glass policy, and any other house rules must be stated in the listing, not communicated for the first time on the day of the booking.

Listing accurately is also a Terms of Service obligation under Section 6.8, and the review-integrity rules in that Section apply in full.

### 2.4 Pre-booking documentation

Hosts are strongly encouraged to photograph the property immediately before each Guest arrives. These photos are the single most effective protection against condition disputes, and Pool Rental Near Me will use them to defend you.

---

## 3. GUEST COUNT AND PARTY SIZE

### 3.1 Guest obligation

The Guest must declare an accurate party size at the time of booking. The declared count includes every person who will be present at the property during the reserved time — adults, children, and non-swimmers alike.

Guest count is not a formality. It determines pricing and capacity limits, and it affects eligibility under the PRNM Host Protection Program: Section 11.6 of the Terms of Service excludes injuries arising from exceeding a Listing's stated capacity. Bringing undeclared guests can leave an incident uncovered.

Exceeding the maximum guest capacity stated in a Listing is separately prohibited by Sections 7.1 and 7.3 of the Terms of Service.

### 3.2 Additional guest charges

If more people are present than were declared at booking, the Host may request an additional guest charge for each undeclared attendee, at the per-guest rate stated in the listing.

Under Section 4.4 of the Terms of Service, a valid payment method must remain on file for thirty (30) days after a rental ends so that charges authorized by the Terms — including additional guest charges under this Section — can be processed. By completing a booking, the Guest agrees to these Terms and authorizes Pool Rental Near Me to charge the payment method on file for additional guests present beyond the declared count, subject to the review process in Section 3.3.

No additional guest charge is processed without review by Pool Rental Near Me.

### 3.3 The correct process

**Host:** Submit the additional guest charge request to Pool Rental Near Me support, with the booking reference and your evidence of the actual head count. Do not negotiate the amount directly with the Guest, and do not accept payment for it outside the platform.

**Pool Rental Near Me:** We review the request, contact the Guest, and process any supported charge to the payment method on file. The Guest receives a receipt showing the amount and the reason.

**Guest:** If you believe an additional guest charge is incorrect, contact Pool Rental Near Me support within 48 hours of the booking. Do not dispute it with the Host, and do not dispute it with your bank before contacting us. We review every disputed charge and reverse any that isn't supported by evidence.

---

## 4. HANDLING ISSUES DURING A BOOKING

This section is mandatory for Hosts. Violations are grounds for immediate suspension under Section 23.2 of the Terms of Service.

### 4.1 Hosts may not confront, threaten, or evict Guests

If a problem arises during an active booking — guest count, house rule violations, property concerns, payment issues — the Host must contact Pool Rental Near Me support immediately and allow us to resolve it.

Hosts may **not**:

- Threaten to end, cancel, or shorten a booking in progress
- Threaten to remove Guests from the property
- Send a representative, housesitter, neighbor, or third party to confront Guests during a booking
- Repeatedly message a Guest about a dispute while their event is underway
- Instruct a Guest that they must comply "immediately" or face consequences

A booking in progress is not the time to litigate a disagreement. We will resolve it, and we will protect the Host's revenue while doing so.

**Exception:** If there is an immediate safety emergency, property damage in progress, or illegal activity, the Host should contact emergency services first and Pool Rental Near Me immediately after.

### 4.2 Platform escalation

Contact us at **support@poolrentalnearme.com** or **(909) 272-8096**. We respond to active-booking issues as a priority.

When you escalate, provide:

- The booking reference
- What you observed and when
- Any photos or camera stills
- What outcome you're asking for

### 4.3 What we do

When a Host escalates during an active booking, Pool Rental Near Me will:

1. Contact the Guest directly on the Host's behalf
2. Review and process any supported additional charges
3. Document the issue for the transaction record
4. Protect the Host's payout while the matter is reviewed, as described in Section 7.3

The Host does not have to choose between being paid fairly and being a good host. That's our job.

---

## 5. PAYMENTS MUST STAY ON THE PLATFORM

All payments related to a booking — base rate, additional guests, additional hours, cleaning, damage — must be processed through Pool Rental Near Me.

Hosts may not request, and Guests may not offer, payment by cash, Venmo, Zelle, Cash App, check, wire, or any other method outside the platform, whether for the original booking or for any additional charge.

Off-platform payment:

- Voids PRNM Host Protection Program coverage for the booking, because Section 11.4 of the Terms of Service conditions coverage on compliance with Platform requirements
- Removes both parties' dispute protection
- Leaves no record if the transaction is later contested
- Is grounds for removal from the platform under Section 9 of the Terms of Service

If a platform payment fails or a feature isn't working, contact support. We will resolve it on our end. Do not route around the platform.

---

## 6. DAMAGE, CLEANING, AND INCIDENT CLAIMS

### 6.1 Filing a claim

Claims are filed by email to **support@poolrentalnearme.com**. There is no separate claim form; send us the booking reference and the documentation listed in Section 6.2 and we will open the claim.

Two different deadlines apply, and they are not interchangeable:

- **Property damage, excessive cleaning, or house rule violations:** report within **72 hours** of the booking end time. Claims submitted after 72 hours may not be eligible for reimbursement.
- **Bodily injury or any incident that may involve the PRNM Host Protection Program:** report within **24 hours** of the incident, as required by Section 11.7 of the Terms of Service. This deadline is shorter and it is strict.

If you are unsure which applies, report it within 24 hours and we will sort it out.

### 6.2 Required documentation

- Photos of the damage or condition
- Pre-booking photos of the same area, where available
- A repair estimate, receipt, or reasonable cost basis
- Any relevant camera footage or stills

### 6.3 Review

Pool Rental Near Me reviews each claim and communicates with both parties. Consistent with Section 7.4 of the Terms of Service, the Guest has **forty-eight (48) hours** to respond after notice of a damage claim. Where a claim is supported, we charge the Guest's payment method on file and remit to the Host. Where it isn't, we'll explain why. Vandalism claims require a police report filed by the Host.

---

## 7. PAYMENT DISPUTES AND CHARGEBACKS

### 7.1 Contact us first

Guests who believe a charge is incorrect must contact Pool Rental Near Me before contacting their bank or card issuer. Most disputes are resolved by us within one business day.

Initiating a chargeback without first contacting us may result in account suspension pending resolution.

### 7.2 Host cooperation

If a Guest disputes a charge, Pool Rental Near Me defends the transaction. Hosts agree to provide requested documentation within **48 hours** of our request, including:

- Photos and camera stills from the booking
- Pre-booking property photos
- A written account of what occurred

Hosts who provide documentation promptly are fully backed by us. Hosts who do not respond within 48 hours may be responsible for the disputed amount if the dispute is lost for lack of evidence.

### 7.3 Host payouts during a dispute

We do not claw back a Host's payout while a dispute is under review. Hosts who followed this policy — accurate listing, prepared property, correct escalation, documentation provided on time — will not lose their payout because a Guest disputed a charge. Where the card network reverses a charge in those circumstances, Pool Rental Near Me absorbs the loss.

This commitment does not apply where the booking was fraudulent, where the Host materially misrepresented the Listing or the condition of the property, or where the Host requested or accepted payment outside the platform.

---

## 8. PLATFORM FAILURES

If a Pool Rental Near Me system, feature, or payment function fails and causes a Host or Guest to lose money, we make it right on our end. Neither party is penalized for a failure that belongs to us.

Report platform failures to **support@poolrentalnearme.com**. Include the booking reference and what you were trying to do when it failed.

---

## 9. ENFORCEMENT

Violations of this policy are handled as follows.

- **Property not prepared to listing standard** — Written notice. Repeated violations lead to listing suspension.
- **Listing inaccuracy** — Required correction within 48 hours; suspension if uncorrected.
- **Confronting, threatening, or evicting a Guest mid-booking** — Immediate review; suspension or removal.
- **Requesting or accepting off-platform payment** — Removal from the platform.
- **Undeclared guests (Guest)** — Additional guest charge. Repeated violations lead to account suspension.
- **Chargeback filed without contacting support** — Account suspension pending resolution.
- **Failure to provide dispute documentation within 48 hours (Host)** — Host may bear the disputed amount.

Pool Rental Near Me reserves the right to remove any listing or account at its discretion where conduct puts Guests, Hosts, or the platform at risk, consistent with Section 23 of the Terms of Service.

---

## 10. OUR COMMITMENT TO HOSTS

Hosts are the reason this marketplace exists. Our commitments:

- **No host service fee through December 31, 2026.** Pool Rental Near Me currently charges Hosts no platform service fee on bookings — you keep what your listing earns. Any change to that is prospective only and takes at least thirty (30) days' advance notice under Section 4.3 of the Terms of Service.
- **We handle Guests.** Escalate to us and we'll take the conversation.
- **We defend your payout.** Follow this policy and we fight disputes on your behalf, as described in Section 7.3.
- **We own our failures.** When our software breaks, that's on us, not on you.
- **You can reach a human.** support@poolrentalnearme.com · (909) 272-8096

---

## 11. CHANGES TO THIS POLICY

We may update this policy as the platform evolves. Consistent with Section 24 of the Terms of Service, material changes will be communicated to active Hosts by email and by Platform notification at least **thirty (30) days** before taking effect, except where a shorter period is required to comply with law or to address an urgent safety or security issue. Continued use of the platform after the effective date constitutes acceptance.

---

## 12. QUESTIONS

- **Email:** support@poolrentalnearme.com
- **Phone:** (909) 272-8096
- **Web:** www.poolrentalnearme.com

**PRNM Corp, a Delaware corporation**
A subsidiary of 10,000 Solutions LLC

— *End of Host Preparedness & Issue Resolution Policy* —`;

export default HOST_PREPAREDNESS_2026_1;
