/**
 * Cable / P-style flag die-cut: TWO flags on one 50 × 73 mm piece.
 *
 * The reference drawing is the full print canvas — not two 50 mm tags (100 mm).
 * Print was wrong because SIZE was 100 × 70; the stock is 50 × 73.
 *
 *   50 mm × 12 dpm = 600 dots
 *   73 mm × 12 dpm = 876 dots
 *
 * Each flag: 25 mm head, left-aligned wrap tab, vertical fold at 12.5 mm.
 */

import type { LabelDocument } from '@/lib/label-document';

function isNearMm(a: number, b: number, toleranceMm = 0.8): boolean {
  return Math.abs(a - b) < toleranceMm;
}

export const CABLE_FLAG_DIECUT = {
  /** TSPL SIZE / editor canvas. */
  widthMm: 50,
  heightMm: 73,
  columns: 2,
  columnWidthMm: 25,
  headHeightMm: 46,
  tailHeightMm: 27,
  tailWidthMm: 8.5,
  /** Tab flush with the left of each 25 mm head. */
  tailOffsetXMm: 0,
  headRadiusMm: 2.8,
  tailRadiusMm: 2,
  innerRadiusMm: 1.2,
  /** Fold / physical cut at 0.5 of each 25 mm flag (12.5 mm). Editor guide only. */
  foldXMm: 12.5,
  foldInsetMm: 4.5,
  strokeMm: 0.25,
  gapMm: 0,
  sideMarginMm: 0,
  printDpi: 304,
  /** Aliases so print/preview keep one millimetre pair. */
  tagWidthMm: 50,
  tagHeightMm: 73,
  sheetWidthMm: 50,
  sheetHeightMm: 73,
} as const;

export const CABLE_FLAG_PREVIEW_SINGLE = 'cable-flag-50x73';
export const CABLE_FLAG_PREVIEW_SHEET = 'cable-flag-50x73';
export const CABLE_FLAG_PREVIEW_LEGACY = 'cable-flag-50x70';
export const CABLE_FLAG_PREVIEW_LEGACY_2UP = 'cable-flag-50x70-2up';

export const CABLE_FLAG_PRINT_PRESET_SINGLE = 'cable-flag-50x73';
/** @deprecated Pair prints at 50 × 73 mm; id matches the single preset. */
export const CABLE_FLAG_PRINT_PRESET_2UP = 'cable-flag-50x73';

export function isCableFlagPrintPresetId(id?: string | null): boolean {
  return (
    id === CABLE_FLAG_PRINT_PRESET_SINGLE ||
    id === 'cable-flag-50x70' ||
    id === 'cable-flag-50x70-2up'
  );
}

export function cableFlagComposedWidthMm(): number {
  const { columnWidthMm, columns, gapMm } = CABLE_FLAG_DIECUT;
  return columnWidthMm * columns + gapMm * (columns - 1);
}

export function cableFlagColumnX(index: number): number {
  const { sideMarginMm, columnWidthMm, gapMm } = CABLE_FLAG_DIECUT;
  return sideMarginMm + index * (columnWidthMm + gapMm);
}

export function cableFlagColumnCount(_widthMm?: number): number {
  return CABLE_FLAG_DIECUT.columns;
}

export function isCableFlagPreviewType(previewType?: string | null): boolean {
  return (
    previewType === CABLE_FLAG_PREVIEW_SINGLE ||
    previewType === CABLE_FLAG_PREVIEW_LEGACY ||
    previewType === CABLE_FLAG_PREVIEW_LEGACY_2UP
  );
}

export function isCableFlagDieCutDocument(doc?: {
  templatePreviewType?: string | null;
  templateCategory?: string | null;
  mediaShape?: string | null;
  widthMm?: number;
  heightMm?: number;
} | null): boolean {
  if (!doc) return false;
  if (isCableFlagPreviewType(doc.templatePreviewType)) return true;
  if (doc.mediaShape === 'diecut') {
    const cat = doc.templateCategory?.toLowerCase() ?? '';
    if (!cat.includes('cable')) return false;
    const h = doc.heightMm ?? 0;
    const w = doc.widthMm ?? 0;
    if (isNearMm(h, CABLE_FLAG_DIECUT.heightMm) || isNearMm(h, 70)) {
      return isNearMm(w, 50) || isNearMm(w, 100);
    }
  }
  return false;
}

