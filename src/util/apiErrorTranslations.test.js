/**
 * Every key the classifier can emit has to exist in en.json, and every message
 * must actually format. A missing key makes react-intl render the raw id — so
 * a host would see "ApiError.tooLong" instead of a sentence, which is worse
 * than the generic error we are replacing.
 */
import { IntlMessageFormat } from 'intl-messageformat';
import en from '../translations/en.json';
import { classifyApiError } from './apiErrorDetails';

// Every message key reachable from classifyApiError.
const MESSAGE_KEYS = [
  'ApiError.tooLong',
  'ApiError.required',
  'ApiError.alreadyInUse',
  'ApiError.invalidFormat',
  'ApiError.sessionExpired',
  'ApiError.forbidden',
  'ApiError.conflict',
  'ApiError.rateLimited',
];
const LABEL_KEYS = [
  'ApiError.field.bio',
  'ApiError.field.firstName',
  'ApiError.field.lastName',
  'ApiError.field.displayName',
  'ApiError.field.profileImage',
];

describe('translation completeness', () => {
  it.each([...MESSAGE_KEYS, ...LABEL_KEYS])('%s exists in en.json', key => {
    expect(typeof en[key]).toBe('string');
    expect(en[key].length).toBeGreaterThan(0);
  });

  it('the generic fallback still exists', () => {
    expect(typeof en['ProfileSettingsForm.updateProfileFailed']).toBe('string');
  });

  it('no message is hardcoded English in the component', () => {
    // The component must reference keys, not literals.
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').join(
        __dirname,
        '../containers/ProfileSettingsPage/ProfileSettingsForm/ProfileSettingsForm.js'
      ),
      'utf8'
    );
    ['is too long', "can’t be empty", 'session expired', 'Too many attempts'].forEach(phrase => {
      expect(src).not.toContain(phrase);
    });
  });
});

describe('messages format correctly in both branches', () => {
  it.each(['ApiError.tooLong', 'ApiError.required', 'ApiError.alreadyInUse', 'ApiError.invalidFormat'])(
    '%s renders with and without a field label',
    key => {
      const withField = new IntlMessageFormat(en[key], 'en').format({ field: 'Bio' });
      const without = new IntlMessageFormat(en[key], 'en').format({ field: 'none' });
      expect(String(withField)).toContain('Bio');
      expect(String(without).length).toBeGreaterThan(0);
      expect(String(without)).not.toContain('none');
    }
  );

  it.each(['ApiError.sessionExpired', 'ApiError.forbidden', 'ApiError.conflict', 'ApiError.rateLimited'])(
    '%s formats with no arguments',
    key => {
      expect(String(new IntlMessageFormat(en[key], 'en').format({}))).toMatch(/\w/);
    }
  );
});

describe('end to end: a classified error resolves to real sentences', () => {
  it('bio-too-long becomes a readable line', () => {
    const c = classifyApiError({
      status: 400,
      apiErrors: [{ source: { pointer: '/profile/bio' }, details: 'Value is too long' }],
    });
    const label = new IntlMessageFormat(en[c.items[0].labelKey], 'en').format({});
    const line = new IntlMessageFormat(en[c.items[0].messageKey], 'en').format({ field: label });
    expect(String(line)).toBe('Bio is too long — please shorten it.');
  });
});
