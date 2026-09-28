import type { LabelDocument, LabelElement } from '@/lib/label-document';
import { ptToMm } from '@/lib/label-document';
import { dotsPerMm, mmToDots } from '@/lib/printer/print-spec';
import { regionDiffPercent, inkBoundingBox, type InkBBox } from './tspl-wire';

export type DiffRegion = {
  id: string;
  kind: 'text' | 'bars' | 'digits' | 'border' | 'qr' | 'full';
  percent: number;
  pixels: number;
  differing: number;
};

export function elementBox(el: LabelElement, dpi: number): { x: number; y: number; w: number; h: number } {
  const x = mmToDots(el.left, dpi);
  const y = mmToDots(el.top, dpi);
  const w = Math.max(1, mmToDots(el.left + el.width, dpi) - x);
  const h = Math.max(1, mmToDots(el.top + ('height' in el ? Number(el.height) || 8 : 8), dpi) - y);
  return { x, y, w, h };
}

export function isolateDocument(doc: LabelDocument, type: LabelElement['type']): LabelDocument | null {
  const elements = doc.elements.filter((el) => el.type === type);
  if (elements.length === 0) return null;
  return { ...doc, elements };
}

export function rnTextFontProbe(el: Extract<LabelElement, { type: 'text' }>, dpi: number) {
  const dpm = dotsPerMm(dpi);
  return {
    id: el.id,
    family: el.fontFamily && el.fontFamily !== 'Default' ? el.fontFamily : 'system-default',
    weight: el.bold ? 'bold' : 'normal',
    pixelSize: Math.max(1, Math.round(ptToMm(el.fontSize) * dpm)),
    requestedFamily: el.fontFamily,
  };
}

export function barcodeDigitBox(el: Extract<LabelElement, { type: 'barcode' }>, dpi: number) {
  const dpm = dotsPerMm(dpi);
  const box = elementBox(el, dpi);
  const fontH = Math.max(8, Math.round(ptToMm(el.fontSize) * dpm));
  const labelH = el.textFlag === 'Hide' ? 0 : Math.max(8, Math.round(fontH * 1.2));
  const barsH = Math.max(2, box.h - labelH);
  return {
    bars: { x: box.x, y: el.textFlag === 'Top' ? box.y + labelH : box.y, w: box.w, h: barsH },
    digits: { x: box.x, y: el.textFlag === 'Top' ? box.y : box.y + barsH, w: box.w, h: labelH || 1 },
  };
}

export function diffDocumentRegions(
  pngGray: Uint8Array,
  monoGray: Uint8Array,
  width: number,
  height: number,
  doc: LabelDocument,
  dpi: number,
  threshold = 160,
): DiffRegion[] {
  const full = regionDiffPercent(pngGray, monoGray, width, { x: 0, y: 0, w: width, h: height }, threshold);
  const rows: DiffRegion[] = [
    { id: 'full', kind: 'full', ...full },
  ];
  for (const el of doc.elements) {
    if (el.type === 'text') {
      const box = elementBox(el, dpi);
      rows.push({ id: el.id, kind: 'text', ...regionDiffPercent(pngGray, monoGray, width, box, threshold) });
    } else if (el.type === 'barcode') {
      const { bars, digits } = barcodeDigitBox(el, dpi);
      rows.push({ id: `${el.id}:bars`, kind: 'bars', ...regionDiffPercent(pngGray, monoGray, width, bars, threshold) });
      rows.push({ id: `${el.id}:digits`, kind: 'digits', ...regionDiffPercent(pngGray, monoGray, width, digits, threshold) });
    } else if (el.type === 'qrcode') {
      rows.push({
        id: el.id,
        kind: 'qr',
        ...regionDiffPercent(pngGray, monoGray, width, elementBox(el, dpi), threshold),
      });
    } else if (el.type === 'border') {
      rows.push({
        id: el.id,
        kind: 'border',
        ...regionDiffPercent(pngGray, monoGray, width, elementBox(el, dpi), threshold),
      });
    }
  }
  return rows;
}

export function textInkOffsets(
  pngGray: Uint8Array,
  monoGray: Uint8Array,
  width: number,
  height: number,
  doc: LabelDocument,
  dpi: number,
): { id: string; png: InkBBox; mono: InkBBox; dx: number | null; dy: number | null }[] {
  const out: { id: string; png: InkBBox; mono: InkBBox; dx: number | null; dy: number | null }[] = [];
  for (const el of doc.elements) {
    if (el.type !== 'text') continue;
    const box = elementBox(el, dpi);
    const png = inkBoundingBox(pngGray, width, height, box);
    const mono = inkBoundingBox(monoGray, width, height, box);
    out.push({
      id: el.id,
      png,
      mono,
      dx: png && mono ? mono.x0 - png.x0 : null,
      dy: png && mono ? mono.y0 - png.y0 : null,
    });
  }
  return out;
}
