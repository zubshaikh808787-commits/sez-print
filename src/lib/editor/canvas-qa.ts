/**
 * Phase 7 QA contracts. Device rows live in `docs/canvas-qa-checklist.md`.
 *
 * Pointer math uses React Native logical pixels (RNGH `absoluteX/Y`). Device
 * pixel ratio is a print-capture concern, not an editor-coordinate input.
 */

/** Gesture window points are density-independent. */
export const POINTER_COORD_SPACE = 'logical-px' as const;

/** Busy-label floor from Task 7.1 (10+ elements, plus a photo on device). */
export const QA_BUSY_ELEMENT_COUNT = 12;

export const QA_TARGET_FPS = 60;

/** mdpi / xhdpi / xxhdpi stand-ins. All must share the same millimetre result. */
export const QA_DENSITY_SAMPLES = [1, 2, 3] as const;

/**
 * Pass-through so tests prove density is not applied to pointer coordinates.
 * `_devicePixelRatio` is accepted only to document that it must be ignored.
 */
export function pointerLogicalPx(windowPx: number, _devicePixelRatio: number): number {
  if (!Number.isFinite(windowPx)) return 0;
  return windowPx;
}
