/**
 * Extended-data search-param validation.
 *
 * WHY THIS EXISTS
 *
 * `SearchPage.duck.js` used to spread every leftover URL query param straight
 * into the listing query:
 *
 *     const { page = 1, address, origin, ...rest } = queryParams;
 *     searchListings({ ...rest, ... })
 *
 * The Sharetribe listing API silently ignores a `pub_*` / `meta_*` key that is
 * not indexed for search in the marketplace's listing-field configuration. So a
 * URL asking for a filter the marketplace cannot apply did not return "nothing
 * matches" — it returned the ENTIRE published catalogue, presented as if it were
 * the filtered result.
 *
 * Measured against production on 2026-09-04, with 124 published listings:
 *
 *     /s?pub_category=heated    -> 124 results   (no `category` field exists)
 *     /s?pub_category=indoor    -> 124 results
 *     /s?pub_category=banana    -> 124 results   (nonsense, same answer)
 *     /s                        -> 124 results
 *     /s?pub_poolAmenities=heated -> 44 results  (a real indexed field: correct)
 *
 * The homepage's "Browse by pool type" links point at the first two, so every
 * visitor clicking "Heated pools" saw all 124 pools — most of them not heated —
 * and every one of those sessions was recorded as a category search.
 *
 * THE RULE
 *
 * An extended-data param whose field is not indexed for search cannot be
 * honoured. Returning the unfiltered catalogue misrepresents the result, so the
 * search is refused instead: callers get `unknown` populated and should render
 * an empty result rather than issue the query. That matches what the API already
 * does one level down for an unknown VALUE on a known field
 * (`pub_poolAmenities=banana` -> "No results."), so the two cases stay
 * consistent instead of differing by which mistake you made.
 *
 * Non-extended-data params (bounds, keywords, sort, price, dates, pagination…)
 * are untouched — they are validated elsewhere and passing them through is the
 * existing, working behaviour.
 */

/** Params that address extended data, and are therefore config-driven. */
const EXTENDED_DATA_PREFIXES = ['pub_', 'meta_'];

export const isExtendedDataParam = (paramName) =>
  EXTENDED_DATA_PREFIXES.some((prefix) => paramName.startsWith(prefix));

/**
 * Query-param names for every listing field that is actually indexed for search.
 *
 * Built from the RUNTIME config, which in production is the hosted asset from
 * Console — not the local `configListing.js` fallback. That matters: a field can
 * exist in the local config and still be unqueryable in production. `poolType`
 * is exactly that case today, which is why `pub_poolType=indoor` returns the
 * full catalogue while `pub_poolAmenities=heated` correctly returns 44.
 */
export const indexedExtendedDataParamNames = (listingFieldsConfig = []) =>
  listingFieldsConfig
    .filter((field) => field?.filterConfig?.indexForSearch)
    .map((field) => `${field.scope === 'metadata' ? 'meta_' : 'pub_'}${field.key}`);

/**
 * Split search params into the ones that can be honoured and the extended-data
 * ones that cannot.
 *
 * @param {Object} params    leftover query params destined for searchListings
 * @param {Array}  indexed   output of indexedExtendedDataParamNames
 * @param {Array}  allowlist extended-data params handled outside listing-field
 *                           config (e.g. pub_listingType, the nested category
 *                           tree) which must keep working
 * @returns {{ valid: Object, unknown: string[] }}
 */
export const partitionExtendedDataParams = (params = {}, indexed = [], allowlist = []) => {
  const known = new Set([...indexed, ...allowlist]);
  const valid = {};
  const unknown = [];

  Object.entries(params).forEach(([name, value]) => {
    if (!isExtendedDataParam(name) || known.has(name)) {
      valid[name] = value;
      return;
    }
    // Nested category params (pub_categoryLevel1/2/3) are generated from the
    // category tree rather than from listingFields, so accept the whole family
    // when the tree's own param name is allowlisted.
    const isNestedCategory = allowlist.some(
      (allowed) => allowed.startsWith('pub_') && name.startsWith(allowed)
    );
    if (isNestedCategory) {
      valid[name] = value;
      return;
    }
    unknown.push(name);
  });

  return { valid, unknown };
};
