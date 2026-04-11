import { postMethod } from '../common/api';

export const apiSendOTP = (body) => {
  return postMethod('/api/phone-number-verification/otp', body);
};

export const apiVerifyOTP = (body) => {
  return postMethod('/api/phone-number-verification/otp/verify', body);
};
