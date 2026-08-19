/**
 * Insurance disclosure components — the ONLY approved insurance copy in the app.
 *
 * Every sentence below is rendered from the APPROVED_COPY table in
 * src/config/insurance.config.js, which reproduces APPROVED-LANGUAGE.md. These
 * components choose WHICH approved sentence appears WHERE. They do not compose
 * insurance sentences of their own, and neither does any call site.
 *
 * If a sentence is needed that these do not produce, the wording is checked
 * against the policy, added to APPROVED_COPY, and used here — never written
 * inline somewhere else.
 *
 * Every component fails closed. If the publish gate is shut, or any token in an
 * approved sentence is missing, it renders nothing at all. A missing limit means
 * that clause is omitted — never substituted, never approximated.
 */
import React from 'react';
import { insuranceIsPublishable, insuranceField, insuranceCopy } from '../../config/insurance.config';

// Shared guard. No component-level overrides, no exceptions.
const gateOpen = () => insuranceIsPublishable();

/**
 * Host-facing: listing dashboard / onboarding.
 *
 * Two approved sentences, in this order: what the policy covers, then what the
 * host is responsible for. The second is not optional — a host who reads only
 * the first will assume they are covered, and they are not.
 */
export const HostInsuranceDisclosure = () => {
  if (!gateOpen()) return null;

  const whatThisCovers = insuranceCopy('host_faq_what_this_covers');
  const whatHostsCarry = insuranceCopy('host_faq_what_hosts_should_carry');
  if (!whatThisCovers || !whatHostsCarry) return null;

  const badge = insuranceCopy('trust_badge');

  return (
    <div data-testid="host-insurance-disclosure">
      {badge ? <p>{badge}</p> : null}
      <p>{whatThisCovers}</p>
      <p>{whatHostsCarry}</p>
    </div>
  );
};

/**
 * Guest-facing: booking flow. The trust badge alone, and nothing else.
 * Do not extend it. A guest is not an insured either.
 */
export const GuestInsuranceDisclosure = () => {
  if (!gateOpen()) return null;

  const badge = insuranceCopy('trust_badge');
  if (!badge) return null;

  return <p data-testid="guest-insurance-disclosure">{badge}</p>;
};

/**
 * Trust / about page: the full policy statement plus the host responsibility
 * line. The endorsement list renders only from INSURANCE_CONFIG.endorsements,
 * which is deliberately empty — see the note on that field.
 */
export const TrustInsuranceDisclosure = () => {
  if (!gateOpen()) return null;

  const trustPage = insuranceCopy('trust_page');
  const whatHostsCarry = insuranceCopy('host_faq_what_hosts_should_carry');
  if (!trustPage || !whatHostsCarry) return null;

  const endorsements = insuranceField('endorsements');

  return (
    <div data-testid="trust-insurance-disclosure">
      <p>{trustPage}</p>
      <p>{whatHostsCarry}</p>
      {Array.isArray(endorsements) && endorsements.length > 0 ? (
        <ul>
          {endorsements
            .filter(e => e && e.form_number && e.title)
            .map(e => (
              <li key={e.form_number}>
                {e.title} ({e.form_number})
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
};

/**
 * Response to a host or venue asking for a certificate of insurance.
 * Says what we can do without promising additional insured status, which
 * requires a written agreement executed before loss (CTF CW AIMPB 08 23).
 */
export const CertificateRequestDisclosure = () => {
  if (!gateOpen()) return null;

  const copy = insuranceCopy('certificate_requests');
  if (!copy) return null;

  return <p data-testid="certificate-request-disclosure">{copy}</p>;
};

export default HostInsuranceDisclosure;
