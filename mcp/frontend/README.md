# UI segnalazioni Comune di Milano

Frontend statico senza dipendenze. Per aprirlo in locale:

```sh
python3 -m http.server 8080 --directory frontend
```

## Configurazione API

Il base URL predefinito è `/api`. Si può modificare nel meta tag `api-base` di `index.html` oppure, prima di caricare `app.js`, impostando:

```html
<script>window.COMUNE_MILANO_API_BASE = "https://api.example.test";</script>
```

Contratto HTTP atteso:

| Operazione | Endpoint | Risposta minima |
|---|---|---|
| Crea bozza | `POST /segnalazioni/bozze` | `{ "id": "..." }` o `{ "draftId": "..." }` |
| Conferma | `POST /segnalazioni/{id}/conferma` | `{ "reference": "...", "status": "...", "submittedAt": "..." }` |
| Stato | `GET /pratiche/{reference}` | `{ "reference": "...", "status": "...", "updatedAt": "...", "message": "..." }` |
| Accesso SPID | `GET /auth/spid` | Redirect al gestore ufficiale |
| Accesso CIE | `GET /auth/cie` | Redirect al gestore ufficiale |

Gli errori JSON possono esporre `message` o `error`. Le credenziali non transitano mai dalla UI. In produzione, il backend deve certificare la sessione autenticata; la casella presente nel prototipo rappresenta solo il rientro dal redirect.

## Smoke check manuale

1. Aprire la pagina a 320 px e desktop: header, form e azioni restano leggibili senza scorrimento orizzontale.
2. Inviare il form vuoto: focus ed errori compaiono sui campi obbligatori.
3. Con DevTools o un backend di test, verificare che la bozza usi `POST`, apra il riepilogo e mantenga i testi inseriti.
4. Verificare che SPID/CIE siano semplici link al backend e che la pagina non mostri campi password.
5. Confermare: la risposta popola ricevuta, numero pratica, stato e data.
6. Cercare una pratica valida, una inesistente (`404`) e simulare un errore server: la UI fornisce sempre un feedback comprensibile.
7. Navigare da tastiera: skip link, focus visibile, ordine logico e annunci live devono funzionare.

