# Comune operations portal

Mode: Operate. Route: /officer (alias /comune).

Confirmed: map-first, ranked reports on the left, selected report on the right. Inherit the citizen's white background, #004AAD blue, system sans controls, serif AI prose, logo and assets/icons. Citizen source files are outside the write boundary.

Primary task: find the most urgent barrier, understand Claude's evidence, locate it, then assign a responsible body, override priority or update status. AI performs individual assessment only. No duplicate detection or chat assistant.

First viewport: compact brand header and data refresh state; small navigation rail; left report queue with search and filters; dominant interactive Milan map with labelled priority markers and legend; right inspector with original evidence, AI rationale/confidence and officer controls. No invented map points. Unlocated reports remain in the queue. Unassessed reports have no fabricated priority.

Signature interaction: choosing either a map marker or queue item synchronizes selection in all three panes, centers its location and opens the inspector. Filters update both queue and map. Officer changes persist; AI recommendations remain visible beneath human overrides.

Small screens: list/map navigation and an in-flow inspector instead of squeezing three columns. Controls retain keyboard access and accessible labels. Poll every 8 seconds without stealing input focus or overwriting unsaved edits.

Implementation: isolated public/officer assets, operations API, additive SQLite/PostgreSQL migration, real Anthropic strict tool use, durable database queue, explicit pending/processing/evaluated/failed states. Existing citizen API response and appearance remain intact.
