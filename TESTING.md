# Verification — 3 October 2026 (chat MVP)

| Check | Result |
| --- | --- |
| `npm run typecheck` (tsc strict, server `.ts` + browser JSDoc `.js`) | Passed, 0 errors |
| `npm test` | 23 passed, Postgres contract skipped without `TEST_DATABASE_URL` |
| Repository contract on PostgreSQL 17 (Docker) | 5/5 passed; schema, constraints, RLS and `schema_migrations` inspected with `psql` |
| App end to end with `STORAGE_DRIVER=postgres` | Report created over HTTP and read back from Postgres |
| Live Claude reply (`claude-opus-5`) | Italian acknowledgement in about 2.8 s, `source: claude` |
| Headless Chromium, 390 × 844 and 1280 × 860 (white theme) | Welcome, sent reports with location, location denied, photo attached and sent, offline failure with retry, live waveform from a fake microphone |
| Supabase Storage adapter | **Not run**: needs a real Supabase project. Code follows the Storage REST API; verify by following the README switch steps |
| Voice: record → upload → transcript in field | Passed in headless Chromium with a fake microphone and a stand-in transcriber (real WebM upload, real route) |
| Groq Whisper live, through the browser | Passed: a real speech clip fed to Chromium's microphone was recorded, uploaded and transcribed correctly by `whisper-large-v3-turbo` |
| Silence / non-speech | Quiet recordings are not uploaded (browser level check); Whisper courtesy hallucinations ("Grazie a tutti.", "Thank you.") are discarded server-side |
| Full flow on the real server (Claude + Groq + SQLite) | Passed: transcription 200, report 201 with location, Claude reply in the chat |
| Real typing (keyboard events) in Chromium and Firefox | Passed (mouse and touch focus, Italian accented characters, Enter to send) |
| Real phone (iOS Safari, Android Chrome) | **Not run** |

## What the automated tests cover

- Text, photo-only and denied-location reports; coordinate rounding; fallback replies in both languages.
- Photos: resized to ≤ 1600 px, re-encoded, EXIF removed, served with the right type; a failed insert deletes the stored photo.
- Rejections: empty reports, half or out-of-range coordinates, string coordinates, over-long text, unknown language, contact details and plates, fake or unsupported images, non-object bodies, cross-origin and non-JSON writes, malformed JSON, the per-client rate limit.
- List/get/patch with limit validation, unknown and malformed ids, invalid statuses.
- Static app served with CSP; `.env`, database, source and path-traversal attempts return 404.
- Storage config: default driver, missing settings and unknown drivers fail at start.
- Repository contract (SQLite always, Postgres on demand): defaults, round trip, ordering, limits, status updates, database-level constraints, idempotent migrations.

## Manual checks still worth doing on a phone

1. Send a text report and allow location: the receipt shows coordinates and accuracy, and the map link opens the right spot.
2. Deny location: the report still saves and the receipt says why there is no position.
3. Take a photo with the camera from the photo button; send it without text.
4. Record in Italian and English; try cancel and done; deny the microphone once; record silence.
5. Turn on airplane mode, send, then turn it off and press Retry.
6. Use VoiceOver/TalkBack: replies and save states are announced; every button has a name.
