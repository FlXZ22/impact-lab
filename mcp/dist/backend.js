import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { AppError } from "./errors.js";
/** The four steps a SegnalaMi report goes through; same codes as the app and the City dashboard. */
export const STATI = ["open", "received", "in_progress", "resolved"];
export const ETICHETTE = {
    open: "Inviata",
    received: "Consegnata al Comune",
    in_progress: "Presa in carico",
    resolved: "Risolta"
};
/** Why SegnalaMi's safety check refused a report, in words to relay to the person. */
const MOTIVI = {
    emergency: "Sembra un'emergenza: chiamare subito il 112. Il servizio non e monitorato in tempo reale.",
    natural_event: "E un evento naturale che non crea pericoli ne barriere. Si puo segnalare solo se causa un problema concreto (albero caduto, sottopasso allagato).",
    off_topic: "Non descrive un problema in un luogo o servizio pubblico.",
    abusive: "Contiene insulti, minacce o contenuti rivolti a una persona.",
    harmful: "Il contenuto non e consentito."
};
/**
 * HTTP client for the SegnalaMi API (the same server the citizen web app uses).
 * SEGNALAMI_API_URL defaults to the local dev server.
 */
export class SegnalamiBackend {
    baseUrl;
    constructor(baseUrl = process.env.SEGNALAMI_API_URL || "http://127.0.0.1:3000") {
        this.baseUrl = baseUrl.replace(/\/+$/, "");
    }
    async request(pathname, init) {
        let response;
        try {
            response = await fetch(`${this.baseUrl}${pathname}`, {
                ...init,
                headers: { "Content-Type": "application/json", ...init?.headers },
                signal: AbortSignal.timeout(60_000)
            });
        }
        catch {
            throw new AppError("SERVIZIO_NON_RAGGIUNGIBILE", { url: this.baseUrl });
        }
        const body = (await response.json().catch(() => null));
        if (!response.ok) {
            const code = typeof body?.code === "string" ? body.code : "";
            if (code === "PERSONAL_DATA")
                throw new AppError("DATI_PERSONALI");
            if (code === "REPORT_REJECTED") {
                const reason = typeof body?.reason === "string" ? body.reason : "off_topic";
                throw new AppError("SEGNALAZIONE_NON_AMMESSA", { motivo: reason, spiegazione: MOTIVI[reason] ?? MOTIVI.off_topic });
            }
            if (code === "MODERATION_UNAVAILABLE")
                throw new AppError("CONTROLLO_NON_DISPONIBILE");
            if (response.status === 429)
                throw new AppError("TROPPE_RICHIESTE");
            if (response.status === 404)
                throw new AppError("PRATICA_NON_TROVATA");
            throw new AppError("ERRORE_SERVIZIO", { http: response.status, codice_servizio: code || null });
        }
        return body;
    }
    async health() {
        return this.request("/api/config");
    }
    async createReport(input) {
        return this.request("/api/reports", { method: "POST", body: JSON.stringify({ ...input, language: "it" }) });
    }
    async progress(ids) {
        if (ids.length === 0)
            return [];
        return this.request(`/api/reports/progress?ids=${ids.map(encodeURIComponent).join(",")}`);
    }
    async report(id) {
        return this.request(`/api/reports/${encodeURIComponent(id)}`);
    }
}
/**
 * Practices sent through this MCP server, kept on disk so "elenco_pratiche" survives restarts
 * (stdio servers are restarted with every client session). Only ids and send times.
 */
export class PracticeRegistry {
    file;
    constructor(file = process.env.SEGNALAMI_MCP_REGISTRY || path.join(homedir(), ".config", "segnalami-mcp", "pratiche.json")) {
        this.file = file;
    }
    async all() {
        try {
            const parsed = JSON.parse(await readFile(this.file, "utf8"));
            return Array.isArray(parsed) ? parsed.filter((p) => typeof p?.id === "string") : [];
        }
        catch {
            return [];
        }
    }
    async add(id, inviataIl) {
        const items = (await this.all()).filter(p => p.id !== id);
        items.unshift({ id, inviata_il: inviataIl });
        await mkdir(path.dirname(this.file), { recursive: true });
        await writeFile(this.file, JSON.stringify(items.slice(0, 200), null, 2), { mode: 0o600 });
    }
}
