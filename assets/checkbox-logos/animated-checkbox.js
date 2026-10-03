/* <animated-checkbox> — tri-state animated checkbox web component
 * Usage:
 *   <script src="animated-checkbox.js"></script>
 *   <animated-checkbox></animated-checkbox>                    → green, unchecked
 *   <animated-checkbox checked></animated-checkbox>            → starts checked
 *   <animated-checkbox indeterminate></animated-checkbox>      → starts indeterminate
 *   <animated-checkbox color="#007AFF" size="40"></animated-checkbox>
 * JS API:
 *   el.checked = true / el.indeterminate = true / el.disabled = true
 *   el.addEventListener('change', e => e.detail.checked)
 */
(function () {
  const template = document.createElement('template');
  template.innerHTML = `
    <style>
      :host {
        display: inline-block;
        width: var(--cb-size, 32px);
        height: var(--cb-size, 32px);
        --c: var(--cb-color, #0DB647);
        --tint: color-mix(in srgb, var(--c) 18%, #fff);
        cursor: pointer;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
      }
      :host([disabled]) { cursor: not-allowed; opacity: .4; }
      svg {
        width: 100%; height: 100%; display: block; overflow: visible;
        transition: transform .22s cubic-bezier(.3,1.4,.5,1);
      }
      :host(:not([disabled]):hover) svg { transform: scale(1.06); }
      :host(:not([disabled]):active) svg { transform: scale(.9); }

      /* Every state change is a transition, so checking AND unchecking
         both interpolate fluidly, and colors morph between states. */
      .outline {
        fill: none;
        stroke: #000;
        stroke-width: 3;
        transition: opacity .26s ease;
      }
      .box {
        fill: var(--c);
        transform-origin: 32px 32px;
        transform: scale(0);
        opacity: 0;
        /* un-check / hide: gentle ease-in shrink, no overshoot */
        transition:
          transform .3s cubic-bezier(.5, 0, .7, .4),
          opacity   .24s ease,
          fill      .3s ease;
      }
      .mark {
        fill: none;
        stroke: #fff;
        stroke-width: 5.5;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-dasharray: 36;
        stroke-dashoffset: 36;
        /* un-draw: reverse draw slightly after the box starts shrinking */
        transition: stroke-dashoffset .26s cubic-bezier(.5, 0, .8, .5) .05s;
      }
      .dash {
        fill: var(--c);
        transform-origin: 32px 32px;
        transform: scaleX(0);
        opacity: 0;
        transition:
          transform .26s cubic-bezier(.5, 0, .7, .4),
          opacity   .18s ease;
      }

      /* ── checked ─────────────────────────────────────────── */
      :host([checked]) .outline { opacity: 0; }
      :host([checked]) .box {
        transform: scale(1);
        opacity: 1;
        /* check-in: springy overshoot */
        transition:
          transform .44s cubic-bezier(.3, 1.56, .45, 1),
          opacity   .16s ease,
          fill      .3s ease;
      }
      :host([checked]) .mark {
        stroke-dashoffset: 0;
        /* draw starts while the box is still settling */
        transition: stroke-dashoffset .34s cubic-bezier(.25, 1, .4, 1) .1s;
      }

      /* ── indeterminate ───────────────────────────────────── */
      :host([indeterminate]) .outline { opacity: 0; }
      :host([indeterminate]) .box {
        transform: scale(1);
        opacity: 1;
        fill: var(--tint);
        transition:
          transform .44s cubic-bezier(.3, 1.56, .45, 1),
          opacity   .16s ease,
          fill      .3s ease;
      }
      :host([indeterminate]) .dash {
        transform: scaleX(1);
        opacity: 1;
        transition:
          transform .32s cubic-bezier(.3, 1.56, .45, 1) .08s,
          opacity   .14s ease .08s;
      }

      @media (prefers-reduced-motion: reduce) {
        .box, .mark, .dash, .outline, svg {
          transition-duration: .01s !important;
          transition-delay: 0s !important;
        }
      }
    </style>
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect class="box"   x="8" y="8" width="48" height="48" rx="14"></rect>
      <rect class="outline" x="9.5" y="9.5" width="45" height="45" rx="13"></rect>
      <rect class="dash"  x="21" y="29.5" width="22" height="5" rx="2.5"></rect>
      <polyline class="mark" points="20,33.5 28.5,42 45,25"></polyline>
    </svg>
  `;

  class AnimatedCheckbox extends HTMLElement {
    static get observedAttributes() { return ['checked', 'indeterminate', 'disabled', 'color']; }

    constructor() {
      super();
      this.attachShadow({ mode: 'open' }).appendChild(template.content.cloneNode(true));
      this.shadowRoot.host.addEventListener('click', () => this._onClick());
    }

    attributeChangedCallback(name, oldVal, newVal) {
      if (name === 'color') {
        if (newVal) this.style.setProperty('--cb-color', newVal);
        else this.style.removeProperty('--cb-color');
        return;
      }
      if (name === 'checked' || name === 'indeterminate') {
        // mutually exclusive
        if (newVal !== null && name === 'checked') this.removeAttribute('indeterminate');
        if (newVal !== null && name === 'indeterminate') this.removeAttribute('checked');
        this._syncAria();
        this.dispatchEvent(new CustomEvent('change', {
          detail: { checked: this.checked, indeterminate: this.indeterminate },
          bubbles: true,
        }));
      }
    }

    get checked() { return this.hasAttribute('checked'); }
    set checked(v) { this.toggleAttribute('checked', !!v); }

    get indeterminate() { return this.hasAttribute('indeterminate'); }
    set indeterminate(v) { this.toggleAttribute('indeterminate', !!v); }

    get disabled() { return this.hasAttribute('disabled'); }
    set disabled(v) { this.toggleAttribute('disabled', !!v); }

    _onClick() {
      if (this.disabled) return;
      // tri-state cycle: indeterminate → checked → unchecked
      if (this.indeterminate) this.indeterminate = false;
      else this.checked = !this.checked;
    }

    _syncAria() {
      this.setAttribute('role', 'checkbox');
      this.setAttribute('aria-checked',
        this.indeterminate ? 'mixed' : this.checked ? 'true' : 'false');
    }

    connectedCallback() { this._syncAria(); }
  }

  customElements.define('animated-checkbox', AnimatedCheckbox);
})();
