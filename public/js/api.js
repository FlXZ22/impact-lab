/** @import { ClientConfig, CreateReportResponse, ImagePayload, Language, Position, ReportProgress } from './types.js' */

export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   * @param {number} status 0 when the network request itself failed.
   * @param {Record<string, unknown>} [details] Extra fields from the error body (e.g. `reason`).
   */
  constructor(message, code, status, details = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** Errors worth retrying unchanged: offline, rate-limited, server or storage hiccups. */
  get retryable() {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

/**
 * @template [T=Record<string, unknown>]
 * @param {string} url
 * @param {RequestInit} [init]
 * @returns {Promise<T>}
 */
async function request(url, init) {
  let response;
  try {
    response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  } catch {
    throw new ApiError('', 'NETWORK', 0);
  }
  /** @type {unknown} */
  let body = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON error page; handled below.
  }
  if (!response.ok) {
    const { code = 'SERVER_ERROR', message = '', ...details } = /** @type {{ code?: string, message?: string } & Record<string, unknown>} */ (body ?? {});
    throw new ApiError(message, code, response.status, details);
  }
  return /** @type {T} */ (body);
}

/**
 * Sends a recording for transcription. The body is the raw audio; its type tells the server the format.
 * No language is sent: the speech is transcribed in whatever language it was spoken.
 * @param {Blob} audio
 * @returns {Promise<string>}
 */
export async function transcribe(audio) {
  const { text } = await request('/api/transcriptions', {
    method: 'POST',
    headers: { 'Content-Type': audio.type || 'audio/webm' },
    body: audio
  });
  return /** @type {string} */ (text);
}

/**
 * Status and history of the given reports (no content). Unknown ids are simply absent.
 * @param {string[]} ids
 * @returns {Promise<ReportProgress[]>}
 */
export function fetchProgress(ids) {
  return request(`/api/reports/progress?ids=${ids.map(encodeURIComponent).join(',')}`);
}

/** @returns {Promise<ClientConfig>} */
export function fetchConfig() {
  return request('/api/config');
}

/**
 * @param {{ text: string | null, image: ImagePayload | null, position: Position | null, language: Language }} input
 * @returns {Promise<CreateReportResponse>}
 */
export function createReport({ text, image, position, language }) {
  return request('/api/reports', {
    method: 'POST',
    body: JSON.stringify({
      text,
      image,
      latitude: position?.latitude ?? null,
      longitude: position?.longitude ?? null,
      language
    })
  });
}
