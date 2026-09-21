/**
 * Group resize math for multi-select — canonical contract for live preview and commit.
 *
 * Ratio-based scaling from a dragged anchor handle, with per-element resize policy
 * applied after group-bbox-fixed-opposite-edge positioning.
 */

import { elementSizeMm, textBlockHeightMm, type LabelElement } from '@/lib/label-document';
import { finiteMm, roundMm, type CanvasBounds } from '@/lib/editor/engine';
import { clampToLabelBounds } from '@/lib/editor/label-bounds';
import {
  aspectRatioOf,
  resizePolicyFor,
  type MmBox,
  type ResizeAnchor,
  type ResizeBehavior,
} from '@/lib/editor/resize-policy';
import { unionBounds } from '@/lib/editor/selection';
import { computeTextElementHeightMm } from '@/lib/text-metrics';

export type GroupResizeHandle = ResizeAnchor;

export type GroupFixedOrigin = { left: number; top: number };

export type GroupResizeScaleFactors = { scaleX: number; scaleY: number };

export type GroupResizeScaleLimits = {
  minScaleX: number;
  maxScaleX: number;
  minScaleY: number;
  maxScaleY: number;
};

/** Worklet-safe resize behavior codes for live preview. */
export type ResizeBehaviorCode = -1 | 0 | 1 | 2 | 3;

export type GroupResizeBlockedReason = 'rotation' | 'empty_selection';

export type GroupResizeMemberPatch = MmBox;

export type GroupResizeResult =
  | {
      ok: true;
      patches: Map<string, GroupResizeMemberPatch>;
      scaleX: number;
      scaleY: number;
      fixedOrigin: GroupFixedOrigin;
    }
  | { ok: false; reason: GroupResizeBlockedReason };

const MIN_SCALE = 0.001;
const MAX_SCALE = 1000;

