import { boxOf, type CanvasBounds } from '@/lib/editor/engine';
import type { LabelElement } from '@/lib/label-document';

export type EditorSelection = {
  ids: string[];
  primaryId: string | null;
};

export type TapSelectInput = {
  id: string;
  multipleMode: boolean;
  current: EditorSelection;
};

/** Tap-to-select: single replaces; multiple toggles membership (add or remove). */
export function reduceTapSelect(input: TapSelectInput): EditorSelection {
  const { id, multipleMode, current } = input;

  if (!multipleMode) {
    return { ids: [id], primaryId: id };
  }

  if (current.ids.includes(id)) {
    const ids = current.ids.filter((memberId) => memberId !== id);
    if (ids.length === 0) {
      return clearSelection();
    }
    const primaryId =
      current.primaryId && current.primaryId !== id && ids.includes(current.primaryId)
        ? current.primaryId
        : ids[ids.length - 1];
    return { ids, primaryId };
  }

  return { ids: [...current.ids, id], primaryId: id };
}

export function clearSelection(): EditorSelection {
  return { ids: [], primaryId: null };
}

/** Multiple ON keeps the current selection (carry-forward). OFF clears immediately. */
export function reduceMultipleModeToggle(
  turningOn: boolean,
  current: EditorSelection,
): EditorSelection {
  if (turningOn) return current;
  return clearSelection();
}

export function selectionFromIds(ids: string[], primaryId?: string | null): EditorSelection {
  if (ids.length === 0) {
    return clearSelection();
  }
  const primary = primaryId && ids.includes(primaryId) ? primaryId : ids[ids.length - 1];
  return { ids, primaryId: primary };
}

export function unionBounds(elements: LabelElement[]) {
  if (elements.length === 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  let minLeft = Infinity;
  let minTop = Infinity;
  let maxRight = -Infinity;
  let maxBottom = -Infinity;
  for (const el of elements) {
    const box = boxOf(el);
    minLeft = Math.min(minLeft, box.left);
    minTop = Math.min(minTop, box.top);
    maxRight = Math.max(maxRight, box.left + box.width);
    maxBottom = Math.max(maxBottom, box.top + box.height);
  }
  return {
    left: minLeft,
    top: minTop,
    width: maxRight - minLeft,
    height: maxBottom - minTop,
  };
}

/** Align the union bounding box of elements, then translate each member by the same delta. */
export function alignGroupBounds(
  elements: LabelElement[],
  ids: string[],
  canvas: CanvasBounds,
  kind: 'left' | 'right' | 'top' | 'bottom' | 'center',
): Map<string, { left: number; top: number }> {
  const selected = elements.filter((el) => ids.includes(el.id));
  const patches = new Map<string, { left: number; top: number }>();
  if (selected.length === 0) return patches;

  const group = unionBounds(selected);
  const maxLeft = Math.max(0, canvas.widthMm - group.width);
  const maxTop = Math.max(0, canvas.heightMm - group.height);

  let targetLeft = group.left;
  let targetTop = group.top;

  switch (kind) {
    case 'left':
      targetLeft = 0;
      break;
    case 'right':
      targetLeft = maxLeft;
      break;
    case 'top':
      targetTop = 0;
      break;
    case 'bottom':
      targetTop = maxTop;
      break;
    case 'center':
      targetLeft = maxLeft / 2;
      targetTop = maxTop / 2;
      break;
  }

  const deltaLeft = targetLeft - group.left;
  const deltaTop = targetTop - group.top;

  for (const el of selected) {
    patches.set(el.id, {
      left: el.left + deltaLeft,
      top: el.top + deltaTop,
    });
  }

  return patches;
}

export function elementContentValue(el: LabelElement): string {
  if (el.type === 'text' || el.type === 'arctext') {
    return el.text;
  }
  if (
    el.type === 'barcode' ||
    el.type === 'qrcode' ||
    el.type === 'degrees'
  ) {
    return el.content;
  }
  return '';
}

export function contentPatchForElement(
  el: LabelElement,
  value: string,
): Record<string, unknown> {
  if (el.type === 'text' || el.type === 'arctext') {
    return { text: value };
  }
  if (
    el.type === 'barcode' ||
    el.type === 'qrcode' ||
    el.type === 'degrees'
  ) {
    return { content: value };
  }
  return {};
}

export function supportsMultiSelectPanel(el: LabelElement): boolean {
  return (
    el.type === 'text' ||
    el.type === 'barcode' ||
    el.type === 'qrcode' ||
    el.type === 'arctext' ||
    el.type === 'degrees'
  );
}
