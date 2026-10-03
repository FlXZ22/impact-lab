import { operationsFromRow, type Assessment, type ManagedReport, type OperationsPatch } from '../operations/domain.ts';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { isReportStatus, type NewReport, type Report, type ReportStatus, type StatusEvent } from '../domain/report.ts';
import { assertInOrder, loadMigrations } from './migrations.ts';
import type { ListOptions, ReportRepository } from './types.ts';

type Row = Record<string, SQLInputValue>;

function toReport(row: Row): Report {
  const status = row.status;
  if (!isReportStatus(status)) throw new Error(`Unexpected report status in database: ${String(status)}`);
  return {
    id: String(row.id),
    content_text: row.content_text == null ? null : String(row.content_text),
    image_url: row.image_url == null ? null : String(row.image_url),
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    status,
    created_at: String(row.created_at)
  };
}

/** Zero-setup adapter backed by Node's built-in SQLite. Pass ':memory:' for tests. */
export class SqliteReportRepository implements ReportRepository {
  readonly #db: DatabaseSync;

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
    this.#db = new DatabaseSync(file);
    this.#db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  }

  async init(): Promise<void> {
    this.#db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
    const applied = new Set(this.#db.prepare('SELECT name FROM schema_migrations').all().map(row => String(row.name)));
    const migrations = await loadMigrations('sqlite');
    assertInOrder(migrations.map(m => m.name).filter(name => !applied.has(name)), applied);
    for (const migration of migrations) {
      if (applied.has(migration.name)) continue;
      this.#db.exec('BEGIN');
      try {
        this.#db.exec(migration.sql);
        this.#db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(migration.name, new Date().toISOString());
        this.#db.exec('COMMIT');
      } catch (error) {
        this.#db.exec('ROLLBACK');
        throw error;
      }
    }
  }

  /** Runs fn atomically. node:sqlite is synchronous, so nothing else can interleave. */
  #transaction<T>(fn: () => T): T {
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.#db.exec('COMMIT');
      return result;
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
  }

  #recordEvent(reportId: string, status: ReportStatus, at: string): void {
    this.#db.prepare('INSERT INTO report_status_events (report_id, status, created_at) VALUES (?, ?, ?)').run(reportId, status, at);
  }

  async create(input: NewReport): Promise<Report> {
    return this.#transaction(() => {
      const now = new Date().toISOString();
      const row = this.#db
        .prepare(
          `INSERT INTO reports (id, content_text, image_url, latitude, longitude, status, created_at)
           VALUES (?, ?, ?, ?, ?, 'open', ?) RETURNING *`
        )
        .get(randomUUID(), input.content_text, input.image_url, input.latitude, input.longitude, now);
      if (!row) throw new Error('Insert returned no row.');
      const report = toReport(row);
      this.#recordEvent(report.id, 'open', now);
      return report;
    });
  }

  async findById(id: string): Promise<Report | null> {
    const row = this.#db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
    return row ? toReport(row) : null;
  }

  async list({ limit }: ListOptions): Promise<Report[]> {
    return this.#db.prepare('SELECT * FROM reports ORDER BY created_at DESC, rowid DESC LIMIT ?').all(limit).map(toReport);
  }

  async delete(id: string): Promise<Report | null> {
    return this.#transaction(() => {
      const row = this.#db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
      if (!row) return null;
      this.#db.prepare('DELETE FROM report_status_events WHERE report_id = ?').run(id);
      this.#db.prepare('DELETE FROM reports WHERE id = ?').run(id);
      return toReport(row);
    });
  }

  async updateStatus(id: string, status: ReportStatus): Promise<Report | null> {
    return this.#transaction(() => {
      const current = this.#db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
      if (!current) return null;
      if (current.status === status) return toReport(current);
      const row = this.#db.prepare('UPDATE reports SET status = ? WHERE id = ? RETURNING *').get(status, id);
      if (!row) return null;
      this.#recordEvent(id, status, new Date().toISOString());
      return toReport(row);
    });
  }

  async timelines(ids: string[]): Promise<Map<string, StatusEvent[]>> {
    const result = new Map<string, StatusEvent[]>();
    if (ids.length === 0) return result;
    const rows = this.#db
      .prepare(`SELECT report_id, status, created_at FROM report_status_events WHERE report_id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at, id`)
      .all(...ids);
    for (const row of rows) {
      if (!isReportStatus(row.status)) continue;
      const key = String(row.report_id);
      const list = result.get(key) ?? [];
      list.push({ status: row.status, at: String(row.created_at) });
      result.set(key, list);
    }
    return result;
  }

  async listManaged(): Promise<ManagedReport[]> {
    return this.#db.prepare('SELECT * FROM reports ORDER BY created_at DESC').all().map(row=>({...toReport(row),...operationsFromRow(row)}));
  }
  async updateOperations(id: string, patch: OperationsPatch): Promise<ManagedReport | null> {
    const keys=Object.keys(patch) as Array<keyof OperationsPatch>;
    if(!keys.length)return null;
    const row=this.#db.prepare(`UPDATE reports SET ${keys.map(k=>`${k} = ?`).join(', ')}, operations_updated_at=? WHERE id=? RETURNING *`).get(...keys.map(k=>patch[k]??null),new Date().toISOString(),id);
    return row?{...toReport(row),...operationsFromRow(row)}:null;
  }
  async claimAssessment(): Promise<ManagedReport | null> {
    const row=this.#db.prepare(`UPDATE reports SET ai_state='processing',ai_error=NULL,assessed_at=? WHERE id=(SELECT id FROM reports WHERE ai_state='pending' OR (ai_state='processing' AND assessed_at < ?) ORDER BY created_at ASC LIMIT 1) RETURNING *`).get(new Date().toISOString(),new Date(Date.now()-5*60_000).toISOString());
    return row?{...toReport(row),...operationsFromRow(row)}:null;
  }
  async finishAssessment(id:string,assessment:Assessment|null,model:string,error:string|null):Promise<void> {
    this.#db.prepare('UPDATE reports SET assessment=?,ai_state=?,ai_error=?,assessment_model=?,assessed_at=? WHERE id=?').run(assessment?JSON.stringify(assessment):null,assessment?'evaluated':'failed',error,model,new Date().toISOString(),id);
  }
  async retryAssessment(id:string):Promise<boolean> {
    return this.#db.prepare("UPDATE reports SET ai_state='pending',ai_error=NULL WHERE id=? AND ai_state='failed'").run(id).changes>0;
  }

  async close(): Promise<void> {
    if (this.#db.isOpen) this.#db.close();
  }
}
