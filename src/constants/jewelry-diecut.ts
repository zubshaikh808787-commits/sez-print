/**
 * Measured jewellery die-cut stock (vendor schematic):
 * 14 × 96 mm tags, 3 across a 54 × 96 mm sheet.
 *
 * Layout: 3 mm margin + 14 mm + 3 mm gap + 14 mm + 3 mm gap + 14 mm + 3 mm margin = 54 mm.
 * Printable body is the 64 mm rectangle (fold at 32 mm). Tail is 32 mm die-cut only.
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
  /** Inter-column gap from schematic (not 0.3 — 3 + 14×3 + 3×2 margins = 54). */
  gapMm: 3,
  sideMarginMm: 3,
  columns: 3,
  /** Prefer printer native DPI for capture. 304 is retained for high-res heads only. */
  printDpi: 304,
} as const;

/** 2-up sheet: 3 + 14 + 3 + 14 + 3 = 37 mm. */
export const JEWELRY_DIECUT_2UP_SHEET_WIDTH_MM =
  JEWELRY_DIECUT.sideMarginMm * 2 +
  JEWELRY_DIECUT.tagWidthMm * 2 +
  JEWELRY_DIECUT.gapMm;

/**
 * Type sized for the 14 mm tag — large enough to read, still one line per field.
 * Longest lines (karat / HUID) are slightly smaller than the title.
 *
 * Unfolded layout (y = 0 is the rounded body end, y = 64 is the tail):
 *   front inset → GOLD RING … price (even gaps) → barcode → fold at 32
 *   fold → SKU → HUID (packed against the midline) → empty space → tail
 */
