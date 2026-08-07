import React from 'react';

import { FormattedMessage } from '../../util/reactIntl';

import { Heading, IconEmailSent } from '../../components';

import css from './AuthenticationPage.module.css';

// c146 (Brandon spec 2.1): no interactive exits on this screen. No LATER
// close, no resend link, no fix-email link. One instruction - go to your
// inbox - with static deliverability guidance underneath. The only way out
// is the email itself (or closing the tab, which is not ours to offer).
const EmailVerificationInfo = props => {
  const { email, resendErrorMessage } = props;

  return (
    <div className={css.content}>
      <IconEmailSent className={css.modalIcon} />
      <Heading as="h1" rootClassName={css.modalTitle}>
        <FormattedMessage id="AuthenticationPage.verifyEmailTitleV2" />
      </Heading>
      <p className={css.modalMessage}>
        <FormattedMessage id="AuthenticationPage.verifyEmailTextV2" values={{ email }} />
      </p>
      {resendErrorMessage}

      <div className={css.bottomWrapper}>
        <p className={css.modalHelperText}>
          <FormattedMessage id="AuthenticationPage.verifyEmailStaticHelp" />
        </p>
      </div>
    </div>
  );
};

export default EmailVerificationInfo;
