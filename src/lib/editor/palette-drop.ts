/**
 * Palette → canvas drop: center the new element on the pointer, then clamp.
 * Screen zoom never enters this math — callers pass millimetres from pointerToMm.
 */

import {
  dragBoundMm,
  finiteMm,
  MIN_ELEMENT_MM,
  SNAP_THRESHOLD_MM,
  snapBoxToGuides,
  type CanvasBounds,
  type SnapGuide,
} from '@/lib/editor/engine';
import type { ElementType } from '@/lib/label-document';

export type MmPoint = { x: number; y: number };
export type MmBox = { left: number; top: number; width: number; height: number };

export const PALETTE_DROP_LABELS: Record<string, ElementType> = {
  Text: 'text',
  Barcode: 'barcode',
  QRCode: 'qrcode',
  Line: 'line',
  Shapes: 'shape',
  Time: 'time',
  ArcText: 'arctext',
  Degrees: 'degrees',
};

export function paletteDropTypeForLabel(label: string): ElementType | null {
  return PALETTE_DROP_LABELS[label] ?? null;
}

export function isPaletteDropOnArtboard(
  pointerMm: MmPoint,
  canvas: CanvasBounds,
  slackMm = 0,
): boolean {
  if (!Number.isFinite(pointerMm.x) || !Number.isFinite(pointerMm.y)) return false;
  const slack = Number.isFinite(slackMm) ? Math.max(0, slackMm) : 0;
  return (
    pointerMm.x >= -slack &&
    pointerMm.y >= -slack &&
    pointerMm.x <= canvas.widthMm + slack &&
    pointerMm.y <= canvas.heightMm + slack
  );
}

/** Center the box on the pointer, snap if a guide is in range, then keep it on the label. */
export function paletteDropTopLeftMm(opts: {
  pointerMm: MmPoint;
  widthMm: number;
  heightMm: number;
  canvas: CanvasBounds;
  others?: MmBox[];
  thresholdMm?: number;
}): { left: number; top: number; guides: SnapGuide[] } {
  const width = Math.max(MIN_ELEMENT_MM, finiteMm(opts.widthMm, MIN_ELEMENT_MM));
  const height = Math.max(0.1, finiteMm(opts.heightMm, MIN_ELEMENT_MM));
  const snapped = snapBoxToGuides(
    opts.pointerMm.x - width / 2,
    opts.pointerMm.y - height / 2,
    width,
    height,
    opts.others ?? [],
    opts.canvas,
    opts.thresholdMm ?? SNAP_THRESHOLD_MM,
  );
  const clamped = dragBoundMm(snapped.left, snapped.top, width, height, opts.canvas);
  return { left: clamped.left, top: clamped.top, guides: snapped.guides };
}
