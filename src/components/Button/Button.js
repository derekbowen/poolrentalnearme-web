import React, { useEffect, useState } from 'react';
import classNames from 'classnames';
import IconSpinner from '../IconSpinner/IconSpinner';
import IconCheckmark from '../IconCheckmark/IconCheckmark';

import css from './Button.module.css';

const PlainButton = (props) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const {
    children,
    className,
    rootClassName,
    spinnerClassName,
    checkmarkClassName,
    inProgress,
    ready,
    disabled,
    enforcePagePreloadFor,
    ...rest
  } = props;

  const rootClass = rootClassName || css.root;
  const classes = classNames(rootClass, className, {
    [css.ready]: ready,
    [css.inProgress]: inProgress,
  });

  let content;

  if (inProgress) {
    content = <IconSpinner rootClassName={spinnerClassName || css.spinner} />;
  } else if (ready) {
    content = <IconCheckmark rootClassName={checkmarkClassName || css.checkmark} />;
  } else {
    content = children;
  }

  // All buttons are disabled until the component is mounted. This
  // prevents e.g. being able to submit forms to the backend before
  // the client side is handling the submit.
  const buttonDisabled = mounted ? disabled : true;

  return (
    <button className={classes} {...rest} disabled={buttonDisabled}>
      {content}
    </button>
  );
};

/**
 * Topbar containing logo, main search and navigation links.
 *
 * @component
 * @param {Object} props
 * @param {string?} props.className add more style rules in addition to components own css.root
 * @param {string?} props.rootClassName overwrite components own css.root
 * @param {string?} props.spinnerClassName overwrite components own css.spinner
 * @param {string?} props.checkmarkClassName overwrite components own css.checkmark
 * @param {boolean} props.inProgress
 * @param {boolean} props.ready
 * @param {boolean} props.disabled
 * @param {string?} props.enforcePagePreloadFor
 * @param {ReactNode?} props.children
 * @returns {JSX.Element} topbar component
 */
const Button = props => {
  const { enforcePagePreloadFor, ...restProps } = props;
  return <PlainButton {...restProps} />;
};

export default Button;

export const PrimaryButton = props => {
  const classes = classNames(props.rootClassName || css.primaryButtonRoot, css.primaryButton);
  return <Button {...props} rootClassName={classes} />;
};
PrimaryButton.displayName = 'PrimaryButton';

export const PrimaryButtonInline = props => {
  const classes = classNames(props.rootClassName || css.primaryButtonInlineRoot, css.primaryButton);
  return <Button {...props} rootClassName={classes} />;
};
PrimaryButtonInline.displayName = 'PrimaryButtonInline';

export const SecondaryButton = props => {
  const classes = classNames(props.rootClassName || css.secondaryButtonRoot, css.secondaryButton);
  return <Button {...props} rootClassName={classes} />;
};
SecondaryButton.displayName = 'SecondaryButton';

export const SecondaryButtonInline = props => {
  const classes = classNames(
    props.rootClassName || css.secondaryButtonInlineRoot,
    css.secondaryButtonInline
  );
  return <Button {...props} rootClassName={classes} />;
};
SecondaryButton.displayName = 'SecondaryButton';

export const InlineTextButton = props => {
  const classes = classNames(props.rootClassName || css.inlineTextButtonRoot, css.inlineTextButton);
  return <Button {...props} rootClassName={classes} />;
};
InlineTextButton.displayName = 'InlineTextButton';

export const SocialLoginButton = props => {
  const classes = classNames(props.rootClassName || css.socialButtonRoot, css.socialButton);
  return <Button {...props} rootClassName={classes} />;
};

SocialLoginButton.displayName = 'SocialLoginButton';
