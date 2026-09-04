/**
 * Turn a stored API error into something a person can act on.
 *
 * WHY: `storableError` already preserves `apiErrors` — the field-level detail
 * Sharetribe returns on a 400. Every form then throws it away and renders one
 * hardcoded string. A host in Lathrop hit "Oops, something went wrong. Please
 * try again." on every profile save, and neither he, nor support, nor the
 * founder could see which field was rejected, because the only copy of that
 * answer was sitting unread in Redux.
 *
 * This does not invent diagnoses. It reports what the API said, and adds a
 * plain-language hint only for causes that are unambiguous from the payload.
 */

/** Human-readable pointer: "/profile/bio" -> "Bio". */
const labelForPointer = pointer => {
  if (!pointer || typeof pointer !== 'string') return null;
  const leaf = pointer.split('/').filter(Boolean).pop();
  if (!leaf) return null;
  return leaf
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, c => c.toUpperCase());
};

/**
 * @param {object} error a storableError-shaped object
 * @returns {{ items: Array<{field: string|null, detail: string}>, status: number|null }}
 */
export const apiErrorDetails = error => {
  const apiErrors = (error && error.apiErrors) || [];
  const items = apiErrors
    .map(e => {
      const pointer = e?.source?.pointer || e?.source?.parameter || null;
      const detail = e?.details || e?.title || e?.code || null;
      if (!detail) return null;
      return { field: labelForPointer(pointer), detail: String(detail) };
    })
    .filter(Boolean);
  return { items, status: (error && error.status) || null };
};

/**
 * One short sentence naming the likely cause, or null when the payload does not
 * support a confident statement. Deliberately conservative: a wrong hint is
 * worse than none, because it sends support down the wrong path.
 */
export const likelyCause = error => {
  const { items, status } = apiErrorDetails(error);
  const blob = items.map(i => `${i.field || ''} ${i.detail}`).join(' ').toLowerCase();

  if (/too long|maximum length|exceeds/.test(blob)) {
    const named = items.find(i => /too long|maximum length|exceeds/.test(i.detail.toLowerCase()));
    return named?.field ? `${named.field} is too long.` : 'One of the fields is too long.';
  }
  if (/must not be (empty|blank)|is required|cannot be blank/.test(blob)) {
    const named = items.find(i =>
      /must not be (empty|blank)|is required|cannot be blank/.test(i.detail.toLowerCase())
    );
    return named?.field ? `${named.field} cannot be empty.` : 'A required field is empty.';
  }
  if (status === 403) return 'This account does not have permission to make that change.';
  if (status === 401) return 'Your session expired. Sign in again and retry.';
  if (status === 429) return 'Too many attempts. Wait a moment and try again.';
  return null;
};
