import { string } from 'prop-types';
import { useLocation, useRouteError } from 'react-router-dom';
import { FormattedMessage } from 'react-intl';
import { Helmet } from 'react-helmet-async';
import {
  Heading,
  InlineTextButton,
  LayoutSingleColumn,
  Logo,
  NamedRedirect,
} from '../../components';
import { useRouteConfiguration } from '../../context/routeConfigurationContext';
import { pathByRouteName } from '../../util/routes';

import css from './RouteErrorElement.module.css';

const isUnauthenticated = (error) => {
  return error?.status === 401;
};

const RouteErrorElement = ({ authPage = 'SignupPage' }) => {
  const error = useRouteError();
  const routeConfiguration = useRouteConfiguration();
  const location = useLocation();
  const { pathname, search, hash } = location;

  // eslint-disable-next-line no-console
  console.error(error);

  if (isUnauthenticated(error)) {
    // When the loader function throws an error with status 401, we redirect to the auth page
    // with the current location as the state. This way the auth page can redirect back to the current
    return (
      <NamedRedirect
        name={authPage}
        state={
          location.state ?? {
            from: pathname + search + hash,
          }
        }
      />
    );
  }

  const handleOnClick = () => {
    const landingPagePath = pathByRouteName('LandingPage', routeConfiguration);
    if (typeof window !== 'undefined') {
      window.location.href = landingPagePath;
    }
  };

  const landingPageLink = (
    <InlineTextButton onClick={handleOnClick}>
      <FormattedMessage id="LoadableComponentErrorBoundaryPage.landingPageLink" />
    </InlineTextButton>
  );

  return (
    <div>
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <LayoutSingleColumn
        topbar={
          <div className={css.topbar}>
            <InlineTextButton onClick={handleOnClick}>
              <Logo className={css.logoMobile} layout="mobile" />
              <Logo className={css.logoDesktop} layout="desktop" />
            </InlineTextButton>
          </div>
        }
        footer={null}
      >
        <div className={css.root}>
          <div className={css.content}>
            <div className={css.number}>404</div>
            <Heading as="h1" rootClassName={css.heading}>
              <FormattedMessage id="LoadableComponentErrorBoundaryPage.heading" />
            </Heading>
            <p className={css.description}>
              <FormattedMessage
                id="LoadableComponentErrorBoundaryPage.description"
                values={{ link: landingPageLink }}
              />
            </p>
          </div>
        </div>
      </LayoutSingleColumn>
    </div>
  );
};

RouteErrorElement.propTypes = {
  authPage: string,
};

export default RouteErrorElement;
