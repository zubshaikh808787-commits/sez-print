import { removeUpload, saveUpload } from '@/lib/files';
import { requireRole } from '@/lib/guard';
import { fail, HttpError, json } from '@/lib/http';
import { update } from '@/lib/store';
import type { AssetKind } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RULES: Record<AssetKind, string[]> = {
  clipart: ['.svg', '.png'],
  sticker: ['.png', '.webp'],
};

type Ctx = { params: Promise<{ id: string }> };

function locate(db: { clipart: { id: string }[]; stickers: { id: string }[] }, id: string) {
  if (db.clipart.some((item) => item.id === id)) return 'clipart' as const;
  if (db.stickers.some((item) => item.id === id)) return 'sticker' as const;
  return null;
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    await requireRole('editor');
    const { id } = await ctx.params;
    const form = await request.formData();
    const name = String(form.get('name') ?? '').trim();
    if (!name) throw new HttpError(400, 'Add a name.');
    const asset = await update(async (db) => {
      const kind = locate(db, id);
      if (!kind) throw new HttpError(404, 'That file is not in the library.');
      const list = kind === 'clipart' ? db.clipart : db.stickers;
      const current = list.find((item) => item.id === id)!;
      const file = form.get('file');
      if (file instanceof File && file.size > 0) {
        const saved = await saveUpload(file, RULES[kind]);
        await removeUpload(current.fileUrl);
        current.fileUrl = saved.url;
        current.mime = saved.mime;
      }
      current.name = name;
      return current;
    });
    return json({ asset });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    await requireRole('editor');
    const { id } = await ctx.params;
    await update(async (db) => {
      const kind = locate(db, id);
      if (!kind) throw new HttpError(404, 'That file is not in the library.');
      const list = kind === 'clipart' ? db.clipart : db.stickers;
      const index = list.findIndex((item) => item.id === id);
      const [removed] = list.splice(index, 1);
      await removeUpload(removed.fileUrl);
      return { ok: true };
    });
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
