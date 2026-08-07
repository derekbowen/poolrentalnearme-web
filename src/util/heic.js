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
// Formats Sharetribe's Images API reliably accepts. Everything else (WebP,
// AVIF, BMP, TIFF, unknown camera formats) gets canvas-transcoded to JPEG,
// and any image whose longest side exceeds MAX_DIM (or >18MB) is downscaled —
// covering the over-limit rejection class in the same pass.
const SAFE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
const RISKY_EXT = /\.(webp|avif|bmp|tiff?|jfif)$/i;
const MAX_DIM = 4096;
const MAX_BYTES = 18 * 1024 * 1024;

const decodeToBitmap = async file => {
  if (typeof window !== 'undefined' && window.createImageBitmap) {
    return window.createImageBitmap(file);
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
};

const canvasToJpeg = async (file, label) => {
  const bmp = await decodeToBitmap(file);
  const w = bmp.width || bmp.naturalWidth;
  const h = bmp.height || bmp.naturalHeight;
  if (!w || !h) throw new Error('decode produced empty image');
  const scale = Math.min(1, MAX_DIM / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));
  if (!blob) throw new Error('canvas.toBlob returned null');
  const baseName = (file.name || 'photo').replace(/\.[a-z0-9]+$/i, '');
  return new File([blob], `${baseName}.jpg`, {
    type: 'image/jpeg',
    lastModified: file.lastModified || Date.now(),
  });
};

export const ensureUploadableImage = async file => {
  try {
    if (isHeic(file)) {
      const { default: heic2any } = await import('heic2any');
      const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.82 });
      const blob = Array.isArray(converted) ? converted[0] : converted;
      const baseName = (file.name || 'photo').replace(/\.(heic|heif)$/i, '');
      return new File([blob], `${baseName}.jpg`, {
        type: 'image/jpeg',
        lastModified: file.lastModified || Date.now(),
      });
    }
    const type = (file.type || '').toLowerCase();
    const isImageType = type.indexOf('image/') === 0;
    const unsafeType = isImageType && SAFE_TYPES.indexOf(type) === -1;
    const unsafeExt = !type && RISKY_EXT.test(file.name || '');
    const tooBig = (file.size || 0) > MAX_BYTES;
    if (!unsafeType && !unsafeExt && !tooBig) return file;
    return await canvasToJpeg(file, type || file.name);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('image transcode failed; uploading original file', e);
    return file;
  }
};
