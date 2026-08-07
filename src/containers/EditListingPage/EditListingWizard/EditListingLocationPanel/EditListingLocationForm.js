import React, { useEffect, useState } from 'react';
import { Form as FinalForm } from 'react-final-form';
import classNames from 'classnames';

// Import configs and util modules
import { FieldLocationAutocompleteInput } from 'components/LocationAutocompleteInput/LocationAutocompleteInput';
import { FormattedMessage, useIntl } from '../../../../util/reactIntl';
import {
  autocompleteSearchRequired,
  autocompletePlaceSelected,
  composeValidators,
} from '../../../../util/validators';

// Import shared components
import { Form, Button, FieldTextInput } from '../../../../components';
import { types as sdkTypes } from '../../../../util/sdkLoader';

const { LatLng } = sdkTypes;

// Manual-address fallback: if the Maps/Places script never loads (slow phones,
// blockers, provider outage), hosts can still type their address; we geocode it
// server-side and fill the same form value the autocomplete would have set.
// Auto-opens 5s after mount when no maps library is present; a toggle keeps it
// reachable any time (covers "dropdown shows nothing for my address" too).
const mapsStackPresent = () =>
  typeof window !== 'undefined' &&
  ((window.google && window.google.maps && window.google.maps.places) ||
    (window.mapboxgl && window.mapboxSdk));

const ManualAddressFallback = ({ form }) => {
  const [open, setOpen] = useState(false);
  const [autoOpened, setAutoOpened] = useState(false);
  const [addr, setAddr] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!mapsStackPresent()) {
        setOpen(true);
        setAutoOpened(true);
      }
    }, 5000);
    return () => clearTimeout(t);
  }, []);

  const useAddress = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const r = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ address: addr }),
      });
      const body = await r.json();
      if (!r.ok) {
        setError(body.error || 'Address lookup failed — please try again.');
        return;
      }
      form.change('location', {
        search: body.address,
        predictions: [],
        selectedPlace: { address: body.address, origin: new LatLng(body.lat, body.lng) },
      });
      form.blur('location');
      setDone(body.address);
    } catch (e) {
      setError('Address lookup failed — please check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ margin: '10px 0 4px' }}>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{ background: 'none', border: 'none', padding: 0, color: '#0ea5e9', fontSize: '13px', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
        >
          Address search not working? Enter it manually
        </button>
      ) : (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '12px 14px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, margin: '0 0 6px' }}>
            {autoOpened ? 'Address search didn\u2019t load — no problem. Type your full address:' : 'Type your full address:'}
          </p>
          <input
            type="text"
            value={addr}
            onChange={e => setAddr(e.target.value)}
            placeholder="123 Main St, Riverside, CA 92501"
            style={{ width: '100%', fontSize: '14px', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' }}
          />
          <button
            type="button"
            onClick={useAddress}
            disabled={busy || addr.trim().length < 8}
            style={{ marginTop: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: 600, borderRadius: '6px', border: 'none', background: '#0ea5e9', color: '#fff', cursor: 'pointer', opacity: busy || addr.trim().length < 8 ? 0.6 : 1 }}
          >
            {busy ? 'Looking up\u2026' : 'Use this address'}
          </button>
          {error ? <p style={{ color: '#b91c1c', fontSize: '13px', margin: '8px 0 0' }}>{error}</p> : null}
          {done ? (
            <p style={{ color: '#15803d', fontSize: '13px', margin: '8px 0 0' }}>
              {'\u2713'} Address set to: {done}. You can save and continue.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
};

// Import modules from this directory
import css from './EditListingLocationForm.module.css';

const identity = v => v;

/**
 * The EditListingLocationForm component.
 *
 * @component
 * @param {Object} props
 * @param {string} props.formId - The form id
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {string} [props.rootClassName] - Custom class that overrides the default class for the root element
 * @param {boolean} props.autoFocus - Whether the form is auto focused
 * @param {boolean} props.disabled - Whether the form is disabled
 * @param {boolean} props.ready - Whether the form is ready
 * @param {boolean} props.updated - Whether the form is updated
 * @param {boolean} props.updateInProgress - Whether the update is in progress
 * @param {Object} props.fetchErrors - The fetch errors object
 * @param {string} props.saveActionMsg - The save action message
 * @param {Function} props.onSubmit - The submit function
 * @param {Object} props.errors - The errors object
 * @param {propTypes.error} props.errors.showListingsError - The show listings error
 * @param {propTypes.error} props.errors.updateListingError - The update listing error
 * @returns {JSX.Element}
 */
export const EditListingLocationForm = props => (
  <FinalForm
    {...props}
    render={formRenderProps => {
      const {
        formId = 'EditListingLocationForm',
        autoFocus,
        className,
        rootClassName,
        disabled,
        ready,
        handleSubmit,
        invalid,
        pristine,
        saveActionMsg,
        updated,
        updateInProgress = false,
        fetchErrors,
        values,
      } = formRenderProps;

      const intl = useIntl();
      const addressRequiredMessage = intl.formatMessage({
        id: 'EditListingLocationForm.addressRequired',
      });
      const addressNotRecognizedMessage = intl.formatMessage({
        id: 'EditListingLocationForm.addressNotRecognized',
      });

      const optionalText = intl.formatMessage({
        id: 'EditListingLocationForm.optionalText',
      });

      const { updateListingError, showListingsError } = fetchErrors || {};

      const classes = classNames(rootClassName || css.root, className);
      const submitReady = (updated && pristine) || ready;
      const submitInProgress = updateInProgress;
      const submitDisabled = invalid || disabled || submitInProgress;

      return (
        <Form className={classes} onSubmit={handleSubmit}>
          {updateListingError ? (
            <p className={css.error}>
              <FormattedMessage id="EditListingLocationForm.updateFailed" />
            </p>
          ) : null}

          {showListingsError ? (
            <p className={css.error}>
              <FormattedMessage id="EditListingLocationForm.showListingFailed" />
            </p>
          ) : null}

          <FieldLocationAutocompleteInput
            rootClassName={css.locationAddress}
            inputClassName={css.locationAutocompleteInput}
            iconClassName={css.locationAutocompleteInputIcon}
            predictionsClassName={css.predictionsRoot}
            validClassName={css.validLocation}
            autoFocus={autoFocus}
            name="location"
            label={intl.formatMessage({ id: 'EditListingLocationForm.address' })}
            placeholder={intl.formatMessage({
              id: 'EditListingLocationForm.addressPlaceholder',
            })}
            useDefaultPredictions={false}
            format={identity}
            valueFromForm={values.location}
            validate={composeValidators(
              autocompleteSearchRequired(addressRequiredMessage),
              autocompletePlaceSelected(addressNotRecognizedMessage)
            )}
          />

          <ManualAddressFallback form={formRenderProps.form} />

          <FieldTextInput
            className={css.building}
            type="text"
            name="building"
            id={`${formId}building`}
            label={intl.formatMessage({ id: 'EditListingLocationForm.building' }, { optionalText })}
            placeholder={intl.formatMessage({
              id: 'EditListingLocationForm.buildingPlaceholder',
            })}
          />

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

export default EditListingLocationForm;
