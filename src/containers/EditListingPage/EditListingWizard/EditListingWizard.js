import React, { Component } from 'react';
import classNames from 'classnames';

// Import configs and util modules
import Modal from 'components/Modal/Modal';
import IdentityVerificationGate from '../../CheckoutPage/IdentityVerificationGate';
import useMediaQuery from 'hooks/useMediaQuery';
import { useConfiguration } from 'context/configurationContext';
import { useRouteConfiguration } from 'context/routeConfigurationContext';
import { FormattedMessage, useIntl } from 'util/reactIntl';
import {
  displayDeliveryPickup,
  displayDeliveryShipping,
  displayLocation,
  displayPrice,
  requirePayoutDetails,
} from 'util/configHelpers';
import { LISTING_PAGE_PARAM_TYPE_DRAFT, LISTING_PAGE_PARAM_TYPE_NEW } from 'util/urlHelpers';
import { ensureCurrentUser, ensureListing } from 'util/data';
import {
  Heading,
  NamedRedirect,
  Tabs,
  StripeConnectAccountStatusBox,
  StripeConnectAccountForm,
} from 'components';
import {
  INQUIRY_PROCESS_NAME,
  isBookingProcess,
  isPurchaseProcess,
} from '../../../transactions/transaction';

// Import modules from this directory
import EditListingWizardTab, {
  DETAILS,
  PRICING,
  PRICING_AND_STOCK,
  DELIVERY,
  LOCATION,
  AVAILABILITY,
  PHOTOS,
} from './EditListingWizardTab';
import {
  createReturnURL,
  getBankAccountLast4Digits,
  getListingTypeConfig,
  getProcessName,
  getStripeAccountData,
  handleGetStripeConnectAccountLinkFn,
  hasConflictTransactionProcess,
  hasRequirements,
  hasValidListingFieldsInExtendedData,
  scrollToTab,
  tabsForListingType,
} from './EditListingWizard.helper';
import RedirectToStripe from './RedirectToStripe';

import css from './EditListingWizard.module.css';

// You can reorder these panels.
// Note 1: You need to change save button translations for new listing flow
// Note 2: Ensure that draft listing is created after the first panel
//         and listing publishing happens after last panel.
// Note 3: The first tab creates a draft listing and title is mandatory attribute for it.
//         Details tab asks for "title" and is therefore the first tab in the wizard flow.
const TABS_DETAILS_ONLY = [DETAILS];
const TABS_PRODUCT = [DETAILS, PRICING_AND_STOCK, DELIVERY, PHOTOS];
const TABS_BOOKING = [DETAILS, LOCATION, PRICING, AVAILABILITY, PHOTOS];
const TABS_INQUIRY = [DETAILS, LOCATION, PRICING, PHOTOS];
const TABS_ALL = [...TABS_PRODUCT, ...TABS_BOOKING, ...TABS_INQUIRY];

// Tabs are horizontal in small screens
const MAX_HORIZONTAL_NAV_SCREEN_WIDTH = 1023;

const STRIPE_ONBOARDING_RETURN_URL_SUCCESS = 'success';
const STRIPE_ONBOARDING_RETURN_URL_FAILURE = 'failure';

/**
 * Return translations for wizard tab: label and submit button.
 *
 * @param {Object} intl
 * @param {string} tab name of the tab/panel in the wizard
 * @param {boolean} isNewListingFlow
 * @param {string} processName
 */
