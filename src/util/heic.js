/**
 * HEIC/HEIF → JPEG conversion for uploads.
 *
 * iPhones capture photos as HEIC/HEIF by default. Sharetribe's Images API
 * accepts JPEG/PNG/GIF/WEBP and rejects HEIC, so an iPhone host who picks a
 * camera-roll photo gets a silent upload failure (and a broken thumbnail,
 * since most browsers can't decode HEIC either). We convert to JPEG in the
 * browser before the file ever reaches sdk.images.upload.
 *
 * heic2any pulls in a ~1.5MB libheif WASM bundle, so it is imported lazily —
 * it only downloads for a user who actually selects a HEIC file.
 */

const HEIC_MIME_TYPES = [
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
];

// iOS occasionally hands us a File with an empty `type`, so fall back to the
// filename extension.
export const isHeic = file => {
  if (!file) return false;
  const type = (file.type || '').toLowerCase();
  if (HEIC_MIME_TYPES.includes(type)) return true;
  return /\.(heic|heif)$/i.test(file.name || '');
};

/**
 * Returns an uploadable image File. HEIC/HEIF inputs are transcoded to JPEG;
 * everything else is returned untouched. On any conversion error we fall back
 * to the original file (no worse than before the fix) so the flow never hangs.
 *
 * @param {File} file the file chosen from an <input type="file" />
 * @returns {Promise<File>}
 */
export const ensureUploadableImage = async file => {
  if (!isHeic(file)) return file;
  try {
    const { default: heic2any } = await import('heic2any');
    const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.82 });
    const blob = Array.isArray(converted) ? converted[0] : converted;
    const baseName = (file.name || 'photo').replace(/\.(heic|heif)$/i, '');
    return new File([blob], `${baseName}.jpg`, {
      type: 'image/jpeg',
      lastModified: file.lastModified || Date.now(),
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('HEIC conversion failed; uploading original file', e);
    return file;
  }
};
