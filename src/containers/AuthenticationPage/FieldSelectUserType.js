import React from 'react';
import { Field } from 'react-final-form';
import classNames from 'classnames';

import * as validators from '../../util/validators';

import { FieldSelect } from '../../components';

// PRNM copy per user type, falling back to whatever Console labels the type.
// A missing key must never blank the card, hence the intl.messages guard.
const cardCopy = (intl, type, fallback) => {
  const t = `FieldSelectUserType.card.${type}.title`;
  const s = `FieldSelectUserType.card.${type}.subtitle`;
  return {
    title: intl.messages?.[t] ? intl.formatMessage({ id: t }) : fallback,
    subtitle: intl.messages?.[s] ? intl.formatMessage({ id: s }) : null,
  };
};

import css from './AuthenticationPage.module.css';

// Hidden input field
const FieldHidden = props => {
  const { name } = props;
  return (
    <Field id={name} name={name} type="hidden" className={css.unitTypeHidden}>
      {fieldRenderProps => <input {...fieldRenderProps?.input} />}
    </Field>
  );
};

/**
 * Return React Final Form Field that allows selecting user type.
 *
 * @component
 * @param {Object} props
 * @param {string} props.rootClassName - The root class that overrides the default class css.userTypeSelect
 * @param {string} props.className - The class that extends the root class
 * @param {string} props.name - The name of the field / input
 * @param {Array<propTypes.userType>} props.userTypes - The user types
 * @param {boolean} props.hasExistingUserType - Whether the user type already exists
 * @param {intlShape} props.intl - The intl object
 * @returns {JSX.Element}
 */
const FieldSelectUserType = props => {
  const { rootClassName, className, name, userTypes, hasExistingUserType, intl } = props;
  const hasMultipleUserTypes = userTypes?.length > 1;
  const classes = classNames(rootClassName || css.userTypeSelect, className);

  return hasMultipleUserTypes && !hasExistingUserType ? (
    <Field
      name={name}
      validate={validators.required(
        intl.formatMessage({ id: 'FieldSelectUserType.required' })
      )}
    >
      {({ input, meta }) => (
        <div className={classes}>
          <p className={css.userTypeCardsLabel}>
            {intl.formatMessage({ id: 'FieldSelectUserType.label' })}
          </p>
          <div className={css.userTypeCards}>
            {userTypes.map(config => {
              const type = config.userType;
              const selected = input.value === type;
              const copy = cardCopy(intl, type, config.label);
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={selected}
                  className={classNames(css.userTypeCard, {
                    [css.userTypeCardSelected]: selected,
                  })}
                  onClick={() => input.onChange(type)}
                >
                  <span className={css.userTypeCardTitle}>{copy.title}</span>
                  {copy.subtitle ? (
                    <span className={css.userTypeCardSubtitle}>{copy.subtitle}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {(meta.touched || meta.submitFailed) && meta.error ? (
            <p className={css.userTypeCardsError}>{meta.error}</p>
          ) : null}
        </div>
      )}
    </Field>
  ) : (
    <>
      <FieldHidden name={name} />
    </>
  );
};

export default FieldSelectUserType;
