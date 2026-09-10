/**
 * Template → canvas → print coordinates.
 *
 * Stored model is millimetres (`widthMm` / `heightMm`, element `left` / `top` /
 * `width` / `height`). Screen pixels and printer dots are always derived.
 * Both axes share one scale so the pad never stretches.
 */

import { dotsPerMm as printerDotsPerMm } from '@/lib/printer/print-spec';

export type PixelSize = {
  widthPx: number;
  heightPx: number;
};

export type MillimetreSize = {
  widthMm: number;
  heightMm: number;
};

export type ContainFit = {
  /** Uniform px per millimetre. Apply to x, y, width, and height. */
  pxPerMM: number;
  canvasWidthPx: number;
  canvasHeightPx: number;
  offsetXPx: number;
  offsetYPx: number;
};

export type MmRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function finitePositive(n: number, fallback: number): number {
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** pxPerMM = min(containerW / labelW, containerH / labelH). */
export function computeScale(container: PixelSize, label: MillimetreSize): number {
  const cw = finitePositive(container.widthPx, 0);
  const ch = finitePositive(container.heightPx, 0);
  const lw = finitePositive(label.widthMm, 0);
  const lh = finitePositive(label.heightMm, 0);
  if (cw <= 0 || ch <= 0 || lw <= 0 || lh <= 0) return 0;
  return Math.min(cw / lw, ch / lh);
}

/**
 * Letterbox the physical label into the container. Canvas pixels are floored
 * from the same pxPerMM so both axes stay inside the box without a second min().
 */
export function containFitLabel(container: PixelSize, label: MillimetreSize): ContainFit {
  const cw = Math.max(0, container.widthPx);
  const ch = Math.max(0, container.heightPx);
  const pxPerMM = computeScale(container, label);
  if (pxPerMM <= 0) {
    return { pxPerMM: 0, canvasWidthPx: 1, canvasHeightPx: 1, offsetXPx: 0, offsetYPx: 0 };
  }
  const lw = Math.max(label.widthMm, 0.01);
  const lh = Math.max(label.heightMm, 0.01);
  const canvasWidthPx = Math.max(1, Math.floor(lw * pxPerMM));
  const canvasHeightPx = Math.max(1, Math.floor(lh * pxPerMM));
  return {
    pxPerMM,
    canvasWidthPx,
    canvasHeightPx,
    offsetXPx: Math.max(0, (cw - canvasWidthPx) / 2),
    offsetYPx: Math.max(0, (ch - canvasHeightPx) / 2),
  };
}

/**
 * Nested image canvas on a label (import only). Image pixels are an aspect
 * ratio; the rectangle is contain-fitted into `content` (or the full label).
 */
export function containFitImageOnLabel(
  label: MillimetreSize,
  image: PixelSize,
  content?: MmRect,
): MmRect {
  const box = content ?? {
    left: 0,
    top: 0,
    width: finitePositive(label.widthMm, 0.01),
    height: finitePositive(label.heightMm, 0.01),
  };
  const bw = finitePositive(box.width, 0.01);
  const bh = finitePositive(box.height, 0.01);
  const iw = finitePositive(image.widthPx, 1);
  const ih = finitePositive(image.heightPx, 1);
  const aspect = iw / ih;
  let width: number;
  let height: number;
  if (bw / bh > aspect) {
    height = bh;
    width = height * aspect;
  } else {
    width = bw;
    height = width / aspect;
  }
  return {
    left: box.left + (bw - width) / 2,
    top: box.top + (bh - height) / 2,
    width,
    height,
  };
}

export function mmToPx(mm: number, pxPerMM: number): number {
  if (!Number.isFinite(mm) || !Number.isFinite(pxPerMM) || pxPerMM <= 0) return 0;
  return mm * pxPerMM;
}

export function pxToMm(px: number, pxPerMM: number): number {
  if (!Number.isFinite(px) || !Number.isFinite(pxPerMM) || pxPerMM <= 0) return 0;
  return px / pxPerMM;
}

export function rectMmToPx(rect: MmRect, pxPerMM: number): MmRect {
  return {
    left: mmToPx(rect.left, pxPerMM),
    top: mmToPx(rect.top, pxPerMM),
    width: mmToPx(rect.width, pxPerMM),
    height: mmToPx(rect.height, pxPerMM),
  };
}

export function rectPxToMm(rect: MmRect, pxPerMM: number): MmRect {
  return {
    left: pxToMm(rect.left, pxPerMM),
    top: pxToMm(rect.top, pxPerMM),
    width: pxToMm(rect.width, pxPerMM),
    height: pxToMm(rect.height, pxPerMM),
  };
}

/** Printer dots/mm — 304 DPI heads are 12 dpm, not 304/25.4. */
export function printDotsPerMm(dpi = 304): number {
  return printerDotsPerMm(dpi);
}
