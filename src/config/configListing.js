/////////////////////////////////////////////////////////
// Configurations related to listing.                  //
// Main configuration here is the extended data config //
/////////////////////////////////////////////////////////

// Note: The listingFields come from listingFields asset nowadays by default.
//       To use this built-in configuration, you need to change the overwrite from configHelper.js
//       (E.g. use mergeDefaultTypesAndFieldsForDebugging func)

/**
 * Configuration options for listing fields (custom extended data fields):
 * - key:                           Unique key for the extended data field.
 * - scope (optional):              Scope of the extended data can be either 'public' or 'private'.
 *                                  Default value: 'public'.
 *                                  Note: listing doesn't support 'protected' scope atm.
 * - schemaType (optional):         Schema for this extended data field.
 *                                  This is relevant when rendering components and querying listings.
 *                                  Possible values: 'enum', 'multi-enum', 'text', 'long', 'boolean'.
 * - enumOptions (optional):        Options shown for 'enum' and 'multi-enum' extended data.
 *                                  These are used to render options for inputs and filters on
 *                                  EditListingPage, ListingPage, and SearchPage.
 * - listingTypeConfig (optional):  Relationship configuration against listing types.
 *   - limitToListingTypeIds:         Indicator whether this listing field is relevant to a limited set of listing types.
 *   - listingTypeIds:                An array of listing types, for which this custom listing field is
 *                                    relevant and should be added. This is mandatory if limitToListingTypeIds is true.
 * - categoryConfig (optional):     Relationship configuration against categories.
 *   - limitToCategoryIds:            Indicator whether this listing field is relevant to a limited set of categories.
 *   - categoryIds:                   An array of categories, for which this custom listing field is
 *                                    relevant and should be added. This is mandatory if limitToCategoryIds is true.
 * - filterConfig:                  Filter configuration for listings query.
 *    - indexForSearch (optional):    If set as true, it is assumed that the extended data key has
 *                                    search index in place. I.e. the key can be used to filter
 *                                    listing queries (then scope needs to be 'public').
 *                                    Note: Sharetribe CLI can be used to set search index for the key:
 *                                    https://www.sharetribe.com/docs/references/extended-data/#search-schema
 *                                    Read more about filtering listings with public data keys from API Reference:
 *                                    https://www.sharetribe.com/api-reference/marketplace.html#extended-data-filtering
 *                                    Default value: false,
 *   - filterType:                    Sometimes a single schemaType can be rendered with different filter components.
 *                                    For 'enum' schema, filterType can be 'SelectSingleFilter' or 'SelectMultipleFilter'
 *   - label:                         Label for the filter, if the field can be used as query filter
 *   - searchMode (optional):         Search mode for indexed data with multi-enum schema.
 *                                    Possible values: 'has_all' or 'has_any'.
 *   - group:                         SearchPageWithMap has grouped filters. Possible values: 'primary' or 'secondary'.
 * - showConfig:                    Configuration for rendering listing. (How the field should be shown.)
 *   - label:                         Label for the saved data.
 *   - isDetail                       Can be used to hide detail row (of type enum, boolean, or long) from listing page.
 *                                    Default value: true,
 * - saveConfig:                    Configuration for adding and modifying extended data fields.
 *   - label:                         Label for the input field.
 *   - placeholderMessage (optional): Default message for user input.
 *   - isRequired (optional):         Is the field required for providers to fill
 *   - requiredMessage (optional):    Message for those fields, which are mandatory.
 */
