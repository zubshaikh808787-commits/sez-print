import type { BorderStyleId } from '@/constants/border-library';
import type { LabelElement } from '@/lib/label-document';
import { mmToDots } from '@/lib/printer/print-spec';
import { drawInwardFrameInBox, type FrameFillTarget } from '@/printing/raster/border-frame';

export type DrawPrintBorderOpts = {
  /** Circle / ellipse stock: ring inside the same element box. */
  circular?: boolean;
  /**
   * Packed bitmap size (the bytes that are sent). TSPL width is a multiple of 8,
   * so it can be 0–7 dots narrower than the label in millimetres. An element edge
   * past this bitmap is pulled back, and the 2 mm inset is then equal on every side.
   */
  bitmapWidthDots?: number;
  bitmapHeightDots?: number;
};

/** Inward frame from the border element's own rectangle, clipped to the sent bitmap. */
export function drawPrintBorder(
  target: FrameFillTarget,
  el: Extract<LabelElement, { type: 'border' }>,
  dpi: number,
  scale = 1,
  opts?: DrawPrintBorderOpts,
): void {
  const s = Math.max(1, Math.round(scale));
  const x0 = mmToDots(el.left, dpi) * s;
  const y0 = mmToDots(el.top, dpi) * s;
  let x1 = mmToDots(el.left + el.width, dpi) * s;
  let y1 = mmToDots(el.top + el.height, dpi) * s;
  if (opts?.bitmapWidthDots != null && opts.bitmapWidthDots > 0) {
    x1 = Math.min(x1, Math.round(opts.bitmapWidthDots) * s);
  }
  if (opts?.bitmapHeightDots != null && opts.bitmapHeightDots > 0) {
    y1 = Math.min(y1, Math.round(opts.bitmapHeightDots) * s);
  }
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const style = (el.borderStyle ?? 'solid-medium') as BorderStyleId;
  drawInwardFrameInBox(
    target,
    w,
    h,
    dpi,
    el.lineWidth,
    style,
    x0,
    y0,
    undefined,
    opts?.circular === true,
  );
}
