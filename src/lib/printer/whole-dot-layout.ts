/**
 * Whole-dot QR and barcode size at the job DPI (dotsPerMm, not dpi/25.4).
 * The stored box is shrink-wrapped to this ink size; drawers do not stretch.
 */

import { barcodeModulesForMode } from '@/lib/barcode-code128';
import { generateQrMatrix } from '@/printing/renderer/qrcode';
import type { LabelElement } from '@/lib/label-document';
import { dotsToMm, mmToDots } from '@/lib/printer/print-spec';

export const DEFAULT_LAYOUT_DPI = 304;

export type QrSquareLayout = {
  cell: number;
  totalModules: number;
  drawnDots: number;
  widthMm: number;
  heightMm: number;
};

export type BarcodeWidthLayout = {
  moduleDots: number;
  moduleCount: number;
  drawnDots: number;
  widthMm: number;
};

export type WholeDotBar = { x0: number; width: number };

export function wholeDotCell(boxDots: number, moduleCount: number): number {
  if (!(moduleCount > 0)) return 1;
  return Math.max(1, Math.floor(Math.max(1, boxDots) / moduleCount));
}

export function layoutQrSquareDots(options: {
  widthMm: number;
  heightMm: number;
  moduleCount: number;
  quietZone?: number;
  dpi: number;
}): QrSquareLayout {
  const qz = Math.max(0, options.quietZone ?? 0);
  const totalModules = options.moduleCount + qz * 2;
  const boxW = mmToDots(options.widthMm, options.dpi);
  const boxH = mmToDots(options.heightMm, options.dpi);
  const cell = wholeDotCell(Math.min(boxW, boxH), totalModules);
  const drawnDots = cell * totalModules;
  const widthMm = dotsToMm(drawnDots, options.dpi);
  return { cell, totalModules, drawnDots, widthMm, heightMm: widthMm };
}

export function layoutBarcodeWidthDots(options: {
  widthMm: number;
  moduleCount: number;
  dpi: number;
}): BarcodeWidthLayout {
  const boxW = mmToDots(options.widthMm, options.dpi);
  const moduleDots = wholeDotCell(boxW, options.moduleCount);
  const drawnDots = moduleDots * options.moduleCount;
  return {
    moduleDots,
    moduleCount: options.moduleCount,
    drawnDots,
    widthMm: dotsToMm(drawnDots, options.dpi),
  };
}

export function wholeDotBars(rawModules: number[], moduleDots: number): WholeDotBar[] {
  const out: WholeDotBar[] = [];
  let x = 0;
  const cell = Math.max(1, moduleDots);
  for (let i = 0; i < rawModules.length; i++) {
    const width = Math.max(0, rawModules[i]) * cell;
    if (i % 2 === 0 && width > 0) out.push({ x0: x, width });
    x += width;
  }
  return out;
}

function qrQuietZone(el: Extract<LabelElement, { type: 'qrcode' }>): number {
  return Math.max(0, parseInt(String(el.zoneSize), 10) || 0);
}

export function shrinkWrapQrElement(
  el: Extract<LabelElement, { type: 'qrcode' }>,
  dpi: number,
): Extract<LabelElement, { type: 'qrcode' }> {
  if (el.encodeMode && el.encodeMode !== 'QRCode') return el;
  const content =
    el.contentType === 'Data Source' && el.columnNameContent
      ? `{${el.columnNameContent}}`
      : el.content || 'https://example.com';
  const matrix = generateQrMatrix(content, (el.errorLevel as 'L' | 'M' | 'Q' | 'H') || 'M');
  if (!matrix) return el;
  const layout = layoutQrSquareDots({
    widthMm: el.width,
    heightMm: el.height,
    moduleCount: matrix.size,
    quietZone: qrQuietZone(el),
    dpi,
  });
  return { ...el, width: layout.widthMm, height: layout.heightMm };
}

export function shrinkWrapBarcodeElement(
  el: Extract<LabelElement, { type: 'barcode' }>,
  dpi: number,
): Extract<LabelElement, { type: 'barcode' }> {
  const content =
    el.contentType === 'Data Source' && el.columnNameContent
      ? `{${el.columnNameContent}}`
      : el.content || '0123456789';
  const raw = barcodeModulesForMode(el.encodeMode, content);
  if (!raw) return el;
  const moduleCount = raw.reduce((sum, m) => sum + m, 0);
  const layout = layoutBarcodeWidthDots({ widthMm: el.width, moduleCount, dpi });
  return { ...el, width: layout.widthMm };
}

export function shrinkWrapSymbolElement(el: LabelElement, dpi: number): LabelElement {
  if (el.type === 'qrcode') return shrinkWrapQrElement(el, dpi);
  if (el.type === 'barcode') return shrinkWrapBarcodeElement(el, dpi);
  return el;
}
