import { borderStyleUsesCircleRing } from '@/constants/border-library';
import type { LabelDocument, LabelElement, MediaShape } from '@/lib/label-document';

/** Editor / ViewShot: round die follows the ups cell, not the composed strip. */
export function mediaShapeForElement(
  doc: Pick<LabelDocument, 'mediaShape' | 'upsPrintCell'>,
  el: Pick<LabelElement, 'upsPanelIndex'>,
): MediaShape | undefined {
  if (doc.upsPrintCell?.mediaShape && el.upsPanelIndex != null) {
    return doc.upsPrintCell.mediaShape;
  }
  return doc.mediaShape;
}

export function upsPanelCellRectMm(
  cell: NonNullable<LabelDocument['upsPrintCell']>,
  panelIndex: number,
): { left: number; top: number; width: number; height: number } {
  const gap = cell.columnSpacingMm ?? 0;
  const ox = panelIndex * (cell.widthMm + gap);
  return { left: ox, top: 0, width: cell.widthMm, height: cell.heightMm };
}

/** Per-element die shape for border raster (N-up uses one cell, not the full strip). */
export function borderMediaShapeForElement(
  doc: Pick<LabelDocument, 'mediaShape' | 'upsPrintCell'>,
  el: Pick<LabelElement, 'type' | 'borderStyle' | 'upsPanelIndex'>,
): MediaShape | undefined {
  if (el.type !== 'border') return undefined;
  if (el.borderStyle && borderStyleUsesCircleRing(el.borderStyle)) {
    return 'circle';
  }
  if (doc.upsPrintCell && el.upsPanelIndex != null) {
    return doc.upsPrintCell.mediaShape;
  }
  return doc.mediaShape;
}
