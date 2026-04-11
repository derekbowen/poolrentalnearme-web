import React, { useState } from 'react';
import { bool, element, node, oneOfType, string } from 'prop-types';

import { AccordionProvider } from '../../hooks/context/useAccordionContext';

const Accordion = (props) => {
  const { element: Component, children, initialStatus, ...rest } = props;
  const [isOpen, setIsOpen] = useState(initialStatus);

  return (
    <AccordionProvider value={{ isOpen, onToggle: () => setIsOpen(!isOpen) }}>
      <Component {...rest}>{children}</Component>
    </AccordionProvider>
  );
};

Accordion.defaultProps = {
  element: 'div',
  initialStatus: false,
};

Accordion.propTypes = {
  element: oneOfType([string, element]),
  initialStatus: bool,
  children: node,
};

export default Accordion;
