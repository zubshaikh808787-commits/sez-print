import fs from 'fs/promises';
import path from 'path';
import { HttpError } from './http';

export const DATA_DIR = path.join(process.cwd(), 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

const MIME: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

export function mediaUrl(name: string) {
  return `/api/media/${name}`;
}

export async function ensureUploads() {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

export async function writeTextFile(name: string, contents: string) {
  await ensureUploads();
  await fs.writeFile(path.join(UPLOADS_DIR, name), contents);
  return mediaUrl(name);
}

export async function saveUpload(file: File, allowed: string[]) {
  const ext = path.extname(file.name).toLowerCase();
  if (!allowed.includes(ext) || !MIME[ext]) {
    throw new HttpError(400, `Use a ${allowed.join(', ')} file.`);
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new HttpError(400, 'Keep files under 8 MB.');
  }
  const mime = MIME[ext];
  if (file.type && file.type !== 'application/octet-stream' && file.type !== mime) {
    throw new HttpError(400, `That file does not look like a ${ext} image.`);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (ext === '.svg') {
    const text = bytes.toString('utf8');
    if (!text.includes('<svg') || /<script|javascript:|onload=/i.test(text)) {
      throw new HttpError(400, 'That SVG is not allowed.');
    }
  }
  await ensureUploads();
  const name = `file_${crypto.randomUUID().slice(0, 8)}${ext}`;
  await fs.writeFile(path.join(UPLOADS_DIR, name), bytes);
  return { name, url: mediaUrl(name), mime };
}

export async function removeUpload(url: string) {
  const name = url.split('/').pop() ?? '';
  if (!/^[\w.-]+$/.test(name) || name.startsWith('seed-')) return;
  await fs.rm(path.join(UPLOADS_DIR, name), { force: true });
}

export function mimeFor(name: string) {
  return MIME[path.extname(name).toLowerCase()] ?? null;
}
