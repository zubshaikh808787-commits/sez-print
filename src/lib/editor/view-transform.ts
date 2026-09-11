/**
 * Editor view chrome on top of the millimetre artboard.
 *
 * Fit `pxPerMM` is computed once from the pad + label (`fitEditorPadBoard`).
 * Pinch/button zoom is a separate multiplier (25%–800%). Pointer math lives
 * in `label-coordinate-system` so every drop uses the same invert.
 */

import {
  pointerToMm,
  viewPxPerMm,
  type EditorViewTransform,
  type ViewPoint,
} from '@/lib/label-coordinate-system';
import { clampBoxOnCanvas, SNAP_THRESHOLD_MM } from '@/lib/editor/engine';

export {
  mmToPointer,
  pointerToMm,
  viewPxPerMm,
  invertViewPoint,
  type EditorViewTransform,
  type ViewPoint,
} from '@/lib/label-coordinate-system';

/** Matches `styles.workspace.paddingBottom` on the editor pad. */
export const EDITOR_WORKSPACE_PAD_BOTTOM_PX = 40;

export const VIEW_ZOOM_MIN = 0.25;
export const VIEW_ZOOM_MAX = 8;
export const VIEW_ZOOM_STEP = 1.25;
export const VIEW_ZOOM_FIT = 1;

export function clampViewZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return VIEW_ZOOM_FIT;
  return Math.min(VIEW_ZOOM_MAX, Math.max(VIEW_ZOOM_MIN, zoom));
}

export function stepViewZoom(zoom: number, direction: 1 | -1): number {
  const next = direction > 0 ? zoom * VIEW_ZOOM_STEP : zoom / VIEW_ZOOM_STEP;
  return Math.round(clampViewZoom(next) * 100) / 100;
}

export function artboardOriginInPad(opts: {
  viewWidthPx: number;
  viewHeightPx: number;
  innerWidthPx: number;
  innerHeightPx: number;
  rulerSizePx: number;
  boardOffsetXPx: number;
  boardOffsetYPx: number;
  workspacePaddingBottomPx?: number;
}): { x: number; y: number } {
  const padBottom = Math.max(0, opts.workspacePaddingBottomPx ?? EDITOR_WORKSPACE_PAD_BOTTOM_PX);
  const boardW = opts.rulerSizePx + opts.innerWidthPx;
  const boardH = opts.rulerSizePx + opts.innerHeightPx;
  const availH = Math.max(0, opts.viewHeightPx - padBottom);
  const frameLeft = (opts.viewWidthPx - boardW) / 2;
  const frameTop = (availH - boardH) / 2;
  return {
    x: frameLeft + opts.rulerSizePx + opts.boardOffsetXPx,
    y: frameTop + opts.rulerSizePx + opts.boardOffsetYPx,
  };
}

export function editorViewTransform(opts: {
  pxPerMM: number;
  viewZoom: number;
  panX: number;
  panY: number;
  viewWidthPx: number;
  viewHeightPx: number;
  innerWidthPx: number;
  innerHeightPx: number;
  rulerSizePx: number;
  boardOffsetXPx: number;
  boardOffsetYPx: number;
  workspacePaddingBottomPx?: number;
}): EditorViewTransform {
  const origin = artboardOriginInPad(opts);
  return {
    pxPerMM: opts.pxPerMM,
    viewZoom: clampViewZoom(opts.viewZoom),
    panX: Number.isFinite(opts.panX) ? opts.panX : 0,
    panY: Number.isFinite(opts.panY) ? opts.panY : 0,
    viewWidthPx: opts.viewWidthPx,
    viewHeightPx: opts.viewHeightPx,
    artboardOriginXPx: origin.x,
    artboardOriginYPx: origin.y,
  };
}

export function windowPointToPadPoint(
  windowPoint: ViewPoint,
  padOriginInWindow: ViewPoint,
): ViewPoint {
  return {
    x: windowPoint.x - padOriginInWindow.x,
    y: windowPoint.y - padOriginInWindow.y,
  };
}

/** Window/client point → artboard mm. This is the only drop/drag invert. */
export function windowPointToMm(
  windowPoint: ViewPoint,
  padOriginInWindow: ViewPoint,
  view: EditorViewTransform,
): ViewPoint {
  return pointerToMm(windowPointToPadPoint(windowPoint, padOriginInWindow), view);
}

/**
 * Screen-space finger delta → artboard mm. Pan cancels; zoom does not.
 * Same result as `windowPointToMm(end) - windowPointToMm(start)` for a linear view.
 */
export function pointerDeltaToMm(
  deltaWindowPx: ViewPoint,
  view: Pick<EditorViewTransform, 'pxPerMM' | 'viewZoom'>,
): ViewPoint {
  const scale = viewPxPerMm(view.pxPerMM, view.viewZoom);
  if (!(scale > 0)) return { x: 0, y: 0 };
  return { x: deltaWindowPx.x / scale, y: deltaWindowPx.y / scale };
}

export function grabOffsetMm(pointerMm: ViewPoint, elementTopLeft: ViewPoint): ViewPoint {
  return {
    x: pointerMm.x - elementTopLeft.x,
    y: pointerMm.y - elementTopLeft.y,
  };
}

/** Screen pixels of snap pull, converted to millimetres at the live view scale. */
export const SNAP_GUIDE_PX = 5;

export function snapThresholdMm(
  fitPxPerMm: number,
  viewZoom: number,
  snapPx = SNAP_GUIDE_PX,
): number {
  const scale = viewPxPerMm(fitPxPerMm, viewZoom);
  if (!(scale > 0) || !(snapPx > 0)) return SNAP_THRESHOLD_MM;
  return snapPx / scale;
}

/** Top-left so the grabbed point stays under the finger, clamped to the label. */
export function dropTopLeftMm(opts: {
  pointerMm: ViewPoint;
  grabOffsetMm: ViewPoint;
  widthMm: number;
  heightMm: number;
  canvas: { widthMm: number; heightMm: number };
}): { left: number; top: number } {
  return clampBoxOnCanvas(
    opts.pointerMm.x - opts.grabOffsetMm.x,
    opts.pointerMm.y - opts.grabOffsetMm.y,
    opts.widthMm,
    opts.heightMm,
    opts.canvas,
  );
}
