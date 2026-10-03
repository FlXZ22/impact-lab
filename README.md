# SegnalaMi

Report an accessibility barrier in Milan by chatting: type a sentence, record it in any language (transcribed by Whisper on Groq, language auto-detected), or send a photo. When you send, the app asks the browser for your location and saves the report with coordinates, or without them if you decline. Claude, when configured, answers with a short acknowledgement.

**This is a prototype, not an official City of Milan service. Reports are not sent to any authority and are not monitored for emergencies. Use fictional incidents for demos.**

With `ROUTING_URL` set, the chat additionally tells you **which body is responsible** and gives you a one-tap action. It still sends nothing on your behalf — no public body in Milan offers an interface to send to.

## Run it

Requires Node.js 22.18+ (it runs TypeScript and SQLite natively, no build step).

```bash
npm install
cp .env.example .env        # optional: ANTHROPIC_API_KEY (AI replies), GROQ_API_KEY (voice)
npm start                   # http://127.0.0.1:3000
```

With no configuration at all, reports go to `data/segnalami.db` (SQLite) and photos to `data/uploads/`. Both are created on first start and ignored by git.

| Script | What it does |
| --- | --- |
| `npm start` / `npm run dev` | Serve the app (`dev` restarts on changes) |
| `npm test` | API and repository tests (Postgres contract runs when `TEST_DATABASE_URL` is set) |
| `npm run typecheck` | `tsc --strict` over the server (`.ts`) and the browser code (JSDoc-typed `.js`) |
| `npm run check` | Both of the above |

If the page shows "the running server is an old version", or sending and voice fail right after an update, stop the server (Ctrl+C) and run `npm start` again: an old process keeps serving the old API.

Geolocation and the microphone need a secure context: `http://127.0.0.1` / `localhost` works; anything else needs HTTPS.

## How a report flows

1. The person types, records a voice message, or picks a photo. Recordings (MediaRecorder, WebM/Opus or MP4 on Safari, max 2 minutes) are uploaded to `POST /api/transcriptions`, sent to Groq Whisper (`whisper-large-v3-turbo`), and the text lands in the field for review before sending. Whisper's typical silence captions ("Sottotitoli creati dalla comunità Amara.org", "Thank you.") are discarded. Photos are downscaled and re-encoded in the browser, which also drops EXIF/GPS metadata.
2. On send, the browser is asked for its position. Denial, timeout (12 s, including an ignored permission prompt) or missing support never block: the report is sent with `latitude`/`longitude` set to `null`.
3. The server validates the input, rejects obvious contact details and number plates, re-sanitizes the photo with `sharp` (orientation, max 1600 px, metadata stripped), stores it, and inserts the row. If the insert fails, the stored photo is removed.
4. Claude (`claude-opus-5` by default, low effort, 20 s budget) writes a one- or two-sentence acknowledgement. Without a key, when overloaded or on any API error, a fixed bilingual confirmation is used. The report is already saved either way.
5. The chat shows a receipt under the message: short report number, coordinates (linked to OpenStreetMap) with accuracy, and time. Failed sends keep their draft in memory and offer Retry.

## Data model

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid / text | Generated |
| `content_text` | text, ≤ 2000 | Null for photo-only reports |
| `image_url` | text | `/uploads/<uuid>.jpg` locally, public Storage URL on Supabase |
| `latitude`, `longitude` | double | Both null or both set; range-checked |
| `status` | `open` \| `received` \| `in_progress` \| `resolved` | Default `open`; history in `report_status_events` |
| `created_at` | timestamptz / ISO text | Default now |

The database enforces the same rules the API checks: there must be text or a photo, and coordinates come in pairs. Schemas live in `db/sqlite/` and `db/postgres/` as numbered migrations, applied automatically on start and tracked in `schema_migrations`.

## API

