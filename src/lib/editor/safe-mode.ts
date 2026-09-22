import { elementSizeMm, type LabelElement } from '@/lib/label-document';

/** Pull a box fully onto the label. Larger than the label stays pinned at the origin. */
export function fullyInsideLabelMm(
  left: number,
  top: number,
  width: number,
  height: number,
  canvasWidthMm: number,
  canvasHeightMm: number,
): { left: number; top: number } {
  'worklet';
  const maxLeft = Math.max(0, canvasWidthMm - Math.max(0, width));
  const maxTop = Math.max(0, canvasHeightMm - Math.max(0, height));
  return {
    left: Math.min(maxLeft, Math.max(0, left)),
    top: Math.min(maxTop, Math.max(0, top)),
  };
}

function boxesIntersect(
  a: { left: number; top: number; width: number; height: number },
  b: { left: number; top: number; width: number; height: number },
): boolean {
  return a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
}

/** True when two visible, non-border elements share area. Edge contact does not count. */
export function labelElementsOverlap(elements: LabelElement[]): boolean {
  const boxes = elements
    .filter((el) => el.visible !== false && el.type !== 'border' && el.needPrinting !== false)
    .map((el) => {
      const size = elementSizeMm(el);
      return { left: el.left, top: el.top, width: size.width, height: size.height };
    });
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxesIntersect(boxes[i], boxes[j])) return true;
    }
  }
  return false;
}
