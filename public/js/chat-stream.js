/** @import { AssistantMessage, ChatMessage, ReportProgress, RoutingNextStep, UserMessage } from './types.js' */
import { locale, t } from './i18n.js';

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** @param {string} id @param {string} [className] */
function icon(id, className = 'icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${id}`);
  svg.append(use);
  return svg;
}

/** @param {number} value @param {'lat' | 'lon'} axis */
function formatCoordinate(value, axis) {
  const hemisphere = axis === 'lat' ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  return `${Math.abs(value).toLocaleString(locale(), { minimumFractionDigits: 4, maximumFractionDigits: 4 })}° ${hemisphere}`;
}

/** @param {string} iso */
function formatTime(iso) {
  return new Date(iso).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
}

/**
 * Renders the conversation. Messages are rendered from state; a message's node is replaced
 * wholesale on update, which keeps rendering simple and the DOM honest.
 */
export class ChatStream {
  /** @type {HTMLOListElement} */ #list;
  /** @type {HTMLElement} */ #scroller;
  /** @type {Map<string, HTMLLIElement>} */ #nodes = new Map();
  /** @type {(id: string) => void} */ #onRetry;

  /**
   * @param {HTMLOListElement} list
   * @param {HTMLElement} scroller
   * @param {(id: string) => void} onRetry
   */
  constructor(list, scroller, onRetry) {
    this.#list = list;
    this.#scroller = scroller;
    this.#onRetry = onRetry;
    // Stay pinned to the newest message while content or the viewport changes size
    // (photos finishing loading, the composer growing, the keyboard opening).
    scroller.addEventListener('scroll', () => {
      this.#pinned = this.#nearBottom();
    }, { passive: true });
    new ResizeObserver(() => {
      if (this.#pinned) this.#scroller.scrollTop = this.#scroller.scrollHeight;
    }).observe(list);
    new ResizeObserver(() => {
      if (this.#pinned) this.#scroller.scrollTop = this.#scroller.scrollHeight;
    }).observe(scroller);
  }

  #pinned = true;

  /** @param {ChatMessage[]} messages */
  renderAll(messages) {
    this.#list.replaceChildren();
    this.#nodes.clear();
    for (const message of messages) this.upsert(message, { scroll: false });
    this.scrollToEnd();
  }

  /**
   * @param {ChatMessage} message
   * @param {{ scroll?: boolean }} [options]
   */
  upsert(message, { scroll = true } = {}) {
    const stick = this.#nearBottom();
    const node = message.role === 'user' ? this.#renderUser(message) : this.#renderAssistant(message);
    const existing = this.#nodes.get(message.id);
    if (existing) {
      existing.replaceWith(node);
    } else {
      // Only genuinely new messages animate in; state updates swap in place.
      if (scroll) node.classList.add('is-new');
      this.#list.append(node);
    }
    this.#nodes.set(message.id, node);
    if (scroll && (stick || !existing)) this.scrollToEnd();
  }

  /** @param {string} id */
  remove(id) {
    this.#nodes.get(id)?.remove();
    this.#nodes.delete(id);
  }

  /**
   * Jumps to the newest message. Deliberately instant: a smooth scroll fires intermediate scroll
   * events that would read as the person scrolling away and unpin the view.
   */
  scrollToEnd() {
    this.#pinned = true;
    this.#scroller.scrollTop = this.#scroller.scrollHeight;
  }

  #nearBottom() {
    const { scrollTop, scrollHeight, clientHeight } = this.#scroller;
    return scrollHeight - scrollTop - clientHeight < 120;
  }

  /** @param {AssistantMessage} message */
  #renderAssistant(message) {
    const strings = t();
    const item = el('li', `message from-assistant kind-${message.kind}`);
    item.append(el('span', 'visually-hidden', `${strings.assistant}: `));
    const bubble = el('div', 'bubble');
    if (message.pending) {
      bubble.classList.add('typing');
      bubble.setAttribute('role', 'img');
      bubble.setAttribute('aria-label', strings.typing);
      for (let i = 0; i < 3; i++) bubble.append(el('span', 'typing-dot'));
    } else {
      bubble.append(el('p', '', message.text));
      if (message.kind === 'welcome') bubble.append(el('p', 'bubble-note', strings.welcomeNote));
    }
    item.append(bubble);
    return item;
  }

