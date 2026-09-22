/**
 * Canvas vs. editing-panel split (Task 1.1).
 *
 * Heights are screen pixels of the split column only (below the editor header /
 * size chip). Element millimetres are never stored here.
 */

/** Canvas region may shrink to 0 when user drags sheet all the way up to full expansion. */
export const CANVAS_SPLIT_MIN_RATIO = 0;

/** Default opening split: canvas gets remaining space above the full tool palette. */
export const DEFAULT_CANVAS_SPLIT_RATIO = 0.42;

/** Visible hairline. Hit target is `DIVIDER_HIT_SIZE_PX`. */
export const DIVIDER_BAR_THICKNESS_PX = 3;

/** Minimum finger/mouse target on the divider (lean visual, large hit area). */
export const DIVIDER_HIT_SIZE_PX = 44;

/**
 * Height required to fit the entire tool palette (toolbar row + all 4 tool rows:
 * Text through Signature) without scrolling or clipping (exact measured requirement).
 * Used as the DEFAULT resting height on fresh label open.
 */
export const PANEL_DEFAULT_HEIGHT_PX = 318;

/**
 * Minimum draggable sheet height: pinned toolbar row (48px).
 * Allows user to collapse the sheet down to just the toolbar row, maximizing canvas size
 * while keeping the toolbar pinned and visible at all times.
 */
export const PANEL_MIN_HEIGHT_PX = 48;

/** Extra sheet reservation when the millimetre nudge pad is visible. */
export const NUDGE_PAD_SPLIT_EXTRA_PX = 96;

/** Drag-release past this share of usable height snaps to full-screen canvas. */
export const FULLSCREEN_SNAP_RATIO = 0.9;

/** Maximize / restore transition (Task 1.2 acceptance: 150–250ms). */
export const SPLIT_ANIMATION_MS = 200;

/** Debounce rulers/guides while the divider is moving (Task 1.3). */
export const RULER_DEBOUNCE_MS = 48;

/** Padding on stage vertical edges. Zeroed so workspace uses the full container. */
export const STAGE_PADDING_Y_PX = 0;

export type ClampCanvasSplitInput = {
  viewportPx: number;
  requestedCanvasPx: number;
  canvasMinRatio?: number;
  panelMinPx?: number;
  dividerPx?: number;
};

export function usableSplitViewportPx(
  viewportPx: number,
  dividerPx = DIVIDER_HIT_SIZE_PX,
): number {
  'worklet';
  const viewport = Number.isFinite(viewportPx) ? Math.max(0, viewportPx) : 0;
  const divider = Number.isFinite(dividerPx) ? Math.max(0, dividerPx) : 0;
  return Math.max(0, viewport - divider);
}

