import React, { memo } from 'react';
import { Form as FinalForm } from 'react-final-form';
import isEqual from 'lodash/isEqual';
import classNames from 'classnames';

import { FormattedMessage, useIntl } from '../../../../util/reactIntl';
import { required, composeValidators } from '../../../../util/validators';
import {
  Button,
  Form,
  FieldTextInput,
  FieldCurrencyInput,
  FieldCheckbox,
  FieldSelect,
} from '../../../../components';

import css from './EditListingReviewForm.module.css';

const AMENITY_OPTIONS = [
  'hot-tub', 'slide', 'diving-board', 'waterfall', 'grotto',
  'lounge-chairs', 'umbrellas', 'outdoor-shower', 'grill', 'outdoor-kitchen',
  'fire-pit', 'cabana', 'changing-room', 'restroom', 'towels',
  'wifi', 'bluetooth-speaker', 'lighting', 'landscaping', 'playground',
];

const AMENITY_LABELS = {
  'hot-tub': 'Hot tub / spa', 'slide': 'Water slide', 'diving-board': 'Diving board',
  'waterfall': 'Waterfall', 'grotto': 'Grotto', 'lounge-chairs': 'Lounge chairs',
  'umbrellas': 'Umbrellas / shade', 'outdoor-shower': 'Outdoor shower',
  'grill': 'Grill / BBQ', 'outdoor-kitchen': 'Outdoor kitchen', 'fire-pit': 'Fire pit',
  'cabana': 'Cabana / gazebo', 'changing-room': 'Changing room', 'restroom': 'Restroom access',
  'towels': 'Towels provided', 'wifi': 'WiFi', 'bluetooth-speaker': 'Bluetooth speaker',
  'lighting': 'Pool lighting', 'landscaping': 'Landscaped yard', 'playground': 'Kids area',
};

const SAFETY_OPTIONS = [
  'fence', 'gate-lock', 'pool-cover', 'alarm', 'enclosure',
  'shallow-entry', 'non-slip', 'life-ring', 'first-aid',
];

const SAFETY_LABELS = {
  'fence': 'Pool fence', 'gate-lock': 'Self-closing gate', 'pool-cover': 'Pool cover',
  'alarm': 'Pool alarm', 'enclosure': 'Pool enclosure', 'shallow-entry': 'Shallow entry',
  'non-slip': 'Non-slip surfaces', 'life-ring': 'Life ring', 'first-aid': 'First aid kit',
};

const STYLE_OPTIONS = [
  { value: 'clean', label: 'Clean & Modern', desc: 'Minimal, professional' },
  { value: 'resort', label: 'Tropical Resort', desc: 'Vacation vibes' },
  { value: 'luxury', label: 'Luxury Estate', desc: 'Dark, editorial' },
  { value: 'party', label: 'Party Ready', desc: 'Bold, colorful' },
  { value: 'family', label: 'Family Fun', desc: 'Warm, approachable' },
  { value: 'bold', label: 'Unique & Bold', desc: 'Retro-warm, personality' },
];

const SectionHeader = ({ children }) => (
  <h3 className={css.sectionHeader}>{children}</h3>
);

