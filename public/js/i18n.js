/** @import { Language } from './types.js' */

const STRINGS = {
  it: {
    conversationLabel: 'Conversazione',
    switchLanguage: 'Switch to English',
    otherLanguage: 'EN',
    welcome: 'Ciao! Cosa non funziona? Scrivi, parla o manda una foto, anche nella tua lingua: quando invii, ti chiedo la posizione per sapere dov’è il problema.',
    welcomeNote: 'La segnalazione viene salvata qui: non contatta il Comune.',
    placeholder: 'Descrivi il problema…',
    messageLabel: 'Messaggio',
    send: 'Invia segnalazione',
    addPhoto: 'Aggiungi una foto',
    removePhoto: 'Rimuovi la foto',
    photoReady: 'Foto pronta',
    photoProcessing: 'Preparo la foto…',
    dictate: 'Detta il messaggio',
    listening: 'Registrazione',
    transcribing: 'Trascrivo…',
    cancelDictation: 'Annulla registrazione',
    stopDictation: 'Fine, trascrivi',
    you: 'Tu',
    assistant: 'SegnalaMi',
    typing: 'SegnalaMi sta scrivendo',
    locating: 'Cerco la posizione…',
    sending: 'Invio…',
    saved: 'Salvata',
    failed: 'Non inviata',
    retry: 'Riprova',
    reportNumber: 'N.',
    openMap: 'Apri la posizione sulla mappa',
    accuracy: 'precisione',
    location: {
      granted: '',
      denied: 'Posizione non autorizzata',
      timeout: 'Posizione non trovata in tempo',
      unavailable: 'Posizione non disponibile',
      unsupported: 'Posizione non supportata'
    },
    announceSaved: 'Segnalazione salvata.',
    announceFailed: 'Segnalazione non inviata.',
    errorNetwork: 'Connessione assente. Controlla la rete e riprova.',
    errorGeneric: 'Qualcosa non ha funzionato. Riprova.',
    photoTooLarge: 'La foto è troppo grande, anche dopo il ridimensionamento.',
    photoUnsupported: 'Non riesco a leggere questa foto. Prova con un JPEG o un PNG.',
    voiceUnsupported: 'Questo browser non può registrare audio. Puoi usare il microfono della tastiera del telefono.',
    voiceDenied: 'Accesso al microfono negato. Puoi riattivarlo dalle impostazioni del sito.',
    voiceNoMic: 'Nessun microfono trovato.',
    voiceUnavailable: 'La trascrizione vocale non è attiva su questo server.',
    voiceTooShort: 'Registrazione troppo breve. Tieni premuto un attimo di più.',
    voiceNoSpeech: 'Non ho sentito parole. Riprova quando sei pronto.',
    voiceLimit: 'Raggiunti i 2 minuti: trascrivo quello che hai detto.',
    footnote: 'Non è un servizio d’emergenza. Niente volti, targhe o dati personali.',
    textTooLong: (/** @type {number} */ max) => `Massimo ${max} caratteri.`,
    staleServer: 'Il server in esecuzione è una versione vecchia dell’app. Fermalo (Ctrl+C) e riavvialo con npm start.',
    myReports: 'Le mie segnalazioni',
    myReportsShort: 'Stato',
    close: 'Chiudi',
    myReportsHint: 'Segui a che punto è ogni segnalazione inviata da questo dispositivo. Lo stato si aggiorna da solo.',
    myReportsEmpty: 'Non hai ancora inviato segnalazioni da questo dispositivo.',
    photoOnly: 'Segnalazione con foto',
    sentOn: 'Inviata',
    followStatus: 'Segui lo stato',
    nextStep: {
      title: 'Chi se ne occupa',
      titleEmergency: 'Sembra un\u2019emergenza',
      // PRODUCT.md: never imply that an authority has been contacted. This line is why.
      note: 'Niente \u00e8 stato inviato: questo passaggio lo fai tu.',
      actions: {
        CALL: 'Chiama',
        SUBMIT_FORM: 'Apri il modulo',
        USE_APP: 'Apri l\u2019app',
        CALL_EMERGENCY: 'Chiama il 112',
        ANSWER_QUESTIONS: '',
        NONE: ''
      }
    },
    stepPending: 'In attesa',
    stepOf: (/** @type {number} */ n, /** @type {number} */ total, /** @type {string} */ label) => `Passo ${n} di ${total}: ${label}`,
    statusChanged: (/** @type {string} */ number, /** @type {string} */ label) => `Segnalazione N. ${number}: ${label}`,
    steps: {
      open: { label: 'Inviata', detail: 'Abbiamo salvato la tua segnalazione.' },
      received: { label: 'Consegnata al Comune', detail: 'Il Comune l’ha ricevuta.' },
      in_progress: { label: 'Presa in carico', detail: 'Qualcuno ci sta lavorando.' },
      resolved: { label: 'Risolta', detail: 'Il problema è stato risolto. Grazie!' }
    },
    errors: {
      PERSONAL_DATA: 'Togli email, numeri di telefono e targhe, poi invia di nuovo.',
      EMPTY_REPORT: 'Scrivi un messaggio o aggiungi una foto.',
      INVALID_INPUT: 'Il messaggio non è valido. Controlla il testo e riprova.',
      INVALID_LOCATION: 'La posizione ricevuta non è valida. Riprova.',
      INVALID_IMAGE: 'Non riesco a leggere questa foto. Prova con un JPEG o un PNG.',
      IMAGE_TOO_LARGE: 'La foto supera i 5 MB.',
      RATE_LIMITED: 'Troppe richieste in poco tempo. Aspetta un minuto e riprova.',
      STORAGE_ERROR: 'Non sono riuscito a salvare. Riprova tra poco.',
      INVALID_AUDIO: 'Non ho capito la registrazione. Riprova a registrare.',
      AUDIO_TOO_LARGE: 'Registrazione troppo lunga: resta sotto i due minuti.',
      TRANSCRIPTION_FAILED: 'La trascrizione non è riuscita. Riprova o scrivi il messaggio.',
      TRANSCRIPTION_UNAVAILABLE: 'La trascrizione vocale non è attiva su questo server.',
      MODERATION_UNAVAILABLE: 'Non riesco a controllare la segnalazione in questo momento. Riprova tra poco.'
    },
    rejected: 'Non segnalabile',
    rejections: {
      emergency: 'Sembra un’emergenza: chiama subito il 112. Questo servizio non è monitorato in tempo reale, quindi non registro la segnalazione.',
      natural_event: 'Non posso registrarla: è un evento naturale che non crea pericoli né barriere per nessuno. Se invece causa un problema, come un albero caduto o un sottopasso allagato, descrivilo e lo segnalo.',
      off_topic: 'Non posso registrarla: non descrive un problema in un luogo o in un servizio pubblico.',
      abusive: 'Non posso registrarla: contiene insulti, minacce o contenuti rivolti a una persona.',
      harmful: 'Non posso registrarla: questo contenuto non è consentito.'
    }
  },
  en: {
    conversationLabel: 'Conversation',
    switchLanguage: 'Passa all’italiano',
    otherLanguage: 'IT',
    welcome: 'Hi! What isn’t working? Type, speak or send a photo, in your own language too: when you send, I’ll ask for your location so the problem can be found.',
    welcomeNote: 'Reports are saved here: this does not contact the City.',
    placeholder: 'Describe the problem…',
    messageLabel: 'Message',
    send: 'Send report',
    addPhoto: 'Add a photo',
    removePhoto: 'Remove the photo',
    photoReady: 'Photo ready',
    photoProcessing: 'Preparing photo…',
    dictate: 'Dictate the message',
    listening: 'Recording',
    transcribing: 'Transcribing…',
    cancelDictation: 'Cancel recording',
    stopDictation: 'Done, transcribe',
    you: 'You',
    assistant: 'SegnalaMi',
    typing: 'SegnalaMi is typing',
    locating: 'Finding location…',
    sending: 'Sending…',
    saved: 'Saved',
    failed: 'Not sent',
    retry: 'Retry',
    reportNumber: 'No.',
    openMap: 'Open the location on a map',
    accuracy: 'accuracy',
    location: {
      granted: '',
      denied: 'Location not allowed',
      timeout: 'Location not found in time',
      unavailable: 'Location unavailable',
      unsupported: 'Location not supported'
    },
    announceSaved: 'Report saved.',
    announceFailed: 'Report not sent.',
    errorNetwork: 'You appear to be offline. Check your connection and retry.',
    errorGeneric: 'Something went wrong. Please retry.',
    photoTooLarge: 'The photo is too large, even after resizing.',
    photoUnsupported: 'This photo can’t be read. Try a JPEG or PNG.',
    voiceUnsupported: 'This browser can’t record audio. You can use your phone keyboard’s microphone instead.',
    voiceDenied: 'Microphone access was denied. You can allow it again in the site settings.',
    voiceNoMic: 'No microphone found.',
    voiceUnavailable: 'Voice transcription isn’t enabled on this server.',
    voiceTooShort: 'That recording was too short. Hold on a moment longer.',
    voiceNoSpeech: 'I didn’t hear any words. Try again when you’re ready.',
    voiceLimit: 'Two-minute limit reached: transcribing what you said.',
    footnote: 'Not an emergency service. No faces, number plates or personal details.',
    textTooLong: (/** @type {number} */ max) => `Up to ${max} characters.`,
    staleServer: 'The running server is an old version of the app. Stop it (Ctrl+C) and start it again with npm start.',
    myReports: 'My reports',
    myReportsShort: 'Status',
    close: 'Close',
    myReportsHint: 'Follow where each report sent from this device has got to. Status updates on its own.',
    myReportsEmpty: 'You haven’t sent any reports from this device yet.',
    photoOnly: 'Photo report',
    sentOn: 'Sent',
    followStatus: 'Follow status',
    nextStep: {
      title: 'Who handles this',
      titleEmergency: 'This looks like an emergency',
      note: 'Nothing has been sent: this step is yours to take.',
      actions: {
        CALL: 'Call',
        SUBMIT_FORM: 'Open the form',
        USE_APP: 'Open the app',
        CALL_EMERGENCY: 'Call 112',
        ANSWER_QUESTIONS: '',
        NONE: ''
      }
    },
    stepPending: 'Waiting',
    stepOf: (/** @type {number} */ n, /** @type {number} */ total, /** @type {string} */ label) => `Step ${n} of ${total}: ${label}`,
    statusChanged: (/** @type {string} */ number, /** @type {string} */ label) => `Report No. ${number}: ${label}`,
    steps: {
      open: { label: 'Sent', detail: 'Your report has been saved.' },
      received: { label: 'Delivered to the City', detail: 'The City has received it.' },
      in_progress: { label: 'In progress', detail: 'Someone is working on it.' },
      resolved: { label: 'Resolved', detail: 'The problem has been fixed. Thank you!' }
    },
    errors: {
      PERSONAL_DATA: 'Remove email addresses, phone numbers and number plates, then send again.',
      EMPTY_REPORT: 'Write a message or add a photo.',
      INVALID_INPUT: 'That message isn’t valid. Check the text and retry.',
      INVALID_LOCATION: 'The location received isn’t valid. Please retry.',
      INVALID_IMAGE: 'This photo can’t be read. Try a JPEG or PNG.',
      IMAGE_TOO_LARGE: 'The photo is larger than 5 MB.',
      RATE_LIMITED: 'Too many requests in a short time. Wait a minute and retry.',
      STORAGE_ERROR: 'The report couldn’t be saved. Try again shortly.',
      INVALID_AUDIO: 'The recording couldn’t be understood. Try recording again.',
      AUDIO_TOO_LARGE: 'That recording is too long: keep it under two minutes.',
      TRANSCRIPTION_FAILED: 'Transcription failed. Retry or type the message.',
      TRANSCRIPTION_UNAVAILABLE: 'Voice transcription isn’t enabled on this server.',
      MODERATION_UNAVAILABLE: 'The report can’t be checked right now. Please try again shortly.'
    },
    rejected: 'Not reportable',
    rejections: {
      emergency: 'This sounds like an emergency: call 112 now. This service isn’t monitored in real time, so the report is not recorded.',
      natural_event: 'I can’t record this: it’s a natural event that creates no danger or barrier for anyone. If it does cause a problem, like a fallen tree or a flooded underpass, describe that and I’ll report it.',
      off_topic: 'I can’t record this: it doesn’t describe a problem in a public place or service.',
      abusive: 'I can’t record this: it contains insults, threats or content aimed at a person.',
      harmful: 'I can’t record this: this content isn’t allowed.'
    }
  }
};

