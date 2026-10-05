import { clampGridSpacingMm } from '@/lib/editor/canvas-grid';
import { elementSizeMm, type LabelDocument } from '@/lib/label-document';
import { dotsPerMm, mmToDots, rectMmToDots } from '@/lib/printer/print-spec';

/** Printed grid line thickness. 2 dots at 304 DPI, 1 dot at 203 DPI. */
export const PRINT_GRID_LINE_MM = 0.15;

export type GridRect = { left: number; top: number; width: number; height: number };

/** Grid spacing in mm when the label prints a grid, otherwise null. */
export function printGridSpacingMm(doc: Pick<LabelDocument, 'settings'>): number | null {
  if (!doc.settings?.printGrid) return null;
  return clampGridSpacingMm(doc.settings.printGridSpacingMm ?? 5);
}

/**
 * Element boxes (mm) the grid stays out of, like the editor's design grid plates.
 * Borders are skipped: they frame the label, so knocking them out would erase the grid.
 */
export function printGridKnockoutsMm(doc: Pick<LabelDocument, 'elements'>): GridRect[] {
  const out: GridRect[] = [];
  for (const el of doc.elements) {
    if (el.visible === false || el.needPrinting === false || el.type === 'border') continue;
    const size = elementSizeMm(el);
    out.push({ left: el.left, top: el.top, width: size.width, height: size.height });
  }
  return out;
}

/** Line positions in mm, every `spacingMm` from the label's top-left, edges excluded. */
export function printGridLinesMm(widthMm: number, heightMm: number, spacingMm: number) {
  const step = clampGridSpacingMm(spacingMm);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let mm = step; mm < widthMm - 1e-6; mm += step) xs.push(mm);
  for (let mm = step; mm < heightMm - 1e-6; mm += step) ys.push(mm);
  return { xs, ys };
}

/** Removes the parts of a full-length grid line that cross any hole. */
function cutLine(line: GridRect, vertical: boolean, holes: GridRect[]): GridRect[] {
  const start = vertical ? line.top : line.left;
  const end = start + (vertical ? line.height : line.width);
  const cuts = holes
    .filter((h) =>
      vertical
        ? h.left < line.left + line.width && h.left + h.width > line.left
        : h.top < line.top + line.height && h.top + h.height > line.top,
    )
    .map((h) => (vertical ? [h.top, h.top + h.height] : [h.left, h.left + h.width]))
    .sort((a, b) => a[0] - b[0]);
  const out: GridRect[] = [];
  const push = (a: number, b: number) => {
    if (b <= a) return;
    out.push(vertical ? { ...line, top: a, height: b - a } : { ...line, left: a, width: b - a });
  };
  let pos = start;
  for (const [a, b] of cuts) {
    if (a > pos) push(pos, Math.min(a, end));
    pos = Math.max(pos, b);
    if (pos >= end) return out;
  }
  push(pos, end);
  return out;
}

/** Grid line rectangles in any whole-unit space, with `holes` (same units) cut out. */
export function gridRects(
  widthMm: number,
  heightMm: number,
  spacingMm: number,
  unitsPerMm: number,
  lineUnits: number,
  holes: GridRect[] = [],
): GridRect[] {
  const pageW = Math.max(1, Math.round(widthMm * unitsPerMm));
  const pageH = Math.max(1, Math.round(heightMm * unitsPerMm));
  const t = Math.max(1, lineUnits);
  const half = Math.floor(t / 2);
  const { xs, ys } = printGridLinesMm(widthMm, heightMm, spacingMm);
  return [
    ...xs.flatMap((mm) =>
      cutLine({ left: Math.round(mm * unitsPerMm) - half, top: 0, width: t, height: pageH }, true, holes),
    ),
    ...ys.flatMap((mm) =>
      cutLine({ left: 0, top: Math.round(mm * unitsPerMm) - half, width: pageW, height: t }, false, holes),
    ),
  ];
}

/** Grid lines as whole-dot rectangles over the full label (0,0 = label top-left). */
export function printGridRectsDots(
  widthMm: number,
  heightMm: number,
  spacingMm: number,
  dpi: number,
  knockoutsMm: GridRect[] = [],
): GridRect[] {
  const holes = knockoutsMm.map((k) => {
    const r = rectMmToDots(k.left, k.top, k.width, k.height, dpi);
    return { left: r.x0, top: r.y0, width: r.widthDots, height: r.heightDots };
  });
  return gridRects(widthMm, heightMm, spacingMm, dotsPerMm(dpi), mmToDots(PRINT_GRID_LINE_MM, dpi), holes);
}

export function gridRectsToPath(rects: GridRect[], dx = 0, dy = 0): string {
  let d = '';
  for (const r of rects) {
    d += `M${r.left + dx} ${r.top + dy}h${r.width}v${r.height}h${-r.width}z`;
  }
  return d;
}
