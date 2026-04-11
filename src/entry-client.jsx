/* eslint-disable no-underscore-dangle */
import { createRoot, hydrateRoot } from 'react-dom/client';
import { moveStyles } from 'used-styles/moveStyles';
import { createBrowserRouter } from 'react-router-dom';
import { GoogleAnalyticsHandler, LoggingAnalyticsHandler } from './analytics/handlers';
import defaultConfig from './config/configDefault';
import appSettings from './config/settings';
import { authInfo } from './ducks/auth.duck';
import { fetchAppAssets } from './ducks/hostedAssets.duck';
import { fetchCurrentUser } from './ducks/user.duck';
import configureStore from './store';
import './extensions/phone-number-verification/styles/tailwind.css';
import './styles/marketplaceDefaults.css';
import * as apiUtils from './util/api';
import { getSuperLoginAsUser } from './util/cookie';
import * as log from './util/log';
import { createInstance, types as sdkTypes } from './util/sdkLoader';

import { ClientApp } from './app';
import routeConfiguration from './routing/routeConfiguration';
import { mergeConfig } from './util/configHelpers';
import { RootRoute } from './routing/AppRouter';
import initIntercom from './extensions/intercom/mod/intercom/init';

initIntercom();

const moveStylesFn = () => {
  const allRootStyleSheets = document.querySelectorAll('link[rel="stylesheet"]');
  const rootStyleSheet = Array.from(allRootStyleSheets).find((link) => {
    return link.getAttribute('href').match(/\/assets\/index-.*\.css/);
  });

  if (rootStyleSheet) {
    const linkTags = document.querySelectorAll('[data-used-styles]');
    for (let i = 0; i < linkTags.length; i++) {
      document.head.insertBefore(linkTags[i].cloneNode(true), rootStyleSheet.nextSibling);
    }
    for (let i = 0; i < linkTags.length; i++) {
      const parent = linkTags[i].parentNode;
      if (parent) {
        parent.removeChild(linkTags[i]);
      }
    }
  } else {
    moveStyles();
  }
};

const render = async (store, shouldHydrate) => {
  try {
    const state = store.getState();
    const {
      hostedAssets: { version: cdnAssetsVersion },
      auth: { authInfoLoaded },
    } = state;
    await (authInfoLoaded ? Promise.resolve({}) : store.dispatch(authInfo()));
    store.dispatch(fetchCurrentUser());
    const fetchedAppAssets = await store.dispatch(
      fetchAppAssets(defaultConfig.appCdnAssets, cdnAssetsVersion)
    );
    const { translations: translationsRaw, ...rest } = fetchedAppAssets || {};
    const translations = translationsRaw?.data || {};
    const configEntries = Object.entries(rest);
    const hostedConfig = configEntries.reduce((collectedData, [name, content]) => {
      return { ...collectedData, [name]: content.data || {} };
    }, {});

    const appConfig = mergeConfig(hostedConfig, defaultConfig);

    const routeConfig = await routeConfiguration({
      config: appConfig,
      store,
      location: window.location,
    });

    const appProps = {
      store,
      hostedTranslations: translations,
      routeConfig,
      appConfig,
    };

    const router = createBrowserRouter(
      [{ path: '/', Component: RootRoute, children: routeConfig }],
      {
        future: {
          v7_partialHydration: true,
        },
      }
    );

    const rootElement = document.getElementById('root');
    if (shouldHydrate) {
      moveStylesFn();
      hydrateRoot(rootElement, <ClientApp {...appProps} router={router} />);
    } else {
      const root = createRoot(rootElement);
      root.render(<ClientApp {...appProps} router={router} />);
    }
  } catch (e) {
    log.error(e, 'browser-side-render-failed');
  }
};

const setupAnalyticsHandlers = (googleAnalyticsId) => {
  const handlers = [];

  // Log analytics page views and events in dev mode
  if (appSettings.dev) {
    handlers.push(new LoggingAnalyticsHandler());
  }

  // Add Google Analytics 4 (GA4) handler if tracker ID is found
  if (googleAnalyticsId) {
    if (googleAnalyticsId.indexOf('G-') !== 0) {
      console.warn(
        'Google Analytics 4 (GA4) should have measurement id that starts with "G-" prefix'
      );
    } else {
      handlers.push(new GoogleAnalyticsHandler());
    }
  }

  return handlers;
};

log.setup();

const {
  baseUrl: sdkBaseUrl,
  assetCdnBaseUrl: sdkAssetCdnBaseUrl,
  loginAsBaseUrl,
} = appSettings.sdk;

const baseUrl = sdkBaseUrl ? { baseUrl: sdkBaseUrl } : {};
const assetCdnBaseUrl = sdkAssetCdnBaseUrl ? { assetCdnBaseUrl: sdkAssetCdnBaseUrl } : {};

const preloadedState = window.__PRELOADED_STATE__ || '{}';
const shouldHydrate = window.__PRELOADED_STATE__ !== undefined;
const initialState = JSON.parse(preloadedState, sdkTypes.reviver);

const loginAsUser = getSuperLoginAsUser();
const overrideBaseUrlMaybe = loginAsUser ? { baseUrl: loginAsBaseUrl } : {};

const sdk = createInstance({
  transitVerbose: appSettings.sdk.transitVerbose,
  clientId: appSettings.sdk.clientId,
  secure: appSettings.usingSSL,
  typeHandlers: apiUtils.typeHandlers,
  ...baseUrl,
  ...overrideBaseUrlMaybe,
  ...assetCdnBaseUrl,
});

// Note: on localhost:3000, you need to use environment variable.
const googleAnalyticsIdFromSSR = initialState?.hostedAssets?.googleAnalyticsId;
const googleAnalyticsId = googleAnalyticsIdFromSSR || import.meta.env.VITE_GOOGLE_ANALYTICS_ID;
const analyticsHandlers = setupAnalyticsHandlers(googleAnalyticsId);
const store = configureStore(initialState, sdk, analyticsHandlers);

require('./util/polyfills');

render(store, shouldHydrate);

if (appSettings.dev) {
  window.app = {
    appSettings,
    defaultConfig,
    sdk,
    sdkTypes,
    store,
  };
}

// Show warning if CSP is not enabled
const CSP = import.meta.env.VITE_CSP;
const cspEnabled = CSP === 'block' || CSP === 'report';

if (CSP === 'report' && import.meta.env.VITE_ENV === 'production') {
  console.warn(
    'Your production environment should use CSP with "block" mode. Read more from: https://www.sharetribe.com/docs/ftw-security/how-to-set-up-csp-for-ftw/'
  );
} else if (!cspEnabled) {
  console.warn(
    "CSP is currently not enabled! You should add an environment variable VITE_CSP with the value 'report' or 'block'. Read more from: https://www.sharetribe.com/docs/ftw-security/how-to-set-up-csp-for-ftw/"
  );
}
