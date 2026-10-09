import {
  circularCenteredBorderBoxMm,
  usesCircularBorderBox,
} from '@/lib/border-geometry';
import type { LabelDocument, LabelElement } from '@/lib/label-document';
import { upsPanelCellRectMm } from '@/lib/printer/border-media-shape';

export type MmRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * Center a border box on a frame. No GAP, H/V, DPI, liner, or sensor.
 *
 * borderX = originX + frameW/2 - borderW/2
 * borderY = originY + frameH/2 - borderH/2
 */
export function centeredBorderRectMm(params: {
  frameWidthMm: number;
  frameHeightMm: number;
  borderWidthMm: number;
  borderHeightMm: number;
  originXMm?: number;
  originYMm?: number;
}): MmRect {
  const originXMm = params.originXMm ?? 0;
  const originYMm = params.originYMm ?? 0;
  const borderWidthMm = Number.isFinite(params.borderWidthMm) ? Math.max(0, params.borderWidthMm) : 0;
  const borderHeightMm = Number.isFinite(params.borderHeightMm) ? Math.max(0, params.borderHeightMm) : 0;
  const frameWidthMm = Number.isFinite(params.frameWidthMm) ? params.frameWidthMm : 0;
  const frameHeightMm = Number.isFinite(params.frameHeightMm) ? params.frameHeightMm : 0;
  return {
    left: originXMm + frameWidthMm / 2 - borderWidthMm / 2,
    top: originYMm + frameHeightMm / 2 - borderHeightMm / 2,
    width: borderWidthMm,
    height: borderHeightMm,
  };
}

export function labelCenterMm(widthMm: number, heightMm: number): { x: number; y: number } {
  return { x: widthMm / 2, y: heightMm / 2 };
}

export function rectCenterMm(rect: MmRect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/**
 * Print rectangle for one border: canvas W×H centered on the label, or on
 * the N-up cell when `upsPrintCell` + `upsPanelIndex` are set.
 * Ignores stored left/top. Circle dies / circle-* styles use a square on the die.
 */
export function centeredBorderPrintRectMm(
  el: Pick<
    Extract<LabelElement, { type: 'border' }>,
    'width' | 'height' | 'upsPanelIndex' | 'borderStyle'
  >,
  doc: Pick<LabelDocument, 'widthMm' | 'heightMm' | 'upsPrintCell' | 'mediaShape'>,
): MmRect {
  const cell =
    doc.upsPrintCell && el.upsPanelIndex != null
      ? upsPanelCellRectMm(doc.upsPrintCell, el.upsPanelIndex)
      : { left: 0, top: 0, width: doc.widthMm, height: doc.heightMm };
  const mediaShape = doc.upsPrintCell?.mediaShape ?? doc.mediaShape;
  if (usesCircularBorderBox({ mediaShape, borderStyle: el.borderStyle })) {
    return circularCenteredBorderBoxMm(
      cell.width,
      cell.height,
      el.width,
      el.height,
      cell.left,
      cell.top,
    );
  }
  return centeredBorderRectMm({
    frameWidthMm: cell.width,
    frameHeightMm: cell.height,
    borderWidthMm: el.width,
    borderHeightMm: el.height,
    originXMm: cell.left,
    originYMm: cell.top,
  });
}
