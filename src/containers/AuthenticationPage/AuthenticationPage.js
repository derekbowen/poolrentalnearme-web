import React, { useState, useEffect } from 'react';
import { connect } from 'react-redux';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import Cookies from 'js-cookie';
import classNames from 'classnames';
import isEmpty from 'lodash/isEmpty';

import Modal from 'components/Modal/Modal';
import { LinkTabNavHorizontal } from 'components/TabNavHorizontal/TabNavHorizontal';
import { useConfiguration } from '../../context/configurationContext';
import { camelize } from '../../util/string';
import { propTypes } from '../../util/types';
import { pathByRouteName } from '../../util/routes';
import { apiBaseUrl } from '../../util/api';
import { FormattedMessage, useIntl } from '../../util/reactIntl';
import { ensureCurrentUser } from '../../util/data';
import {
  isSignupEmailTakenError,
  isTooManyEmailVerificationRequestsError,
} from '../../util/errors';
import { pickUserFieldsData, addScopePrefix } from '../../util/userHelpers';

import {
  login,
  authenticationInProgress,
  signup,
  signupWithIdp,
} from '../../ducks/auth.duck';
import { isScrollingDisabled, manageDisableScrolling } from '../../ducks/ui.duck';
import { sendVerificationEmail } from '../../ducks/user.duck';

import SocialLoginButtonsMaybe from '../../extensions/socials-sign-in/components/SocialLoginButtonsMaybe/SocialLoginButtonsMaybe';

import {
  Page,
  Heading,
  IconSpinner,
  NamedRedirect,
  ResponsiveBackgroundImageContainer,
  LayoutSingleColumn,
} from '../../components';

import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';

import TermsAndConditions from './TermsAndConditions/TermsAndConditions';
import ConfirmSignupForm from './ConfirmSignupForm/ConfirmSignupForm';
import LoginForm from './LoginForm/LoginForm';
import SignupForm from './SignupForm/SignupForm';
import EmailVerificationInfo from './EmailVerificationInfo';
import AuthBackdrop from './AuthBackdrop';

// We need to get ToS asset and get it rendered for the modal on this page.
import { TermsOfServiceContent } from '../TermsOfServicePage/TermsOfServicePage';

// We need to get PrivacyPolicy asset and get it rendered for the modal on this page.
import { PrivacyPolicyContent } from '../PrivacyPolicyPage/PrivacyPolicyPage';

import NotFoundPage from '../NotFoundPage/NotFoundPage';

import { TOS_ASSET_NAME, PRIVACY_POLICY_ASSET_NAME } from './AuthenticationPage.duck';

import css from './AuthenticationPage.module.css';

const getNonUserFieldParams = (values, userFieldConfigs) => {
  const userFieldKeys = userFieldConfigs.map(({ scope, key }) => addScopePrefix(scope, key));

  return Object.entries(values).reduce((picked, [key, value]) => {
    const isUserFieldKey = userFieldKeys.includes(key);

    return isUserFieldKey
      ? picked
      : {
          ...picked,
          [key]: value,
        };
  }, {});
};

