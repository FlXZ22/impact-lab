import { createAssessor } from './src/operations/assessor.ts';
import { createAssessmentWorker } from './src/operations/worker.ts';
import { createApp } from './src/app.ts';
import { createAssistant } from './src/assistant.ts';
import { ConfigError, loadConfig } from './src/config.ts';
import { createStorage } from './src/storage/index.ts';
import { createGroqTranscriber } from './src/transcription/groq.ts';
import { createRouter } from './src/routing.ts';
import { createModerator } from './src/moderation.ts';

let config;
try {
  config = loadConfig();
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(`Configuration error: ${error.message}`);
    process.exit(1);
  }
  throw error;
}

const storage = await createStorage(config.storage);
const assistant = createAssistant(config.assistant);
const transcriber = createGroqTranscriber({ apiKey: config.transcription.groqApiKey, model: config.transcription.model });
const assessor = createAssessor(config.assistant, storage);
const router = createRouter(config.routing);
const moderator = createModerator(config.assistant);
const worker = createAssessmentWorker(storage.reports, assessor);
const server = createApp({ storage, assistant, transcriber, assessor, router, moderator }).listen(config.port, config.host, () => {
  console.log(`SegnalaMi on http://${config.host}:${config.port}`);
  console.log(`  storage: ${config.storage.driver} · assistant: ${assistant.enabled ? config.assistant.model : 'off (no ANTHROPIC_API_KEY)'}`);
  console.log(`  safety check: ${moderator.enabled ? `on (${config.assistant.model})` : 'OFF — no ANTHROPIC_API_KEY, reports are not screened'}`);
  console.log(`  transcription: ${transcriber.enabled ? `groq ${config.transcription.model}` : 'off (no GROQ_API_KEY)'}`);
  console.log(`  routing: ${router.enabled ? config.routing.baseUrl : 'off (no ROUTING_URL)'}`);
});

worker.start();

let closing = false;
async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  console.log(`${signal} received, closing…`);
  // Wait for in-flight requests: assistant.reply can take 20 s, and cutting the socket
  // after the insert already landed makes the citizen resend a report that was saved.
  await Promise.race([
    new Promise<void>(resolve => server.close(() => resolve())),
    new Promise<void>(resolve => setTimeout(resolve, 25_000).unref())
  ]);
  await worker.stop();
  await storage.reports.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
