/**
 * Phase 8 Skia prototype — millimetre mapping and migration gate.
 *
 * Production editor stays on RN Views (`KonvaCanvas`). This module is the
 * engine-agnostic contract a Skia artboard must obey: same `boundBoxMm` /
 * `dragBoundMm` as Phase 5/3. A full rewrite is only justified if device FPS
 * shows the current path cannot hold ~60fps (Phase 7).
 */

import { dragBoundMm, type CanvasBounds } from '@/lib/editor/engine';
import { boundBoxMm, type MmBox, type ResizeAnchor } from '@/lib/editor/resize-policy';
import { mmToPx, pxToMm } from '@/lib/label-coordinate-system';
import { QA_TARGET_FPS } from '@/lib/editor/canvas-qa';

export const SKIA_PROTOTYPE_SCOPE = 'artboard+image' as const;

/** Production renderer until `compareRendererFps` says otherwise. */
export const PRODUCTION_RENDERER = 'rn-view' as const;

export type RendererKind = 'rn-view' | 'skia';

export type SkiaRect = { x: number; y: number; width: number; height: number };

export function mmBoxToSkiaRect(box: MmBox, pxPerMm: number): SkiaRect {
  return {
    x: mmToPx(box.left, pxPerMm),
    y: mmToPx(box.top, pxPerMm),
    width: Math.max(1, mmToPx(box.width, pxPerMm)),
    height: Math.max(1, mmToPx(box.height, pxPerMm)),
  };
}

export function skiaRectToMmBox(rect: SkiaRect, pxPerMm: number): MmBox {
  return {
    left: pxToMm(rect.x, pxPerMm),
    top: pxToMm(rect.y, pxPerMm),
    width: pxToMm(rect.width, pxPerMm),
    height: pxToMm(rect.height, pxPerMm),
  };
}

/** Image drag on the Skia prototype: same clamp as the RN editor. */
export function skiaImageDragMm(opts: {
  leftMm: number;
  topMm: number;
  widthMm: number;
  heightMm: number;
  canvas: CanvasBounds;
}): MmBox {
  const next = dragBoundMm(opts.leftMm, opts.topMm, opts.widthMm, opts.heightMm, opts.canvas);
  return { left: next.left, top: next.top, width: opts.widthMm, height: opts.heightMm };
}

/** Image resize on the Skia prototype: Phase 5 `boundBoxMm`, not a new policy. */
export function skiaImageResizeMm(opts: {
  anchor: ResizeAnchor;
  start: MmBox;
  proposed: { width: number; height: number };
  aspect: number;
  canvas: CanvasBounds;
  minMm: number;
}): MmBox {
  return boundBoxMm({
    anchor: opts.anchor,
    behavior: 'aspect',
    start: opts.start,
    proposed: opts.proposed,
    aspect: opts.aspect,
    minMm: opts.minMm,
    canvas: opts.canvas,
  });
}

export type FpsComparison = {
  rnViewFps: number | null;
  skiaFps: number | null;
  targetFps?: number;
};

export type MigrationDecision = {
  migrate: boolean;
  productionRenderer: RendererKind;
  reason: string;
};

/**
 * Full Skia migration is a rewrite. Only recommend it when the RN view path
 * misses the FPS target and Skia is measured to clear it.
 */
export function compareRendererFps(samples: FpsComparison): MigrationDecision {
  const target = samples.targetFps ?? QA_TARGET_FPS;
  if (samples.rnViewFps == null || samples.skiaFps == null) {
    return {
      migrate: false,
      productionRenderer: PRODUCTION_RENDERER,
      reason: 'Need paired device FPS on the same busy label before changing renderer.',
    };
  }
  if (samples.rnViewFps >= target) {
    return {
      migrate: false,
      productionRenderer: PRODUCTION_RENDERER,
      reason: `RN views already hold ${samples.rnViewFps}fps (≥ ${target}). No WebView ceiling to escape.`,
    };
  }
  if (samples.skiaFps >= target && samples.skiaFps - samples.rnViewFps >= 8) {
    return {
      migrate: true,
      productionRenderer: 'skia',
      reason: `RN views at ${samples.rnViewFps}fps miss ${target}; Skia at ${samples.skiaFps}fps clears it.`,
    };
  }
  return {
    migrate: false,
    productionRenderer: PRODUCTION_RENDERER,
    reason: `Skia (${samples.skiaFps}fps) does not beat the RN view ceiling by enough to justify a rewrite.`,
  };
}
