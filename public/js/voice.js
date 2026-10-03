/** Records a voice message for server-side transcription (Groq Whisper). */

export const MAX_RECORDING_MS = 120_000;
/** Shorter than this is almost always an accidental tap. */
const MIN_RECORDING_MS = 600;

/** Container formats in order of preference; Safari only offers MP4. */
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

export const recordingSupported = () =>
  window.isSecureContext && typeof window.MediaRecorder === 'function' && typeof navigator.mediaDevices?.getUserMedia === 'function';

/** Peak RMS below this is room noise, not speech; such recordings are not uploaded. */
const SPEECH_RMS = 0.02;

/** @typedef {'denied' | 'no-microphone' | 'unsupported' | 'too-short' | 'silent'} RecordingFailure */

export class RecordingError extends Error {
  /** @param {RecordingFailure} reason */
  constructor(reason) {
    super(reason);
    this.name = 'RecordingError';
    this.reason = reason;
  }
}

/**
 * One recording: microphone stream → MediaRecorder for the upload, plus an AnalyserNode
 * on the same stream for the waveform. stop() resolves with the audio; cancel() discards it.
 */
export class VoiceRecorder {
  /** @type {MediaStream | null} */ #stream = null;
  /** @type {MediaRecorder | null} */ #recorder = null;
  /** @type {AudioContext | null} */ #context = null;
  /** @type {AnalyserNode | null} */ analyser = null;
  /** @type {Blob[]} */ #chunks = [];
  #startedAt = 0;
  #autoStop = 0;
  #levelTimer = 0;
  /** Loudest moment so far, or null when there is no analyser to measure with. @type {number | null} */
  #peakRms = null;
  /** @type {(() => void) | null} */ #onAutoStop;

  /** @param {() => void} onAutoStop Called when the length limit stops the recording. */
  constructor(onAutoStop) {
    this.#onAutoStop = onAutoStop;
  }

  async start() {
    if (!recordingSupported()) throw new RecordingError('unsupported');
    try {
      this.#stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      throw new RecordingError(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'no-microphone' : 'unsupported');
    }

    const mimeType = MIME_CANDIDATES.find(type => MediaRecorder.isTypeSupported(type));
    try {
      this.#recorder = new MediaRecorder(this.#stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32_000 });
    } catch {
      this.#release();
      throw new RecordingError('unsupported');
    }
    this.#recorder.ondataavailable = event => {
      if (event.data.size > 0) this.#chunks.push(event.data);
    };
    this.#recorder.start(1000);
    this.#startedAt = performance.now();
    this.#autoStop = window.setTimeout(() => this.#onAutoStop?.(), MAX_RECORDING_MS);

    try {
      this.#context = new AudioContext();
      this.analyser = this.#context.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.72;
      this.#context.createMediaStreamSource(this.#stream).connect(this.analyser);
      const samples = new Float32Array(this.analyser.fftSize);
      this.#peakRms = 0;
      this.#levelTimer = window.setInterval(() => {
        if (!this.analyser) return;
        this.analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const value of samples) sum += value * value;
        this.#peakRms = Math.max(this.#peakRms ?? 0, Math.sqrt(sum / samples.length));
      }, 100);
    } catch {
      // The waveform is decoration; recording continues without it.
      this.analyser = null;
    }
  }

  /** Finish and return the audio. @returns {Promise<Blob>} */
  stop() {
    const recorder = this.#recorder;
    if (!recorder || recorder.state === 'inactive') {
      this.#release();
      return Promise.reject(new RecordingError('too-short'));
    }
    const duration = performance.now() - this.#startedAt;
    const peak = this.#peakRms;
    return new Promise((resolve, reject) => {
      recorder.onstop = () => {
        const type = (recorder.mimeType || this.#chunks[0]?.type || 'audio/webm').split(';')[0] ?? 'audio/webm';
        const blob = new Blob(this.#chunks, { type });
        this.#release();
        if (duration < MIN_RECORDING_MS || blob.size < 512) reject(new RecordingError('too-short'));
        else if (peak !== null && peak < SPEECH_RMS) reject(new RecordingError('silent'));
        else resolve(blob);
      };
      recorder.stop();
    });
  }

  /** Abort and discard everything. */
  cancel() {
    if (this.#recorder && this.#recorder.state !== 'inactive') {
      this.#recorder.onstop = null;
      this.#recorder.stop();
    }
    this.#release();
  }

  #release() {
    clearTimeout(this.#autoStop);
    clearInterval(this.#levelTimer);
    this.#onAutoStop = null;
    this.#stream?.getTracks().forEach(track => track.stop());
    void this.#context?.close().catch(() => undefined);
    this.#stream = null;
    this.#context = null;
    this.analyser = null;
    this.#chunks = [];
  }
}
