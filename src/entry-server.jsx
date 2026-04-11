import React from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import { createInstance, tokenStore } from 'sharetribe-flex-sdk';
import { createStaticHandler, createStaticRouter } from 'react-router-dom/server.mjs';
import { HelmetData } from 'react-helmet-async';
import { ServerApp } from './app';
import configureStore from './store';
import routeConfiguration from './routing/routeConfiguration';
import { RootRoute } from './routing/AppRouter';
import defaultConfig from './config/configDefault';
import { mergeConfig } from './util/configHelpers';
import { fetchAppAssets } from './ducks/hostedAssets.duck';
import { fetchCurrentUser } from './ducks/user.duck';
import { authInfo } from './ducks/auth.duck';
import appSettings from './config/settings';
import * as apiUtils from './util/api';
import { getSuperLoginAsUser } from './util/cookie';

const extractHostedConfig = (configAssets) => {
  const configEntries = Object.entries(configAssets);
  return configEntries.reduce((collectedData, [name, content]) => {
    return { ...collectedData, [name]: content?.data || {} };
  }, {});
};

function createFetchRequest(req, res) {
  const { protocol, originalUrl, url: requestUrl, method, headers, body } = req;
  const origin = `${protocol}://${req.get('host')}`;
  const url = new URL(originalUrl || requestUrl, origin);

  const controller = new AbortController();
  res.on('close', () => controller.abort());

  const init = {
    method,
    headers,
    signal: controller.signal,
  };

  if (method !== 'GET' && method !== 'HEAD') {
    init.body = body;
  }

  return new Request(url.href, init);
}

// eslint-disable-next-line import/prefer-default-export
export const renderApp = async ({ options = {}, req, res, preventDataLoadingInSsr = false }) => {
  const { originalUrl, url } = req;
  const helmetContext = new HelmetData({});
  const {
    baseUrl: sdkBaseUrl,
    assetCdnBaseUrl: sdkAssetCdnBaseUrl,
    loginAsBaseUrl,
  } = appSettings.sdk;

  const baseUrl = sdkBaseUrl ? { baseUrl: sdkBaseUrl } : {};
  const assetCdnBaseUrl = sdkAssetCdnBaseUrl ? { assetCdnBaseUrl: sdkAssetCdnBaseUrl } : {};
  const loginAsUser = getSuperLoginAsUser(req);
  const loginAsConfigMaybe = loginAsUser
    ? {
        baseUrl: loginAsBaseUrl,
        headers: {
          cookie: req.headers.cookie,
        },
      }
    : {};
  const sdk = createInstance({
    transitVerbose: appSettings.sdk.transitVerbose,
    clientId: appSettings.sdk.clientId,
    secure: appSettings.usingSSL,
    typeHandlers: apiUtils.typeHandlers,
    tokenStore: tokenStore.expressCookieStore({
      clientId: appSettings.sdk.clientId,
      req,
      res,
      secure: appSettings.usingSSL,
    }),
    ...baseUrl,
    ...loginAsConfigMaybe,
    ...assetCdnBaseUrl,
  });

  const store = configureStore({}, sdk);

  let hostedConfig = {};
  let translations = {};
  let routeConfig = [];
  let context = {
    matches: [],
  };

  let router = createStaticRouter(
    [{ path: '/', Component: RootRoute, children: routeConfig }],
    context
  );

  if (!preventDataLoadingInSsr) {
    await store.dispatch(authInfo());
    const [fetchedAppAssets] = await Promise.all([
      store.dispatch(fetchAppAssets(defaultConfig.appCdnAssets)),
      store.dispatch(fetchCurrentUser()),
    ]);
    const { translations: translationsRaw, ...rest } = fetchedAppAssets || {};
    hostedConfig = extractHostedConfig(rest);
    const config = mergeConfig(hostedConfig, defaultConfig);

    routeConfig = await routeConfiguration({
      config,
      store,
    });
    const { query, dataRoutes } = createStaticHandler([
      { path: '/', Component: RootRoute, children: routeConfig },
    ]);

    const fetchRequest = createFetchRequest(req, res);
    context = await query(fetchRequest);

    translations = translationsRaw?.data || {};
    router = createStaticRouter(dataRoutes, context);
  }

  return {
    ...renderToPipeableStream(
      <ServerApp
        url={originalUrl ?? url}
        helmetContext={helmetContext}
        store={store}
        hostedTranslations={translations}
        hostedConfig={hostedConfig}
        router={router}
        context={context}
        routeConfig={routeConfig}
      />,
      options
    ),
    preloadedState: store.getState(),
    helmetContext,
  };
};