function finitePx(value: number, fallback: number): number {
  'worklet';
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Clamp a requested canvas height so both regions stay usable.
 * If the viewport is too short for both mins, canvas keeps the 35% share.
 */
export function clampCanvasSplitHeight(input: ClampCanvasSplitInput): number {
  'worklet';
  const viewport = Math.max(0, finitePx(input.viewportPx, 0));
  const divider = Math.max(0, finitePx(input.dividerPx ?? DIVIDER_HIT_SIZE_PX, DIVIDER_HIT_SIZE_PX));
  const ratio = finitePx(input.canvasMinRatio ?? CANVAS_SPLIT_MIN_RATIO, CANVAS_SPLIT_MIN_RATIO);
  const panelMin = Math.max(0, finitePx(input.panelMinPx ?? PANEL_MIN_HEIGHT_PX, PANEL_MIN_HEIGHT_PX));
  const usable = Math.max(0, viewport - divider);
  if (usable <= 0) return 0;

  const canvasMin = usable * Math.min(0.95, Math.max(0, ratio));
  const requested = finitePx(input.requestedCanvasPx, canvasMin);

  if (canvasMin + panelMin > usable) {
    return Math.round(Math.min(usable, Math.max(0, canvasMin)));
  }

  const canvasMax = usable - panelMin;
  return Math.round(Math.min(canvasMax, Math.max(canvasMin, requested)));
}

export function defaultCanvasSplitHeight(
  viewportPx: number,
  extras?: Pick<ClampCanvasSplitInput, 'canvasMinRatio' | 'panelMinPx' | 'dividerPx'> & {
    panelDefaultPx?: number;
  },
): number {
  'worklet';
  const usable = usableSplitViewportPx(viewportPx, extras?.dividerPx);
  const panelDefault = Math.max(0, finitePx(extras?.panelDefaultPx ?? PANEL_DEFAULT_HEIGHT_PX, PANEL_DEFAULT_HEIGHT_PX));
  const panelMin = Math.max(0, finitePx(extras?.panelMinPx ?? PANEL_MIN_HEIGHT_PX, PANEL_MIN_HEIGHT_PX));
  return clampCanvasSplitHeight({
    viewportPx,
    requestedCanvasPx: Math.max(0, usable - panelDefault),
    ...extras,
    panelMinPx: panelMin,
  });
}

/** Map a vertical pointer delta onto a clamped canvas height. */
export function canvasHeightAfterDrag(input: {
  startCanvasPx: number;
  deltaY: number;
  viewportPx: number;
  panelMinPx?: number;
  dividerPx?: number;
  canvasMinRatio?: number;
}): number {
  'worklet';
  return clampCanvasSplitHeight({
    viewportPx: input.viewportPx,
    requestedCanvasPx: finitePx(input.startCanvasPx, 0) + finitePx(input.deltaY, 0),
    panelMinPx: input.panelMinPx,
    dividerPx: input.dividerPx,
    canvasMinRatio: input.canvasMinRatio,
  });
}

export function clampStoredSplitRatio(ratio: number): number {
  const n = finitePx(ratio, DEFAULT_CANVAS_SPLIT_RATIO);
  return Math.min(FULLSCREEN_SNAP_RATIO - 0.01, Math.max(CANVAS_SPLIT_MIN_RATIO, n));
}

export function canvasSplitRatioFromHeight(
  canvasPx: number,
  viewportPx: number,
  dividerPx = DIVIDER_HIT_SIZE_PX,
): number {
  const usable = usableSplitViewportPx(viewportPx, dividerPx);
  if (usable <= 0) return DEFAULT_CANVAS_SPLIT_RATIO;
  return clampStoredSplitRatio(finitePx(canvasPx, 0) / usable);
}

export function workspaceHeightFromSplit(
  canvasSplitH: number,
  paddingY = STAGE_PADDING_Y_PX,
): number {
  'worklet';
  return Math.max(1, finitePx(canvasSplitH, 0) - finitePx(paddingY, STAGE_PADDING_Y_PX));
}

export function restoreCanvasSplitHeight(input: {
  ratio?: number | null;
  fullscreen: boolean;
  viewportPx: number;
  panelMinPx?: number;
  panelDefaultPx?: number;
  dividerPx?: number;
}): number {
  'worklet';
  const usable = usableSplitViewportPx(input.viewportPx, input.dividerPx);
  const panelMin = Math.max(0, finitePx(input.panelMinPx ?? PANEL_MIN_HEIGHT_PX, PANEL_MIN_HEIGHT_PX));
  if (input.fullscreen) {
    return clampCanvasSplitHeight({
      viewportPx: input.viewportPx,
      requestedCanvasPx: Number.MAX_SAFE_INTEGER,
      panelMinPx: panelMin,
      dividerPx: input.dividerPx,
    });
  }
  const panelDefault = Math.max(0, finitePx(input.panelDefaultPx ?? PANEL_DEFAULT_HEIGHT_PX, PANEL_DEFAULT_HEIGHT_PX));
  const requestedCanvasPx =
    input.ratio != null && Number.isFinite(input.ratio)
      ? usable * clampStoredSplitRatio(input.ratio)
      : Math.max(0, usable - panelDefault);
  return clampCanvasSplitHeight({
    viewportPx: input.viewportPx,
    requestedCanvasPx,
    panelMinPx: panelMin,
    dividerPx: input.dividerPx,
  });
}

export function persistableSplitRatio(input: {
  canvasPx: number;
  viewportPx: number;
  fullscreen: boolean;
  lastRatio?: number;
  dividerPx?: number;
}): number {
  if (input.fullscreen) {
    return clampStoredSplitRatio(input.lastRatio ?? DEFAULT_CANVAS_SPLIT_RATIO);
  }
  return canvasSplitRatioFromHeight(input.canvasPx, input.viewportPx, input.dividerPx);
}

export type SplitReleaseResult = {
  canvasPx: number;
  fullscreen: boolean;
  snapped: boolean;
};

/** On pointer-up: snap to full-screen near 90%, otherwise keep the clamped height. */
export function resolveSplitRelease(input: {
  canvasPx: number;
  viewportPx: number;
  panelMinPx?: number;
  dividerPx?: number;
}): SplitReleaseResult {
  'worklet';
  const usable = usableSplitViewportPx(input.viewportPx, input.dividerPx);
  const ratio = usable > 0 ? finitePx(input.canvasPx, 0) / usable : 0;
  if (ratio >= FULLSCREEN_SNAP_RATIO) {
    return {
      canvasPx: restoreCanvasSplitHeight({
        ratio: 1,
        fullscreen: true,
        viewportPx: input.viewportPx,
        dividerPx: input.dividerPx,
      }),
      fullscreen: true,
      snapped: true,
    };
  }
  return {
    canvasPx: clampCanvasSplitHeight({
      viewportPx: input.viewportPx,
      requestedCanvasPx: input.canvasPx,
      panelMinPx: input.panelMinPx,
      dividerPx: input.dividerPx,
    }),
    fullscreen: false,
    snapped: false,
  };
}