const tabLabelAndSubmit = (intl, tab, isNewListingFlow, isPriceDisabled, processName) => {
  const processNameString = isNewListingFlow ? `${processName}.` : '';
  const newOrEdit = isNewListingFlow ? 'new' : 'edit';

  let labelKey = null;
  let submitButtonKey = null;
  switch (tab) {
    case DETAILS:
      labelKey = 'EditListingWizard.tabLabelDetails';
      submitButtonKey = `EditListingWizard.${processNameString}${newOrEdit}.saveDetails`;
      break;
    case PRICING:
      labelKey = 'EditListingWizard.tabLabelPricing';
      submitButtonKey = `EditListingWizard.${processNameString}${newOrEdit}.savePricing`;
      break;
    case PRICING_AND_STOCK:
      labelKey = 'EditListingWizard.tabLabelPricingAndStock';
      submitButtonKey = `EditListingWizard.${processNameString}${newOrEdit}.savePricingAndStock`;
      break;
    case DELIVERY:
      labelKey = 'EditListingWizard.tabLabelDelivery';
      submitButtonKey = `EditListingWizard.${processNameString}${newOrEdit}.saveDelivery`;
      break;
    case LOCATION:
      labelKey = 'EditListingWizard.tabLabelLocation';
      submitButtonKey =
        isPriceDisabled && isNewListingFlow
          ? `EditListingWizard.${processNameString}${newOrEdit}.saveLocationNoPricingTab`
          : `EditListingWizard.${processNameString}${newOrEdit}.saveLocation`;
      break;
    case AVAILABILITY:
      labelKey = 'EditListingWizard.tabLabelAvailability';
      submitButtonKey = `EditListingWizard.${processNameString}${newOrEdit}.saveAvailability`;
      break;
    case PHOTOS:
      labelKey = 'EditListingWizard.tabLabelPhotos';
      submitButtonKey = `EditListingWizard.${processNameString}${newOrEdit}.savePhotos`;
      break;
    default:
      console.warn(`Unknown tab: ${tab}`);
  }

  return {
    label: intl.formatMessage({ id: labelKey }),
    submitButton: intl.formatMessage({ id: submitButtonKey }),
  };
};

const tabCompletionValidators = {
  [DETAILS]: (listing, config) => {
    const { description, title, publicData = {}, privateData = {} } = listing.attributes;
    const { listingType, transactionProcessAlias, unitType } = publicData;

    return !!(
      description &&
      title &&
      listingType &&
      transactionProcessAlias &&
      unitType &&
      hasValidListingFieldsInExtendedData(publicData, privateData, config)
    );
  },
  [PRICING]: (listing) => {
    const { price } = listing.attributes;
    return !!price;
  },
  [PRICING_AND_STOCK]: (listing) => {
    const { price } = listing.attributes;
    return !!price;
  },
  [DELIVERY]: (listing) => {
    const { publicData = {} } = listing.attributes;
    const { shippingEnabled, pickupEnabled } = publicData;
    return !!(shippingEnabled || pickupEnabled);
  },
  [LOCATION]: (listing) => {
    const { geolocation, publicData = {} } = listing.attributes;
    const { location } = publicData;
    return !!(geolocation && location?.address);
  },
  [AVAILABILITY]: (listing) => {
    const { availabilityPlan } = listing.attributes;
    return !!availabilityPlan;
  },
  [PHOTOS]: (listing) => {
    const { images } = listing;
    return images && images.length > 0;
  },
  // Add more tab completion checkers here
};

/**
 * Check if a wizard tab is completed.
 *
 * @param tab wizard's tab
 * @param listing is contains some specific data if tab is completed
 *
 * @return true if tab / step is completed.
 */
const tabCompleted = (tab, listing, config) => {
  const validate = tabCompletionValidators[tab] || (() => false);
  return validate(listing, config);
};

/**
 * Check which wizard tabs are active and which are not yet available. Tab is active if previous
 * tab is completed. In edit mode all tabs are active.
 *
 * @param isNew flag if a new listing is being created or an old one being edited
 * @param listing data to be checked
 * @param tabs array of tabs used for this listing. These depend on transaction process.
 *
 * @return object containing activity / editability of different tabs of this wizard
 */
const tabsActive = (isNew, listing, tabs, config) => {
  const hasListingType = !!listing?.attributes?.publicData?.listingType;
  return tabs.reduce((acc, tab, currentIndex) => {
    const previousTabIndex = currentIndex - 1;
    let isActive = true;
    if (previousTabIndex >= 0) {
      if (!isNew) {
        isActive = hasListingType;
      } else {
        isActive = tabCompleted(tabs[previousTabIndex], listing, config);
      }
    }
    return { ...acc, [tab]: isActive };
  }, {});
};

