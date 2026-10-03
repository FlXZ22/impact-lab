// Shared JSDoc types. Checked by `npm run typecheck` (tsc, strict).

/** @typedef {'it' | 'en'} Language */
/** @typedef {'open' | 'received' | 'in_progress' | 'resolved'} ReportStatus */
/** @typedef {{ status: ReportStatus, at: string }} StatusEvent */
/** @typedef {{ id: string, status: ReportStatus, timeline: StatusEvent[] }} ReportProgress */

/**
 * @typedef {object} Report
 * @property {string} id
 * @property {string | null} content_text
 * @property {string | null} image_url
 * @property {number | null} latitude
 * @property {number | null} longitude
 * @property {ReportStatus} status
 * @property {string} created_at
 */

/** @typedef {{ text: string, source: 'claude' | 'fallback' }} AssistantReply */
/** @typedef {{ report: Report, reply: AssistantReply }} CreateReportResponse */
/** @typedef {{ apiVersion?: number, assistant: boolean, transcription: boolean, maxTextLength: number }} ClientConfig */

/** @typedef {{ latitude: number, longitude: number, accuracy: number }} Position */
/** @typedef {'granted' | 'denied' | 'timeout' | 'unavailable' | 'unsupported'} LocationOutcome */
/** @typedef {{ outcome: LocationOutcome, position: Position | null }} LocationResult */

/** @typedef {{ media_type: 'image/jpeg', data: string }} ImagePayload */

/**
 * What gets sent for one report. Kept in memory so a failed send can be retried.
 * @typedef {object} ReportDraft
 * @property {string | null} text
 * @property {ImagePayload | null} image
 * @property {string | null} previewUrl Object URL for the local photo preview.
 */

/** @typedef {'locating' | 'sending' | 'saved' | 'failed'} DeliveryState */

/**
 * @typedef {object} UserMessage
 * @property {string} id
 * @property {'user'} role
 * @property {string | null} text
 * @property {string | null} imageUrl
 * @property {DeliveryState} state
 * @property {LocationResult | null} location
 * @property {Report | null} report
 * @property {string | null} error
 * @property {string} createdAt
 */

/**
 * @typedef {object} AssistantMessage
 * @property {string} id
 * @property {'assistant'} role
 * @property {string} text
 * @property {boolean} pending
 * @property {'welcome' | 'reply' | 'error'} kind
 */

/** @typedef {UserMessage | AssistantMessage} ChatMessage */

export {};
