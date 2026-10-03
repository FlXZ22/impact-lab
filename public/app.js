/** @import { AssistantMessage, ChatMessage, ReportDraft, UserMessage } from './js/types.js' */
import { ApiError, createReport, fetchConfig, fetchProgress, transcribe } from './js/api.js';
import { ChatStream } from './js/chat-stream.js';
import { resolveLocation } from './js/geo.js';
import { applyStaticText, language, setLanguage, t } from './js/i18n.js';
import { InputDock } from './js/input-dock.js';
import { applyProgress, loadTracked, track } from './js/my-reports.js';
import { currentLabel, renderTimeline } from './js/status-steps.js';
import { ListeningIndicator } from './js/listening-indicator.js';
import { PhotoError, preparePhoto } from './js/photo.js';
import { RecordingError, recordingSupported, VoiceRecorder } from './js/voice.js';

const SESSION_KEY = 'segnalami.conversation.v1';

/** @param {string} id @returns {HTMLElement} */
const byId = id => /** @type {HTMLElement} */ (document.getElementById(id));

const announcer = byId('announcer');
/** @param {string} message */
function announce(message) {
  // Clear first so repeating the same sentence is announced again.
  announcer.textContent = '';
  requestAnimationFrame(() => {
    announcer.textContent = message;
  });
}

/* ---------- State ---------- */

/** @type {ChatMessage[]} */
let messages = [];
/** Drafts of unsent or failed reports, kept in memory for retry. @type {Map<string, ReportDraft>} */
const drafts = new Map();

function newId() {
  return crypto.randomUUID();
}

/** @returns {AssistantMessage} */
function welcomeMessage() {
  return { id: 'welcome', role: 'assistant', kind: 'welcome', text: t().welcome, pending: false };
}

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const parsed = raw ? /** @type {unknown} */ (JSON.parse(raw)) : null;
    if (!Array.isArray(parsed)) return;
    messages = /** @type {ChatMessage[]} */ (parsed).flatMap(/** @returns {ChatMessage[]} */ message => {
      if (message.role === 'assistant') return message.pending ? [] : [message];
      // In-flight sends did not survive the reload; their drafts are gone, so show them as not sent.
      if (message.state === 'locating' || message.state === 'sending' || message.state === 'failed') {
        return [{ ...message, state: /** @type {const} */ ('failed'), imageUrl: message.imageUrl?.startsWith('blob:') ? null : message.imageUrl, error: null }];
      }
      return [message];
    });
  } catch {
    messages = [];
  }
}

function saveSession() {
  try {
    const persistable = messages.filter(message => message.id !== 'welcome' && !(message.role === 'assistant' && message.pending));
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(persistable));
  } catch {
    // Private mode or quota: the conversation simply won't survive a reload.
  }
}

/* ---------- UI ---------- */

/** Reports sent from this device, with their last known progress. */
let tracked = loadTracked();

const stream = new ChatStream(/** @type {HTMLOListElement} */ (byId('messages')), byId('conversation'), {
  onRetry: id => void retry(id),
  progressOf: reportId => tracked.find(item => item.id === reportId)?.progress ?? null,
  onOpenStatus: reportId => openMyReports(reportId)
});
const indicator = new ListeningIndicator(/** @type {HTMLCanvasElement} */ (byId('waveform')), /** @type {HTMLTimeElement} */ (byId('listen-timer')));

/** @param {ChatMessage} message */
function put(message) {
  const index = messages.findIndex(item => item.id === message.id);
  if (index === -1) messages.push(message);
  else messages[index] = message;
  stream.upsert(message);
  updateEmptyState();
  saveSession();
}

/** @param {string} id */
function drop(id) {
  messages = messages.filter(message => message.id !== id);
  stream.remove(id);
  updateEmptyState();
  saveSession();
}

const appShell = /** @type {HTMLElement} */ (document.querySelector('.app'));
/** Before the first report the composer sits centred under the greeting, as in a new chat. */
function updateEmptyState() {
  appShell.classList.toggle('is-empty', messages.length === 0);
}

function renderConversation() {
  const welcome = welcomeMessage();
  stream.renderAll([welcome, ...messages]);
  updateEmptyState();
}

/* ---------- Sending ---------- */

/** Codes only an outdated server returns: the page and the API are out of step. */
const STALE_SERVER_CODES = new Set(['DRAFT_EXPIRED', 'REVIEW_REQUIRED', 'JSON_REQUIRED']);

/** @param {unknown} error */
function describeError(error) {
  const strings = t();
  if (!(error instanceof ApiError)) return strings.errorGeneric;
  if (error.code === 'NETWORK') return strings.errorNetwork;
  if (STALE_SERVER_CODES.has(error.code) || (error.status === 404 && error.code === 'NOT_FOUND')) return strings.staleServer;
  const known = /** @type {Record<string, string>} */ (strings.errors)[error.code];
  return known ?? strings.errorGeneric;
}