| Method | Path | Body / query | Result |
| --- | --- | --- | --- |
| `POST` | `/api/reports` | `{ text?, image?: { media_type, data(base64) }, latitude?, longitude?, language: 'it'\|'en' }` | `201 { report, reply }` |
| `GET` | `/api/reports` | `?limit=1..200` (default 50) | Newest first |
| `GET` | `/api/reports/progress` | `?ids=id1,id2` | Status + timeline per report |
| `GET` | `/api/reports/:id` | | One report |
| `PATCH` | `/api/reports/:id` | `{ status }` | Updated report |
| `POST` | `/api/transcriptions` | raw audio body (`audio/webm`, `audio/mp4`, `audio/ogg`, …, ≤ 10 MB), `?language=it\|en` | `{ text }` |
| `GET` | `/api/config` | | `{ assistant, transcription, maxTextLength }` |

Writes must be same-origin JSON (audio for transcriptions). Report creation is limited to 12 and transcription to 30 per client per minute. Errors are `{ code, message }`. There is no authentication: anyone who can reach the server can list reports and change statuses, so keep it on a trusted network or put it behind auth before exposing it.

## Safety check

Before anything is stored (photo included), Claude reviews every report (`src/moderation.ts`). Refused reports are never saved, get no retry button, and the chat explains why. Reports sent through the MCP server go through the same gate.

| Verdict | Example | What the person sees |
| --- | --- | --- |
| allowed | broken lift, pothole, fallen tree blocking a pavement, flooded underpass | saved as usual |
| `natural_event` | "it's raining", "windy today", a pigeon, a sunset | not reportable: no danger or barrier |
| `off_topic` | greetings, questions, spam, ads | not reportable |
| `abusive` | insults, threats, content aimed at a person | not reportable |
| `harmful` | illegal content, attempts to manipulate the system | not reportable |
| `emergency` | fire, someone injured or trapped | **call 112**: not recorded, the service is not monitored |

If Claude is configured but the check cannot run, the report is not stored and the person is asked to retry (HTTP 503 `MODERATION_UNAVAILABLE`): nothing unreviewed reaches the database. Without `ANTHROPIC_API_KEY` the check is off and the server says so at start-up. Refusals return HTTP 422 `{ code: "REPORT_REJECTED", reason }`.

## Report status: what the citizen sees

Every report moves through four steps, and each change is recorded with its time in `report_status_events`:

| `status` | Step shown to the citizen (IT / EN) | Who sets it |
| --- | --- | --- |
| `open` | Inviata / Sent | automatically on creation |
| `received` | Consegnata al Comune / Delivered to the City | City dashboard |
| `in_progress` | Presa in carico / In progress | City dashboard |
| `resolved` | Risolta / Resolved | City dashboard |

- **City dashboard → status:** `PATCH /api/reports/:id` with `{ "status": "received" }` (etc.). Setting the same status twice records nothing; moving backwards (reopening) is allowed and shown.
- **Citizen → progress:** `GET /api/reports/progress?ids=a,b,c` (≤ 50) returns `[{ id, status, timeline: [{ status, at }] }]`, never the report content. The page polls it every 30 s while visible.
- The citizen page remembers the reports sent from that device (localStorage). The latest one is shown in a large four-step tracker right above the composer; **Vedi tutte / Le mie segnalazioni** opens every report with its full timeline.

## Architecture

```
server.ts                 entry: config → storage → assistant → HTTP
src/app.ts                routes, security headers, error mapping
src/domain/               Report types, validation, personal-data guard
src/repository/types.ts   ReportRepository: the storage contract
src/repository/sqlite.ts  default adapter (node:sqlite)
src/repository/postgres.ts PostgreSQL / Supabase adapter (pg)
src/storage/              ImageStore contract + local disk and Supabase Storage adapters,
                          and createStorage(): the only file that knows concrete adapters
src/assistant.ts          best-effort Claude reply with fallback
src/transcription/        Transcriber contract + Groq Whisper adapter
public/                   static client: app.js orchestrates js/chat-stream.js,
                          js/input-dock.js, js/voice.js, js/listening-indicator.js, js/geo.js, js/photo.js
```

