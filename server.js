import express from 'express';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { cleanPhoto } from './lib/image.js';
import { AppError, prepareReport, checkPrivacy, MODEL } from './lib/claude.js';
import { competences, validReport, needsClarification, obviousPersonalData } from './lib/schema.js';
import { createStore } from './lib/store.js';

const root = path.dirname(fileURLToPath(import.meta.url));
export async function createApp({ file = process.env.REPORTS_FILE || path.join(root, 'data/reports.json') } = {}) {
  const app = express();
  const store = createStore(file); await store.init();
  const channels = JSON.parse(await readFile(path.join(root, 'channels.json'), 'utf8'));
  const drafts = new Map();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store', 'Permissions-Policy': 'geolocation=(self), microphone=(self)', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.tile.openstreetmap.org; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" });
    if (req.path.startsWith('/api/') && !['GET', 'HEAD'].includes(req.method)) {
      if (req.headers.origin && req.headers.origin !== `${req.protocol}://${req.get('host')}`) return res.status(403).json({ code: 'ORIGIN_REJECTED' });
      if (!req.is('application/json')) return res.status(415).json({ code: 'JSON_REQUIRED' });
    }
    next();
  });
  app.use(express.json({ limit: '6mb' }));
  app.get('/api/config', (_req, res) => res.json({ configured: !!process.env.ANTHROPIC_API_KEY?.trim(), channels, model: MODEL() }));
  let activeAI = 0;
  async function withAI(fn) {
    if (activeAI >= 3) throw new AppError(429, 'BUSY', 'Please retry shortly.');
    activeAI++; try { return await fn(); } finally { activeAI--; }
  }
  app.post('/api/prepare', async (req, res) => {
    const { text, address = '', language = 'it', image, privacy_confirmed } = req.body || {};
    if (privacy_confirmed !== true || typeof text !== 'string' || !text.trim() || text.length > 5000 || typeof address !== 'string' || address.length > 300 || !['it', 'en'].includes(language)) throw new AppError(400, 'INVALID_INPUT', 'Check the description, location and privacy confirmation.');
    if (obviousPersonalData(`${text} ${address}`)) throw new AppError(422, 'PERSONAL_DATA', 'Remove contact details or number plates.');
    let cleanImage;
    if (image) cleanImage = await cleanPhoto(image);
    const report = await withAI(() => prepareReport({ text: text.trim(), address: address.trim(), language, image: cleanImage }));
    // Only anonymous structured drafts are retained in memory, never input text/images.
    const now = Date.now();
    for (const [key, draft] of drafts) if (draft.expires < now) drafts.delete(key);
    if (drafts.size >= 100) drafts.delete(drafts.keys().next().value);
    const token = randomUUID();
    drafts.set(token, { report, expires: now + 30 * 60 * 1000, savedId: null });
    res.json({ report, token, needs_clarification: needsClarification(report) });
  });
  app.post('/api/reports', async (req, res) => {
    const { token, report, confirmed } = req.body || {};
    const draft = drafts.get(token);
    if (!draft || draft.expires < Date.now()) throw new AppError(410, 'DRAFT_EXPIRED', 'Prepare the report again.');
    if (confirmed !== true || !validReport(report) || needsClarification(report) || needsClarification(draft.report)) throw new AppError(400, 'REVIEW_REQUIRED', 'Resolve missing information and review the report.');
    if (report.confidence !== draft.report.confidence || JSON.stringify(report.missing_info) !== JSON.stringify(draft.report.missing_info)) throw new AppError(400, 'INVALID_INPUT', 'Confidence and missing information belong to the AI review.');
    if (obviousPersonalData(JSON.stringify(report))) throw new AppError(422, 'PERSONAL_DATA', 'Remove personal information.');
    if (draft.savedId) return res.json({ id: draft.savedId });
    if (draft.saving) throw new AppError(409, 'BUSY', 'This draft is already being saved.');
    draft.saving = true;
    try {
      await withAI(() => checkPrivacy(report));
      const record = { ...report, id: randomUUID(), created_at: new Date().toISOString(), source: 'citizen', original_urgency_score: draft.report.urgency_score, original_urgency_reason: draft.report.urgency_reason, officer_override: null };
      await store.update(rows => rows.push(record)); draft.savedId = record.id;
      res.status(201).json({ id: record.id });
    } finally { draft.saving = false; }
  });
  app.get('/api/reports', async (req, res) => {
    const filter = req.query.competence;
    if (filter && !competences.includes(filter)) throw new AppError(400, 'INVALID_INPUT', 'Unknown responsible body.');
    const rows = (await store.read()).filter(row => !filter || row.competence === filter);
    rows.sort((a, b) => (b.officer_override?.score ?? b.urgency_score) - (a.officer_override?.score ?? a.urgency_score) || b.created_at.localeCompare(a.created_at));
    res.json(rows);
  });
  app.patch('/api/reports/:id/urgency', async (req, res) => {
    const { score } = req.body || {};
    if (!Number.isInteger(score) || score < 1 || score > 5) throw new AppError(400, 'INVALID_INPUT', 'Score must be an integer from 1 to 5.');
    const record = await store.update(rows => {
      const row = rows.find(item => item.id === req.params.id);
      if (!row) throw new AppError(404, 'NOT_FOUND', 'Report not found.');
      row.officer_override = { score, changed_at: new Date().toISOString() }; return row;
    });
    res.json(record);
  });
  app.use('/vendor/leaflet', express.static(path.join(root, 'node_modules/leaflet/dist')));
  app.get('/officer', (_req, res) => res.sendFile(path.join(root, 'public/officer.html')));
  app.use(express.static(path.join(root, 'public')));
  app.use('/api', (_req, res) => res.status(404).json({ code: 'NOT_FOUND' }));
  app.use((error, _req, res, _next) => {
    const status = error.status || 500;
    res.status(status).json({ code: error.type === 'entity.too.large' ? 'IMAGE_TOO_LARGE' : error.code || 'SERVER_ERROR', message: status === 500 ? 'Unable to complete the request.' : error.message });
  });
  return app;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await createApp();
  app.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1', () => console.log(`SegnalaMi: http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 3000}`));
}
