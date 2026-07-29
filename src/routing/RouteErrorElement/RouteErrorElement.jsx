import { useEffect } from 'react';
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

// A chunk-load error means the browser is running a build from before the most
// recent deploy: it holds a stale asset manifest and asks for a hashed chunk
// that no longer exists on the server. The fix is simply to reload — a fresh
// document brings the current manifest. We do this automatically (once) so the
// user never sees the "app needs to be updated" page and never has to refresh
// by hand.
const isChunkLoadError = (error) => {
  const name = (error && error.name) || '';
  const msg = (error && (error.message || String(error))) || '';
  return (
    name === 'ChunkLoadError' ||
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg)
  );
};

const RouteErrorElement = ({ authPage = 'SignupPage' }) => {
  const error = useRouteError();
  const routeConfiguration = useRouteConfiguration();
  const location = useLocation();
  const { pathname, search, hash } = location;

  // eslint-disable-next-line no-console
  console.error(error);

  // Self-heal a stale client: on a chunk-load failure, reload once to pick up
  // the current build. Guarded by sessionStorage + a short window so that a
  // genuinely-missing asset (not staleness) can't cause a reload loop — after
  // one attempt within 20s we fall through to the normal page.
  const chunkError = isChunkLoadError(error);
  useEffect(() => {
    if (typeof window === 'undefined' || !chunkError) return;
    const KEY = 'prnm_chunk_reload_at';
    let last = 0;
    try {
      last = parseInt(window.sessionStorage.getItem(KEY) || '0', 10) || 0;
    } catch (e) {
      /* sessionStorage may be unavailable (private mode) */
    }
    const now = new Date().getTime();
    if (now - last > 20000) {
      try {
        window.sessionStorage.setItem(KEY, String(now));
      } catch (e) {
        /* ignore */
      }
      window.location.reload();
    }
  }, [chunkError]);

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
