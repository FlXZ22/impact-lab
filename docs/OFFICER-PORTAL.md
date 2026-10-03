# Comune di Milano portal

Open **/officer** (also available at **/comune**) on the running SegnalaMi server. The completed application is running at **http://127.0.0.1:3000/officer**, with the citizen view at `/` and the same report database.

## Workflow

The portal uses the existing citizen logo, white background, blue accent and icons. It has a ranked queue on the left, an interactive Leaflet/OpenStreetMap map in the center, and a selected-report inspector on the right. On small screens, switch between list and map; details appear below.

Search by report text, place or ID. Filter by category, proposed/assigned body, status, priority, or missing coordinates. Priority order uses an officer override when present, otherwise Claude's assessment; ties put older reports first. Unassessed reports have no fabricated score and appear after ranked reports. Map markers use only supplied coordinates. Reports without coordinates stay visible in the queue. No automatic geocoding or duplicate merging is performed.

Click a queue item or marker to select a report in all panes. Inspect the original text/photo, AI summary, rationale, confidence and information to verify. Officers can:

- Set priority from 1 to 5 or return to Claude's proposal.
- Assign a responsible body or return to Claude's proposal.
- Update status using the existing status-history API.
- Retry failed AI assessments.

Assignment/priority and status have separate explicit save buttons. An unsaved edit blocks switching reports and has a discard action. Polling every eight seconds preserves draft values and restores focus after a clean inspector update. AI recommendations remain stored beneath human overrides. Assignment here is an internal record; it sends no email, dispatch or notification.

## Where Claude works

`src/operations/assessor.ts` makes a real server-side Anthropic Messages request using the existing `ANTHROPIC_API_KEY` and `CLAUDE_MODEL` configuration. The current project default is `claude-opus-5`; this task preserves that configured citizen model. The full prompt is exported as `ASSESSMENT_PROMPT`.

The `assess_report` tool uses `strict: true`, a closed JSON schema and `tool_choice: auto`, with an explicit prompt to call the tool. The server requires exactly one complete tool result and validates its contents and bounds. Numeric bounds unsupported by strict tool schemas are checked server-side; priority is an enum of 1–5. See [Anthropic strict tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use).

Output: title, summary, category, priority, reason, responsible body, confidence, stated location text, affected groups and missing-information questions. Confidence is Claude's own assessment, not a calibrated guarantee. Uncertain cases remain explicitly uncertain; officers confirm or override. Photos are read from the existing sanitized upload store; remote photos are fetched only from the configured storage origin.

`src/operations/worker.ts` checks the durable database queue every two seconds and processes one report at a time per server. New and previously saved reports are picked up automatically. States are `pending`, `processing`, `evaluated`, `failed`. An atomic claim and five-minute processing lease prevent duplicate concurrent work and recover abandoned requests. API failures do not prevent citizen saving. Failed assessments are shown without an AI score and require an explicit retry. No hardcoded classification fallback is used.

## Storage and integration

Migration **003_report_operations.sql** adds assessment, model/time, queue state/error, priority override, department override and edit time to both SQLite and PostgreSQL adapters. Existing report fields and the citizen response payload stay compatible. Status changes use the existing `updateStatus` operation and citizen progress history. The portal's scripts/styles live entirely under `public/officer`; the existing citizen files are not imported or edited by this feature.

Operations endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/operations/config` | AI availability/model and allowed categories/bodies |
| `GET /api/operations/reports` | Complete queue, sorted by effective priority |
| `PATCH /api/operations/reports/:id` | `priority_override` / `department_override`; `null` restores the AI proposal |
| `POST /api/operations/reports/:id/retry` | Requeue a failed assessment |
| `PATCH /api/reports/:id` | Existing status update and timeline operation |

The portal has no new accounts or authentication. Like the citizen MVP, it is a trusted local prototype. Anyone who can access the server can view reports and use officer controls. A deployed municipal service needs officer access control. The current full-queue response is appropriate for a hackathon dataset; larger deployments need paginated/windowed loading.

OpenStreetMap tiles are loaded directly in the browser; its service sees the normal tile requests. A portal-only CSP change permits those tiles and Leaflet positioning styles. The citizen page keeps its existing CSP. Tile failure leaves the list and inspector functional.

## Verification

- `npm run check`: TypeScript checks passed; **35 tests passed**. New tests cover citizen save → pending portal record → assessment → filtering/ranking → human overrides, retry behavior, status history, invalid edits and route/assets/CSP isolation.
- `npm run test:operations:live`: **three real Claude cases passed** on the configured `claude-opus-5`: railway lift → `trenord_rfi` (priority 4, confidence 0.72), synthetic pothole photo + text → `comune_di_milano` (priority 4, confidence 0.72), ambiguous report → `unknown` (priority 1, confidence 0.20). Persistence and officer priority/assignment/status also passed. These are a small integration smoke test, not a routing-accuracy benchmark.
- Test fixtures are used only in isolated offline tests. The live script uses real API calls and a disposable temporary database.
- PostgreSQL migration/adapter is implemented but not exercised here: no `TEST_DATABASE_URL` was configured.
- Browser-control service listed no available browsers. Desktop/mobile screenshots, actual map rendering and visual/keyboard verification remain **unverified**. Source review found two inspector issues, both corrected and scored resolved from source: same-report selection discarding drafts and focus preventing fresh AI details. No visual approval is claimed.

The live test makes three paid model calls. It never inserts its synthetic cases into the working citizen database.
