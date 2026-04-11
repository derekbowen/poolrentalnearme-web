import React from "react";
import classNames from "classnames";
import { bool, element, node, oneOfType, string } from "prop-types";

import useAnimation from "../../hooks/UI/useAnimation";
import useAccordionContext from "../../hooks/context/useAccordionContext";

import css from "./ExpandableSection.module.css";

const ExpandableSection = (props) => {
  const {
    element: Component,
    children,
    className,
    needAnimation,
    showArrow,
    ...rest
  } = props;

  const { isOpen } = useAccordionContext();
  const [shouldRender, onAnimationEnd] = useAnimation(isOpen);

  const isDisplay = needAnimation ? shouldRender : isOpen;
  const animationClassName = needAnimation
    ? { [css.entered]: isOpen, [css.closed]: !isOpen }
    : {};

  return isDisplay ? (
    <Component
      className={classNames(css.collapse, className, animationClassName)}
      onAnimationEnd={onAnimationEnd}
      {...rest}
    >
      {children}
    </Component>
  ) : null;
};

ExpandableSection.defaultProps = {
  element: "div",
  needAnimation: false,
  showArrow: true,
};

ExpandableSection.propTypes = {
  element: oneOfType([string, element]),
  showArrow: bool,
  needAnimation: bool,
  children: node,
  className: string,
};

export default ExpandableSection;
