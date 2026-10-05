import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./server.js";
import { createHttpApp } from "./http.js";
import { SegnalazioniService } from "./service.js";
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; };
const transportName = arg("--transport", process.env.COMUNE_MCP_TRANSPORT || "stdio");
const service = new SegnalazioniService();
if (transportName === "stdio") {
    await createMcpServer(service).connect(new StdioServerTransport());
}
else {
    const host = arg("--host", process.env.COMUNE_MCP_HOST || "127.0.0.1");
    const port = Number(arg("--port", process.env.COMUNE_MCP_PORT || "8787"));
    const path = arg("--path", process.env.COMUNE_MCP_PATH || "/mcp");
    const app = createHttpApp(service);
    app.all(path, async (req, res) => { const server = createMcpServer(service); const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined }); res.on("close", () => { void transport.close(); void server.close(); }); await server.connect(transport); await transport.handleRequest(req, res, req.body); });
    app.listen(port, host, () => process.stderr.write(`Comune Milano MCP: http://${host}:${port}${path}\nUI: http://${host}:${port}/\n`));
}
