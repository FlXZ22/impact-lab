import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { PROJECT_ROOT } from '../config.ts';

export interface Migration {
  name: string;
  sql: string;
}

/**
 * Migrations must apply in file order. A pending migration that sorts before one already applied
 * (two branches adding migrations at once) could rebuild a table without the newer columns, so it is
 * refused with a clear message instead of being run out of order.
 */
export function assertInOrder(pending: string[], applied: Set<string>): void {
  const latest = [...applied].sort().at(-1);
  const early = latest ? pending.filter(name => name < latest) : [];
  if (early.length) {
    throw new Error(`Migration order conflict: ${early.join(', ')} must run before already-applied ${latest}. Renumber the new migration to sort after it.`);
  }
}

/** Reads `db/<engine>/*.sql` in lexical order; file names are the migration ids. */
export async function loadMigrations(engine: 'sqlite' | 'postgres'): Promise<Migration[]> {
  const dir = path.join(PROJECT_ROOT, 'db', engine);
  const files = (await readdir(dir)).filter(file => file.endsWith('.sql')).sort();
  return Promise.all(files.map(async name => ({ name, sql: await readFile(path.join(dir, name), 'utf8') })));
}
