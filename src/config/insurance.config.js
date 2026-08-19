/**
 * PRNM Insurance Trust Layer — single source of truth.
 *
 * This is the ONLY place insurance values exist in this codebase. No insurance
 * strings anywhere else. Nothing insurance-related is written to Supabase;
 * components read this file at render time.
 *
 * WHY THIS EXISTS (June incident): insurance claims that matched no document
 * propagated across 6,386 Supabase rows, 7 generator prompt files, 9 Sharetribe
 * Console strings, Intercom articles, ToS language, and outbound press pitches.
 * Remediation took three phases. This file prevents recurrence structurally
 * rather than by discipline:
 *
 *   1. Single source of truth — this file.
 *   2. No database writes — nothing insurance-related enters Supabase.
 *   3. Fail closed — a missing or unverified field means the component does not
 *      render. Never a fallback string, never a default, never
 *      "coverage available."
 *
 * EVERY published value must trace to a specific line on the policy documents.
 * If a field cannot be pointed to on the document, it stays null and it does
 * not render.
 *
 * SOURCE: policy CSG-00536699-00, bound 2026-08-17, extracted to
 * policy-facts.json and reviewed against the coverage forms, endorsement
 * schedule, and declarations. Host-facing sentences come from
 * APPROVED-LANGUAGE.md and are reproduced verbatim in APPROVED_COPY below.
 *
 * Note on shape: the spec called for a .ts file with `as const`. This repo has
 * no TypeScript and no tsconfig, so `as const` would be stripped with no type
 * checking performed. Object.freeze gives actual runtime immutability instead,
 * which is the stronger guarantee here.
 */

/* eslint-disable */

const CONFIG = {
  // ---- PUBLISH GATE ----
  // Must be true for ANY insurance component to render.
  // Set to true only after every field below is verified against the
  // policy PDF, and the corrected named_insured endorsement is in hand.
  verified: false,
  verified_date: null, // ISO date of verification
  verified_against: null, // filename of the exact PDF checked

  // ---- POLICY IDENTITY ----
  // BLOCKED — the gate stays shut on this field alone.
  // The declarations issue the policy to the trade name "Pool Rental Near Me",
  // not to the contracting entity. The Terms of Service, the host agreement,
  // and the Stripe platform account are all PRNM Corp. A named insured that
  // does not match the entity in the contract is the kind of gap that gets
  // argued at claim time, so nothing renders until this is endorsed.
  named_insured: null,
  named_insured_as_issued: 'Pool Rental Near Me', // verbatim, declarations page
  named_insured_requested: 'PRNM Corp, a Delaware corporation', // per ToS §1
  named_insured_endorsement_status: 'requested_not_received',

  carrier: 'Spinnaker Insurance Company', // underwriter, as printed
  underwriter: 'Spinnaker Insurance Company',
  program_administrator: 'Coterie Insurance Agency, LLC',
  policy_number: 'CSG-00536699-00', // internal record only - never rendered publicly
  policy_type: 'Businessowners Policy (BOP)',
  base_form: 'BP 00 03 07 13',

  // ---- TERM ----
  effective_date: '2026-08-17', // 12:01 AM standard time at the business address
  expiration_date: '2027-08-17',

  // ---- LIMITS ----
  // Exact figures off the declarations page. Not rounded, not converted,
  // not described. Stored as display strings so no caller has to format them.
  limit_per_occurrence: '$2,000,000', // liability and medical expenses, per occurrence
  limit_general_aggregate: '$4,000,000', // aggregate other than products/completed ops
  limit_products_completed_ops: '$4,000,000',
  limit_personal_advertising_injury: null, // not stated separately on this BOP
  limit_damage_to_premises: '$50,000', // any one premises
  limit_medical_expense: '$5,000', // per person
  property_damage_liability_deductible: '$0',
  limits_are_eroding: true,
  eroding_note:
    'Each paid claim reduces the amount of insurance available during the annual period.',

  // ---- ENDORSEMENTS ----
  // Deliberately empty. TrustInsuranceDisclosure renders this list publicly,
  // and publishing the blanket additional-insured forms would read to a host as
  // "I am an additional insured" when the trigger requires a written agreement
  // executed before loss that no host has signed. The full schedule is on file
  // below for internal reference and does not render.
  endorsements: [],

  endorsements_on_file: [
    { form_number: 'CTF CW FREE 03 23', title: 'Freelance Limited Liability Coverage — deletes Section I Property in full' },
    { form_number: 'CTF CW ANTISTCK 03 21', title: 'Anti-Stacking — replaces Section III H.2 Other Insurance' },
    { form_number: 'BP 14 88 07 13', title: 'Primary and Noncontributory — Other Insurance Condition' },
    { form_number: 'CTF CW AIMPB 08 23', title: 'Additional Insured — Managers or Lessors of Premises (Blanket)' },
    { form_number: 'CTF CW AILEB 08 23', title: 'Additional Insured — Lessor of Leased Equipment (Blanket)' },
    { form_number: 'CTF CW AIOL 06 22', title: 'Additional Insured — Owners, Lessees or Contractors' },
    { form_number: 'CTF CW WAIVB 08 23', title: 'Waiver of Transfer of Rights of Recovery (Blanket)' },
  ],

  // ---- SCOPE BOUNDARIES ----
  // What the policy does NOT do. Required, not optional.
  // Hosts will assume more coverage than exists unless told otherwise.
  covers_host_property_damage: false, // Section I Property is deleted entirely
  covers_host_as_additional_insured: false, // no host meets the AIMPB trigger today
  covers_platform_operations: true,

  guest_injury_coverage_scope:
    "This is Pool Rental Near Me's own commercial liability policy. It covers the " +
    'platform’s operations. It is not a substitute for your homeowners or landlord ' +
    'policy, and it does not insure your property.',

  // Position in the tower. The declarations describe the business as excess,
  // but the operative Section III H.2 condition is narrower than that: Business
  // Liability is excess only over (a) insurance for direct physical loss or
  // damage, or (b) other primary insurance covering premises or operations for
  // which PRNM has been added as an additional insured. A host's homeowners
  // policy is neither. Do not describe this as sitting behind a host's policy.
  position_in_tower: 'excess_per_declarations_narrower_per_section_iii',
  position_caveat:
    'Section III H.2 is replaced by CTF CW ANTISTCK 03 21; the operative Other ' +
    'Insurance language is a broker and counsel question, not an assumption.',

  known_exclusions: [
    'Abuse or molestation, including negligent hiring, supervision, or retention (BP 04 39 07 02)',
    'Communicable disease, including failure to prevent spread (BP 14 86 07 13)',
    'Fungi or bacteria on or within a building or structure (BP 05 77 01 06)',
    'Total pollution — pool chemicals fall here (BP 04 92 07 02)',
    'Access or disclosure of confidential or personal information (BP 15 04 12 23)',
    'Cyber incident liability (BP 18 03 12 23)',
    'Violation of law addressing data privacy (BP 18 04 12 23)',
    'Unmanned aircraft (BP 15 11 12 16)',
    'Employment-related practices (BP 04 17 01 10)',
    'Cannabis liability (BP 15 32 09 19)',
  ],

  // ---- CLAIMS ----
  claims_fnol_phone: '855-680-2440', // internal reference
  claims_portal: 'https://coterieinsurance.com/',

  // ---- BROKER ----
  broker_name: 'Josh Dunmire',
  broker_agency: 'Undercard Group',
  broker_contact: 'Joshua@undercardgroup.com', // internal only, never rendered
};