function finiteScale(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

/** v1: block group resize when any selected element is rotated off-axis. */
export function selectionHasBlockedRotation(elements: LabelElement[], ids: string[]): boolean {
  for (const el of elements) {
    if (!ids.includes(el.id)) continue;
    const rot = 'rotation' in el ? el.rotation : 0;
    if (typeof rot === 'number' && rot % 360 !== 0) return true;
  }
  return false;
}

export function isGroupResizeEligible(element: LabelElement): boolean {
  if (element.type === 'border') return false;
  if (element.lockMovement) return false;
  if (element.needPrinting === false) return false;
  return resizePolicyFor(element).anchors.length > 0;
}

/** Snapshot start boxes for all group-resize participants. */
export function buildGroupResizeSnapshots(
  elements: LabelElement[],
  ids: string[],
): Map<string, MmBox> {
  const snapshots = new Map<string, MmBox>();
  for (const el of elements) {
    if (!ids.includes(el.id) || !isGroupResizeEligible(el)) continue;
    const size = elementSizeMm(el);
    snapshots.set(el.id, {
      left: finiteMm(el.left),
      top: finiteMm(el.top),
      width: finiteMm(size.width, 0.5),
      height: finiteMm(size.height, 0.5),
    });
  }
  return snapshots;
}

/** Fixed origin = top-left of the selection union (opposite edge from E/S growth). */
export function groupFixedOriginFromUnion(union: MmBox): GroupFixedOrigin {
  return { left: union.left, top: union.top };
}

/**
 * Derive group scale factors from the anchor's start vs proposed box.
 * Square/aspect anchor behaviors link both axes to the dragged dimension.
 */
export function scaleFactorsFromAnchor(opts: {
  anchorStart: MmBox;
  anchorProposed: MmBox;
  handle: GroupResizeHandle;
  anchorBehavior: ResizeBehavior;
}): GroupResizeScaleFactors {
  const { anchorStart, anchorProposed, handle, anchorBehavior } = opts;
  const startW = Math.max(MIN_SCALE, anchorStart.width);
  const startH = Math.max(MIN_SCALE, anchorStart.height);

  if (handle === 'e') {
    const scaleX = finiteScale(anchorProposed.width / startW);
    if (anchorBehavior === 'square' || anchorBehavior === 'aspect') {
      return { scaleX, scaleY: scaleX };
    }
    return { scaleX, scaleY: 1 };
  }

  const scaleY = finiteScale(anchorProposed.height / startH);
  if (anchorBehavior === 'square' || anchorBehavior === 'aspect') {
    return { scaleX: scaleY, scaleY };
  }
  return { scaleX: 1, scaleY };
}

function memberParticipatesOnHandle(element: LabelElement, handle: GroupResizeHandle): boolean {
  const policy = resizePolicyFor(element);
  return policy.anchors.includes(handle) && Boolean(policy.behavior[handle]);
}

function minScaleForMemberOnAxis(
  start: MmBox,
  minMm: number,
  handle: GroupResizeHandle,
  behavior: ResizeBehavior,
): { minScaleX: number; minScaleY: number } {
  const minW = Math.max(MIN_SCALE, start.width);
  const minH = Math.max(MIN_SCALE, start.height);
  const floor = Math.max(0.1, minMm);

  if (handle === 'e') {
    if (behavior === 'square') {
      const s = floor / Math.max(minW, minH);
      return { minScaleX: s, minScaleY: s };
    }
    if (behavior === 'aspect') {
      const s = floor / minW;
      return { minScaleX: s, minScaleY: s };
    }
    if (behavior === 'width') {
      return { minScaleX: floor / minW, minScaleY: MIN_SCALE };
    }
    return { minScaleX: MIN_SCALE, minScaleY: MIN_SCALE };
  }

  if (behavior === 'square') {
    const s = floor / Math.max(minW, minH);
    return { minScaleX: s, minScaleY: s };
  }
  if (behavior === 'aspect') {
    const s = floor / minH;
    return { minScaleX: s, minScaleY: s };
  }
  if (behavior === 'height') {
    return { minScaleX: MIN_SCALE, minScaleY: floor / minH };
  }
  return { minScaleX: MIN_SCALE, minScaleY: MIN_SCALE };
}

function maxScaleForMemberOnAxis(
  start: MmBox,
  fixedOrigin: GroupFixedOrigin,
  canvas: CanvasBounds,
  handle: GroupResizeHandle,
  behavior: ResizeBehavior,
): { maxScaleX: number; maxScaleY: number } {
  const relLeft = start.left - fixedOrigin.left;
  const relTop = start.top - fixedOrigin.top;
  const canvasW = Math.max(0.1, canvas.widthMm);
  const canvasH = Math.max(0.1, canvas.heightMm);

  let maxScaleX = MAX_SCALE;
  let maxScaleY = MAX_SCALE;

  if (handle === 'e') {
    const spanX = relLeft + start.width;
    if (spanX > MIN_SCALE) {
      maxScaleX = Math.min(maxScaleX, (canvasW - fixedOrigin.left) / spanX);
    }
    if (behavior === 'square' || behavior === 'aspect') {
      const spanY = relTop + start.height;
      if (spanY > MIN_SCALE) {
        maxScaleY = Math.min(maxScaleY, (canvasH - fixedOrigin.top) / spanY);
        maxScaleX = Math.min(maxScaleX, maxScaleY);
      }
    }
  }

  if (handle === 's') {
    const spanY = relTop + start.height;
    if (spanY > MIN_SCALE) {
      maxScaleY = Math.min(maxScaleY, (canvasH - fixedOrigin.top) / spanY);
    }
    if (behavior === 'square' || behavior === 'aspect') {
      const spanX = relLeft + start.width;
      if (spanX > MIN_SCALE) {
        maxScaleX = Math.min(maxScaleX, (canvasW - fixedOrigin.left) / spanX);
        maxScaleY = Math.min(maxScaleY, maxScaleX);
      }
    }
  }

  return {
    maxScaleX: Math.max(MIN_SCALE, maxScaleX),
    maxScaleY: Math.max(MIN_SCALE, maxScaleY),
  };
}

export function resizeBehaviorToCode(behavior?: ResizeBehavior): ResizeBehaviorCode {
  if (!behavior) return -1;
  if (behavior === 'width') return 0;
  if (behavior === 'height') return 1;
  if (behavior === 'square') return 2;
  return 3;
}

/** Precomputed scale bounds for UI-thread clamping during live preview. */
export function getGroupResizeScaleLimits(opts: {
  elements: LabelElement[];
  snapshots: Map<string, MmBox>;
  selectedIds: string[];
  handle: GroupResizeHandle;
  fixedOrigin: GroupFixedOrigin;
  canvas: CanvasBounds;
}): GroupResizeScaleLimits {
  const { elements, snapshots, selectedIds, handle, fixedOrigin, canvas } = opts;

  let minScaleX = MIN_SCALE;
  let minScaleY = MIN_SCALE;
  let maxScaleX = MAX_SCALE;
  let maxScaleY = MAX_SCALE;

  for (const id of selectedIds) {
    const el = elements.find((e) => e.id === id);
    const start = snapshots.get(id);
    if (!el || !start || !isGroupResizeEligible(el)) continue;
    if (!memberParticipatesOnHandle(el, handle)) continue;

    const policy = resizePolicyFor(el);
    const behavior = policy.behavior[handle]!;
    const mins = minScaleForMemberOnAxis(start, policy.minMm, handle, behavior);
    const maxs = maxScaleForMemberOnAxis(start, fixedOrigin, canvas, handle, behavior);

    minScaleX = Math.max(minScaleX, mins.minScaleX);
    minScaleY = Math.max(minScaleY, mins.minScaleY);
    maxScaleX = Math.min(maxScaleX, maxs.maxScaleX);
    maxScaleY = Math.min(maxScaleY, maxs.maxScaleY);
  }

  return {
    minScaleX,
    maxScaleX: Math.max(MIN_SCALE, maxScaleX),
    minScaleY,
    maxScaleY: Math.max(MIN_SCALE, maxScaleY),
  };
}

function clampProposedScales(
  handle: GroupResizeHandle,
  proposedScaleX: number,
  proposedScaleY: number,
  limits: GroupResizeScaleLimits,
): GroupResizeScaleFactors {
  const axesLinked =
    Math.abs(proposedScaleX - proposedScaleY) < 1e-9 && Math.abs(proposedScaleX - 1) > 1e-9;

  let scaleX = finiteScale(proposedScaleX);
  let scaleY = finiteScale(proposedScaleY);

  if (handle === 'e') {
    scaleX = Math.min(Math.max(scaleX, limits.minScaleX), limits.maxScaleX);
    scaleY = axesLinked ? scaleX : 1;
  } else {
    scaleY = Math.min(Math.max(scaleY, limits.minScaleY), limits.maxScaleY);
    scaleX = axesLinked ? scaleY : 1;
  }

  return { scaleX, scaleY };
}

/**
 * Coupled scale cap: the whole group stops when any member would violate its floor
 * or exceed canvas bounds on the active axes.
 */
export function capGroupResizeScales(opts: {
  elements: LabelElement[];
  snapshots: Map<string, MmBox>;
  selectedIds: string[];
  handle: GroupResizeHandle;
  fixedOrigin: GroupFixedOrigin;
  proposedScaleX: number;
  proposedScaleY: number;
  canvas: CanvasBounds;
}): GroupResizeScaleFactors {
  const {
    elements,
    snapshots,
    selectedIds,
    handle,
    fixedOrigin,
    proposedScaleX,
    proposedScaleY,
    canvas,
  } = opts;

  const limits = getGroupResizeScaleLimits({
    elements,
    snapshots,
    selectedIds,
    handle,
    fixedOrigin,
    canvas,
  });

  return clampProposedScales(handle, proposedScaleX, proposedScaleY, limits);
}

function textRawContent(element: LabelElement): string {
  if (element.type === 'text' || element.type === 'arctext') {
    return element.text;
  }
  if (element.type === 'degrees' || element.type === 'barcode' || element.type === 'qrcode') {
    return element.content;
  }
  return '';
}

function naturalTextHeightMm(element: LabelElement, widthMm: number): number | undefined {
  if (element.type === 'text' || element.type === 'degrees') {
    const autoHeight =
      element.autoTextHeight !== false && (element.autoWrapping ?? 'Word') !== 'Close';
    if (!autoHeight) return undefined;
    const rawText =
      element.contentType === 'Data Source' && element.columnNameContent
        ? `{${element.columnNameContent}}`
        : textRawContent(element);
    const fs = typeof element.fontSize === 'number' ? element.fontSize : 12;
    return computeTextElementHeightMm({
      text: rawText,
      fontSize: fs,
      widthMm,
      autoWrapping: element.autoWrapping ?? 'Word',
      lineSpacing: element.lineSpacing ?? '1.0',
      charSpacing: element.charSpacing ?? 0,
      bold: element.bold ?? false,
      verticalDisplay: element.verticalDisplay ?? false,
    });
  }
  if (element.type === 'time') {
    const fs = typeof element.fontSize === 'number' ? element.fontSize : 12;
    return textBlockHeightMm(fs, 1);
  }
  return undefined;
}

/** Position scales are axis-specific; dimension scales may link axes for square/aspect. */
export function positionScalesForHandle(
  handle: GroupResizeHandle | 0 | 1,
  scaleX: number,
  scaleY: number,
): { posScaleX: number; posScaleY: number } {
  'worklet';
  const isEast = handle === 'e' || handle === 0;
  if (isEast) {
    return { posScaleX: scaleX, posScaleY: 1 };
  }
  return { posScaleX: 1, posScaleY: scaleY };
}

/**
 * UI-thread group resize box for one member (mirrors applyGroupResizeMember).
 * `handle`: 0 = east, 1 = south.
 */
export function applyGroupResizeMemberWorklet(opts: {
  startLeft: number;
  startTop: number;
  startWidth: number;
  startHeight: number;
  fixedOriginLeft: number;
  fixedOriginTop: number;
  scaleX: number;
  scaleY: number;
  handle: 0 | 1;
  behaviorCode: ResizeBehaviorCode;
  aspect: number;
  naturalHeightMm?: number;
}): MmBox {
  'worklet';
  if (opts.behaviorCode < 0) {
    return {
      left: opts.startLeft,
      top: opts.startTop,
      width: opts.startWidth,
      height: opts.startHeight,
    };
  }

  const relLeft = opts.startLeft - opts.fixedOriginLeft;
  const relTop = opts.startTop - opts.fixedOriginTop;
  const aspect = opts.aspect > 0 ? opts.aspect : 1;
  const { posScaleX, posScaleY } = positionScalesForHandle(
    opts.handle,
    opts.scaleX,
    opts.scaleY,
  );

  let nextLeft = opts.fixedOriginLeft + relLeft * posScaleX;
  let nextTop = opts.fixedOriginTop + relTop * posScaleY;
  let nextWidth = opts.startWidth;
  let nextHeight = opts.startHeight;

  if (opts.handle === 0) {
    if (opts.behaviorCode === 0) {
      nextWidth = opts.startWidth * opts.scaleX;
    } else if (opts.behaviorCode === 2) {
      const side = opts.startWidth * opts.scaleX;
      nextWidth = side;
      nextHeight = side;
    } else if (opts.behaviorCode === 3) {
      nextWidth = opts.startWidth * opts.scaleX;
      nextHeight = nextWidth / aspect;
    }
  } else if (opts.behaviorCode === 1) {
    nextHeight = opts.startHeight * opts.scaleY;
  } else if (opts.behaviorCode === 2) {
    const side = opts.startHeight * opts.scaleY;
    nextWidth = side;
    nextHeight = side;
  } else if (opts.behaviorCode === 3) {
    nextHeight = opts.startHeight * opts.scaleY;
    nextWidth = nextHeight * aspect;
  }

  if (typeof opts.naturalHeightMm === 'number' && Number.isFinite(opts.naturalHeightMm)) {
    nextHeight = opts.naturalHeightMm;
  }

  return {
    left: roundMm(nextLeft),
    top: roundMm(nextTop),
    width: roundMm(nextWidth),
    height: roundMm(nextHeight),
  };
}

/**
 * Apply group scale to one member using its own resize policy.
 * Position scales from the group fixed origin; dimensions follow per-type rules.
 */
export function applyGroupResizeMember(opts: {
  element: LabelElement;
  start: MmBox;
  fixedOrigin: GroupFixedOrigin;
  scaleX: number;
  scaleY: number;
  handle: GroupResizeHandle;
}): MmBox {
  const { element, start, fixedOrigin, scaleX, scaleY, handle } = opts;
  const policy = resizePolicyFor(element);

  if (!memberParticipatesOnHandle(element, handle)) {
    return { ...start };
  }

  const behavior = policy.behavior[handle]!;
  const relLeft = start.left - fixedOrigin.left;
  const relTop = start.top - fixedOrigin.top;
  const { posScaleX, posScaleY } = positionScalesForHandle(handle, scaleX, scaleY);

  let nextLeft = fixedOrigin.left + relLeft * posScaleX;
  let nextTop = fixedOrigin.top + relTop * posScaleY;
  let nextWidth = start.width;
  let nextHeight = start.height;

  if (handle === 'e') {
    if (behavior === 'width') {
      nextWidth = start.width * scaleX;
    } else if (behavior === 'square') {
      const side = start.width * scaleX;
      nextWidth = side;
      nextHeight = side;
    } else if (behavior === 'aspect') {
      const aspect = aspectRatioOf(element);
      nextWidth = start.width * scaleX;
      nextHeight = nextWidth / aspect;
    }
  } else if (behavior === 'height') {
    nextHeight = start.height * scaleY;
  } else if (behavior === 'square') {
    const side = start.height * scaleY;
    nextWidth = side;
    nextHeight = side;
  } else if (behavior === 'aspect') {
    const aspect = aspectRatioOf(element);
    nextHeight = start.height * scaleY;
    nextWidth = nextHeight * aspect;
  }

  const naturalHeight = naturalTextHeightMm(element, nextWidth);
  if (naturalHeight !== undefined) {
    nextHeight = naturalHeight;
  }

  return {
    left: roundMm(nextLeft),
    top: roundMm(nextTop),
    width: roundMm(nextWidth),
    height: roundMm(nextHeight),
  };
}

function clampMemberToCanvas(
  element: LabelElement,
  box: MmBox,
  handle: GroupResizeHandle,
  canvas: CanvasBounds,
): MmBox {
  const policy = resizePolicyFor(element);
  const naturalHeight = naturalTextHeightMm(element, box.width);
  const clamped = clampToLabelBounds(
    box,
    { widthMm: canvas.widthMm, heightMm: canvas.heightMm },
    {
      anchor: handle,
      minMm: policy.minMm,
      naturalHeight,
    },
  );
  return {
    left: roundMm(clamped.left),
    top: roundMm(clamped.top),
    width: roundMm(clamped.width),
    height: roundMm(clamped.height),
  };
}

/** Full group resize commit path — single source of truth for preview parity. */
export function applyGroupResize(opts: {
  elements: LabelElement[];
  selectedIds: string[];
  snapshots: Map<string, MmBox>;
  handle: GroupResizeHandle;
  fixedOrigin: GroupFixedOrigin;
  scaleX: number;
  scaleY: number;
  canvas: CanvasBounds;
}): GroupResizeResult {
  const { elements, selectedIds, snapshots, handle, fixedOrigin, canvas } = opts;

  if (selectedIds.length === 0 || snapshots.size === 0) {
    return { ok: false, reason: 'empty_selection' };
  }
  if (selectionHasBlockedRotation(elements, selectedIds)) {
    return { ok: false, reason: 'rotation' };
  }

  const { scaleX, scaleY } = capGroupResizeScales({
    elements,
    snapshots,
    selectedIds,
    handle,
    fixedOrigin,
    proposedScaleX: opts.scaleX,
    proposedScaleY: opts.scaleY,
    canvas,
  });

  const patches = new Map<string, GroupResizeMemberPatch>();

  for (const id of selectedIds) {
    const el = elements.find((e) => e.id === id);
    const start = snapshots.get(id);
    if (!el || !start || !isGroupResizeEligible(el)) continue;

    const scaled = applyGroupResizeMember({
      element: el,
      start,
      fixedOrigin,
      scaleX,
      scaleY,
      handle,
    });
    const clamped = clampMemberToCanvas(el, scaled, handle, canvas);
    patches.set(id, clamped);
  }

  if (patches.size === 0) {
    return { ok: false, reason: 'empty_selection' };
  }

  return {
    ok: true,
    patches,
    scaleX,
    scaleY,
    fixedOrigin,
  };
}

/** Convenience: union bounds + fixed origin from snapshots. */
export function groupResizeFrameFromSnapshots(
  elements: LabelElement[],
  snapshots: Map<string, MmBox>,
): { union: MmBox; fixedOrigin: GroupFixedOrigin } {
  const selected = elements.filter((el) => snapshots.has(el.id));
  const union = unionBounds(selected.map((el) => {
    const box = snapshots.get(el.id)!;
    return { ...el, left: box.left, top: box.top, width: box.width, height: box.height } as LabelElement;
  }));
  return { union, fixedOrigin: groupFixedOriginFromUnion(union) };
}
