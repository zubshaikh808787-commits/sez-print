/**
 * Measured jewellery die-cut stock: 14 × 96 mm tags, 3 across a 54 mm sheet.
 *
 * Layout: 3 mm margin + 14 mm + 3 mm gap + 14 mm + 3 mm gap + 14 mm + 3 mm margin = 54 mm.
 * Printable body is the 64 mm rectangle (fold at 32 mm). Tail is die-cut only.
 *
 * Preview type ids stay `jew-rattail-single-12x100` / `jew-rattail-3row-54x100`
 * so saved labels still resolve; geometry comes from these constants.
 */

import { ptToMm, type LabelDocument, type LabelElement } from '@/lib/label-document';

export const JEWELRY_DIECUT = {
  tagWidthMm: 14,
  tagHeightMm: 96,
  bodyHeightMm: 64,
  foldYMm: 32,
  tailHeightMm: 32,
  tailWidthMm: 2.5,
  sheetWidthMm: 54,
  sheetHeightMm: 96,
  gapMm: 3,
  sideMarginMm: 3,
  columns: 3,
  /** Capture and print at 300 DPI (54 mm → 638 dots, 96 mm → 1134 dots). */
  printDpi: 300,
} as const;

/**
 * Type sized for the 14 mm tag — large enough to read, still one line per field.
 * Longest lines (karat / HUID) are slightly smaller than the title.
 *
 * Unfolded layout (y = 0 is the rounded body end, y = 64 is the tail):
 *   front inset → GOLD RING … price (even gaps) → barcode → fold at 32
 *   fold → SKU → HUID (packed against the midline) → empty space → tail
 */
export const JEWELRY_DIECUT_TYPE = {
  insetXMm: 0.55,
  frontInsetMm: 2.5,
  foldClearanceMm: 1.7,
  lineGapMm: 1.15,
  blockGapMm: 1.6,
  backLineGapMm: 1.15,
  contentBottomMm: 60,
  titlePt: 7,
  karatPt: 5.5,
  bodyPt: 6,
  pricePt: 7,
  skuPt: 6.5,
  huidPt: 6,
  barcodeHeightMm: 8,
} as const;

export type JewelryDieCutField =
  | 'title'
  | 'karat'
  | 'gr'
  | 'nt'
  | 'price'
  | 'barcode'
  | 'sku'
  | 'huid';

export const JEWELRY_DIECUT_PREVIEW_SINGLE = 'jew-rattail-single-12x100';
export const JEWELRY_DIECUT_PREVIEW_SHEET = 'jew-rattail-3row-54x100';

export const JEWELRY_DIECUT_PRINT_PRESET_3UP = 'jewellery-3up-diecut-54x100';
export const JEWELRY_DIECUT_PRINT_PRESET_SINGLE = 'jewellery-rattail-12x100';

/** 3 tags + 2 gaps, before side margins (14×3 + 3×2 = 48 mm). */
export function jewelryDieCutComposedWidthMm(): number {
  const { tagWidthMm, columns, gapMm } = JEWELRY_DIECUT;
  return tagWidthMm * columns + gapMm * (columns - 1);
}

/** Left edge of column `index` (0–2) on the 54 mm sheet. */
export function jewelryDieCutColumnX(index: number): number {
  const { sideMarginMm, tagWidthMm, gapMm } = JEWELRY_DIECUT;
  return sideMarginMm + index * (tagWidthMm + gapMm);
}

export function isJewelryDieCutPreviewType(previewType?: string | null): boolean {
  return (
    previewType === JEWELRY_DIECUT_PREVIEW_SINGLE || previewType === JEWELRY_DIECUT_PREVIEW_SHEET
  );
}

export function isNearMm(a: number, b: number, toleranceMm = 0.5): boolean {
  return Math.abs(a - b) < toleranceMm;
}

