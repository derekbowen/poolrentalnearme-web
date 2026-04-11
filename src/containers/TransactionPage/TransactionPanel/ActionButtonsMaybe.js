import React from 'react';
import classNames from 'classnames';

import { useIntl } from 'react-intl';
import {
  ERROR_CODE_MISSING_STRIPE_ACCOUNT,
  ERROR_CODE_PAYMENT_FAILED,
  ERROR_CODE_MISSING_DEFAULT_PAYMENT_METHOD,
} from 'util/types';
import { PrimaryButton, SecondaryButton } from '../../../components';

import css from './TransactionPanel.module.css';

const isPaymentError = (error) => {
  const { code } = error;
  switch (code) {
    case ERROR_CODE_MISSING_STRIPE_ACCOUNT:
    case ERROR_CODE_PAYMENT_FAILED:
    case ERROR_CODE_MISSING_DEFAULT_PAYMENT_METHOD:
      return true;
    default:
      return false;
  }
};

const getPaymentErrorMaybe = ({ error, intl }) => {
  const { lastTransition, apiErrors } = error || {};
  const paymentError = apiErrors?.find(isPaymentError);
  const paymentErrorMessage = paymentError
    ? intl.formatMessage({
        id: `TransactionPanel.paymentError.${paymentError.code}`,
        defaultMessage: paymentError.title,
      })
    : null;
  return { message: paymentErrorMessage, lastTransition };
};

// Functional component as a helper to build ActionButtons
const ActionButtonsMaybe = (props) => {
  const {
    className,
    rootClassName,
    showButtons,
    primaryButtonProps,
    secondaryButtonProps,
    isListingDeleted,
    isProvider,
    disabledActionButtons,
  } = props;
  const intl = useIntl();

  // In default processes default processes need special handling
  // Booking: provider should not be able to accept on-going transactions
  // Product: customer should be able to dispute etc. on-going transactions
  if (isListingDeleted && isProvider) {
    return null;
  }
  const primaryPaymentError = getPaymentErrorMaybe({
    error: primaryButtonProps?.error,
    intl,
  });
  const secondaryPaymentError = getPaymentErrorMaybe({
    error: secondaryButtonProps?.error,
    intl,
  });
  const hasPaymentError = primaryPaymentError || secondaryPaymentError;

  const buttonsDisabled =
    primaryButtonProps?.inProgress || secondaryButtonProps?.inProgress || disabledActionButtons;

  const primaryButton = primaryButtonProps ? (
    <PrimaryButton
      inProgress={primaryButtonProps.inProgress}
      disabled={buttonsDisabled}
      onClick={primaryButtonProps.onAction}
    >
      {primaryButtonProps.buttonText}
    </PrimaryButton>
  ) : null;

  const secondaryButton = secondaryButtonProps ? (
    <SecondaryButton
      inProgress={secondaryButtonProps?.inProgress}
      disabled={buttonsDisabled}
      onClick={secondaryButtonProps.onAction}
    >
      {secondaryButtonProps.buttonText}
    </SecondaryButton>
  ) : null;

  const classes = classNames(rootClassName || css.actionButtons, className);

  const primaryButtonTransition = primaryButtonProps?.transitionName;
  const secondaryButtonTransition = secondaryButtonProps?.transitionName;

  const primaryErrorMessage =
    primaryButtonProps?.error?.lastTransition === primaryButtonTransition ? (
      <p className={css.actionError}>{primaryButtonProps?.errorText}</p>
    ) : null;
  const secondaryErrorMessage =
    secondaryButtonProps?.error?.lastTransition === secondaryButtonTransition ? (
      <p className={css.actionError}>{secondaryButtonProps?.errorText}</p>
    ) : null;

  return showButtons ? (
    <div className={classes}>
      <div className={css.actionButtonWrapper}>
        {secondaryButton}
        {primaryButton}
      </div>
      <div className={css.actionErrors}>
        {primaryErrorMessage}
        {secondaryErrorMessage}
      </div>
      {hasPaymentError ? (
        <div className={css.actionErrors}>
          {primaryButtonTransition === primaryPaymentError?.lastTransition ? (
            <p className={css.actionError}>{primaryPaymentError.message}</p>
          ) : null}
          {secondaryButtonTransition === secondaryPaymentError?.lastTransition ? (
            <p className={css.actionError}>{secondaryPaymentError.message}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  ) : null;
};

export default ActionButtonsMaybe;