const getTabs = ({
  isNewListingFlow,
  invalidExistingListingType,
  hasListingTypeSelected,
  processName,
  listingTypeConfig,
  isConflictTransactionProcess,
}) => {
  if (
    invalidExistingListingType ||
    (isNewListingFlow && !hasListingTypeSelected) ||
    isConflictTransactionProcess
  ) {
    return TABS_DETAILS_ONLY;
  }
  if (isBookingProcess(processName)) {
    return tabsForListingType(TABS_BOOKING, listingTypeConfig, {
      [LOCATION]: (listingConfig) => !displayLocation(listingConfig),
    });
  }
  if (isPurchaseProcess(processName)) {
    return tabsForListingType(TABS_PRODUCT, listingTypeConfig, {
      [DELIVERY]: (listingConfig) =>
        !displayDeliveryPickup(listingConfig) && !displayDeliveryShipping(listingConfig),
    });
  }
  return tabsForListingType(TABS_INQUIRY, listingTypeConfig, {
    [LOCATION]: (listingConfig) => !displayLocation(listingConfig),
    [PRICING]: (listingConfig) => !displayPrice(listingConfig),
  });
};

/**
 * EditListingWizard is a component that renders the tabs that update the different parts of the listing.
 * It also handles the payout details modal and the Stripe onboarding form if the listing is a new one.
 * TODO: turn this into a functional component
 *
 * @component
 * @param {Object} props - The props object
 * @param {string} props.id - The id of the listing
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {string} [props.rootClassName] - Custom class that overrides the default class for the root element
 * @param {Object} props.config - The config object
 * @param {Object} props.routeConfiguration - The route configuration object
 * @param {Object} props.params - The params object
 * @param {string} props.params.id - The id of the listing
 * @param {string} props.params.slug - The slug of the listing
 * @param {'new'|'draft'|'edit'} props.params.type - The type of the listing
 * @param {DETAILS | PRICING | PRICING_AND_STOCK | DELIVERY | LOCATION | AVAILABILITY | PHOTOS} props.params.tab - The name of the tab
 * @param {propTypes.ownListing} props.listing - The listing object
 * @param {propTypes.error} [props.errors.createListingDraftError] - The error object for createListingDraft
 * @param {propTypes.error} [props.errors.publishListingError] - The error object for publishListing
 * @param {propTypes.error} [props.errors.updateListingError] - The error object for updateListing
 * @param {propTypes.error} [props.errors.showListingsError] - The error object for showListings
 * @param {propTypes.error} [props.errors.uploadImageError] - The upload image error object
 * @param {propTypes.error} [props.errors.createStripeAccountError] - The error object for createStripeAccount
 * @param {propTypes.error} [props.errors.addExceptionError] - The error object for addException
 * @param {propTypes.error} [props.errors.deleteExceptionError] - The error object for deleteException
 * @param {propTypes.error} [props.errors.setStockError] - The error object for setStock
 * @param {boolean} props.fetchInProgress - Whether the fetch is in progress
 * @param {boolean} props.getAccountLinkInProgress - Whether the get account link is in progress
 * @param {boolean} props.payoutDetailsSaveInProgress - Whether the payout details save is in progress
 * @param {boolean} props.payoutDetailsSaved - Whether the payout details saved is in progress
 * @param {Function} props.onPayoutDetailsChange - The on payout details change function
 * @param {Function} props.onPayoutDetailsSubmit - The on payout details submit function
 * @param {Function} props.onGetStripeConnectAccountLink - The get StripeConnectAccountLink function
 * @param {propTypes.error} [props.createStripeAccountError] - The error object for createStripeAccount (TODO: errors object contains this)
 * @param {propTypes.error} [props.updateStripeAccountError] - The error object for updateStripeAccount (TODO: errors object contains this)
 * @param {propTypes.error} [props.fetchStripeAccountError] - The error object for fetchStripeAccount
 * @param {propTypes.error} [props.stripeAccountError] - The error object for stripeAccount (TODO: errors object contains this)
 * @param {propTypes.error} [props.stripeAccountLinkError] - The error object for stripeAccountLink
 * @param {Function} props.onManageDisableScrolling - The on manage disable scrolling function
 * @param {intlShape} props.intl - The intl object
 * @returns {JSX.Element} EditListingWizard component
 */
