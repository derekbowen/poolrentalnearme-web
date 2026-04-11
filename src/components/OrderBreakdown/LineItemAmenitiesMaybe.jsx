import React from 'react';
import { bool, object } from 'prop-types';
import { types } from 'util/sdkLoader';
import { intlShape } from '../../util/reactIntl';
import { formatMoney } from '../../util/currency';
import { humanizeLineItemCode } from '../../util/data';

import css from './OrderBreakdown.module.css';

const { Money } = types;

const LineItemAmenitiesMaybe = (props) => {
  const { protectedData, isProvider, intl } = props;

  const { amenityLineItems } = protectedData || [];

  if (!amenityLineItems || !amenityLineItems.length) {
    return null;
  }

  const items = isProvider
    ? amenityLineItems.filter((item) => item.includeFor.includes('provider'))
    : amenityLineItems.filter((item) => item.includeFor.includes('customer'));

  return items.length > 0 ? (
    <>
      {items.map((item, i) => {
        const { quantity, name } = item;
        const lineItemName = name ?? humanizeLineItemCode(item.code);

        const label = quantity && quantity > 1 ? `${lineItemName} x ${quantity}` : lineItemName;

        const { amount, currency } = item.lineTotal;
        const lineTotalAsMoney = new Money(amount, currency);

        const formattedTotal = formatMoney(intl, lineTotalAsMoney);
        return (
          // eslint-disable-next-line react/no-array-index-key
          <div key={`${i}-item.code`} className={css.lineItem}>
            <span className={css.itemLabel}>{label}</span>
            <span className={css.itemValue}>{formattedTotal}</span>
          </div>
        );
      })}
    </>
  ) : null;
};

export default LineItemAmenitiesMaybe;

LineItemAmenitiesMaybe.propTypes = {
  protectedData: object,
  intl: intlShape.isRequired,
  isProvider: bool,
};

LineItemAmenitiesMaybe.defaultProps = {
  protectedData: null,
  isProvider: false,
};
