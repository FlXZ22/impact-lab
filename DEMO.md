# Demo script

A four-beat run showing a citizen report being captured, understood, and handed to the
body actually responsible for it. Roughly three minutes.

## Start

```bash
cd ~/Documents/vibecodes/impact-lab
./demo.sh                                  # or: ANTHROPIC_API_KEY=sk-... ./demo.sh
```

Then open **http://127.0.0.1:3000**.

Use `127.0.0.1`, not your LAN IP: geolocation and the microphone only work in a secure
context. Allow location when the browser asks — the demo is better with it, and the app
still works if you decline.

**Set `ANTHROPIC_API_KEY` if you will type freely on camera.** Without it the routing
service falls back to a keyword classifier that handles the scripted sentences below but
not arbitrary phrasing. With a key, both the chat reply and the classification are real.
`GROQ_API_KEY` additionally enables the microphone, if you want to show voice capture.

Before recording, send one throwaway report so the JIT and the first DB write are warm.

---

## Beat 1 — the core case (the one to lead with)

> **L'ascensore della stazione M3 Lodi è rotto da giorni, in carrozzina non riesco a uscire**

What to point out, in order:

1. The report saves immediately — **receipt** underneath with a report number, the
   coordinates linked to a map, and the time.
2. Below it, a second card: **"Chi se ne occupa"** naming *ATM — Azienda Trasporti
   Milanesi*, with the infoline hours and the stated 10-day response time.
3. A one-tap **"Apri il modulo"** button going to ATM's real contact page.
4. The line underneath: *"Niente è stato inviato: questo passaggio lo fai tu."*

The point to make out loud: **nobody typed a category, an address or a recipient.** The
person described the problem; the system worked out that this is public transport, that
ATM owns the asset, and that a station name is a complete location for a transit report.

## Beat 2 — the safety rail

> **C'è un cavo scoperto che penzola sulla rampa, rischio folgorazione**

The card turns red: **"Sembra un'emergenza" → Chiama il 112**, and the text says plainly
that this service does not forward urgent reports and nobody is reading it right now.

The point: the routing is short-circuited *before* any agency is chosen. A report that
looks like danger is never queued behind a form.

## Beat 3 — a different body, a different action

> **Ingombranti e cassonetti abbandonati bloccano il marciapiede in Via Paolo Sarpi 12**

Now it routes to **Amsa**, 24 hours a day, and the action is a **`tel:` link** rather
than a form — one tap dials 800 33 22 99. Same pipeline, different competence, different
channel.

## Beat 4 — it degrades honestly

In a second terminal:

```bash
pkill -f 'spring-boot:run'
```

Send anything. The report **still saves**, the receipt still appears, and the next-step
card is simply absent — no error, no spinner, no broken screen. The log shows one line:
`[routing] failed (TypeError); no next step shown.`

The point: routing is the optional half. The citizen's report is never held hostage to a
service they have never heard of.

Bring it back with `./demo.sh` — the chat picks it up again with no restart.

---

## If you want a closing line

Everything in beats 1–3 stops one step short of delivery, because **no public body in
Milan publishes an interface to deliver to**. That is not a limitation of the software;
it is the ask. `../segnalazioni_ai/docs/municipality-handoff.md` is the document written
to change it.

## Gotchas while filming

- **Port 8080 is already in use on this machine**, which is why the routing service runs
  on 8081. `demo.sh` handles it; override with `ROUTING_PORT`.
- **Switching the UI to English** gives an English heading with an Italian body — the
  routing service only speaks Italian today. Avoid the language toggle on camera, or
  call it out as known debt.
- The conversation lives in `sessionStorage`. To reset between takes, open a new private
  window rather than reloading.
- Keyless, the assistant reply is a fixed sentence rather than a written one. Fine for
  the demo; obvious on camera if you linger on it.