/**
 * Host- and guest-facing sentences, reproduced verbatim from APPROVED-LANGUAGE.md.
 *
 * {carrier}, {perOccurrence}, {aggregate}, {administrator} are the only
 * substitutions permitted. No component may compose its own insurance sentence.
 * Adding a string here means the wording was checked against the policy first.
 */
const APPROVED_COPY = {
  trust_badge:
    'PRNM carries {perOccurrence} per-occurrence commercial general liability through {carrier}.',
  trust_page:
    'Pool Rental Near Me maintains a Businessowners Policy underwritten by {carrier} ' +
    'and administered by {administrator}. Limits: {perOccurrence} per occurrence / ' +
    '{aggregate} aggregate.',
  host_faq_what_this_covers:
    "This is Pool Rental Near Me's own commercial liability policy. It covers the " +
    'platform’s operations. It is not a substitute for your homeowners or landlord ' +
    'policy, and it does not insure your property.',
  host_faq_what_hosts_should_carry:
    'Hosts are responsible for their own coverage. We recommend confirming with your ' +
    'carrier that short-term pool rental is permitted under your policy before you ' +
    'accept bookings.',
  certificate_requests:
    'We can request a certificate of insurance from our broker. Additional insured ' +
    'status requires a written agreement executed before any loss and is reviewed ' +
    'case by case.',
};

// Deep freeze: nested arrays must not be mutable either, or a caller could push
// an endorsement that appears on the page without appearing on the document.
const deepFreeze = obj => {
  Object.getOwnPropertyNames(obj).forEach(k => {
    const v = obj[k];
    if (v && typeof v === 'object') deepFreeze(v);
  });
  return Object.freeze(obj);
};

export const INSURANCE_CONFIG = deepFreeze(CONFIG);
export const INSURANCE_COPY = deepFreeze(APPROVED_COPY);

/**
 * The gate every insurance component must pass before rendering anything.
 * Fails closed: unverified, or no confirmed named insured, means render nothing.
 */
export const insuranceIsPublishable = () =>
  INSURANCE_CONFIG.verified === true && !!INSURANCE_CONFIG.named_insured;

/**
 * Read a single field only when the gate is open AND that field has a real
 * value. Returns null otherwise, so a caller can omit the line rather than
 * substitute or approximate it.
 */
export const insuranceField = name => {
  if (!insuranceIsPublishable()) return null;
  const v = INSURANCE_CONFIG[name];
  if (v === null || v === undefined || v === '') return null;
  if (Array.isArray(v) && v.length === 0) return null;
  return v;
};

/**
 * Render one approved sentence. Returns null if the gate is shut, if the key is
 * not an approved string, or if ANY token in that string has no value — a
 * half-filled sentence is a false sentence.
 */
export const insuranceCopy = key => {
  if (!insuranceIsPublishable()) return null;
  const template = INSURANCE_COPY[key];
  if (!template) return null;

  const tokens = {
    carrier: insuranceField('carrier'),
    administrator: insuranceField('program_administrator'),
    perOccurrence: insuranceField('limit_per_occurrence'),
    aggregate: insuranceField('limit_general_aggregate'),
  };

  const needed = template.match(/\{(\w+)\}/g) || [];
  for (const t of needed) {
    if (!tokens[t.slice(1, -1)]) return null;
  }
  return template.replace(/\{(\w+)\}/g, (_, k) => tokens[k]);
};

export default INSURANCE_CONFIG;
