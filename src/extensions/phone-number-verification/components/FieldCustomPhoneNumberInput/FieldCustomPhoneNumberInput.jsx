import React from 'react';
import { Field } from 'react-final-form';
import PhoneInput from 'react-phone-number-input';
import { node, object, string, func } from 'prop-types';
import { intlShape } from 'util/reactIntl';
import { SUPPORTED_COUNTRY } from '../../config/configPhoneNumberVerification';

import 'react-phone-number-input/style.css';
import css from './FieldCustomPhoneNumberInput.module.css';

const FieldCustomPhoneNumberInput = (props) => {
  const { id, name, label, placeholder, validate } = props;

  return (
    <Field name={name} validate={validate}>
      {({ input, meta }) => (
        <div className={css.phoneNumberInput}>
          <label htmlFor={id}>{label}</label>
          <PhoneInput
            {...input}
            id={id}
            international
            countries={[SUPPORTED_COUNTRY]}
            defaultCountry={SUPPORTED_COUNTRY}
            placeholder={placeholder}
            limitMaxLength
            countryCallingCodeEditable={true}
          />
          {meta.error && meta.touched && <span className={css.error}>{meta.error}</span>}
        </div>
      )}
    </Field>
  );
};

FieldCustomPhoneNumberInput.defaultProps = {
  validate: null,
};

FieldCustomPhoneNumberInput.propTypes = {
  name: string.isRequired,
  id: string.isRequired,
  validate: func,
  intl: intlShape.isRequired,
  label: object.isRequired,
  placeholder: node.isRequired,
};

export default FieldCustomPhoneNumberInput;
