#!/usr/bin/env node
// Esporta contracts/mcp-tools.json nel formato tools di OpenAI Function Calling.
// Uso: node scripts/export-openai-tools.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const sourcePath = resolve(root, "contracts/mcp-tools.json");
const outPath = resolve(root, "contracts/openai-tools.json");

const source = JSON.parse(readFileSync(sourcePath, "utf8"));
const tools = source.tools.map((tool) => ({
  type: "function",
  function: {
    name: tool.name,
    description: tool.description,
    strict: false,
    parameters: tool.inputSchema,
  },
}));

const out = {
  contractVersion: source.contractVersion,
  generatedFrom: "contracts/mcp-tools.json",
  format: "openai.function_calling",
  note: "Esportazione deterministica degli schemi MCP nel formato tools di OpenAI. Rigenera con: node scripts/export-openai-tools.mjs",
  tools,
};

writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
console.log(`Scritti ${tools.length} tool in ${outPath}`);
