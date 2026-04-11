import React from 'react';
import { bool, func, number, shape, string } from 'prop-types';
import { compose } from 'redux';
import { Field, Form as FinalForm, useField } from 'react-final-form';
import classNames from 'classnames';
import { FieldArray } from 'react-final-form-arrays';
import arrayMutators from 'final-form-arrays';
import pick from 'lodash/pick';
import isEqual from 'lodash/isEqual';

// Import configs and util modules
import { nanoid } from 'nanoid';
import ReactSwitch from 'react-switch';
import appSettings from '../../../../config/settings';
import { intlShape, injectIntl, FormattedMessage, useIntl } from '../../../../util/reactIntl';
import { propTypes } from '../../../../util/types';
import {
  composeValidators,
  uniqueValue,
  moneySubUnitAmountAtLeast,
  required,
} from '../../../../util/validators';
import { formatMoney } from '../../../../util/currency';
import { types as sdkTypes } from '../../../../util/sdkLoader';
import { FIXED, isBookingProcess } from '../../../../transactions/transaction';

// Import shared components
import {
  Button,
  Form,
  FieldCurrencyInput,
  FieldTextInput,
  IconClose,
} from '../../../../components';

import BookingPriceVariants from './BookingPriceVariants';
import StartTimeInterval from './StartTimeInverval';

// Import modules from this directory
import css from './EditListingPricingForm.module.css';

const FieldError = ({ name, className }) => {
  const {
    meta: { error, touched },
  } = useField(name, { subscription: { error: true, active: true, touched: true } });

  const classes = classNames(css.fieldError, className);

  return touched && error ? <div className={classes}>{error}</div> : null;
};

FieldError.defaultProps = { className: null };

FieldError.propTypes = {
  name: string.isRequired,
  className: string,
};

const { Money } = sdkTypes;

const getPriceValidators = (listingMinimumPriceSubUnits, marketplaceCurrency, intl) => {
  const priceRequiredMsgId = { id: 'EditListingPricingForm.priceRequired' };
  const priceRequiredMsg = intl.formatMessage(priceRequiredMsgId);
  const priceRequired = required(priceRequiredMsg);

  const minPriceRaw = new Money(listingMinimumPriceSubUnits, marketplaceCurrency);
  const minPrice = formatMoney(intl, minPriceRaw);
  const priceTooLowMsgId = { id: 'EditListingPricingForm.priceTooLow' };
  const priceTooLowMsg = intl.formatMessage(priceTooLowMsgId, { minPrice });
  const minPriceRequired = moneySubUnitAmountAtLeast(priceTooLowMsg, listingMinimumPriceSubUnits);

  return listingMinimumPriceSubUnits
    ? composeValidators(priceRequired, minPriceRequired)
    : priceRequired;
};

const ErrorMessages = props => {
  const { fetchErrors } = props;
  const { updateListingError, showListingsError } = fetchErrors || {};

  return (
    <>
      {updateListingError ? (
        <p className={css.error}>
          <FormattedMessage id="EditListingPricingForm.updateFailed" />
        </p>
      ) : null}
      {showListingsError ? (
        <p className={css.error}>
          <FormattedMessage id="EditListingPricingForm.showListingFailed" />
        </p>
      ) : null}
    </>
  );
};

/**
 * The EditListingPricingForm component.
 *
 * @component
 * @param {Object} props
 * @param {string} [props.formId] - The form id
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {string} [props.rootClassName] - Custom class that overrides the default class for the root element
 * @param {string} props.unitType - The unitType from listing.attributes.publicData
 * @param {Object} [props.listingTypeConfig] - The listing type config that matches with listingType on publicData.
 * @param {Object} [props.listingTypeConfig.priceVariations] - The price variations config.
 * @param {boolean} props.listingTypeConfig.priceVariations.enabled - Whether the price variations are enabled.
 * @param {Object} [props.listingTypeConfig.transactionType] - The transaction type config.
 * @param {string} props.listingTypeConfig.transactionType.process - The transaction process config.
 * @param {string} props.marketplaceCurrency - The marketplace currency
 * @param {number} [props.listingMinimumPriceSubUnits] - The listing minimum price sub units
 * @param {boolean} [props.autoFocus] - Whether the input should be focused
 * @param {boolean} [props.disabled] - Whether the form is disabled
 * @param {boolean} [props.ready] - Whether the form is ready
 * @param {Function} props.onSubmit - The submit function
 * @param {boolean} [props.invalid] - Whether the form is invalid
 * @param {boolean} [props.pristine] - Whether the form is pristine
 * @param {string} props.saveActionMsg - The save action message
 * @param {boolean} [props.updated] - Whether the form is updated
 * @param {boolean} [props.updateInProgress] - Whether the form is updating
 * @param {Object} [props.fetchErrors] - The fetch errors
 * @returns {JSX.Element}
 */
