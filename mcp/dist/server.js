import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { aggiornaInput, annullaInput, confermaInput, elencoInput, inviaInput, preparaInput, statoInput } from "./schemas.js";
import { normalizeError } from "./errors.js";
const ok = (value) => ({ content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value });
const safe = async (operation) => { try {
    return ok(await operation());
}
catch (cause) {
    const error = normalizeError(cause);
    return { content: [{ type: "text", text: `${error.payload.messaggio} ${error.payload.azione_suggerita}` }], structuredContent: error.payload, isError: true };
} };
export function createMcpServer(service) {
    const server = new McpServer({ name: "comune-milano-segnalazioni", version: "1.0.0" });
    server.registerTool("prepara_bozza_segnalazione", { description: "Prepara una bozza senza inviarla.", inputSchema: preparaInput.shape }, input => safe(() => service.create(preparaInput.parse(input))));
    server.registerTool("aggiorna_bozza_segnalazione", { description: "Aggiorna una bozza e invalida la conferma precedente.", inputSchema: aggiornaInput.shape }, input => safe(() => { const v = aggiornaInput.parse(input); const { bozza_id, revisione, ...changes } = v; return service.update(bozza_id, revisione, changes); }));
    server.registerTool("richiedi_conferma_segnalazione", { description: "Restituisce riepilogo e token monouso. Non invia.", inputSchema: confermaInput.shape }, input => safe(() => { const v = confermaInput.parse(input); return service.confirm(v.bozza_id, v.revisione); }));
    server.registerTool("invia_segnalazione", { description: "Invia la segnalazione a SegnalaMi (crea una pratica reale, visibile all'app e al Comune). Richiede il token di richiedi_conferma_segnalazione dopo la conferma esplicita dell'utente. Restituisce numero_pratica (usalo con stato_pratica) e la timeline a 4 passi.", inputSchema: inviaInput.shape }, input => safe(() => { const v = inviaInput.parse(input); return service.send(v.bozza_id, v.revisione, v.conferma_token); }));
    server.registerTool("stato_pratica", { description: "Stato attuale e timeline di una pratica SegnalaMi: Inviata → Consegnata al Comune → Presa in carico → Risolta, con data e ora di ogni passo raggiunto.", inputSchema: statoInput.shape }, input => safe(() => service.status(statoInput.parse(input).numero_pratica)));
    server.registerTool("elenco_pratiche", { description: "Elenca le pratiche inviate da questo assistente, con lo stato aggiornato da SegnalaMi.", inputSchema: elencoInput.shape }, input => safe(() => { const v = elencoInput.parse(input); return service.list(v.stato, v.limite); }));
    server.registerTool("annulla_bozza_segnalazione", { description: "Annulla una bozza non inviata.", inputSchema: annullaInput.shape }, input => safe(() => { const v = annullaInput.parse(input); return service.cancel(v.bozza_id, v.revisione); }));
    return server;
}
