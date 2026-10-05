import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { ETICHETTE, PracticeRegistry, SegnalamiBackend, STATI } from "./backend.js";
import { AppError } from "./errors.js";
const recipients = {
    illuminazione_pubblica: { codice: "A2A_IP", nome: "A2A Illuminazione Pubblica" },
    rifiuti: { codice: "AMSA", nome: "AMSA" }
};
const labels = {
    illuminazione_pubblica: "Illuminazione pubblica",
    rifiuti: "Rifiuti",
    strade_e_marciapiedi: "Strade e marciapiedi",
    arredo_urbano: "Arredo urbano",
    verde_pubblico: "Verde pubblico",
    segnaletica: "Segnaletica",
    altre: "Altre"
};
const MAX_TEXT = 2000;
/** Composes the text stored in SegnalaMi: category, description and the place, within the 2000-character limit. */
function reportText(draft) {
    const place = [draft.posizione.indirizzo, draft.posizione.riferimenti].filter(Boolean).join(" · ");
    const suffix = `\n\nLuogo: ${place}`;
    const prefix = `[${labels[draft.categoria] ?? draft.categoria}] `;
    const room = MAX_TEXT - prefix.length - suffix.length;
    const body = draft.descrizione.length > room ? `${draft.descrizione.slice(0, room - 1)}…` : draft.descrizione;
    return `${prefix}${body}${suffix}`;
}
export class SegnalazioniService {
    backend;
    registry;
    secret;
    confirmTtl;
    drafts = new Map();
    usedTokens = new Set();
    constructor(backend = new SegnalamiBackend(), registry = new PracticeRegistry(), secret = process.env.COMUNE_MCP_CONFIRM_SECRET || randomUUID(), confirmTtl = Number(process.env.COMUNE_MCP_CONFERMA_TTL_S || 600)) {
        this.backend = backend;
        this.registry = registry;
        this.secret = secret;
        this.confirmTtl = confirmTtl;
    }
    create(input) {
        const now = new Date();
        const recipient = recipients[input.categoria] || { codice: input.destinatario_codice || "COMUNE_MI", nome: "Comune di Milano" };
        const draft = {
            ...input,
            bozza_id: randomUUID(),
            revisione: 1,
            stato: "bozza",
            destinatario: recipient,
            creata_il: now.toISOString(),
            scade_il: new Date(now.getTime() + 86_400_000).toISOString()
        };
        this.drafts.set(draft.bozza_id, draft);
        return draft;
    }
    get(id) {
        const draft = this.drafts.get(id);
        if (!draft)
            throw new AppError("BOZZA_NON_TROVATA", { bozza_id: id });
        return draft;
    }
    update(id, revision, changes) {
        const draft = this.get(id);
        this.revision(draft, revision);
        if (draft.stato === "inviata" || draft.stato === "annullata")
            throw new AppError("CONFLITTO_REVISIONE", { stato: draft.stato });
        const next = {
            ...draft,
            ...Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined && v !== null)),
            bozza_id: id,
            revisione: draft.revisione + 1,
            stato: "bozza"
        };
        this.drafts.set(id, next);
        return next;
    }
    confirm(id, revision) {
        const draft = this.get(id);
        this.revision(draft, revision);
        if (draft.stato !== "bozza" && draft.stato !== "confermata")
            throw new AppError("CONFLITTO_REVISIONE", { stato: draft.stato });
        draft.stato = "confermata";
        const exp = Math.floor(Date.now() / 1000) + this.confirmTtl;
        const payload = { id, rev: revision, hash: this.hash(draft), exp, jti: randomUUID() };
        const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
        const sig = createHmac("sha256", this.secret).update(body).digest("base64url");
        return {
            bozza_id: id,
            revisione: revision,
            riepilogo: {
                destinatario: draft.destinatario.nome,
                categoria: labels[draft.categoria],
                priorita: draft.priorita,
                posizione: draft.posizione.indirizzo,
                testo_per_ufficio: reportText(draft)
            },
            conferma_token: `${body}.${sig}`,
            scade_il: new Date(exp * 1000).toISOString()
        };
    }
    /** Sends the confirmed draft to SegnalaMi. The report is real: it appears in the app and the City dashboard. */
    async send(id, revision, token) {
        const draft = this.get(id);
        this.revision(draft, revision);
        if (draft.stato !== "confermata")
            throw new AppError("CONFERMA_RICHIESTA", { bozza_id: id });
        const payload = this.verify(token);
        if (payload.id !== id || payload.rev !== revision || payload.hash !== this.hash(draft) || this.usedTokens.has(payload.jti)) {
            throw new AppError("TOKEN_CONFERMA_NON_VALIDO");
        }
        // Spend the token before the network call so a retry can never send twice.
        this.usedTokens.add(payload.jti);
        const photo = draft.allegati.find(a => a.tipo === "foto" && a.contenuto_base64 && a.mime !== "application/pdf");
        const { lat, lon } = draft.posizione;
        const { report, reply } = await this.backend.createReport({
            text: reportText(draft),
            latitude: lat != null && lon != null ? lat : null,
            longitude: lat != null && lon != null ? lon : null,
            image: photo?.contenuto_base64 ? { media_type: photo.mime, data: photo.contenuto_base64 } : null
        });
        draft.stato = "inviata";
        await this.registry.add(report.id, report.created_at);
        const pratica = this.toPratica({ id: report.id, status: report.status, timeline: [{ status: "open", at: report.created_at }] });
        return { ...pratica, risposta_assistente: reply.text };
    }
    async status(number) {
        const [progress] = await this.backend.progress([number]);
        if (!progress)
            throw new AppError("PRATICA_NON_TROVATA", { numero_pratica: number });
        return this.toPratica(progress);
    }
    async list(status, limit = 20) {
        const sent = await this.registry.all();
        const progress = await this.backend.progress(sent.slice(0, 50).map(p => p.id));
        const pratiche = progress.map(p => this.toPratica(p)).filter(p => !status || p.stato_corrente === status).slice(0, limit);
        return { pratiche, prossimo_cursore: null };
    }
    cancel(id, revision) {
        const draft = this.get(id);
        this.revision(draft, revision);
        if (draft.stato === "inviata")
            throw new AppError("CONFLITTO_REVISIONE", { stato: draft.stato });
        draft.stato = "annullata";
        return { bozza_id: id, stato: "annullata" };
    }
    /** SegnalaMi progress → the MCP practice shape, with all four steps and the time each was reached. */
    toPratica(progress) {
        const reached = new Map(progress.timeline.map(event => [event.status, event.at]));
        const current = STATI.indexOf(progress.status);
        return {
            numero_pratica: progress.id,
            numero_breve: progress.id.slice(0, 4).toUpperCase(),
            stato_corrente: progress.status,
            etichetta_stato: ETICHETTE[progress.status],
            timeline: STATI.map((stato, index) => ({
                stato,
                etichetta: ETICHETTE[stato],
                raggiunto: index <= current,
                timestamp: index <= current ? reached.get(stato) ?? null : null
            })),
            aggiornata_il: progress.timeline.at(-1)?.at ?? new Date().toISOString(),
            link_app: this.backend.baseUrl
        };
    }
    revision(draft, revision) {
        if (draft.revisione !== revision)
            throw new AppError("CONFLITTO_REVISIONE", { revisione_corrente: draft.revisione });
    }
    hash(draft) {
        return createHash("sha256").update(JSON.stringify({ ...draft, stato: undefined })).digest("base64url");
    }
    verify(token) {
        try {
            const [body, signature] = token.split(".");
            if (!body || !signature)
                throw new Error("malformed");
            const expected = createHmac("sha256", this.secret).update(body).digest();
            const actual = Buffer.from(signature, "base64url");
            if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
                throw new Error("signature");
            const value = JSON.parse(Buffer.from(body, "base64url").toString());
            if (value.exp < Date.now() / 1000)
                throw new Error("expired");
            return value;
        }
        catch {
            throw new AppError("TOKEN_CONFERMA_NON_VALIDO");
        }
    }
}