class EditListingWizard extends Component {
  constructor(props) {
    super(props);

    // Having this info in state would trigger unnecessary rerendering
    this.hasScrolledToTab = false;

    this.state = {
      showPayoutDetails: false,
      selectedListingType: null,
      mounted: false,
      showIdGate: false,
      idVerifiedLocally: false,
      pendingPublishId: null,
    };
    this.handleCreateFlowTabScrolling = this.handleCreateFlowTabScrolling.bind(this);
    this.handlePublishListing = this.handlePublishListing.bind(this);
    this.handlePayoutModalClose = this.handlePayoutModalClose.bind(this);
    this.onListingTypeChange = this.onListingTypeChange.bind(this);
    this.handleIdVerified = this.handleIdVerified.bind(this);
    this.handleIdGateClose = this.handleIdGateClose.bind(this);
  }

  componentDidMount() {
    const { stripeOnboardingReturnURL } = this.props;

    if (stripeOnboardingReturnURL != null && !this.showPayoutDetails) {
      this.setState({ showPayoutDetails: true });
    }
    if (!this.mounted) {
      this.mounted = true;
    }
  }

  handleCreateFlowTabScrolling(shouldScroll) {
    this.hasScrolledToTab = shouldScroll;
  }

  handleIdVerified() {
    const { pendingPublishId } = this.state;
    this.setState({ showIdGate: false, idVerifiedLocally: true }, () => {
      // Re-trigger publish now that local verification flag is set
      this.handlePublishListing(pendingPublishId);
    });
  }

  handleIdGateClose() {
    this.setState({ showIdGate: false, pendingPublishId: null });
  }

  handlePublishListing(id) {
    const { onPublishListingDraft, currentUser, stripeAccount, listing, config } = this.props;
    const { selectedListingType, idVerifiedLocally } = this.state;

    // Require host identity verification before publishing
    const alreadyVerified = !!currentUser?.attributes?.protectedData?.idVerifiedAt;
    if (false) { // ID gate disabled 2026-06-28 (non-blocking; re-enable when Stripe Identity is live)
      this.setState({ showIdGate: true, pendingPublishId: id });
      return;
    }
    const processName = listing?.attributes?.publicData?.transactionProcessAlias?.split('/')?.[0];
    const isInquiryProcess = processName === INQUIRY_PROCESS_NAME;

    const listingTypeConfig = getListingTypeConfig(listing, selectedListingType, config);
    // Through hosted configs (listingTypeConfig.defaultListingFields?.payoutDetails),
    // it's possible to publish listing without payout details set by provider.
    // Customers can't purchase these listings - but it gives operator opportunity to discuss with providers who fail to do so.
    const isPayoutDetailsRequired = requirePayoutDetails(listingTypeConfig);

    const stripeConnected = !!currentUser?.stripeAccount?.id;
    const stripeAccountData = stripeConnected ? getStripeAccountData(stripeAccount) : null;
    const stripeRequirementsMissing =
      stripeAccount &&
      (hasRequirements(stripeAccountData, 'past_due') ||
        hasRequirements(stripeAccountData, 'currently_due'));

    if (
      isInquiryProcess ||
      !isPayoutDetailsRequired ||
      (stripeConnected && !stripeRequirementsMissing)
    ) {
      onPublishListingDraft(id);
    } else {
      this.setState({
        showPayoutDetails: true,
      });
    }
  }

  handlePayoutModalClose() {
    this.setState({ showPayoutDetails: false });
  }

  onListingTypeChange(selectedListingType) {
    this.setState({ selectedListingType });
  }

