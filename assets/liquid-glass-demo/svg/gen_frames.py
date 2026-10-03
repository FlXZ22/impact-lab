#!/usr/bin/env python3
"""Generate key-frame SVGs + one master animated SVG for the liquid-glass button.

The animated SVG is the 'better solution': one ~4 KB vector file that plays the
whole sheen cycle (vs 120 exported raster frames). Tinted variants follow the
demo's color chips.
"""
from pathlib import Path

OUT = Path(__file__).parent
KEYFRAMES = 6  # 0..5 -> sheen position across the pill

TINTS = {  # name -> (r, g, b, label)
    "clear": (255, 255, 255, "#1c1c1e"),
    "blue":  (140, 180, 255, "#1c1c1e"),
    "pink":  (255, 165, 212, "#1c1c1e"),
    "mint":  (152, 235, 190, "#1c1c1e"),
    "amber": (255, 202, 132, "#1c1c1e"),
    "ink":   (30, 32, 40, "#f5f5f7"),
}


def button_svg(sheen_x: float = 0, pressed: bool = False, animated: bool = False,
               tint: str = "clear") -> str:
    r, g, b, label = TINTS[tint]
    t = f"{r} {g} {b}"
    scale = 0.962 if pressed else 1.0
    dots_fill = "255 255 255" if tint == "ink" else "0 0 0"
    dots = f'''
    <pattern id="dots-{tint}" width="13" height="13" patternUnits="userSpaceOnUse">
      <circle cx="1.4" cy="1.4" r="1.1" fill="rgb({dots_fill} / .07)"/>
    </pattern>'''
    dots_rect = (f'\n    <rect x="21" y="31" width="578" height="178" rx="89" '
                 f'fill="url(#dots-{tint})"/>') if pressed else ""
    sheen = (
        f'<rect class="sheen" x="-190" y="10" width="190" height="220" fill="url(#sheenG)" '
        f'transform="translate({sheen_x},0) skewX(-8)"/>'
        if not animated else
        '''<g transform="skewX(-8)"><rect class="sheen" x="-190" y="10" width="190" height="220" fill="url(#sheenG)">
      <animateTransform attributeName="transform" type="translate"
        values="-190 0; 600 0" keyTimes="0;0.55" dur="4.2s"
        calcMode="spline" keySplines="0.45 0.05 0.35 1; 0 0 1 1"
        repeatCount="indefinite"/>
    </rect></g>'''
    )
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="640" height="240" viewBox="0 0 640 240">
  <defs>
    <linearGradient id="glassTop" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0"   stop-color="rgb({t} / .92)"/>
      <stop offset=".55" stop-color="rgb({t} / .30)"/>
      <stop offset="1"   stop-color="rgb({t} / .45)"/>
    </linearGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset=".5" stop-color="#ffffff" stop-opacity=".25"/>
      <stop offset="1" stop-color="#cfcfcc"/>
    </linearGradient>
    <linearGradient id="sheenG" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0"   stop-color="#fff" stop-opacity="0"/>
      <stop offset=".5"  stop-color="#fff" stop-opacity=".8"/>
      <stop offset="1"   stop-color="#fff" stop-opacity="0"/>
    </linearGradient>{dots}
    <filter id="drop" x="-30%" y="-30%" width="160%" height="180%">
      <feDropShadow dx="0" dy="10" stdDeviation="9" flood-color="#000" flood-opacity=".28"/>
    </filter>
    <filter id="tsh" x="-30%" y="-60%" width="160%" height="220%">
      <feDropShadow dx="0" dy="6" stdDeviation="5" flood-color="#000" flood-opacity=".22"/>
    </filter>
    <clipPath id="pill"><rect x="21" y="31" width="578" height="178" rx="89"/></clipPath>
  </defs>

  <g transform="translate(320 120) scale({scale}) translate(-320 -120)">
    <rect x="21" y="31" width="578" height="178" rx="89" fill="url(#glassTop)"
          stroke="url(#rim)" stroke-width="1.5" filter="url(#drop)"/>{dots_rect}
    <g clip-path="url(#pill)">{sheen}</g>
    <text x="320" y="137" text-anchor="middle" font-family="Liberation Sans, Arial, sans-serif"
          font-size="56" font-weight="600" fill="{label}" filter="url(#tsh)">Get Now</text>
  </g>
</svg>
'''


def emit(name: str, **kw):
    (OUT / name).write_text(button_svg(**kw))


frames_dir = OUT / "frames"
frames_dir.mkdir(exist_ok=True)
for i in range(KEYFRAMES):
    x = -190 + (600 - -190) * (i / (KEYFRAMES - 1)) * 0.55
    (frames_dir / f"frame_{i:02d}.svg").write_text(button_svg(x))

# static states (clear)
emit("button-rest.svg",  sheen_x=-140)
emit("button-press.svg", sheen_x=330, pressed=True)
# master animated (clear) + tinted animated set
emit("button-animated.svg", animated=True)
for tint in TINTS:
    emit(f"animated-{tint}.svg", animated=True, tint=tint)
emit("animated-ink-press.svg", animated=False, pressed=True, tint="ink")
print(f"wrote {KEYFRAMES} keyframes + rest/press + animated (clear + {len(TINTS)} tints)")
