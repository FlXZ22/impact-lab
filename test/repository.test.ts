import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { PostgresReportRepository } from '../src/repository/postgres.ts';
import { SqliteReportRepository } from '../src/repository/sqlite.ts';
import type { ReportRepository } from '../src/repository/types.ts';

/**
 * One contract, every adapter. Postgres runs only when TEST_DATABASE_URL points at a disposable database:
 *   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/segnalami_test npm test
 */
const adapters: Array<{ name: string; make: () => Promise<ReportRepository>; skip?: string }> = [
  { name: 'sqlite', make: async () => new SqliteReportRepository(':memory:') },
  {
    name: 'postgres',
    make: async () => new PostgresReportRepository(process.env.TEST_DATABASE_URL ?? ''),
    ...(process.env.TEST_DATABASE_URL ? {} : { skip: 'set TEST_DATABASE_URL to run' })
  }
];

for (const adapter of adapters) {
  describe(`ReportRepository contract: ${adapter.name}`, { skip: adapter.skip ?? false }, () => {
    async function withRepo(fn: (repo: ReportRepository) => Promise<void>) {
      const repo = await adapter.make();
      try {
        await repo.init();
        await repo.init(); // idempotent
        await fn(repo);
      } finally {
        await repo.close();
      }
    }

    test('creates a report with defaults and reads it back', () =>
      withRepo(async repo => {
        const created = await repo.create({ content_text: 'Rampa bloccata', image_url: null, latitude: 45.4642, longitude: 9.19 });
        assert.match(created.id, /^[0-9a-f-]{36}$/);
        assert.equal(created.status, 'open');
        assert.ok(!Number.isNaN(Date.parse(created.created_at)));
        assert.deepEqual(await repo.findById(created.id), created);
      }));

    test('stores photo-only reports and null locations', () =>
      withRepo(async repo => {
        const created = await repo.create({ content_text: null, image_url: '/uploads/x.jpg', latitude: null, longitude: null });
        assert.equal(created.content_text, null);
        assert.equal(created.latitude, null);
        assert.equal(created.longitude, null);
      }));

    test('lists newest first and honours the limit', () =>
      withRepo(async repo => {
        const first = await repo.create({ content_text: 'first', image_url: null, latitude: null, longitude: null });
        await new Promise(resolve => setTimeout(resolve, 5));
        const second = await repo.create({ content_text: 'second', image_url: null, latitude: null, longitude: null });
        const rows = await repo.list({ limit: 1000 });
        const ours = rows.filter(row => row.id === first.id || row.id === second.id).map(row => row.id);
        assert.deepEqual(ours, [second.id, first.id]);
        assert.equal((await repo.list({ limit: 1 })).length, 1);
      }));

    test('updates status and returns null for unknown ids', () =>
      withRepo(async repo => {
        const created = await repo.create({ content_text: 'x', image_url: null, latitude: null, longitude: null });
        const updated = await repo.updateStatus(created.id, 'resolved');
        assert.equal(updated?.status, 'resolved');
        assert.equal(await repo.updateStatus('00000000-0000-4000-8000-000000000000', 'resolved'), null);
        assert.equal(await repo.findById('00000000-0000-4000-8000-000000000000'), null);
      }));

    test('records a timeline: sent on creation, then each new status once', () =>
      withRepo(async repo => {
        const created = await repo.create({ content_text: 'timeline', image_url: null, latitude: null, longitude: null });
        await repo.updateStatus(created.id, 'received');
        await repo.updateStatus(created.id, 'received'); // unchanged: no duplicate event
        await repo.updateStatus(created.id, 'in_progress');
        await repo.updateStatus(created.id, 'resolved');
        const timelines = await repo.timelines([created.id, '00000000-0000-4000-8000-000000000000']);
        const timeline = timelines.get(created.id) ?? [];
        assert.deepEqual(timeline.map(event => event.status), ['open', 'received', 'in_progress', 'resolved']);
        assert.equal(timeline[0]?.at, created.created_at);
        assert.ok(timeline.every((event, i) => i === 0 || Date.parse(event.at) >= Date.parse(timeline[i - 1]?.at ?? '')));
        assert.equal(timelines.has('00000000-0000-4000-8000-000000000000'), false);
        assert.equal((await repo.timelines([])).size, 0);
      }));

    test('database constraints reject empty reports and half coordinates', () =>
      withRepo(async repo => {
        await assert.rejects(repo.create({ content_text: null, image_url: null, latitude: null, longitude: null }));
        await assert.rejects(repo.create({ content_text: 'x', image_url: null, latitude: 45, longitude: null }));
        await assert.rejects(repo.create({ content_text: 'x', image_url: null, latitude: 91, longitude: 9 }));
      }));
  });
}