/** @param {string} id @param {ReportDraft} draft */
async function deliver(id, draft) {
  const base = /** @type {UserMessage} */ (messages.find(message => message.id === id));
  // routing is cleared on every attempt: a retry must not show the previous answer.
  put({ ...base, state: 'locating', routing: null, error: null });

  const location = await resolveLocation();
  put({ ...base, state: 'sending', location, routing: null, error: null });

  const typingId = `${id}:reply`;
  put({ id: typingId, role: 'assistant', kind: 'reply', text: '', pending: true });

  try {
    const { report, reply, nextStep } = await createReport({ text: draft.text, image: draft.image, position: location.position, language: language() });
    drafts.delete(id);
    if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
    track(report);
    tracked = loadTracked();
    renderMyReportsButton();
    put({ ...base, state: 'saved', location, report, imageUrl: report.image_url, routing: nextStep, error: null });
    put({ id: typingId, role: 'assistant', kind: 'reply', text: reply.text, pending: false });
    announce(`${t().announceSaved} ${reply.text}`);
  } catch (error) {
    drop(typingId);
    put({ ...base, state: 'failed', location, routing: null, error: describeError(error) });
    announce(`${t().announceFailed} ${describeError(error)}`);
  }
}

/** @param {ReportDraft} draft */
function submit(draft) {
  const id = newId();
  drafts.set(id, draft);
  /** @type {UserMessage} */
  const message = {
    id,
    role: 'user',
    text: draft.text,
    imageUrl: draft.previewUrl,
    state: 'locating',
    location: null,
    report: null,
    routing: null,
    error: null,
    createdAt: new Date().toISOString()
  };
  put(message);
  void deliver(id, draft);
}

/** @param {string} id */
async function retry(id) {
  const draft = drafts.get(id);
  const message = messages.find(item => item.id === id);
  if (!message || message.role !== 'user') return;
  if (draft) return deliver(id, draft);
  // The draft was lost (page reloaded): put the text back in the field so it can be sent again.
  if (message.text) dock.insertText(message.text);
  drop(id);
}

/* ---------- Status tracking ---------- */

const sheet = /** @type {HTMLDialogElement} */ (byId('my-reports'));
const sheetList = byId('my-reports-list');
const myReportsButton = byId('my-reports-button');
const POLL_MS = 30_000;

function renderMyReportsButton() {
  const open = tracked.filter(item => item.progress?.status !== 'resolved').length;
  myReportsButton.hidden = tracked.length === 0;
  byId('my-reports-count').textContent = open > 0 ? String(open) : '';
  myReportsButton.setAttribute('aria-label', open > 0 ? `${t().myReports} (${open})` : t().myReports);
}