export type CableFlagOutlineMm = {
  originXMm: number;
  head: { x: number; y: number; w: number; h: number };
  tail: { x: number; y: number; w: number; h: number };
  fold: { x: number; y0: number; y1: number };
};

export function cableFlagOutlineMm(originXMm: number): CableFlagOutlineMm {
  const {
    columnWidthMm,
    headHeightMm,
    tailWidthMm,
    tailHeightMm,
    tailOffsetXMm,
    foldXMm,
    foldInsetMm,
  } = CABLE_FLAG_DIECUT;
  return {
    originXMm,
    head: { x: originXMm, y: 0, w: columnWidthMm, h: headHeightMm },
    tail: {
      x: originXMm + tailOffsetXMm,
      y: headHeightMm,
      w: tailWidthMm,
      h: tailHeightMm,
    },
    fold: {
      x: originXMm + foldXMm,
      y0: foldInsetMm,
      y1: headHeightMm - foldInsetMm,
    },
  };
}

/**
 * P-flag path in millimetres. `insetMm` pulls the stroke fully inside the
 * 50 × 73 mm bitmap (half the line weight) so the outer edge is not clipped.
 */
export function cableFlagPathD(
  originXMm: number,
  toX: (mm: number) => number,
  toY: (mm: number) => number,
  insetMm = 0,
): string {
  const {
    columnWidthMm,
    headHeightMm,
    tailWidthMm,
    tailHeightMm,
    tailOffsetXMm,
    headRadiusMm,
    tailRadiusMm,
    innerRadiusMm,
  } = CABLE_FLAG_DIECUT;
  const inset = Math.max(0, insetMm);
  const left = inset;
  const right = columnWidthMm - inset;
  const top = inset;
  const bottom = headHeightMm + tailHeightMm - inset;
  const headBottom = headHeightMm;
  const tailRight = tailOffsetXMm + tailWidthMm;
  const rh = Math.max(0.4, headRadiusMm);
  const rt = Math.max(0.4, tailRadiusMm);
  const ri = Math.max(0.3, innerRadiusMm);

  const X = (mm: number) => toX(originXMm + mm);
  const Y = (mm: number) => toY(mm);
  const rx = (r: number) => Math.abs(toX(r) - toX(0));
  const ry = (r: number) => Math.abs(toY(r) - toY(0));

  return [
    `M ${X(left + rh)} ${Y(top)}`,
    `H ${X(right - rh)}`,
    `A ${rx(rh)} ${ry(rh)} 0 0 1 ${X(right)} ${Y(top + rh)}`,
    `V ${Y(headBottom - rh)}`,
    `A ${rx(rh)} ${ry(rh)} 0 0 1 ${X(right - rh)} ${Y(headBottom)}`,
    `H ${X(tailRight + ri)}`,
    `A ${rx(ri)} ${ry(ri)} 0 0 0 ${X(tailRight)} ${Y(headBottom + ri)}`,
    `V ${Y(bottom - rt)}`,
    `A ${rx(rt)} ${ry(rt)} 0 0 1 ${X(tailRight - rt)} ${Y(bottom)}`,
    `H ${X(left + rt)}`,
    `A ${rx(rt)} ${ry(rt)} 0 0 1 ${X(left)} ${Y(bottom - rt)}`,
    `V ${Y(top + rh)}`,
    `A ${rx(rh)} ${ry(rh)} 0 0 1 ${X(left + rh)} ${Y(top)}`,
    'Z',
  ].join(' ');
}

/** Force the document onto the physical 50 × 73 mm canvas (no 100 mm tile). */
export function cableFlagPrintDocument(doc: LabelDocument): LabelDocument {
  const { widthMm, heightMm } = CABLE_FLAG_DIECUT;
  if (isNearMm(doc.widthMm, widthMm) && isNearMm(doc.heightMm, heightMm)) {
    return { ...doc, widthMm, heightMm, mediaShape: 'diecut' };
  }
  return {
    ...doc,
    widthMm,
    heightMm,
    mediaShape: 'diecut',
    templatePreviewType: CABLE_FLAG_PREVIEW_SINGLE,
    updatedAt: Date.now(),
  };
}

/** @deprecated Pair is printed at 50 × 73 mm; kept for call sites. */
export function cableFlagSingleFromDocument(doc: LabelDocument): LabelDocument {
  return cableFlagPrintDocument(doc);
}
