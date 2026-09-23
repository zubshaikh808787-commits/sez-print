/**
 * Single source of truth for clamping element bounds to the physical label canvas.
 *
 * All resize handles, drag gestures, state normalizations, and transform commits
 * delegate their boundary enforcement and overflow detection here.
 */

import { computeTextElementHeightMm } from '@/lib/text-metrics';

export type BoxMm = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type CanvasBoundsMm = {
  widthMm: number;
  heightMm: number;
};

export type ClampAnchor = 'e' | 's' | 'body';

export type ClampToLabelBoundsOpts = {
  anchor: ClampAnchor;
  minMm?: number;
  naturalHeight?: number;
};

export type ClampedBoundsResult = {
  left: number;
  top: number;
  width: number;
  height: number;
  overflowed: boolean;
};

export function roundMm(value: number): number {
  'worklet';
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/**
 * Clamps element position and size strictly inside canvas bounds [0..widthMm, 0..heightMm].
 *
 * Modes:
 * - 'e' / 's': Origin (left, top) is never rewritten. Size is capped to remaining canvas
 *        from that origin. If naturalHeight exceeds remaining height, overflowed is true
 *        and height is capped — top does not nudge.
 * - 'body': Clamps whole box position (repositioning is the point of a move/drag).
 */
export function clampToLabelBounds(
  box: BoxMm,
  canvas: CanvasBoundsMm,
  opts: ClampToLabelBoundsOpts,
): ClampedBoundsResult {
  'worklet';
  const minMm = Math.max(0.1, opts.minMm ?? 0.5);
  const canvasW = Math.max(minMm, Number.isFinite(canvas.widthMm) ? canvas.widthMm : 50);
  const canvasH = Math.max(minMm, Number.isFinite(canvas.heightMm) ? canvas.heightMm : 30);

  let left = Number.isFinite(box.left) ? box.left : 0;
  let top = Number.isFinite(box.top) ? box.top : 0;
  let width = Number.isFinite(box.width) ? box.width : minMm;
  let height = Number.isFinite(box.height) ? box.height : minMm;
  const naturalH = typeof opts.naturalHeight === 'number' && Number.isFinite(opts.naturalHeight)
    ? opts.naturalHeight
    : undefined;
  let overflowed = false;

  if (opts.anchor === 'e' || opts.anchor === 's') {
    const originLeft = left;
    const originTop = top;
    const maxAllowedWidth = Math.max(minMm, canvasW - originLeft);
    const maxAllowedHeight = Math.max(minMm, canvasH - originTop);

    if (opts.anchor === 'e') {
      width = Math.max(minMm, Math.min(width, maxAllowedWidth));
      if (naturalH !== undefined) {
        const targetH = Math.max(minMm, naturalH);
        overflowed = targetH > maxAllowedHeight;
        height = Math.max(minMm, Math.min(targetH, maxAllowedHeight));
      } else {
        height = Math.max(minMm, Math.min(height, maxAllowedHeight));
        overflowed = false;
      }
    } else {
      const targetH = Math.max(minMm, naturalH ?? height);
      overflowed = targetH > maxAllowedHeight;
      height = Math.max(minMm, Math.min(targetH, maxAllowedHeight));
      width = Math.max(minMm, Math.min(width, maxAllowedWidth));
    }

    left = originLeft;
    top = originTop;
  } else {
    // 'body' drag: allows elements to bleed or move partially outside the label canvas
    width = Math.max(minMm, width);
    const targetH = Math.max(minMm, naturalH ?? height);
    height = targetH;
    overflowed = targetH > canvasH || left < 0 || top < 0 || left + width > canvasW || top + height > canvasH;

    const minVisibleH = Math.min(height, 0.5);
    const minTop = -height + minVisibleH;
    const maxTop = canvasH - minVisibleH;
    top = Math.max(minTop, Math.min(top, maxTop));

    const minVisibleW = Math.min(width, 0.5);
    const minLeft = -width + minVisibleW;
    const maxLeft = canvasW - minVisibleW;
    left = Math.max(minLeft, Math.min(left, maxLeft));
  }

  return {
    left: roundMm(left),
    top: roundMm(top),
    width: roundMm(width),
    height: roundMm(height),
    overflowed,
  };
}

/**
 * Calculates the maximum font size (in pt) that allows the wrapped text to fit
 * within the physical label vertical space at the current element width.
 */
export function fitFontSizeToLabel(opts: {
  text: string;
  widthMm: number;
  maxHeightMm: number;
  initialFontSize?: number;
  minFontSize?: number;
  maxFontSize?: number;
  autoWrapping?: string;
  lineSpacing?: string;
  charSpacing?: number;
  bold?: boolean;
  verticalDisplay?: boolean;
}): number {
  const minFs = Math.max(4, opts.minFontSize ?? 4);
  const maxFs = Math.min(72, Math.max(minFs, opts.maxFontSize ?? (opts.initialFontSize ?? 72)));
  let bestFs = minFs;
  let low = Math.round(minFs * 2);
  let high = Math.round(maxFs * 2);

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const fs = mid / 2;
    const h = computeTextElementHeightMm({
      text: opts.text,
      fontSize: fs,
      widthMm: opts.widthMm,
      autoWrapping: (opts.autoWrapping as any) ?? 'Word',
      lineSpacing: (opts.lineSpacing as any) ?? '1.0',
      charSpacing: opts.charSpacing ?? 0,
      bold: opts.bold ?? false,
      verticalDisplay: opts.verticalDisplay ?? false,
    });
    if (h <= opts.maxHeightMm + 0.05) {
      bestFs = fs;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return bestFs;
}
