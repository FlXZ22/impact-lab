import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import sharp from 'sharp';
import { createApp } from '../src/app.ts';
import { createRouter } from '../src/routing.ts';
import { createAssistant, fallbackReply } from '../src/assistant.ts';
import { ConfigError, loadStorageConfig } from '../src/config.ts';
import { containsObviousPersonalData } from '../src/domain/privacy.ts';
import { assertInOrder } from '../src/repository/migrations.ts';
import { createStorage, type Storage } from '../src/storage/index.ts';
import { cleanTranscript, createGroqTranscriber } from '../src/transcription/groq.ts';
import type { Transcriber } from '../src/transcription/types.ts';
import { AppError } from '../src/errors.ts';
import type { Moderator } from '../src/moderation.ts';

/** Records what reached the transcriber so tests can assert on it without calling Groq. */
const transcriptions: Array<{ mimeType: string; language: string | undefined; bytes: number }> = [];
const fakeTranscriber: Transcriber = {
  enabled: true,
  async transcribe({ audio, mimeType, language }) {
    transcriptions.push({ mimeType, language, bytes: audio.length });
    return 'ascensore rotto alla fermata Loreto';
  }
};

let dir: string;
let storage: Storage;
let base: string;
let close: () => Promise<void>;

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'segnalami-test-'));
  storage = await createStorage({ driver: 'local', sqlitePath: path.join(dir, 'test.db'), uploadsDir: path.join(dir, 'uploads') });
  const server = createApp({ storage, assistant: createAssistant({ apiKey: null, model: 'unused' }), transcriber: fakeTranscriber, router: createRouter({ baseUrl: null }), reportsPerMinute: 1000 }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => new Promise(resolve => server.close(() => resolve()));
});

after(async () => {
  await close();
  await storage.reports.close();
  await rm(dir, { recursive: true, force: true });
});

