import { saveUpload } from '@/lib/files';
import { requireRole } from '@/lib/guard';
import { fail, HttpError, json } from '@/lib/http';
import { nid } from '@/lib/format';
import { read, update } from '@/lib/store';
import type { Asset, AssetKind } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RULES: Record<AssetKind, string[]> = {
  clipart: ['.svg', '.png'],
  sticker: ['.png', '.webp'],
};

function kindOf(value: string): AssetKind {
  if (value === 'clipart' || value === 'sticker') return value;
  throw new HttpError(400, 'Pick clipart or a sticker.');
}

export async function GET() {
  try {
    await requireRole('viewer');
    const data = await read((db) => ({ clipart: db.clipart, stickers: db.stickers }));
    return json(data);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireRole('editor');
    const form = await request.formData();
    const name = String(form.get('name') ?? '').trim();
    const kind = kindOf(String(form.get('kind') ?? ''));
    const file = form.get('file');
    if (!name) throw new HttpError(400, 'Add a name.');
    if (!(file instanceof File) || file.size === 0) throw new HttpError(400, 'Add a file.');
    const saved = await saveUpload(file, RULES[kind]);
    const asset = await update((db) => {
      const created: Asset = {
        id: nid(kind === 'clipart' ? 'clp' : 'stk'),
        kind,
        name,
        fileUrl: saved.url,
        mime: saved.mime,
        createdAt: new Date().toISOString(),
      };
      (kind === 'clipart' ? db.clipart : db.stickers).unshift(created);
      return created;
    });
    return json({ asset }, 201);
  } catch (error) {
    return fail(error);
  }
}
