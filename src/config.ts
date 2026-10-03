import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const STORAGE_DRIVERS = ['local', 'postgres', 'supabase'] as const;
export type StorageDriver = (typeof STORAGE_DRIVERS)[number];

/**
 * STORAGE_DRIVER is the single switch between storage engines:
 * - local:    SQLite file + photos on disk (default, zero setup)
 * - postgres: any PostgreSQL via DATABASE_URL + photos on disk
 * - supabase: Supabase Postgres via DATABASE_URL + photos in Supabase Storage
 */
export type StorageConfig =
  | { driver: 'local'; sqlitePath: string; uploadsDir: string }
  | { driver: 'postgres'; databaseUrl: string; caCertPath: string | null; uploadsDir: string }
  | { driver: 'supabase'; databaseUrl: string; caCertPath: string | null; supabaseUrl: string; serviceRoleKey: string; bucket: string };

export interface AssistantConfig {
  apiKey: string | null;
  model: string;
}

export interface RoutingConfig {
  /** The segnalazioni_ai dispatch service. Null disables routing entirely. */
  baseUrl: string | null;
}

export interface TranscriptionConfig {
  groqApiKey: string | null;
  model: string;
}

export interface AppConfig {
  host: string;
  port: number;
  storage: StorageConfig;
  assistant: AssistantConfig;
  transcription: TranscriptionConfig;
  routing: RoutingConfig;
}

type Env = Record<string, string | undefined>;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function value(env: Env, key: string): string | undefined {
  const raw = env[key]?.trim();
  return raw ? raw : undefined;
}

function required(env: Env, key: string, driver: StorageDriver): string {
  const raw = value(env, key);
  if (!raw) throw new ConfigError(`${key} is required when STORAGE_DRIVER=${driver}.`);
  return raw;
}

function resolveFromRoot(file: string): string {
  return path.isAbsolute(file) ? file : path.join(PROJECT_ROOT, file);
}

export function loadStorageConfig(env: Env = process.env): StorageConfig {
  const driver = value(env, 'STORAGE_DRIVER') ?? 'local';
  const uploadsDir = resolveFromRoot(value(env, 'UPLOADS_DIR') ?? 'data/uploads');
  const caCert = value(env, 'DATABASE_CA_CERT');
  const caCertPath = caCert ? resolveFromRoot(caCert) : null;
  switch (driver) {
    case 'local':
      return { driver, uploadsDir, sqlitePath: resolveFromRoot(value(env, 'SQLITE_PATH') ?? 'data/segnalami.db') };
    case 'postgres':
      return { driver, uploadsDir, caCertPath, databaseUrl: required(env, 'DATABASE_URL', driver) };
    case 'supabase': {
      const supabaseUrl = required(env, 'SUPABASE_URL', driver).replace(/\/+$/, '');
      if (!/^https:\/\//.test(supabaseUrl)) throw new ConfigError('SUPABASE_URL must start with https://.');
      return {
        driver,
        supabaseUrl,
        databaseUrl: required(env, 'DATABASE_URL', driver),
        caCertPath,
        serviceRoleKey: required(env, 'SUPABASE_SERVICE_ROLE_KEY', driver),
        bucket: value(env, 'SUPABASE_BUCKET') ?? 'report-images'
      };
    }
    default:
      throw new ConfigError(`STORAGE_DRIVER must be one of ${STORAGE_DRIVERS.join(', ')}; got "${driver}".`);
  }
}

export function loadConfig(env: Env = process.env): AppConfig {
  const port = Number(value(env, 'PORT') ?? 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new ConfigError('PORT must be an integer between 0 and 65535.');
  return {
    host: value(env, 'HOST') ?? '127.0.0.1',
    port,
    storage: loadStorageConfig(env),
    assistant: { apiKey: value(env, 'ANTHROPIC_API_KEY') ?? null, model: value(env, 'CLAUDE_MODEL') ?? 'claude-opus-5' },
    transcription: { groqApiKey: value(env, 'GROQ_API_KEY') ?? null, model: value(env, 'GROQ_WHISPER_MODEL') ?? 'whisper-large-v3-turbo' },
    routing: { baseUrl: loadRoutingUrl(env) }
  };
}

/** A typo'd URL would otherwise fail silently on every single report, so fail at boot instead. */
function loadRoutingUrl(env: Env): string | null {
  const raw = value(env, 'ROUTING_URL');
  if (!raw) return null;
  try {
    return new URL(raw).toString();
  } catch {
    throw new ConfigError(`ROUTING_URL must be a valid URL; got "${raw}".`);
  }
}