export function isJewelryDieCutDocument(doc?: {
  templatePreviewType?: string | null;
  templateCategory?: string | null;
  widthMm?: number;
  ups?: { columns: number } | null;
} | null): boolean {
  if (!doc) return false;
  if (isJewelryDieCutPreviewType(doc.templatePreviewType)) return true;
  const cat = doc.templateCategory?.toLowerCase() ?? '';
  if (
    doc.ups?.columns === JEWELRY_DIECUT.columns &&
    (cat.includes('jewel') || isNearMm(doc.widthMm ?? 0, JEWELRY_DIECUT.tagWidthMm))
  ) {
    return true;
  }
  return false;
}

function lineHeightMm(fontSizePt: number) {
  return Math.max(2.4, ptToMm(fontSizePt) * 1.25);
}

export function classifyJewelryDieCutField(el: LabelElement): JewelryDieCutField | null {
  if (el.type === 'barcode') return 'barcode';
  if (el.type !== 'text' && el.type !== 'degrees' && el.type !== 'time') return null;
  const raw = elementText(el).trim();
  if (/HUID/i.test(raw)) return 'huid';
  if (/SKU\s*:/i.test(raw) || /^RNG-/i.test(raw)) return 'sku';
  if (/₹|Rs\.?|MRP/i.test(raw)) return 'price';
  if (/^Gr\s*:/i.test(raw)) return 'gr';
  if (/^Nt\s*:/i.test(raw)) return 'nt';
  if (/\b(22K|18K|14K|916|750|585|BIS)\b/i.test(raw)) return 'karat';
  if (/GOLD|RING|CHAIN|BANGLE|PENDANT|EARRING/i.test(raw)) return 'title';
  return null;
}

export function jewelryDieCutFieldTops(heights: Record<JewelryDieCutField, number>) {
  const fold = JEWELRY_DIECUT.foldYMm;
  const t = JEWELRY_DIECUT_TYPE;

  // Barcode sits in the front half, just above the fold (below the dotted line
  // when the tail is viewed at the top of the hang tag).
  const barcodeTop = fold - t.foldClearanceMm - heights.barcode;
  let y = barcodeTop - t.blockGapMm - heights.price;
  const price = y;
  y -= t.lineGapMm + heights.nt;
  const nt = y;
  y -= t.lineGapMm + heights.gr;
  const gr = y;
  y -= t.lineGapMm + heights.karat;
  const karat = y;
  y -= t.lineGapMm + heights.title;
  const title = y;
  const shift = Math.max(0, t.frontInsetMm - title);

  const sku = fold + t.foldClearanceMm;
  const huid = sku + heights.sku + t.backLineGapMm;
  const usedShift = Math.min(
    shift,
    Math.max(0, fold - t.foldClearanceMm - heights.barcode - barcodeTop),
  );

  return {
    title: title + usedShift,
    karat: karat + usedShift,
    gr: gr + usedShift,
    nt: nt + usedShift,
    price: price + usedShift,
    barcode: barcodeTop + usedShift,
    sku,
    huid,
  };
}

function textWidthMm(text: string, fontSizePt: number, bold?: boolean) {
  const emMm = ptToMm(fontSizePt);
  const advance = bold ? 0.56 : 0.5;
  return Math.max(1, text.replace(/\s/g, ' ').length) * emMm * advance;
}

/** Largest pt that keeps `text` on one line inside `widthMm`. Grows small type up to `maxPt`. */
export function jewelryDieCutFontToFit(
  text: string,
  widthMm: number,
  bold: boolean | undefined,
  currentPt: number,
  maxPt = 8,
  minPt = 5.5,
) {
  const usable = Math.max(3, widthMm * 0.97);
  let pt = Math.min(maxPt, Math.max(minPt, currentPt));
  while (pt > 4 && textWidthMm(text, pt, bold) > usable) {
    pt -= 0.25;
  }
  while (pt + 0.25 <= maxPt && textWidthMm(text, pt + 0.25, bold) <= usable) {
    pt += 0.25;
  }
  return Math.max(4, Math.round(pt * 4) / 4);
}

