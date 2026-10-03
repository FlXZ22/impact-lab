import type { Language } from '../domain/report.ts';

export interface TranscriptionInput {
  audio: Buffer;
  /** Base MIME type without parameters, e.g. audio/webm. */
  mimeType: string;
  /** Optional hint. Omitted, the language is detected from the audio (any language Whisper knows). */
  language?: Language;
}

/** Speech-to-text contract. Routes depend on this, never on a provider. */
export interface Transcriber {
  readonly enabled: boolean;
  /** Returns the transcript, or an empty string when nothing intelligible was said. */
  transcribe(input: TranscriptionInput): Promise<string>;
}
