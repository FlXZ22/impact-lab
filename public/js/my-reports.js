/** @import { ReportProgress, Report } from './types.js' */

/**
 * The reports this device has sent, so their progress can be followed after the tab is closed.
 * Kept in localStorage: only ids, a short excerpt and the last known progress. Never shared.
 * @typedef {object} TrackedReport
 * @property {string} id
 * @property {string} excerpt
 * @property {boolean} hasPhoto
 * @property {string} createdAt
 * @property {ReportProgress | null} progress
 */

const KEY = 'segnalami.myReports.v1';
const MAX_TRACKED = 50;

/** @returns {TrackedReport[]} */
export function loadTracked() {
  try {
    const parsed = /** @type {unknown} */ (JSON.parse(localStorage.getItem(KEY) ?? '[]'));
    return Array.isArray(parsed) ? /** @type {TrackedReport[]} */ (parsed).filter(item => typeof item?.id === 'string') : [];
  } catch {
    return [];
  }
}

/** @param {TrackedReport[]} items */
function save(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX_TRACKED)));
  } catch {
    // Private mode or quota: tracking simply lasts as long as the page.
  }
}

/** Newest first. @param {Report} report */
export function track(report) {
  const items = loadTracked().filter(item => item.id !== report.id);
  const text = report.content_text ?? '';
  items.unshift({
    id: report.id,
    excerpt: text.length > 140 ? `${text.slice(0, 139).trimEnd()}…` : text,
    hasPhoto: report.image_url !== null,
    createdAt: report.created_at,
    progress: { id: report.id, status: report.status, timeline: [{ status: 'open', at: report.created_at }] }
  });
  save(items);
}

/**
 * Stores fresh progress and returns the reports whose status changed.
 * @param {ReportProgress[]} updates
 * @returns {TrackedReport[]}
 */
export function applyProgress(updates) {
  const byId = new Map(updates.map(update => [update.id, update]));
  /** @type {TrackedReport[]} */
  const changed = [];
  const items = loadTracked().map(item => {
    const update = byId.get(item.id);
    if (!update) return item;
    const next = { ...item, progress: update };
    if (item.progress?.status !== update.status) changed.push(next);
    return next;
  });
  save(items);
  return changed;
}
