# Comune operations portal

Mode: Operate. Route: /officer (alias /comune).

Confirmed: map-first, ranked reports on the left, selected report on the right. Inherit the citizen's white background, #004AAD blue, system sans controls, serif AI prose, logo and assets/icons. Preserve citizen appearance; progress synchronization removes deleted records after a successful server lookup.

Primary task: find the most urgent barrier, understand Claude's evidence, locate it, then assign a responsible body, override priority or update status. AI performs individual assessment only. No duplicate detection or chat assistant.

First viewport: compact brand header and data refresh state; small navigation rail; left report queue with search and filters; dominant interactive Milan map with labelled priority markers and legend; right inspector with original evidence, AI rationale/confidence and officer controls. No invented map points. Unlocated reports remain in the queue. Unassessed reports have no fabricated priority.

Signature interaction: choosing either a map marker or queue item synchronizes selection in all three panes, centers its location and opens the inspector. Filters update both queue and map. Officer changes persist; AI recommendations remain visible beneath human overrides.

Small screens: list/map navigation and an in-flow inspector instead of squeezing three columns. Controls retain keyboard access and accessible labels. Poll every 8 seconds without stealing input focus or overwriting unsaved edits.

Implementation: isolated public/officer assets, operations API, additive SQLite/PostgreSQL migration, real Anthropic strict tool use, durable database queue, explicit pending/processing/evaluated/failed states. Existing citizen API response and appearance remain intact.

## Shipped surface reference

Source of truth: `public/officer/portal.css`, `index.html`, `portal.js` and `model.js`. These details describe the portal extension; root DESIGN.md continues to describe the citizen interface.

- **Color and type:** white ground, ink `#1b1b1a`, secondary text `#66665f`, subtle fill `#f4f4f2`, hairlines `#e5e5e1`, action/focus blue `#004aad` (hover `#003b8c`). System sans controls and headings; Iowan Old Style / Palatino / Georgia for the AI summary and empty inspector heading. Repeated form labels, fields and buttons use `.875rem`; dates and counts use tabular figures. Priority is written as P1–P5 as well as colored: red for 5, orange for 4, ochre for 3, green for 1–2, grey with “Da valutare” or `?` when absent.
- **Desktop layout:** 76px header, 66px navigation rail, queue (275–310px), flexible map (minimum 260px), inspector (280–320px). The bordered workspace has a 10px radius and a minimum height of 540px. Queue and inspector scroll independently. At 1700px and wider, queue/inspector grow to 340/350px; at 1200px and below they become 270/275px.
- **Responsive layout:** at 1000px and below, the 330px inspector overlays the map. At 700px and below, the header becomes 66px, the rail disappears, Elenco/Mappa controls choose the visible primary pane, and the inspector sits below it in document flow. The mobile queue is capped at 57dvh; the map uses 62dvh with a 360px minimum. These are implemented breakpoints, not visually verified captures.
- **Components and depth:** rows use dividers and a pale blue selected fill with an inset outline. Controls have 5–7px corners; primary buttons use blue with white text. The map label, fit control, legend and pins have soft shadows; the intermediate-width inspector has an edge shadow. Photos preserve their aspect ratio within a 210px maximum height.
- **Interaction:** search, category, effective recipient, status, priority and missing-position filters update the list and markers together. Default sorting uses descending effective priority, then oldest first. Selection focuses the detail heading and centers a located report at zoom 15 or closer. A selected detail can remain open when filters hide its row and marker. Priority/recipient overrides and status have separate save actions; a pending edit in the other form survives either save. Unsaved edits block switching/closing and can be explicitly discarded.
- **Refresh and fallback:** visible tabs poll every 8 seconds and refresh when returning to the tab. Unchanged content is not rebuilt; active queue/detail focus is restored when content changes, and dirty or saving forms are not replaced. Refresh failure retains loaded reports. Missing map code/tiles shows a message while the queue remains usable; missing photos get a text fallback. Failed AI assessment exposes retry; the inspector keeps the original assessment visible when an officer overrides its recommendation. Confidence below 70% is marked for verification.
- **Accessibility and motion in source:** semantic buttons and labelled fields, a skip link, polite status feedback, keyboard-enabled map markers, visible 2px blue focus outlines, and text priority labels. Detail entry moves 5px over 200ms only when motion is allowed; reduced motion disables smooth scrolling and map animation.

## Verification and known limits

Map/deletion follow-up: the portal sends an origin-only Referer for cross-origin tiles, correcting the OSM policy violation caused by `no-referrer`. A single OSM tile returned HTTP 200 and its Milan imagery was inspected. The inspector now offers “Elimina segnalazione”, with an inline permanent-deletion explanation, Annulla and Elimina definitivamente. These controls have a 44px minimum height and danger red treatment; no deletion occurs before explicit confirmation. Removal clears list, marker and inspector, returns focus to the list heading and invalidates stale refresh responses. All 12 current citizen IDs were verified in the running officer API, assessed and located. Latest typecheck and 40 tests passed; browser-level visual verification remains unavailable.

Documentation checked against source on 2026-10-03. The implementation handoff reports a passing typecheck, 35 tests and three live Claude cases. Visual evidence remains unavailable: browser-control service exposed zero browsers, so desktop/mobile rendering, keyboard journeys, screen-reader behavior and 200% text scaling remain unverified. Several compact controls are 34–42px high in CSS; the product's 44px touch-target requirement is not established across this surface. The portal currently uses Italian copy and an Italian date formatter.

Pre-existing context drift, left unchanged: PRODUCT.md still says the officer view was removed, and root DESIGN.md retains its earlier citizen-specific format rather than the current canonical token schema. Neither document is refreshed by this portal extension.
