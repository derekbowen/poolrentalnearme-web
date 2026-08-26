import React from 'react';
import classNames from 'classnames';

import { FormattedMessage } from '../../../util/reactIntl';
import { Heading } from '../../../components';

import css from './TransactionPanel.module.css';

// c191: hosts could not tell who was booking. The profile displayName is
// guest-chosen and is frequently a nickname, so a request would arrive from
// "Kay" or "Sneakers 82" with nothing else attached. The guest's real name is
// resolved server-side at initiate (server/api/initiate-privileged.js) and
// stored on the transaction's protectedData, which both parties can read.
//
// Provider-only on purpose: the guest already knows their own name.
// Phone and email are deliberately NOT shown here - guests and hosts talk
// through the in-platform message thread, and contact details never travel
// with the booking.
const GuestDetailsMaybe = (props) => {
  const { className, rootClassName, protectedData, isProvider } = props;

  const { guestFirstName, guestLastName } = protectedData || {};
  const fullName = [guestFirstName, guestLastName].filter(Boolean).join(' ').trim();

  // Older transactions predate this field, so absence is normal - render nothing
  // rather than an empty heading.
  if (!isProvider || !fullName) {
    return null;
  }

  const classes = classNames(rootClassName || css.deliveryInfoContainer, className);

  return (
    <div className={classes}>
      <Heading as="h3" rootClassName={css.sectionHeading}>
        <FormattedMessage id="TransactionPanel.guestDetailsHeading" />
      </Heading>
      <div className={css.bookingLocationContent}>{fullName}</div>
    </div>
  );
};

export default GuestDetailsMaybe;
