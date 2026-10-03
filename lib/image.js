import sharp from 'sharp';
import { AppError } from './claude.js';

export async function cleanPhoto(image) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(image.media_type) || typeof image.data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)) throw new AppError(400, 'INVALID_IMAGE', 'Use a JPEG, PNG or WebP image.');
  const buffer = Buffer.from(image.data, 'base64');
  if (buffer.length > 4 * 1024 * 1024) throw new AppError(413, 'IMAGE_TOO_LARGE', 'Image limit: 4 MB.');
  try {
    const options = { limitInputPixels: 25000000 };
    const metadata = await sharp(buffer, options).metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format)) throw new Error('Unsupported decoded format');
    const clean = await sharp(buffer, options).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    return { media_type: 'image/jpeg', data: clean.toString('base64') };
  } catch { throw new AppError(400, 'INVALID_IMAGE', 'This image could not be read.'); }
}
