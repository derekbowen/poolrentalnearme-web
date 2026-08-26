import React from 'react';
import { Field, useForm } from 'react-final-form';

import { FormattedMessage, useIntl } from '../../../util/reactIntl';
import { createSlug } from '../../../util/urlHelpers';
import {
  hasCompleteGuestBands,
  selectVariantForGuestCount,
  getVariantGuestBand,
  validateGuestBands,
} from '../../../util/priceVariantGuests';

import { FieldSelect } from '../../../components';

import css from './PriceVariantPicker.module.css';

const DEFAULT_PRICE_VARIANT_NAME = 'default-variant-name';

const VariantNameMaybe = (props) => {
  const { className, priceVariant } = props;
  return priceVariant?.name ? (
    <div className={className}>
      <FormattedMessage
        id="PriceVariantPicker.onePriceVariantOnly"
        values={{ priceVariantName: priceVariant?.name }}
      />
    </div>
  ) : null;
};

const FieldHidden = (props) => {
  const { name, ...rest } = props;
  return (
    <Field id={name} name={name} type="hidden" className={css.hidden} {...rest}>
      {(fieldRenderProps) => <input {...fieldRenderProps?.input} />}
    </Field>
  );
};

// c192: guest-count-first picking. When every variant carries structured
// minGuests/maxGuests and the bands tile cleanly (no overlaps, no gaps), the
// guest answers the natural question - "how many people?" - and the tier
// follows from it. The count is stored as `partySize`, so it rides the
// existing pipeline to the transaction's protectedData and the host's
// "Party of N" breakdown row with no extra wiring.
//
// Fail-closed on both edges: listings whose bands overlap or leave holes keep
// the plain tier dropdown (a count matching two prices must never pick one),
// and a count is only offered if it resolves to exactly one tier.
const GuestCountTierPicker = (props) => {
  const intl = useIntl();
  const { priceVariants, onPriceVariantChange, disabled } = props;
  const form = useForm();

  const bands = priceVariants.map(getVariantGuestBand);
  const minFloor = Math.min(...bands.map((b) => b.minGuests));
  const maxPriced = Math.max(...bands.map((b) => b.maxGuests));
  const counts = Array.from({ length: maxPriced - minFloor + 1 }, (_, i) => minFloor + i).filter(
    (n) => selectVariantForGuestCount(priceVariants, n).reason === 'ok'
  );

  return (
    <>
      <FieldSelect
        name="partySize"
        id="guestCountTier"
        className={css.priceVariantFieldSelect}
        selectClassName={css.priceVariantSelect}
        label={intl.formatMessage(
          { id: 'PriceVariantPicker.guestCountLabel' },
          { maxGuests: maxPriced }
        )}
        onChange={(value) => {
          const { variant } = selectVariantForGuestCount(priceVariants, value);
          const nextName = variant?.name || null;
          // Read the current tier fresh - the render-scope value would be stale
          // after the first change.
          const currentName = form.getState().values?.priceVariantName || null;
          if (nextName !== currentName) {
            form.change('priceVariantName', nextName);
            // Same reset the tier dropdown performs - the price changed, so
            // previously chosen times must be re-validated. Staying inside the
            // same tier keeps the chosen times: the price did not move.
            onPriceVariantChange(nextName);
          }
        }}
        disabled={disabled}
        showLabelAsDisabled={disabled}
      >
        <option disabled value="" key="unselected">
          {intl.formatMessage({ id: 'PriceVariantPicker.guestCountUnselected' })}
        </option>
        {counts.map((n) => (
          <option value={n} key={n}>
            {n}
          </option>
        ))}
      </FieldSelect>
      <Field id="priceVariantName" name="priceVariantName" type="hidden">
        {(fieldRenderProps) => (
          <>
            <input {...fieldRenderProps?.input} className={css.hidden} />
            {fieldRenderProps?.input?.value ? (
              <div className={css.priceVariantName}>
                <FormattedMessage
                  id="PriceVariantPicker.resolvedTier"
                  values={{ priceVariantName: fieldRenderProps.input.value }}
                />
              </div>
            ) : null}
          </>
        )}
      </Field>
    </>
  );
};

const PriceVariantPicker = (props) => {
  const intl = useIntl();
  const { priceVariants, onPriceVariantChange, disabled } = props;
  const hasMultiplePriceVariants = priceVariants?.length > 1;
  const hasOnePriceVariant = priceVariants?.length === 1;

  const bandsComplete = hasMultiplePriceVariants && hasCompleteGuestBands(priceVariants);
  const hasBlockingBandIssues =
    bandsComplete &&
    validateGuestBands(priceVariants).issues.some((i) => i.type === 'overlap' || i.type === 'gap');
  if (bandsComplete && !hasBlockingBandIssues) {
    return (
      <GuestCountTierPicker
        priceVariants={priceVariants}
        onPriceVariantChange={onPriceVariantChange}
        disabled={disabled}
      />
    );
  }

  return hasMultiplePriceVariants ? (
    <FieldSelect
      name="priceVariantName"
      id="priceVariant"
      className={css.priceVariantFieldSelect}
      selectClassName={css.priceVariantSelect}
      label={intl.formatMessage({ id: 'PriceVariantPicker.priceVariantLabel' })}
      onChange={onPriceVariantChange}
      disabled={disabled}
      showLabelAsDisabled={disabled}
    >
      <option disabled value="" key="unselected">
        {intl.formatMessage({ id: 'PriceVariantPicker.priceVariantUnselected' })}
      </option>
      {priceVariants.map((pv) => (
        <option value={pv.name} key={pv.name} data-slug={createSlug(pv.name)}>
          {pv.name}
        </option>
      ))}
    </FieldSelect>
  ) : hasOnePriceVariant ? (
    <>
      <VariantNameMaybe priceVariant={priceVariants?.[0]} className={css.priceVariantName} />
      <FieldHidden
        name="priceVariantName"
        format={(value) => {
          return value == null ? DEFAULT_PRICE_VARIANT_NAME : value;
        }}
        parse={(value) => {
          const response = value === DEFAULT_PRICE_VARIANT_NAME ? null : value;
          return response;
        }}
      />
    </>
  ) : null;
};

export default PriceVariantPicker;
