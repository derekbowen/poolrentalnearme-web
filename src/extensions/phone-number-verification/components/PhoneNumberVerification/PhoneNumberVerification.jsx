import React, { useState } from 'react';
import { func } from 'prop-types';
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from '../InputOTP/InputOTP';
import { MAX_OTP_LENGTH } from '../../config/configPhoneNumberVerification';

const PhoneNumberVerification = ({ onSubmit }) => {
  const [otp, setOtp] = useState('');

  const handleOTPChange = (value) => {
    setOtp(value);
  };

  return (
    <InputOTP
      maxLength={MAX_OTP_LENGTH}
      onChange={handleOTPChange}
      onComplete={() => onSubmit(otp)}
    >
      <InputOTPGroup>
        <InputOTPSlot index={0} />
        <InputOTPSlot index={1} />
        <InputOTPSlot index={2} />
      </InputOTPGroup>
      <InputOTPSeparator />
      <InputOTPGroup>
        <InputOTPSlot index={3} />
        <InputOTPSlot index={4} />
        <InputOTPSlot index={5} />
      </InputOTPGroup>
    </InputOTP>
  );
};

export default PhoneNumberVerification;

PhoneNumberVerification.propTypes = {
  onSubmit: func.isRequired,
};