  /** @param {UserMessage} message */
  #renderUser(message) {
    const strings = t();
    const item = el('li', `message from-user state-${message.state}`);
    item.append(el('span', 'visually-hidden', `${strings.you}: `));
    const bubble = el('div', 'bubble');
    if (message.imageUrl) {
      const img = el('img', 'bubble-photo');
      img.src = message.imageUrl;
      img.alt = '';
      img.decoding = 'async';
      img.loading = 'lazy';
      bubble.append(img);
    }
    if (message.text) bubble.append(el('p', '', message.text));
    item.append(bubble, this.#renderReceipt(message));
    // Truthiness, not !== null: messages saved before routing existed have no such field.
    if (message.state === 'saved' && message.routing) item.append(this.#renderNextStep(message.routing));
    return item;
  }

  /**
   * Who is responsible for this report, and the one action the citizen can take.
   * Nothing here was transmitted by us, and the card says so: the public bodies in
   * question have no API, so the last step is the person's to take.
   * @param {RoutingNextStep} step
   */
  #renderNextStep(step) {
    const strings = t();
    const emergency = step.action === 'CALL_EMERGENCY';
    const card = el('div', `receipt next-step${emergency ? ' is-emergency' : ''}`);

    card.append(el('span', 'receipt-state', emergency ? strings.nextStep.titleEmergency : strings.nextStep.title));
    // Always Italian: the dispatch service writes it. Tag it so a screen reader in
    // English mode switches voice instead of reading Italian with English phonetics.
    const body = el('span', 'receipt-detail', step.message);
    body.lang = 'it';
    card.append(body);
    if (strings.nextStep.sourceLanguage) {
      card.append(el('span', 'receipt-detail is-note', strings.nextStep.sourceLanguage));
    }

    const label = strings.nextStep.actions[step.action];
    if (step.deeplink && label) {
      const link = el('a', 'receipt-retry');
      link.href = step.deeplink;
      if (step.deeplink.startsWith('http')) {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
      link.append(icon('i-send', 'icon small'), el('span', '', label));
      card.append(link);
    }

    // Only claim nothing was sent when nothing was: NONE means the service delivered it.
    if (step.action !== 'NONE') card.append(el('span', 'receipt-detail is-note', strings.nextStep.note));
    return card;
  }

  /**
   * The receipt under each report: delivery state, report number, coordinates and time.
   * @param {UserMessage} message
   */
  #renderReceipt(message) {
    const strings = t();
    const receipt = el('div', 'receipt');

    if (message.state === 'locating' || message.state === 'sending') {
      receipt.append(el('span', 'receipt-spinner'), el('span', '', message.state === 'locating' ? strings.locating : strings.sending));
      return receipt;
    }

    if (message.state === 'rejected') {
      receipt.classList.add('is-rejected');
      receipt.append(el('span', 'receipt-state', strings.rejected));
      return receipt;
    }

    if (message.state === 'failed') {
      receipt.classList.add('is-error');
      receipt.append(el('span', 'receipt-state', strings.failed));
      if (message.error) receipt.append(el('span', 'receipt-detail', message.error));
      const retry = el('button', 'receipt-retry');
      retry.type = 'button';
      retry.append(icon('i-retry', 'icon small'), el('span', '', strings.retry));
      retry.addEventListener('click', () => this.#onRetry(message.id));
      receipt.append(retry);
      return receipt;
    }

    const report = message.report;
    receipt.append(icon('a-done', 'icon small asset receipt-check'), el('span', 'receipt-state', strings.saved));
    if (report) receipt.append(el('span', 'receipt-number', `${strings.reportNumber} ${report.id.slice(0, 4).toUpperCase()}`));

    const position = report && report.latitude !== null && report.longitude !== null ? { lat: report.latitude, lon: report.longitude } : null;
    if (position) {
      const link = el('a', 'receipt-place');
      link.href = `https://www.openstreetmap.org/?mlat=${position.lat}&mlon=${position.lon}#map=18/${position.lat}/${position.lon}`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', `${strings.openMap}: ${formatCoordinate(position.lat, 'lat')}, ${formatCoordinate(position.lon, 'lon')}`);
      link.append(icon('i-pin', 'icon small'), el('span', 'receipt-coords', `${formatCoordinate(position.lat, 'lat')} ${formatCoordinate(position.lon, 'lon')}`));
      const accuracy = message.location?.position?.accuracy;
      if (accuracy) link.append(el('span', 'receipt-accuracy', `±${accuracy} m`));
      receipt.append(link);
    } else {
      const outcome = message.location?.outcome ?? 'unavailable';
      const reason = outcome === 'granted' ? strings.location.unavailable : strings.location[outcome];
      receipt.append(el('span', 'receipt-place is-missing', ''));
      const missing = /** @type {HTMLElement} */ (receipt.lastElementChild);
      missing.append(icon('i-pin-off', 'icon small'), el('span', '', reason));
    }

    if (report) {
      const time = el('time', 'receipt-time', formatTime(report.created_at));
      time.dateTime = report.created_at;
      receipt.append(time);
    }
    return receipt;
  }
}
