/**
 * Insurance disclosure components — the ONLY approved insurance copy in the app.
 *
 * Token substitution only. No hand-written insurance sentences anywhere else in
 * the codebase; if a sentence is needed that these do not produce, the sentence
 * gets added here after the wording is checked against the policy document, not
 * written inline at a call site.
 *
 * Every component fails closed. If the publish gate is shut, or a field this
 * component needs is missing, it renders nothing at all. A missing limit means
 * that clause is omitted - never substituted, never approximated.
 */
import React from 'react';
import { INSURANCE_CONFIG, insuranceIsPublishable, insuranceField } from '../../config/insurance.config';

// Shared guard. No component-level overrides, no exceptions.
const gateOpen = () => insuranceIsPublishable();

/**
 * Host-facing: listing dashboard / onboarding.
 * States plainly that this is platform coverage, that it does not replace the
 * host's own policy, and that it does not name the host as an insured party.
 */
export const HostInsuranceDisclosure = () => {
  if (!gateOpen()) return null;

  const carrier = insuranceField('carrier');
  const effective = insuranceField('effective_date');
  const expiration = insuranceField('expiration_date');
  const perOcc = insuranceField('limit_per_occurrence');
  const aggregate = insuranceField('limit_general_aggregate');

  // Every token in the sentence must be present, or the sentence is not true
  // as written and must not render.
  if (!carrier || !effective || !expiration || !perOcc || !aggregate) return null;

  const boundary = insuranceField('guest_injury_coverage_scope');

  return (
    <div data-testid="host-insurance-disclosure">
      <p>
        Pool Rental Near Me carries commercial general liability insurance through {carrier},
        effective {effective} through {expiration}, with limits of {perOcc} per occurrence and{' '}
        {aggregate} general aggregate.
      </p>
      <p>
        This is platform coverage. It is not a substitute for your own homeowners or landlord
        policy, and it does not name you as an insured party.
        {boundary ? ` ${boundary}` : null}
      </p>
    </div>
  );
};

/**
 * Guest-facing: booking flow. This is the whole guest-facing statement.
 * Do not extend it.
 */
export const GuestInsuranceDisclosure = () => {
  if (!gateOpen()) return null;

  const carrier = insuranceField('carrier');
  const perOcc = insuranceField('limit_per_occurrence');
  if (!carrier || !perOcc) return null;

  return (
    <p data-testid="guest-insurance-disclosure">
      Bookings on Pool Rental Near Me are made through a platform that carries commercial general
      liability insurance ({carrier}, {perOcc} per occurrence).
    </p>
  );
};

/**
 * Trust / about page: the host-facing statement plus the endorsement list,
 * rendered only from endorsements actually attached to the policy document.
 */
export const TrustInsuranceDisclosure = () => {
  if (!gateOpen()) return null;

  const host = <HostInsuranceDisclosure />;
  const endorsements = insuranceField('endorsements');

  return (
    <div data-testid="trust-insurance-disclosure">
      {host}
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

export default HostInsuranceDisclosure;
