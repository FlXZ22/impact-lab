import { z } from "zod";

export const categoria = z.enum(["illuminazione_pubblica", "rifiuti", "strade_e_marciapiedi", "arredo_urbano", "verde_pubblico", "segnaletica", "altre"]);
export const priorita = z.enum(["bassa", "media", "alta"]);
export const posizione = z.object({
  indirizzo: z.string().min(3).max(200),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lon: z.number().min(-180).max(180).nullable().optional(),
  precisione: z.enum(["civico", "via", "quartiere", "gps"]).default("civico"),
  riferimenti: z.string().max(300).nullable().optional()
}).strict();
export const allegato = z.object({
  tipo: z.enum(["foto", "documento"]), mime: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  nome: z.string().max(120), file_id: z.string().nullable().optional(), contenuto_base64: z.string().nullable().optional(),
  dimensione_byte: z.number().int().min(0).max(10_485_760).nullable().optional()
}).strict().refine(v => Boolean(v.file_id || v.contenuto_base64), "file_id o contenuto_base64 richiesto");

export const preparaInput = z.object({
  categoria, sottocategoria: z.string().max(80).nullable().optional(), priorita: priorita.default("media"),
  descrizione: z.string().min(10).max(2000), posizione, destinatario_codice: z.string().max(64).nullable().optional(),
  allegati: z.array(allegato).max(5).default([]), chiave_idempotenza: z.string().max(128).nullable().optional()
}).strict();
export const aggiornaInput = z.object({
  bozza_id: z.string().min(1), revisione: z.number().int().min(1), categoria: categoria.nullable().optional(),
  priorita: priorita.nullable().optional(), descrizione: z.string().min(10).max(2000).nullable().optional(),
  posizione: posizione.nullable().optional(), destinatario_codice: z.string().max(64).nullable().optional(), allegati: z.array(allegato).max(5).nullable().optional()
}).strict();
export const confermaInput = z.object({ bozza_id: z.string().min(1), revisione: z.number().int().min(1) }).strict();
export const inviaInput = confermaInput.extend({ conferma_token: z.string().min(1), chiave_idempotenza: z.string().max(128).nullable().optional() }).strict();
/** numero_pratica is the SegnalaMi report id returned by invia_segnalazione. */
export const statoInput = z.object({ numero_pratica: z.string().uuid() }).strict();
export const elencoInput = z.object({ stato: z.enum(["open", "received", "in_progress", "resolved"]).nullable().optional(), limite: z.number().int().min(1).max(100).default(20), cursore: z.string().nullable().optional() }).strict();
export const annullaInput = z.object({ bozza_id: z.string().min(1), revisione: z.number().int().min(1) }).strict();
export type PreparaInput = z.infer<typeof preparaInput>;
