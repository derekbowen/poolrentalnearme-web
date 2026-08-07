import React from 'react';
import { bool, object } from 'prop-types';
import { intlShape } from '../../util/reactIntl';

import css from './OrderBreakdown.module.css';

/**
 * Shows the guest's party size on the order breakdown (guest checkout + host's
 * transaction view). Party size is soft/informational — collected at booking,
 * never affects price. If it exceeds the listing's maxGuests, the host sees a
 * gentle "over your limit" flag so they can decide (no hard block by design).
 */
const LineItemPartySizeMaybe = (props) => {
  const { protectedData, isProvider } = props;
  const partySize = protectedData?.partySize;

  if (!partySize) {
    return null;
  }

  const maxGuests = Number(protectedData?.partySizeMax) || null;
  const overCapacity = maxGuests && partySize > maxGuests;

  const label = `Party of ${partySize}`;
  const value =
    isProvider && overCapacity
      ? `over your ${maxGuests}-guest limit`
      : `${partySize} guest${partySize > 1 ? 's' : ''}`;

  return (
    <div className={css.lineItem}>
      <span className={css.itemLabel}>{label}</span>
      <span className={css.itemValue}>{value}</span>
    </div>
  );
};

export default LineItemPartySizeMaybe;

LineItemPartySizeMaybe.propTypes = {
  protectedData: object,
  intl: intlShape.isRequired,
  isProvider: bool,
};

LineItemPartySizeMaybe.defaultProps = {
  protectedData: null,
  isProvider: false,
};
