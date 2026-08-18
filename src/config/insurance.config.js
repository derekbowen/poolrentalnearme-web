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
 * EVERY published value must trace to a specific line on the binder or
 * certificate. If a field cannot be pointed to on the document, it stays null
 * and it does not render.
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
  // certificate PDF, and the corrected named_insured endorsement is in hand.
  verified: false,
  verified_date: null, // ISO date of verification
  verified_against: null, // filename of the exact PDF checked

  // ---- POLICY IDENTITY ----
  named_insured: null, // BLOCKED - awaiting endorsement from the broker.
  //                      Current binder reads "Pool Rental Near Me"; this must
  //                      read the legal entity before publish.
  carrier: null, // exact carrier name as printed
  underwriter: null, // if carrier and underwriter differ, both
  policy_number: null, // internal record only - never rendered publicly
  policy_type: null, // e.g. "Commercial General Liability"

  // ---- TERM ----
  effective_date: null, // ISO
  expiration_date: null, // ISO

  // ---- LIMITS ----
  // Copy the exact figures off the declarations page. Do not round,
  // do not convert, do not describe.
  limit_per_occurrence: null,
  limit_general_aggregate: null,
  limit_products_completed_ops: null,
  limit_personal_advertising_injury: null,
  limit_damage_to_premises: null,
  limit_medical_expense: null,

  // ---- ENDORSEMENTS ----
  // Only list endorsements visibly attached to the policy document.
  // Each entry: { form_number, title }
  endorsements: [],

  // ---- SCOPE BOUNDARIES ----
  // What the policy does NOT do. Required, not optional.
  // Hosts will assume more coverage than exists unless told otherwise.
  covers_host_property_damage: null, // true/false
  covers_host_as_additional_insured: null, // true/false
  guest_injury_coverage_scope: null, // short factual description
  known_exclusions: [], // array of strings, from the policy

  // ---- BROKER ----
  broker_name: null,
  broker_agency: null,
  broker_contact: null, // internal only, never rendered
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

export default INSURANCE_CONFIG;
