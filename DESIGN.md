# Design

Surface: the citizen chat (Operate mode). White and conversation-first, in the manner of Claude's chat, carrying the SegnalaMi logo.

## World

- **Ground:** pure white `#ffffff`. Light only: people report outdoors, in daylight, and the logo is black on white.
- **Ink:** `#1b1b1a`; secondary `#6b6b66` (≥ 4.5:1 on white). Hairlines `#e5e5e1`.
- **Accent:** the logo's blue `#004AAD`, used for the send/confirm action, the location pin, focus rings and the waveform. Recording dot is red `#b42318`; the saved check is green `#1d7a4b`.
- **Type:** the assistant speaks in a serif (Iowan Old Style / Palatino / Georgia), echoing the logo's "Segnala"; everything the person writes and all controls are in the system sans.
- **Logo:** `public/logo.png` (trimmed from `assets/SEGNALA.png`), 26 px tall in the top bar. Favicon: the blue "mi".
- **Icons:** `assets/icons` mic, close, done; drawn camera, send, pin, retry at matching weight.

## Layout

Top bar (logo, language), a 46 rem conversation column, and one floating composer card (26 px radius, hairline border, soft shadow): photo · message · send · microphone. While recording, the same card becomes cancel · live waveform with timer · done; after done it shows "Transcribing…" until the text lands in the field. A one-line disclaimer sits under the card.

Assistant messages have no bubble. The person's messages are soft grey `#f4f4f2` bubbles on the right; photos sit inside them.

## Signature

**The receipt.** Under every report: delivery state, a four-character report number, coordinates with accuracy (linked to a map) and time, in tabular figures. When location is missing, the reason is stated plainly.

## Motion

New messages rise 8 px out of a light blur (380 ms, exponential ease-out); state changes swap in place. The view stays pinned to the newest message as photos load and the composer grows. Under `prefers-reduced-motion` the waveform is static and animations are effectively instant.
