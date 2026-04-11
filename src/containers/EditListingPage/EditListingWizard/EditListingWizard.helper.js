import { isFieldForCategory, isFieldForListingType, pickCategoryFields } from 'util/fieldHelpers';
import { createResourceLocatorString } from 'util/routes';
import {
  SCHEMA_TYPE_LONG,
  SCHEMA_TYPE_BOOLEAN,
  SCHEMA_TYPE_TEXT,
  SCHEMA_TYPE_MULTI_ENUM,
  SCHEMA_TYPE_ENUM,
  SCHEMA_TYPE_YOUTUBE,
} from 'util/types';
import { INQUIRY_PROCESS_NAME } from '../../../transactions/transaction';
import { extractYouTubeID } from 'util/string';

/**
 * Returns an array of tabs excluding the disallowed tabs.
 *
 * @param {Array<string>} currentTabs - The array of current tabs.
 * @param {Array<string>} [disallowedTabs = []] - The array of disallowed tabs.
 * @returns {Array} - The array of tabs excluding the disallowed tabs.
 */
const getTabs = (currentTabs, disallowedTabs = []) => {
  if (disallowedTabs.length === 0) {
    return currentTabs;
  }
  return currentTabs.filter((tab) => !disallowedTabs.includes(tab));
};

/**
 * Generates tabs for a listing type based on the current tabs, listing type configuration, and disallowed tabs.
 *
 * @param {Array} currentTabs - The current tabs.
 * @param {Object} listingTypeConfig - The listing type configuration.
 * @param {Object} getDisallowTabs - The factory function to get disallowed tabs.
 * @returns {Array} - The generated tabs for the listing type.
 */
export const tabsForListingType = (currentTabs, listingTypeConfig, getDisallowTabs = {}) => {
  const disallowedTabs = Object.entries(getDisallowTabs).reduce((acc, [tab, isTabDisallowed]) => {
    return isTabDisallowed(listingTypeConfig) ? [...acc, tab] : acc;
  }, []);

  return getTabs(currentTabs, disallowedTabs);
};

// Create return URL for the Stripe onboarding form
export const createReturnURL = (returnURLType, rootURL, routes, pathParams) => {
  const path = createResourceLocatorString(
    'EditListingStripeOnboardingPage',
    routes,
    { ...pathParams, returnURLType },
    {}
  );
  const root = rootURL.replace(/\/$/, '');
  return `${root}${path}`;
};

const hasValidYoutubeValue = (url) => !!extractYouTubeID(url);

const schemaValidators = {
  [SCHEMA_TYPE_ENUM]: (value, { enumOptions = [] }) => {
    const enumKeys = enumOptions.map((o) => o.option);
    return enumKeys.includes(value);
  },
  [SCHEMA_TYPE_MULTI_ENUM]: (values, { enumOptions = [] }) => {
    const enumKeys = enumOptions.map((o) => o.option);
    return values.every((v) => enumKeys.includes(v));
  },
  [SCHEMA_TYPE_TEXT]: (value) => {
    return typeof value === 'string';
  },
  [SCHEMA_TYPE_LONG]: (value) => {
    return typeof value === 'number' && Number.isInteger(value);
  },
  [SCHEMA_TYPE_BOOLEAN]: (value) => {
    return value === true || value === false;
  },
  [SCHEMA_TYPE_YOUTUBE]: (value) => {
    return typeof value === 'string' && hasValidYoutubeValue(value);
  },
};

/**
 * Validate listing fields (in extended data) that are included through configListing.js
 * This is used to check if listing creation flow can show the "next" tab as active.
 *
 * @param {Object} publicData
 * @param {Object} privateData
 * @param {Object} config
 */
export const hasValidListingFieldsInExtendedData = (publicData, privateData, config) => {
  const {
    categoryConfiguration: { key: categoryKey, categories: categoryOptions },
    listing: { listingFields },
  } = config;
  const categoriesObj = pickCategoryFields(publicData, categoryKey, 1, categoryOptions);
  const currentCategories = Object.values(categoriesObj);
  const isValidField = (fieldConfig, fieldData) => {
    const { key, schemaType, saveConfig = {} } = fieldConfig;
    const isTargetListingType = isFieldForListingType(publicData?.listingType, fieldConfig);

    const isTargetCategory = isFieldForCategory(currentCategories, fieldConfig);
    const isRequired = !!saveConfig.isRequired && isTargetListingType && isTargetCategory;

    if (!isRequired) {
      return true;
    }

    const savedListingField = fieldData[key];
    const validator = schemaValidators[schemaType] ?? (() => false);
    return validator(savedListingField, fieldConfig);
  };

  return listingFields.reduce((isValid, fieldConfig) => {
    const data = fieldConfig.scope === 'private' ? privateData : publicData;
    return isValid && isValidField(fieldConfig, data);
  }, true);
};

export const getListingTypeConfig = (listing, selectedListingType, config) => {
  const existingListingType = listing?.attributes?.publicData?.listingType;
  const validListingTypes = config.listing.listingTypes;
  const hasOnlyOneListingType = validListingTypes?.length === 1;

  const listingTypeMaybe = existingListingType ?? selectedListingType?.listingType;

  if (listingTypeMaybe) {
    return validListingTypes.find((conf) => conf.listingType === listingTypeMaybe);
  }

  if (hasOnlyOneListingType) {
    return validListingTypes[0];
  }

  return null;
};

export const getStripeAccountData = (stripeAccount) =>
  stripeAccount?.attributes?.stripeAccountData || null;

export const getBankAccountLast4Digits = (stripeAccountData) =>
  stripeAccountData?.external_accounts?.data?.[0]?.last4 || null;

export const hasRequirements = (stripeAccountData, requirementType) =>
  stripeAccountData?.requirements?.[requirementType]?.length > 0;

export const handleGetStripeConnectAccountLinkFn = (getLinkFn, commonParams) => (type) => () => {
  getLinkFn({ type, ...commonParams })
    .then((url) => {
      window.location.href = url;
    })
    .catch(console.error);
};

export const scrollToTab = (tabPrefix, tabId) => {
  const el = document.querySelector(`#${tabPrefix}_${tabId}`);
  if (el) {
    el.scrollIntoView({
      block: 'start',
      behavior: 'smooth',
    });
  }
};

export const getProcessName = ({
  transactionProcessAlias,
  validListingTypes = [],
  defaultProcessName = INQUIRY_PROCESS_NAME,
}) => {
  if (transactionProcessAlias) {
    return transactionProcessAlias.split('/')[0];
  }
  if (validListingTypes.length === 1) {
    return validListingTypes[0].transactionType.process;
  }
  return defaultProcessName;
};

// Check if the listing type and transaction process are in conflict
// it means that the existing listing has a different transaction process than the selected listing type
export const hasConflictTransactionProcess = ({ listingTypeConfig, transactionProcessAlias }) => {
  if (listingTypeConfig && transactionProcessAlias) {
    const { alias } = listingTypeConfig.transactionType;

    return alias !== transactionProcessAlias;
  }
  return false;
};
