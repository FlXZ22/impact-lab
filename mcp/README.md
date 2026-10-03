# Comune di Milano - Segnalazioni, server MCP

Server Model Context Protocol (MCP) per inviare segnalazioni al Comune di Milano dal proprio assistente e seguirne lo stato. Il modello prepara una bozza, l'utente la conferma, il server invia e restituisce numero di pratica e timeline. L'accesso con SPID o CIE resta sul sito del Comune: le credenziali non passano mai dal server MCP.

Le specifiche funzionali vengono dal PDF "Comune di Milano - Segnalazioni in Claude". L'architettura completa, i contratti e i diagrammi sono in [`docs/architecture.md`](docs/architecture.md).

## Collegamento a SegnalaMi

Il server non tiene piu le pratiche in memoria: `invia_segnalazione`, `stato_pratica` ed `elenco_pratiche` usano l'API dell'app SegnalaMi (`SEGNALAMI_API_URL`, predefinito `http://127.0.0.1:3000`). Una segnalazione inviata da Claude finisce quindi nello stesso database dell'app, compare nella dashboard del Comune e ha la stessa timeline a 4 passi:

| `stato_corrente` | Etichetta |
| --- | --- |
| `open` | Inviata |
| `received` | Consegnata al Comune |
| `in_progress` | Presa in carico |
| `resolved` | Risolta |

`numero_pratica` e l'id della segnalazione in SegnalaMi (UUID); `numero_breve` sono le prime 4 cifre, come nell'app. Le pratiche inviate da questo server sono ricordate in `~/.config/segnalami-mcp/pratiche.json` (`SEGNALAMI_MCP_REGISTRY` per cambiarlo), cosi `elenco_pratiche` funziona anche dopo un riavvio. Bozze e token di conferma restano locali al processo.

### In Claude Code

Il repository contiene `.mcp.json` con il server `segnalami` (stdio). Avvia l'app (`npm start` nella radice), poi apri Claude Code nella cartella del progetto e approva il server quando richiesto (oppure `/mcp`). Dopo modifiche al codice: `npm run build` in `mcp/`.

## Cosa puo fare

- Preparare una segnalazione a tuo nome e mostrartene il riepilogo.
- Inviarla solo dopo la tua conferma esplicita.
- Restituire numero di pratica, ente destinatario e timeline.
- Consultare lo stato delle tue pratiche in qualsiasi momento.

## Cosa non puo fare

- Vedere o conservare le tue credenziali SPID o CIE.
- Inviare una segnalazione senza conferma.
- Leggere pratiche di altri cittadini.

## Requisiti

- Node.js 20 o superiore.
- Un token di autorizzazione delegata dal connettore del Comune (fuori dal modello).

## Avvio

```bash
npm install
npm run build
```

### stdio, per lo sviluppo locale e i client desktop

```bash
node dist/index.js --transport stdio
```

### Streamable HTTP, per il connettore remoto

```bash
node dist/index.js --transport http --host 127.0.0.1 --port 8787 --path /mcp
```

Endpoint: `POST /mcp` per le richieste JSON-RPC, `GET /mcp` per lo stream, `DELETE /mcp` per chiudere la sessione.

### SSE, per i client piu vecchi

```bash
node dist/index.js --transport sse --host 127.0.0.1 --port 8787
```

Endpoint: `GET /sse` e `POST /messages`.

### Ispezione dei tool

```bash
npx @modelcontextprotocol/inspector node dist/index.js --transport stdio
```

Variabili principali: `COMUNE_API_BASE_URL`, `COMUNE_MCP_TOKEN_FILE`, `COMUNE_MCP_PORT`, `COMUNE_MCP_CONFERMA_TTL_S`. L'elenco completo e in [`docs/architecture.md`](docs/architecture.md).

## Claude Desktop

Aggiungi il server a `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`, Windows: `%APPDATA%\Claude\`, Linux: `~/.config/Claude/`):

```json
{
  "mcpServers": {
    "comune-milano-segnalazioni": {
      "command": "node",
      "args": ["/percorso/assoluto/dist/index.js", "--transport", "stdio"],
      "env": {
        "COMUNE_API_BASE_URL": "https://api.comune.milano.example/v1",
        "COMUNE_MCP_TOKEN_FILE": "/percorso/assoluto/.config/comune-milano/token.json"
      }
    }
  }
}
```

Per un connettore remoto usa l'URL Streamable HTTP `https://<host>/mcp` e lascia che Claude completi il flusso di accesso sul sito del Comune.

## OpenAI Function Calling

