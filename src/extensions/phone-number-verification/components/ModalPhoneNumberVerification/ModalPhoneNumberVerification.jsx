import React, { forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import { func } from 'prop-types';
import Modal from 'components/Modal/Modal';
import { useDispatch, useSelector } from 'react-redux';
import { sendOTP, verifyOTP } from 'ducks/auth.duck';
import { useIntl } from 'react-intl';
import { Heading } from 'components/Heading/Heading';
import { InlineTextButton } from 'components/Button/Button';
import { isExceedRateLimitError, isInvalidOTPError } from 'util/errors';
import { INITIAL_TIME_COUNT } from '../../config/configPhoneNumberVerification';
import Counter from './Counter';
import PhoneNumberVerification from '../PhoneNumberVerification/PhoneNumberVerification';

import css from './ModalPhoneNumberVerification.module.css';

const maskPhoneNumber = (phoneNumber) => {
  const lastThreeDigits = phoneNumber.slice(-3);
  return lastThreeDigits.padStart(6, '*');
};

const ModalPhoneNumberVerification = forwardRef(({ onManageDisableScrolling, onSubmit }, ref) => {
  const [userParams, setUserParams] = useState(null);
  const onOpen = useCallback((params) => setUserParams(params), []);
  const onClose = useCallback(() => {
    setUserParams(null);
  }, []);
  const dispatch = useDispatch();
  const intl = useIntl();
  const verifyOTPInProgress = useSelector((state) => state.auth.verifyOTPInProgress);
  const verifyOTPError = useSelector((state) => state.auth.verifyOTPError);
  const sendOTPError = useSelector((state) => state.auth.sendOTPError);

  const { email = '', phoneNumber = '' } = userParams || {};

  useImperativeHandle(
    ref,
    () => ({
      onOpen,
      onClose,
    }),
    [onClose, onOpen]
  );
  const isVisible = !!userParams;

  const handleSubmit = async (otp) => {
    await dispatch(
      verifyOTP({
        otp,
        email,
      })
    );

    onSubmit();
    onClose();
  };

  const renderComponent = (count, resetCounter) => {
    const handleResentOTP = () => {
      resetCounter();
      dispatch(sendOTP({ email, phoneNumber }));
    };

    return count > 0 ? (
      <p>{count}</p>
    ) : (
      <InlineTextButton onClick={handleResentOTP} rootClassName={css.resendBtn}>
        {intl.formatMessage({ id: 'ModalPhoneNumberVerification.resendOTP' })}
      </InlineTextButton>
    );
  };

  return isVisible ? (
    <Modal
      id="PhoneNumberVerification"
      containerClassName={css.modalContainer}
      contentClassName={css.modalContent}
      isOpen={isVisible}
      onClose={onClose}
      usePortal
      onManageDisableScrolling={onManageDisableScrolling}
    >
      <div className={css.content}>
        <Heading as="h1" rootClassName={css.modalTitle}>
          {intl.formatMessage({ id: 'PhoneNumberVerification.verifyPhoneNumberTitle' })}
        </Heading>
        <p>
          {intl.formatMessage(
            { id: 'ModalPhoneNumberVerification.description' },
            { phoneNumber: maskPhoneNumber(phoneNumber) }
          )}
        </p>
        <PhoneNumberVerification onSubmit={handleSubmit} />
        {verifyOTPInProgress && (
          <p className={css.verifyOTPInProgress}>
            {intl.formatMessage({ id: 'ModalPhoneNumberVerification.verifyOTPInProgress' })}
          </p>
        )}
        <div className={css.resendOTP}>
          <p className={css.notReceiveOTP}>
            {intl.formatMessage({ id: 'ModalPhoneNumberVerification.notReceiveOTP' })}
          </p>
          <Counter initialCount={INITIAL_TIME_COUNT}>{renderComponent}</Counter>
        </div>
        {isInvalidOTPError(verifyOTPError) && (
          <p className={css.error}>
            {intl.formatMessage({ id: 'ModalPhoneNumberVerification.invalidOTP' })}
          </p>
        )}
        {isExceedRateLimitError(verifyOTPError || sendOTPError) && (
          <p className={css.error}>
            {intl.formatMessage({ id: 'ModalPhoneNumberVerification.exceedRateLimit' })}
          </p>
        )}
      </div>
    </Modal>
  ) : null;
});

ModalPhoneNumberVerification.propTypes = {
  onManageDisableScrolling: func.isRequired,
  onSubmit: func.isRequired,
};

export default ModalPhoneNumberVerification;
