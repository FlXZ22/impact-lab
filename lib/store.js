import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

export function createStore(file) {
  let queue = Promise.resolve();
  async function read() { return JSON.parse(await readFile(file, 'utf8')); }
  async function write(rows) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(`${file}.tmp`, JSON.stringify(rows, null, 2), { mode: 0o600 });
    await rename(`${file}.tmp`, file);
  }
  return {
    async init() { try { await read(); } catch (error) { if (error.code !== 'ENOENT') throw error; await write(JSON.parse(await readFile(new URL('../data/seeds.json', import.meta.url), 'utf8'))); } },
    read,
    update(fn) {
      const next = queue.then(async () => { const rows = await read(); const result = fn(rows); await write(rows); return result; });
      queue = next.catch(() => {}); return next;
    }
  };
}
