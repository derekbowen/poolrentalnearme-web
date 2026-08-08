/**
 * The step map for the redesigned host onboarding flow.
 *
 * Pure data. No SDK calls, no reducers, no persistence — the shell reads this to
 * draw the progress bar and nothing else. Each step's `panel` names the EXISTING
 * wizard panel that will eventually do the saving, so the new UX stays an entry
 * layer over the current business logic rather than a second listing engine.
 *
 * `advanced-pricing` is a BRANCH, not a step: a host only sees it if they choose
 * "Customize pricing". It is listed here so the map is complete, but it is
 * excluded from the progress denominator — otherwise "Step 7 of 9" would be a
 * lie for the ~majority of hosts who never open it.
 */

export const WELCOME = 'welcome';

export const STEPS = [
  {
    id: 'about',
    heading: 'Tell us about your pool',
    sub: 'Guests see this first.',
    panel: 'EditListingDetailsPanel',
  },
  {
    id: 'location',
    heading: 'Where is your pool?',
    sub: 'Guests only see your city.',
    panel: 'EditListingLocationPanel',
  },
  {
    id: 'features',
    heading: 'What makes it great?',
    sub: 'Pick everything that applies.',
    panel: 'EditListingDetailsPanel',
  },
  {
    id: 'rules',
    heading: 'House rules & arrival',
    sub: 'Only the common ones up front.',
    panel: 'EditListingDetailsPanel',
  },
  {
    id: 'photos',
    heading: 'Show off your pool',
    sub: 'One photo is enough to start.',
    panel: 'EditListingPhotosPanel',
  },
  {
    id: 'pricing',
    heading: 'Set your hourly rate',
    sub: 'Most hosts start with one rate.',
    panel: 'EditListingPricingPanel',
  },
  {
    id: 'availability',
    heading: 'When can guests book?',
    sub: 'You can change this any time.',
    panel: 'EditListingAvailabilityPanel',
  },
  {
    id: 'review',
    heading: 'Ready to go live?',
    sub: 'Check it over, then publish.',
    panel: null,
  },
];

// Optional branch off the pricing step. Deliberately not part of STEPS.
export const ADVANCED_PRICING = {
  id: 'advanced-pricing',
  heading: 'Offer different rates',
  sub: 'Guests choose their rate when they book.',
  panel: 'EditListingPricingPanel',
};

export const TOTAL_STEPS = STEPS.length;

export const stepIndexById = (id) => {
  const i = STEPS.findIndex((s) => s.id === id);
  return i < 0 ? null : i + 1;
};

export const stepById = (id) => STEPS.find((s) => s.id === id) || null;
