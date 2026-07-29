/**
 * This is a wrapper component for different Layouts.
 * Navigational 'aside' content should be added to this wrapper.
 */
import React, { useEffect, useState } from 'react';

import useMediaQuery from 'hooks/useMediaQuery';
import useMounted from 'hooks/useMounted';
import { FormattedMessage } from '../../../util/reactIntl';

import { createGlobalState } from './hookGlobalState';
import TabNav from '../../TabNav/TabNav';

import css from './LayoutSideNavigation.module.css';

const MAX_HORIZONTAL_NAV_SCREEN_WIDTH = 1023;

// Add global state for tab scrolling effect
const initialScrollState = { scrollLeft: 0 };
const { useGlobalState } = createGlobalState(initialScrollState);

// Horizontal scroll animation using element.scrollTo()
const scrollToTab = (currentPage, scrollLeft, setScrollLeft) => {
  const el = document.querySelector(`#${currentPage}Tab`);

  if (el) {
    // el.scrollIntoView doesn't work with Safari and it considers vertical positioning too.
    // This scroll behaviour affects horizontal scrolling only
    // and it expects that the immediate parent element is scrollable.
    const parent = el.parentElement;
    const parentRect = parent.getBoundingClientRect();
    const maxScrollDistance = parent.scrollWidth - parentRect.width;

    const hasParentScrolled = parent.scrollLeft > 0;
    const scrollPositionCurrent = hasParentScrolled ? parent.scrollLeft : scrollLeft;

    const tabRect = el.getBoundingClientRect();
    const diffLeftBetweenTabAndParent = tabRect.left - parentRect.left;
    const tabScrollPosition = parent.scrollLeft + diffLeftBetweenTabAndParent;

    const scrollPositionNew =
      tabScrollPosition > maxScrollDistance
        ? maxScrollDistance
        : parent.scrollLeft + diffLeftBetweenTabAndParent;

    const needsSmoothScroll = scrollPositionCurrent !== scrollPositionNew;

    if (parent.scrollTo && (!hasParentScrolled || (hasParentScrolled && needsSmoothScroll))) {
      // Ensure that smooth scroll animation uses old position as starting point after navigation.
      parent.scrollTo({ left: scrollPositionCurrent });
      // Scroll to new position
      parent.scrollTo({ left: scrollPositionNew, behavior: 'smooth' });
    }
    // Always keep track of new position (even if smooth scrolling is not applied)
    setScrollLeft(scrollPositionNew);
  }
};

/**
 * Side nav with navigation to different account settings.
 *
 * @component
 * @param {Object} props
 * @param {Object} props.accountSettingsNavProps
 * @param {string?} props.accountSettingsNavProps.currentPage
 * @param {boolean?} props.accountSettingsNavProps.showPaymentMethods
 * @param {boolean?} props.accountSettingsNavProps.showPayoutDetails
 * @returns {JSX.Element} Side nav with navigation to different account settings
 */
const LayoutWrapperAccountSettingsSideNav = (props) => {
  const mounted = useMounted();
  const [scrollLeft, setScrollLeft] = useGlobalState('scrollLeft');
  const hasHorizontalTabLayout = useMediaQuery(
    `(max-width: ${MAX_HORIZONTAL_NAV_SCREEN_WIDTH}px)`,
    true
  );
  const { accountSettingsNavProps } = props;

  const { currentPage, showPaymentMethods, showPayoutDetails } = accountSettingsNavProps;
  const payoutDetailsMaybe = showPayoutDetails
    ? [
        {
          text: <FormattedMessage id="LayoutWrapperAccountSettingsSideNav.payoutsTabTitle" />,
          selected: currentPage === 'PayoutDashboardPage',
          id: 'PayoutDashboardPageTab',
          linkProps: {
            name: 'PayoutDashboardPage',
          },
        },
        {
          text: <FormattedMessage id="LayoutWrapperAccountSettingsSideNav.paymentsTabTitle" />,
          selected: currentPage === 'StripePayoutPage',
          id: 'StripePayoutPageTab',
          linkProps: {
            name: 'StripePayoutPage',
          },
        },
      ]
    : [];

  const paymentMethodsMaybe = showPaymentMethods
    ? [
        {
          text: (
            <FormattedMessage id="LayoutWrapperAccountSettingsSideNav.paymentMethodsTabTitle" />
          ),
          selected: currentPage === 'PaymentMethodsPage',
          id: 'PaymentMethodsPageTab',
          linkProps: {
            name: 'PaymentMethodsPage',
          },
        },
      ]
    : [];

  useEffect(() => {
    if (hasHorizontalTabLayout && mounted) {
      scrollToTab(currentPage, scrollLeft, setScrollLeft);
    }
  }, [currentPage, hasHorizontalTabLayout, scrollLeft, setScrollLeft, mounted]);

  const tabs = [
    {
      text: <FormattedMessage id="LayoutWrapperAccountSettingsSideNav.contactDetailsTabTitle" />,
      selected: currentPage === 'ContactDetailsPage',
      id: 'ContactDetailsPageTab',
      linkProps: {
        name: 'ContactDetailsPage',
      },
    },
    {
      text: <FormattedMessage id="LayoutWrapperAccountSettingsSideNav.passwordTabTitle" />,
      selected: currentPage === 'PasswordChangePage',
      id: 'PasswordChangePageTab',
      linkProps: {
        name: 'PasswordChangePage',
      },
    },
    ...payoutDetailsMaybe,
    ...paymentMethodsMaybe,
  ];

  return <TabNav rootClassName={css.tabs} tabRootClassName={css.tab} tabs={tabs} />;
};

export default LayoutWrapperAccountSettingsSideNav;
