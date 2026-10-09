/**
 * Production TD-404 border raster (baseline ~90% die-edge accuracy).
 * Restore point: git tag `border-accuracy-90`, branch `border/stable-baseline`.
 * New border plans should add parallel code paths; keep this entry point stable.
 */
import type { BorderStyleId } from '@/constants/border-library';
import { borderStyleUsesCircleRing } from '@/constants/border-library';
import { borderMediaShapeForElement, upsPanelCellRectMm } from '@/lib/printer/border-media-shape';
import { BORDER_EDGE_WARN_MM } from '@/lib/border-geometry';
import type { LabelDocument, LabelElement } from '@/lib/label-document';
import { fillRect } from '@/printing/raster/dot-surface';
import { mmToDots, rectMmToDots } from '@/lib/printer/print-spec';
import {
  borderFrameInsetsForElement,
  borderStrokeDots,
  borderStrokeFallbackMm,
  drawInwardEllipseRing,
  drawInwardFrameInBox,
  PRINT_BORDER_INSET_MM,
  untaggedBorderNeedsDrawInset,
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
  /** Full label SIZE in dots. The frame is clipped to SIZE, never repositioned. */
  labelWidthDots?: number;
  labelHeightDots?: number;
  /** Circle and ellipse dies use the same outer edge as a rectangle, drawn as a ring. */
  mediaShape?: string | null;
  /** Composed N-up: clip each border to its sticker cell so rings stay centered on the die. */
  upsPrintCell?: LabelDocument['upsPrintCell'];
  upsPanelIndex?: number;
  /** Label SIZE in millimetres — needed so untagged already-inset boxes are not inset twice. */
  labelWidthMm?: number;
  labelHeightMm?: number;
};

/**
 * Inward frame whose outer edge is the border element's own rectangle (the
 * canvas geometry), converted once with rectMmToDots and clipped to SIZE.
 * No printer, GAP, or H/V input: those live in TSPL SIZE/GAP/REFERENCE.
 */
export function drawPrintBorder(
  target: FrameFillTarget,
  el: Extract<LabelElement, { type: 'border' }>,
  dpi: number,
  scale = 1,
  opts?: DrawPrintBorderOpts,
): void {
  const s = Math.max(1, Math.round(scale));
  const rect = rectMmToDots(el.left, el.top, el.width, el.height, dpi);
  let x0 = Math.max(0, rect.x0) * s;
  let y0 = Math.max(0, rect.y0) * s;
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
  if (clipW != null && clipW > 0) x1 = Math.min(x1, Math.round(clipW) * s);
  if (clipH != null && clipH > 0) y1 = Math.min(y1, Math.round(clipH) * s);
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
  const unit = borderFrameInsetsForElement(
    el,
    dpi,
    opts?.extraBottomInsetMm ?? 0,
    opts?.labelWidthMm,
    opts?.labelHeightMm,
  );
  const insets = {
    left: unit.left * s,
    right: unit.right * s,
    top: unit.top * s,
    bottom: unit.bottom * s,
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
  drawInwardFrameInBox(target, w, h, dpi, el.lineWidth, style, x0, y0, insets);
}

/** Stamp integer 1-bit borders onto an existing SIZE or packed-up gray buffer. */
export function stampPrintBordersOnGray(
  gray: Uint8Array,
  widthDots: number,
  heightDots: number,
  doc: LabelDocument,
  dpi: number,
  opts?: { labelWidthDots?: number; labelHeightDots?: number },
): void {
  const surface = { width: widthDots, height: heightDots, gray };
  const target: FrameFillTarget = {
    fillRect: (x, y, w, h, g) => fillRect(surface, x, y, w, h, g),
  };
  const labelW = opts?.labelWidthDots ?? widthDots;
  const labelH = opts?.labelHeightDots ?? heightDots;
  for (const el of doc.elements) {
    if (el.type !== 'border') continue;
    if (el.needPrinting === false || el.visible === false) continue;
    drawPrintBorder(target, el, dpi, 1, {
      bitmapWidthDots: widthDots,
      bitmapHeightDots: heightDots,
      labelWidthDots: labelW,
      labelHeightDots: labelH,
      mediaShape: borderMediaShapeForElement(doc, el),
      upsPrintCell: doc.upsPrintCell,
      upsPanelIndex: el.upsPanelIndex,
      labelWidthMm: doc.widthMm,
      labelHeightMm: doc.heightMm,
    });
  }
}

export function td404DocumentOffsetClipWarning(
  doc: Pick<LabelDocument, 'widthMm' | 'heightMm' | 'elements'>,
  dpi: number,
  hOffsetMm: number,
  vOffsetMm: number,
): string | null {
  const clipped = new Set<string>();
  const near = new Map<string, number>();
  for (const el of doc.elements) {
    if (el.type !== 'border') continue;
    if (el.needPrinting === false || el.visible === false) continue;
    const margins = borderEdgeMarginsMm(el, doc.widthMm, doc.heightMm, hOffsetMm, vOffsetMm);
    for (const [side, mm] of Object.entries(margins)) {
      if (mmToDots(mm, dpi) <= 0) clipped.add(side);
      else if (mm < BORDER_EDGE_WARN_MM) near.set(side, Math.min(mm, near.get(side) ?? Infinity));
    }
  }
  const notes: string[] = [];
  if (clipped.size > 0) {
    const sides = [...clipped].join(' and ');
    notes.push(
      `The ${sides} border edge sits on or past the label edge${hOffsetMm || vOffsetMm ? ' after the H/V offset' : ''} and will be cut off. Leave H and V at 0 unless this roll needs a nudge.`,
    );
  }
  if (near.size > 0) {
    const list = [...near.entries()].map(([side, mm]) => `${side} ${mm.toFixed(2)} mm`).join(', ');
    notes.push(
      `Border is closer than ${BORDER_EDGE_WARN_MM} mm to the label edge (${list}). Printer registration is about ±0.5 mm, so the stroke may be cut off.`,
    );
  }
  return notes.length > 0 ? notes.join(' ') : null;
}

/**
 * Outer ink distance of a border from each SIZE edge after the global H/V
 * shift. Untagged borders draw 2 mm inside their box, so that inset counts.
 */
export function borderEdgeMarginsMm(
  el: Pick<Extract<LabelElement, { type: 'border' }>, 'left' | 'top' | 'width' | 'height' | 'geometryVersion'>,
  labelWidthMm: number,
  labelHeightMm: number,
  hOffsetMm = 0,
  vOffsetMm = 0,
): { left: number; right: number; top: number; bottom: number } {
  const inset = untaggedBorderNeedsDrawInset(el, labelWidthMm, labelHeightMm)
    ? PRINT_BORDER_INSET_MM
    : 0;
  return {
    left: el.left + inset + hOffsetMm,
    right: labelWidthMm - (el.left + el.width) + inset - hOffsetMm,
    top: el.top + inset + vOffsetMm,
    bottom: labelHeightMm - (el.top + el.height) + inset - vOffsetMm,
  };
}
