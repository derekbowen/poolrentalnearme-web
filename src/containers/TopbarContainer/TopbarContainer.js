import React, { memo } from 'react';
import { connect } from 'react-redux';

import isEqual from 'lodash/isEqual';
import { useLocation, useNavigate } from 'react-router-dom';
import { hasCurrentUserErrors, sendVerificationEmail } from '../../ducks/user.duck';
import { logout, authenticationInProgress } from '../../ducks/auth.duck';
import { manageDisableScrolling } from '../../ducks/ui.duck';

import Topbar from './Topbar/Topbar';

/**
 * Topbar container component, which is connected to Redux Store.
 * @component
 * @param {Object} props
 * @returns {JSX.Element}
 */
export const TopbarContainerComponent = (props) => {
  const { notificationCount = 0, ...rest } = props;
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Topbar
      notificationCount={notificationCount}
      {...rest}
      navigate={navigate}
      location={location}
    />
  );
};

const mapStateToProps = (state) => {
  // Topbar needs isAuthenticated and isLoggedInAs
  const { isAuthenticated, isLoggedInAs, logoutError, authScopes } = state.auth;
  // Topbar needs user info.
  const {
    currentUser,
    currentUserHasListings,
    currentUserNotificationCount: notificationCount,
    sendVerificationEmailInProgress,
    sendVerificationEmailError,
  } = state.user;
  const hasGenericError = !!(logoutError || hasCurrentUserErrors(state));
  return {
    authInProgress: authenticationInProgress(state),
    currentUser,
    currentUserHasListings,
    notificationCount,
    isAuthenticated,
    isLoggedInAs,
    authScopes,
    hasGenericError,
    sendVerificationEmailInProgress,
    sendVerificationEmailError,
  };
};

const mapDispatchToProps = (dispatch) => ({
  onLogout: (historyPush) => dispatch(logout(historyPush)),
  onManageDisableScrolling: (componentId, disableScrolling) =>
    dispatch(manageDisableScrolling(componentId, disableScrolling)),
  onResendVerificationEmail: () => dispatch(sendVerificationEmail()),
});

const TopbarContainer = connect(mapStateToProps, mapDispatchToProps)(TopbarContainerComponent);

export default memo(TopbarContainer, isEqual);
