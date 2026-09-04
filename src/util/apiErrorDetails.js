/**
 * Classify an API error into SAFE, LOCALISED, field-level messages.
 *
 * WHY: `storableError` preserves `apiErrors` — the field-level detail
 * Sharetribe returns on a 400 — and every form discarded it in favour of one
 * generic string. A host could not save his profile and nobody, including
 * support, could see which field was rejected, because the only copy of the
 * answer sat unread in Redux.
 *
 * SECURITY MODEL — this module never returns backend text.
 *
 * It would be easy, and wrong, to render `apiError.details` straight into the
 * page. That string is written by the API, not by us: it can quote the value
 * that was submitted, name internal fields, or carry an id or a stack fragment.
 * The profile payload includes `privateData` and `protectedData`, so echoing it
 * risks showing a customer their own private values back — or worse, in a
 * shared screenshot.
 *
 * So this module is a CLASSIFIER, not a formatter:
 *
 *   - Backend strings are pattern-matched, never returned.
 *   - Output is a translation key plus, at most, a field label.
 *   - Field labels come from an ALLOWLIST of user-facing fields. A pointer into
 *     privateData/protectedData, or any field not on the list, yields no label.
 *   - Anything unrecognised falls back to the generic message.
 *
 * The raw `apiErrors` stay untouched in Redux for diagnostics. Nothing here
 * mutates or forwards them.
 */

/**
 * Fields a customer can see on their own profile form. The value is the
 * translation key for the label. Anything absent from this map is deliberately
 * unlabelled — including every privateData and protectedData pointer.
 */
const SAFE_FIELD_LABELS = {
  bio: 'ApiError.field.bio',
  firstName: 'ApiError.field.firstName',
  lastName: 'ApiError.field.lastName',
  displayName: 'ApiError.field.displayName',
  profileImage: 'ApiError.field.profileImage',
  profileImageId: 'ApiError.field.profileImage',
};

/** Scopes whose field names must never be echoed back, even as a label. */
const SENSITIVE_SCOPES = ['privatedata', 'protecteddata', 'metadata'];

/**
 * Resolve a JSON pointer to a safe label key, or null.
 * "/profile/bio" -> ApiError.field.bio ; "/profile/privateData/x" -> null
 */
export const safeLabelKey = pointer => {
  if (typeof pointer !== 'string' || pointer === '') return null;
  const parts = pointer.split('/').filter(Boolean);
  if (parts.some(p => SENSITIVE_SCOPES.includes(p.toLowerCase()))) return null;
  const leaf = parts[parts.length - 1];
  return Object.prototype.hasOwnProperty.call(SAFE_FIELD_LABELS, leaf)
    ? SAFE_FIELD_LABELS[leaf]
    : null;
};

/** Backend phrasing -> our message key. Matched against, never rendered. */
const DETAIL_PATTERNS = [
  { re: /too long|maximum length|exceeds|length must be/i, key: 'ApiError.tooLong' },
  { re: /must not be (empty|blank)|is required|cannot be blank|must be present/i, key: 'ApiError.required' },
  { re: /already (in use|taken|exists)|duplicate/i, key: 'ApiError.alreadyInUse' },
  { re: /invalid|malformed|not a valid|format/i, key: 'ApiError.invalidFormat' },
];

/** HTTP status -> our message key, for whole-request failures. */
const STATUS_KEYS = {
  401: 'ApiError.sessionExpired',
  403: 'ApiError.forbidden',
  409: 'ApiError.conflict',
  429: 'ApiError.rateLimited',
};

const rawDetail = e => {
  const d = e?.details || e?.title || e?.code;
  return typeof d === 'string' ? d : '';
};

/**
 * @returns {{ items: Array<{labelKey: string|null, messageKey: string}>,
 *             statusKey: string|null, hasUnclassified: boolean }}
 */
export const classifyApiError = error => {
  const apiErrors = Array.isArray(error?.apiErrors) ? error.apiErrors : [];
  const status = error?.status ?? null;

  let hasUnclassified = false;
  const items = [];

  apiErrors.forEach(e => {
    const detail = rawDetail(e);
    const match = DETAIL_PATTERNS.find(p => p.re.test(detail));
    if (!match) {
      // Unrecognised backend phrasing: count it, render nothing specific.
      if (detail) hasUnclassified = true;
      return;
    }
    const pointer = e?.source?.pointer || e?.source?.parameter || null;
    items.push({ labelKey: safeLabelKey(pointer), messageKey: match.key });
  });

  // De-duplicate identical label+message pairs.
  const seen = new Set();
  const deduped = items.filter(i => {
    const k = `${i.labelKey}|${i.messageKey}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return {
    items: deduped,
    statusKey: STATUS_KEYS[status] || null,
    hasUnclassified: hasUnclassified && deduped.length === 0,
  };
};

/** True when we have nothing specific and safe to say. */
export const isGenericOnly = error => {
  const c = classifyApiError(error);
  return c.items.length === 0 && !c.statusKey;
};
