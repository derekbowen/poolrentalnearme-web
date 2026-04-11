import React from 'react';
import classNames from 'classnames';

import FieldCustomPhoneNumberInput from '../../extensions/phone-number-verification/components/FieldCustomPhoneNumberInput/FieldCustomPhoneNumberInput';
import { intlShape } from '../../util/reactIntl';
import { propTypes } from '../../util/types';
import { composeValidators, required as fieldRequired } from '../../util/validators';
import { validPhoneNumber } from '../../extensions/phone-number-verification/utils/validators';

/**
 * A component that renders the phone number field.
 *
 * @component
 * @param {Object} props
 * @param {string} props.rootClassName - The root class name that overrides the default class css.phoneNumber
 * @param {string} props.className - The class that extends the root class
 * @param {string} props.formId - The form id
 * @param {string} props.formName - The form name
 * @param {propTypes.userType} props.userTypeConfig - The user type config
 * @param {intlShape} props.intl - The intl object
 * @returns {JSX.Element}
 */
const UserFieldPhoneNumber = props => {
  const { rootClassName, className, formId, formName, userTypeConfig, intl } = props;

  const { displayInSignUp, required } = userTypeConfig?.phoneNumberSettings || {};
  const isDisabled = userTypeConfig?.defaultUserFields?.phoneNumber === false;
  const isAllowedInSignUp = displayInSignUp === true;

  if (isDisabled || !isAllowedInSignUp) {
    return null;
  }

  const isRequired = required === true;
  const validateMaybe = isRequired
    ? {
        validate: composeValidators(
          fieldRequired(
            intl.formatMessage({
              id: `${formName}.phoneNumberRequired`,
            })
          ),
          validPhoneNumber(
            intl.formatMessage({
              id: `${formName}.phoneNumberInvalid`,
            })
          )
        ),
      }
    : {};

  return (
    <FieldCustomPhoneNumberInput
      className={classNames(className, { [rootClassName]: !!rootClassName })}
      id={formId ? `${formId}.phoneNumber` : 'phoneNumber'}
      name="phoneNumber"
      label={intl.formatMessage({
        id: `${formName}.phoneNumberLabel`,
      })}
      placeholder={intl.formatMessage({
        id: `${formName}.phoneNumberPlaceholder`,
      })}
      {...validateMaybe}
    />
  );
};

export default UserFieldPhoneNumber;
