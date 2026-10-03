# SegnalaMi

A working, local hackathon prototype that helps people describe barriers to Milan’s services and prepare a report for the right recipient. People who use wheelchairs, have low vision, are older, cannot hear announcements, or do not speak Italian can face both a physical barrier and a confusing reporting process.

SegnalaMi accepts a description in Italian or English, an optional photo, and an optional public problem location. Claude turns these into an editable report with a suggested recipient, priority, explanation, and messages in both languages. The citizen chooses whether and how to send it. The officer page shows the local queue sorted by urgency.

**This is not an official City service. It never sends reports to an authority. No accounts, names or contact fields. Use fictional incidents for a public demo.**

## Run locally

Requires Node.js 22.9+ and npm, an Anthropic API key with model access, and internet access for Claude. No build step.

```bash
npm install
cp .env.example .env
# Edit .env locally and set ANTHROPIC_API_KEY. Never commit or share it.
npm start
```

Open **http://127.0.0.1:3000/** for citizens and **http://127.0.0.1:3000/officer** for officers. `npm run dev` restarts on source changes. Restart after changing `.env`. The app starts without a key so you can inspect the interface and seeded queue, but report preparation explicitly fails; there is no mock mode.

Environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | required for AI | Read only on the server |
| `CLAUDE_MODEL` | `claude-sonnet-5-5` | Exact Anthropic model ID; configure a model available to your account |
| `HOST` | `127.0.0.1` | Local interface |
| `PORT` | `3000` | HTTP port |
| `REPORTS_FILE` | `data/reports.json` | JSON queue, created from 12 seeds on first start |

The requested default model is used exactly, without silent fallback. Invalid model access, authentication, network, rate-limit and schema errors surface as errors. The no-account officer view is intended for a **trusted local demo**: anyone who can access this server can view the queue and change urgency. Do not expose it as an unrestricted public service. JSON storage supports one server process, with serialized atomic writes.

## Where does Claude work?