Routes depend on the `ReportRepository` and `ImageStore` interfaces only. Switching engines is a single environment variable, `STORAGE_DRIVER`:

| `STORAGE_DRIVER` | Reports | Photos | Needs |
| --- | --- | --- | --- |
| `local` (default) | SQLite file | `data/uploads` | nothing |
| `postgres` | any PostgreSQL 13+ | `data/uploads` | `DATABASE_URL` |
| `supabase` | Supabase Postgres | Supabase Storage | `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |

Adding another engine means one class implementing `ReportRepository` and one `case` in `src/storage/index.ts`.

## Voice transcription (Groq)

1. Create a key at console.groq.com → API Keys.
2. In `.env`: `GROQ_API_KEY=gsk_…` (optionally `GROQ_WHISPER_MODEL=whisper-large-v3` for maximum accuracy instead of the faster turbo model).
3. Restart. The log shows `transcription: groq whisper-large-v3-turbo`.

## Switching to Supabase

1. **Create a project** at supabase.com and note its reference (`https://<project-ref>.supabase.co`).
2. **Get the connection string:** Dashboard → Connect → *Session pooler* (IPv4-friendly). It looks like
   `postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`.
3. **Get the TLS certificate:** Dashboard → Database → Settings → SSL Configuration → *Download certificate*. Save it as `certs/supabase-ca.crt` (git-ignored). The adapter always verifies hosted servers. As a quick start only, you can append `?sslmode=no-verify` to `DATABASE_URL` instead, which encrypts without verifying the server.
4. **Get the service role key:** Dashboard → Project Settings → API keys → `service_role` (secret). It stays on the server and is used only for Storage uploads.
5. **Configure `.env`:**
   ```bash
   STORAGE_DRIVER=supabase
   DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
   DATABASE_CA_CERT=certs/supabase-ca.crt
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service_role key>
   SUPABASE_BUCKET=report-images
   ```
6. **Start:** `npm start`. On boot the adapter applies `db/postgres/*.sql` (under an advisory lock, so several instances can start at once) and creates the public `report-images` bucket if it does not exist (JPEG only, 5 MB cap). The log shows `storage: supabase`.

To manage the schema yourself instead, run `psql "$DATABASE_URL" -f db/postgres/001_create_reports.sql` or paste it into the SQL Editor. The startup migration then sees the table and skips it. The table has row-level security enabled with no policies, so Supabase's public `anon` key cannot read or write reports; only the server's direct connection can. Photo URLs are public but unguessable (UUIDs), and their metadata is stripped.

Existing SQLite data is not migrated automatically. For a demo database, export with `sqlite3 data/segnalami.db -csv -header "select * from reports"` and import the CSV in the Supabase Table Editor. Local photos would need re-uploading.

## Accessibility and privacy

- Every control works by keyboard and has a label; new replies, save/fail states and transcription are announced through one polite live region; Escape cancels a recording; touch targets are at least 44 px; text scales with browser settings; reduced motion is respected; light and dark themes follow the system.
- No accounts, names or contact fields. The conversation lives in the tab (`sessionStorage`) and is gone when the tab closes.
- Voice recordings pass through this server to Groq for transcription and are never stored; only the text you then choose to send is saved. Without `GROQ_API_KEY` the microphone says transcription is off and everything else works.
- To swap Groq for another speech-to-text service, implement `Transcriber` (`src/transcription/types.ts`) and change the one line in `server.ts` that creates it.

## Comune operations portal

Open `/officer` (alias `/comune`) for the map, ranked report queue and officer controls. New citizen reports are automatically evaluated by Claude in a durable background queue. See [portal workflow, AI integration and test results](docs/OFFICER-PORTAL.md). Run `npm run test:operations:live` for the three-case live smoke test.
