import { resolveBorderStyle } from '@/constants/border-library';
import type { LabelElement } from '@/lib/label-document';
import { borderShapeForMedia } from '@/printing/raster/border-shapes';
import { mmToDots, td404BorderOuterDots } from '@/lib/printer/print-spec';
import {
  borderFrameInsetsForElement,
  drawInwardFrameInBox,
  type FrameFillTarget,
} from '@/printing/raster/border-frame';

export type DrawPrintBorderOpts = {
  /**
   * Packed bitmap size (the bytes that are sent). TSPL width is a multiple of 8,
   * so it can be 0–7 dots narrower than the label in millimetres.
   * Clip to that bitmap first, then inset.
   */
  bitmapWidthDots?: number;
  bitmapHeightDots?: number;
  /**
   * Extra bottom inset in millimetres. Off in production (0). Tests may pass 1
   * to model a tear clip; do not enable it on the print path without paper proof.
   */
  extraBottomInsetMm?: number;
  /** TD-404 only. Place the outer stroke from td404BorderOuterDots. */
  bakeFeed?: boolean;
  /** Label die-cut. Circle and ellipse labels print a ring instead of a rectangle. */
  mediaShape?: string;
};

/** Inward frame from the border element's rectangle, clipped to the sent bitmap. */
export function drawPrintBorder(
  target: FrameFillTarget,
  el: Extract<LabelElement, { type: 'border' }>,
  dpi: number,
  scale = 1,
  opts?: DrawPrintBorderOpts,
): void {
  const s = Math.max(1, Math.round(scale));
  const baked = opts?.bakeFeed === true && (opts.bitmapWidthDots ?? 0) > 0 && (opts.bitmapHeightDots ?? 0) > 0;
  let x0: number;
  let y0: number;
  let x1: number;
  let y1: number;
  if (baked) {
    const outer = td404BorderOuterDots(opts!.bitmapWidthDots!, opts!.bitmapHeightDots!, dpi);
    x0 = outer.x0 * s;
    y0 = outer.y0 * s;
    x1 = outer.x1 * s;
    y1 = outer.y1 * s;
  } else {
    x0 = mmToDots(el.left, dpi) * s;
    y0 = Math.max(0, mmToDots(el.top, dpi) * s);
    x1 = mmToDots(el.left + el.width, dpi) * s;
    y1 = mmToDots(el.top + el.height, dpi) * s;
    if (opts?.bitmapWidthDots != null && opts.bitmapWidthDots > 0) {
      x1 = Math.min(x1, Math.round(opts.bitmapWidthDots) * s);
    }
    if (opts?.bitmapHeightDots != null && opts.bitmapHeightDots > 0) {
      y1 = Math.min(y1, Math.round(opts.bitmapHeightDots) * s);
    }
  }
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const style = resolveBorderStyle(el.borderStyle);
  const unit = baked
    ? { left: 0, right: 0, top: 0, bottom: 0 }
    : borderFrameInsetsForElement(el, dpi, opts?.extraBottomInsetMm ?? 0);
  const insets = {
    left: unit.left * s,
    right: unit.right * s,
    top: unit.top * s,
    bottom: unit.bottom * s,
  };
  drawInwardFrameInBox(
    target,
    w,
    h,
    dpi,
    el.lineWidth,
    style,
    x0,
    y0,
    insets,
    borderShapeForMedia(opts?.mediaShape),
    s,
  );
}