// Tabs for SignupForm and LoginForm
export const AuthenticationForms = (props) => {
  const {
    isLogin,
    showFacebookLogin,
    showGoogleLogin,
    userType,
    from,
    submitLogin,
    loginError,
    idpAuthError,
    signupError,
    authInProgress,
    submitSignup,
    termsAndConditions,
    showAppleLogin,
    showTwitterLogin,
    showLinkedInLogin,
  } = props;
  const config = useConfiguration();
  const { userFields, userTypes = [] } = config.user;
  const preselectedUserType =
    userTypes.find((conf) => conf.userType === userType)?.userType || null;

  const fromMaybe = from ? { from } : null;
  const userTypeMaybe = preselectedUserType ? { userType: preselectedUserType } : null;
  const fromState = { state: { ...fromMaybe, ...userTypeMaybe } };
  const tabs = [
    {
      text: (
        <Heading as={!isLogin ? 'h1' : 'h2'} rootClassName={css.tab}>
          <FormattedMessage id="AuthenticationPage.signupLinkText" />
        </Heading>
      ),
      selected: !isLogin,
      linkProps: {
        name: 'SignupPage',
        params: userTypeMaybe,
        to: fromState,
      },
    },
    {
      text: (
        <Heading as={isLogin ? 'h1' : 'h2'} rootClassName={css.tab}>
          <FormattedMessage id="AuthenticationPage.loginLinkText" />
        </Heading>
      ),
      selected: isLogin,
      linkProps: {
        name: 'LoginPage',
        to: fromState,
      },
    },
  ];

  const handleSubmitSignup = values => {
    const { userType, email, password, fname, lname, displayName, ...rest } = values;
    const displayNameMaybe = displayName ? { displayName: displayName.trim() } : {};

    const params = {
      email,
      password,
      firstName: fname.trim(),
      lastName: lname.trim(),
      ...displayNameMaybe,
      publicData: {
        userType,
        ...pickUserFieldsData(rest, 'public', userType, userFields),
      },
      privateData: {
        ...pickUserFieldsData(rest, 'private', userType, userFields),
      },
      protectedData: {
        ...pickUserFieldsData(rest, 'protected', userType, userFields),
        ...getNonUserFieldParams(rest, userFields),
        // Written explicitly rather than inferred from raw form values, so the
        // record states what was consented to and when.
        smsConsentService: true,
        smsConsentMarketing:
          Array.isArray(rest.smsMarketing) && rest.smsMarketing.includes('yes'),
        smsConsentAt: new Date().toISOString(),
        smsConsentSource: 'signup-form-v1',
      },
    };

    submitSignup(params);
  };

  const loginErrorMessage = (
    <div className={css.error}>
      <FormattedMessage id="AuthenticationPage.loginFailed" />
    </div>
  );

  const idpAuthErrorMessage = (
    <div className={css.error}>
      <FormattedMessage id="AuthenticationPage.idpAuthFailed" />
    </div>
  );

  const signupErrorMessage = (
    <div className={css.error}>
      {isSignupEmailTakenError(signupError) ? (
        <FormattedMessage id="AuthenticationPage.signupFailedEmailAlreadyTaken" />
      ) : (
        <FormattedMessage id="AuthenticationPage.signupFailed" />
      )}
    </div>
  );

  const loginOrSignupError =
    isLogin && !!idpAuthError
      ? idpAuthErrorMessage
      : isLogin && !!loginError
        ? loginErrorMessage
        : !!signupError
          ? signupErrorMessage
          : null;

  return (
    <div className={css.content}>
      <LinkTabNavHorizontal className={css.tabs} tabs={tabs} />
      {loginOrSignupError}

      {isLogin ? (
        <>
          <SocialLoginButtonsMaybe
            isLogin={isLogin}
            showFacebookLogin={showFacebookLogin}
            showGoogleLogin={showGoogleLogin}
            from={from}
            showAppleLogin={showAppleLogin}
            showTwitterLogin={showTwitterLogin}
            showLinkedInLogin={showLinkedInLogin}
            {...userTypeMaybe}
          />
          <LoginForm className={css.loginForm} onSubmit={submitLogin} inProgress={authInProgress} />
        </>
      ) : (
        <SignupForm
          className={css.signupForm}
          onSubmit={handleSubmitSignup}
          inProgress={authInProgress}
          termsAndConditions={termsAndConditions}
          preselectedUserType={preselectedUserType}
          userTypes={userTypes}
          userFields={userFields}
          /* Rendered inside the form, directly under the user-type cards, so the
             choice a host just made travels with the IdP redirect. */
          renderSocialLoginButtons={selectedUserType => (
            <SocialLoginButtonsMaybe
              isLogin={isLogin}
              showFacebookLogin={showFacebookLogin}
              showGoogleLogin={showGoogleLogin}
              from={from}
              showAppleLogin={showAppleLogin}
              showTwitterLogin={showTwitterLogin}
              showLinkedInLogin={showLinkedInLogin}
              userType={selectedUserType || preselectedUserType || null}
            />
          )}
        />
      )}
    </div>
  );
};

