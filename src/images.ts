import sharp from 'sharp';
import { AppError } from './errors.ts';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type AcceptedType = (typeof ACCEPTED_TYPES)[number];

export interface ImageUpload {
  media_type: AcceptedType;
  data: string;
}

export function isImageUpload(value: unknown): value is ImageUpload {
  if (typeof value !== 'object' || value === null) return false;
  const { media_type, data } = value as Record<string, unknown>;
  return typeof media_type === 'string' && (ACCEPTED_TYPES as readonly string[]).includes(media_type) && typeof data === 'string';
}

/**
 * Decodes, validates and re-encodes a photo. Re-encoding drops EXIF (including GPS),
 * ICC and any trailing payload, applies orientation, and caps dimensions.
 */
export async function sanitizePhoto(upload: ImageUpload): Promise<Buffer> {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(upload.data)) throw new AppError(400, 'INVALID_IMAGE', 'The photo could not be read.');
  const input = Buffer.from(upload.data, 'base64');
  if (input.length > MAX_IMAGE_BYTES) throw new AppError(413, 'IMAGE_TOO_LARGE', 'The photo is larger than 5 MB.');
  try {
    const options = { limitInputPixels: 40_000_000, failOn: 'error' } as const;
    const { format } = await sharp(input, options).metadata();
    if (format !== 'jpeg' && format !== 'png' && format !== 'webp') throw new Error(`Unsupported format: ${String(format)}`);
    return await sharp(input, options)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch (error) {
    throw new AppError(400, 'INVALID_IMAGE', 'The photo could not be read. Use a JPEG, PNG or WebP image.', { cause: error });
  }
}