Gli schemi sono esportati nel formato `tools` di OpenAI a partire dalla fonte unica `contracts/mcp-tools.json`.

```bash
node scripts/export-openai-tools.mjs
```

Il risultato e `contracts/openai-tools.json`. Esempio:

```js
import fs from "node:fs";
const { tools } = JSON.parse(fs.readFileSync("contracts/openai-tools.json", "utf8"));
const completion = await client.chat.completions.create({ model: "gpt-4.1", messages, tools });
```

ChatGPT non esegue MCP in modo nativo: serve un bridge che traduce le function call in chiamate MCP.

## Mappa dei tool

| Tool | Scopo | Effetto |
| --- | --- | --- |
| `prepara_bozza_segnalazione` | Crea una bozza con categoria, descrizione, posizione e allegati | Nessuno |
| `aggiorna_bozza_segnalazione` | Corregge la bozza o cambia destinatario | Nessuno |
| `richiedi_conferma_segnalazione` | Restituisce il riepilogo e un token di conferma monouso | Nessuno |
| `invia_segnalazione` | Invia la bozza confermata | Crea una pratica |
| `stato_pratica` | Legge stato e timeline di una pratica | Sola lettura |
| `elenco_pratiche` | Elenca le pratiche del cittadino | Sola lettura |
| `annulla_bozza_segnalazione` | Annulla una bozza non inviata | Elimina la bozza |

Schema completo di input e output per ogni tool: [`contracts/mcp-tools.json`](contracts/mcp-tools.json).

Il flusso tipico e: `prepara_bozza_segnalazione` → (eventuale) `aggiorna_bozza_segnalazione` → `richiedi_conferma_segnalazione` → conferma dell'utente → `invia_segnalazione` → `stato_pratica`. La conferma e obbligatoria lato server: `invia_segnalazione` rifiuta la chiamata senza un token valido per la revisione corrente.

## Schemi dati

Oggetti principali: `Bozza`, `Riepilogo`, `Ricevuta`, `Pratica`, `PassoTimeline`, `Allegato`. Categorie: `illuminazione_pubblica`, `rifiuti`, `strade_e_marciapiedi`, `arredo_urbano`, `verde_pubblico`, `segnaletica`, `altre`. Priorita: `bassa`, `media`, `alta`. Stati pratica: `ricevuta`, `inoltrata`, `presa_in_carico`, `intervento_concluso`, `chiusa`, `respinta`. Dettaglio e esempi in [`docs/architecture.md`](docs/architecture.md).

## Modello errori

Ogni errore restituisce `isError: true`, un messaggio in italiano e un oggetto con `codice`, `messaggio`, `categoria`, `rimediabile`, `retry_dopo_ms`, `dettagli` e `azione_suggerita`. Catalogo completo: [`contracts/errori.json`](contracts/errori.json).

Codici ricorrenti: `CONFERMA_RICHIESTA` (serve la conferma), `TOKEN_CONFERMA_NON_VALIDO` (conferma scaduta o bozza cambiata), `SERVIZIO_COMUNE_NON_DISPONIBILE` (riprovare con la stessa chiave di idempotenza), `SEGNALAZIONE_RESPINTA` (non riprovare).

## Sicurezza

- SPID e CIE avvengono sul sito del Comune con OAuth 2.1 e PKCE. Il server MCP riceve solo un token delegato con ambiti `segnalazioni:scrittura` e `pratiche:lettura`.
- I log non contengono descrizioni, indirizzi, immagini o token.
- Gli invii sono idempotenti e il token di conferma e monouso e legato alla revisione.
- Gli allegati accettano JPEG, PNG, WebP e PDF fino a 10 MB.

Dettagli in [`docs/architecture.md`](docs/architecture.md).

## Verifica dei contratti

```bash
node scripts/export-openai-tools.mjs
node scripts/validate-contracts.mjs
```

Il validatore controlla campi obbligatori, nomi unici, allineamento tra schemi MCP e schemi OpenAI e catalogo errori. Esce con codice 0 quando tutto e coerente.

## Stato del progetto

Server MCP, API REST e UI statica sono implementati. Avviando il trasporto HTTP, la UI viene servita dalla root e usa `/api`; il server usa un archivio in memoria adatto a demo e sviluppo. Per produzione sostituire l'archivio con un database, configurare OAuth SPID/CIE e impostare `COMUNE_MCP_CONFIRM_SECRET` con un segreto persistente.

La modalità `http` implementa Streamable HTTP. Il flag legacy `sse` documentato nell'architettura non è incluso nel runtime minimo perché il trasporto SSE è deprecato nell'SDK corrente.