  render() {
    const {
      id,
      className,
      rootClassName,
      params,
      listing,
      intl,
      errors,
      fetchInProgress,
      payoutDetailsSaveInProgress,
      payoutDetailsSaved,
      onManageDisableScrolling,
      onPayoutDetailsChange,
      onGetStripeConnectAccountLink,
      getAccountLinkInProgress,
      createStripeAccountError,
      updateStripeAccountError,
      fetchStripeAccountError,
      stripeAccountFetched,
      stripeAccount,
      stripeAccountError,
      stripeAccountLinkError,
      currentUser,
      config,
      routeConfiguration,
      hasVerticalTabLayout,
      hasHorizontalTabLayout,
      ...rest
    } = this.props;
    const { selectedListingType, showPayoutDetails, showIdGate } = this.state;

    const selectedTab = params.tab;
    const isNewListingFlow = [LISTING_PAGE_PARAM_TYPE_NEW, LISTING_PAGE_PARAM_TYPE_DRAFT].includes(
      params.type
    );
    const rootClasses = rootClassName || css.root;
    const classes = classNames(rootClasses, className);
    const currentListing = ensureListing(listing);
    const savedProcessAlias = currentListing.attributes?.publicData?.transactionProcessAlias;
    const transactionProcessAlias =
      savedProcessAlias || selectedListingType?.transactionProcessAlias;

    // NOTE: If the listing has invalid configuration in place,
    // the listing is considered deprecated and we don't allow user to modify the listing anymore.
    // Instead, operator should do that through Console or Integration API.
    const validListingTypes = config.listing.listingTypes;
    const listingTypeConfig = getListingTypeConfig(currentListing, selectedListingType, config);
    const existingListingType = currentListing.attributes?.publicData?.listingType;
    const invalidExistingListingType = existingListingType && !listingTypeConfig;
    // TODO: displayPrice aka config.defaultListingFields?.price with false value is only available with inquiry process
    //       if it's enabled with other processes, translations for "new" flow needs to be updated.
    const isPriceDisabled = !displayPrice(listingTypeConfig);

    // Transaction process alias is used here, because the process defineds whether the listing is supported
    // I.e. old listings might not be supported through listing types, but client app might still support those processes.
    const processName = getProcessName({
      transactionProcessAlias,
      validListingTypes,
      defaultProcessName: INQUIRY_PROCESS_NAME,
    });

    const hasListingTypeSelected =
      existingListingType || selectedListingType || validListingTypes.length === 1;

    const isConflictTransactionProcess = hasConflictTransactionProcess({
      listingTypeConfig,
      transactionProcessAlias,
    });

    // For oudated draft listing, we don't show other tabs but the "details"
    const tabs = getTabs({
      isNewListingFlow,
      invalidExistingListingType,
      hasListingTypeSelected,
      processName,
      listingTypeConfig,
      isConflictTransactionProcess,
    });

    // Check if wizard tab is active / linkable.
    // When creating a new listing, we don't allow users to access next tab until the current one is completed.
    const tabsStatus = tabsActive(isNewListingFlow, currentListing, tabs, config);

    // Redirect user to first tab when encoutering outdated draft listings.
    if (invalidExistingListingType && isNewListingFlow && selectedTab !== tabs[0]) {
      return <NamedRedirect name="EditListingPage" params={{ ...params, tab: tabs[0] }} />;
    }

    // If selectedTab is not active for listing with valid listing type,
    // redirect to the beginning of wizard
    if (!invalidExistingListingType && !tabsStatus[selectedTab]) {
      const currentTabIndex = tabs.indexOf(selectedTab);
      const nearestActiveTab = tabs
        .slice(0, currentTabIndex)
        .reverse()
        .find((t) => tabsStatus[t]);

      console.warn(
        `You tried to access an EditListingWizard tab (${selectedTab}), which was not yet activated.`
      );
      return <NamedRedirect name="EditListingPage" params={{ ...params, tab: nearestActiveTab }} />;
    }

    // Check if scrollToTab call is needed (tab is not visible on mobile)
    if (hasVerticalTabLayout) {
      this.hasScrolledToTab = true;
    } else if (hasHorizontalTabLayout && !this.hasScrolledToTab) {
      const tabPrefix = id;
      scrollToTab(tabPrefix, selectedTab);
      this.hasScrolledToTab = true;
    }

    const tabLink = (tab) => {
      return { name: 'EditListingPage', params: { ...params, tab } };
    };

    const formDisabled = getAccountLinkInProgress;
    const ensuredCurrentUser = ensureCurrentUser(currentUser);
    const currentUserLoaded = !!ensuredCurrentUser.id;
    const stripeConnected = currentUserLoaded && !!stripeAccount && !!stripeAccount.id;

    const rootURL = config.marketplaceRootURL;
    const { returnURLType, ...pathParams } = params;
    const successURL = createReturnURL(
      STRIPE_ONBOARDING_RETURN_URL_SUCCESS,
      rootURL,
      routeConfiguration,
      pathParams
    );
    const failureURL = createReturnURL(
      STRIPE_ONBOARDING_RETURN_URL_FAILURE,
      rootURL,
      routeConfiguration,
      pathParams
    );

    const accountId = stripeConnected ? stripeAccount.id : null;
    const stripeAccountData = stripeConnected ? getStripeAccountData(stripeAccount) : null;

    const requirementsMissing =
      stripeAccount &&
      (hasRequirements(stripeAccountData, 'past_due') ||
        hasRequirements(stripeAccountData, 'currently_due'));

    const savedCountry = stripeAccountData ? stripeAccountData.country : null;
    const savedAccountType = stripeAccountData ? stripeAccountData.business_type : null;

    const { marketplaceName } = config;
    const payoutModalInfo = stripeAccountData ? (
      <FormattedMessage id="EditListingWizard.payoutModalInfo" values={{ marketplaceName }} />
    ) : (
      <FormattedMessage id="EditListingWizard.payoutModalInfoNew" values={{ marketplaceName }} />
    );

    const handleGetStripeConnectAccountLink = handleGetStripeConnectAccountLinkFn(
      onGetStripeConnectAccountLink,
      {
        accountId,
        successURL,
        failureURL,
      }
    );

    const returnedNormallyFromStripe = returnURLType === STRIPE_ONBOARDING_RETURN_URL_SUCCESS;
    const returnedAbnormallyFromStripe = returnURLType === STRIPE_ONBOARDING_RETURN_URL_FAILURE;
    const showVerificationNeeded = stripeConnected && requirementsMissing;

    // Redirect from success URL to basic path for StripePayoutPage
    if (returnedNormallyFromStripe && stripeConnected && !requirementsMissing) {
      return <NamedRedirect name="EditListingPage" params={pathParams} />;
    }

    return (
      <div className={classes} data-prnm-wizard="1">
        {isNewListingFlow && tabs.length > 1 ? (
          (() => {
            const stepIdx = Math.max(0, tabs.indexOf(selectedTab));
            const stepNum = stepIdx + 1;
            const pct = Math.round((stepNum / tabs.length) * 100);
            const stepName = tabLabelAndSubmit(
              intl, tabs[stepIdx], isNewListingFlow, isPriceDisabled, processName
            ).label;
            return (
              <div style={{ padding: '0 24px', margin: '0 0 22px', maxWidth: '640px' }}>
                <div style={{ height: '10px', background: '#e7e5df', borderRadius: '99px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: pct + '%', background: '#009ed8',
                                borderRadius: '99px', transition: 'width .45s ease' }} />
                </div>
                <div style={{ marginTop: '10px', fontSize: '17px', fontWeight: 700, color: '#4d5f6b' }}>
                  Step {stepNum} of {tabs.length} &middot; {stepName}
                </div>
                <div style={{ marginTop: '6px', fontSize: '16px', lineHeight: 1.5, color: '#7b8b95' }}>
                  Everything saves as you go &mdash; you can close this and come back anytime.
                </div>
              </div>
            );
          })()
        ) : null}
        <Tabs
          rootClassName={css.tabsContainer}
          navRootClassName={css.nav}
          tabRootClassName={css.tab}
        >
          {tabs.map((tab) => {
            const tabTranslations = tabLabelAndSubmit(
              intl,
              tab,
              isNewListingFlow,
              isPriceDisabled,
              processName
            );
            return (
              <EditListingWizardTab
                {...rest}
                key={tab}
                tabId={`${id}_${tab}`}
                tabLabel={tabTranslations.label}
                tabSubmitButtonText={tabTranslations.submitButton}
                tabLinkProps={tabLink(tab)}
                selected={selectedTab === tab}
                disabled={isNewListingFlow && !tabsStatus[tab]}
                tab={tab}
                params={params}
                listing={listing}
                marketplaceTabs={tabs}
                errors={errors}
                handleCreateFlowTabScrolling={this.handleCreateFlowTabScrolling}
                handlePublishListing={this.handlePublishListing}
                fetchInProgress={fetchInProgress}
                onListingTypeChange={this.onListingTypeChange}
                onManageDisableScrolling={onManageDisableScrolling}
                config={config}
                routeConfiguration={routeConfiguration}
              />
            );
          })}
        </Tabs>
        <Modal
          id="EditListingWizard.idGateModal"
          isOpen={showIdGate}
          onClose={this.handleIdGateClose}
          onManageDisableScrolling={onManageDisableScrolling}
          usePortal
        >
          <div style={{ padding: '8px 0 16px' }}>
            <IdentityVerificationGate
              publishableKey={config.stripe.publishableKey}
              purpose="host"
              reason="To protect renters and keep Pool Rental Near Me safe, all hosts must verify their identity once before listing a pool."
              onVerified={this.handleIdVerified}
            />
          </div>
        </Modal>

        <Modal
          id="EditListingWizard.payoutModal"
          isOpen={showPayoutDetails}
          onClose={this.handlePayoutModalClose}
          onManageDisableScrolling={onManageDisableScrolling}
          usePortal
        >
          <div className={css.modalPayoutDetailsWrapper}>
            <Heading as="h2" rootClassName={css.modalTitle}>
              <FormattedMessage id="EditListingWizard.payoutModalTitleOneMoreThing" />
              <br />
              <FormattedMessage id="EditListingWizard.payoutModalTitlePayoutPreferences" />
            </Heading>
            {!currentUserLoaded ? (
              <FormattedMessage id="StripePayoutPage.loadingData" />
            ) : returnedAbnormallyFromStripe && !stripeAccountLinkError ? (
              <p className={css.modalMessage}>
                <RedirectToStripe redirectFn={handleGetStripeConnectAccountLink} />
              </p>
            ) : (
              <>
                <p className={css.modalMessage}>{payoutModalInfo}</p>
                <StripeConnectAccountForm
                  disabled={formDisabled}
                  inProgress={payoutDetailsSaveInProgress}
                  ready={payoutDetailsSaved}
                  currentUser={currentUser}
                  stripeBankAccountLastDigits={getBankAccountLast4Digits(stripeAccountData)}
                  savedCountry={savedCountry}
                  savedAccountType={savedAccountType}
                  submitButtonText={intl.formatMessage({
                    id: 'StripePayoutPage.submitButtonText',
                  })}
                  stripeAccountError={stripeAccountError}
                  stripeAccountFetched={stripeAccountFetched}
                  stripeAccountLinkError={stripeAccountLinkError}
                  onChange={onPayoutDetailsChange}
                  onSubmit={rest.onPayoutDetailsSubmit}
                  stripeConnected={stripeConnected}
                >
                  {stripeConnected && !returnedAbnormallyFromStripe && showVerificationNeeded ? (
                    <StripeConnectAccountStatusBox
                      type="verificationNeeded"
                      inProgress={getAccountLinkInProgress}
                      onGetStripeConnectAccountLink={handleGetStripeConnectAccountLink(
                        'custom_account_verification'
                      )}
                    />
                  ) : stripeConnected && savedCountry && !returnedAbnormallyFromStripe ? (
                    <StripeConnectAccountStatusBox
                      type="verificationSuccess"
                      inProgress={getAccountLinkInProgress}
                      disabled={payoutDetailsSaveInProgress}
                      onGetStripeConnectAccountLink={handleGetStripeConnectAccountLink(
                        'custom_account_update'
                      )}
                    />
                  ) : null}
                </StripeConnectAccountForm>
              </>
            )}
          </div>
        </Modal>
      </div>
    );
  }
}

const EnhancedEditListingWizard = props => {
  const config = useConfiguration();
  const routeConfiguration = useRouteConfiguration();
  const intl = useIntl();
  const hasHorizontalTabLayout = useMediaQuery(`(max-width: ${MAX_HORIZONTAL_NAV_SCREEN_WIDTH}px)`);
  const hasVerticalTabLayout = useMediaQuery(
    `(min-width: ${MAX_HORIZONTAL_NAV_SCREEN_WIDTH + 1}px)`
  );

  return (
    <EditListingWizard
      config={config}
      routeConfiguration={routeConfiguration}
      intl={intl}
      hasHorizontalTabLayout={hasHorizontalTabLayout}
      hasVerticalTabLayout={hasVerticalTabLayout}
      {...props}
    />
  );
};

export default EnhancedEditListingWizard;
