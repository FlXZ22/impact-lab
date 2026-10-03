import { AppError } from '../errors.ts';
import type { Transcriber, TranscriptionInput } from './types.ts';

const ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';
const TIMEOUT_MS = 30_000;

const EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/flac': 'flac'
};
export const SUPPORTED_AUDIO_TYPES = Object.keys(EXTENSIONS);

/**
 * Whisper invents these captions on silence or noise, Italian ones especially.
 * A transcript that is only one of them is treated as "nothing said".
 */
const SILENCE_HALLUCINATIONS = [
  /^sottotitoli (creati dalla comunità amara\.org|a cura di .*|e revisione a cura di .*)\.?$/i,
  // A report never consists only of a courtesy phrase; Whisper produces these from silence or noise.
  /^(grazie|grazie mille|grazie a tutti|ciao|ciao a tutti|buonasera|buongiorno|arrivederci|a presto)( (per|della) (la )?(visione|attenzione|ascolto)| per aver (guardato|ascoltato))?[.!]*$/i,
  /^(thank you|thanks|thank you (so much|very much|for watching)|thanks for watching|bye|you|okay)[.!]*$/i,
  /^[.…\s]+$/
];

export function cleanTranscript(text: string): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  return SILENCE_HALLUCINATIONS.some(pattern => pattern.test(trimmed)) ? '' : trimmed;
}

export interface GroqOptions {
  apiKey: string | null;
  model: string;
}

/** Groq-hosted Whisper. Audio is sent for transcription only and never stored by this app. */
export function createGroqTranscriber({ apiKey, model }: GroqOptions): Transcriber {
  if (!apiKey) {
    return {
      enabled: false,
      transcribe: async () => {
        throw new AppError(503, 'TRANSCRIPTION_UNAVAILABLE', 'Voice transcription is not configured on this server.');
      }
    };
  }

  return {
    enabled: true,
    async transcribe({ audio, mimeType, language }: TranscriptionInput) {
      const extension = EXTENSIONS[mimeType];
      if (!extension) throw new AppError(415, 'INVALID_AUDIO', 'Unsupported audio format.');

      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType }), `recording.${extension}`);
      form.append('model', model);
      // No language unless the caller pins one: Whisper detects it, so people can speak any language.
      if (language) form.append('language', language);
      form.append('response_format', 'json');
      form.append('temperature', '0');

      let response: Response;
      try {
        response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
          signal: AbortSignal.timeout(TIMEOUT_MS)
        });
      } catch (error) {
        throw new AppError(502, 'TRANSCRIPTION_FAILED', 'The transcription service could not be reached. Try again or type the message.', { cause: error });
      }

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        console.warn(`[transcription] Groq HTTP ${response.status}: ${detail.slice(0, 300)}`);
        if (response.status === 400) throw new AppError(422, 'INVALID_AUDIO', 'The recording could not be understood. Try recording again.');
        if (response.status === 429) throw new AppError(429, 'RATE_LIMITED', 'Too many transcriptions right now. Wait a moment and try again.');
        throw new AppError(502, 'TRANSCRIPTION_FAILED', 'Transcription failed. Try again or type the message.');
      }

      const body = (await response.json().catch(() => null)) as { text?: unknown } | null;
      if (typeof body?.text !== 'string') throw new AppError(502, 'TRANSCRIPTION_FAILED', 'Transcription failed. Try again or type the message.');
      return cleanTranscript(body.text);
    }
  };
}
