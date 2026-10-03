import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ImageStore, StoredImage } from './types.ts';

export const LOCAL_UPLOADS_ROUTE = '/uploads';
const FILE_PATTERN = /^[0-9a-f-]{36}\.jpg$/;

/** Stores photos as files and serves them from LOCAL_UPLOADS_ROUTE. */
export class LocalImageStore implements ImageStore {
  readonly publicOrigin = null;
  readonly #dir: string;

  constructor(dir: string) {
    this.#dir = dir;
  }

  get directory(): string {
    return this.#dir;
  }

  async init(): Promise<void> {
    await mkdir(this.#dir, { recursive: true });
  }

  async save(jpeg: Buffer): Promise<StoredImage> {
    const name = `${randomUUID()}.jpg`;
    await writeFile(path.join(this.#dir, name), jpeg, { mode: 0o600, flag: 'wx' });
    return { url: `${LOCAL_UPLOADS_ROUTE}/${name}` };
  }

  async remove(url: string): Promise<void> {
    const name = url.slice(LOCAL_UPLOADS_ROUTE.length + 1);
    if (!url.startsWith(`${LOCAL_UPLOADS_ROUTE}/`) || !FILE_PATTERN.test(name)) return;
    await rm(path.join(this.#dir, name), { force: true });
  }
}
