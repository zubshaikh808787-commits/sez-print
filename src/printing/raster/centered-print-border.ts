/**
 * Isolated print-time border drawer. Centers canvas W×H on the label/cell,
 * converts mm→dots once, draws an inward stroke with no extra inset.
 * Does not read GAP, H/V, REFERENCE, or liner.
 */
import type { BorderStyleId } from '@/constants/border-library';
import { borderStyleUsesCircleRing } from '@/constants/border-library';
import { upsPanelCellRectMm } from '@/lib/printer/border-media-shape';
import type { LabelDocument, LabelElement } from '@/lib/label-document';
import { dotsPerMm, mmToDots, rectMmToDots } from '@/lib/printer/print-spec';
import { centeredBorderPrintRectMm } from '@/printing/raster/border-center';
import {
  borderStrokeDots,
  borderStrokeFallbackMm,
  drawInwardEllipseRing,
  drawInwardFrameInBox,
  type FrameFillTarget,
} from '@/printing/raster/border-frame';
import { styledBorderBands } from '@/printing/raster/border-shapes';

/** Same fields as DrawPrintBorderOpts — kept here so this file does not import print-border. */
export type CenteredDrawOpts = {
  bitmapWidthDots?: number;
  bitmapHeightDots?: number;
  extraBottomInsetMm?: number;
  labelWidthDots?: number;
  labelHeightDots?: number;
  mediaShape?: string | null;
  upsPrintCell?: LabelDocument['upsPrintCell'];
  upsPanelIndex?: number;
  labelWidthMm?: number;
  labelHeightMm?: number;
};

const ZERO_INSET = { left: 0, right: 0, top: 0, bottom: 0 };

function usesRoundedPath(style: BorderStyleId): boolean {
  return style === 'rounded' || style === 'pill-shape';
}

export function drawCenteredPrintBorder(
  target: FrameFillTarget,
  el: Extract<LabelElement, { type: 'border' }>,
  dpi: number,
  scale = 1,
  opts?: CenteredDrawOpts,
): void {
  const s = Math.max(1, Math.round(scale));
  const dpm = dotsPerMm(dpi);
  const frameW =
    opts?.labelWidthMm != null && opts.labelWidthMm > 0
      ? opts.labelWidthMm
      : opts?.labelWidthDots != null && opts.labelWidthDots > 0
        ? opts.labelWidthDots / dpm
        : el.width;
  const frameH =
    opts?.labelHeightMm != null && opts.labelHeightMm > 0
      ? opts.labelHeightMm
      : opts?.labelHeightDots != null && opts.labelHeightDots > 0
        ? opts.labelHeightDots / dpm
        : el.height;
  const mm = centeredBorderPrintRectMm(el, {
    widthMm: frameW,
    heightMm: frameH,
    upsPrintCell: opts?.upsPrintCell,
    mediaShape: opts?.mediaShape,
  });
  const rect = rectMmToDots(mm.left, mm.top, mm.width, mm.height, dpi);
  let x0 = rect.x0 * s;
  let y0 = rect.y0 * s;
  let x1 = rect.x1 * s;
  let y1 = rect.y1 * s;
  const clipW =
    opts?.labelWidthDots != null && opts.labelWidthDots > 0
      ? opts.labelWidthDots
      : opts?.bitmapWidthDots;
  const clipH =
    opts?.labelHeightDots != null && opts.labelHeightDots > 0
      ? opts.labelHeightDots
      : opts?.bitmapHeightDots;
  if (clipW != null && clipW > 0) {
    x0 = Math.max(0, x0);
    x1 = Math.min(x1, Math.round(clipW) * s);
  }
  if (clipH != null && clipH > 0) {
    y0 = Math.max(0, y0);
    y1 = Math.min(y1, Math.round(clipH) * s);
  }
  if (opts?.upsPrintCell && opts.upsPanelIndex != null) {
    const cell = upsPanelCellRectMm(opts.upsPrintCell, opts.upsPanelIndex);
    const cx0 = mmToDots(cell.left, dpi) * s;
    const cy0 = mmToDots(cell.top, dpi) * s;
    const cx1 = mmToDots(cell.left + cell.width, dpi) * s;
    const cy1 = mmToDots(cell.top + cell.height, dpi) * s;
    x0 = Math.max(x0, cx0);
    y0 = Math.max(y0, cy0);
    x1 = Math.min(x1, cx1);
    y1 = Math.min(y1, cy1);
  }
  x0 = Math.min(x0, x1 - 1);
  y0 = Math.min(y0, y1 - 1);
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const style = (el.borderStyle ?? 'solid-medium') as BorderStyleId;
  const extraBottom = Math.max(0, mmToDots(opts?.extraBottomInsetMm ?? 0, dpi) * s);
  const insets = {
    left: 0,
    right: 0,
    top: 0,
    bottom: extraBottom,
  };
  const shape = opts?.mediaShape;
  const curved =
    borderStyleUsesCircleRing(style) || shape === 'circle' || shape === 'ellipse';
  if (curved) {
    const stroke = borderStrokeDots(el.lineWidth, dpi, borderStrokeFallbackMm(style)) * s;
    const ix0 = x0 + insets.left;
    const iy0 = y0 + insets.top;
    const ix1 = x1 - insets.right;
    const iy1 = y1 - insets.bottom;
    drawInwardEllipseRing(target, ix0, iy0, ix1, iy1, stroke);
    if (style === 'double' || style === 'label-frame') {
      const gap = Math.max(0, Math.round(stroke * 2.2));
      const innerStroke = Math.max(1, Math.round(stroke * 0.55));
      drawInwardEllipseRing(target, ix0 + gap, iy0 + gap, ix1 - gap, iy1 - gap, innerStroke);
    }
    return;
  }
  if (usesRoundedPath(style)) {
    const stroke = borderStrokeDots(el.lineWidth, dpi, borderStrokeFallbackMm(style)) * s;
    const bands = styledBorderBands({
      x: x0,
      y: y0,
      w,
      h: Math.max(1, h - extraBottom),
      unitsPerMm: dotsPerMm(dpi) * s,
      stroke,
      style,
      shape: 'rect',
    });
    for (const band of bands) {
      target.fillRect(band.left, band.top, band.width, band.height, 0);
    }
    return;
  }
  const boxInsets = extraBottom > 0 ? insets : ZERO_INSET;
  drawInwardFrameInBox(target, w, h, dpi, el.lineWidth, style, x0, y0, boxInsets);
}
