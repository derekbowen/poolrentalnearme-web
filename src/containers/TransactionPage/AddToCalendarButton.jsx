import { AddToCalendarButton } from 'add-to-calendar-button-react';
import { bool, object, string } from 'prop-types';
import React from 'react';

import { useRouteConfiguration } from 'context/routeConfigurationContext';
import { useConfiguration } from 'context/configurationContext';
import { userDisplayNameAsString } from 'util/data';
import { createResourceLocatorString } from 'util/routes';
import { useIntl } from 'react-intl';
import css from './TransactionPage.module.css';

const calendarOptions = ['Apple', 'Google', 'Outlook.com', 'Yahoo'];

const AddToCalendarBtn = ({
  isCustomer,
  provider,
  customer,
  startDate,
  endDate,
  startTime,
  endTime,
  timezone,
  transactionId,
}) => {
  const intl = useIntl();
  const routeConfiguration = useRouteConfiguration();
  const config = useConfiguration();
  const { marketplaceName, marketplaceRootURL } = config;

  const title = isCustomer
    ? `Your booking for ${userDisplayNameAsString(provider, 'provider')}`
    : `${marketplaceName} Booking - ${userDisplayNameAsString(customer, 'customer')}`;

  const transactionDetailURL = `${marketplaceRootURL}${createResourceLocatorString(
    isCustomer ? 'OrderDetailsPage' : 'SaleDetailsPage',
    routeConfiguration,
    {
      id: transactionId,
      tab: 'details',
    }
  )}`;

  return (
    <div className={css.calendarBtn}>
      <AddToCalendarButton
        name={title}
        description={transactionDetailURL}
        options={calendarOptions}
        startDate={startDate}
        endDate={endDate}
        startTime={startTime}
        endTime={endTime}
        timeZone={timezone}
        styleLight="--btn-background: transparent; --btn-text: #F92685;"
        buttonStyle="text"
        label={intl.formatMessage({ id: 'AddToCalendarButton.label' })}
        hideIconButton
        hideCheckmark
      />
    </div>
  );
};

AddToCalendarBtn.propTypes = {
  isCustomer: bool.isRequired,
  provider: object.isRequired,
  customer: object.isRequired,
  startDate: string.isRequired,
  endDate: string.isRequired,
  startTime: string.isRequired,
  endTime: string.isRequired,
  timezone: string.isRequired,
  transactionId: string.isRequired,
};

export default AddToCalendarBtn;
