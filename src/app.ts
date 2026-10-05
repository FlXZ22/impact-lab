import { operationsRouter } from './operations/routes.ts';
import type { Assessor } from './operations/assessor.ts';
import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import type { Assistant } from './assistant.ts';
import { PROJECT_ROOT } from './config.ts';
import { isLanguage, MAX_TEXT_LENGTH, type ReportProgress } from './domain/report.ts';
import { isReportId, parseCreateReport, parseIdList, parseLimit, parseStatusUpdate } from './domain/validation.ts';
import { AppError } from './errors.ts';
import { sanitizePhoto } from './images.ts';
import { LOCAL_UPLOADS_ROUTE } from './storage/local.ts';
import type { Storage } from './storage/index.ts';
import { SUPPORTED_AUDIO_TYPES } from './transcription/groq.ts';
import type { Transcriber } from './transcription/types.ts';
import type { Router } from './routing.ts';
import type { Moderator } from './moderation.ts';

export interface AppDependencies {
  storage: Storage;
  assistant: Assistant;
  transcriber: Transcriber;
  /** Names the responsible public body. Optional half: a disabled router simply yields no next step. */
  router: Router;
  /** Safety gate in front of report creation. Omitted or disabled means nothing is screened. */
  moderator?: Moderator;
  /** Reports per client per minute. */
  reportsPerMinute?: number;
  assessor?: Pick<Assessor,'enabled'|'model'>;
}

/** Fixed-window limiter for report creation: enough for real use, too little for a spam loop. */
function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, _res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = req.ip ?? 'unknown';
    if (hits.size > 10_000) for (const [ip, entry] of hits) if (entry.resetAt <= now) hits.delete(ip);
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) hits.set(key, { count: 1, resetAt: now + windowMs });
    else if (++entry.count > limit) return next(new AppError(429, 'RATE_LIMITED', 'Too many reports in a short time. Wait a minute and try again.'));
    next();
  };
}

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
/** Bumped when the client/server contract changes; the page warns when it talks to an older server. */
export const API_VERSION = 2;

