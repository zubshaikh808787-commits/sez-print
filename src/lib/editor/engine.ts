/**
 * Editor canvas model helpers (physical millimetres only).
 *
 * Screen zoom/pan must never be stored on elements. Print still reads
 * LabelDocument left/top/width/height/rotation in mm.
 */

import { elementSizeMm, generateId, type LabelElement } from '@/lib/label-document';

export const NUDGE_FINE_MM = 0.2;
export const NUDGE_NORMAL_MM = 0.5;
export const NUDGE_FAST_MM = 1.5;
export const SNAP_THRESHOLD_MM = 0.45;
export const MIN_ELEMENT_MM = 0.5;
export const MAX_ELEMENT_MM = 310;

export function finiteMm(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n === Number.POSITIVE_INFINITY || n === Number.NEGATIVE_INFINITY) return fallback;
  if (Math.abs(n) > 1e6) return fallback;
  return n;
}

export function roundMm(value: number, digits = 2): number {
  const n = finiteMm(value, 0);
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function cloneElements(elements: LabelElement[]): LabelElement[] {
  return JSON.parse(JSON.stringify(elements)) as LabelElement[];
}

function elementsEqual(a: LabelElement[], b: LabelElement[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export class EditorHistory {
  private past: LabelElement[][] = [];
  private future: LabelElement[][] = [];
  private baseline: LabelElement[] | null = null;

  constructor(private readonly max = 60) {}

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Snapshot current state, then apply a discrete edit. */
  pushUndo(current: LabelElement[]): void {
    this.baseline = null;
    this.past.push(cloneElements(current));
    if (this.past.length > this.max) this.past.shift();
    this.future = [];
  }

  /** Start a drag / slider / typing burst. Only the first call in a burst is kept. */
  begin(current: LabelElement[]): void {
    if (!this.baseline) this.baseline = cloneElements(current);
  }

  /** Finish a burst: one undo step for the whole gesture. */
  commit(): boolean {
    if (!this.baseline) return false;
    this.past.push(this.baseline);
    if (this.past.length > this.max) this.past.shift();
    this.future = [];
    this.baseline = null;
    return true;
  }

  cancel(): void {
    this.baseline = null;
  }

  undo(current: LabelElement[]): LabelElement[] | null {
    this.baseline = null;
    if (this.past.length === 0) return null;
    this.future.unshift(cloneElements(current));
    return this.past.pop()!;
  }

  redo(current: LabelElement[]): LabelElement[] | null {
    this.baseline = null;
    if (this.future.length === 0) return null;
    this.past.push(cloneElements(current));
    return this.future.shift()!;
  }

  clear(): void {
    this.past = [];
    this.future = [];
    this.baseline = null;
  }
}

export type CanvasBounds = { widthMm: number; heightMm: number };

export function boxOf(el: LabelElement): { left: number; top: number; width: number; height: number } {
  const size = elementSizeMm(el);
  return {
    left: finiteMm(el.left),
    top: finiteMm(el.top),
    width: Math.max(MIN_ELEMENT_MM, finiteMm(size.width, MIN_ELEMENT_MM)),
    height: Math.max(MIN_ELEMENT_MM, finiteMm(size.height, MIN_ELEMENT_MM)),
  };
}

function nearest(value: number, targets: number[], threshold: number): number | null {
  let best: number | null = null;
  let bestDist = threshold;
  for (const t of targets) {
    const d = Math.abs(value - t);
    if (d <= bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best;
}

/**
 * Snap a box to canvas edges, canvas centre, and other object edges/centres.
 * Returns millimetre left/top — never screen pixels.
 */
export function snapBoxToGuides(
  left: number,
  top: number,
  width: number,
  height: number,
  others: { left: number; top: number; width: number; height: number }[],
  canvas: CanvasBounds,
  thresholdMm = SNAP_THRESHOLD_MM,
): { left: number; top: number } {
  const xTargets = [0, canvas.widthMm / 2, canvas.widthMm];
  const yTargets = [0, canvas.heightMm / 2, canvas.heightMm];
  for (const o of others) {
    xTargets.push(o.left, o.left + o.width / 2, o.left + o.width);
    yTargets.push(o.top, o.top + o.height / 2, o.top + o.height);
  }

  let nextLeft = left;
  let nextTop = top;
  const snapL = nearest(left, xTargets, thresholdMm);
  const snapR = nearest(left + width, xTargets, thresholdMm);
  const snapCx = nearest(left + width / 2, xTargets, thresholdMm);
  if (snapL != null) nextLeft = snapL;
  else if (snapR != null) nextLeft = snapR - width;
  else if (snapCx != null) nextLeft = snapCx - width / 2;

  const snapT = nearest(top, yTargets, thresholdMm);
  const snapB = nearest(top + height, yTargets, thresholdMm);
  const snapCy = nearest(top + height / 2, yTargets, thresholdMm);
  if (snapT != null) nextTop = snapT;
  else if (snapB != null) nextTop = snapB - height;
  else if (snapCy != null) nextTop = snapCy - height / 2;

  return { left: roundMm(nextLeft), top: roundMm(nextTop) };
}

export function nudgeBox(
  left: number,
  top: number,
  width: number,
  height: number,
  dxMm: number,
  dyMm: number,
  canvas: CanvasBounds,
): { left: number; top: number } {
  const maxLeft = Math.max(0, canvas.widthMm - width);
  const maxTop = Math.max(0, canvas.heightMm - height);
  return {
    left: roundMm(Math.min(maxLeft, Math.max(0, left + dxMm))),
    top: roundMm(Math.min(maxTop, Math.max(0, top + dyMm))),
  };
}

export function alignBox(
  width: number,
  height: number,
  canvas: CanvasBounds,
  kind: 'left' | 'right' | 'top' | 'bottom' | 'center-h' | 'center-v' | 'center',
): { left?: number; top?: number } {
  const maxLeft = Math.max(0, canvas.widthMm - width);
  const maxTop = Math.max(0, canvas.heightMm - height);
  switch (kind) {
    case 'left':
      return { left: 0 };
    case 'right':
      return { left: maxLeft };
    case 'top':
      return { top: 0 };
    case 'bottom':
      return { top: maxTop };
    case 'center-h':
      return { left: roundMm(maxLeft / 2) };
    case 'center-v':
      return { top: roundMm(maxTop / 2) };
    case 'center':
      return { left: roundMm(maxLeft / 2), top: roundMm(maxTop / 2) };
  }
}

export type ReorderKind = 'front' | 'back' | 'forward' | 'backward';

export function reorderElements(
  elements: LabelElement[],
  ids: string[],
  kind: ReorderKind,
): LabelElement[] {
  if (ids.length === 0) return elements;
  const idSet = new Set(ids);
  const zOf = (el: LabelElement) => el.zIndex ?? 0;
  const maxZ = elements.reduce((m, el) => Math.max(m, zOf(el)), 0);
  const minZ = elements.reduce((m, el) => Math.min(m, zOf(el)), 0);

  if (kind === 'front') {
    let z = maxZ + 1;
    return elements.map((el) => (idSet.has(el.id) ? { ...el, zIndex: z++ } : el));
  }
  if (kind === 'back') {
    let z = minZ - ids.length;
    return elements.map((el) => (idSet.has(el.id) ? { ...el, zIndex: z++ } : el));
  }

  const sorted = [...elements].sort((a, b) => zOf(a) - zOf(b));
  const selected = sorted.filter((el) => idSet.has(el.id));
  const rest = sorted.filter((el) => !idSet.has(el.id));
  if (kind === 'forward') {
    const last = selected[selected.length - 1];
    const idx = rest.findIndex((el) => zOf(el) > zOf(last));
    const insertAt = idx === -1 ? rest.length : Math.min(rest.length, idx + 1);
    rest.splice(insertAt, 0, ...selected);
  } else {
    const first = selected[0];
    const idx = rest.findIndex((el) => zOf(el) >= zOf(first));
    const insertAt = idx <= 0 ? 0 : idx - 1;
    rest.splice(insertAt, 0, ...selected);
  }
  return rest.map((el, i) => ({ ...el, zIndex: i }));
}

export function duplicateElements(
  elements: LabelElement[],
  ids: string[],
  canvas: CanvasBounds,
  offsetMm = 2,
): { elements: LabelElement[]; newIds: string[] } {
  const sources = elements.filter(
    (el) => ids.includes(el.id) && el.type !== 'border' && el.needPrinting !== false,
  );
  const clones = sources.map((el) => {
    const clone = JSON.parse(JSON.stringify(el)) as LabelElement;
    clone.id = generateId();
    clone.left = finiteMm(el.left) + offsetMm;
    clone.top = finiteMm(el.top) + offsetMm;
    clone.lockMovement = false;
    return clone;
  });
  return { elements: [...elements, ...clones], newIds: clones.map((c) => c.id) };
}

let clipboard: LabelElement[] = [];

export function copyElementsToClipboard(elements: LabelElement[], ids: string[]): number {
  clipboard = elements
    .filter((el) => ids.includes(el.id) && el.type !== 'border')
    .map((el) => JSON.parse(JSON.stringify(el)) as LabelElement);
  return clipboard.length;
}

export function pasteElementsFromClipboard(elements: LabelElement[], canvas: CanvasBounds): {
  elements: LabelElement[];
  newIds: string[];
} {
  if (clipboard.length === 0) return { elements, newIds: [] };
  const clones = clipboard.map((el) => {
    const clone = JSON.parse(JSON.stringify(el)) as LabelElement;
    clone.id = generateId();
    clone.left = Math.min(canvas.widthMm - 2, finiteMm(el.left) + 2);
    clone.top = Math.min(canvas.heightMm - 2, finiteMm(el.top) + 2);
    clone.lockMovement = false;
    return clone;
  });
  return { elements: [...elements, ...clones], newIds: clones.map((c) => c.id) };
}

export function clipboardHasContent(): boolean {
  return clipboard.length > 0;
}

export function sanitizeTransform(payload: {
  leftMm: number;
  topMm: number;
  widthMm: number;
  heightMm: number;
  rotation: number;
  fontSize?: number;
}): {
  leftMm: number;
  topMm: number;
  widthMm: number;
  heightMm: number;
  rotation: number;
  fontSize?: number;
} {
  const widthMm = Math.min(MAX_ELEMENT_MM, Math.max(MIN_ELEMENT_MM, finiteMm(payload.widthMm, MIN_ELEMENT_MM)));
  const heightMm = Math.min(MAX_ELEMENT_MM, Math.max(0.1, finiteMm(payload.heightMm, MIN_ELEMENT_MM)));
  let rotation = finiteMm(payload.rotation, 0);
  rotation = ((Math.round(rotation) % 360) + 360) % 360;
  const out = {
    leftMm: roundMm(Math.max(0, finiteMm(payload.leftMm))),
    topMm: roundMm(Math.max(0, finiteMm(payload.topMm))),
    widthMm: roundMm(widthMm),
    heightMm: roundMm(heightMm),
    rotation,
  };
  if (payload.fontSize != null) {
    const fs = finiteMm(payload.fontSize, 12);
    return { ...out, fontSize: Math.max(4, Math.min(72, fs)) };
  }
  return out;
}

export function isEditorVisible(el: LabelElement): boolean {
  return el.visible !== false;
}
