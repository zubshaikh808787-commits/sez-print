import type { BorderStyleId } from '@/constants/border-library';
import type { LabelElement } from '@/lib/label-document';
import { dotsPerMm, mmToDots } from '@/lib/printer/print-spec';

type FillTarget = {
  fillRect: (x: number, y: number, w: number, h: number, gray: number) => void;
};

function strokePxFrom(lineWidthMm: number | undefined, scale: number, fallbackMm: number): number {
  const mm = lineWidthMm != null && lineWidthMm > 0 ? lineWidthMm : fallbackMm;
  return Math.max(1, Math.round(mm * Math.max(scale, 1)));
}

function strokeRectInk(target: FillTarget, x: number, y: number, w: number, h: number, stroke: number): void {
  const t = Math.max(1, Math.round(stroke));
  target.fillRect(x, y, w, t, 0);
  target.fillRect(x, y + h - t, w, t, 0);
  target.fillRect(x, y, t, h, 0);
  target.fillRect(x + w - t, y, t, h, 0);
}

function dashedFrame(
  target: FillTarget,
  x: number,
  y: number,
  w: number,
  h: number,
  stroke: number,
  dash: number,
  gap: number,
): void {
  const paintDash = (x0: number, y0: number, x1: number, y1: number, vertical: boolean) => {
    let pos = 0;
    const len = vertical ? y1 - y0 : x1 - x0;
    while (pos < len) {
      const seg = Math.min(dash, len - pos);
      if (vertical) target.fillRect(x0, y0 + pos, stroke, seg, 0);
      else target.fillRect(x0 + pos, y0, seg, stroke, 0);
      pos += dash + gap;
    }
  };
  paintDash(x, y, x + w, y, false);
  paintDash(x, y + h - stroke, x + w, y + h - stroke, false);
  paintDash(x, y, x, y + h, true);
  paintDash(x + w - stroke, y, x + w - stroke, y + h, true);
}

/** Editor BorderPreview padding + style, in printer dots. */
export function drawPrintBorder(
  target: FillTarget,
  el: Extract<LabelElement, { type: 'border' }>,
  dpi: number,
  scale = 1,
): void {
  const s = Math.max(1, Math.round(scale));
  const dpm = dotsPerMm(dpi) * s;
  const x0 = mmToDots(el.left, dpi) * s;
  const y0 = mmToDots(el.top, dpi) * s;
  const w = Math.max(1, mmToDots(el.left + el.width, dpi) * s - x0);
  const h = Math.max(1, mmToDots(el.top + el.height, dpi) * s - y0);
  const pad = Math.max(2, Math.round(dpm * 2));
  const ix = x0 + pad;
  const iy = y0 + pad;
  const iw = Math.max(1, w - pad * 2);
  const ih = Math.max(1, h - pad * 2);
  const style = (el.borderStyle ?? 'solid-medium') as BorderStyleId;
  const fallback =
    style === 'solid-thin' ? 0.35 : style === 'solid-thick' ? 0.9 : style === 'dashed' || style === 'dotted' ? 0.5 : 0.55;
  const stroke = strokePxFrom(el.lineWidth, dpm, fallback);
  if (style === 'dashed' || style === 'dotted') {
    const dash = style === 'dotted' ? stroke : stroke * 3;
    const gap = style === 'dotted' ? stroke * 1.5 : stroke * 2;
    dashedFrame(target, ix, iy, iw, ih, stroke, dash, gap);
    return;
  }
  if (style === 'double' || style === 'label-frame') {
    strokeRectInk(target, ix, iy, iw, ih, stroke);
    const inner = Math.max(0, Math.round(stroke * 2.2));
    strokeRectInk(
      target,
      ix + inner,
      iy + inner,
      Math.max(1, iw - inner * 2),
      Math.max(1, ih - inner * 2),
      Math.max(1, Math.round(stroke * 0.55)),
    );
    return;
  }
  if (style === 'corner-brackets' || style === 'crosshair') {
    const arm = Math.max(8, Math.round(dpm * (style === 'crosshair' ? 2 : 2.2)));
    const inset = style === 'crosshair' ? 4 : 2;
    target.fillRect(ix + inset, iy + inset, arm, stroke, 0);
    target.fillRect(ix + inset, iy + inset, stroke, arm, 0);
    target.fillRect(ix + iw - inset - arm, iy + inset, arm, stroke, 0);
    target.fillRect(ix + iw - inset - stroke, iy + inset, stroke, arm, 0);
    target.fillRect(ix + inset, iy + ih - inset - stroke, arm, stroke, 0);
    target.fillRect(ix + inset, iy + ih - inset - arm, stroke, arm, 0);
    target.fillRect(ix + iw - inset - arm, iy + ih - inset - stroke, arm, stroke, 0);
    target.fillRect(ix + iw - inset - stroke, iy + ih - inset - arm, stroke, arm, 0);
    return;
  }
  strokeRectInk(target, ix, iy, iw, ih, stroke);
}
