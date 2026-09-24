import { removeUpload, saveUpload } from '@/lib/files';
import { requireRole } from '@/lib/guard';
import { fail, HttpError, json } from '@/lib/http';
import { update } from '@/lib/store';
import { normalizeDocument, parseTemplateJson } from '@/lib/template-doc';
import type { TemplateStatus } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    await requireRole('editor');
    const { id } = await ctx.params;
    const contentType = request.headers.get('content-type') ?? '';
    const template = await update(async (db) => {
      const current = db.templates.find((item) => item.id === id);
      if (!current) throw new HttpError(404, 'That template is not in the library.');
      if (contentType.includes('application/json')) {
        const body = (await request.json()) as { featured?: boolean; status?: TemplateStatus };
        if (typeof body.featured === 'boolean') current.featured = body.featured;
        if (body.status === 'draft' || body.status === 'published') current.status = body.status;
        current.updatedAt = new Date().toISOString();
        return current;
      }
      const form = await request.formData();
      const text = (key: string) => {
        const value = form.get(key);
        return typeof value === 'string' ? value.trim() : '';
      };
      const widthMm = Number(text('widthMm'));
      const heightMm = Number(text('heightMm'));
      if (!text('name') || !text('category')) throw new HttpError(400, 'Name and category are required.');
      if (!(widthMm >= 5 && widthMm <= 500) || !(heightMm >= 5 && heightMm <= 500)) {
        throw new HttpError(400, 'Width and height should be between 5 and 500 mm.');
      }
      const preview = form.get('preview');
      if (preview instanceof File && preview.size > 0) {
        const saved = await saveUpload(preview, ['.png', '.jpg', '.jpeg', '.webp']);
        await removeUpload(current.previewUrl);
        current.previewUrl = saved.url;
      }
      current.name = text('name');
      current.category = text('category');
      current.widthMm = widthMm;
      current.heightMm = heightMm;
      current.status = text('status') === 'draft' ? 'draft' : 'published';
      current.featured = text('featured') === 'true';
      current.document = normalizeDocument(parseTemplateJson(text('document') || '{}'), {
        id: current.id,
        name: current.name,
        category: current.category,
        widthMm,
        heightMm,
      });
      current.updatedAt = new Date().toISOString();
      return current;
    });
    return json({ template });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    await requireRole('editor');
    const { id } = await ctx.params;
    await update(async (db) => {
      const index = db.templates.findIndex((item) => item.id === id);
      if (index < 0) throw new HttpError(404, 'That template is not in the library.');
      const [removed] = db.templates.splice(index, 1);
      await removeUpload(removed.previewUrl);
      return { ok: true };
    });
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
