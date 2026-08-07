import { bool, object, string } from 'prop-types';
import React from 'react';
import moment from 'moment-timezone';

import { useRouteConfiguration } from 'context/routeConfigurationContext';
import { useConfiguration } from 'context/configurationContext';
import { userDisplayNameAsString } from 'util/data';
import { createResourceLocatorString } from 'util/routes';
import { useIntl } from 'react-intl';
import css from './TransactionPage.module.css';

// c148: the add-to-calendar-button library showed an "open Safari and paste a
// magical URL" modal on iOS - a dead end for most hosts. A plain .ics download
// works everywhere: iOS/macOS open it straight into Calendar, Android/desktop
// download and open with one tap. No third-party widget, no modal.
const icsStamp = (date, time, timezone) =>
  moment.tz(`${date} ${time}`, 'YYYY-MM-DD HH:mm', timezone).utc().format('YYYYMMDD[T]HHmmss[Z]');

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

  const handleDownload = e => {
    e.preventDefault();
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Pool Rental Near Me//Booking//EN',
      'BEGIN:VEVENT',
      `UID:${transactionId}@poolrentalnearme.com`,
      `DTSTAMP:${moment.utc().format('YYYYMMDD[T]HHmmss[Z]')}`,
      `DTSTART:${icsStamp(startDate, startTime, timezone)}`,
      `DTEND:${icsStamp(endDate, endTime, timezone)}`,
      `SUMMARY:${title.replace(/[\n,;]/g, ' ')}`,
      `DESCRIPTION:${transactionDetailURL}`,
      `URL:${transactionDetailURL}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pool-booking.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  return (
    <div className={css.calendarBtn}>
      <a href="#add-to-calendar" onClick={handleDownload} style={{ color: '#F92685', fontWeight: 600 }}>
        {intl.formatMessage({ id: 'AddToCalendarButton.label' })}
      </a>
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
