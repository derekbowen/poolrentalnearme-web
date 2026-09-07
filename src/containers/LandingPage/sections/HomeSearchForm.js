import React, { useEffect } from 'react';
import { Form as FinalForm, Field, FormSpy } from 'react-final-form';
import classNames from 'classnames';

import { FieldSingleDatePicker, Form } from '../../../components';
import LocationAutocompleteInput from '../../../components/LocationAutocompleteInput/LocationAutocompleteInput';

import shared from '../HomeShared.module.css';
import css from './HomeSearchForm.module.css';

const identity = (v) => v;

// The design's search glyph: a ring with a handle, drawn in the button's text colour.
export const SearchGlyph = ({ className }) => (
  <span className={classNames(css.glyph, className)} aria-hidden="true">
    <span className={css.glyphHandle} />
  </span>
);

// Publishes form values to the page (for the sticky mobile summary) after render, not during
// it — FormSpy's onChange fires mid-render, which React flags as a cross-component update.
const ValuesBridge = ({ values, onChange }) => {
  useEffect(() => {
    onChange(values);
  }, [values, onChange]);
  return null;
};

/**
 * Booking search: Where? (place autocomplete) · When? (single date) · How many? (guests) ·
 * Search pools. Renders as one white pill bar on desktop and a stacked card on mobile.
 * Submits `{ location, date, guests }` — the page turns that into the /s query.
 */
const HomeSearchForm = (props) => {
  const { onSubmit, onValuesChange, initialValues, inputRef } = props;

  return (
    <FinalForm
      onSubmit={onSubmit}
      initialValues={initialValues}
      render={({ handleSubmit }) => (
        <Form className={css.root} onSubmit={handleSubmit} enforcePagePreloadFor="SearchPage">
          {onValuesChange ? (
            <FormSpy subscription={{ values: true }}>
              {({ values }) => <ValuesBridge values={values} onChange={onValuesChange} />}
            </FormSpy>
          ) : null}

          <label className={classNames(css.field, css.where)}>
            <span className={css.label}>Where?</span>
            <Field
              name="location"
              format={identity}
              render={({ input, meta }) => (
                <LocationAutocompleteInput
                  className={css.whereInputRoot}
                  iconClassName={css.hiddenIcon}
                  inputClassName={css.whereInput}
                  predictionsClassName={css.predictions}
                  placeholder="City or ZIP"
                  closeOnBlur
                  useDarkText
                  inputRef={inputRef}
                  input={input}
                  meta={meta}
                />
              )}
            />
          </label>

          <div className={css.row}>
            <div className={classNames(css.field, css.when)}>
              <label className={css.label} htmlFor="home-search-date">
                When?
              </label>
              <FieldSingleDatePicker
                name="date"
                id="home-search-date"
                placeholderText="Pick a date"
                className={css.dateField}
                inputClassName={css.dateInputWrap}
                popupClassName={css.datePopup}
              />
            </div>
            <label className={classNames(css.field, css.guests)}>
              <span className={css.label}>How many?</span>
              <Field
                name="guests"
                render={({ input }) => (
                  <input
                    {...input}
                    type="number"
                    min="1"
                    max="500"
                    inputMode="numeric"
                    placeholder="Guests"
                    className={css.guestsInput}
                  />
                )}
              />
            </label>
          </div>

          <button type="submit" className={classNames(shared.buttonReset, shared.sun, css.submit)}>
            <SearchGlyph className={css.submitGlyph} />
            Search pools
          </button>
        </Form>
      )}
    />
  );
};

export default HomeSearchForm;
