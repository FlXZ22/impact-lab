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

  constructor(status: number, code: ErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}
