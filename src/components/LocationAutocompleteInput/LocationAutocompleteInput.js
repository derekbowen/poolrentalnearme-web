import React from 'react';
import { Field } from 'react-final-form';
import { ValidationError } from '..';
import LocationAutocompleteInputImpl from './LocationAutocompleteInputImpl';

/**
 * LocationAutocompleteInput component.
 *
 * @component
 * @param {Object} props
 * @param {string?} props.className add more style rules in addition to components own css.root
 * @param {string?} props.rootClassName overwrite components own css.root
 * @param {string?} props.labelClassName
 * @param {string?} props.label
 * @param {boolean} props.hideErrorMessage
 * @param {Object} props.input
 * @param {string} props.input.name
 * @param {Function} props.input.onChange
 * @param {Object} props.meta
 * @returns {JSX.Element} arrow head icon
 */
const LocationAutocompleteInputComponent = props => {
  /* eslint-disable no-unused-vars */
  const { rootClassName, labelClassName, hideErrorMessage, ...restProps } = props;
  const { input, label, meta, valueFromForm, ...otherProps } = restProps;
  /* eslint-enable no-unused-vars */

  const value = typeof valueFromForm !== 'undefined' ? valueFromForm : input.value;
  const locationAutocompleteProps = { label, meta, ...otherProps, input: { ...input, value } };
  const labelInfo = label ? (
    <label className={labelClassName} htmlFor={input.name}>
      {label}
    </label>
  ) : null;

  return (
    <div className={rootClassName}>
      {labelInfo}
      <LocationAutocompleteInputImpl {...locationAutocompleteProps} />
      {hideErrorMessage ? null : <ValidationError fieldMeta={meta} />}
    </div>
  );
};

export default LocationAutocompleteInputImpl;

export const FieldLocationAutocompleteInput = (props) => {
  return <Field component={LocationAutocompleteInputComponent} {...props} />;
};
