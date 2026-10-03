/** @import { ImagePayload } from './types.js' */
import { t } from './i18n.js';

/**
 * @param {string} id
 * @returns {HTMLElement}
 */
function byId(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node;
}

/**
 * @typedef {object} DockHandlers
 * @property {(draft: { text: string | null, image: ImagePayload | null, previewUrl: string | null }) => void} onSubmit
 * @property {(file: File) => void} onPhotoPicked
 * @property {() => void} onMicStart
 * @property {() => void} onMicStop
 * @property {() => void} onMicCancel
 */

/** @typedef {'idle' | 'recording' | 'transcribing'} VoiceState */

const DEFAULT_MAX_LENGTH = 2000;

/**
 * The composer card: photo picker (left), message field with send (centre), voice (right),
 * and the recording state that temporarily replaces the field.
 */
export class InputDock {
  textarea = /** @type {HTMLTextAreaElement} */ (byId('message-input'));
  #form = /** @type {HTMLFormElement} */ (byId('composer'));
  #send = /** @type {HTMLButtonElement} */ (byId('send-button'));
  #mic = /** @type {HTMLButtonElement} */ (byId('mic-button'));
  #photoInput = /** @type {HTMLInputElement} */ (byId('photo-input'));
  #attachment = byId('attachment');
  #attachmentImage = /** @type {HTMLImageElement} */ (byId('attachment-image'));
  #attachmentLabel = byId('attachment-label');
  #listening = byId('listening');
  #listeningText = byId('listening-text');
  #stop = /** @type {HTMLButtonElement} */ (byId('listen-stop'));
  #note = byId('dock-note');
  #noteTimer = 0;

  /** @type {{ payload: ImagePayload | null, previewUrl: string } | null} */
  #photo = null;
  #maxLength = DEFAULT_MAX_LENGTH;
  /** @type {VoiceState} */
  #voice = 'idle';
  #handlers;

  /** @param {DockHandlers} handlers */
  constructor(handlers) {
    this.#handlers = handlers;
    this.textarea.maxLength = this.#maxLength;

    this.#form.addEventListener('submit', event => {
      event.preventDefault();
      this.#submit();
    });
    this.textarea.addEventListener('input', () => {
      this.#autosize();
      this.#refresh();
    });
    this.textarea.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        this.#submit();
      }
    });
    this.#photoInput.addEventListener('change', () => {
      const file = this.#photoInput.files?.[0];
      // Reset so picking the same file again still fires change.
      this.#photoInput.value = '';
      if (file) this.#handlers.onPhotoPicked(file);
    });
    byId('attachment-remove').addEventListener('click', () => {
      this.clearPhoto();
      this.textarea.focus();
    });
    this.#mic.addEventListener('click', () => this.#handlers.onMicStart());
    this.#stop.addEventListener('click', () => this.#handlers.onMicStop());
    byId('listen-cancel').addEventListener('click', () => this.#handlers.onMicCancel());
    this.#listening.addEventListener('keydown', event => {
      if (event.key === 'Escape') this.#handlers.onMicCancel();
    });
  }

  /**
   * Applies the server's limit. Anything but a sane positive integer is ignored, so a stale or
   * mismatched server can never leave the field with maxLength 0 (which blocks all typing).
   * @param {unknown} max
   */
  setMaxLength(max) {
    if (typeof max !== 'number' || !Number.isInteger(max) || max < 1) return;
    this.#maxLength = max;
    this.textarea.maxLength = max;
    this.#refresh();
  }

  /** @param {boolean} available */
  setVoiceAvailable(available) {
    this.#mic.dataset.unavailable = String(!available);
  }

  /** Shows a photo as soon as it is picked, before it has finished processing. @param {string} previewUrl */
  showPhotoProcessing(previewUrl) {
    this.clearPhoto();
    this.#photo = { payload: null, previewUrl };
    this.#attachmentImage.src = previewUrl;
    this.#attachmentLabel.textContent = t().photoProcessing;
    this.#attachment.dataset.state = 'processing';
    this.#attachment.hidden = false;
    this.#refresh();
  }

  /** @param {string} previewUrl @param {ImagePayload} payload */
  setPhotoReady(previewUrl, payload) {
    if (this.#photo?.previewUrl !== previewUrl) return;
    this.#photo.payload = payload;
    this.#attachmentLabel.textContent = t().photoReady;
    this.#attachment.dataset.state = 'ready';
    this.#refresh();
  }

  /** @param {{ keepUrl?: boolean }} [options] Keep the object URL when the chat now owns it. */
  clearPhoto({ keepUrl = false } = {}) {
    if (this.#photo && !keepUrl) URL.revokeObjectURL(this.#photo.previewUrl);
    this.#photo = null;
    this.#attachment.hidden = true;
    this.#attachmentImage.removeAttribute('src');
    this.#refresh();
  }

  /** Appends transcribed text to whatever is already typed. @param {string} text */
  insertText(text) {
    const existing = this.textarea.value.trimEnd();
    this.textarea.value = `${existing ? `${existing} ` : ''}${text}`.slice(0, this.#maxLength);
    this.#autosize();
    this.#refresh();
    this.textarea.focus();
    this.textarea.setSelectionRange(this.textarea.value.length, this.textarea.value.length);
  }

  /** @param {VoiceState} state */
  setVoiceState(state) {
    const previous = this.#voice;
    this.#voice = state;
    const active = state !== 'idle';
    this.#form.hidden = active;
    this.#listening.hidden = !active;
    this.#listening.dataset.state = state;
    this.#attachment.classList.toggle('is-muted', active);
    this.#mic.setAttribute('aria-pressed', String(state === 'recording'));
    this.#listeningText.textContent = state === 'transcribing' ? t().transcribing : t().listening;
    this.#stop.disabled = state === 'transcribing';
    if (state === 'recording' && previous === 'idle') this.#stop.focus();
    if (state === 'idle' && previous !== 'idle') {
      // The field was hidden while recording; measure it again now that it is visible.
      this.#autosize();
      this.textarea.focus();
    }
  }

  /**
   * A short, self-dismissing note above the composer for recoverable problems.
   * @param {string} message
   * @param {{ persist?: boolean }} [options] Persistent notes stay until the page reloads.
   */
  note(message, { persist = false } = {}) {
    clearTimeout(this.#noteTimer);
    if (this.#note.dataset.persist === 'true' && !persist) return;
    this.#note.textContent = message;
    this.#note.hidden = false;
    this.#note.dataset.persist = String(persist);
    if (!persist) {
      this.#noteTimer = window.setTimeout(() => {
        this.#note.hidden = true;
      }, 7000);
    }
  }

  #submit() {
    if (this.#send.disabled) return;
    const text = this.textarea.value.trim() || null;
    const photo = this.#photo;
    this.#handlers.onSubmit({ text, image: photo?.payload ?? null, previewUrl: photo?.previewUrl ?? null });
    this.textarea.value = '';
    this.clearPhoto({ keepUrl: true });
    this.#autosize();
    this.textarea.focus();
  }

  #refresh() {
    const processing = this.#photo !== null && this.#photo.payload === null;
    const hasContent = this.textarea.value.trim().length > 0 || (this.#photo?.payload ?? null) !== null;
    this.#send.disabled = processing || !hasContent || this.textarea.value.length > this.#maxLength;
  }

  #autosize() {
    this.textarea.style.height = 'auto';
    this.textarea.style.height = `${this.textarea.scrollHeight}px`;
  }
}
