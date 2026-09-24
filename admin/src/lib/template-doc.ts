import { HttpError } from './http';

export function blankDocument(name: string, category: string, widthMm: number, heightMm: number) {
  return {
    id: 'new-template',
    name: name || 'Untitled',
    category: category || 'Retail',
    designWidth: widthMm,
    designHeight: heightMm,
    background: { type: 'color', color: '#FFFFFF' },
    layers: [],
  };
}

export function parseTemplateJson(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'That template file is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpError(400, 'Template data must be a JSON object.');
  }
  const doc = parsed as Record<string, unknown>;
  if (!Array.isArray(doc.layers)) {
    throw new HttpError(400, 'Template data needs a layers array. That is the format the editor saves.');
  }
  return doc;
}

export function normalizeDocument(
  raw: Record<string, unknown>,
  fields: { id: string; name: string; category: string; widthMm: number; heightMm: number },
) {
  return {
    ...raw,
    id: fields.id,
    name: fields.name,
    category: fields.category,
    designWidth: fields.widthMm,
    designHeight: fields.heightMm,
    background: raw.background ?? { type: 'color', color: '#FFFFFF' },
    layers: raw.layers,
  };
}

export function sizeFromDocument(doc: Record<string, unknown>): { widthMm?: number; heightMm?: number } {
  const width = typeof doc.designWidth === 'number' ? doc.designWidth : undefined;
  const height = typeof doc.designHeight === 'number' ? doc.designHeight : undefined;
  return { widthMm: width, heightMm: height };
}
