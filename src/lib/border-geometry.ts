import type { LabelDocument, LabelElement } from '@/lib/label-document';
import { PRINT_BORDER_INSET_MM } from '@/printing/raster/border-frame';

const MIN_BORDER_MM = 1;

export const BORDER_EDGE_WARN_MM = 1.5;
export const BORDER_WIDTH_WARN_MM = 0.4;

/** Template guide ring — die edge is mediaShape + border, not this shape on print. */
export function isFullPanelGuideCircle(
  el: LabelElement,
  widthMm: number,
  heightMm: number,
): boolean {
  if (el.type !== 'shape') return false;
  if (el.figureShape !== 'circle' && el.figureShape !== 'oval') return false;
  const minDim = Math.min(widthMm, heightMm);
  return el.width >= minDim - 1.5 && el.height >= minDim - 1.5;
}

export function borderPlacementWarnings(
  el: { left: number; top: number; width: number; height: number; lineWidth?: number },
  labelWidthMm: number,
  labelHeightMm: number,
): string[] {
  const warnings: string[] = [];
  const left = el.left;
  const top = el.top;
  const right = labelWidthMm - (el.left + el.width);
  const bottom = labelHeightMm - (el.top + el.height);
  if (left < BORDER_EDGE_WARN_MM || right < BORDER_EDGE_WARN_MM || top < BORDER_EDGE_WARN_MM || bottom < BORDER_EDGE_WARN_MM) {
    warnings.push(`Keep the border at least ${BORDER_EDGE_WARN_MM} mm from the label edge.`);
  }
  const stroke = el.lineWidth ?? 0.55;
  if (stroke < BORDER_WIDTH_WARN_MM) {
    warnings.push(`Line width below ${BORDER_WIDTH_WARN_MM} mm may drop out on thermal paper.`);
  }
  return warnings;
}

/**
 * Shift a stored border box inward by the 2 mm margin on each side.
 * Width and height never drop below 1 mm. When the result still fits in the
 * label, the origin is pulled back inside. A box larger than the label (a
 * border left at the old size after keep-resize) keeps the shifted size
 * instead of being rewritten to the new label.
 */
export function insetBorderBox(
  left: number,
  top: number,
  width: number,
  height: number,
  limitW: number,
  limitH: number,
): { left: number; top: number; width: number; height: number } {
  const axis = (origin: number, size: number, limit: number) => {
    let nextSize = size - PRINT_BORDER_INSET_MM * 2;
    let nextOrigin = origin + PRINT_BORDER_INSET_MM;
    if (!(nextSize >= MIN_BORDER_MM)) nextSize = MIN_BORDER_MM;
    if (Number.isFinite(limit) && nextSize <= limit) {
      if (nextOrigin < 0) nextOrigin = 0;
      if (nextOrigin + nextSize > limit) nextOrigin = Math.max(0, limit - nextSize);
    } else if (nextOrigin < 0) {
      nextOrigin = 0;
    }
    return { origin: nextOrigin, size: nextSize };
  };
  const x = axis(left, width, limitW);
  const y = axis(top, height, limitH);
  return { left: x.origin, top: y.origin, width: x.size, height: y.size };
}

/** New locked border: the 2 mm margin is already inside the rectangle. */
export function defaultBorderPlacement(widthMm: number, heightMm: number): {
  left: number;
  top: number;
  width: number;
  height: number;
  geometryVersion: 1;
  lockMovement: true;
  rotation: 0;
} {
  return {
    ...insetBorderBox(0, 0, widthMm, heightMm, widthMm, heightMm),
    geometryVersion: 1,
    lockMovement: true,
    rotation: 0,
  };
}

export function migrateBorderElement<T extends LabelElement & { type: 'border' }>(
  el: T,
  limitW: number,
  limitH: number,
  pinLocked = true,
): T {
  if (pinLocked && el.lockMovement) {
    const rect = insetBorderBox(0, 0, limitW, limitH, limitW, limitH);
    const same =
      el.geometryVersion === 1 &&
      Math.abs(el.left - rect.left) < 0.05 &&
      Math.abs(el.top - rect.top) < 0.05 &&
      Math.abs(el.width - rect.width) < 0.05 &&
      Math.abs(el.height - rect.height) < 0.05;
    if (same) return el;
    return {
      ...el,
      ...rect,
      geometryVersion: 1,
      rotation: 0,
      lockMovement: true,
    };
  }
  if (el.geometryVersion === 1) return el;
  const rect = insetBorderBox(el.left, el.top, el.width, el.height, limitW, limitH);
  return {
    ...el,
    ...rect,
    geometryVersion: 1,
    rotation: 0,
    lockMovement: true,
  };
}

export function migrateElementsForLabel(
  elements: LabelElement[],
  limitW: number,
  limitH: number,
  pinLocked = true,
): LabelElement[] {
  let changed = false;
  const next = elements.map((el) => {
    if (el.type !== 'border') return el;
    const migrated = migrateBorderElement(el, limitW, limitH, pinLocked);
    if (migrated !== el) changed = true;
    return migrated;
  });
  return changed ? next : elements;
}

/** Migrate every border on the document and on each multi-up panel (panel size). */
export function migrateDocumentBorders(doc: LabelDocument): LabelDocument {
  const pinLocked = !doc.ups;
  const elements = migrateElementsForLabel(doc.elements, doc.widthMm, doc.heightMm, pinLocked);
  const panels = doc.ups
    ? doc.ups.panels.map((panel) => migrateElementsForLabel(panel, doc.widthMm, doc.heightMm, true))
    : undefined;
  const panelsChanged = Boolean(
    panels && doc.ups && panels.some((panel, i) => panel !== doc.ups!.panels[i]),
  );
  if (elements === doc.elements && !panelsChanged) return doc;
  return {
    ...doc,
    elements,
    ups: doc.ups && panels ? { ...doc.ups, panels } : doc.ups,
  };
}
