import React from 'react';
import { matchRoutes } from 'react-router-dom';
import { NamedRedirect } from '../components';
import getPageDataLoadingAPI from '../containers/pageDataLoadingAPI';
import { createRouteConfig } from './routes.utils';
import { getAllExtensionRoutes } from '../extension';

// TODO: update extension route format
const extensionRoutes = await getAllExtensionRoutes();

const pageDataLoadingAPI = getPageDataLoadingAPI();

// https://en.wikipedia.org/wiki/Universally_unique_identifier#Nil_UUID
const draftId = '00000000-0000-0000-0000-000000000000';
const draftSlug = 'draft';

const RedirectToLandingPage = () => <NamedRedirect name="LandingPage" />;

const routeConfiguration = async ({ config = {}, store, location }) => {
  const isUseMap = config.layout.searchPage?.variantType === 'map';
  const isUseCarousel = config.layout.listingPage?.variantType === 'carousel';
  const { accessControl: accessControlConfig } = config;

  const enhancedCreateRouteConfig = (params) => {
    return createRouteConfig({
      ...params,
      config,
      store,
    });
  };

  const isPrivateMarketplace = accessControlConfig?.marketplace?.private === true;
  const authForPrivateMarketplace = isPrivateMarketplace ? { auth: true } : {};

  const routes = [
    {
      name: 'LandingPage',
      path: '/',
      loaders: {
        page: () => import('../containers/LandingPage/LandingPage'),
        duck: () => import('../containers/LandingPage/LandingPage.duck'),
      },
    },
    {
      path: '/p/:pageId',
      name: 'CMSPage',
      loaders: {
        page: () => import('../containers/CMSPage/CMSPage'),
        duck: () => import('../containers/CMSPage/CMSPage.duck'),
      },
    },
    {
      // Public demo of the PoolCalendar (smart calendar product).
      // No auth, no listing required — renders with mock data.
      path: '/calendar-demo',
      name: 'CalendarDemoPage',
      loaders: {
        page: () => import('../containers/CalendarDemoPage/CalendarDemoPage'),
      },
    },
    // NOTE: when the private marketplace feature is enabled, the '/s' route is disallowed by the robots.txt resource.
    // If you add new routes that start with '/s*' (e.g. /support), you should add them to the robotsPrivateMarketplace.txt file.
    {
      path: '/s',
      name: 'SearchPage',
      loaders: {
        page: () => {
          const page = isUseMap ? 'SearchPageWithMap' : 'SearchPageWithGrid';
          return import(`../containers/SearchPage/${page}.js`);
        },
        duck: () => import('../containers/SearchPage/SearchPage.duck'),
      },
      ...authForPrivateMarketplace,
    },
    {
      path: '/s/:listingType',
      name: 'SearchPageWithListingType',
      loaders: {
        page: () => {
          const page = isUseMap ? 'SearchPageWithMap' : 'SearchPageWithGrid';
          return import(`../containers/SearchPage/${page}.js`);
        },
        duck: () => import('../containers/SearchPage/SearchPage.duck'),
      },
      ...authForPrivateMarketplace,
    },
    {
      path: '/l',
      name: 'ListingBasePage',
      Component: RedirectToLandingPage,
    },
    {
      path: '/l/:slug/:id',
      name: 'ListingPage',
      duckName: 'ListingPage',
      loaders: {
        page: () => {
          const page = isUseCarousel ? 'ListingPageCarousel' : 'ListingPageCoverPhoto';
          return import(`../containers/ListingPage/${page}.js`);
        },
        duck: () => import('../containers/ListingPage/ListingPage.duck'),
      },
      ...authForPrivateMarketplace,
    },
    {
      path: '/l/:slug/:id/checkout',
      name: 'CheckoutPage',
      loaders: {
        page: () => import('../containers/CheckoutPage/CheckoutPage'),
      },
      auth: true,
      setInitialValues: pageDataLoadingAPI.CheckoutPage.setInitialValues,
    },
    {
      path: '/l/:slug/:id/:variant',
      name: 'ListingPageVariant',
      duckName: 'ListingPage',
      loaders: {
        page: () => {
          const page = isUseCarousel ? 'ListingPageCarousel' : 'ListingPageCoverPhoto';
          return import(`../containers/ListingPage/${page}.js`);
        },
        duck: () => import('../containers/ListingPage/ListingPage.duck'),
      },
      auth: true,
      authPage: 'LoginPage',
    },
    {
      path: '/l/new',
      name: 'NewListingPage',
      element: (
        <NamedRedirect
          name="EditListingPage"
          params={{ slug: draftSlug, id: draftId, type: 'new', tab: 'details' }}
        />
      ),
    },
    {
      path: '/l/:slug/:id/:type/:tab',
      name: 'EditListingPage',
      duckName: 'EditListingPage',
      loaders: {
        page: () => import('../containers/EditListingPage/EditListingPage'),
        duck: () => import('../containers/EditListingPage/EditListingPage.duck'),
      },
      auth: true,
    },
    {
      path: '/l/:slug/:id/:type/:tab/:returnURLType',
      name: 'EditListingStripeOnboardingPage',
      duckName: 'EditListingPage',
      loaders: {
        page: () => import('../containers/EditListingPage/EditListingPage'),
        duck: () => import('../containers/EditListingPage/EditListingPage.duck'),
      },
      auth: true,
    },
    // Canonical path should be after the `/l/new` path since they
    // conflict and `new` is not a valid listing UUID.
    {
      path: '/l/:id',
      name: 'ListingPageCanonical',
      duckName: 'ListingPage',
      loaders: {
        page: () => {
          const page = isUseCarousel ? 'ListingPageCarousel' : 'ListingPageCoverPhoto';
          return import(`../containers/ListingPage/${page}.js`);
        },
        duck: () => import('../containers/ListingPage/ListingPage.duck'),
      },
      ...authForPrivateMarketplace,
    },
    {
      path: '/u',
      name: 'ProfileBasePage',
      Component: RedirectToLandingPage,
    },
    {
      name: 'ProfilePage',
      path: '/u/:id',
      loaders: {
        page: () => import('../containers/ProfilePage/ProfilePage'),
        duck: () => import('../containers/ProfilePage/ProfilePage.duck'),
      },
      ...authForPrivateMarketplace,
    },
    {
      path: '/u/:id/:variant',
      name: 'ProfilePageVariant',
      duckName: 'ProfilePage',
      auth: true,
      loaders: {
        page: () => import('../containers/ProfilePage/ProfilePage'),
        duck: () => import('../containers/ProfilePage/ProfilePage.duck'),
      },
    },
    {
      path: '/apply-to-host',
      name: 'HostApplicationPage',
      loaders: {
        page: () => import('../containers/HostApplicationPage/HostApplicationPage'),
      },
    },
    {
      path: '/host-academy',
      name: 'HostAcademyPage',
      loaders: {
        page: () => import('../containers/HostAcademyPage/HostAcademyPage'),
      },
    },
    {
      path: '/profile-settings',
      name: 'ProfileSettingsPage',
      loaders: {
        page: () => import('../containers/ProfileSettingsPage/ProfileSettingsPage'),
        duck: () => import('../containers/ProfileSettingsPage/ProfileSettingsPage.duck'),
      },
      auth: true,
      authPage: 'LoginPage',
    },

    // // Note: authenticating with IdP (e.g. Facebook) expects that /login path exists
    // // so that in the error case users can be redirected back to the LoginPage
    // // In case you change this, remember to update the route in server/api/auth/loginWithIdp.js
    {
      path: '/login',
      name: 'LoginPage',
      extraProps: {
        tab: 'login',
      },
      loaders: {
        page: () => import('../containers/AuthenticationPage/AuthenticationPage'),
      },
    },
    {
      path: '/signup/:userType?',
      name: 'SignupPage',
      loaders: {
        page: () => import('../containers/AuthenticationPage/AuthenticationPage'),
        duck: () => import('../containers/AuthenticationPage/AuthenticationPage.duck'),
      },
      extraProps: { tab: 'signup' },
    },
    {
      path: '/confirm',
      name: 'ConfirmPage',
      loaders: {
        page: () => import('../containers/AuthenticationPage/AuthenticationPage'),
        duck: () => import('../containers/AuthenticationPage/AuthenticationPage.duck'),
      },
      extraProps: { tab: 'confirm' },
    },
    {
      path: '/recover-password',
      name: 'PasswordRecoveryPage',
      loaders: {
        page: () => import('../containers/PasswordRecoveryPage/PasswordRecoveryPage'),
        duck: () => import('../containers/PasswordRecoveryPage/PasswordRecoveryPage.duck'),
      },
    },
    {
      path: '/inbox',
      name: 'InboxBasePage',
      element: <NamedRedirect name="InboxPage" params={{ tab: 'sales' }} />,
    },
    {
      path: '/inbox/:tab',
      name: 'InboxPage',
      auth: true,
      authPage: 'LoginPage',
      loaders: {
        page: () => import('../containers/InboxPage/InboxPage'),
        duck: () => import('../containers/InboxPage/InboxPage.duck'),
      },
    },
    {
      path: '/order/:id/:details?',
      name: 'OrderDetailsPage',
      loaders: {
        page: () => import('../containers/TransactionPage/TransactionPage'),
        duck: () => import('../containers/TransactionPage/TransactionPage.duck'),
      },
      extraProps: { transactionRole: 'customer' },
      auth: true,
      authPage: 'LoginPage',
      setInitialValues: pageDataLoadingAPI.TransactionPage.setInitialValues,
    },
    {
      path: '/sale/:id/:details?',
      name: 'SaleDetailsPage',
      loaders: {
        page: () => import('../containers/TransactionPage/TransactionPage'),
        duck: () => import('../containers/TransactionPage/TransactionPage.duck'),
      },
      extraProps: { transactionRole: 'provider' },
      auth: true,
      authPage: 'LoginPage',
    },
    {
      path: '/listings',
      name: 'ManageListingsPage',
      auth: true,
      authPage: 'LoginPage',
      loaders: {
        page: () => import('../containers/ManageListingsPage/ManageListingsPage'),
        duck: () => import('../containers/ManageListingsPage/ManageListingsPage.duck'),
      },
    },
    {
      path: '/account',
      name: 'AccountSettingsPage',
      element: <NamedRedirect name="ContactDetailsPage" />,
    },
    {
      path: '/account/contact-details',
      name: 'ContactDetailsPage',
      auth: true,
      authPage: 'LoginPage',
      loaders: {
        page: () => import('../containers/ContactDetailsPage/ContactDetailsPage'),
        duck: () => import('../containers/ContactDetailsPage/ContactDetailsPage.duck'),
      },
    },
    {
      path: '/account/change-password',
      name: 'PasswordChangePage',
      auth: true,
      authPage: 'LoginPage',
      loaders: {
        page: () => import('../containers/PasswordChangePage/PasswordChangePage'),
        duck: () => import('../containers/PasswordChangePage/PasswordChangePage.duck'),
      },
    },
    {
      path: '/account/payments',
      name: 'StripePayoutPage',
      auth: true,
      authPage: 'LoginPage',
      loaders: {
        page: () => import('../containers/StripePayoutPage/StripePayoutPage'),
        duck: () => import('../containers/StripePayoutPage/StripePayoutPage.duck'),
      },
    },
    {
      path: '/account/payments/:returnURLType',
      name: 'StripePayoutOnboardingPage',
      auth: true,
      authPage: 'LoginPage',
      duckName: 'StripePayoutPage',
      loaders: {
        page: () => import('../containers/StripePayoutPage/StripePayoutPage'),
        duck: () => import('../containers/StripePayoutPage/StripePayoutPage.duck'),
      },
    },
    {
      path: '/account/payment-methods',
      name: 'PaymentMethodsPage',
      auth: true,
      authPage: 'LoginPage',
      loaders: {
        page: () => import('../containers/PaymentMethodsPage/PaymentMethodsPage'),
        duck: () => import('../containers/PaymentMethodsPage/PaymentMethodsPage.duck'),
      },
    },
    {
      path: '/terms-of-service',
      name: 'TermsOfServicePage',
      loaders: {
        page: () => import('../containers/TermsOfServicePage/TermsOfServicePage'),
        duck: () => import('../containers/TermsOfServicePage/TermsOfServicePage.duck'),
      },
    },
    {
      path: '/host-standards',
      name: 'HostPreparednessPolicyPage',
      loaders: {
        page: () => import('../containers/HostPreparednessPolicyPage/HostPreparednessPolicyPage'),
      },
    },
    {
      path: '/privacy-policy',
      name: 'PrivacyPolicyPage',
      loaders: {
        page: () => import('../containers/PrivacyPolicyPage/PrivacyPolicyPage'),
        duck: () => import('../containers/PrivacyPolicyPage/PrivacyPolicyPage.duck'),
      },
    },
    {
      path: '/no-access-right/:missingAccessRight',
      name: 'NoAccessPage',
      loaders: {
        page: () => import('../containers/NoAccessPage/NoAccessPage'),
      },
    },

    // // Do not change this path!
    // //
    // // The API expects that the application implements /reset-password endpoint
    {
      path: '/reset-password',
      name: 'PasswordResetPage',
      loaders: {
        page: () => import('../containers/PasswordResetPage/PasswordResetPage'),
        duck: () => import('../containers/PasswordResetPage/PasswordResetPage.duck'),
      },
    },

    // // Do not change this path!
    // //
    // // The API expects that the application implements /verify-email endpoint
    {
      path: '/verify-email',
      name: 'EmailVerificationPage',
      auth: true,
      authPage: 'LoginPage',
      loaders: {
        page: () => import('../containers/EmailVerificationPage/EmailVerificationPage'),
        duck: () => import('../containers/EmailVerificationPage/EmailVerificationPage.duck'),
      },
    },
    // // Do not change this path!
    // //
    // // The API expects that the application implements /preview endpoint
    {
      path: '/preview',
      name: 'PreviewResolverPage',
      loaders: {
        page: () => import('../containers/PreviewResolverPage/PreviewResolverPage'),
      },
    },
    ...extensionRoutes,
    {
      path: '*',
      name: 'NotFoundPage',
      loaders: {
        page: () => import('../containers/NotFoundPage/NotFoundPage'),
      },
    },
  ].map(enhancedCreateRouteConfig);

  if (!location) {
    return routes;
  }

  // Remove the `lazy` route after loaded in the server side
  // https://reactrouter.com/en/main/guides/ssr#lazy-routes
  const lazyMatches = matchRoutes(routes, location)?.filter((m) => m.route.lazy) ?? [];

  if (lazyMatches.length > 0) {
    // allSettled to avoid dymaic import error in the client side because of the `lazy` route
    await Promise.allSettled(
      lazyMatches.map(async (m) => {
        const routeModule = await m.route.lazy();
        Object.assign(m.route, {
          ...routeModule,
          lazy: undefined,
        });
      })
    );
  }

  return routes;
};

export default routeConfiguration;
