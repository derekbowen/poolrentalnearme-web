import React from 'react';
import { bool, element, func, node, oneOfType, string } from 'prop-types';

import { IconArrowHead } from '../../../../components';
import useAccordionContext from '../../hooks/context/useAccordionContext';

import css from './Toggle.module.css';

const DIRECTION_DOWN = 'down';
const DIRECTION_UP = 'up';

const Toggle = (props) => {
  const { element: Component, children, onClick, showArrow, ...rest } = props;
  const { onToggle, isOpen } = useAccordionContext();

  const handleClick = (event) => {
    onToggle();
    onClick(event);
  };

  return (
    <Component onClick={handleClick} {...rest}>
      {children}
      {showArrow && (
        <IconArrowHead className={css.arrow} direction={isOpen ? DIRECTION_UP : DIRECTION_DOWN} />
      )}
    </Component>
  );
};

Toggle.defaultProps = {
  element: 'div',
  showArrow: false,
  onClick: () => {},
};

Toggle.propTypes = {
  element: oneOfType([string, element]),
  onClick: func,
  showArrow: bool,
  children: node,
};

export default Toggle;
