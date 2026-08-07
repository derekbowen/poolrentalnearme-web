import React from 'react';
import { FormattedMessage } from '../../util/reactIntl';
import { isTooManyEmailVerificationRequestsError } from '../../util/errors';
import IconEmailAttention from '../IconEmailAttention/IconEmailAttention';

import css from './ModalMissingInformation.module.css';

const EmailReminder = props => {
  const { className, user, sendVerificationEmailError } = props;

  const email = user.id ? <span className={css.email}>{user.attributes.email}</span> : '';

  const resendErrorTranslationId = isTooManyEmailVerificationRequestsError(
    sendVerificationEmailError
  )
    ? 'ModalMissingInformation.resendFailedTooManyRequests'
    : 'ModalMissingInformation.resendFailed';
  const resendErrorMessage = sendVerificationEmailError ? (
    <p className={css.error}>
      <FormattedMessage id={resendErrorTranslationId} />
    </p>
  ) : null;

  return (
    <div className={className}>
      <IconEmailAttention className={css.modalIcon} />
      <p className={css.modalTitle}>
        <FormattedMessage id="ModalMissingInformation.verifyEmailTitle" />
      </p>
      <p className={css.modalMessage}>
        <FormattedMessage id="ModalMissingInformation.verifyEmailText" />
      </p>
      <p className={css.modalMessage}>
        <FormattedMessage id="ModalMissingInformation.checkInbox" values={{ email }} />
      </p>
      {resendErrorMessage}

      <div className={css.bottomWrapper}>
        {/* Brandon's note: nothing clickable here. Read it, go to the inbox.
            The spam / approved-sender advice is text, not a button. */}
        <p className={css.helperText}>
          <FormattedMessage id="ModalMissingInformation.spamHelp" />
        </p>
      </div>
    </div>
  );
};

export default EmailReminder;
