/** @import { ImagePayload } from './types.js' */

const MAX_EDGE = 2048;
const MAX_BYTES = 5 * 1024 * 1024;

export class PhotoError extends Error {
  /** @param {'unsupported' | 'too-large'} reason */
  constructor(reason) {
    super(reason);
    this.name = 'PhotoError';
    this.reason = reason;
  }
}

/** @param {Blob} blob @returns {Promise<string>} */
function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).slice(String(reader.result).indexOf(',') + 1));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Downscales and re-encodes a picked photo in the browser. Phone photos shrink from megabytes to
 * a few hundred kilobytes, and re-encoding drops EXIF metadata (including GPS) before upload.
 * The server sanitizes again; this pass is for speed and privacy on the wire.
 * @param {File} file
 * @returns {Promise<{ payload: ImagePayload, blob: Blob }>}
 */
export async function preparePhoto(file) {
  if (file.type && !file.type.startsWith('image/')) throw new PhotoError('unsupported');

  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new PhotoError('unsupported');
  }

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new PhotoError('unsupported');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!(blob instanceof Blob)) throw new PhotoError('unsupported');
    if (blob.size > MAX_BYTES) throw new PhotoError('too-large');
    return { payload: { media_type: 'image/jpeg', data: await toBase64(blob) }, blob };
  } finally {
    bitmap.close();
  }
}