/** @typedef {typeof STRINGS.it} Strings */

const STORAGE_KEY = 'segnalami.language';

/** @returns {Language} */
function initialLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'it' || stored === 'en') return stored;
  } catch {
    // Storage blocked: fall through to the browser preference.
  }
  return navigator.language.toLowerCase().startsWith('it') ? 'it' : 'en';
}

/** @type {Language} */
let current = initialLanguage();

/** @returns {Language} */
export function language() {
  return current;
}

/** @returns {Strings} */
export function t() {
  return STRINGS[current];
}

/** @param {Language} next */
export function setLanguage(next) {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Preference just won't persist.
  }
  applyStaticText();
  document.dispatchEvent(new CustomEvent('languagechange'));
}

/** BCP 47 tag for speech recognition and number formatting. */
export function locale() {
  return current === 'it' ? 'it-IT' : 'en-GB';
}

/** Fills elements marked with data-i18n, data-i18n-label, data-i18n-title and data-i18n-placeholder. */
export function applyStaticText() {
  const strings = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (t()));
  /** @param {string | undefined} key */
  const lookup = key => {
    const value = key ? strings[key] : undefined;
    return typeof value === 'string' ? value : '';
  };
  document.documentElement.lang = current;
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = lookup(/** @type {HTMLElement} */ (el).dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-label]')) el.setAttribute('aria-label', lookup(/** @type {HTMLElement} */ (el).dataset.i18nLabel));
  for (const el of document.querySelectorAll('[data-i18n-title]')) el.setAttribute('title', lookup(/** @type {HTMLElement} */ (el).dataset.i18nTitle));
  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) el.setAttribute('placeholder', lookup(/** @type {HTMLElement} */ (el).dataset.i18nPlaceholder));
}