export const EditListingPricingForm = props => (
  <FinalForm
    {...props}
    initialValuesEqual={isEqual}
    mutators={{ ...arrayMutators }}
    render={(formRenderProps) => {
      const {
        formId = 'EditListingPricingForm',
        form: formApi,
        autoFocus,
        className,
        rootClassName,
        disabled,
        ready,
        handleSubmit,
        marketplaceCurrency,
        unitType,
        listingTypeConfig,
        isPriceVariationsInUse,
        listingMinimumPriceSubUnits = 0,
        pristine,
        saveActionMsg,
        updated,
        updateInProgress = false,
        fetchErrors,
        submitError,
        initialValues: formInitialValues,
        values: formValues,
      } = formRenderProps;

      const intl = useIntl();

      const priceValidators = getPriceValidators(
        listingMinimumPriceSubUnits,
        marketplaceCurrency,
        intl
      );

      const classes = classNames(rootClassName || css.root, className);
      const submitReady = (updated && pristine) || ready;
      const submitInProgress = updateInProgress;
      const submitDisabled = disabled || submitInProgress;
      const { transactionType } = listingTypeConfig || {};
      const { process } = transactionType || {};
      const isBooking = isBookingProcess(process);

      const isFixedLengthBooking = isBooking && unitType === FIXED;
      const isBookingPriceVariationsInUse = isBooking && isPriceVariationsInUse;
      const isUsingPriceVariants = isFixedLengthBooking || isBookingPriceVariationsInUse;

      return (
        <Form onSubmit={handleSubmit} className={classes}>
          <ErrorMessages fetchErrors={fetchErrors} />

          {isUsingPriceVariants ? (
            <BookingPriceVariants
              formId={formId}
              formApi={formApi}
              autoFocus={autoFocus}
              className={css.input}
              marketplaceCurrency={marketplaceCurrency}
              unitType={unitType}
              isPriceVariationsInUse={isBookingPriceVariationsInUse}
              initialLengthOfPriceVariants={formInitialValues?.priceVariants?.length || 0}
              listingMinimumPriceSubUnits={listingMinimumPriceSubUnits}
            />
          ) : (
            <FieldCurrencyInput
              id={`${formId}price`}
              name="price"
              className={css.input}
              autoFocus={autoFocus}
              label={intl.formatMessage(
                { id: 'EditListingPricingForm.pricePerProduct' },
                { unitType }
              )}
              placeholder={intl.formatMessage({
                id: 'EditListingPricingForm.priceInputPlaceholder',
              })}
              currencyConfig={appSettings.getCurrencyFormatting(marketplaceCurrency)}
              validate={priceValidators}
            />
          )}
          <FieldCurrencyInput
            id={`${formId}.refundableDeposit`}
            name="refundableDeposit"
            className={css.input}
            label={intl.formatMessage({ id: 'EditListingPricingForm.refundableDeposit' })}
            placeholder={intl.formatMessage({
              id: 'EditListingPricingForm.refundableDepositPlaceholder',
            })}
            parse={(v) => (v ? pick(v, ['amount', 'currency']) : v)}
            format={(v) => (v && v.amount && v.currency ? new Money(v.amount, v.currency) : v)}
            currencyConfig={appSettings.getCurrencyFormatting(marketplaceCurrency)}
          />
          <div className={css.instantBookingField}>
            <div className={css.instantBookingTitle}>
              <FormattedMessage id="EditListingPricingForm.instantBookingTitle" />
            </div>
            <div className={css.instantBookingDesc}>
              <div className={css.instantBookingDescText}>
                <FormattedMessage id="EditListingPricingForm.instantBookingInfo" />
              </div>
              <Field name="isInstantBooking" type="checkbox">
                {() => (
                  <ReactSwitch
                    checked={formValues.isInstantBooking}
                    onChange={(checked) => {
                      formApi.change('isInstantBooking', checked);
                    }}
                    onColor="#F92685"
                    uncheckedIcon={false}
                    checkedIcon={false}
                    height={20}
                    width={40}
                    className={css.switch}
                  />
                )}
              </Field>
            </div>
          </div>

          <FormattedMessage id="EditListingPricingForm.amenitiesTitle" tagName="h4" />
          <p className={css.amenitiesDesc}>
            {intl.formatMessage({
              id: 'EditListingPricingForm.amenitiesDesc',
            })}
          </p>

          <div className={css.amenities}>
            <FieldArray name="amenities">
              {({ fields }) => (
                <>
                  {fields.map((name, index) => (
                    <div key={name} className={css.fieldAmenity}>
                      <div className={css.fieldAmenityRow}>
                        <div className={css.amenityName}>
                          <FieldTextInput
                            name={`amenities[${index}].id`}
                            disabled
                            className={css.fieldId}
                          />
                          <FieldTextInput
                            id={`${formId}.amenities[${index}].name`}
                            name={`amenities[${index}].name`}
                            label={intl.formatMessage({ id: 'EditListingPricingForm.amenity' })}
                            placeholder={intl.formatMessage({
                              id: 'EditListingPricingForm.amenityPlaceholder',
                            })}
                            hideErrorMessage
                            validate={composeValidators(
                              required(
                                intl.formatMessage({ id: 'EditListingPricingForm.required' })
                              ),
                              uniqueValue(
                                intl.formatMessage({ id: 'EditListingPricingForm.uniqueName' }),
                                (v, { amenities = [] }) => {
                                  return amenities.filter((a) => a?.name === v).length > 1;
                                }
                              )
                            )}
                          />
                          <FieldError name={`amenities[${index}].name`} />
                        </div>

                        <FieldCurrencyInput
                          id={`${formId}.amenities[${index}].price`}
                          name={`amenities[${index}].price`}
                          className={css.amenityPrice}
                          label={intl.formatMessage({
                            id: 'EditListingPricingForm.amenityPrice',
                          })}
                          placeholder={intl.formatMessage({
                            id: 'EditListingPricingForm.amenityPricePlaceholder',
                          })}
                          parse={(v) => (v ? pick(v, ['amount', 'currency']) : v)}
                          format={(v) => {
                            return v && v.currency ? new Money(v.amount, v.currency) : v;
                          }}
                          currencyConfig={appSettings.getCurrencyFormatting(marketplaceCurrency)}
                          validate={required(
                            intl.formatMessage({ id: 'EditListingPricingForm.required' })
                          )}
                        />
                      </div>
                      <FieldTextInput
                        id={`${formId}.amenities[${index}].description`}
                        name={`amenities[${index}].description`}
                        className={css.amenityDesc}
                        label={intl.formatMessage({ id: 'EditListingPricingForm.amenityDesc' })}
                        placeholder={intl.formatMessage({
                          id: 'EditListingPricingForm.amenityDescPlaceholder',
                        })}
                      />

                      <button
                        type="button"
                        className={css.removeButton}
                        onClick={() => fields.remove(index)}
                      >
                        <IconClose rootClassName={css.closeIcon} />
                      </button>
                    </div>
                  ))}
                  <button
                    className={css.addMoreAmenity}
                    type="button"
                    onClick={() => fields.push({ id: nanoid() })}
                  >
                    {intl.formatMessage({ id: 'EditListingPricingForm.addAnotherAmenity' })}
                  </button>
                </>
              )}
            </FieldArray>
          </div>

          {submitError && <p className={css.fieldError}>{submitError}</p>}

          {isFixedLengthBooking ? (
            <StartTimeInterval
              name="startTimeInterval"
              idPrefix={`${formId}_startTimeInterval`}
              formValues={formValues}
              pristine={pristine}
            />
          ) : null}

          <Button
            className={css.submitButton}
            type="submit"
            inProgress={submitInProgress}
            disabled={submitDisabled}
            ready={submitReady}
          >
            {saveActionMsg}
          </Button>
        </Form>
      );
    }}
  />
);

export default EditListingPricingForm;