function elementText(el: LabelElement): string {
  if (el.type === 'text') return String(el.text ?? '');
  if (el.type === 'degrees' || el.type === 'time' || el.type === 'barcode') {
    return String('content' in el ? el.content ?? '' : '');
  }
  return '';
}

/** Left edge of the 14 mm tag that contains `centerX` on this document. */
export function jewelryDieCutColumnOriginMm(centerX: number, docWidthMm: number): number {
  const { tagWidthMm, gapMm, columns, sheetWidthMm } = JEWELRY_DIECUT;
  const origins: number[] = [];
  if (docWidthMm >= sheetWidthMm - 1) {
    for (let i = 0; i < columns; i++) origins.push(jewelryDieCutColumnX(i));
  } else if (docWidthMm >= jewelryDieCutComposedWidthMm() - 1) {
    for (let i = 0; i < columns; i++) origins.push(i * (tagWidthMm + gapMm));
  } else {
    origins.push(0);
  }
  let best = origins[0] ?? 0;
  let bestDist = Infinity;
  for (const origin of origins) {
    const dist = Math.abs(centerX - (origin + tagWidthMm / 2));
    if (dist < bestDist) {
      bestDist = dist;
      best = origin;
    }
  }
  return best;
}

function centeredInColumn(el: LabelElement, docWidthMm: number) {
  const origin = jewelryDieCutColumnOriginMm(el.left + el.width / 2, docWidthMm);
  const inset = JEWELRY_DIECUT_TYPE.insetXMm;
  const width = JEWELRY_DIECUT.tagWidthMm - inset * 2;
  return { left: origin + inset, width };
}

/**
 * Fit type to the 14 mm tag, center every printable field, and restack
 * so SKU/HUID sit on the tail side of the fold and the barcode sits just
 * below the dotted line on the product side.
 */
export function refitJewelryDieCutDocument(doc: LabelDocument): LabelDocument {
  const { tagWidthMm } = JEWELRY_DIECUT;
  const t = JEWELRY_DIECUT_TYPE;
  const prepared = doc.elements.map((el) => {
    if (el.needPrinting === false) return el;
    if (el.width > tagWidthMm + 0.6) return el;
    const box = centeredInColumn(el, doc.widthMm);
    const field = classifyJewelryDieCutField(el);

    if (el.type === 'text' || el.type === 'degrees' || el.type === 'time') {
      const raw = elementText(el);
      const maxPt =
        field === 'title' || field === 'price' ? t.titlePt : field === 'karat' ? t.karatPt + 0.25 : 7.5;
      const fontSize = jewelryDieCutFontToFit(raw, box.width, true, Math.max(el.fontSize, t.bodyPt), maxPt);
      return {
        ...el,
        ...box,
        fontSize,
        height: lineHeightMm(fontSize),
        align: 'center' as const,
        autoWrapping: 'Close' as const,
        bold: true,
      };
    }

    if (el.type === 'barcode') {
      return {
        ...el,
        ...box,
        height: t.barcodeHeightMm,
        textFlag: 'Hide' as const,
      };
    }

    return { ...el, ...box };
  });

  const heights: Record<JewelryDieCutField, number> = {
    title: lineHeightMm(t.titlePt),
    karat: lineHeightMm(t.karatPt),
    gr: lineHeightMm(t.bodyPt),
    nt: lineHeightMm(t.bodyPt),
    price: lineHeightMm(t.pricePt),
    barcode: t.barcodeHeightMm,
    sku: lineHeightMm(t.skuPt),
    huid: lineHeightMm(t.huidPt),
  };
  for (const el of prepared) {
    const field = classifyJewelryDieCutField(el);
    if (!field) continue;
    const h =
      field === 'barcode'
        ? t.barcodeHeightMm
        : 'height' in el
          ? Number(el.height) || heights[field]
          : heights[field];
    heights[field] = h;
  }
  const tops = jewelryDieCutFieldTops(heights);

  const elements = prepared.map((el) => {
    const field = classifyJewelryDieCutField(el);
    if (!field) return el;
    return { ...el, top: tops[field] };
  });

  return { ...doc, elements };
}