export function createApp({ storage, assistant, transcriber, router, moderator, reportsPerMinute = 12, assessor }: AppDependencies): express.Express {
  const app = express();
  const imgSources = ["'self'", 'data:', 'blob:', storage.images.publicOrigin].filter(Boolean).join(' ');

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'geolocation=(self), microphone=(self), camera=(self)',
      'Content-Security-Policy': `default-src 'self'; script-src 'self'; style-src 'self'; img-src ${imgSources}; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`
    });
    if (req.path === '/officer' || req.path === '/comune' || req.path.startsWith('/officer/')) {
      // OSM requires a Referer for browser tile requests. Send only the site origin
      // cross-origin, never report text, IDs or query parameters.
      res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.set('Content-Security-Policy', `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src ${imgSources} https://tile.openstreetmap.org; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`);
    }
    if (req.path.startsWith('/api/')) {
      res.set('Cache-Control', 'no-store');
      if (!['GET', 'HEAD'].includes(req.method)) {
        const origin = req.get('origin');
        if (origin && origin !== `${req.protocol}://${req.get('host')}`) return next(new AppError(403, 'ORIGIN_REJECTED', 'Cross-origin requests are not allowed.'));
        const isAudioUpload = req.path === '/api/transcriptions' && req.is('audio/*');
        if (!isAudioUpload && !req.is('application/json')) return next(new AppError(415, 'JSON_REQUIRED', 'Send the request as JSON.'));
      }
    }
    next();
  });
  // Base64 inflates the 5 MB photo limit by a third; leave room for the text and envelope.
  app.use('/api', express.json({ limit: '7.5mb' }));

  app.get('/api/config', (_req, res) => {
    res.json({ apiVersion: API_VERSION, assistant: assistant.enabled, transcription: transcriber.enabled, maxTextLength: MAX_TEXT_LENGTH });
  });

  app.post(
    '/api/transcriptions',
    createRateLimiter(30, 60_000),
    express.raw({ type: 'audio/*', limit: MAX_AUDIO_BYTES }),
    async (req, res) => {
      const language = req.query.language;
      if (language !== undefined && !isLanguage(language)) throw new AppError(400, 'INVALID_INPUT', 'Language must be "it" or "en".');
      const mimeType = (req.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
      if (!SUPPORTED_AUDIO_TYPES.includes(mimeType)) throw new AppError(415, 'INVALID_AUDIO', 'Unsupported audio format.');
      if (!Buffer.isBuffer(req.body) || req.body.length < 512) throw new AppError(422, 'INVALID_AUDIO', 'The recording is empty or too short.');
      const text = await transcriber.transcribe({ audio: req.body, mimeType, ...(language ? { language } : {}) });
      res.json({ text });
    }
  );

  app.post('/api/reports', createRateLimiter(reportsPerMinute, 60_000), async (req, res) => {
    const input = parseCreateReport(req.body);
    const photo = input.image ? await sanitizePhoto(input.image) : null;

    // Safety gate before anything is stored, photo included.
    const verdict = moderator ? await moderator.review({ text: input.text, photo }) : { allowed: true as const };
    if (!verdict.allowed) {
      throw new AppError(422, 'REPORT_REJECTED', 'This cannot be reported here.', { details: { reason: verdict.reason } });
    }

    let imageUrl: string | null = null;
    if (photo) {
      try {
        imageUrl = (await storage.images.save(photo)).url;
      } catch (error) {
        throw new AppError(503, 'STORAGE_ERROR', 'The photo could not be stored. Please try again.', { cause: error });
      }
    }

    let report;
    try {
      report = await storage.reports.create({
        content_text: input.text,
        image_url: imageUrl,
        latitude: input.coordinates?.latitude ?? null,
        longitude: input.coordinates?.longitude ?? null
      });
    } catch (error) {
      if (imageUrl) await storage.images.remove(imageUrl).catch(() => undefined);
      throw new AppError(503, 'STORAGE_ERROR', 'The report could not be saved. Please try again.', { cause: error });
    }

    // Run together so the citizen waits for the slower of the two, not for both in turn.
    // router.route never rejects, so a dead dispatch service cannot fail the request.
    const [reply, nextStep] = await Promise.all([
      assistant.reply({ report, language: input.language, photo }),
      router.route({ report })
    ]);
    res.status(201).json({ report, reply, nextStep });
  });

  app.get('/api/reports', async (req, res) => {
    res.json(await storage.reports.list({ limit: parseLimit(req.query.limit) }));
  });

  // Citizen progress lookup: status and its history only, never the content. Must precede /:id.
  app.get('/api/reports/progress', async (req, res) => {
    const ids = parseIdList(req.query.ids);
    const timelines = await storage.reports.timelines(ids);
    const progress: ReportProgress[] = [];
    for (const id of ids) {
      const timeline = timelines.get(id);
      const last = timeline?.at(-1);
      if (timeline && last) progress.push({ id, status: last.status, timeline });
    }
    res.json(progress);
  });

  app.get('/api/reports/:id', async (req, res) => {
    const report = isReportId(req.params.id) ? await storage.reports.findById(req.params.id) : null;
    if (!report) throw new AppError(404, 'NOT_FOUND', 'Report not found.');
    res.json(report);
  });

  app.patch('/api/reports/:id', async (req, res) => {
    const status = parseStatusUpdate(req.body);
    const report = isReportId(req.params.id) ? await storage.reports.updateStatus(req.params.id, status) : null;
    if (!report) throw new AppError(404, 'NOT_FOUND', 'Report not found.');
    res.json(report);
  });

  app.use('/api/operations', operationsRouter(storage.reports, storage.images, assessor));
  app.use('/api', (_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Unknown endpoint.')));

  app.get(['/officer', '/comune'], (_req, res) => res.sendFile(path.join(PROJECT_ROOT, 'public/officer/index.html')));
  app.use('/officer/vendor', express.static(path.join(PROJECT_ROOT, 'node_modules/leaflet/dist')));
  app.use('/officer/icons', express.static(path.join(PROJECT_ROOT, 'assets/icons')));

  if (storage.localUploadsDir) {
    app.use(LOCAL_UPLOADS_ROUTE, express.static(storage.localUploadsDir, { immutable: true, maxAge: '365d', index: false, dotfiles: 'deny' }));
  }
  app.use(express.static(path.join(PROJECT_ROOT, 'public'), { index: 'index.html', extensions: ['html'] }));

  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof AppError) {
      if (error.status >= 500) console.error(`[api] ${error.code}:`, error.cause ?? error.message);
      return res.status(error.status).json({ code: error.code, message: error.message, ...error.details });
    }
    const type = (error as { type?: unknown } | null)?.type;
    if (type === 'entity.too.large') {
      return req.path === '/api/transcriptions'
        ? res.status(413).json({ code: 'AUDIO_TOO_LARGE', message: 'The recording is too long. Keep it under two minutes.' })
        : res.status(413).json({ code: 'IMAGE_TOO_LARGE', message: 'The photo is larger than 5 MB.' });
    }
    if (type === 'entity.parse.failed') return res.status(400).json({ code: 'INVALID_INPUT', message: 'The request body is not valid JSON.' });
    console.error('[api] unexpected error:', error);
    res.status(500).json({ code: 'SERVER_ERROR', message: 'Something went wrong. Please try again.' });
  });

  return app;
}
