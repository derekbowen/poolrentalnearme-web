import React, { useState } from 'react';
import { array, bool, func, number, object, string } from 'prop-types';
import { compose } from 'redux';
import arrayMutator from 'final-form-arrays';
import classNames from 'classnames';

import { LISTING_PAGE } from 'config/configRouting';
import { Form as FinalForm } from 'react-final-form';

import { FormattedMessage, useIntl } from '../../../util/reactIntl';
import { timestampToDate } from '../../../util/dates';
import { BOOKING_PROCESS_NAME } from '../../../transactions/transaction';

import { Form, H6, PrimaryButton, SecondaryButton, FieldSelect, FieldTextInput } from '../..';

import EstimatedCustomerBreakdownMaybe from '../EstimatedCustomerBreakdownMaybe';
import FieldDateAndTimeInput from './FieldDateAndTimeInput';
import AmenitySelectMaybe from '../AmenitySelectMaybe/AmenitySelectMaybe';

import css from './BookingTimeForm.module.css';

// When the values of the form are updated we need to fetch
// lineItems from this template's backend for the EstimatedTransactionMaybe
// In case you add more fields to the form, make sure you add
// the values here to the orderData object.
const handleFetchLineItems = props => formValues => {
  const {
    listingId,
    isOwnListing,
    fetchLineItemsInProgress,
    onFetchTransactionLineItems,
    seatsEnabled,
  } = props;
  const { bookingStartTime, bookingEndTime, seats, priceVariantName, amenities, promoCode } =
    formValues.values;
  const startDate = bookingStartTime ? timestampToDate(bookingStartTime) : null;
  const endDate = bookingEndTime ? timestampToDate(bookingEndTime) : null;

  // Note: we expect values bookingStartTime and bookingEndTime to be strings
  // which is the default case when the value has been selected through the form
  const isStartBeforeEnd = bookingStartTime < bookingEndTime;
  const seatsMaybe = seatsEnabled && seats > 0 ? { seats: parseInt(seats, 10) } : {};

  const priceVariantMaybe = priceVariantName ? { priceVariantName } : {};

  if (bookingStartTime && bookingEndTime && isStartBeforeEnd && !fetchLineItemsInProgress) {
    const orderData = {
      bookingStart: startDate,
      bookingEnd: endDate,
      ...seatsMaybe,
      ...priceVariantMaybe,
      amenities,
      // c150: server validates the code against the host's promoCodes and
      // returns a discount line item; an unknown code simply changes nothing.
      ...(promoCode ? { promoCode } : {}),
    };
    onFetchTransactionLineItems({
      orderData,
      listingId,
      isOwnListing,
    });
  }
};

const onPriceVariantChange = props => value => {
  const { form: formApi, seatsEnabled } = props;

  formApi.batch(() => {
    formApi.change('bookingStartDate', null);
    formApi.change('bookingStartTime', null);
    formApi.change('bookingEndTime', null);
    if (seatsEnabled) {
      formApi.change('seats', 1);
    }
  });
};

/**
 * A form for selecting booking time.
 *
 * @component
 * @param {Object} props
 * @param {string} [props.rootClassName] - Custom class that overrides the default class for the root element
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {propTypes.money} props.price - The unit price of the listing
 * @param {boolean} props.isOwnListing - Whether the listing is owned by the current user
 * @param {propTypes.uuid} props.listingId - The ID of the listing
 * @param {Object} props.monthlyTimeSlots - The monthly time slots
 * @param {Function} props.onFetchTimeSlots - The function to fetch the time slots
 * @param {string} props.timeZone - The time zone of the listing (e.g. "America/New_York")
 * @param {Function} props.onFetchTransactionLineItems - The function to fetch the transaction line items
 * @param {Object} props.lineItems - The line items
 * @param {boolean} props.fetchLineItemsInProgress - Whether line items are being fetched
 * @param {propTypes.error} props.fetchLineItemsError - The error for fetching line items
 * @param {string} [props.startDatePlaceholder] - The placeholder text for the start date
 * @param {string} [props.endDatePlaceholder] - The placeholder text for the end date
 * @param {number} props.dayCountAvailableForBooking - Number of days available for booking
 * @param {string} props.marketplaceName - Name of the marketplace
 * @param {Array<Object>} [props.priceVariants] - The price variants
 * @param {ReactNode} [props.priceVariantFieldComponent] - The component to use for the price variant field
 * @param {boolean} props.isPublishedListing - Whether the listing is published
 * @returns {JSX.Element}
 */