export const listingFields = [
  // ─── Pool Characteristics (AI-populated) ───
  {
    key: 'poolType',
    scope: 'public',
    schemaType: 'enum',
    enumOptions: [
      { option: 'inground', label: 'Inground' },
      { option: 'above-ground', label: 'Above ground' },
      { option: 'natural', label: 'Natural / pond' },
      { option: 'infinity', label: 'Infinity edge' },
      { option: 'rooftop', label: 'Rooftop' },
      { option: 'indoor', label: 'Indoor' },
    ],
    filterConfig: {
      indexForSearch: true,
      filterType: 'SelectMultipleFilter',
      label: 'Pool type',
      group: 'primary',
    },
    showConfig: {
      label: 'Pool type',
      isDetail: true,
    },
    saveConfig: {
      label: 'Pool type',
      placeholderMessage: 'Select pool type…',
      isRequired: true,
      requiredMessage: 'Pool type is required.',
    },
  },
  {
    key: 'poolSize',
    scope: 'public',
    schemaType: 'enum',
    enumOptions: [
      { option: 'small', label: 'Small (up to 200 sq ft)' },
      { option: 'medium', label: 'Medium (200–400 sq ft)' },
      { option: 'large', label: 'Large (400–800 sq ft)' },
      { option: 'olympic', label: 'Olympic / XL (800+ sq ft)' },
    ],
    filterConfig: {
      indexForSearch: true,
      label: 'Pool size',
      group: 'secondary',
    },
    showConfig: {
      label: 'Pool size',
      isDetail: true,
    },
    saveConfig: {
      label: 'Pool size',
      placeholderMessage: 'Select pool size…',
      isRequired: false,
    },
  },
  {
    key: 'capacity',
    scope: 'public',
    schemaType: 'long',
    numberConfig: {
      minimum: 1,
      maximum: 50,
    },
    filterConfig: {
      indexForSearch: true,
      label: 'Guest capacity',
      group: 'secondary',
    },
    showConfig: {
      label: 'Max guests',
      isDetail: true,
    },
    saveConfig: {
      label: 'How many guests can your pool accommodate?',
      placeholderMessage: 'e.g. 10',
      isRequired: true,
      requiredMessage: 'Guest capacity is required.',
    },
  },
  {
    key: 'heated',
    scope: 'public',
    schemaType: 'boolean',
    filterConfig: {
      indexForSearch: true,
      label: 'Heated',
      group: 'primary',
    },
    showConfig: {
      label: 'Heated pool',
      isDetail: true,
    },
    saveConfig: {
      label: 'Is your pool heated?',
    },
  },
  {
    key: 'depth',
    scope: 'public',
    schemaType: 'text',
    showConfig: {
      label: 'Pool depth',
      isDetail: true,
    },
    saveConfig: {
      label: 'Pool depth range',
      placeholderMessage: 'e.g. 3ft – 8ft',
      isRequired: false,
    },
  },

  // ─── Amenities (AI-detected from photos) ───
  {
    key: 'amenities',
    scope: 'public',
    schemaType: 'multi-enum',
    enumOptions: [
      { option: 'hot-tub', label: 'Hot tub / spa' },
      { option: 'slide', label: 'Water slide' },
      { option: 'diving-board', label: 'Diving board' },
      { option: 'waterfall', label: 'Waterfall' },
      { option: 'grotto', label: 'Grotto' },
      { option: 'lounge-chairs', label: 'Lounge chairs' },
      { option: 'umbrellas', label: 'Umbrellas / shade' },
      { option: 'outdoor-shower', label: 'Outdoor shower' },
      { option: 'grill', label: 'Grill / BBQ' },
      { option: 'outdoor-kitchen', label: 'Outdoor kitchen' },
      { option: 'fire-pit', label: 'Fire pit' },
      { option: 'cabana', label: 'Cabana / gazebo' },
      { option: 'changing-room', label: 'Changing room' },
      { option: 'restroom', label: 'Restroom access' },
      { option: 'towels', label: 'Towels provided' },
      { option: 'wifi', label: 'WiFi' },
      { option: 'bluetooth-speaker', label: 'Bluetooth speaker' },
      { option: 'lighting', label: 'Pool lighting' },
      { option: 'landscaping', label: 'Landscaped yard' },
      { option: 'playground', label: 'Playground / kids area' },
    ],
    filterConfig: {
      indexForSearch: true,
      label: 'Amenities',
      searchMode: 'has_all',
      group: 'secondary',
    },
    showConfig: {
      label: 'Amenities',
    },
    saveConfig: {
      label: 'What amenities does your pool area have?',
      placeholderMessage: 'Select amenities…',
      isRequired: false,
    },
  },

  // ─── Safety Features (AI-detected) ───
  {
    key: 'safetyFeatures',
    scope: 'public',
    schemaType: 'multi-enum',
    enumOptions: [
      { option: 'fence', label: 'Pool fence' },
      { option: 'gate-lock', label: 'Self-closing / locking gate' },
      { option: 'pool-cover', label: 'Pool cover' },
      { option: 'alarm', label: 'Pool alarm' },
      { option: 'enclosure', label: 'Pool enclosure' },
      { option: 'shallow-entry', label: 'Shallow entry / beach entry' },
      { option: 'non-slip', label: 'Non-slip surfaces' },
      { option: 'life-ring', label: 'Life ring / safety equipment' },
      { option: 'first-aid', label: 'First aid kit' },
    ],
    filterConfig: {
      indexForSearch: true,
      label: 'Safety features',
      searchMode: 'has_any',
      group: 'secondary',
    },
    showConfig: {
      label: 'Safety features',
    },
    saveConfig: {
      label: 'What safety measures are in place?',
      placeholderMessage: 'Select safety features…',
      isRequired: false,
    },
  },

  // ─── Rules (AI-suggested based on pool type) ───
  {
    key: 'childrenAllowed',
    scope: 'public',
    schemaType: 'boolean',
    showConfig: {
      label: 'Children allowed',
      isDetail: true,
    },
    saveConfig: {
      label: 'Suitable for children (0–12 years)?',
    },
  },
  {
    key: 'eventsAllowed',
    scope: 'public',
    schemaType: 'boolean',
    filterConfig: {
      indexForSearch: true,
      label: 'Events allowed',
      group: 'primary',
    },
    showConfig: {
      label: 'Events allowed',
      isDetail: true,
    },
    saveConfig: {
      label: 'Do you allow events and parties?',
    },
  },
  {
    key: 'alcoholAllowed',
    scope: 'public',
    schemaType: 'boolean',
    showConfig: {
      label: 'Alcohol allowed',
      isDetail: true,
    },
    saveConfig: {
      label: 'Is alcohol allowed?',
    },
  },
  {
    key: 'petsAllowed',
    scope: 'public',
    schemaType: 'boolean',
    showConfig: {
      label: 'Pets allowed',
      isDetail: true,
    },
    saveConfig: {
      label: 'Are pets allowed?',
    },
  },
  {
    key: 'musicAllowed',
    scope: 'public',
    schemaType: 'boolean',
    showConfig: {
      label: 'Music allowed',
      isDetail: true,
    },
    saveConfig: {
      label: 'Is music permitted?',
    },
  },
  {
    key: 'smokingAllowed',
    scope: 'public',
    schemaType: 'boolean',
    showConfig: {
      label: 'Smoking allowed',
      isDetail: true,
    },
    saveConfig: {
      label: 'Is smoking allowed?',
    },
  },
  {
    key: 'maxGuests',
    scope: 'public',
    schemaType: 'long',
    numberConfig: {
      minimum: 1,
      maximum: 100,
    },
    showConfig: {
      label: 'Maximum guests',
      isDetail: true,
    },
    saveConfig: {
      label: 'Maximum number of guests per booking',
      placeholderMessage: 'e.g. 15',
      isRequired: false,
    },
  },
  {
    key: 'minimumNotice',
    scope: 'public',
    schemaType: 'long',
    numberConfig: {
      minimum: 0,
      maximum: 72,
    },
    showConfig: {
      label: 'Minimum notice (hours)',
      isDetail: true,
    },
    saveConfig: {
      label: 'Minimum notice period before booking (hours)',
      placeholderMessage: 'e.g. 4',
      isRequired: false,
    },
  },

  // ─── Listing Style Template ───
  {
    key: 'listingStyle',
    scope: 'public',
    schemaType: 'enum',
    enumOptions: [
      { option: 'clean', label: 'Clean & Modern' },
      { option: 'resort', label: 'Tropical Resort' },
      { option: 'luxury', label: 'Luxury Estate' },
      { option: 'party', label: 'Party Ready' },
      { option: 'family', label: 'Family Fun' },
      { option: 'bold', label: 'Unique & Bold' },
    ],
    filterConfig: {
      indexForSearch: false,
    },
    showConfig: {
      label: 'Listing Style',
      isDetail: false,
    },
    saveConfig: {
      label: 'Choose your listing style',
      placeholderMessage: 'Select a style…',
      isRequired: false,
    },
  },
];

