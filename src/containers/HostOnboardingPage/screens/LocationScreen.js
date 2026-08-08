import React, { useState } from 'react';

import LocationAutocompleteInput from '../../../components/LocationAutocompleteInput/LocationAutocompleteInput';
import css from '../HostOnboardingPage.module.css';

/**
 * Step 2 — "Where is your pool?".
 *
 * Uses the SAME autocomplete the existing wizard uses, and hands the selected
 * place straight to buildLocationPayload, which applies the identical privacy
 * split. One address entry produces three things: coordinates for search, a
 * city-level public label, and the exact street address in private data.
 *
 * The default export of LocationAutocompleteInput is the raw Impl, so it works
 * here without dragging react-final-form into this flow — it just needs an
 * `input`-shaped prop and a `meta`-shaped prop.
 *
 * @param {Object} props
 * @param {Object} props.value autocomplete value {search, predictions, selectedPlace}
 * @param {Function} props.onChange (value) => void
 * @param {string} props.building
 * @param {Function} props.onBuildingChange
 * @param {Function} props.onContinue
 * @param {Function} props.onBack
 * @param {'idle'|'saving'|'saved'|'error'} [props.saveState]
 */
const LocationScreen = (props) => {
  const {
    value,
    onChange,
    building,
    onBuildingChange,
    onContinue,
    onBack,
    saveState = 'idle',
  } = props;
  const [touched, setTouched] = useState(false);

  const saving = saveState === 'saving';
  // A typed string is not an address. Only a place PICKED from the dropdown has
  // coordinates, and without coordinates the listing never appears in location
  // search — so that, not the text, is what gates Continue.
  const hasPlace = !!value?.selectedPlace?.origin;
  const canContinue = hasPlace && !saving;

  const handleSubmit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (canContinue) {
      onContinue();
    }
  };

  return (
    <form className={css.stepForm} onSubmit={handleSubmit} noValidate>
      <div className={css.saveStatus} role="status" aria-live="polite">
        {saving ? <span className={css.saving}>Saving&hellip;</span> : null}
        {saveState === 'saved' ? <span className={css.saved}>Saved</span> : null}
      </div>

      {saveState === 'error' ? (
        <p className={css.saveError}>We couldn&rsquo;t save your changes. Try again.</p>
      ) : null}

      <div className={css.field}>
        <label className={css.label} htmlFor="onboarding-location">
          What&rsquo;s the address?
        </label>
        <p className={css.hint}>
          Start typing and pick your address from the list. Guests only ever see your city until
          they book &mdash; your street address is shared after you accept.
        </p>
        <LocationAutocompleteInput
          rootClassName={css.locationRoot}
          inputClassName={css.input}
          iconClassName={css.locationIcon}
          predictionsClassName={css.locationPredictions}
          id="onboarding-location"
          name="location"
          placeholder="Start typing your address"
          input={{
            name: 'location',
            value: value || {},
            onChange,
            onFocus: () => {},
            onBlur: () => setTouched(true),
          }}
          meta={{ touched, valid: hasPlace, error: undefined }}
        />
        {touched && !hasPlace ? (
          <p className={css.fieldHint}>Pick your address from the dropdown so we can map it.</p>
        ) : null}
      </div>

      <div className={css.field}>
        <label className={css.label} htmlFor="onboarding-building">
          Unit or building <span className={css.optional}>(optional)</span>
        </label>
        <input
          id="onboarding-building"
          className={css.input}
          type="text"
          value={building || ''}
          autoComplete="off"
          placeholder="Apt, suite, gate code notes"
          onChange={(e) => onBuildingChange(e.target.value)}
        />
      </div>

      <div className={css.stepActions}>
        <button type="submit" className={css.primaryButton} disabled={!canContinue}>
          {saving ? 'Saving…' : 'Continue'}
        </button>
        <button type="button" className={css.backLink} onClick={onBack}>
          &larr; Back
        </button>
      </div>
    </form>
  );
};

export default LocationScreen;