export const BookingTimeForm = props => {
  const intl = useIntl();
  const {
    rootClassName,
    className,
    price: unitPrice,
    dayCountAvailableForBooking,
    marketplaceName,
    seatsEnabled,
    isPriceVariationsInUse,
    priceVariants = [],
    priceVariantFieldComponent: PriceVariantFieldComponent,
    preselectedPriceVariant,
    isPublishedListing,
    onContactUser,
    listingAuthor,
    currentPage,
    maxGuests,
    ...rest
  } = props;

  const [seatsOptions, setSeatsOptions] = useState([1]);
  // Party-size selector: 1..maxGuests (soft — never affects price). Default 1.
  const maxGuestsNum = Number.parseInt(maxGuests, 10) || 0;
  const partySizeOptions =
    maxGuestsNum > 1 ? Array.from({ length: maxGuestsNum }, (_, i) => i + 1) : [];
  // Always seed partySize: 1 so it's populated even if the guest never opens the select.
  const priceVariantInitial =
    priceVariants.length > 1 && preselectedPriceVariant
      ? { priceVariantName: preselectedPriceVariant?.name }
      : priceVariants.length === 1
      ? { priceVariantName: priceVariants?.[0]?.name }
      : {};
  const initialValuesMaybe = {
    initialValues: { ...priceVariantInitial, ...(partySizeOptions.length ? { partySize: 1 } : {}) },
  };

  const classes = classNames(rootClassName || css.root, className);

  return (
    <FinalForm
      {...initialValuesMaybe}
      {...rest}
      unitPrice={unitPrice}
      mutators={{ ...arrayMutator }}
      render={formRenderProps => {
        const {
          endDatePlaceholder,
          startDatePlaceholder,
          form,
          pristine,
          handleSubmit,
          isOwnListing,
          listingId,
          values,
          monthlyTimeSlots,
          timeSlotsForDate,
          onFetchTimeSlots,
          timeZone,
          lineItems,
          fetchLineItemsInProgress,
          fetchLineItemsError,
          payoutDetailsWarning,
          amenities,
          offerAccept,
        } = formRenderProps;

        // Accepting a host package deal: the price is the negotiated offer, not
        // the hourly estimate, so we hide the hourly breakdown here and show the
        // authoritative offer breakdown on the checkout page (/api/accept-offer).
        const isOfferAccept = !!offerAccept?.negotiatedPriceCents;

        const startTime = values?.bookingStartTime ? values.bookingStartTime : null;
        const endTime = values?.bookingEndTime ? values.bookingEndTime : null;
        const startDate = startTime ? timestampToDate(startTime) : null;
        const endDate = endTime ? timestampToDate(endTime) : null;
        const priceVariantName = values?.priceVariantName || null;

        // This is the place to collect breakdown estimation data. See the
        // EstimatedCustomerBreakdownMaybe component to change the calculations
        // for customized payment processes.
        const breakdownData =
          startDate && endDate
            ? {
                startDate,
                endDate,
              }
            : null;

        const showEstimatedBreakdown =
          !isOfferAccept &&
          breakdownData &&
          lineItems &&
          !fetchLineItemsInProgress &&
          !fetchLineItemsError;

        const onHandleFetchLineItems = handleFetchLineItems(props);
        const submitDisabled = isPriceVariationsInUse && !isPublishedListing;

        return (
          <Form onSubmit={handleSubmit} className={classes} enforcePagePreloadFor="CheckoutPage">
            {PriceVariantFieldComponent ? (
              <PriceVariantFieldComponent
                priceVariants={priceVariants}
                priceVariantName={priceVariantName}
                onPriceVariantChange={onPriceVariantChange(formRenderProps)}
                disabled={!isPublishedListing}
              />
            ) : null}

            {monthlyTimeSlots && timeZone ? (
              <FieldDateAndTimeInput
                seatsEnabled={seatsEnabled}
                setSeatsOptions={setSeatsOptions}
                startDateInputProps={{
                  label: intl.formatMessage({ id: 'BookingTimeForm.bookingStartTitle' }),
                  placeholderText: startDatePlaceholder,
                }}
                endDateInputProps={{
                  label: intl.formatMessage({ id: 'BookingTimeForm.bookingEndTitle' }),
                  placeholderText: endDatePlaceholder,
                }}
                className={css.bookingDates}
                listingId={listingId}
                onFetchTimeSlots={onFetchTimeSlots}
                monthlyTimeSlots={monthlyTimeSlots}
                timeSlotsForDate={timeSlotsForDate}
                values={values}
                intl={intl}
                form={form}
                pristine={pristine}
                disabled={isPriceVariationsInUse && !priceVariantName}
                timeZone={timeZone}
                dayCountAvailableForBooking={dayCountAvailableForBooking}
                handleFetchLineItems={onHandleFetchLineItems}
              />
            ) : null}
            {seatsEnabled ? (
              <FieldSelect
                name="seats"
                id="seats"
                disabled={!startTime}
                showLabelAsDisabled={!startTime}
                label={intl.formatMessage({ id: 'BookingTimeForm.seatsTitle' })}
                className={css.fieldSeats}
                onChange={values => {
                  onHandleFetchLineItems({
                    values: {
                      priceVariantName,
                      bookingStartDate: startDate,
                      bookingStartTime: startTime,
                      bookingEndDate: endDate,
                      bookingEndTime: endTime,
                      seats: values,
                    },
                  });
                }}
              >
                <option disabled value="">
                  {intl.formatMessage({ id: 'BookingTimeForm.seatsPlaceholder' })}
                </option>
                {seatsOptions.map(s => (
                  <option value={s} key={s}>
                    {s}
                  </option>
                ))}
              </FieldSelect>
            ) : null}

            {partySizeOptions.length ? (
              <FieldSelect
                name="partySize"
                id="partySize"
                className={css.fieldSeats}
                label={`Number of guests (this pool hosts up to ${maxGuestsNum})`}
              >
                {partySizeOptions.map(n => (
                  <option value={n} key={n}>
                    {n === maxGuestsNum ? `${n} (max)` : n}
                  </option>
                ))}
              </FieldSelect>
            ) : null}

            {breakdownData ? (
              <AmenitySelectMaybe
                amenities={amenities}
                intl={intl}
                disabled={fetchLineItemsInProgress}
              />
            ) : null}

            {/* c150: host promo codes. Typing a code re-prices instantly via the
                same line-items endpoint; the discount is applied server-side. */}
            {breakdownData ? (
              <div className={css.promoCodeField} style={{ margin: '8px 0 4px' }}>
                <FieldTextInput
                  id="promoCode"
                  name="promoCode"
                  type="text"
                  label={intl.formatMessage({ id: 'BookingTimeForm.promoCodeLabel' })}
                  placeholder={intl.formatMessage({ id: 'BookingTimeForm.promoCodePlaceholder' })}
                  disabled={fetchLineItemsInProgress}
                  format={v => (v ? String(v).toUpperCase() : v)}
                />
              </div>
            ) : null}

            {showEstimatedBreakdown ? (
              <div className={css.priceBreakdownContainer}>
                <H6 as="h3" className={css.bookingBreakdownTitle}>
                  <FormattedMessage id="BookingTimeForm.priceBreakdownTitle" />
                </H6>
                <hr className={css.totalDivider} />
                <EstimatedCustomerBreakdownMaybe
                  breakdownData={breakdownData}
                  lineItems={lineItems}
                  timeZone={timeZone}
                  currency={unitPrice.currency}
                  marketplaceName={marketplaceName}
                  processName={BOOKING_PROCESS_NAME}
                  amenities={amenities}
                />
              </div>
            ) : null}

            {isOfferAccept && breakdownData ? (
              <div
                style={{
                  margin: '4px 0 8px',
                  padding: '10px 14px',
                  background: '#f0f9ff',
                  border: '1px solid #bae6fd',
                  borderRadius: '8px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                  <span>Package deal</span>
                  <span>${(offerAccept.negotiatedPriceCents / 100).toFixed(2)}</span>
                </div>
                <p style={{ fontSize: '12px', color: '#5c6b78', margin: '4px 0 0' }}>
                  Your itemized total (including the small booking fee) is shown on the next screen.
                </p>
              </div>
            ) : null}

            {!isOfferAccept && fetchLineItemsError ? (
              <span className={css.sideBarError}>
                {fetchLineItemsError.status === 400 &&
                typeof fetchLineItemsError.statusText === 'string' &&
                /advance notice|minimum booking|hours per booking|in advance/i.test(
                  fetchLineItemsError.statusText
                ) ? (
                  fetchLineItemsError.statusText
                ) : (
                  <FormattedMessage id="BookingTimeForm.fetchLineItemsError" />
                )}
              </span>
            ) : null}

            <div className={css.submitButton}>
              <PrimaryButton
                type="submit"
                inProgress={isOfferAccept ? false : fetchLineItemsInProgress}
                disabled={submitDisabled}
              >
                {isOfferAccept ? (
                  'Accept & continue to payment'
                ) : (
                  <FormattedMessage id="BookingTimeForm.requestToBook" />
                )}
              </PrimaryButton>
            </div>

            {/* Phase 1 listing redesign: booking reassurance (presentation only). */}
            <p
              style={{
                margin: '8px 2px 0',
                fontSize: '12.5px',
                lineHeight: 1.45,
                color: '#5c6b78',
                textAlign: 'center',
              }}
            >
              🔒 Your card is only authorized now — you're not charged until the host confirms.
            </p>

            {/* Reassurance line directly under the CTA */}
            <p className={css.finePrint}>
              {payoutDetailsWarning ? (
                payoutDetailsWarning
              ) : (
                <FormattedMessage
                  id={
                    isOwnListing
                      ? 'BookingTimeForm.ownListing'
                      : 'BookingTimeForm.youWontBeChargedInfo'
                  }
                />
              )}
            </p>

            {isOwnListing || currentPage !== LISTING_PAGE ? null : (
              <div className={css.contactButtonWrapper}>
                <SecondaryButton
                  type="button"
                  onClick={() => onContactUser(listingAuthor)}
                  className={css.contactButton}
                >
                  <FormattedMessage id="UserCard.contactUser" />
                </SecondaryButton>
              </div>
            )}
          </Form>
        );
      }}
    />
  );
};

export default BookingTimeForm;
