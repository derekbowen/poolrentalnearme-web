import React from 'react';
import { connect } from 'react-redux';
import { useLocation } from 'react-router-dom';

import { useConfiguration } from '../../context/configurationContext';
import { FormattedMessage, useIntl } from '../../util/reactIntl';
import { parse } from '../../util/urlHelpers';
import { ensureCurrentUser } from '../../util/data';
import { verify } from '../../ducks/emailVerification.duck';
import { isScrollingDisabled } from '../../ducks/ui.duck';
import { sendVerificationEmail } from '../../ducks/user.duck';
import { isTooManyEmailVerificationRequestsError } from '../../util/errors';
import {
  Page,
  ResponsiveBackgroundImageContainer,
  NamedRedirect,
  LayoutSingleColumn,
} from '../../components';

import TopbarContainer from '../../containers/TopbarContainer/TopbarContainer';
import FooterContainer from '../../containers/FooterContainer/FooterContainer';

import EmailVerificationForm from './EmailVerificationForm/EmailVerificationForm';

import css from './EmailVerificationPage.module.css';

/**
  Parse verification token from URL

  Returns stringified token, if the token is provided.

  Returns `null` if verification token is not provided.

  Please note that we need to explicitely stringify the token, because
  the unwanted result of the `parse` method is that it automatically
  parses the token to number.
*/
const parseVerificationToken = search => {
  const urlParams = parse(search);
  const verificationToken = urlParams.t;

  if (verificationToken) {
    return `${verificationToken}`;
  }

  return null;
};

/**
 * The EmailVerificationPage component.
 *
 * @component
 * @param {Object} props
 * @param {propTypes.currentUser} props.currentUser - The current user
 * @param {boolean} props.scrollingDisabled - Whether scrolling is disabled
 * @param {Function} props.submitVerification - The submit verification function
 * @param {boolean} props.isVerified - Whether the email is verified
 * @param {boolean} props.emailVerificationInProgress - Whether the email verification is in progress
 * @param {propTypes.error} props.verificationError - The verification error
 * @param {Object} props.location - The location object
 * @param {string} props.location.search - The search object
 * @returns {JSX.Element} email verification page component
 */
export const EmailVerificationPageComponent = props => {
  const config = useConfiguration();
  const intl = useIntl();
  const location = useLocation();
  const {
    currentUser,
    scrollingDisabled,
    submitVerification,
    isVerified,
    emailVerificationInProgress,
    verificationError,
    onResendVerificationEmail,
    sendVerificationEmailInProgress,
    sendVerificationEmailError,
  } = props;

  const initialValues = {
    verificationToken: parseVerificationToken(location ? location.search : null),
  };
  // /verify-email opened without a usable ?t= token (direct visit, or an email
  // client mangled the link) — the form shows a "check your inbox" state with a
  // resend option instead of attempting a verify call that could only fail.
  const hasVerificationToken = initialValues.verificationToken != null;
  const user = ensureCurrentUser(currentUser);

  // The first attempt to verify email is done when the page is loaded.
  // When verification has completed, redirect the user forward.
  const verifiedComplete =
    isVerified && user.attributes.emailVerified && user.attributes.pendingEmail == null;
  // Host (provider) -> the merlin listing WIZARD; everyone else (guests) -> homepage.
  const isHost = user.attributes.profile?.publicData?.userType === 'provider';

  // A host goes to the wizard via a FULL-PAGE redirect: a client-side <NamedRedirect>
  // would stay inside the marketplace SPA and render the native EditListing draft editor
  // instead of reaching the nginx /wizard/ (merlin) route. Done in an effect so there is
  // no side-effect during render.
  React.useEffect(() => {
    if (verifiedComplete && isHost && typeof window !== 'undefined') {
      window.location.replace('/wizard/');
    }
  }, [verifiedComplete, isHost]);

  if (verifiedComplete && !isHost) {
    return <NamedRedirect name="LandingPage" />;
  }
  if (verifiedComplete && isHost) {
    return null; // effect above is navigating to /wizard/
  }

  // Same failed-resend copy pattern as AuthenticationPage.
  const resendErrorTranslationId = isTooManyEmailVerificationRequestsError(
    sendVerificationEmailError
  )
    ? 'EmailVerificationForm.resendFailedTooManyRequests'
    : 'EmailVerificationForm.resendFailed';
  const resendErrorMessage = sendVerificationEmailError ? (
    <p className={css.error}>
      <FormattedMessage id={resendErrorTranslationId} />
    </p>
  ) : null;

  return (
    <Page
      title={intl.formatMessage({
        id: 'EmailVerificationPage.title',
      })}
      scrollingDisabled={scrollingDisabled}
      referrer="origin"
    >
      <LayoutSingleColumn
        mainColumnClassName={css.layoutWrapperMain}
        topbar={<TopbarContainer />}
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
          <div className={css.content}>
            {user.id ? (
              <>
              <a
                href="/api/resume-listing"
                style={{ display: 'inline-block', marginBottom: '18px', padding: '14px 28px', borderRadius: '999px', background: '#0B4A6F', color: '#ffffff', fontWeight: 700, textDecoration: 'none' }}
              >
                Continue setting up your pool \u2192
              </a>
              <EmailVerificationForm
                initialValues={initialValues}
                onSubmit={submitVerification}
                currentUser={user}
                inProgress={emailVerificationInProgress}
                verificationError={verificationError}
                hasVerificationToken={hasVerificationToken}
                onResendVerificationEmail={onResendVerificationEmail}
                sendVerificationEmailInProgress={sendVerificationEmailInProgress}
                resendErrorMessage={resendErrorMessage}
              />
              </>
            ) : (
              <FormattedMessage id="EmailVerificationPage.loadingUserInformation" />
            )}
          </div>
        </ResponsiveBackgroundImageContainer>
      </LayoutSingleColumn>
    </Page>
  );
};

const mapStateToProps = state => {
  const {
    currentUser,
    sendVerificationEmailInProgress,
    sendVerificationEmailError,
  } = state.user;
  const { isVerified, verificationError, verificationInProgress } = state.emailVerification;
  return {
    isVerified,
    verificationError,
    emailVerificationInProgress: verificationInProgress,
    currentUser,
    scrollingDisabled: isScrollingDisabled(state),
    sendVerificationEmailInProgress,
    sendVerificationEmailError,
  };
};

const mapDispatchToProps = dispatch => ({
  submitVerification: ({ verificationToken }) => {
    return dispatch(verify(verificationToken));
  },
  onResendVerificationEmail: () => dispatch(sendVerificationEmail()),
});

// Note: it is important that the withRouter HOC is **outside** the
// connect HOC, otherwise React Router won't rerender any Route
// components since connect implements a shouldComponentUpdate
// lifecycle hook.
//
// See: https://github.com/ReactTraining/react-router/issues/4671
const EmailVerificationPage = connect(
  mapStateToProps,
  mapDispatchToProps
)(EmailVerificationPageComponent);

export default EmailVerificationPage;
