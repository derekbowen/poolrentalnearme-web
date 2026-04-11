/* eslint-disable import/prefer-default-export */
import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Outlet, ScrollRestoration, useNavigation } from 'react-router-dom';
import isEqual from 'lodash/isEqual';
import pick from 'lodash/pick';
import ModalMissingInformation from '../components/ModalMissingInformation/ModalMissingInformation';
import TopbarLoadingIndicator from '../components/TopbarLoadingIndicator/TopbarLoadingIndicator';
import { manageDisableScrolling } from '../ducks/ui.duck';
import { sendVerificationEmail } from '../ducks/user.duck';

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

export const RootRoute = () => {
  const navigation = useNavigation();

  return (
    <>
      {navigation.state === 'loading' && <TopbarLoadingIndicator />}
      <Outlet />
      <ScrollRestoration />
    </>
  );
};
