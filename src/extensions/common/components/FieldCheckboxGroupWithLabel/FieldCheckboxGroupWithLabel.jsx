import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';

import { FieldCheckboxGroup } from '../../../../components';

import css from './FieldCheckboxGroupWithLabel.module.css';

const FieldCheckboxGroupWithLabel = (props) => {
  const { rootClassName, className, label, id, ...rest } = props;
  const classes = classNames(rootClassName || css.root, className);

  return (
    <div className={classes}>
      {label ? <label htmlFor={id}>{label}</label> : null}
      <FieldCheckboxGroup id={id} {...rest} />
    </div>
  );
};

FieldCheckboxGroupWithLabel.defaultProps = {
  className: null,
  rootClassName: null,
  label: null,
};

const { string } = PropTypes;

FieldCheckboxGroupWithLabel.propTypes = {
  className: string,
  rootClassName: string,
  label: string,
  id: string.isRequired,
};

export default FieldCheckboxGroupWithLabel;
