# Verification — 3 October 2026

## Results

| Check | Result |
| --- | --- |
| `npm test` | **12 passed, 0 failed** (includes the parent integration test) |
| `npm run test:live`: text → Claude → review → queue | **Blocked**: no `ANTHROPIC_API_KEY` |
| `npm run test:live`: photo + text → Claude → review → queue | **Blocked**: no `ANTHROPIC_API_KEY` |
| `npm run test:live`: officer filter → override → sorted queue | **Passed**, with persisted JSON checked |
| Live clarification check | **Blocked**: no API key |
| `npm run eval` | Executed; **0/15 evaluated; routing accuracy unavailable** |
| Dependency audit after Sharp update | **0 known vulnerabilities** reported by npm |
| JavaScript syntax checks | Passed |
| Server startup and HTTP routes | Passed; localhost citizen/officer pages and assets served |
| Visual browser / keyboard / responsive QA | Not completed: browser-control service listed no available browser; both Chrome and in-app browser were unavailable |
| Real microphone transcription | Not tested: requires a supported browser, permission and a person speaking |
| Live OpenStreetMap tiles / geolocation permission | Not verified in a browser |

The user chose to finish with live Claude checks marked blocked. No routing accuracy is inferred from the fictional seeds, and no fake AI response was used in the app or tests.

## What the automated checks verify

- All 12 seeds conform to the report schema; railway lift and pothole route to the expected labels.
- Descending urgency, responsible-body filtering, persisted overrides, original-score retention, and serialized concurrent writes.
- Pages/assets are served, while `.env` and JSON storage are not public routes.
- Invalid scores, missing reports, cross-origin mutations, missing privacy confirmation, obvious personal data, malformed images and invented draft tokens are rejected.
- Low confidence, missing location, unknown competence and unanswered questions require clarification.
- Real generated images resize to at most 1600 px and lose EXIF/ICC metadata. Fake image formats and oversized files are rejected.
- Missing API credentials produce an explicit 503 error and no report.

## Finish live verification

Set `ANTHROPIC_API_KEY` in local `.env`, ensure the configured `CLAUDE_MODEL` is available to that account, restart the app, then run:

```bash
npm run test:live
npm run eval
```

Live flow tests use a temporary queue; they do not alter the demo queue. Evaluation uses actual Anthropic Messages calls and records per-case results in ignored `eval/results.json`.

For manual browser verification, test the following with synthetic content:

1. Submit a railway-lift description in Italian; review every field and both drafts, edit them, confirm, and save. Check it appears in the officer list.
2. Switch to English; upload a photo without people/plates, enter a public pothole location, prepare and download the package. Verify that the recipient button stays disabled for `TODO_VERIFY`.
3. Try a vague description. Confirm that questions appear and saving is unavailable until new information is provided.
4. Dictate in both languages in a supported browser, stop recording, and check the transcript. Deny permission once and verify the typing fallback.
5. Filter the officer table, override priority, refresh and confirm ordering/persistence.
6. Navigate using Tab/Shift+Tab/Enter, turn on large text, and inspect at 200% zoom and a narrow mobile viewport. Check the skip link and focus styles.
7. Load the optional map. Deny geolocation once on the citizen page and check the manual-address fallback.

## Environment notes

The execution sandbox could not access npm or maintain local HTTP listeners, so approved commands ran outside it. Sharp was updated to 0.35.5 following an npm advisory. This workstation's global libvips triggered native compilation; installation succeeded using `SHARP_IGNORE_GLOBAL_LIBVIPS=1 npm install`, which selects Sharp's prebuilt library. Ordinary installations can use `npm install` as documented.
