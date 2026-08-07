import React from 'react';
import { Form as FinalForm, Field } from 'react-final-form';

import { FormattedMessage } from '../../../util/reactIntl';
import {
  Heading,
  Form,
  NamedLink,
  IconEmailAttention,
  IconEmailSuccess,
  InlineTextButton,
  PrimaryButton,
} from '../../../components';

import css from './EmailVerificationForm.module.css';

/**
 * The EmailVerificationForm component.
 *
 * @component
 * @param {Object} props
 * @param {Object} props.currentUser - The current user
 * @param {boolean} props.inProgress - Whether the form is in progress
 * @param {Function} props.handleSubmit - The handle submit function
 * @param {propTypes.error} props.verificationError - The verification error
 * @param {boolean} props.hasVerificationToken - Whether the URL contained a ?t= verification token
 * @param {Function} props.onResendVerificationEmail - The resend verification email function
 * @param {boolean} props.sendVerificationEmailInProgress - Whether the resend is in progress
 * @param {ReactNode} props.resendErrorMessage - The resend error message, if any
 * @returns {JSX.Element} email verification form component
 */
const EmailVerificationForm = props => (
  <FinalForm
    {...props}
    render={formRenderProps => {
      const {
        currentUser,
        inProgress = false,
        handleSubmit,
        verificationError,
        hasVerificationToken = true,
        onResendVerificationEmail,
        sendVerificationEmailInProgress,
        resendErrorMessage,
      } = formRenderProps;

      const { email, emailVerified, pendingEmail, profile } = currentUser.attributes;
      const emailToVerify = <strong>{pendingEmail || email}</strong>;
      const name = profile.firstName;
      // Host -> wizard (full-page <a> so it leaves the SPA and reaches /wizard/);
      // guests -> homepage NamedLink. Same target logic as EmailVerificationPage.
      const isHost = profile?.publicData?.userType === 'provider';
      const successButton = isHost ? (
        <a className={css.submitButton} href="/wizard/">
          <FormattedMessage id="EmailVerificationForm.successButtonText" />
        </a>
      ) : (
        <NamedLink className={css.submitButton} name="LandingPage">
          <FormattedMessage id="EmailVerificationForm.successButtonText" />
        </NamedLink>
      );

      const errorMessage = (
        <div className={css.error}>
          <FormattedMessage id="EmailVerificationForm.verificationFailed" />
        </div>
      );

      const submitInProgress = inProgress;
      const submitDisabled = submitInProgress;

      const verifyEmail = (
        <div className={css.root}>
          <div>
            <IconEmailAttention className={css.modalIcon} />
            <Heading as="h1" rootClassName={css.modalTitle}>
              <FormattedMessage id="EmailVerificationForm.verifyEmailAddress" />
            </Heading>

            <p className={css.modalMessage}>
              <FormattedMessage
                id="EmailVerificationForm.finishAccountSetup"
                values={{ email: emailToVerify }}
              />
            </p>

            {verificationError ? errorMessage : null}
          </div>

          <Form onSubmit={handleSubmit}>
            <Field component="input" type="hidden" name="verificationToken" />

            <div className={css.bottomWrapper}>
              <PrimaryButton type="submit" inProgress={submitInProgress} disabled={submitDisabled}>
                {inProgress ? (
                  <FormattedMessage id="EmailVerificationForm.verifying" />
                ) : (
                  <FormattedMessage id="EmailVerificationForm.verify" />
                )}
              </PrimaryButton>
            </div>
          </Form>
        </div>
      );

      const alreadyVerified = (
        <div className={css.root}>
          <div>
            <IconEmailSuccess className={css.modalIcon} />
            <Heading as="h1" rootClassName={css.modalTitle}>
              <FormattedMessage id="EmailVerificationForm.successTitle" values={{ name }} />
            </Heading>

            <p className={css.modalMessage}>
              <FormattedMessage id="EmailVerificationForm.successText" />
            </p>
          </div>

          <div className={css.bottomWrapper}>
            {successButton}
          </div>
        </div>
      );

      // Landed on /verify-email without a ?t= token in the URL: the link is
      // broken or expired, so guide the user back to their inbox (with a
      // resend option) instead of offering a verify submit that could only fail.
      const resendEmailLink = (
        <InlineTextButton rootClassName={css.modalHelperLink} onClick={onResendVerificationEmail}>
          <FormattedMessage id="EmailVerificationForm.resendEmailLinkText" />
        </InlineTextButton>
      );
      const checkInbox = (
        <div className={css.root}>
          <div>
            <IconEmailAttention className={css.modalIcon} />
            <Heading as="h1" rootClassName={css.modalTitle}>
              <FormattedMessage id="EmailVerificationForm.noTokenTitle" />
            </Heading>

            <p className={css.modalMessage}>
              <FormattedMessage
                id="EmailVerificationForm.noTokenText"
                values={{ email: emailToVerify }}
              />
            </p>

            {resendErrorMessage}
          </div>

          <div className={css.bottomWrapper}>
            <p className={css.modalHelperText}>
              {sendVerificationEmailInProgress ? (
                <FormattedMessage id="EmailVerificationForm.sendingEmail" />
              ) : (
                <FormattedMessage
                  id="EmailVerificationForm.resendEmail"
                  values={{ resendEmailLink }}
                />
              )}
            </p>
            <NamedLink className={css.submitButton} name="LandingPage">
              <FormattedMessage id="EmailVerificationForm.noTokenGoHome" />
            </NamedLink>
          </div>
        </div>
      );

      const currentEmail = <strong>{email}</strong>;
      const alreadyVerifiedButErrorReturned = (
        <div className={css.root}>
          <div>
            <IconEmailSuccess className={css.modalIcon} />
            <Heading as="h1" rootClassName={css.modalTitle}>
              <FormattedMessage id="EmailVerificationForm.noPendingTitle" values={{ name }} />
            </Heading>

            <p className={css.modalMessage}>
              <FormattedMessage
                id="EmailVerificationForm.noPendingText"
                values={{ email: currentEmail, lineBreak: <br /> }}
              />
            </p>
          </div>

          <div className={css.bottomWrapper}>
            {successButton}
          </div>
        </div>
      );

      const anyPendingEmailHasBeenVerifiedForCurrentUser = emailVerified && !pendingEmail;
      return anyPendingEmailHasBeenVerifiedForCurrentUser && verificationError
        ? alreadyVerifiedButErrorReturned
        : anyPendingEmailHasBeenVerifiedForCurrentUser
        ? alreadyVerified
        : !hasVerificationToken
        ? checkInbox
        : verifyEmail;
    }}
  />
);

export default EmailVerificationForm;