///////////////////////////////////////////////////////////////////////
// Configurations related to listing types and transaction processes //
///////////////////////////////////////////////////////////////////////

// A presets of supported listing configurations
//
// Note 1: The listingTypes come from listingTypes asset nowadays by default.
//         To use this built-in configuration, you need to change the overwrite from configHelper.js
//         (E.g. use mergeDefaultTypesAndFieldsForDebugging func)
// Note 2: transaction type is part of listing type. It defines what transaction process and units
//         are used when transaction is created against a specific listing.

/**
 * Configuration options for listing experience:
 * - listingType:         Unique string. This will be saved to listing's public data on
 *                        EditListingWizard.
 * - label                Label for the listing type. Used as microcopy for options to select
 *                        listing type in EditListingWizard.
 * - transactionType      Set of configurations how this listing type will behave when transaction is
 *                        created.
 *   - process              Transaction process.
 *                          The process must match one of the processes that this client app can handle
 *                          (check src/util/transactions/transaction.js) and the process must also exists in correct
 *                          marketplace environment.
 *   - alias                Valid alias for the aforementioned process. This will be saved to listing's
 *                          public data as transctionProcessAlias and transaction is initiated with this.
 *   - unitType             Unit type is mainly used as pricing unit. This will be saved to
 *                          transaction's protected data.
 *                          Recommendation: don't use same unit types in completely different processes
 *                          ('item' sold should not be priced the same as 'item' booked).
 * - stockType            This is relevant only to listings using default-purchase process.
 *                        If set to 'oneItem', stock management is not showed and the listing is
 *                        considered unique (stock = 1).
 *                        Possible values: 'oneItem', 'multipleItems', 'infiniteOneItem', and 'infiniteMultipleItems'.
 *                        Default: 'multipleItems'.
 * - availabilityType     This is relevant only to listings using default-booking process.
 *                        If set to 'oneSeat', seat management is not showed and the listing is
 *                        considered per person (seat = 1).
 *                        Possible values: 'oneSeat' and 'multipleSeats'.
 *                        Default: 'oneSeat'.
 * - priceVariations      This is relevant only to listings using default-booking process.
 *   - enabled:             If set to true, price variations are enabled.
 *                          Default: false.
 * - defaultListingFields These are tied to transaction processes. Different processes have different flags.
 *                        E.g. default-inquiry can toggle price and location to true/false value to indicate,
 *                        whether price (or location) tab should be shown. If defaultListingFields.price is not
 *                        explicitly set to _false_, price will be shown.
 *                        If the location or pickup is not used, listing won't be returned with location search.
 *                        Use keyword search as main search type if location is not enforced.
 *                        The payoutDetails flag allows provider to bypass setting of payout details.
 *                        Note: customers can't order listings, if provider has not set payout details! Monitor
 *                        providers who have not set payout details and contact them to ensure that they add the details.
 */

