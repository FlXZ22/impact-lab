#!/usr/bin/env node
// Verifica di coerenza dei contratti in contracts/.
// Uso: node scripts/validate-contracts.mjs
// Esce con codice 0 se tutti i controlli passano, 1 al primo errore.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const read = (p) => JSON.parse(readFileSync(resolve(root, p), "utf8"));

const errori = [];
const ok = (msg) => console.log(`ok   ${msg}`);
const fail = (msg) => {
  errori.push(msg);
  console.error(`FAIL ${msg}`);
};

const required = ["name", "title", "description", "inputSchema", "annotations"];
const requiredAnnotations = [
  "readOnlyHint",
  "destructiveHint",
  "idempotentHint",
  "openWorldHint",
];

const mcp = read("contracts/mcp-tools.json");
const openai = read("contracts/openai-tools.json");
const erroriContratto = read("contracts/errori.json");

// 1. MCP tools: campi obbligatori e nomi unici.
const names = new Set();
for (const tool of mcp.tools) {
  for (const field of required) {
    if (!(field in tool)) fail(`tool ${tool.name ?? "?"}: manca ${field}`);
  }
  if (tool.inputSchema?.type !== "object") {
    fail(`tool ${tool.name}: inputSchema.type deve essere object`);
  }
  for (const a of requiredAnnotations) {
    if (typeof tool.annotations?.[a] !== "boolean") {
      fail(`tool ${tool.name}: annotations.${a} deve essere boolean`);
    }
  }
  if (names.has(tool.name)) fail(`nome tool duplicato: ${tool.name}`);
  names.add(tool.name);
}
ok(`mcp-tools.json: ${mcp.tools.length} tool, campi e nomi validi`);

// 2. OpenAI: stessi nomi e stessi parametri dei tool MCP.
const byName = new Map(mcp.tools.map((t) => [t.name, t]));
if (openai.tools.length !== mcp.tools.length) {
  fail(
    `openai-tools.json ha ${openai.tools.length} tool, mcp-tools.json ne ha ${mcp.tools.length}`,
  );
}
for (const t of openai.tools) {
  const fn = t.function;
  const m = byName.get(fn?.name);
  if (!m) {
    fail(`openai-tools.json: tool non presente in mcp-tools.json: ${fn?.name}`);
    continue;
  }
  if (JSON.stringify(fn.parameters) !== JSON.stringify(m.inputSchema)) {
    fail(`openai-tools.json: parametri diversi da mcp-tools.json per ${fn.name}`);
  }
}
for (const name of byName.keys()) {
  if (!openai.tools.some((t) => t.function?.name === name)) {
    fail(`openai-tools.json: manca il tool ${name}`);
  }
}
ok(`openai-tools.json: nomi e parametri allineati a mcp-tools.json`);

// 3. Catalogo errori: codici unici e campi obbligatori.
const campiErrore = ["codice", "http", "categoria", "rimediabile", "messaggio"];
const codici = new Set();
for (const e of erroriContratto.errori) {
  for (const field of campiErrore) {
    if (!(field in e)) fail(`errore ${e.codice ?? "?"}: manca ${field}`);
  }
  if (codici.has(e.codice)) fail(`codice errore duplicato: ${e.codice}`);
  codici.add(e.codice);
}
ok(`errori.json: ${erroriContratto.errori.length} codici unici`);

// 4. Cancello finale.
if (errori.length > 0) {
  console.error(`\n${errori.length} controlli falliti.`);
  process.exit(1);
}
console.log("\nTutti i contratti sono coerenti.");
