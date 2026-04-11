import React, { forwardRef, useContext } from 'react';
import { OTPInput, OTPInputContext } from 'input-otp';
import { Dot } from 'lucide-react';

import { number, string } from 'prop-types';
import twClassNames from '../../utils/twClassNames';

const InputOTP = forwardRef(({ className, containerClassName, ...props }, ref) => (
  <OTPInput
    ref={ref}
    containerClassName={twClassNames(
      'flex items-center gap-2 has-[:disabled]:opacity-50',
      containerClassName
    )}
    className={twClassNames('disabled:cursor-not-allowed', className)}
    {...props}
  />
));
InputOTP.displayName = 'InputOTP';

InputOTP.defaultProps = {
  className: null,
  containerClassName: null,
};

InputOTP.propTypes = {
  className: string,
  containerClassName: string,
};

const InputOTPGroup = forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={twClassNames('flex items-center', className)} {...props} />
));
InputOTPGroup.displayName = 'InputOTPGroup';

InputOTPGroup.defaultProps = {
  className: '',
};

InputOTPGroup.propTypes = {
  className: string,
};

const InputOTPSlot = forwardRef(({ index, className, ...props }, ref) => {
  const inputOTPContext = useContext(OTPInputContext);
  const { char, hasFakeCaret, isActive } = inputOTPContext.slots[index];

  return (
    <div
      ref={ref}
      className={twClassNames(
        'relative flex h-10 w-10 items-center justify-center border-y border-r border-input text-sm transition-all first:rounded-l-md first:border-l last:rounded-r-md',
        isActive && 'z-10 ring-2 ring-ring ring-offset-background',
        className
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-4 w-px animate-caret-blink bg-foreground duration-1000" />
        </div>
      )}
    </div>
  );
});
InputOTPSlot.displayName = 'InputOTPSlot';

InputOTPSlot.defaultProps = {
  className: '',
};

InputOTPSlot.propTypes = {
  index: number.isRequired,
  className: string,
};

const InputOTPSeparator = forwardRef(({ ...props }, ref) => (
  <div ref={ref} role="separator" {...props}>
    <Dot />
  </div>
));
InputOTPSeparator.displayName = 'InputOTPSeparator';

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator };
