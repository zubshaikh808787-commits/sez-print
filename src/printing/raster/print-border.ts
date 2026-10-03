import type { BorderStyleId } from '@/constants/border-library';
import type { LabelElement } from '@/lib/label-document';
import { mmToDots } from '@/lib/printer/print-spec';
import { drawInwardFrameInBox, type FrameFillTarget } from '@/printing/raster/border-frame';

export type DrawPrintBorderOpts = {
  /** Circle / ellipse stock: ring inside the same element box. */
  circular?: boolean;
};

/** Inward frame from the border element's own rectangle (f7f8b1a sit). */
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
  const w = Math.max(1, mmToDots(el.left + el.width, dpi) * s - x0);
  const h = Math.max(1, mmToDots(el.top + el.height, dpi) * s - y0);
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