export const listingTypes = [
  {
    listingType: 'daily-booking',
    label: 'Daily booking',
    transactionType: {
      process: 'default-booking',
      alias: 'default-booking/release-1',
      unitType: 'day',
    },
    availabilityType: 'oneSeat',
    // Enable host-defined price packages (Afternoon Dip / Pool Party / Full Day etc).
    // Backed by publicData.priceVariants — see server/api-util/lineItems.js.
    priceVariations: {
      enabled: true,
    },
    defaultListingFields: {
      location: true,
      payoutDetails: true,
    },
  },
  // // Here are some examples for other listingTypes
  // // TODO: SearchPage does not work well if both booking and product selling are used at the same time
  // {
  //   listingType: 'nightly-booking',
  //   label: 'Nightly booking',
  //   transactionType: {
  //     process: 'default-booking',
  //     alias: 'default-booking/release-1',
  //     unitType: 'night',
  //   },
  // },
  // {
  //   listingType: 'hourly-booking',
  //   label: 'Hourly booking',
  //   transactionType: {
  //     process: 'default-booking',
  //     alias: 'default-booking/release-1',
  //     unitType: 'hour',
  //   },
  // },
  // {
  //   listingType: 'product-selling',
  //   label: 'Sell bicycles',
  //   transactionType: {
  //     process: 'default-purchase',
  //     alias: 'default-purchase/release-1',
  //     unitType: 'item',
  //   },
  //   stockType: 'multipleItems',
  //   defaultListingFields: {
  //     shipping: true,
  //     pickup: true,
  //     payoutDetails: true,
  //   },
  // },
  // {
  //   listingType: 'inquiry',
  //   label: 'Inquiry',
  //   transactionType: {
  //     process: 'default-inquiry',
  //     alias: 'default-inquiry/release-1',
  //     unitType: 'inquiry',
  //   },
  //   defaultListingFields: {
  //     price: false,
  //     location: true,
  //   },
  // },
];

// SearchPage can enforce listing query to only those listings with valid listingType
// However, it only works if you have set 'enum' type search schema for the public data fields
//   - listingType
//
//  Similar setup could be expanded to 2 other extended data fields:
//   - transactionProcessAlias
//   - unitType
//
// Read More:
// https://www.sharetribe.com/docs/how-to/manage-search-schemas-with-flex-cli/#adding-listing-search-schemas
export const enforceValidListingType = true;

export const MINIMUM_AMENITIES = 5;

export const LISTING_TYPE_CONFIG = 'config';

export const LISTING_TYPE_HOURLY = 'hourly-pool';
// Listing fields that are excluded from the listing creation and search
// It can be the field's key or the function that takes the field's key as an argument
export const excludedListingFields = [
  // 'gears',
  // (key) => key === 'gears',
];
