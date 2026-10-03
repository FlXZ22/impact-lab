import express from "express";
import cors from "cors";
import { aggiornaInput, confermaInput, inviaInput, preparaInput, statoInput } from "./schemas.js";
import { AppError, normalizeError } from "./errors.js";
export function createHttpApp(service) {
    const app = express();
    app.use(cors({ origin: process.env.COMUNE_MCP_CORS_ORIGIN?.split(",") || true }));
    app.use(express.json({ limit: "12mb" }));
    app.use(express.static("frontend"));
    const route = (handler) => async (req, res, next) => { try {
        await handler(req, res);
    }
    catch (e) {
        next(e);
    } };
    app.get("/healthz", (_req, res) => res.json({ stato: "ok" }));
    app.get("/readyz", route(async (_req, res) => { try {
        await service.backend.health();
        res.json({ stato: "ok", dipendenze: { segnalami: service.backend.baseUrl } });
    }
    catch {
        res.status(503).json({ stato: "non_pronto", dipendenze: { segnalami: "non raggiungibile" } });
    } }));
    app.post("/api/segnalazioni/bozze", route((req, res) => { const input = req.body.category ? fromFrontend(req.body) : req.body; const d = service.create(preparaInput.parse(input)); res.status(201).json({ ...d, id: d.bozza_id, draftId: d.bozza_id }); }));
    app.get("/api/segnalazioni/bozze/:id", route((req, res) => res.json(service.get(String(req.params.id)))));
    app.patch("/api/segnalazioni/bozze/:id", route((req, res) => { const v = aggiornaInput.parse({ ...req.body, bozza_id: String(req.params.id) }); const { bozza_id, revisione, ...changes } = v; res.json(service.update(bozza_id, revisione, changes)); }));
    app.delete("/api/segnalazioni/bozze/:id", route((req, res) => res.json(service.cancel(String(req.params.id), Number(req.body.revisione)))));
    app.post("/api/segnalazioni/bozze/:id/conferma", route((req, res) => { const v = confermaInput.parse({ bozza_id: String(req.params.id), revisione: req.body.revisione }); res.json(service.confirm(v.bozza_id, v.revisione)); }));
    app.post("/api/segnalazioni", route(async (req, res) => { const v = inviaInput.parse(req.body); res.status(201).json(await service.send(v.bozza_id, v.revisione, v.conferma_token)); }));
    // Facciata compatibile con il mockup: conferma e invio restano due operazioni server-side distinte.
    app.post("/api/segnalazioni/:id/conferma", route(async (req, res) => { if (req.body.confirmed !== true)
        throw new AppError("CONFERMA_RICHIESTA"); const d = service.get(String(req.params.id)); const c = service.confirm(d.bozza_id, d.revisione); const p = await service.send(d.bozza_id, d.revisione, c.conferma_token); res.status(201).json({ ...p, reference: p.numero_pratica, status: p.stato_corrente, submittedAt: p.timeline[0]?.timestamp }); }));
    app.get("/api/segnalazioni", route(async (req, res) => res.json(await service.list(req.query.stato, Number(req.query.limite || 20)))));
    app.get("/api/segnalazioni/:number", route(async (req, res) => res.json(await service.status(statoInput.parse({ numero_pratica: String(req.params.number) }).numero_pratica))));
    app.get("/api/pratiche/:number", route(async (req, res) => { const p = await service.status(statoInput.parse({ numero_pratica: String(req.params.number) }).numero_pratica); res.json({ ...p, reference: p.numero_pratica, status: p.stato_corrente, updatedAt: p.aggiornata_il }); }));
    app.get(["/api/auth/spid", "/api/auth/cie"], (_req, res) => res.status(501).json({ codice: "AUTH_NON_CONFIGURATA", messaggio: "Configura il redirect OAuth del Comune in produzione." }));
    app.use((cause, _req, res, _next) => { const error = cause instanceof AppError ? cause : normalizeError(cause); res.status(error.http).json(error.payload); });
    return app;
}
function fromFrontend(body) { const problem = String(body.problem || "problema").replaceAll("-", " "); const details = body.details ? ` ${body.details}` : ""; const asset = body.assetId ? ` Codice lampione: ${body.assetId}.` : ""; return { categoria: body.category || "illuminazione_pubblica", descrizione: `${problem} segnalato dall'utente.${asset}${details}`.trim(), posizione: { indirizzo: body.location, precisione: "civico" }, priorita: "media", allegati: [] }; }
