/* eslint-disable import/prefer-default-export */
import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Outlet, ScrollRestoration, useLocation, useNavigation } from 'react-router-dom';
import isEqual from 'lodash/isEqual';
import pick from 'lodash/pick';
import ModalMissingInformation from '../components/ModalMissingInformation/ModalMissingInformation';
import TopbarLoadingIndicator from '../components/TopbarLoadingIndicator/TopbarLoadingIndicator';
import {
  COMPACT_QUERY as TEXT_US_COMPACT_QUERY,
  shouldHide as shouldHideTextUs,
} from '../components/TextUsBubble/textUsLogic';
import { useRouteConfiguration } from '../context/routeConfigurationContext';
import { isScrollingDisabled, manageDisableScrolling } from '../ducks/ui.duck';
import useMediaQuery from '../hooks/useMediaQuery';
import { sendVerificationEmail } from '../ducks/user.duck';
import { matchPathname } from '../util/routes';

import css from './AppRouter.module.css';

// only re-render when these fields change
const checkFields = [
  'currentUser',
  'currentUserHasListings',
  'sendVerificationEmailInProgress',
  'currentUserHasOrders',
  'sendVerificationEmailError',
];

const userStateEquality = (prevState, nextState) => {
  return isEqual(pick(prevState, checkFields), pick(nextState, checkFields));
};

const Reminder = () => {
  const {
    currentUser,
    currentUserHasListings,
    sendVerificationEmailInProgress,
    currentUserHasOrders,
    sendVerificationEmailError,
  } = useSelector((state) => state.user, userStateEquality);

  const dispatch = useDispatch();
  const onManageDisableScrolling = (componentId, disableScrolling) =>
    dispatch(manageDisableScrolling(componentId, disableScrolling));
  const onResendVerificationEmail = () => dispatch(sendVerificationEmail());

  return (
    <ModalMissingInformation
      containerClassName={css.missingInformationModal}
      currentUser={currentUser}
      currentUserHasListings={currentUserHasListings}
      currentUserHasOrders={currentUserHasOrders}
      onManageDisableScrolling={onManageDisableScrolling}
      onResendVerificationEmail={onResendVerificationEmail}
      sendVerificationEmailInProgress={sendVerificationEmailInProgress}
      sendVerificationEmailError={sendVerificationEmailError}
    />
  );
};

// "Text us" bubble, client-only. Effects never run during SSR and the first
// client render returns null, so server HTML is unchanged and hydration cannot
// mismatch. The UI is a separate chunk, fetched after hydration and only once
// the visitor is on a route that shows it (see textUsLogic.js shouldHide).
//
// Hidden (unmounted, so its state resets and #prnm-cta is restored) when:
//   - the route has a payment form or a fixed booking/accept bar
//     (HIDE_ON_ROUTES);
//   - the listing editor is at <=1024px, where its full-width Save/Publish
//     button sits in the launcher's spot (HIDE_ON_COMPACT_ROUTES);
//   - ANY Modal is open. This is what keeps the bubble off the /s mobile
//     filters sheet and its fixed "Show N listings" bar. A z-index cannot
//     do it: that sheet is ModalInMobile -> Modal rendered IN PLACE (not in
//     a portal), so its `.isOpenInPlace` (fixed, z-index 100) is trapped
//     inside SearchFiltersMobile `.root` (position: sticky; z-index: 1),
//     inside SearchPageWithMap `.searchResultContainer` (z-index: 1). Its
//     effective level at the root is 1; the bubble would have to drop below
//     1, i.e. under ordinary page content. Instead we read the open state:
//     Modal dispatches manageDisableScrolling(id, true) when it opens
//     (Modal.js componentDidMount / componentDidUpdate) and (id, false) when
//     it closes or unmounts, and isScrollingDisabled is exactly "some Modal
//     holds that lock". The same signal is what stops the page scrolling, so
//     it cannot be stale without the page visibly breaking too. It also
//     covers the mobile menu, the map sheet and every other Modal.
const TextUsMount = () => {
  const { pathname } = useLocation();
  const routeConfiguration = useRouteConfiguration();
  const scrollLocked = useSelector(isScrollingDisabled);
  const compact = useMediaQuery(TEXT_US_COMPACT_QUERY);
  const [Bubble, setBubble] = useState(null);

  const matched = routeConfiguration ? matchPathname(pathname, routeConfiguration) : [];
  const hidden = shouldHideTextUs(matched[0]?.route?.name, { compact, scrollLocked });

  useEffect(() => {
    if (hidden || Bubble) return undefined;
    let cancelled = false;
    import('../components/TextUsBubble/TextUsBubble')
      .then((mod) => {
        if (!cancelled) setBubble(() => mod.default);
      })
      .catch(() => {
        // Chunk failed to load: no bubble; the page itself is unaffected.
      });
    return () => {
      cancelled = true;
    };
  }, [hidden, Bubble]);

  if (hidden || !Bubble) return null;
  return <Bubble pathname={pathname} />;
};

export const RootRoute = () => {
  const navigation = useNavigation();

  return (
    <>
      {navigation.state === 'loading' && <TopbarLoadingIndicator />}
      <Outlet />
      <ScrollRestoration />
      <TextUsMount />
    </>
  );
};
