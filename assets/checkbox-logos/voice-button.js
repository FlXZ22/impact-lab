/* <voice-button> — speech-to-text listening button (Whisper-style)
 * Built from the original artwork (drawing.svg): 5 bars + record dot.
 *
 * Usage:
 *   <script src="voice-button.js"></script>
 *   <voice-button></voice-button>                       // black ink, red rec accent
 *   <voice-button size="120" color="#000" active-color="#FF453A" sensitivity="1.2"></voice-button>
 *
 * JS API:
 *   el.listening = true/false        // toggle without mic access (visual only)
 *   el.toggle()                      // click: requests mic, falls back to synthetic
 *   el.addEventListener('voicestart', ...) / 'voicestop'
 *
 * While listening, bars are driven by the real microphone (log-spaced bands +
 * loudness), animated with GPU transforms, spatial blur across neighbours and
 * frame-rate-independent attack/release smoothing. Falls back to a slow
 * traveling wave if the mic is unavailable.
 */
(function () {
  const template = document.createElement('template');
  template.innerHTML = `
    <style>
      :host {
        display: inline-block;
        width: var(--vb-size, 120px);
        aspect-ratio: 196 / 176;
        --ink: var(--vb-color, #000);
        --accent: var(--vb-active-color, #FF453A);
        cursor: pointer;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
      }
      :host([disabled]) { cursor: not-allowed; opacity: .4; }
      svg { width: 100%; height: 100%; display: block; overflow: visible; }

      .dot, .ring { transition: fill .25s ease, stroke .25s ease; }
      .bar {
        fill: var(--ink);
        /* GPU transform instead of geometry rewrites: no relayout, buttery motion */
        transform-box: fill-box;
        transform-origin: center;
        will-change: transform;
      }
      .dot   { fill: var(--ink); }
      .ring  { fill: none; stroke: var(--ink); stroke-width: 9; }

      :host([listening]) .dot  { fill: var(--accent); }
      :host([listening]) .ring { stroke: var(--accent); }

      .ripple {
        fill: none;
        stroke: var(--accent);
        stroke-width: 3;
        opacity: 0;
        transform-box: fill-box;
        transform-origin: center;
        pointer-events: none;
      }
      :host([listening]) .ripple { animation: vb-ripple 2.2s cubic-bezier(.15,.5,.35,1) infinite; }
      :host([listening]) .ripple:nth-of-type(2) { animation-delay: .73s; }
      :host([listening]) .ripple:nth-of-type(3) { animation-delay: 1.47s; }

      :host([listening]) .dot {
        transform-box: fill-box;
        transform-origin: center;
        animation: vb-beat 2.2s ease-in-out infinite;
      }

      @keyframes vb-ripple {
        0%   { transform: scale(1); opacity: .45; }
        100% { transform: scale(2.1); opacity: 0; }
      }
      @keyframes vb-beat {
        0%, 100% { transform: scale(1); }
        50%      { transform: scale(1.1); }
      }

      @media (prefers-reduced-motion: reduce) {
        .ripple, .dot { animation: none !important; }
      }
    </style>
    <svg viewBox="8 62 196 176" role="img" aria-label="voice input">
      <circle class="ripple" cx="154.5" cy="187" r="36"/>
      <circle class="ripple" cx="154.5" cy="187" r="36"/>
      <circle class="ripple" cx="154.5" cy="187" r="36"/>
      <g class="bars">
        <!-- exact bars from the original drawing -->
        <rect class="bar" x="16.1"  y="126.6"  width="14.1" height="40.9"  rx="7.1"/>
        <rect class="bar" x="40.8"  y="95.4"   width="14.5" height="103.1" rx="7.2"/>
        <rect class="bar" x="64.7"  y="68.1"   width="15.4" height="157.6" rx="7.7"/>
        <rect class="bar" x="89.3"  y="105.7"  width="15.4" height="83.3"  rx="7.7"/>
        <rect class="bar" x="114.0" y="110.0"  width="14.5" height="74.9"  rx="7.2"/>
      </g>
      <circle class="ring" cx="154.5" cy="187" r="31.9"/>
      <circle class="dot"  cx="154.5" cy="187" r="19.9"/>
    </svg>
  `;

  // range around the original heights the bars may dance in
  const MIN_SCALE = 0.5, MAX_SCALE = 1.9;

  class VoiceButton extends HTMLElement {
    static get observedAttributes() { return ['listening', 'disabled']; }

    constructor() {
      super();
      this.attachShadow({ mode: 'open' }).appendChild(template.content.cloneNode(true));
      this._bars = [...this.shadowRoot.querySelectorAll('.bar')];
      this._levels = this._bars.map(() => 1);
      this._raf = 0;
      this._last = 0;
      this._analyser = null;
      this._stream = null;
      this._audioCtx = null;
      this.shadowRoot.host.addEventListener('click', () => this.toggle());
    }

    attributeChangedCallback(name) {
      if (name === 'listening') {
        this._syncAria();
        this.dispatchEvent(new CustomEvent(
          this.listening ? 'voicestart' : 'voicestop', { bubbles: true }));
        this.listening ? this._startLoop() : this._stopLoop();
      }
    }

    get listening() { return this.hasAttribute('listening'); }
    set listening(v) { this.toggleAttribute('listening', !!v); }

    get disabled() { return this.hasAttribute('disabled'); }
    set disabled(v) { this.toggleAttribute('disabled', !!v); }

    get sensitivity() { return parseFloat(this.getAttribute('sensitivity')) || 1.1; }

    async toggle() {
      if (this.disabled) return;
      if (this.listening) {
        this._teardownMic();
        this.listening = false;
        return;
      }
      try {
        this._stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const src = this._audioCtx.createMediaStreamSource(this._stream);
        this._analyser = this._audioCtx.createAnalyser();
        this._analyser.fftSize = 512;
        this._analyser.smoothingTimeConstant = 0.82;
        src.connect(this._analyser);
      } catch (e) {
        this._teardownMic();       // synthetic fallback
      }
      this.listening = true;
    }

    _startLoop() {
      if (this._raf || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const n = this._bars.length;
      const freq = this._analyser ? new Uint8Array(this._analyser.frequencyBinCount) : null;
      const wave = this._analyser ? new Uint8Array(this._analyser.fftSize) : null;
      const t0 = performance.now();
      this._last = t0;

      const frame = (now) => {
        const dt = Math.min(0.05, (now - this._last) / 1000);
        this._last = now;
        const t = (now - t0) / 1000;
        const sens = this.sensitivity;

        // ── raw targets ─────────────────────────────────────
        let target;
        if (this._analyser) {
          this._analyser.getByteFrequencyData(freq);
          this._analyser.getByteTimeDomainData(wave);

          let sum = 0;
          for (let i = 0; i < wave.length; i += 2) {
            const v = (wave[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / (wave.length / 2));

          target = this._bars.map((_, i) => {
            const lo = Math.floor(2 * Math.pow(1.75, i));
            const hi = Math.max(lo + 2, Math.floor(2 * Math.pow(1.75, i + 1)));
            let band = 0;
            for (let k = lo; k < Math.min(hi, freq.length); k++) band += freq[k];
            band = band / Math.min(hi - lo, freq.length - lo) / 255;

            const voice = Math.pow(band, 0.8) * 0.9 * sens + rms * 1.3 * sens;
            return 1 + voice;
          });
        } else {
          // synthetic: slow, even traveling wave across all bars
          target = this._bars.map((_, i) =>
            1 + 0.30 * Math.sin(t * 1.8 - i * 0.9) * (0.75 + 0.25 * Math.sin(t * 0.7 + i * 0.5))
          );
        }

        // ── wide spatial blur: the wave moves as one shape ──
        const blurred = target.map((_, i) => {
          const l2 = target[Math.max(0, i - 2)], l1 = target[Math.max(0, i - 1)];
          const c  = target[i];
          const r1 = target[Math.min(n - 1, i + 1)], r2 = target[Math.min(n - 1, i + 2)];
          return l2 * 0.12 + l1 * 0.22 + c * 0.32 + r1 * 0.22 + r2 * 0.12;
        });

        // ── frame-rate-independent attack/release ───────────
        this._bars.forEach((bar, i) => {
          const cur = this._levels[i];
          const goal = Math.min(MAX_SCALE, Math.max(MIN_SCALE,
            blurred[i] + 0.035 * Math.sin(t * 1.1 + i * 1.3)));   // faint breathing
          const k = 1 - Math.exp(-dt * (goal > cur ? 11 : 4));    // quick swell, lazy fall
          this._levels[i] = cur + (goal - cur) * k;
          bar.style.transform = `scaleY(${this._levels[i].toFixed(4)})`;
        });

        this._raf = requestAnimationFrame(frame);
      };
      this._raf = requestAnimationFrame(frame);
    }

    _stopLoop() {
      cancelAnimationFrame(this._raf);
      this._raf = 0;
      this._bars.forEach(bar => { bar.style.transform = ''; });
    }

    _teardownMic() {
      if (this._stream) { this._stream.getTracks().forEach(t => t.stop()); this._stream = null; }
      if (this._audioCtx) { this._audioCtx.close().catch(() => {}); this._audioCtx = null; }
      this._analyser = null;
    }

    _syncAria() {
      this.setAttribute('role', 'button');
      this.setAttribute('aria-pressed', this.listening ? 'true' : 'false');
      this.setAttribute('aria-label', this.listening ? 'Stop listening' : 'Start listening');
    }

    connectedCallback() { this._syncAria(); }
    disconnectedCallback() { this._teardownMic(); this._stopLoop(); }
  }

  customElements.define('voice-button', VoiceButton);
})();