// Form for confirming information from IdP (e.g. Facebook)
// This is shown before new user is created to Marketplace API
const ConfirmIdProviderInfoForm = props => {
  const {
    userType,
    authInfo,
    authInProgress,
    confirmError,
    submitSingupWithIdp,
    termsAndConditions,
  } = props;
  const config = useConfiguration();
  const { userFields, userTypes } = config.user;
  const preselectedUserType =
    userTypes.find((conf) => conf.userType === userType)?.userType || null;

  const idp = authInfo ? authInfo.idpId.replace(/^./, (str) => str.toUpperCase()) : null;

  const handleSubmitConfirm = (values) => {
    const { idpToken, email, firstName, lastName, idpId } = authInfo;

    const {
      userType,
      email: newEmail,
      firstName: newFirstName,
      lastName: newLastName,
      displayName,
      ...rest
    } = values;

    const displayNameMaybe = displayName ? { displayName: displayName.trim() } : {};

    // Pass email, fistName or lastName to Marketplace API only if user has edited them
    // and they can't be fetched directly from idp provider (e.g. Facebook)

    const authParams = {
      ...(newEmail !== email && { email: newEmail }),
      ...(newFirstName !== firstName && { firstName: newFirstName }),
      ...(newLastName !== lastName && { lastName: newLastName }),
    };

    // Pass other values as extended data according to user field configuration
    const extendedDataMaybe = !isEmpty(rest)
      ? {
          publicData: {
            userType,
            ...pickUserFieldsData(rest, 'public', userType, userFields),
          },
          privateData: {
            ...pickUserFieldsData(rest, 'private', userType, userFields),
          },
          protectedData: {
            ...pickUserFieldsData(rest, 'protected', userType, userFields),
            // If the confirm form has any additional values, pass them forward as user's protected data
            ...getNonUserFieldParams(rest, userFields),
          },
        }
      : {};

    submitSingupWithIdp({
      idpToken,
      idpId,
      ...authParams,
      ...displayNameMaybe,
      ...extendedDataMaybe,
    });
  };

  const confirmErrorMessage = confirmError ? (
    <div className={css.error}>
      {isSignupEmailTakenError(confirmError) ? (
        <FormattedMessage id="AuthenticationPage.signupFailedEmailAlreadyTaken" />
      ) : (
        <FormattedMessage id="AuthenticationPage.signupFailed" />
      )}
    </div>
  ) : null;

  return (
    <div className={css.content}>
      <Heading as="h1" rootClassName={css.signupWithIdpTitle}>
        <FormattedMessage id="AuthenticationPage.confirmSignupWithIdpTitle" values={{ idp }} />
      </Heading>

      <p className={css.confirmInfoText}>
        <FormattedMessage id="AuthenticationPage.confirmSignupInfoText" />
      </p>
      {confirmErrorMessage}
      <ConfirmSignupForm
        className={css.form}
        onSubmit={handleSubmitConfirm}
        inProgress={authInProgress}
        termsAndConditions={termsAndConditions}
        authInfo={authInfo}
        idp={idp}
        preselectedUserType={preselectedUserType}
        userTypes={userTypes}
        userFields={userFields}
      />
    </div>
  );
};

export const AuthenticationOrConfirmInfoForm = (props) => {
  const {
    tab,
    userType,
    authInfo,
    from,
    showFacebookLogin,
    showGoogleLogin,
    submitLogin,
    submitSignup,
    submitSingupWithIdp,
    authInProgress,
    loginError,
    idpAuthError,
    signupError,
    confirmError,
    termsAndConditions,
    showAppleLogin,
    showTwitterLogin,
    showLinkedInLogin,
  } = props;
  const isConfirm = tab === 'confirm';
  const isLogin = tab === 'login';

  return isConfirm ? (
    <ConfirmIdProviderInfoForm
      userType={userType}
      authInfo={authInfo}
      submitSingupWithIdp={submitSingupWithIdp}
      authInProgress={authInProgress}
      confirmError={confirmError}
      termsAndConditions={termsAndConditions}
    />
  ) : (
    <AuthenticationForms
      isLogin={isLogin}
      showFacebookLogin={showFacebookLogin}
      showGoogleLogin={showGoogleLogin}
      showAppleLogin={showAppleLogin}
      showTwitterLogin={showTwitterLogin}
      showLinkedInLogin={showLinkedInLogin}
      userType={userType}
      from={from}
      loginError={loginError}
      idpAuthError={idpAuthError}
      signupError={signupError}
      submitLogin={submitLogin}
      authInProgress={authInProgress}
      submitSignup={submitSignup}
      termsAndConditions={termsAndConditions}
    />
  );
};

const getAuthInfoFromCookies = () => {
  return Cookies.get('st-authinfo')
    ? JSON.parse(Cookies.get('st-authinfo').replace('j:', ''))
    : null;
};
const getAuthErrorFromCookies = () => {
  return Cookies.get('st-autherror')
    ? JSON.parse(Cookies.get('st-autherror').replace('j:', ''))
    : null;
};

