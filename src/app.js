/* eslint-disable react/forbid-prop-types */
import difference from 'lodash/difference';
import mapValues from 'lodash/mapValues';
import moment from 'moment';
import { any } from 'prop-types';
import { useEffect } from 'react';
import { HelmetProvider } from 'react-helmet-async';
import { Provider } from 'react-redux';
import { StaticRouterProvider } from 'react-router-dom/server.mjs';
import { RouterProvider } from 'react-router-dom';
import { MaintenanceMode } from './components';
import defaultConfig from './config/configDefault';
import appSettings from './config/settings';
import { ConfigurationProvider } from './context/configurationContext';
import { RouteConfigurationProvider } from './context/routeConfigurationContext';
import { getAllExtensionTranslationFile } from './extension';
import defaultMessages from './translations/en.json';
import { mergeConfig } from './util/configHelpers';
import { IncludeScripts } from './util/includeScripts';
import { IntlProvider } from './util/reactIntl';
import { includeCSSProperties } from './util/style';

const extensionTranslations = await getAllExtensionTranslationFile();

const messagesInLocale = {};

const addMissingTranslations = (sourceLangTranslations, targetLangTranslations) => {
  const sourceKeys = Object.keys(sourceLangTranslations);
  const targetKeys = Object.keys(targetLangTranslations);

  // if there's no translations defined for target language, return source translations
  if (targetKeys.length === 0) {
    return sourceLangTranslations;
  }
  const missingKeys = difference(sourceKeys, targetKeys);

  const addMissingTranslation = (translations, missingKey) => ({
    ...translations,
    [missingKey]: sourceLangTranslations[missingKey],
  });

  return missingKeys.reduce(addMissingTranslation, targetLangTranslations);
};

const marketplaceDefaultMessage = {
  ...defaultMessages,
  ...extensionTranslations,
};

const isTestEnv = import.meta.env.VITE_ENV === 'test';
const localeMessages = isTestEnv
  ? mapValues(marketplaceDefaultMessage, (val, key) => key)
  : addMissingTranslations(marketplaceDefaultMessage, messagesInLocale);

// For customized apps, this dynamic loading of locale files is not necessary.
// It helps locale change from configDefault.js file or hosted configs, but customizers should probably
// just remove this and directly import the necessary locale on step 2.
const MomentLocaleLoader = (props) => {
  const { children, locale } = props;

  useEffect(() => {
    moment.updateLocale(locale.toLowerCase());
  }, [locale]);

  return children;
};

const Configurations = (props) => {
  const { appConfig, children, routeConfig } = props;
  const locale = isTestEnv ? 'en' : appConfig.localization.locale;

  return (
    <ConfigurationProvider value={appConfig}>
      <MomentLocaleLoader locale={locale}>
        <RouteConfigurationProvider value={routeConfig}>{children}</RouteConfigurationProvider>
      </MomentLocaleLoader>
    </ConfigurationProvider>
  );
};

const MaintenanceModeError = (props) => {
  const { locale, messages, helmetContext } = props;
  return (
    <IntlProvider locale={locale} messages={messages} textComponent="span">
      <HelmetProvider context={helmetContext}>
        <MaintenanceMode />
      </HelmetProvider>
    </IntlProvider>
  );
};

// This displays a warning if environment variable key contains a string "SECRET"
const EnvironmentVariableWarning = (props) => {
  const { suspiciousEnvKey } = props;
  // https://github.com/sharetribe/flex-integration-api-examples#warning-usage-with-your-web-app--website
  const containsINTEG = (str) => str.toUpperCase().includes('INTEG');
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
      }}
    >
      <div style={{ width: '600px' }}>
        <p>
          Are you sure you want to reveal to the public web an environment variable called:{' '}
          <b>{suspiciousEnvKey}</b>
        </p>
        <p>
          All the environment variables that start with <i>VITE_</i> prefix will be part of the
          published React app that's running on a browser. Those variables are, therefore, visible
          to anyone on the web. Secrets should only be used on a secure environment like the server.
        </p>
        {containsINTEG(suspiciousEnvKey) ? (
          <p>
            {'Note: '}
            <span style={{ color: 'red' }}>
              Do not use Integration API directly from the web app.
            </span>
          </p>
        ) : null}
      </div>
    </div>
  );
};

export const ClientApp = (props) => {
  const { store, hostedTranslations = {}, router, routeConfig, appConfig } = props;

  // Show warning on the localhost:3000, if the environment variable key contains "SECRET"
  if (appSettings.dev) {
    const envVars = import.meta.env || {};
    const envVarKeys = Object.keys(envVars);
    const containsSECRET = (str) => str.toUpperCase().includes('SECRET');
    const suspiciousSECRETKey = envVarKeys.find(
      (key) => key.startsWith('VITE_') && containsSECRET(key)
    );

    if (suspiciousSECRETKey) {
      return <EnvironmentVariableWarning suspiciousEnvKey={suspiciousSECRETKey} />;
    }
  }

  // Show MaintenanceMode if the mandatory configurations are not available
  if (!appConfig.hasMandatoryConfigurations) {
    return (
      <MaintenanceModeError
        locale={appConfig.localization.locale}
        messages={{ ...localeMessages, ...hostedTranslations }}
      />
    );
  }

  // Marketplace color and the color for <PrimaryButton> come from configs
  // If set, we need to create CSS Property and set it to DOM (documentElement is selected here)
  // This provides marketplace color for everything under <html> tag (including modals/portals)
  // Note: This is also set on Page component to provide server-side rendering.
  const elem = window.document.documentElement;
  includeCSSProperties(appConfig.branding, elem);

  return (
    <Configurations appConfig={appConfig} store={store} routeConfig={routeConfig}>
      <IntlProvider
        locale={appConfig.localization.locale}
        messages={{ ...localeMessages, ...hostedTranslations }}
        textComponent="span"
      >
        <Provider store={store}>
          <HelmetProvider>
            <IncludeScripts config={appConfig} />
            <RouterProvider router={router} />
          </HelmetProvider>
        </Provider>
      </IntlProvider>
    </Configurations>
  );
};

ClientApp.propTypes = { store: any.isRequired };

export const ServerApp = (props) => {
  const {
    context,
    helmetContext,
    store,
    hostedTranslations = {},
    hostedConfig = {},
    router,
    routeConfig,
  } = props;
  const appConfig = mergeConfig(hostedConfig, defaultConfig);
  HelmetProvider.canUseDOM = false;

  // Show MaintenanceMode if the mandatory configurations are not available
  if (!appConfig.hasMandatoryConfigurations) {
    return (
      <MaintenanceModeError
        locale={appConfig.localization.locale}
        messages={{ ...localeMessages, ...hostedTranslations }}
        helmetContext={helmetContext}
      />
    );
  }

  return (
    <Configurations appConfig={appConfig} routeConfig={routeConfig}>
      <IntlProvider
        locale={appConfig.localization.locale}
        messages={{ ...localeMessages, ...hostedTranslations }}
        textComponent="span"
      >
        <Provider store={store}>
          <HelmetProvider context={helmetContext}>
            <IncludeScripts config={appConfig} />
            <StaticRouterProvider hydrate router={router} context={context} />
          </HelmetProvider>
        </Provider>
      </IntlProvider>
    </Configurations>
  );
};

ServerApp.propTypes = { context: any.isRequired, store: any.isRequired };
