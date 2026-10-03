export type ErrorCode =
  | 'INVALID_INPUT'
  | 'EMPTY_REPORT'
  | 'INVALID_LOCATION'
  | 'INVALID_IMAGE'
  | 'IMAGE_TOO_LARGE'
  | 'PERSONAL_DATA'
  | 'JSON_REQUIRED'
  | 'ORIGIN_REJECTED'
  | 'NOT_FOUND'
  | 'STORAGE_ERROR'
  | 'RATE_LIMITED'
  | 'REPORT_REJECTED'
  | 'MODERATION_UNAVAILABLE'
  | 'INVALID_AUDIO'
  | 'AUDIO_TOO_LARGE'
  | 'TRANSCRIPTION_UNAVAILABLE'
  | 'TRANSCRIPTION_FAILED'
  // Used by the operations router; declared here so `tsc --strict` passes.
  | 'AI_NOT_CONFIGURED'
  | 'NOT_RETRYABLE'
  | 'SERVER_ERROR';

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;

  /** Extra machine-readable fields returned to the client (e.g. why a report was refused). */
  readonly details: Record<string, unknown> | undefined;

  constructor(status: number, code: ErrorCode, message: string, options?: ErrorOptions & { details?: Record<string, unknown> }) {
    super(message, options);
    this.details = options?.details;
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}
