import { operationsFromRow, type Assessment, type ManagedReport, type OperationsPatch } from '../operations/domain.ts';
import pg from 'pg';
import { isReportStatus, type NewReport, type Report, type ReportStatus, type StatusEvent } from '../domain/report.ts';
import { assertInOrder, loadMigrations } from './migrations.ts';
import type { ListOptions, ReportRepository } from './types.ts';

interface ReportRow {
  id: string;
  content_text: string | null;
  image_url: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  created_at: Date;
}

const COLUMNS = 'id, content_text, image_url, latitude, longitude, status, created_at';

function toReport(row: ReportRow): Report {
  if (!isReportStatus(row.status)) throw new Error(`Unexpected report status in database: ${row.status}`);
  return {
    id: row.id,
    content_text: row.content_text,
    image_url: row.image_url,
    latitude: row.latitude,
    longitude: row.longitude,
    status: row.status,
    created_at: row.created_at.toISOString()
  };
}

/** Advisory lock key so concurrent instances never apply migrations twice. */
const MIGRATION_LOCK = 7_354_120_301;

/** PostgreSQL adapter. Works with Supabase (use its connection string) or any Postgres 13+. */
export class PostgresReportRepository implements ReportRepository {
  readonly #pool: pg.Pool;

  /**
   * @param caCert PEM certificate used to verify the server (Supabase: Database settings → SSL → Download certificate).
   */
  constructor(connectionString: string, caCert: string | null = null) {
    const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(connectionString);
    const explicitSsl = /[?&]sslmode=/.test(connectionString);
    // Hosted Postgres requires TLS and is always verified; local servers usually have none.
    // An sslmode in the URL wins, so operators keep full control.
    let ssl: pg.PoolConfig['ssl'];
    if (caCert) ssl = { ca: caCert, rejectUnauthorized: true };
    else if (!local && !explicitSsl) ssl = { rejectUnauthorized: true };
    this.#pool = new pg.Pool({ connectionString, max: 5, connectionTimeoutMillis: 10_000, ...(ssl ? { ssl } : {}) });
  }

