const BAR_COUNT = 28;

/**
 * Draws a live, mirrored bar waveform from an AnalyserNode. Without an analyser, or with reduced
 * motion, it draws a calm static shape and leaves the "listening" state to the label and timer.
 */
export class ListeningIndicator {
  /** @type {HTMLCanvasElement} */ #canvas;
  /** @type {HTMLTimeElement} */ #timer;
  /** @type {AnalyserNode | null} */ #analyser = null;
  /** @type {Uint8Array<ArrayBuffer> | null} */ #data = null;
  #levels = new Float32Array(BAR_COUNT);
  #frame = 0;
  #startedAt = 0;
  #timerId = 0;
  #reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /** @param {HTMLCanvasElement} canvas @param {HTMLTimeElement} timer */
  constructor(canvas, timer) {
    this.#canvas = canvas;
    this.#timer = timer;
  }

  /** @param {AnalyserNode | null} analyser */
  start(analyser) {
    this.stop();
    this.#analyser = analyser;
    this.#data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    this.#levels.fill(0);
    this.#startedAt = performance.now();
    this.#tickTimer();
    this.#timerId = window.setInterval(() => this.#tickTimer(), 250);
    this.#resize();
    this.#frame = requestAnimationFrame(() => this.#draw());
  }

  /** Swap in an analyser that became available after start. @param {AnalyserNode | null} analyser */
  attach(analyser) {
    this.#analyser = analyser;
    this.#data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
  }

  stop() {
    cancelAnimationFrame(this.#frame);
    clearInterval(this.#timerId);
    this.#analyser = null;
    this.#data = null;
  }

  #tickTimer() {
    const seconds = Math.floor((performance.now() - this.#startedAt) / 1000);
    this.#timer.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    this.#timer.dateTime = `PT${seconds}S`;
  }

  #resize() {
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = this.#canvas.getBoundingClientRect();
    this.#canvas.width = Math.max(1, Math.round(width * ratio));
    this.#canvas.height = Math.max(1, Math.round(height * ratio));
  }

  #draw() {
    const context = this.#canvas.getContext('2d');
    if (!context) return;
    // Read after the resize: #resize() rewrites canvas.width/height (and clears the
    // backing store), so the old values would draw one frame at the wrong scale.
    if (this.#canvas.width !== Math.round(this.#canvas.clientWidth * (window.devicePixelRatio || 1))) this.#resize();
    const { width, height } = this.#canvas;

    const still = this.#reducedMotion.matches || !this.#analyser || !this.#data;
    if (!still && this.#analyser && this.#data) {
      this.#analyser.getByteFrequencyData(this.#data);
      // Voice energy sits in the lower bins; spread them across the bars with a gentle curve.
      const usable = Math.floor(this.#data.length * 0.45);
      for (let i = 0; i < BAR_COUNT; i++) {
        const start = Math.floor((i / BAR_COUNT) ** 1.4 * usable);
        const end = Math.max(start + 1, Math.floor(((i + 1) / BAR_COUNT) ** 1.4 * usable));
        let sum = 0;
        for (let j = start; j < end; j++) sum += this.#data[j] ?? 0;
        const target = sum / (end - start) / 255;
        const current = this.#levels[i] ?? 0;
        // Fast attack, slower release reads as fluid rather than jittery.
        this.#levels[i] = target > current ? current + (target - current) * 0.55 : current + (target - current) * 0.12;
      }
    }

    const style = getComputedStyle(this.#canvas);
    context.clearRect(0, 0, width, height);
    context.fillStyle = style.getPropertyValue('--wave-color').trim() || '#a32e27';
    const gap = width / BAR_COUNT;
    const barWidth = Math.max(2, gap * 0.42);
    const mid = height / 2;
    const ratio = window.devicePixelRatio || 1;
    for (let i = 0; i < BAR_COUNT; i++) {
      const level = still ? 0.12 + 0.1 * Math.sin((i / (BAR_COUNT - 1)) * Math.PI) : (this.#levels[i] ?? 0);
      const barHeight = Math.max(3 * ratio, level * height * 0.92);
      const x = i * gap + (gap - barWidth) / 2;
      context.beginPath();
      context.roundRect(x, mid - barHeight / 2, barWidth, barHeight, barWidth / 2);
      context.fill();
    }

    if (!still || !this.#reducedMotion.matches) this.#frame = requestAnimationFrame(() => this.#draw());
  }
}
