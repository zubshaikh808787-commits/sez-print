import type { BorderStyleId } from '@/constants/border-library';
import type { LabelElement } from '@/lib/label-document';
import { mmToDots } from '@/lib/printer/print-spec';
import { drawInwardFrameInBox, type FrameFillTarget } from '@/printing/raster/border-frame';

export type DrawPrintBorderOpts = {
  /** Lock the frame to the label SIZE so every side uses the same 2 mm inset. */
  pageWidthMm?: number;
  pageHeightMm?: number;
};

/** Editor BorderPreview padding + style, in printer dots. */
export function drawPrintBorder(
  target: FrameFillTarget,
  el: Extract<LabelElement, { type: 'border' }>,
  dpi: number,
  scale = 1,
  opts?: DrawPrintBorderOpts,
): void {
  const s = Math.max(1, Math.round(scale));
  const lockPage = opts?.pageWidthMm != null && opts.pageWidthMm > 0 && opts.pageHeightMm != null && opts.pageHeightMm > 0;
  const x0 = lockPage ? 0 : mmToDots(el.left, dpi) * s;
  const y0 = lockPage ? 0 : mmToDots(el.top, dpi) * s;
  const right = lockPage ? mmToDots(opts!.pageWidthMm!, dpi) * s : mmToDots(el.left + el.width, dpi) * s;
  const bottom = lockPage ? mmToDots(opts!.pageHeightMm!, dpi) * s : mmToDots(el.top + el.height, dpi) * s;
  const w = Math.max(1, right - x0);
  const h = Math.max(1, bottom - y0);
  const style = (el.borderStyle ?? 'solid-medium') as BorderStyleId;
  drawInwardFrameInBox(target, w, h, dpi, el.lineWidth, style, x0, y0);
}
