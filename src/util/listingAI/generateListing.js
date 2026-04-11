/**
 * AI Listing Generator — Orchestrator
 *
 * Client-side module that calls the server endpoint to generate
 * a complete listing from pool photos + address.
 */

/**
 * Generate a complete pool listing using AI photo analysis.
 *
 * @param {Object} params
 * @param {string[]} params.imageUrls - Array of uploaded image URLs
 * @param {string} params.address - Full address string
 * @param {string} params.city - City name
 * @param {string} params.state - State abbreviation
 * @param {Object} params.coordinates - { lat, lng }
 * @param {string} params.listingId - Listing UUID (for rate limiting)
 * @returns {Promise<Object>} Generated listing data
 */
export const generateListing = async ({ imageUrls, address, city, state, coordinates, listingId }) => {
  const response = await fetch('/api/generate-listing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      imageUrls,
      address,
      city,
      state,
      coordinates,
      listingId,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'AI generation failed' }));
    throw new Error(error.message || `AI generation failed: ${response.status}`);
  }

  return response.json();
};

/**
 * Mapping from AI output keys to Sharetribe publicData field keys.
 * Ensures the AI output shape matches what configListing.js expects.
 */
export const mapAIOutputToPublicData = (aiOutput) => {
  if (!aiOutput) return {};

  const publicData = {};

  // Direct mappings
  if (aiOutput.poolType) publicData.poolType = aiOutput.poolType;
  if (aiOutput.poolSize) publicData.poolSize = aiOutput.poolSize;
  if (aiOutput.capacity) publicData.capacity = aiOutput.capacity;
  if (typeof aiOutput.heated === 'boolean') publicData.heated = aiOutput.heated;
  if (aiOutput.depth) publicData.depth = aiOutput.depth;
  if (aiOutput.amenities?.length) publicData.amenities = aiOutput.amenities;
  if (aiOutput.safetyFeatures?.length) publicData.safetyFeatures = aiOutput.safetyFeatures;
  if (aiOutput.suggestedStyle) publicData.listingStyle = aiOutput.suggestedStyle;

  // Rules
  if (aiOutput.suggestedRules) {
    const rules = aiOutput.suggestedRules;
    if (typeof rules.childrenAllowed === 'boolean') publicData.childrenAllowed = rules.childrenAllowed;
    if (typeof rules.eventsAllowed === 'boolean') publicData.eventsAllowed = rules.eventsAllowed;
    if (typeof rules.alcoholAllowed === 'boolean') publicData.alcoholAllowed = rules.alcoholAllowed;
    if (typeof rules.petsAllowed === 'boolean') publicData.petsAllowed = rules.petsAllowed;
    if (typeof rules.musicAllowed === 'boolean') publicData.musicAllowed = rules.musicAllowed;
    if (typeof rules.smokingAllowed === 'boolean') publicData.smokingAllowed = rules.smokingAllowed;
    if (rules.maxGuests) publicData.maxGuests = rules.maxGuests;
    if (rules.minimumNotice) publicData.minimumNotice = rules.minimumNotice;
  }

  return publicData;
};

/**
 * Map AI output to the top-level listing fields (title, description, price).
 * These are separate from publicData in Sharetribe's data model.
 */
export const mapAIOutputToListingFields = (aiOutput) => {
  if (!aiOutput) return {};

  const fields = {};
  if (aiOutput.title) fields.title = aiOutput.title;
  if (aiOutput.description) fields.description = aiOutput.description;

  // Price comes from pricing suggestion (separate AI call or included)
  if (aiOutput.pricing?.suggestedRate) {
    // Sharetribe prices are in sub-units (cents for USD)
    fields.price = {
      amount: aiOutput.pricing.suggestedRate * 100,
      currency: 'USD',
    };
  }

  return fields;
};
