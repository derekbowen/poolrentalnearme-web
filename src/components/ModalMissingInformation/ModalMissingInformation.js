import React, { useState, useMemo, useEffect } from 'react';
import classNames from 'classnames';
import { useLocation } from 'react-router-dom';
import { useIntl } from 'react-intl';
import { useRouteConfiguration } from '../../context/routeConfigurationContext';
import { ensureCurrentUser } from '../../util/data';
import { isUserAuthorized } from '../../util/userHelpers';
import { pathByRouteName } from '../../util/routes';
import Modal from '../Modal/Modal';
import EmailReminder from './EmailReminder';
import usePrevious from '../../hooks/usePrevious';

import css from './ModalMissingInformation.module.css';

const MISSING_INFORMATION_MODAL_WHITELIST = [
  'LoginPage',
  'SignupPage',
  'ContactDetailsPage',
  'EmailVerificationPage',
  'PasswordResetPage',
  'StripePayoutPage',
];

const ModalMissingInformation = ({
  rootClassName,
  className,
  containerClassName,
  currentUser,
  sendVerificationEmailInProgress,
  sendVerificationEmailError,
  onManageDisableScrolling,
  onResendVerificationEmail,
  currentUserHasOrders,
  currentUserHasListings,
}) => {
  const intl = useIntl();
  const [{ hasSeenMissingInformationReminder, showMissingInformationReminder }, setState] =
    useState({
      showMissingInformationReminder: false,
      hasSeenMissingInformationReminder: false,
    });
  const routes = useRouteConfiguration();
  const location = useLocation();
  const prevLocation = usePrevious(location);
  const user = ensureCurrentUser(currentUser);
  const classes = classNames(rootClassName || css.root, className);

  const whitelistedPaths = useMemo(
    () => MISSING_INFORMATION_MODAL_WHITELIST.map((page) => pathByRouteName(page, routes)),
    [routes]
  );

  const isPageWhitelisted = whitelistedPaths.includes(location.pathname);
  const currentUserLoaded = !!user.id;
  const emailUnverified = !user.attributes.emailVerified;
  const emailVerificationNeeded =
    emailUnverified && (currentUserHasListings || currentUserHasOrders === true);
  const notRemindedYet = !showMissingInformationReminder && !hasSeenMissingInformationReminder;
  const authorizedUser = currentUserLoaded && isUserAuthorized(user);

  useEffect(() => {
    if (!authorizedUser || isPageWhitelisted) {
      return;
    }
    const locationChanged = prevLocation?.pathName !== location.pathname;
    if (emailVerificationNeeded) {
      setState((prev) => ({
        ...prev,
        showMissingInformationReminder: locationChanged || notRemindedYet,
      }));
    }
  }, [
    prevLocation,
    location,
    emailVerificationNeeded,
    authorizedUser,
    isPageWhitelisted,
    notRemindedYet,
  ]);

  return (
    <Modal
      id="MissingInformationReminder"
      containerClassName={containerClassName}
      isOpen={showMissingInformationReminder}
      onClose={() => {
        setState({
          showMissingInformationReminder: false,
          hasSeenMissingInformationReminder: true,
        });
      }}
      usePortal
      onManageDisableScrolling={onManageDisableScrolling}
      closeButtonMessage={intl.formatMessage({
        id: 'ModalMissingInformation.closeVerifyEmailReminder',
      })}
    >
      <EmailReminder
        className={classes}
        user={user}
        onResendVerificationEmail={onResendVerificationEmail}
        sendVerificationEmailInProgress={sendVerificationEmailInProgress}
        sendVerificationEmailError={sendVerificationEmailError}
      />
    </Modal>
  );
};

/**
 * Modal that tells user that they have not saved all the information the service needs.
 * This is used to remind user that they need to verify their email address.
 *
 * @component
 * @param {Object} props
 * @param {string?} props.className add more style rules in addition to components own css.root
 * @param {string?} props.rootClassName overwrite components own css.root
 * @param {string?} props.containerClassName overwrite components own css.container
 * @param {string} props.id
 * @param {Object} props.currentUser API entity
 * @param {Function} props.onManageDisableScrolling
 * @param {Object?} props.sendVerificationEmailError
 * @param {boolean} props.sendVerificationEmailInProgress
 * @returns {JSX.Element} Modal element if user needs to be reminded
 */
const EnhancedModalMissingInformation = props => {
  const routeConfiguration = useRouteConfiguration();

  return <ModalMissingInformation routeConfiguration={routeConfiguration} {...props} />;
};

export default EnhancedModalMissingInformation;
