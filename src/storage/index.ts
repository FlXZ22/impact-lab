import { readFile } from 'node:fs/promises';
import type { StorageConfig } from '../config.ts';
import { PostgresReportRepository } from '../repository/postgres.ts';
import { SqliteReportRepository } from '../repository/sqlite.ts';
import type { ReportRepository } from '../repository/types.ts';
import { LocalImageStore } from './local.ts';
import { SupabaseImageStore } from './supabase.ts';
import type { ImageStore } from './types.ts';

export interface Storage {
  reports: ReportRepository;
  images: ImageStore;
  /** Set when photos are served by this process. */
  localUploadsDir: string | null;
}

/** The only place that knows concrete adapters. Everything else receives the Storage interfaces. */
export async function createStorage(config: StorageConfig): Promise<Storage> {
  let storage: Storage;
  switch (config.driver) {
    case 'local': {
      const images = new LocalImageStore(config.uploadsDir);
      storage = { reports: new SqliteReportRepository(config.sqlitePath), images, localUploadsDir: images.directory };
      break;
    }
    case 'postgres': {
      const images = new LocalImageStore(config.uploadsDir);
      const ca = config.caCertPath ? await readFile(config.caCertPath, 'utf8') : null;
      storage = { reports: new PostgresReportRepository(config.databaseUrl, ca), images, localUploadsDir: images.directory };
      break;
    }
    case 'supabase': {
      const ca = config.caCertPath ? await readFile(config.caCertPath, 'utf8') : null;
      storage = {
        reports: new PostgresReportRepository(config.databaseUrl, ca),
        images: new SupabaseImageStore({ url: config.supabaseUrl, serviceRoleKey: config.serviceRoleKey, bucket: config.bucket }),
        localUploadsDir: null
      };
      break;
    }
  }
  await storage.reports.init();
  await storage.images.init();
  return storage;
}
