import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
const definitions = {
    INPUT_NON_VALIDO: [400, "validazione", true, "I dati non sono nel formato atteso.", "Correggi i campi indicati e riprova."],
    BOZZA_NON_TROVATA: [404, "dominio", true, "La bozza indicata non esiste piu.", "Crea una nuova bozza."],
    CONFLITTO_REVISIONE: [409, "dominio", true, "La bozza e stata modificata da un'altra operazione.", "Rileggi la bozza e chiedi nuovamente conferma."],
    CONFERMA_RICHIESTA: [409, "dominio", true, "Serve una conferma esplicita prima dell'invio.", "Richiedi la conferma e mostra il riepilogo."],
    TOKEN_CONFERMA_NON_VALIDO: [409, "dominio", true, "La conferma non e valida o e scaduta.", "Genera una nuova conferma sulla revisione corrente."],
    PRATICA_NON_TROVATA: [404, "dominio", true, "La pratica non e stata trovata.", "Verifica il numero di pratica."],
    SEGNALAZIONE_NON_AMMESSA: [422, "sicurezza", false, "Questa segnalazione non puo essere registrata.", "Spiega all'utente il motivo indicato in dettagli.motivo; se e un'emergenza digli di chiamare il 112. Non ritentare l'invio."],
    CONTROLLO_NON_DISPONIBILE: [503, "servizio", true, "Il controllo di sicurezza non e disponibile in questo momento.", "Riprova tra poco."],
    DATI_PERSONALI: [422, "validazione", true, "Il testo contiene dati personali (email, telefono o targa).", "Togli i dati personali dalla descrizione e chiedi una nuova conferma."],
    TROPPE_RICHIESTE: [429, "servizio", true, "Troppe segnalazioni in poco tempo.", "Aspetta un minuto e riprova."],
    SERVIZIO_NON_RAGGIUNGIBILE: [503, "servizio", true, "Il servizio SegnalaMi non e raggiungibile.", "Verifica che l'app SegnalaMi sia avviata (npm start) e che SEGNALAMI_API_URL sia corretto."],
    ERRORE_SERVIZIO: [502, "servizio", true, "Il servizio SegnalaMi ha restituito un errore.", "Riprova tra poco."],
    ERRORE_INTERNO: [500, "interno", true, "Errore interno imprevisto.", "Riprova una volta."]
};
export class AppError extends Error {
    payload;
    http;
    constructor(code, details = {}) {
        const [http, categoria, rimediabile, message, action] = definitions[code];
        super(message);
        this.http = http;
        this.payload = { codice: code, messaggio: message, categoria, rimediabile, retry_dopo_ms: null, dettagli: details, azione_suggerita: action, correlazione_id: `req_${randomUUID()}` };
    }
}
export const normalizeError = (error) => error instanceof AppError ? error : error instanceof ZodError ? new AppError("INPUT_NON_VALIDO", { campi: error.issues.map(issue => ({ percorso: issue.path.join("."), messaggio: issue.message })) }) : new AppError("ERRORE_INTERNO");