/** @param {string} iso */
function formatDay(iso) {
  return new Date(iso).toLocaleString(language() === 'it' ? 'it-IT' : 'en-GB', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

function renderMyReports() {
  const strings = t();
  byId('my-reports-empty').hidden = tracked.length > 0;
  sheetList.replaceChildren(
    ...tracked.map(item => {
      const card = document.createElement('li');
      card.className = 'tracked';
      card.id = `tracked-${item.id}`;
      const head = document.createElement('div');
      head.className = 'tracked-head';
      const title = document.createElement('p');
      title.className = 'tracked-title';
      title.textContent = item.excerpt || strings.photoOnly;
      const meta = document.createElement('p');
      meta.className = 'tracked-meta';
      meta.textContent = `${strings.reportNumber} ${item.id.slice(0, 4).toUpperCase()} · ${strings.sentOn} ${formatDay(item.createdAt)}`;
      head.append(title, meta);
      card.append(head);
      if (item.progress) card.append(renderTimeline(item.progress));
      return card;
    })
  );
}

/** @param {string} [focusId] Report to scroll to and highlight. */
function openMyReports(focusId) {
  renderMyReports();
  if (!sheet.open) sheet.showModal();
  void refreshProgress();
  if (focusId) {
    const card = document.getElementById(`tracked-${focusId}`);
    card?.scrollIntoView({ block: 'center' });
    card?.classList.add('is-focused');
    window.setTimeout(() => card?.classList.remove('is-focused'), 1600);
  }
}

let refreshing = false;
async function refreshProgress() {
  if (refreshing || tracked.length === 0 || document.visibilityState !== 'visible') return;
  refreshing = true;
  try {
    const changed = applyProgress(await fetchProgress(tracked.map(item => item.id)));
    tracked = loadTracked();
    if (changed.length === 0) return;
    renderMyReportsButton();
    if (sheet.open) renderMyReports();
    // Re-render the chat messages whose report moved to a new step.
    for (const message of messages) {
      if (message.role === 'user' && message.report && changed.some(item => item.id === message.report?.id)) stream.upsert(message);
    }
    for (const item of changed) {
      if (item.progress) announce(t().statusChanged(item.id.slice(0, 4).toUpperCase(), currentLabel(item.progress)));
    }
  } catch {
    // Offline or server restarting: keep the last known progress and try again on the next tick.
  } finally {
    refreshing = false;
  }
}

myReportsButton.addEventListener('click', () => openMyReports());
byId('my-reports-close').addEventListener('click', () => sheet.close());
// Click on the backdrop closes the sheet.
sheet.addEventListener('click', event => {
  if (event.target === sheet) sheet.close();
});
window.setInterval(() => void refreshProgress(), POLL_MS);
document.addEventListener('visibilitychange', () => void refreshProgress());

/* ---------- Photo ---------- */

/** @param {File} file */
async function handlePhoto(file) {
  const previewUrl = URL.createObjectURL(file);
  dock.showPhotoProcessing(previewUrl);
  try {
    const { payload } = await preparePhoto(file);
    dock.setPhotoReady(previewUrl, payload);
  } catch (error) {
    dock.clearPhoto();
    dock.note(error instanceof PhotoError && error.reason === 'too-large' ? t().photoTooLarge : t().photoUnsupported);
  }
}

/* ---------- Voice ---------- */

/** Set from /api/config; until then assume the server can transcribe and let it say otherwise. */
let transcriptionEnabled = true;
/** @type {VoiceRecorder | null} */
let recorder = null;
let transcribing = false;

async function startVoice() {
  const strings = t();
  if (recorder || transcribing) return;
  if (!recordingSupported()) return dock.note(strings.voiceUnsupported);
  if (!transcriptionEnabled) return dock.note(strings.voiceUnavailable);

  const session = new VoiceRecorder(() => {
    dock.note(t().voiceLimit);
    void stopVoice();
  });
  recorder = session;
  dock.setVoiceState('recording');
  indicator.start(null);
  try {
    await session.start();
    if (recorder === session) indicator.attach(session.analyser);
  } catch (error) {
    if (recorder !== session) return;
    recorder = null;
    indicator.stop();
    dock.setVoiceState('idle');
    const reason = error instanceof RecordingError ? error.reason : 'unsupported';
    dock.note(reason === 'denied' ? strings.voiceDenied : reason === 'no-microphone' ? strings.voiceNoMic : strings.voiceUnsupported);
  }
}

async function stopVoice() {
  const session = recorder;
  if (!session) return;
  recorder = null;
  indicator.stop();
  const strings = t();

  let audio;
  try {
    audio = await session.stop();
  } catch (error) {
    dock.setVoiceState('idle');
    dock.note(error instanceof RecordingError && error.reason === 'silent' ? strings.voiceNoSpeech : strings.voiceTooShort);
    return;
  }

  transcribing = true;
  dock.setVoiceState('transcribing');
  announce(strings.transcribing);
  try {
    const text = await transcribe(audio);
    transcribing = false;
    dock.setVoiceState('idle');
    if (text) dock.insertText(text);
    else dock.note(strings.voiceNoSpeech);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'TRANSCRIPTION_UNAVAILABLE') {
      transcriptionEnabled = false;
      dock.setVoiceAvailable(false);
      dock.note(strings.voiceUnavailable);
    } else {
      dock.note(describeError(error));
    }
  } finally {
    transcribing = false;
    dock.setVoiceState('idle');
  }
}

function cancelVoice() {
  if (!recorder) return;
  recorder.cancel();
  recorder = null;
  indicator.stop();
  dock.setVoiceState('idle');
}

/* ---------- Wiring ---------- */

const dock = new InputDock({
  onSubmit: draft => submit({ text: draft.text, image: draft.image, previewUrl: draft.previewUrl }),
  onPhotoPicked: file => void handlePhoto(file),
  onMicStart: () => void startVoice(),
  onMicStop: () => void stopVoice(),
  onMicCancel: cancelVoice
});

const languageButton = /** @type {HTMLButtonElement} */ (byId('language'));
function renderLanguageButton() {
  languageButton.textContent = t().otherLanguage;
  languageButton.setAttribute('aria-label', t().switchLanguage);
}
languageButton.addEventListener('click', () => {
  cancelVoice();
  setLanguage(language() === 'it' ? 'en' : 'it');
});
document.addEventListener('languagechange', () => {
  renderLanguageButton();
  renderConversation();
  renderMyReportsButton();
  if (sheet.open) renderMyReports();
});

applyStaticText();
renderLanguageButton();
dock.setVoiceAvailable(recordingSupported());
loadSession();
renderConversation();
renderMyReportsButton();
void refreshProgress();
// Focus the field on desktop only; on touch devices it would pop the keyboard over the welcome message.
if (window.matchMedia('(pointer: fine)').matches) dock.textarea.focus({ preventScroll: true });

fetchConfig()
  .then(config => {
    if (config.apiVersion !== 2) dock.note(t().staleServer, { persist: true });
    dock.setMaxLength(config.maxTextLength);
    transcriptionEnabled = config.transcription !== false;
    dock.setVoiceAvailable(recordingSupported() && transcriptionEnabled);
  })
  .catch(() => {
    // Defaults already apply; the first send will surface any real connectivity problem.
  });
