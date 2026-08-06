// E.164: any country code (international accounts). Was US-only +1.
const phoneRegex = /^\+[1-9]\d{6,14}$/;

export const validPhoneNumber = (message) => (value) => {
  return value && phoneRegex.test(value) ? undefined : message;
};