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

/**
 * Large horizontal tracker for the status card above the composer: numbered markers, a check on
 * completed steps, the name of every step and the time each one was reached.
 * @param {ReportProgress} progress
 */
export function renderLargeSteps(progress) {
  const strings = t();
  const { current, reachedAt } = describe(progress);
  const done = progress.status === 'resolved';
  const list = el('ol', `steps-large${done ? ' is-done' : ''}`);
  list.setAttribute('aria-label', strings.stepOf(current + 1, STEPS.length, currentLabel(progress)));
  STEPS.forEach((step, index) => {
    const state = index < current || (done && index === current) ? 'past' : index === current ? 'current' : 'pending';
    const item = el('li', `step-large is-${state}`);
    if (index === current) item.setAttribute('aria-current', 'step');
    const marker = el('span', 'step-large-marker');
    marker.setAttribute('aria-hidden', 'true');
    if (state === 'past') {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'icon asset');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', '#a-done');
      svg.append(use);
      marker.append(svg);
    } else {
      marker.textContent = String(index + 1);
    }
    item.append(marker, el('span', 'step-large-label', strings.steps[step].label));
    const at = reachedAt.get(step);
    if (state !== 'pending' && at) {
      const time = /** @type {HTMLTimeElement} */ (el('time', 'step-large-time', formatWhen(at)));
      time.dateTime = at;
      item.append(time);
    } else {
      item.append(el('span', 'step-large-time', state === 'pending' ? strings.stepPending : ''));
    }
    list.append(item);
  });
  return list;
}
