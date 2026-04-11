/**
 * Logging
 *
 * Should be used to log errors to console or and eternal
 * error logging system, like Sentry for example.
 * Should also be used for logging any other information
 * In the future when we have a logging analytics system we would use that.
 *
 */

import * as Sentry from '@sentry/browser';
import appSettings from '../config/settings';
import defaultConfig from '../config/configDefault';

const { marketplaceRootURL } = defaultConfig;

const ingoreErrorsMap = {
  'ResizeObserver loop limit exceeded': true, // Some exotic browsers seems to emit these.
  'Error reading': true, // Ignore file reader errors (ImageFromFile)
  'AxiosError: Network Error': true,
};

const pickSelectedErrors = (ignored, entry) => {
  const [key, value] = entry;
  return value === true ? [...ignored, key] : ignored;
};

/**
 * Set up error handling. If a Sentry DSN is
 * provided a Sentry client will be installed.
 */
export const setup = () => {
  if (appSettings.sentryDsn) {
    const ignoreErrors = Object.entries(ingoreErrorsMap).reduce(pickSelectedErrors, []);

    // Configures the Sentry client. Adds a handler for
    // any uncaught exception.
    Sentry.init({
      dsn: appSettings.sentryDsn,
      environment: appSettings.env,
      ignoreErrors,
      // eslint-disable-next-line new-cap
      integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
      // We recommend adjusting this value in production, or using tracesSampler
      // for finer control
      tracesSampleRate: appSettings.dev ? 1.0 : 0.1,
      replaysSessionSampleRate: appSettings.dev ? 1.0 : 0.1, // Production should sets the sample rate at 10%. You may want to change it to 100% while in development
      replaysOnErrorSampleRate: 1.0,

      tracePropagationTargets: [
        'localhost',
        'flex-api.sharetribe.com',
        marketplaceRootURL,
        /^\/api\//,
      ],
    });
  }
};

/**
 * Set user ID for the logger so that it
 * can be attached to Sentry issues.
 *
 * @param {String} userId ID of current user
 */
export const setUserId = (userId) => {
  Sentry.setUser({ id: userId });
};

/**
 * Clears the user ID.
 */

export const clearUserId = () => {
  Sentry.setUser(null);
};

const printAPIErrorsAsConsoleTable = (apiErrors) => {
  // eslint-disable-next-line no-console
  if (apiErrors != null && apiErrors.length > 0 && typeof console.table === 'function') {
    console.error('Errors returned by Marketplace API call:');
    // eslint-disable-next-line no-console
    console.table(apiErrors.map((err) => ({ status: err.status, code: err.code, ...err.meta })));
  }
};

const responseApiErrorInfo = (err) =>
  (err?.data?.errors || []).map((e) => ({
    status: e.status,
    code: e.code,
    meta: e.meta,
  }));

/**
 * Logs an exception. If Sentry is configured
 * sends the error information there. Otherwise
 * prints the error to the console.
 *
 * @param {Error} e Error that occurred
 * @param {String} code Error code
 * @param {Object} data Additional data to be sent to Sentry
 */
export const error = (e, code, data) => {
  const apiErrors = responseApiErrorInfo(e);
  if (appSettings.sentryDsn) {
    const extra = { ...data, apiErrorData: apiErrors };

    Sentry.withScope((scope) => {
      scope.setTag('code', code || 'unexpected');
      Object.keys(extra).forEach((key) => {
        scope.setExtra(key, extra[key]);
      });
      Sentry.captureException(e);
    });
  }
  console.error(e);
  console.error('Error code:', code, 'data:', data);
  printAPIErrorsAsConsoleTable(apiErrors);
};

// eslint-disable-next-line no-console
export const info = (...args) => console.info(...args);

// eslint-disable-next-line no-console
export const warn = (...args) => console.warn(...args);

// eslint-disable-next-line no-console
export const log = (...args) => console.log(...args);

// eslint-disable-next-line no-console
export const trace = (...args) => console.trace(...args);

const setCause = (error, cause) => {
  const seenErrors = new WeakSet();

  const setCauseIfNoExistingCause = (error, cause) => {
    if (seenErrors.has(error)) {
      return;
    }
    if (error.cause) {
      seenErrors.add(error);
      return setCauseIfNoExistingCause(error.cause, cause);
    }
    error.cause = cause;
  };

  setCauseIfNoExistingCause(error, cause);
};

export const onRecoverableError = (error, componentStack) => {
  let data = {};

  if (componentStack) {
    // Generating this synthetic error allows monitoring services to apply sourcemaps
    // to unminify the stacktrace and make it readable.
    const errorBoundaryError = new Error(error.message);
    errorBoundaryError.name = `React ErrorBoundary ${errorBoundaryError.name}`;
    errorBoundaryError.stack = componentStack;

    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/cause
    setCause(error, errorBoundaryError);

    data.componentStack = componentStack;
  }

  // Replace with your error monitoring service.
  error(error, 'recoverable-error', data);
};
