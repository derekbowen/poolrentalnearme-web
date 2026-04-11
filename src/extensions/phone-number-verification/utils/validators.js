const phoneRegex = /^\+1[0-9]{10}$/;

export const validPhoneNumber = (message) => (value) => {
  return value && phoneRegex.test(value) ? undefined : message;
};