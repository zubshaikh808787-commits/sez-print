/**
 * Move-drag helpers: artboard bounds, live millimetre store writes, and
 * content/active layer split so idle elements do not re-render mid-drag.
 */

import { dragBoundMm, type CanvasBounds } from '@/lib/editor/engine';
import { elementSizeMm, type LabelElement } from '@/lib/label-document';

export type FrameScheduler = {
  schedule: (cb: () => void) => unknown;
  cancel: (id: unknown) => void;
};

const defaultScheduler: FrameScheduler = {
  schedule: (cb) => requestAnimationFrame(cb),
  cancel: (id) => cancelAnimationFrame(id as number),
};

/** Coalesce bursts to one emit per animation frame (latest value wins). */
export function createFrameThrottled<T>(
  emit: (value: T) => void,
  scheduler: FrameScheduler = defaultScheduler,
): { push: (value: T) => void; flush: () => void; cancel: () => void } {
  let pending: T | undefined;
  let handle: unknown = null;

  const run = () => {
    handle = null;
    if (pending === undefined) return;
    const value = pending;
    pending = undefined;
    emit(value);
  };

  return {
    push(value: T) {
      pending = value;
      if (handle != null) return;
      handle = scheduler.schedule(run);
    },
    flush() {
      if (handle != null) {
        scheduler.cancel(handle);
        handle = null;
      }
      run();
    },
    cancel() {
      if (handle != null) {
        scheduler.cancel(handle);
        handle = null;
      }
      pending = undefined;
    },
  };
}

export function splitCanvasLayers<T extends { id: string }>(
  elements: T[],
  activeId: string | null,
): { content: T[]; active: T | null } {
  if (!activeId) return { content: elements, active: null };
  let active: T | null = null;
  const content: T[] = [];
  for (const el of elements) {
    if (el.id === activeId) active = el;
    else content.push(el);
  }
  return { content, active };
}

export function idleElementRefsUnchanged<T>(prev: T[], next: T[]): boolean {
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i += 1) {
    if (prev[i] !== next[i]) return false;
  }
  return true;
}

/** Live drag: clone only the moving element; everyone else keeps the same object. */
export function applyLiveDragPosition(
  elements: LabelElement[],
  id: string,
  leftMm: number,
  topMm: number,
  canvas: CanvasBounds,
): LabelElement[] {
  return elements.map((el) => {
    if (el.id !== id) return el;
    const size = elementSizeMm(el);
    const next = dragBoundMm(leftMm, topMm, size.width, size.height, canvas);
    if (Math.abs(el.left - next.left) < 0.005 && Math.abs(el.top - next.top) < 0.005) return el;
    return { ...el, left: next.left, top: next.top };
  });
}
