export const MAX_OTP_LENGTH = 6;
export const INITIAL_TIME_COUNT = +import.meta.env.VITE_OTP_WINDOW;
// Countries selectable in the phone input. Canada was added for the .ca launch:
// the field was locked to ['US'], so a Canadian host could not pick their own
// country. Both are +1, so Twilio delivery already works — only the UI blocked it.
export const SUPPORTED_COUNTRIES = ['US', 'CA'];
export const SUPPORTED_COUNTRY = SUPPORTED_COUNTRIES[0]; // default selection
