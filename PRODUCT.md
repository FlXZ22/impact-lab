# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People in Milan who run into accessibility barriers in public space and services: wheelchair users, people with low vision or limited mobility, older people, people who cannot hear announcements, and people who do not speak Italian. They are usually standing in front of the problem (a broken lift, a blocked ramp, a missing announcement) with a phone in one hand, and want to report it in seconds, in Italian or English.

## Product Purpose

SegnalaMi lets someone report an accessibility barrier by talking to it: type a sentence, record it, or snap a photo, and send. The report is saved with the device location when the person allows it. Success is a report captured in one gesture, with no form to fill in.

## Positioning

A conversation instead of a form. The person never chooses a category, recipient or address field: they describe what they see, and the app captures text, photo and location together.

## Operating Context

- Used outdoors, one-handed, often in motion, on mobile browsers; desktop is secondary.
- Input by text, voice recording in any language transcribed by Whisper on Groq (language detected automatically, reviewed in the field before sending), or camera/photo picker.
- After sending, the citizen follows each report through four steps: Inviata → Consegnata al Comune → Presa in carico → Risolta. The City sets the steps from its dashboard.
- Location is requested from the browser at the moment of sending; denial or timeout never blocks the report.
- Claude, when configured, answers each report with a short acknowledgement. The report is saved whether or not Claude is reachable.

## Capabilities and Constraints

- Report record: id, content_text, image_url, latitude, longitude, status, created_at.
- Storage behind a repository contract: SQLite by default (zero setup), PostgreSQL/Supabase via an adapter selected by environment variable.
- Photos are re-encoded server-side (EXIF and embedded location stripped) before storage.
- No accounts, names or contact fields. The citizen view shows only the current session's conversation.
- The officer view was removed in the chat MVP; reports are readable through `GET /api/reports`.
- Not an official City of Milan service; reports are not sent to any authority and are not monitored for emergencies.
- When routing is configured, the chat also names the public body responsible for the report and offers a one-tap action (a phone number or the body's own form). Sending it remains the citizen's step: the card says so explicitly.

## Brand Commitments

- Name and logo: `assets/SEGNALA.png` — "Segnala" in a black serif, "mi" in blue script (#004AAD). Served as `public/logo.png`; favicon is the "mi" mark.
- Icons come from `assets/icons` where one exists (mic, close, done); camera, send, pin and retry are drawn to match.
- White, Claude-like interface: quiet, conversation-first.
- Bilingual Italian/English interface, Italian first.
- Plain, warm, direct voice; never bureaucratic.

## Evidence on Hand

No real reports, testimonials or partner endorsements exist. Do not fabricate them. Demo content must use fictional incidents.

## Product Principles

1. One gesture to report. Anything that does not help capture the barrier is removed.
2. Never block on permissions. Location, microphone and AI are enhancements; the report always saves.
3. Privacy by default: no identity fields, stripped photo metadata, explicit reminders not to include faces or plates.
4. Honest status. Never imply that an authority has been contacted.

## Accessibility & Inclusion

WCAG 2.2 AA is the floor. Every action must work by keyboard and screen reader, with live announcements for new messages and state changes, large touch targets (≥ 44 px), visible focus, reduced-motion support, and text that scales to 200%.