**Model and API.** `lib/claude.js` calls `https://api.anthropic.com/v1/messages` server-side using `ANTHROPIC_API_KEY` and `CLAUDE_MODEL` (default `claude-sonnet-5-5`). The front end never receives the key. Requests use a named `prepare_report` tool, `tool_choice`, and a JSON Schema; Ajv validates every response before it is used. This follows Anthropic’s [tool definition documentation](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools) and [Messages API](https://platform.claude.com/docs/en/api/http/messages). The tool is a structured output contract; it performs no delivery action.

**Prompts.** The full system prompt is exported as `SYSTEM_PROMPT` in `lib/claude.js`. It defines the six recipient labels, a 1–5 urgency rubric, evidence-based explanations, privacy handling, bilingual drafts, and clarification behavior. Citizen text and images are treated as untrusted evidence. Input includes the description, language, public location, and optional cleaned image. No retrieved contacts, accounts or hidden user profiles are used.

**Claude decides:** category, short description, location text, affected groups, urgency score and reason, proposed competence, confidence, missing questions, and the Italian/English message drafts. The tool also returns a personal-data flag. Candidate recipients are `comune_di_milano`, `atm`, `trenord_rfi`, `green_space_operator`, `local_police`, and `unknown`. The combined railway label does not assert which railway entity owns a particular asset.

**Clarifications.** Confidence below 0.7, unknown competence, a blank location, or any missing question prevents a ready-to-send package and local saving. The user adds answers to the description and calls Claude again. The server independently enforces this gate, including against the original draft. Claude never gets replaced by routing rules at runtime.

**Humans confirm:** the facts, location, affected groups, recipient, priority, reason, both messages and absence of personal data. Every visible report field can be edited. Confidence and missing questions remain the model’s assessment. Field edits do not automatically rewrite the message drafts; the interface says to update both. Saving explicitly adds the reviewed report to the local prototype queue, without contacting an authority. A second Claude `check_privacy` tool call screens the edited package before JSON storage. Officers can override urgency while the original score and reason remain recorded.

**Sending.** Copy/download works without a configured recipient. `channels.json` contains only `TODO_VERIFY` contacts. The recipient button is disabled until a maintainer verifies a real channel, sets `verified: true`, and replaces `value` with an HTTPS URL (`link`), bare email address (`mailto`), or phone number (`tel`). Restart after editing. Scheme validation prevents unsafe links. Opening a mail client prepares its message; the citizen still presses Send. The server contains no mail, SMS or organization-submission integration.

## Accessibility and input modes

- Semantic HTML, explicit labels, keyboard controls, skip link, visible focus, readable contrast, large-text toggle, live status announcements, and responsive layouts.
- Italian/English UI; both message drafts are always available. Model-generated report fields use the language selected when preparing; switching UI language does not retranslate existing data.
- Optional JPEG/PNG/WebP photo up to 4 MB and 25 million decoded pixels. The server decodes, re-encodes and strips metadata before sending to Claude. Text remains required to give context.
- Web Speech API uses `it-IT` or `en-US`. Start/stop is explicit and permission errors are explained. Unsupported browsers offer typing. Browser dictation may use the browser vendor’s service; no audio goes to this app server. Microphone/geolocation require browser permission and a secure context (localhost qualifies).
- Geolocation is optional, rounded to roughly 100 m and inserted as editable coordinates. Use it only at the public problem location. It is not stored separately as a user location.
- The Leaflet/OpenStreetMap map loads only on request. The table remains usable without map tiles. Only supplied coordinates and explicitly fictional seed coordinates appear; addresses are not guessed or geocoded. Tile requests go directly to OpenStreetMap.

## Privacy and storage

Raw descriptions and photos are not written to disk or logged. Structured anonymous drafts stay in process memory for up to 30 minutes, with an enforced expiry on access and lazy eviction on preparation. A maximum of 100 drafts is retained. Only explicitly reviewed reports enter `data/reports.json`. File storage, `.env`, evaluation results, and test output are gitignored. Language and large-text preferences are the only values in browser localStorage.

The form asks users not to include names, contact details, faces or number plates. Obvious contact/plate patterns are rejected before Claude; Claude flags other identifying information in input and checks edited packages before saving. Personal data must be removed and the request retried. These checks are a prototype safeguard, not a guarantee of perfect detection; use synthetic data for demos. Submitted input is processed by Anthropic, whose own API retention settings apply. The app’s no-storage claim concerns local raw input, not third-party retention.

The API uses JSON-only mutations, same-origin checks, a 6 MB request limit, three concurrent AI calls, timeouts, schema validation, and safe DOM text rendering. It has no authentication by design. Before deployment, a real service would need access controls, retention policy, verified routing/contact information, abuse protection and a privacy review.

## Data and tests

`data/seeds.json` contains **12 fictional reports**, including a broken railway lift routed to `trenord_rfi` and a pothole routed to `comune_di_milano`. They are visibly labelled as examples, not model outputs. The runtime never uses the seeds as AI answers. To start a fresh demo without deleting your queue, set `REPORTS_FILE` to a new filename.

```bash
npm test          # Offline HTTP, schema, privacy gates, sorting and persistence
npm run test:live # Real Claude text + photo flows, officer override, clarification
npm run eval      # 15 real Claude routing calls; prints accuracy and failures
```

`eval/cases.json` contains 15 synthetic cases with expected competence, including deliberately ambiguous reports. `eval/run.js` uses the same production prompt and schema. It prints per-case expected/actual routing, accuracy among completed calls, completion rate, and end-to-end correct/15. It saves details to ignored `eval/results.json`; missing keys or API errors are explicitly reported and never count as successful predictions. API calls incur charges. The script exits nonzero for errors or routing mismatches.

Offline tests make no fake Claude responses. Live flow checks start an isolated temporary JSON queue and remove it afterward. The three flows are (1) text → Claude → review/save → officer queue, (2) photo plus text through the same path, and (3) officer filtering → urgency override → reordering/persistence. A fourth check verifies clarification on ambiguous input. Actual microphone transcription needs a microphone-enabled browser and a person speaking; a transcript-only HTTP test is not proof that speech recognition works.

See `TESTING.md` for the checks and results from this build.

## Project layout

```text
server.js              Express routes, validation, temporary drafts
lib/claude.js          Anthropic Messages calls and prompts
lib/schema.js          Structured report schema and clarification gates
lib/store.js           Serialized, atomic JSON storage
public/                Plain HTML/CSS/JS; citizen and officer pages
channels.json          Verified-channel configuration (TODO_VERIFY initially)
data/seeds.json        12 fictional examples
eval/                  15-case live routing evaluation
scripts/live-flows.js  Live end-to-end checks with isolated storage
test/                  Offline tests without simulated AI
```

MIT licensed. Built in stages: core text/report/officer flow, photo input, voice dictation, then optional map. No build tooling or client AI SDK.
