import { bool, string } from 'prop-types';
import React from 'react';
import pickBy from 'lodash/pickBy';
import { FormattedMessage } from 'react-intl';
import { useRouteConfiguration } from '../../../../context/routeConfigurationContext';
import { apiBaseUrl } from '../../../../util/api';
import { pathByRouteName } from '../../../../util/routes';

import css from './SocialLoginButtonsMaybe.module.css';
import FacebookLogo from '../SocialLogos/Facebook';
import { SocialLoginButton } from '../../../../components/Button/Button';
import GoogleLogo from '../SocialLogos/Google';
import AppleLogo from '../SocialLogos/Apple';
import TwitterLogo from '../SocialLogos/Twitter';
import LinkedIn from '../SocialLogos/LinkedIn';

const getDefaultRoutes = ({ from, userType, routeConfiguration }) => {
  const baseUrl = apiBaseUrl();
  const fromParam = from || '';
  const defaultReturn = pathByRouteName('LandingPage', routeConfiguration);
  const defaultReturnParam = defaultReturn || '';
  const defaultConfirm = pathByRouteName('ConfirmPage', routeConfiguration);
  const defaultConfirmParam = defaultConfirm || '';

  return {
    baseUrl,
    from: fromParam,
    defaultReturn: defaultReturnParam,
    defaultConfirm: defaultConfirmParam,
    // server/api/auth/{facebook,google}.js already read this; until now the
    // frontend never sent it, so every social signup arrived with no user type.
    userType: userType || '',
  };
};

const SocialLoginButtonsMaybe = ({
  isLogin,
  showFacebookLogin,
  showGoogleLogin,
  showAppleLogin,
  showTwitterLogin,
  showLinkedInLogin,
  from,
  userType,
}) => {
  const routeConfiguration = useRouteConfiguration();
  const data = getDefaultRoutes({ from, userType, routeConfiguration });

  const queryParams = new URLSearchParams(pickBy(data, (v) => v !== '')).toString();

  const authWith = (provider) => () => {
    window.location.href = `${data.baseUrl}/api/socials-sign-in/auth/${provider}?${queryParams}`;
  };

  const hasButtons =
    showFacebookLogin || showGoogleLogin || showAppleLogin || showTwitterLogin || showLinkedInLogin;

  if (!hasButtons) {
    return null;
  }

  return (
    <div className={css.root}>
      <div className={css.socialButtonsOr}>
        <span className={css.socialButtonsOrText}>
          <FormattedMessage id="AuthenticationPage.or" />
        </span>
      </div>

      {showFacebookLogin ? (
        <div className={css.socialButtonWrapper}>
          <SocialLoginButton onClick={authWith('facebook')}>
            <span className={css.buttonIcon}>
              <FacebookLogo />
            </span>
            <FormattedMessage
              id={
                isLogin
                  ? 'AuthenticationPage.loginWithFacebook'
                  : 'AuthenticationPage.signupWithFacebook'
              }
            />
          </SocialLoginButton>
        </div>
      ) : null}

      {showGoogleLogin ? (
        <div className={css.socialButtonWrapper}>
          <SocialLoginButton onClick={authWith('google')}>
            <span className={css.buttonIcon}>
              <GoogleLogo />
            </span>
            <FormattedMessage
              id={
                isLogin
                  ? 'AuthenticationPage.loginWithGoogle'
                  : 'AuthenticationPage.signupWithGoogle'
              }
            />
          </SocialLoginButton>
        </div>
      ) : null}

      {showAppleLogin ? (
        <div className={css.socialButtonWrapper}>
          <SocialLoginButton onClick={authWith('apple')}>
            <span className={css.appleIcon}>
              <AppleLogo />
            </span>
            <FormattedMessage
              id={
                isLogin ? 'AuthenticationPage.loginWithApple' : 'AuthenticationPage.signupWithApple'
              }
            />
          </SocialLoginButton>
        </div>
      ) : null}

      {showTwitterLogin ? (
        <div className={css.socialButtonWrapper}>
          <SocialLoginButton onClick={authWith('twitter')}>
            <span className={css.buttonIcon}>
              <TwitterLogo />
            </span>
            <FormattedMessage
              id={isLogin ? 'AuthenticationPage.loginWithX' : 'AuthenticationPage.signupWithX'}
            />
          </SocialLoginButton>
        </div>
      ) : null}

      {showLinkedInLogin ? (
        <div className={css.socialButtonWrapper}>
          <SocialLoginButton onClick={authWith('linkedin')}>
            <span className={css.buttonIcon}>
              <LinkedIn />
            </span>
            <FormattedMessage
              id={
                isLogin
                  ? 'AuthenticationPage.loginWithLinkedIn'
                  : 'AuthenticationPage.signupWithLinkedIn'
              }
            />
          </SocialLoginButton>
        </div>
      ) : null}
    </div>
  );
};

SocialLoginButtonsMaybe.propTypes = {
  isLogin: bool,
  showFacebookLogin: bool,
  showGoogleLogin: bool,
  showAppleLogin: bool,
  showTwitterLogin: bool,
  showLinkedInLogin: bool,
  from: string,
  userType: string,
};

SocialLoginButtonsMaybe.defaultProps = {
  isLogin: false,
  showFacebookLogin: false,
  showGoogleLogin: false,
  showAppleLogin: false,
  showTwitterLogin: false,
  showLinkedInLogin: false,
  from: null,
  userType: null,
};

export default SocialLoginButtonsMaybe;