function post(body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${base}/api/reports`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
}

async function photoBase64(): Promise<string> {
  const jpeg = await sharp({ create: { width: 2400, height: 1800, channels: 3, background: '#8d9aa3' } })
    .jpeg()
    .withExif({ IFD0: { Make: 'TestCam', ImageDescription: 'secret' } })
    .toBuffer();
  return jpeg.toString('base64');
}

describe('POST /api/reports', () => {
  test('saves a text report with coordinates and replies', async () => {
    const response = await post({ text: '  Ascensore fermo a Loreto  ', latitude: 45.4855123456, longitude: 9.2163, language: 'it' });
    assert.equal(response.status, 201);
    const { report, reply } = await response.json();
    assert.equal(report.content_text, 'Ascensore fermo a Loreto');
    assert.equal(report.latitude, 45.485512);
    assert.equal(report.status, 'open');
    assert.equal(reply.source, 'fallback');
    assert.match(reply.text, /posizione/);
  });

  test('saves without location when permission was denied', async () => {
    const response = await post({ text: 'Blocked ramp', latitude: null, longitude: null, language: 'en' });
    assert.equal(response.status, 201);
    const { report, reply } = await response.json();
    assert.equal(report.latitude, null);
    assert.match(reply.text, /without a location/);
  });

  test('stores a sanitized photo: resized, re-encoded, metadata stripped', async () => {
    const response = await post({ image: { media_type: 'image/jpeg', data: await photoBase64() }, language: 'en' });
    assert.equal(response.status, 201);
    const { report } = await response.json();
    assert.equal(report.content_text, null);
    assert.match(report.image_url, /^\/uploads\/[0-9a-f-]{36}\.jpg$/);

    const served = await fetch(base + report.image_url);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('content-type'), 'image/jpeg');
    const metadata = await sharp(Buffer.from(await served.arrayBuffer())).metadata();
    assert.ok(Math.max(metadata.width, metadata.height) <= 1600);
    assert.equal(metadata.exif, undefined);
  });

  test('rejects empty reports, bad coordinates, personal data and bad images', async () => {
    const cases: Array<[unknown, number, string]> = [
      [{ text: '   ' }, 400, 'EMPTY_REPORT'],
      [{ text: 'x', latitude: 45 }, 400, 'INVALID_LOCATION'],
      [{ text: 'x', latitude: 120, longitude: 9 }, 400, 'INVALID_LOCATION'],
      [{ text: 'x', latitude: '45', longitude: '9' }, 400, 'INVALID_LOCATION'],
      [{ text: 'x'.repeat(2001) }, 400, 'INVALID_INPUT'],
      [{ text: 'x', language: 'fr' }, 400, 'INVALID_INPUT'],
      [{ text: 'Chiamatemi al +39 333 123 4567' }, 422, 'PERSONAL_DATA'],
      [{ text: 'Auto AB 123 CD sul marciapiede' }, 422, 'PERSONAL_DATA'],
      [{ image: { media_type: 'image/gif', data: 'R0lGOD' } }, 400, 'INVALID_IMAGE'],
      [{ image: { media_type: 'image/png', data: 'YWJj' } }, 400, 'INVALID_IMAGE'],
      [[], 400, 'INVALID_INPUT']
    ];
    for (const [body, status, code] of cases) {
      const response = await post(body);
      assert.equal(response.status, status, JSON.stringify(body).slice(0, 80));
      assert.equal((await response.json()).code, code);
    }
  });

  test('rejects cross-origin and non-JSON writes', async () => {
    assert.equal((await post({ text: 'x' }, { Origin: 'https://evil.example' })).status, 403);
    const form = await fetch(`${base}/api/reports`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'text=x' });
    assert.equal(form.status, 415);
    const broken = await fetch(`${base}/api/reports`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    assert.equal((await broken.json()).code, 'INVALID_INPUT');
  });

  test('a failed insert removes the stored photo', async () => {
    const before = await readdir(path.join(dir, 'uploads'));
    const original = storage.reports.create.bind(storage.reports);
    storage.reports.create = async () => {
      throw new Error('disk full');
    };
    try {
      const response = await post({ image: { media_type: 'image/jpeg', data: await photoBase64() } });
      assert.equal(response.status, 503);
      assert.equal((await response.json()).code, 'STORAGE_ERROR');
    } finally {
      storage.reports.create = original;
    }
    assert.deepEqual(await readdir(path.join(dir, 'uploads')), before);
  });
});

describe('reading and updating reports', () => {
  test('lists, fetches and updates status', async () => {
    const { report } = await (await post({ text: 'Semaforo sonoro muto' })).json();
    const list = await (await fetch(`${base}/api/reports?limit=1`)).json();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, report.id);

    assert.equal((await (await fetch(`${base}/api/reports/${report.id}`)).json()).content_text, 'Semaforo sonoro muto');
    const patched = await fetch(`${base}/api/reports/${report.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'in_progress' }) });
    assert.equal((await patched.json()).status, 'in_progress');

    assert.equal((await fetch(`${base}/api/reports/not-a-uuid`)).status, 404);
    assert.equal((await fetch(`${base}/api/reports?limit=0`)).status, 400);
    const badStatus = await fetch(`${base}/api/reports/${report.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'done' }) });
    assert.equal(badStatus.status, 400);
  });

  test('progress endpoint: status steps with timestamps, no content', async () => {
    const { report } = await (await post({ text: 'Rampa rotta in via Padova' })).json();
    const patch = (status: string) =>
      fetch(`${base}/api/reports/${report.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    assert.equal((await patch('received')).status, 200);
    assert.equal((await patch('in_progress')).status, 200);

    const response = await fetch(`${base}/api/reports/progress?ids=${report.id},00000000-0000-4000-8000-000000000000,not-an-id`);
    assert.equal(response.status, 200);
    const [progress, ...rest] = await response.json();
    assert.equal(rest.length, 0);
    assert.equal(progress.id, report.id);
    assert.equal(progress.status, 'in_progress');
    assert.deepEqual(progress.timeline.map((event: { status: string }) => event.status), ['open', 'received', 'in_progress']);
    assert.equal('content_text' in progress, false);

    assert.equal((await fetch(`${base}/api/reports/progress`)).status, 400);
    const tooMany = Array.from({ length: 51 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`).join(',');
    assert.equal((await fetch(`${base}/api/reports/progress?ids=${tooMany}`)).status, 400);
  });

  test('serves the app and keeps data files private', async () => {
    const page = await fetch(base + '/');
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy') ?? '', /script-src 'self'/);
    for (const asset of ['/app.js', '/styles.css', '/js/chat-stream.js']) assert.equal((await fetch(base + asset)).status, 200);
    for (const secret of ['/.env', '/data/segnalami.db', '/src/app.ts', '/uploads/../test.db']) assert.equal((await fetch(base + secret)).status, 404);
    const config = await (await fetch(base + '/api/config')).json();
    assert.equal(config.assistant, false);
    assert.equal(config.transcription, true);
    assert.equal(config.apiVersion, 2);
  });
});

describe('POST /api/transcriptions', () => {
  const audio = new Uint8Array(4096).fill(7);
  const send = (body: BodyInit, type: string, query = '?language=en', headers: Record<string, string> = {}) =>
    fetch(`${base}/api/transcriptions${query}`, { method: 'POST', headers: { 'Content-Type': type, ...headers }, body });

  test('passes raw audio, base MIME type and language to the transcriber', async () => {
    const response = await send(audio, 'audio/webm;codecs=opus');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { text: 'ascensore rotto alla fermata Loreto' });
    assert.deepEqual(transcriptions.at(-1), { mimeType: 'audio/webm', language: 'en', bytes: 4096 });
    // Without a hint the language is left to detection.
    assert.equal((await send(audio, 'audio/ogg', '')).status, 200);
    assert.equal(transcriptions.at(-1)?.language, undefined);
  });

  test('rejects bad formats, tiny recordings, bad languages and cross-origin uploads', async () => {
    assert.equal((await send(audio, 'video/mp4')).status, 415);
    assert.equal((await send(audio, 'audio/x-unknown')).status, 415);
    assert.equal((await send(new Uint8Array(10), 'audio/webm')).status, 422);
    assert.equal((await send(audio, 'audio/webm', '?language=fr')).status, 400);
    assert.equal((await send(audio, 'audio/webm', '', { Origin: 'https://evil.example' })).status, 403);
  });

  test('rejects recordings over 10 MB', async () => {
    const response = await send(new Uint8Array(10 * 1024 * 1024 + 1), 'audio/webm');
    assert.equal(response.status, 413);
    assert.equal((await response.json()).code, 'AUDIO_TOO_LARGE');
  });

  test('without GROQ_API_KEY the transcriber reports itself unavailable', async () => {
    const off = createGroqTranscriber({ apiKey: null, model: 'whisper-large-v3-turbo' });
    assert.equal(off.enabled, false);
    await assert.rejects(off.transcribe({ audio: Buffer.alloc(1), mimeType: 'audio/webm', language: 'it' }), { code: 'TRANSCRIPTION_UNAVAILABLE' });
  });

  test('Whisper silence hallucinations become an empty transcript', () => {
    assert.equal(cleanTranscript(' Sottotitoli creati dalla comunità Amara.org '), '');
    assert.equal(cleanTranscript('Grazie per la visione!'), '');
    assert.equal(cleanTranscript('Thank you.'), '');
    assert.equal(cleanTranscript('Grazie a tutti.'), '');
    assert.equal(cleanTranscript(' Grazie.'), '');
    assert.equal(cleanTranscript('Ciao a tutti!'), '');
    assert.equal(cleanTranscript('Grazie, il semaforo sonoro è rotto'), 'Grazie, il semaforo sonoro è rotto');
  });
});

describe('safety check', () => {
  /** Refuses by keyword so the test can drive every outcome; real decisions come from Claude. */
  const keywordModerator: Moderator = {
    enabled: true,
    async review({ text }) {
      if (text?.includes('piove')) return { allowed: false, reason: 'natural_event' };
      if (text?.includes('incendio')) return { allowed: false, reason: 'emergency' };
      if (text?.includes('offline')) throw new AppError(503, 'MODERATION_UNAVAILABLE', 'down');
      return { allowed: true };
    }
  };

  test('refused reports are not stored (photo included) and the reason is returned', async () => {
    const gated = await createStorage({ driver: 'local', sqlitePath: ':memory:', uploadsDir: path.join(dir, 'gated') });
    const server = createApp({ storage: gated, assistant: createAssistant({ apiKey: null, model: 'unused' }), transcriber: fakeTranscriber, moderator: keywordModerator, router: createRouter({ baseUrl: null }), reportsPerMinute: 1000 }).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/reports`;
    const send = (body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    try {
      const rain = await send({ text: 'Oggi piove molto in centro', image: { media_type: 'image/jpeg', data: await photoBase64() } });
      assert.equal(rain.status, 422);
      assert.deepEqual(await rain.json(), { code: 'REPORT_REJECTED', message: 'This cannot be reported here.', reason: 'natural_event' });
      assert.equal((await send({ text: "C'è un incendio nel palazzo" })).status, 422);
      const down = await send({ text: 'Rampa rotta ma il controllo è offline' });
      assert.equal(down.status, 503);
      assert.equal((await down.json()).code, 'MODERATION_UNAVAILABLE');
      assert.equal((await gated.reports.list({ limit: 10 })).length, 0);
      assert.deepEqual(await readdir(path.join(dir, 'gated')), []);

      const ok = await send({ text: 'Ascensore rotto alla fermata Loreto' });
      assert.equal(ok.status, 201);
      assert.equal((await gated.reports.list({ limit: 10 })).length, 1);
    } finally {
      await new Promise(resolve => server.close(resolve));
      await gated.reports.close();
    }
  });
});

describe('rate limiting', () => {
  test('caps report creation per client', async () => {
    const limited = await createStorage({ driver: 'local', sqlitePath: ':memory:', uploadsDir: path.join(dir, 'limited') });
    const server = createApp({ storage: limited, assistant: createAssistant({ apiKey: null, model: 'unused' }), transcriber: fakeTranscriber, router: createRouter({ baseUrl: null }), reportsPerMinute: 2 }).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/reports`;
    try {
      const statuses = [];
      for (let i = 0; i < 3; i++) {
        statuses.push((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `r${i}` }) })).status);
      }
      assert.deepEqual(statuses, [201, 201, 429]);
    } finally {
      await new Promise(resolve => server.close(resolve));
      await limited.reports.close();
    }
  });
});

describe('units', () => {
  test('storage config: one variable switches engines, missing settings fail loudly', () => {
    assert.equal(loadStorageConfig({}).driver, 'local');
    assert.throws(() => loadStorageConfig({ STORAGE_DRIVER: 'postgres' }), ConfigError);
    assert.throws(() => loadStorageConfig({ STORAGE_DRIVER: 'supabase', DATABASE_URL: 'postgres://x' }), ConfigError);
    assert.throws(() => loadStorageConfig({ STORAGE_DRIVER: 'mongo' }), ConfigError);
    const supabase = loadStorageConfig({ STORAGE_DRIVER: 'supabase', DATABASE_URL: 'postgres://x', SUPABASE_URL: 'https://abc.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: 'k' });
    assert.equal(supabase.driver === 'supabase' && supabase.supabaseUrl, 'https://abc.supabase.co');
  });

  test('personal data guard avoids false positives on ordinary text', () => {
    assert.equal(containsObviousPersonalData("L'ascensore al 123 di via Padova"), false);
    assert.equal(containsObviousPersonalData('Linea 90, fermata 15'), false);
    assert.equal(containsObviousPersonalData('scrivete a mario@example.com'), true);
  });

  test('fallback replies match language and location outcome', () => {
    const report = { id: 'x', content_text: 'x', image_url: null, latitude: null, longitude: null, status: 'open' as const, created_at: '' };
    assert.match(fallbackReply(report, 'en').text, /without a location/);
    assert.match(fallbackReply({ ...report, latitude: 1, longitude: 1 }, 'it').text, /con la tua posizione/);
  });

  test('migrations refuse to run out of order', () => {
    assert.doesNotThrow(() => assertInOrder(['002_b.sql', '003_c.sql'], new Set(['001_a.sql'])));
    assert.throws(() => assertInOrder(['002_b.sql'], new Set(['001_a.sql', '003_c.sql'])), /Migration order conflict/);
  });

  test('migrations ship for both engines', async () => {
    for (const file of ['db/sqlite/001_create_reports.sql', 'db/postgres/001_create_reports.sql']) {
      assert.match(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'), /CREATE TABLE IF NOT EXISTS/);
    }
  });
});

/**
 * The seam to the segnalazioni_ai dispatch service. A stub HTTP server stands in for it,
 * so the real fetch, URL building and request mapping are exercised rather than mocked out.
 */
describe('routing to the responsible body', () => {
  /** Bodies the stub received, so the outbound mapping can be asserted. */
  let received: Array<Record<string, unknown>> = [];
  let stub: import('node:http').Server;
  let stubUrl: string;
  let routedBase: string;
  let closeRouted: () => Promise<void>;
  let failure = false;

  const atmResponse = {
    reportId: '317a25b0-0905-4468-be76-34a2b370f8a3',
    status: 'AWAITING_CITIZEN_ACTION',
    analysis: { category: 'TRASPORTO_PUBBLICO', severity: 'ROUTINE', confidence: 0.9, location: 'stazione M3 Lodi' },
    nextStep: {
      agencyId: 'atm',
      channel: 'WEB_FORM',
      action: 'SUBMIT_FORM',
      message: "Questa segnalazione e' di competenza di ATM — Azienda Trasporti Milanesi.",
      deeplink: 'https://www.atm.it/it/AtmNews/Pagine/Contatti.aspx',
      prefilledText: 'Ascensore fuori servizio.',
      reference: null,
      attachmentIds: [],
      extra: {}
    }
  };

  before(async () => {
    const http = await import('node:http');
    stub = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        received.push(JSON.parse(Buffer.concat(chunks).toString()));
        if (failure) {
          res.writeHead(500).end('{}');
          return;
        }
        res.writeHead(201, { 'content-type': 'application/json' }).end(JSON.stringify(atmResponse));
      });
    });
    await new Promise<void>(resolve => stub.listen(0, '127.0.0.1', resolve));
    stubUrl = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;

    const routedStorage = await createStorage({ driver: 'local', sqlitePath: ':memory:', uploadsDir: path.join(dir, 'routed') });
    const server = createApp({
      storage: routedStorage,
      assistant: createAssistant({ apiKey: null, model: 'unused' }),
      transcriber: fakeTranscriber,
      router: createRouter({ baseUrl: stubUrl }),
      reportsPerMinute: 1000
    }).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    routedBase = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    closeRouted = () => new Promise(resolve => server.close(() => resolve()));
  });

  after(async () => {
    await closeRouted();
    await new Promise<void>(resolve => stub.close(() => resolve()));
  });

  const post = (base: string, body: unknown) =>
    fetch(`${base}/api/reports`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  test('a metro-lift report comes back with ATM as the responsible body', async () => {
    received = [];
    const response = await post(routedBase, {
      text: "L'ascensore della stazione M3 Lodi e' rotto da giorni",
      latitude: 45.449,
      longitude: 9.209
    });
    assert.equal(response.status, 201);
    const body = await response.json();

    assert.equal(body.nextStep.action, 'SUBMIT_FORM');
    assert.equal(body.nextStep.agencyId, 'atm');
    assert.equal(body.nextStep.category, 'TRASPORTO_PUBBLICO');
    assert.match(body.nextStep.message, /ATM/);
    assert.ok(body.nextStep.deeplink.startsWith('https://'));

    // The outbound mapping: text forwarded, Milan coordinates kept, no contact invented.
    assert.equal(received.length, 1);
    assert.match(String(received[0]?.text), /ascensore/);
    assert.equal(received[0]?.latitude, 45.449);
    assert.equal('contact' in (received[0] ?? {}), false);
  });

  test('coordinates outside Milan are omitted rather than rejected', async () => {
    received = [];
    // Rome. The dispatch service would 400 on these, so they must not be forwarded.
    const response = await post(routedBase, { text: 'Ascensore rotto in stazione', latitude: 41.9, longitude: 12.5 });
    assert.equal(response.status, 201);
    assert.equal(received.length, 1);
    assert.equal('latitude' in (received[0] ?? {}), false);
    assert.equal('longitude' in (received[0] ?? {}), false);
  });

  test('the report still saves when the dispatch service fails', async () => {
    failure = true;
    try {
      const response = await post(routedBase, { text: 'Ascensore rotto alla stazione Centrale' });
      assert.equal(response.status, 201);
      const body = await response.json();
      assert.ok(body.report.id, 'the report must be saved regardless');
      assert.equal(body.nextStep, null, 'no next step, and no error shown to the citizen');
    } finally {
      failure = false;
    }
  });

  test('a photo-only report never reaches the dispatch service', async () => {
    received = [];
    const image = { media_type: 'image/jpeg' as const, data: (await sharp({ create: { width: 8, height: 8, channels: 3, background: '#888' } }).jpeg().toBuffer()).toString('base64') };
    const response = await post(routedBase, { image });
    assert.equal(response.status, 201);
    assert.equal(received.length, 0, 'blank text would be rejected upstream, so it is not sent');
  });

  test('a router with no base URL is disabled and yields nothing', async () => {
    const off = createRouter({ baseUrl: null });
    assert.equal(off.enabled, false);
    const report = { id: 'x', content_text: 'ascensore rotto', image_url: null, latitude: null, longitude: null, status: 'open' as const, created_at: '' };
    assert.equal(await off.route({ report }), null);
  });
});