  async init(): Promise<void> {
    const client = await this.#pool.connect();
    try {
      await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]);
      await client.query('CREATE TABLE IF NOT EXISTS public.schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
      const { rows } = await client.query<{ name: string }>('SELECT name FROM public.schema_migrations');
      const applied = new Set(rows.map(row => row.name));
      const migrations = await loadMigrations('postgres');
      assertInOrder(migrations.map(m => m.name).filter(name => !applied.has(name)), applied);
      for (const migration of migrations) {
        if (applied.has(migration.name)) continue;
        await client.query('BEGIN');
        try {
          await client.query(migration.sql);
          await client.query('INSERT INTO public.schema_migrations (name) VALUES ($1)', [migration.name]);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]).catch(() => undefined);
      client.release();
    }
  }

  async #transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async create(input: NewReport): Promise<Report> {
    return this.#transaction(async client => {
      const { rows } = await client.query<ReportRow>(
        `INSERT INTO public.reports (content_text, image_url, latitude, longitude)
         VALUES ($1, $2, $3, $4) RETURNING ${COLUMNS}`,
        [input.content_text, input.image_url, input.latitude, input.longitude]
      );
      const row = rows[0];
      if (!row) throw new Error('Insert returned no row.');
      await client.query(`INSERT INTO public.report_status_events (report_id, status, created_at) VALUES ($1, 'open', $2)`, [row.id, row.created_at]);
      return toReport(row);
    });
  }

  async findById(id: string): Promise<Report | null> {
    const { rows } = await this.#pool.query<ReportRow>(`SELECT ${COLUMNS} FROM public.reports WHERE id = $1`, [id]);
    return rows[0] ? toReport(rows[0]) : null;
  }

  async list({ limit }: ListOptions): Promise<Report[]> {
    const { rows } = await this.#pool.query<ReportRow>(`SELECT ${COLUMNS} FROM public.reports ORDER BY created_at DESC, id DESC LIMIT $1`, [limit]);
    return rows.map(toReport);
  }

  async delete(id: string): Promise<Report | null> {
    return this.#transaction(async client => {
      const { rows } = await client.query<ReportRow>(`SELECT ${COLUMNS} FROM public.reports WHERE id = $1 FOR UPDATE`, [id]);
      if (!rows[0]) return null;
      await client.query('DELETE FROM public.report_status_events WHERE report_id = $1', [id]);
      await client.query('DELETE FROM public.reports WHERE id = $1', [id]);
      return toReport(rows[0]);
    });
  }

  async updateStatus(id: string, status: ReportStatus): Promise<Report | null> {
    return this.#transaction(async client => {
      // Row lock: concurrent updates to the same report serialize, so the timeline stays consistent.
      const { rows: current } = await client.query<ReportRow>(`SELECT ${COLUMNS} FROM public.reports WHERE id = $1 FOR UPDATE`, [id]);
      const existing = current[0];
      if (!existing) return null;
      if (existing.status === status) return toReport(existing);
      const { rows } = await client.query<ReportRow>(`UPDATE public.reports SET status = $1 WHERE id = $2 RETURNING ${COLUMNS}`, [status, id]);
      await client.query('INSERT INTO public.report_status_events (report_id, status) VALUES ($1, $2)', [id, status]);
      return rows[0] ? toReport(rows[0]) : null;
    });
  }

  async timelines(ids: string[]): Promise<Map<string, StatusEvent[]>> {
    const result = new Map<string, StatusEvent[]>();
    if (ids.length === 0) return result;
    const { rows } = await this.#pool.query<{ report_id: string; status: string; created_at: Date }>(
      'SELECT report_id, status, created_at FROM public.report_status_events WHERE report_id = ANY($1::uuid[]) ORDER BY created_at, id',
      [ids]
    );
    for (const row of rows) {
      if (!isReportStatus(row.status)) continue;
      const list = result.get(row.report_id) ?? [];
      list.push({ status: row.status, at: row.created_at.toISOString() });
      result.set(row.report_id, list);
    }
    return result;
  }

  async listManaged(): Promise<ManagedReport[]> {
    const {rows}=await this.#pool.query<ReportRow & Record<string,unknown>>('SELECT * FROM public.reports ORDER BY created_at DESC, id DESC');
    return rows.map(row=>({...toReport(row),...operationsFromRow(row)}));
  }
  async updateOperations(id:string,patch:OperationsPatch):Promise<ManagedReport|null> {
    const keys=Object.keys(patch) as Array<keyof OperationsPatch>;
    if(!keys.length)return null;
    const {rows}=await this.#pool.query<ReportRow & Record<string,unknown>>(`UPDATE public.reports SET ${keys.map((k,i)=>`${k}=$${i+1}`).join(', ')},operations_updated_at=$${keys.length+1} WHERE id=$${keys.length+2} RETURNING *`,[...keys.map(k=>patch[k]??null),new Date().toISOString(),id]);
    return rows[0]?{...toReport(rows[0]),...operationsFromRow(rows[0])}:null;
  }
  async claimAssessment():Promise<ManagedReport|null> {
    const {rows}=await this.#pool.query<ReportRow & Record<string,unknown>>(`UPDATE public.reports SET ai_state='processing',ai_error=NULL,assessed_at=$1 WHERE id=(SELECT id FROM public.reports WHERE ai_state='pending' OR (ai_state='processing' AND assessed_at < $2) ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,[new Date().toISOString(),new Date(Date.now()-5*60_000).toISOString()]);
    return rows[0]?{...toReport(rows[0]),...operationsFromRow(rows[0])}:null;
  }
  async finishAssessment(id:string,assessment:Assessment|null,model:string,error:string|null):Promise<void> {
    await this.#pool.query('UPDATE public.reports SET assessment=$1,ai_state=$2,ai_error=$3,assessment_model=$4,assessed_at=$5 WHERE id=$6',[assessment?JSON.stringify(assessment):null,assessment?'evaluated':'failed',error,model,new Date().toISOString(),id]);
  }
  async retryAssessment(id:string):Promise<boolean> {
    const result=await this.#pool.query("UPDATE public.reports SET ai_state='pending',ai_error=NULL WHERE id=$1 AND ai_state='failed'",[id]);return(result.rowCount??0)>0;
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }
}
