import { AppError } from '../errors.ts';
import { isImageUpload, type ImageUpload } from '../images.ts';
import { containsObviousPersonalData } from './privacy.ts';
import { isLanguage, isReportStatus, MAX_TEXT_LENGTH, type Coordinates, type Language, type ReportStatus } from './report.ts';

export interface CreateReportInput {
  text: string | null;
  image: ImageUpload | null;
  coordinates: Coordinates | null;
  language: Language;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseCoordinates(latitude: unknown, longitude: unknown): Coordinates | null {
  if (latitude == null && longitude == null) return null;
  const valid =
    typeof latitude === 'number' && typeof longitude === 'number' &&
    Number.isFinite(latitude) && Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
  if (!valid) throw new AppError(400, 'INVALID_LOCATION', 'Latitude and longitude must be sent together as valid coordinates.');
  // ~11 cm precision is more than any phone delivers; rounding keeps storage tidy.
  return { latitude: Math.round(latitude * 1e6) / 1e6, longitude: Math.round(longitude * 1e6) / 1e6 };
}

export function parseCreateReport(body: unknown): CreateReportInput {
  if (!isRecord(body)) throw new AppError(400, 'INVALID_INPUT', 'Expected a JSON object.');
  const { text, image, latitude, longitude, language = 'it' } = body;

  if (text != null && typeof text !== 'string') throw new AppError(400, 'INVALID_INPUT', 'Text must be a string.');
  // Normalise line endings and collapse runs of blank lines; keep the person's wording intact.
  const cleanText = typeof text === 'string' ? text.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim() : '';
  if (cleanText.length > MAX_TEXT_LENGTH) throw new AppError(400, 'INVALID_INPUT', `Text is limited to ${MAX_TEXT_LENGTH} characters.`);
  if (cleanText && containsObviousPersonalData(cleanText)) {
    throw new AppError(422, 'PERSONAL_DATA', 'Remove email addresses, phone numbers and number plates, then send again.');
  }

  if (image != null && !isImageUpload(image)) throw new AppError(400, 'INVALID_IMAGE', 'Use a JPEG, PNG or WebP photo.');
  if (!cleanText && image == null) throw new AppError(400, 'EMPTY_REPORT', 'Write a message or add a photo.');
  if (!isLanguage(language)) throw new AppError(400, 'INVALID_INPUT', 'Language must be "it" or "en".');

  return { text: cleanText || null, image: image ?? null, coordinates: parseCoordinates(latitude, longitude), language };
}

export function parseStatusUpdate(body: unknown): ReportStatus {
  const status = isRecord(body) ? body.status : undefined;
  if (!isReportStatus(status)) throw new AppError(400, 'INVALID_INPUT', 'Status must be one of open, received, in_progress, resolved.');
  return status;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isReportId(value: string): boolean {
  return UUID.test(value);
}

/** Parses ?ids=a,b,c for the citizen progress lookup. Malformed ids are dropped, not fatal. */
export function parseIdList(value: unknown): string[] {
  if (typeof value !== 'string' || !value) throw new AppError(400, 'INVALID_INPUT', 'Pass report ids as ?ids=id1,id2.');
  const ids = [...new Set(value.split(',').map(id => id.trim()).filter(isReportId))];
  if (ids.length > 50) throw new AppError(400, 'INVALID_INPUT', 'At most 50 ids per request.');
  return ids;
}

export function parseLimit(value: unknown): number {
  if (value === undefined) return 50;
  const limit = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new AppError(400, 'INVALID_INPUT', 'limit must be an integer from 1 to 200.');
  return limit;
}