export const JEWELRY_DIECUT_TYPE = {
  insetXMm: 1.15,
  /** Keep title clear of the rounded die-cut tip (preview + physical). */
  frontInsetMm: 5.5,
  foldClearanceMm: 2.2,
  lineGapMm: 1.1,
  blockGapMm: 1.55,
  backLineGapMm: 1.05,
  contentBottomMm: 60,
  titlePt: 6.5,
  karatPt: 5.25,
  bodyPt: 5.75,
  pricePt: 6.5,
  skuPt: 6,
  huidPt: 5.75,
  barcodeHeightMm: 7.2,
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

/** Front-of-fold stack order (product face). */
const FRONT_FIELD_ORDER: JewelryDieCutField[] = [
  'title',
  'karat',
  'gr',
  'nt',
  'price',
  'barcode',
];
/** Back-of-fold stack order (tail face). */
const BACK_FIELD_ORDER: JewelryDieCutField[] = ['sku', 'huid'];

export const JEWELRY_DIECUT_PREVIEW_SINGLE = 'jew-rattail-single-12x100';
export const JEWELRY_DIECUT_PREVIEW_SHEET = 'jew-rattail-3row-54x100';

export const JEWELRY_DIECUT_PRINT_PRESET_3UP = 'jewellery-3up-diecut-54x100';
export const JEWELRY_DIECUT_PRINT_PRESET_2UP = 'jewellery-2up-diecut-37x96';
export const JEWELRY_DIECUT_PRINT_PRESET_SINGLE = 'jewellery-rattail-12x100';

/** 3 tags + 2 gaps, before side margins (14×3 + 3×2 = 48 mm). */
export function jewelryDieCutComposedWidthMm(): number {
  const { tagWidthMm, columns, gapMm } = JEWELRY_DIECUT;
  return tagWidthMm * columns + gapMm * (columns - 1);
}

/** Left edge of column `index` (0–2) on the 54 mm sheet (3 / 20 / 37 mm). */
export function jewelryDieCutColumnX(index: number): number {
  const { sideMarginMm, tagWidthMm, gapMm } = JEWELRY_DIECUT;
  return sideMarginMm + index * (tagWidthMm + gapMm);
}

/**
 * True when the document is one 14 mm tag (or a 48 mm UPS compose that only
 * filled the left panel). 3-up print must copy that tag to all three columns
 * instead of left-padding a half-empty strip.
 */
export function jewelryDieCutContentIsSingleTag(doc: {
  widthMm: number;
  elements: { left: number; width: number }[];
}): boolean {
  if (isNearMm(doc.widthMm, JEWELRY_DIECUT.sheetWidthMm)) return false;
  if (isNearMm(doc.widthMm, JEWELRY_DIECUT.tagWidthMm)) return true;
  const maxRight = doc.elements.reduce((max, el) => Math.max(max, el.left + el.width), 0);
  return maxRight <= JEWELRY_DIECUT.tagWidthMm + 1.5;
}

export function isJewelryDieCutPreviewType(previewType?: string | null): boolean {
  return (
    previewType === JEWELRY_DIECUT_PREVIEW_SINGLE ||
    previewType === JEWELRY_DIECUT_PREVIEW_SHEET ||
    previewType === 'jew-label-46x100' ||
    previewType === 'jew-rattail-3row-14x100' ||
    previewType === 'jew-rattail-3row-55x80' ||
    (Boolean(previewType) && previewType!.startsWith('jew-rattail-3row'))
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

export function jewelryDieCutFieldTops(
  heights: Record<JewelryDieCutField, number>,
  presentFields?: readonly JewelryDieCutField[],
) {
  const fold = JEWELRY_DIECUT.foldYMm;
  const t = JEWELRY_DIECUT_TYPE;
  const present = presentFields?.length ? new Set(presentFields) : null;

  const front = FRONT_FIELD_ORDER.filter(
    (f) => (!present || present.has(f)) && (heights[f] ?? 0) > 0,
  );
  const back = BACK_FIELD_ORDER.filter(
    (f) => (!present || present.has(f)) && (heights[f] ?? 0) > 0,
  );

  const tops: Record<JewelryDieCutField, number> = {
    title: t.frontInsetMm,
    karat: t.frontInsetMm,
    gr: t.frontInsetMm,
    nt: t.frontInsetMm,
    price: t.frontInsetMm,
    barcode: fold - t.foldClearanceMm - (heights.barcode || t.barcodeHeightMm),
    sku: fold + t.foldClearanceMm,
    huid: fold + t.foldClearanceMm,
  };

  // Front face: stack only fields that exist, then center the block in the
  // printable head so preview and physical die-cut share the same padding.
  const frontUsableTop = t.frontInsetMm;
  const frontUsableBottom = fold - t.foldClearanceMm;
  const frontUsableH = Math.max(0, frontUsableBottom - frontUsableTop);

  const gapBetween = (prev: JewelryDieCutField, next: JewelryDieCutField, scale: number) =>
    (prev === 'price' && next === 'barcode' ? t.blockGapMm : t.lineGapMm) * scale;

  let gapScale = 1;
  for (let attempt = 0; attempt < 6; attempt++) {
    let contentH = 0;
    for (let i = 0; i < front.length; i++) {
      contentH += heights[front[i]];
      if (i > 0) contentH += gapBetween(front[i - 1], front[i], gapScale);
    }
    if (contentH <= frontUsableH || gapScale <= 0.45) break;
    gapScale = Math.max(0.45, gapScale * 0.85);
  }

  let frontContentH = 0;
  for (let i = 0; i < front.length; i++) {
    frontContentH += heights[front[i]];
    if (i > 0) frontContentH += gapBetween(front[i - 1], front[i], gapScale);
  }
  const frontFree = Math.max(0, frontUsableH - frontContentH);
  let y = frontUsableTop + frontFree * 0.42;
  for (let i = 0; i < front.length; i++) {
    const field = front[i];
    tops[field] = y;
    y += heights[field];
    if (i < front.length - 1) {
      y += gapBetween(field, front[i + 1], gapScale);
    }
  }
  if (front.includes('barcode')) {
    const maxBarcodeTop = fold - t.foldClearanceMm - heights.barcode;
    if (tops.barcode > maxBarcodeTop) {
      const shift = tops.barcode - maxBarcodeTop;
      for (const field of front) tops[field] -= shift;
      if (tops[front[0]!] < frontUsableTop - 0.01) {
        // Prefer keeping tip inset; accept tighter gaps already applied.
        const restore = frontUsableTop - tops[front[0]!];
        for (const field of front) tops[field] += restore;
        tops.barcode = Math.min(tops.barcode, maxBarcodeTop);
      }
    }
  }

  // Back face: pack against the fold (SKU then HUID).
  let by = fold + t.foldClearanceMm;
  for (let i = 0; i < back.length; i++) {
    tops[back[i]] = by;
    by += heights[back[i]] + (i < back.length - 1 ? t.backLineGapMm : 0);
  }

  return tops;
}

function textWidthMm(text: string, fontSizePt: number, bold?: boolean) {
  const emMm = ptToMm(fontSizePt);
  // Android bold (700) is wider than 0.56em — underestimate caused edge glyphs to clip.
  const advance = bold ? 0.64 : 0.55;
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
  const usable = Math.max(3, widthMm * 0.92);
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

/** Prior incorrect 50×100 sheet (2 mm gaps): 2 + 14 + 2 + 14 + 2 + 14 + 2 = 50. */
const LEGACY_50_COLUMN = { sideMarginMm: 2, gapMm: 2, tagWidthMm: 14, heightMm: 100 } as const;

function legacy50ColumnX(index: number): number {
  const { sideMarginMm, tagWidthMm, gapMm } = LEGACY_50_COLUMN;
  return sideMarginMm + index * (tagWidthMm + gapMm);
}

function nearestColumnIndex(centerX: number, origins: number[], tagWidthMm: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < origins.length; i++) {
    const origin = origins[i] ?? 0;
    const dist = Math.abs(centerX - (origin + tagWidthMm / 2));
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/**
 * Map a legacy multi-column sheet onto the vendor schematic 54×96 stock
 * while snapping each element into column 3 / 20 / 37 (not uniform scale).
 * Tops scale with height so relative stack order stays stable.
 */
export function migrateJewelrySheetToCanonicalSize(doc: LabelDocument): LabelDocument {
  const toW = JEWELRY_DIECUT.sheetWidthMm;
  const toH = JEWELRY_DIECUT.sheetHeightMm;
  if (isNearMm(doc.widthMm, toW) && isNearMm(doc.heightMm, toH)) return doc;

  const fromW = doc.widthMm;
  const fromH = doc.heightMm;
  const sy = toH / Math.max(fromH, 0.01);
  const useLegacy50 =
    Math.abs(fromW - 50) < 1.5 && Math.abs(fromH - 100) < 2.5;
  const oldOrigins = useLegacy50
    ? [0, 1, 2].map(legacy50ColumnX)
    : [0, 1, 2].map((i) => {
        // Proportional columns on unknown sheet widths (e.g. 46 mm UPS strip).
        const composed = JEWELRY_DIECUT.tagWidthMm * 3 + JEWELRY_DIECUT.gapMm * 2;
        const side = Math.max(0, (fromW - composed) / 2);
        return side + i * (JEWELRY_DIECUT.tagWidthMm + JEWELRY_DIECUT.gapMm);
      });

  const elements = doc.elements.map((el) => {
    const center = el.left + el.width / 2;
    const col = nearestColumnIndex(center, oldOrigins, JEWELRY_DIECUT.tagWidthMm);
    const oldOx = oldOrigins[col] ?? 0;
    const newOx = jewelryDieCutColumnX(col);
    const localLeft = el.left - oldOx;
    const next: LabelElement = {
      ...el,
      left: Number((newOx + localLeft).toFixed(3)),
      top: Number((el.top * sy).toFixed(3)),
    };
    if ('height' in el && typeof el.height === 'number') {
      (next as { height: number }).height = Number((el.height * sy).toFixed(3));
    }
    return next;
  });

  return {
    ...doc,
    widthMm: toW,
    heightMm: toH,
    elements,
    updatedAt: Date.now(),
  };
}

/**
 * Crop the leftmost 14 mm tag from a 3-across sheet for Single Tag print.
 * Preserves local mm positions inside the tag (no restack).
 */
export function extractJewelryFirstColumnDocument(doc: LabelDocument): LabelDocument {
  const { tagWidthMm, tagHeightMm } = JEWELRY_DIECUT;
  if (jewelryDieCutContentIsSingleTag(doc)) {
    return {
      ...doc,
      widthMm: tagWidthMm,
      heightMm: isNearMm(doc.heightMm, tagHeightMm) ? doc.heightMm : tagHeightMm,
    };
  }

  const ox = jewelryDieCutColumnX(0);
  const elements = doc.elements
    .filter((el) => {
      const mid = el.left + el.width / 2;
      return mid >= ox - 0.75 && mid < ox + tagWidthMm + 0.75;
    })
    .map((el) => ({
      ...el,
      left: Number((el.left - ox).toFixed(3)),
    }));

  return {
    ...doc,
    id: doc.id,
    name: doc.name,
    widthMm: tagWidthMm,
    heightMm: tagHeightMm,
    ups: undefined,
    elements,
    updatedAt: Date.now(),
  };
}

function centeredInColumn(el: LabelElement, docWidthMm: number) {
  const origin = jewelryDieCutColumnOriginMm(el.left + el.width / 2, docWidthMm);
  const inset = JEWELRY_DIECUT_TYPE.insetXMm;
  const width = JEWELRY_DIECUT.tagWidthMm - inset * 2;
  return { left: origin + inset, width };
}

/**
 * Force every printable field into the centre of its 14 mm column.
 * Fits font size so glyphs don't clip the die edge. Preserves tops (Y).
 * Catalog templates + stored labels must run this so print matches the die-cuts.
 */
export function softFitJewelryDieCutDocument(doc: LabelDocument): LabelDocument {
  const { tagWidthMm } = JEWELRY_DIECUT;
  const t = JEWELRY_DIECUT_TYPE;
  const elements = doc.elements.map((el) => {
    if (el.needPrinting === false) return el;
    if (el.width > tagWidthMm + 0.6) return el;
    const box = centeredInColumn(el, doc.widthMm);

    if (el.type === 'barcode') {
      return {
        ...el,
        left: box.left,
        width: box.width,
        height: Math.min(el.height || t.barcodeHeightMm, t.barcodeHeightMm),
        textFlag: 'Hide' as const,
      };
    }

    if (el.type === 'text' || el.type === 'degrees' || el.type === 'time') {
      const raw = elementText(el);
      const field = classifyJewelryDieCutField(el);
      const maxPt =
        field === 'title' || field === 'price'
          ? t.titlePt
          : field === 'karat'
            ? t.karatPt
            : field === 'huid'
              ? t.huidPt
              : field === 'sku'
                ? t.skuPt
                : t.bodyPt;
      const fontSize = jewelryDieCutFontToFit(
        raw,
        box.width,
        true,
        Math.min(el.fontSize || t.bodyPt, maxPt),
        maxPt,
        4,
      );
      return {
        ...el,
        left: box.left,
        width: box.width,
        fontSize,
        height: Math.max(lineHeightMm(fontSize), el.height || 0),
        align: 'center' as const,
        autoWrapping: 'Close' as const,
        bold: true,
      };
    }

    if (el.type === 'qrcode') {
      // Keep QR square and centered in the column.
      const side = Math.min(el.width, el.height, box.width);
      return {
        ...el,
        left: box.left + (box.width - side) / 2,
        width: side,
        height: side,
      };
    }

    return { ...el, left: box.left, width: box.width };
  });

  return { ...doc, elements };
}

/**
 * Fit type to the 14 mm tag, center every printable field, and restack
 * so SKU/HUID sit on the tail side of the fold and the barcode sits just
 * below the dotted line on the product side.
 *
 * Prefer softFitJewelryDieCutDocument for edit/print WYSIWYG. Full refit is
 * for template generation and explicit "Reset layout" only.
 */
export function refitJewelryDieCutDocument(doc: LabelDocument): LabelDocument {
  const soft = softFitJewelryDieCutDocument(doc);
  const { tagWidthMm } = JEWELRY_DIECUT;
  const t = JEWELRY_DIECUT_TYPE;

  const present: JewelryDieCutField[] = [];
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

  for (const el of soft.elements) {
    if (el.needPrinting === false) continue;
    if (el.width > tagWidthMm + 0.6) continue;
    const field = classifyJewelryDieCutField(el);
    if (!field) continue;
    present.push(field);
    const h =
      field === 'barcode'
        ? t.barcodeHeightMm
        : 'height' in el
          ? Number(el.height) || heights[field]
          : heights[field];
    heights[field] = h;
  }

  const tops = jewelryDieCutFieldTops(heights, present);
  const elements = soft.elements.map((el) => {
    const field = classifyJewelryDieCutField(el);
    if (!field) return el;
    return { ...el, top: tops[field] };
  });

  return { ...soft, elements };
}