const BlankPage = (props) => {
  const { schemaTitle, schemaDescription, scrollingDisabled, topbarClasses } = props;
  return (
    <Page
      title={schemaTitle}
      description={schemaDescription}
      scrollingDisabled={scrollingDisabled}
      schema={{
        '@context': 'http://schema.org',
        '@type': 'WebPage',
        name: schemaTitle,
        description: schemaDescription,
      }}
    >
      <LayoutSingleColumn
        topbar={<TopbarContainer className={topbarClasses} />}
        footer={<FooterContainer />}
      >
        <div className={css.spinnerContainer}>
          <IconSpinner />
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

/**
 * The AuthenticationPage component.
 *
 * @component
 * @param {Object} props
 * @param {boolean} props.authInProgress - Whether the authentication is in progress
 * @param {propTypes.currentUser} props.currentUser - The current user
 * @param {boolean} props.isAuthenticated - Whether the user is authenticated
 * @param {propTypes.error} props.loginError - The login error
 * @param {propTypes.error} props.signupError - The signup error
 * @param {propTypes.error} props.confirmError - The confirm error
 * @param {Function} props.submitLogin - The login submit function
 * @param {Function} props.submitSignup - The signup submit function
 * @param {Function} props.submitSingupWithIdp - The signup with IdP submit function
 * @param {'login' | 'signup'| 'confirm'} props.tab - The tab to render
 * @param {boolean} props.sendVerificationEmailInProgress - Whether the verification email is in progress
 * @param {propTypes.error} props.sendVerificationEmailError - The verification email error
 * @param {Function} props.onResendVerificationEmail - The resend verification email function
 * @param {Function} props.onManageDisableScrolling - The manage disable scrolling function
 * @param {object} props.privacyAssetsData - The privacy assets data
 * @param {boolean} props.privacyFetchInProgress - Whether the privacy fetch is in progress
 * @param {propTypes.error} props.privacyFetchError - The privacy fetch error
 * @param {object} props.tosAssetsData - The terms of service assets data
 * @param {boolean} props.tosFetchInProgress - Whether the terms of service fetch is in progress
 * @param {propTypes.error} props.tosFetchError - The terms of service fetch error
 * @param {object} props.location - The location object
 * @param {object} props.params - The path parameters
 * @param {boolean} props.scrollingDisabled - Whether the scrolling is disabled
 * @returns {JSX.Element}
 */
export const AuthenticationPageComponent = (props) => {
  const [tosModalOpen, setTosModalOpen] = useState(false);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);
  const [authInfo, setAuthInfo] = useState(getAuthInfoFromCookies());
  const [authError, setAuthError] = useState(getAuthErrorFromCookies());
  const [mounted, setMounted] = useState(false);

  const config = useConfiguration();
  const intl = useIntl();

  useEffect(() => {
    // Remove the autherror cookie once the content is saved to state
    // because we don't want to show the error message e.g. after page refresh
    if (authError) {
      Cookies.remove('st-autherror');
    }
    setMounted(true);
  }, []);

  // On mobile, it's better to scroll to top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tosModalOpen, privacyModalOpen]);

  const {
    authInProgress,
    currentUser,
    isAuthenticated,
    loginError,
    scrollingDisabled,
    signupError,
    submitLogin,
    submitSignup,
    confirmError,
    submitSingupWithIdp,
    tab = 'signup',
    sendVerificationEmailInProgress,
    sendVerificationEmailError,
    onResendVerificationEmail,
    onManageDisableScrolling,
    tosAssetsData,
    tosFetchInProgress,
    tosFetchError,
  } = props;
  const location = useLocation();
  const pathParams = useParams();

  // History API has potentially state tied to this route
  // We have used that state to store previous URL ("from"),
  // so that use can be redirected back to that page after authentication.
  const locationFrom = location.state?.from || null;
  const authinfoFrom = authInfo?.from || null;
  const from = locationFrom || authinfoFrom || null;

  const isConfirm = tab === 'confirm';
  const userTypeInPushState = location.state?.userType || null;
  const userTypeInAuthInfo = isConfirm && authInfo?.userType ? authInfo?.userType : null;
  const userType = pathParams?.userType || userTypeInPushState || userTypeInAuthInfo || null;

  const { userTypes = [] } = config.user;
  const preselectedUserType =
    userTypes.find((conf) => conf.userType === userType)?.userType || null;
  const show404 = userType && !preselectedUserType;

  const user = ensureCurrentUser(currentUser);
  const currentUserLoaded = !!user.id;
  const isLogin = tab === 'login';

  // We only want to show the email verification dialog in the signup
  // tab if the user isn't being redirected somewhere else
  // (i.e. `from` is present). We must also check the `emailVerified`
  // flag only when the current user is fully loaded.
  const showEmailVerification = !isLogin && currentUserLoaded && !user.attributes.emailVerified;

  const marketplaceName = config.marketplaceName;
  const schemaTitle = isLogin
    ? intl.formatMessage({ id: 'AuthenticationPage.schemaTitleLogin' }, { marketplaceName })
    : `List Your Pool Free \u2014 0% Host Fees | ${marketplaceName}`;
  const schemaDescription = isLogin
    ? intl.formatMessage({ id: 'AuthenticationPage.schemaDescriptionLogin' }, { marketplaceName })
    : 'List your pool free and earn by the hour \u2014 0% host fees. No listing fees. Join hosts on Pool Rental Near Me.';
  const topbarClasses = classNames({
    [css.hideOnMobile]: showEmailVerification,
  });

  const shouldRedirectToFrom = isAuthenticated && from;
  const shouldRedirectToLandingPage =
    isAuthenticated && currentUserLoaded && !showEmailVerification;
  // Returning host: already authenticated, but re-entering signup through a
  // "become a host" acquisition link (/signup/provider). Redirecting them to the
  // landing page would strand them, so send them onward to the listing wizard.
  // The wizard is a separate app behind nginx (merlin), not a react-router route,
  // so this needs a full-page redirect. Same pattern as EmailVerificationPage.
  const shouldRedirectHostToWizard =
    shouldRedirectToLandingPage && !shouldRedirectToFrom && userType === 'provider';
  useEffect(() => {
    if (shouldRedirectHostToWizard && typeof window !== 'undefined') {
      window.location.replace('/wizard/');
    }
  }, [shouldRedirectHostToWizard]);

  if (!mounted && shouldRedirectToLandingPage) {
    // Show a blank page for already authenticated users,
    // when the first rendering on client side is not yet done
    // This is done to avoid hydration issues when full page load is happening.
    return (
      <BlankPage
        schemaTitle={schemaTitle}
        schemaDescription={schemaDescription}
        topbarClasses={topbarClasses}
      />
    );
  }

  if (shouldRedirectToFrom) {
    // Already authenticated, redirect back to the page the user tried to access
    return <Navigate to={from} replace />;
  } else if (shouldRedirectHostToWizard) {
    // The effect above is doing a full-page replace to /wizard/;
    // render the blank page while the browser navigates.
    return (
      <BlankPage
        schemaTitle={schemaTitle}
        schemaDescription={schemaDescription}
        topbarClasses={topbarClasses}
      />
    );
  } else if (shouldRedirectToLandingPage) {
    // Already authenticated after direct /login or /signup access. Hosts land
    // on their dashboard — their one home screen; everyone else keeps the
    // public landing page.
    const landsHome = user.attributes?.profile?.publicData?.userType === 'provider';
    return <NamedRedirect name={landsHome ? 'HostDashboardPage' : 'LandingPage'} />;
  } else if (show404) {
    // User type not found, show 404
    return <NotFoundPage staticContext={props.staticContext} />;
  }

  const resendErrorTranslationId = isTooManyEmailVerificationRequestsError(
    sendVerificationEmailError
  )
    ? 'AuthenticationPage.resendFailedTooManyRequests'
    : 'AuthenticationPage.resendFailed';
  const resendErrorMessage = sendVerificationEmailError ? (
    <p className={css.error}>
      <FormattedMessage id={resendErrorTranslationId} />
    </p>
  ) : null;

  return (
    <Page
      title={schemaTitle}
      description={schemaDescription}
      scrollingDisabled={scrollingDisabled}
      schema={{
        '@context': 'http://schema.org',
        '@type': 'WebPage',
        name: schemaTitle,
        description: schemaDescription,
      }}
      shouldIndex={!isLogin}
    >
      <LayoutSingleColumn
        mainColumnClassName={css.layoutWrapperMain}
        topbar={<TopbarContainer className={topbarClasses} />}
        footer={<FooterContainer />}
      >
        <ResponsiveBackgroundImageContainer
          className={css.root}
          childrenWrapperClassName={css.contentContainer}
          as="section"
          image={config.branding.brandImage}
          sizes="100%"
          useOverlay
        >
          <AuthBackdrop className={css.backdrop} />
          {showEmailVerification ? (
            <EmailVerificationInfo
              name={user.attributes.profile.firstName}
              email={<span className={css.email}>{user.attributes.email}</span>}
              onResendVerificationEmail={onResendVerificationEmail}
              resendErrorMessage={resendErrorMessage}
              sendVerificationEmailInProgress={sendVerificationEmailInProgress}
            />
          ) : (
            <AuthenticationOrConfirmInfoForm
              tab={tab}
              userType={userType}
              authInfo={authInfo}
              from={from}
              showFacebookLogin={!!import.meta.env.VITE_FACEBOOK_APP_ID}
              showGoogleLogin={!!import.meta.env.VITE_GOOGLE_CLIENT_ID}
              showAppleLogin={!!import.meta.env.VITE_APPLE_CLIENT_ID}
              showTwitterLogin={!!import.meta.env.VITE_TWITTER_CLIENT_ID}
              showLinkedInLogin={!!import.meta.env.VITE_LINKED_IN_CLIENT_ID}
              submitLogin={submitLogin}
              submitSignup={submitSignup}
              submitSingupWithIdp={submitSingupWithIdp}
              authInProgress={authInProgress}
              loginError={loginError}
              idpAuthError={authError}
              signupError={signupError}
              confirmError={confirmError}
              termsAndConditions={
                <TermsAndConditions
                  onOpenTermsOfService={() => setTosModalOpen(true)}
                  onOpenPrivacyPolicy={() => setPrivacyModalOpen(true)}
                  intl={intl}
                />
              }
            />
          )}
        </ResponsiveBackgroundImageContainer>
      </LayoutSingleColumn>
      <Modal
        id="AuthenticationPage.tos"
        isOpen={tosModalOpen}
        onClose={() => setTosModalOpen(false)}
        usePortal
        onManageDisableScrolling={onManageDisableScrolling}
      >
        <div className={css.termsWrapper}>
          <TermsOfServiceContent
            inProgress={tosFetchInProgress}
            error={tosFetchError}
            data={tosAssetsData?.[camelize(TOS_ASSET_NAME)]?.data}
          />
        </div>
      </Modal>
      <Modal
        id="AuthenticationPage.privacyPolicy"
        isOpen={privacyModalOpen}
        onClose={() => setPrivacyModalOpen(false)}
        usePortal
        onManageDisableScrolling={onManageDisableScrolling}
      >
        <div className={css.privacyWrapper}>
          <PrivacyPolicyContent
            inProgress={tosFetchInProgress}
            error={tosFetchError}
            data={tosAssetsData?.[camelize(PRIVACY_POLICY_ASSET_NAME)]?.data}
          />
        </div>
      </Modal>
    </Page>
  );
};

const mapStateToProps = state => {
  const { isAuthenticated, loginError, signupError, confirmError } = state.auth;
  const { currentUser, sendVerificationEmailInProgress, sendVerificationEmailError } = state.user;
  const {
    pageAssetsData: privacyAssetsData,
    inProgress: privacyFetchInProgress,
    error: privacyFetchError,
  } = state.hostedAssets || {};
  const {
    pageAssetsData: tosAssetsData,
    inProgress: tosFetchInProgress,
    error: tosFetchError,
  } = state.hostedAssets || {};

  return {
    authInProgress: authenticationInProgress(state),
    currentUser,
    isAuthenticated,
    loginError,
    scrollingDisabled: isScrollingDisabled(state),
    signupError,
    confirmError,
    sendVerificationEmailInProgress,
    sendVerificationEmailError,
    privacyAssetsData,
    privacyFetchInProgress,
    privacyFetchError,
    tosAssetsData,
    tosFetchInProgress,
    tosFetchError,
  };
};

const mapDispatchToProps = (dispatch) => ({
  submitLogin: ({ email, password }) => dispatch(login(email, password)),
  submitSignup: (params) => dispatch(signup(params)),
  submitSingupWithIdp: (params) => dispatch(signupWithIdp(params)),
  onResendVerificationEmail: () => dispatch(sendVerificationEmail()),
  onManageDisableScrolling: (componentId, disableScrolling) =>
    dispatch(manageDisableScrolling(componentId, disableScrolling)),
});

// Note: it is important that the withRouter HOC is **outside** the
// connect HOC, otherwise React Router won't rerender any Route
// components since connect implements a shouldComponentUpdate
// lifecycle hook.
//
// See: https://github.com/ReactTraining/react-router/issues/4671
const AuthenticationPage = connect(
  mapStateToProps,
  mapDispatchToProps
)(AuthenticationPageComponent);

export default AuthenticationPage;
