/** @import { ReportProgress, ReportStatus } from './types.js' */
import { locale, t } from './i18n.js';

/** @type {readonly ReportStatus[]} */
export const STEPS = ['open', 'received', 'in_progress', 'resolved'];

/**
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** @param {string} iso */
function formatWhen(iso) {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * Where a report stands: index of the current step, and when each reached step happened.
 * Statuses can move backwards (a report reopened); the current status always wins.
 * @param {ReportProgress} progress
 */
function describe(progress) {
  const current = Math.max(0, STEPS.indexOf(progress.status));
  /** @type {Map<ReportStatus, string>} */
  const reachedAt = new Map();
  for (const event of progress.timeline) reachedAt.set(event.status, event.at);
  return { current, reachedAt };
}

/** The current step's label, e.g. "Delivered to the City". @param {ReportProgress} progress */
export function currentLabel(progress) {
  return t().steps[STEPS[describe(progress).current] ?? 'open'].label;
}

/**
 * Compact horizontal tracker for the chat: four dots and the current step's name.
 * @param {ReportProgress} progress
 */
export function renderCompactSteps(progress) {
  const strings = t();
  const { current } = describe(progress);
  const wrap = el('div', `steps-compact${progress.status === 'resolved' ? ' is-done' : ''}`);
  const dots = el('ol', 'steps-dots');
  dots.setAttribute('aria-hidden', 'true');
  STEPS.forEach((step, index) => {
    const dot = el('li', `step-dot${index < current ? ' is-past' : index === current ? ' is-current' : ''}`);
    dot.dataset.step = step;
    dots.append(dot);
  });
  const label = el('span', 'steps-label', currentLabel(progress));
  wrap.append(dots, label);
  wrap.setAttribute('role', 'img');
  wrap.setAttribute('aria-label', strings.stepOf(current + 1, STEPS.length, currentLabel(progress)));
  return wrap;
}

/**
 * Full vertical tracker: every step with its description and time, pending steps greyed.
 * @param {ReportProgress} progress
 */
export function renderTimeline(progress) {
  const strings = t();
  const { current, reachedAt } = describe(progress);
  const list = el('ol', `timeline${progress.status === 'resolved' ? ' is-done' : ''}`);
  STEPS.forEach((step, index) => {
    const state = index < current ? 'past' : index === current ? 'current' : 'pending';
    const item = el('li', `timeline-step is-${state}`);
    if (state === 'current') item.setAttribute('aria-current', 'step');
    const marker = el('span', 'timeline-marker');
    marker.setAttribute('aria-hidden', 'true');
    const body = el('div', 'timeline-body');
    const head = el('div', 'timeline-head');
    head.append(el('span', 'timeline-label', strings.steps[step].label));
    const at = reachedAt.get(step);
    if (state !== 'pending' && at) {
      const time = /** @type {HTMLTimeElement} */ (el('time', 'timeline-time', formatWhen(at)));
      time.dateTime = at;
      head.append(time);
    }
    body.append(head, el('p', 'timeline-detail', state === 'pending' ? strings.stepPending : strings.steps[step].detail));
    item.append(marker, body);
    list.append(item);
  });
  return list;
}
