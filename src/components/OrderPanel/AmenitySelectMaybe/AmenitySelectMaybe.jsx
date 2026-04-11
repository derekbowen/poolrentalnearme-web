import React, { useState } from 'react';

import { array, bool } from 'prop-types';
import { intlShape } from 'util/reactIntl';

import FieldCheckboxGroup from 'components/FieldCheckboxGroup/FieldCheckboxGroup';
import { H4 } from 'components/Heading/Heading';
import IconArrowHead from 'components/IconArrowHead/IconArrowHead';
import classNames from 'classnames';
import { types } from 'util/sdkLoader';
import { formatMoney } from 'util/currency';
import css from './AmenitySelectMaybe.module.css';

const { Money } = types;

const AmenitySelectMaybe = (props) => {
  const { amenities, intl, disabled } = props;
  const [isExpanded, setExpanded] = useState(false);

  if (!amenities || !amenities.length) {
    return null;
  }

  const amenitiesSectionClass = classNames(css.amenitiesSection, {
    [css.amenitiesSectionExpanded]: isExpanded,
  });

  const toggleAmenitiesSection = () => setExpanded(!isExpanded);

  const renderLabel = ({ value }) => {
    const amenity = amenities.find((a) => a.id === value);
    if (!amenity) {
      return null;
    }

    const { name, price } = amenity;
    const priceAsMoney = new Money(price.amount, price.currency);
    const formattedPrice = formatMoney(intl, priceAsMoney);

    return (
      <div className={css.text}>
        <span>{name}</span>
        <span>{formattedPrice}</span>
      </div>
    );
  };

  return (
    <div className={css.root}>
      <div className={css.header} onClick={toggleAmenitiesSection}>
        <H4 className={css.title}>{intl.formatMessage({ id: 'AmenitySelectField.label' })}</H4>
        <IconArrowHead direction={isExpanded ? 'down' : 'right'} />
      </div>
      <div className={amenitiesSectionClass}>
        <FieldCheckboxGroup
          id="amenities"
          name="amenities"
          disabled={disabled}
          options={amenities.map((amenity) => ({ key: amenity.id, label: amenity.name }))}
          renderLabel={renderLabel}
        />
      </div>
    </div>
  );
};

export default AmenitySelectMaybe;

AmenitySelectMaybe.propTypes = {
  amenities: array,
  intl: intlShape.isRequired,
  disabled: bool,
};

AmenitySelectMaybe.defaultProps = {
  amenities: null,
  disabled: false,
};