const EditListingReviewForm = ({
  config,
  marketplaceCurrency,
  listingMinimumPriceSubUnits,
  generatedData,
  saveActionMsg,
  updateInProgress,
  updated,
  ready,
  disabled,
  fetchErrors,
  className,
  ...props
}) => {
  const intl = useIntl();
  const classes = classNames(css.root, className);

  return (
    <FinalForm
      {...props}
      render={formRenderProps => {
        const {
          form,
          handleSubmit,
          invalid,
          values,
        } = formRenderProps;

        const { publishListingError, showListingsError, updateListingError } = fetchErrors || {};
        const submitInProgress = updateInProgress;
        const submitDisabled = invalid || disabled || submitInProgress;

        return (
          <Form className={classes} onSubmit={handleSubmit}>
            {/* ─── Title & Description ─── */}
            <SectionHeader>
              <FormattedMessage id="EditListingReviewForm.listingDetails" />
            </SectionHeader>

            <FieldTextInput
              id="review-title"
              name="title"
              type="text"
              label={intl.formatMessage({ id: 'EditListingReviewForm.titleLabel' })}
              placeholder={intl.formatMessage({ id: 'EditListingReviewForm.titlePlaceholder' })}
              validate={required(intl.formatMessage({ id: 'EditListingReviewForm.titleRequired' }))}
              className={css.field}
            />

            <FieldTextInput
              id="review-description"
              name="description"
              type="textarea"
              label={intl.formatMessage({ id: 'EditListingReviewForm.descriptionLabel' })}
              placeholder={intl.formatMessage({ id: 'EditListingReviewForm.descriptionPlaceholder' })}
              validate={required(intl.formatMessage({ id: 'EditListingReviewForm.descriptionRequired' }))}
              className={css.field}
            />

            {/* ─── Pool Details ─── */}
            <SectionHeader>
              <FormattedMessage id="EditListingReviewForm.poolDetails" />
            </SectionHeader>

            <div className={css.fieldRow}>
              <FieldSelect
                id="review-poolType"
                name="poolType"
                label={intl.formatMessage({ id: 'EditListingReviewForm.poolTypeLabel' })}
                className={css.fieldHalf}
              >
                <option value="">{intl.formatMessage({ id: 'EditListingReviewForm.selectOption' })}</option>
                <option value="inground">Inground</option>
                <option value="above-ground">Above ground</option>
                <option value="natural">Natural / pond</option>
                <option value="infinity">Infinity edge</option>
                <option value="rooftop">Rooftop</option>
                <option value="indoor">Indoor</option>
              </FieldSelect>

              <FieldSelect
                id="review-poolSize"
                name="poolSize"
                label={intl.formatMessage({ id: 'EditListingReviewForm.poolSizeLabel' })}
                className={css.fieldHalf}
              >
                <option value="">{intl.formatMessage({ id: 'EditListingReviewForm.selectOption' })}</option>
                <option value="small">Small (up to 200 sq ft)</option>
                <option value="medium">Medium (200–400 sq ft)</option>
                <option value="large">Large (400–800 sq ft)</option>
                <option value="olympic">Olympic / XL (800+ sq ft)</option>
              </FieldSelect>
            </div>

            <div className={css.fieldRow}>
              <FieldTextInput
                id="review-capacity"
                name="capacity"
                type="number"
                label={intl.formatMessage({ id: 'EditListingReviewForm.capacityLabel' })}
                className={css.fieldHalf}
              />
              <FieldTextInput
                id="review-depth"
                name="depth"
                type="text"
                label={intl.formatMessage({ id: 'EditListingReviewForm.depthLabel' })}
                placeholder="e.g. 3ft – 8ft"
                className={css.fieldHalf}
              />
            </div>

            <div className={css.checkboxField}>
              <FieldCheckbox
                id="review-heated"
                name="heated"
                label={intl.formatMessage({ id: 'EditListingReviewForm.heatedLabel' })}
                value="true"
              />
            </div>

            {/* ─── Amenities ─── */}
            <SectionHeader>
              <FormattedMessage id="EditListingReviewForm.amenities" />
            </SectionHeader>
            <div className={css.checkboxGrid}>
              {AMENITY_OPTIONS.map(key => (
                <FieldCheckbox
                  key={key}
                  id={`review-amenity-${key}`}
                  name="amenities"
                  label={AMENITY_LABELS[key]}
                  value={key}
                />
              ))}
            </div>

            {/* ─── Safety ─── */}
            <SectionHeader>
              <FormattedMessage id="EditListingReviewForm.safety" />
            </SectionHeader>
            <div className={css.checkboxGrid}>
              {SAFETY_OPTIONS.map(key => (
                <FieldCheckbox
                  key={key}
                  id={`review-safety-${key}`}
                  name="safetyFeatures"
                  label={SAFETY_LABELS[key]}
                  value={key}
                />
              ))}
            </div>

            {/* ─── Rules ─── */}
            <SectionHeader>
              <FormattedMessage id="EditListingReviewForm.rules" />
            </SectionHeader>
            <div className={css.checkboxGrid}>
              <FieldCheckbox id="review-children" name="childrenAllowed" label="Children allowed (0-12)" value="true" />
              <FieldCheckbox id="review-events" name="eventsAllowed" label="Events & parties allowed" value="true" />
              <FieldCheckbox id="review-alcohol" name="alcoholAllowed" label="Alcohol allowed" value="true" />
              <FieldCheckbox id="review-pets" name="petsAllowed" label="Pets allowed" value="true" />
              <FieldCheckbox id="review-music" name="musicAllowed" label="Music permitted" value="true" />
              <FieldCheckbox id="review-smoking" name="smokingAllowed" label="Smoking allowed" value="true" />
            </div>

            <div className={css.fieldRow}>
              <FieldTextInput
                id="review-maxGuests"
                name="maxGuests"
                type="number"
                label={intl.formatMessage({ id: 'EditListingReviewForm.maxGuestsLabel' })}
                className={css.fieldHalf}
              />
              <FieldTextInput
                id="review-minimumNotice"
                name="minimumNotice"
                type="number"
                label={intl.formatMessage({ id: 'EditListingReviewForm.minimumNoticeLabel' })}
                placeholder="e.g. 4"
                className={css.fieldHalf}
              />
            </div>

            {/* ─── Pricing ─── */}
            <SectionHeader>
              <FormattedMessage id="EditListingReviewForm.pricing" />
            </SectionHeader>

            {generatedData?.pricing?.reasoning && (
              <p className={css.pricingHint}>
                AI suggestion: {generatedData.pricing.reasoning}
              </p>
            )}

            <FieldCurrencyInput
              id="review-price"
              name="price"
              label={intl.formatMessage({ id: 'EditListingReviewForm.priceLabel' })}
              placeholder={intl.formatMessage({ id: 'EditListingReviewForm.pricePlaceholder' })}
              currencyConfig={{ currency: marketplaceCurrency }}
              validate={required(intl.formatMessage({ id: 'EditListingReviewForm.priceRequired' }))}
              className={css.field}
            />

            {/* ─── Listing Style ─── */}
            <SectionHeader>
              <FormattedMessage id="EditListingReviewForm.listingStyle" />
            </SectionHeader>

            {generatedData?.styleReason && (
              <p className={css.styleHint}>
                AI recommended <strong>{generatedData.suggestedStyle}</strong>: {generatedData.styleReason}
              </p>
            )}

            <div className={css.styleGrid}>
              {STYLE_OPTIONS.map(style => {
                const isSelected = values.listingStyle === style.value;
                return (
                  <button
                    key={style.value}
                    type="button"
                    className={classNames(css.styleCard, { [css.styleCardSelected]: isSelected })}
                    onClick={() => form.change('listingStyle', style.value)}
                  >
                    <div className={css.styleCardPreview} data-template={style.value} />
                    <span className={css.styleCardLabel}>{style.label}</span>
                    <span className={css.styleCardDesc}>{style.desc}</span>
                  </button>
                );
              })}
            </div>

            {/* ─── Errors & Submit ─── */}
            {updateListingError ? (
              <p className={css.error}>
                <FormattedMessage id="EditListingReviewForm.updateFailed" />
              </p>
            ) : null}
            {publishListingError ? (
              <p className={css.error}>
                <FormattedMessage id="EditListingReviewForm.publishFailed" />
              </p>
            ) : null}
            {showListingsError ? (
              <p className={css.error}>
                <FormattedMessage id="EditListingReviewForm.showListingFailed" />
              </p>
            ) : null}

            <Button
              className={css.submitButton}
              type="submit"
              inProgress={submitInProgress}
              disabled={submitDisabled}
              ready={updated || ready}
            >
              {saveActionMsg}
            </Button>
          </Form>
        );
      }}
    />
  );
};

export default memo(EditListingReviewForm, isEqual);
