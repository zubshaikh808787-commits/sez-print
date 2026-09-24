import fs from 'fs/promises';
import path from 'path';
import { UPLOADS_DIR } from './files';
import { createInitial, sampleParts } from './seed';
import type { Database } from './types';

const FILE = path.join(process.cwd(), 'data', 'store.json');

let memory: Database | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function readFromDisk(): Promise<Database | null> {
  try {
    const raw = await fs.readFile(FILE, 'utf8');
    const parsed = JSON.parse(raw) as Database;
    if (!parsed || !Array.isArray(parsed.admins)) {
      throw new Error('Desk data is damaged. Remove admin/data/store.json and start again.');
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function persist(db: Database) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2));
  await fs.rename(tmp, FILE);
  memory = db;
}

async function load() {
  if (memory) return memory;
  const existing = await readFromDisk();
  if (existing) {
    memory = existing;
    return existing;
  }
  const created = await createInitial();
  await persist(created);
  return created;
}

export function read<T>(fn: (db: Database) => T): Promise<T> {
  const run = queue.then(async () => fn(await load()));
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function update<T>(fn: (db: Database) => Promise<T> | T): Promise<T> {
  const run = queue.then(async () => {
    const db = await load();
    const result = await fn(db);
    await persist(db);
    return result;
  });
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function resetSample() {
  return update(async (db) => {
    const parts = await sampleParts();
    const names = await fs.readdir(UPLOADS_DIR).catch(() => [] as string[]);
    const keep = new Set(parts.files);
    await Promise.all(
      names.filter((name) => !keep.has(name)).map((name) => fs.rm(path.join(UPLOADS_DIR, name), { force: true })),
    );
    db.devices = parts.devices;
    db.prints = parts.prints;
    db.templates = parts.templates;
    db.clipart = parts.clipart;
    db.stickers = parts.stickers;
    db.reviews = parts.reviews;
    db.suggestions = parts.suggestions;
    return { ok: true };
  });
}
