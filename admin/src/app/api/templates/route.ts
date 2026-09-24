import { saveUpload } from '@/lib/files';
import { requireRole } from '@/lib/guard';
import { fail, HttpError, json } from '@/lib/http';
import { nid } from '@/lib/format';
import { read, update } from '@/lib/store';
import { normalizeDocument, parseTemplateJson } from '@/lib/template-doc';
import type { Template, TemplateStatus } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function readFields(form: FormData) {
  const text = (key: string) => {
    const value = form.get(key);
    return typeof value === 'string' ? value.trim() : '';
  };
  const widthMm = Number(text('widthMm'));
  const heightMm = Number(text('heightMm'));
  if (!text('name')) throw new HttpError(400, 'Add a name.');
  if (!text('category')) throw new HttpError(400, 'Add a category.');
  if (!(widthMm >= 5 && widthMm <= 500) || !(heightMm >= 5 && heightMm <= 500)) {
    throw new HttpError(400, 'Width and height should be between 5 and 500 mm.');
  }
  const status = text('status') === 'draft' ? 'draft' : 'published';
  return {
    name: text('name'),
    category: text('category'),
    widthMm,
    heightMm,
    status: status as TemplateStatus,
    featured: text('featured') === 'true',
    document: parseTemplateJson(text('document') || '{}'),
    preview: form.get('preview'),
  };
}

export async function GET() {
  try {
    await requireRole('viewer');
    const templates = await read((db) => db.templates);
    return json({ templates });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireRole('editor');
    const fields = readFields(await request.formData());
    if (!(fields.preview instanceof File) || fields.preview.size === 0) {
      throw new HttpError(400, 'Add a preview image. PNG, JPG, or WebP.');
    }
    const saved = await saveUpload(fields.preview, ['.png', '.jpg', '.jpeg', '.webp']);
    const template = await update((db) => {
      const created: Template = {
        id: nid('tpl'),
        name: fields.name,
        category: fields.category,
        widthMm: fields.widthMm,
        heightMm: fields.heightMm,
        previewUrl: saved.url,
        document: normalizeDocument(fields.document, {
          id: 'pending',
          name: fields.name,
          category: fields.category,
          widthMm: fields.widthMm,
          heightMm: fields.heightMm,
        }),
        status: fields.status,
        featured: fields.featured,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      created.document = { ...created.document, id: created.id };
      db.templates.unshift(created);
      return created;
    });
    return json({ template }, 201);
  } catch (error) {
    return fail(error);
  }
}
