import { randomUUID } from 'node:crypto';
import type { ImageStore, StoredImage } from './types.ts';

interface SupabaseStorageOptions {
  url: string;
  serviceRoleKey: string;
  bucket: string;
}

/** Supabase Storage over its REST API. The bucket is created as public on first start if missing. */
export class SupabaseImageStore implements ImageStore {
  readonly publicOrigin: string;
  readonly #url: string;
  readonly #key: string;
  readonly #bucket: string;

  constructor({ url, serviceRoleKey, bucket }: SupabaseStorageOptions) {
    if (!/^[a-z0-9][a-z0-9_-]{1,62}$/.test(bucket)) throw new Error(`Invalid Supabase bucket name: ${bucket}`);
    this.#url = url;
    this.#key = serviceRoleKey;
    this.#bucket = bucket;
    this.publicOrigin = new URL(url).origin;
  }

  #headers(extra: Record<string, string> = {}): Record<string, string> {
    return { apikey: this.#key, Authorization: `Bearer ${this.#key}`, ...extra };
  }

  async init(): Promise<void> {
    const existing = await fetch(`${this.#url}/storage/v1/bucket/${this.#bucket}`, { headers: this.#headers(), signal: AbortSignal.timeout(10_000) });
    if (existing.ok) return;
    const created = await fetch(`${this.#url}/storage/v1/bucket`, {
      method: 'POST',
      headers: this.#headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id: this.#bucket, name: this.#bucket, public: true, file_size_limit: 5 * 1024 * 1024, allowed_mime_types: ['image/jpeg'] }),
      signal: AbortSignal.timeout(10_000)
    });
    // 409: another instance created it in the meantime.
    if (!created.ok && created.status !== 409) {
      throw new Error(`Supabase Storage bucket "${this.#bucket}" is unavailable (HTTP ${created.status}). Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.`);
    }
  }

  async save(jpeg: Buffer): Promise<StoredImage> {
    const objectPath = `reports/${randomUUID()}.jpg`;
    const response = await fetch(`${this.#url}/storage/v1/object/${this.#bucket}/${objectPath}`, {
      method: 'POST',
      headers: this.#headers({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=31536000', 'x-upsert': 'false' }),
      body: new Uint8Array(jpeg),
      signal: AbortSignal.timeout(20_000)
    });
    if (!response.ok) throw new Error(`Supabase Storage upload failed (HTTP ${response.status}).`);
    return { url: `${this.#url}/storage/v1/object/public/${this.#bucket}/${objectPath}` };
  }

  async remove(url: string): Promise<void> {
    const prefix = `${this.#url}/storage/v1/object/public/${this.#bucket}/`;
    if (!url.startsWith(prefix)) return;
    await fetch(`${this.#url}/storage/v1/object/${this.#bucket}`, {
      method: 'DELETE',
      headers: this.#headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefixes: [url.slice(prefix.length)] }),
      signal: AbortSignal.timeout(10_000)
    });
  }
}
