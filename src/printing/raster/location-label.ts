/**
 * 50×30 mm position fixture and border-margin checks.
 * Expected rectangles come from rectMmToDots. Ink is measured after raster.
 */

import {
  DEFAULT_ELEMENT_STATE,
  DEFAULT_LINE_STATE,
  DEFAULT_SHAPE_STATE,
} from '@/components/editor/types';
import { createLabelDocument, elementSizeMm, type LabelDocument, type LabelElement } from '@/lib/label-document';
import {
  computePrintheadCenteringOffset,
  createPrintSpec,
  dotsPerMm,
  mmToDots,
  rectMmToDots,
  tsplPackedWidthDots,
  type PrintSpec,
} from '@/lib/printer/print-spec';
import { layoutPrintText, ptToMm } from '@/lib/text-metrics';
import { inkBoundingBox } from './tspl-wire';

export const LOCATION_DPI = 304;
const DOT_MM = 1 / 12;

export type MarkKind = 'border' | 'cross' | 'tick' | 'box' | 'text';

export type LocationMark = {
  id: string;
  kind: MarkKind;
  left: number;
  top: number;
  width: number;
  height: number;
  align?: 'left' | 'center' | 'right';
  /** Crosshair center, millimetres. */
  cx?: number;
  cy?: number;
};

export function createLocationLabel(): { doc: LabelDocument; marks: LocationMark[] } {
  const marks: LocationMark[] = [
    {
      id: 'border-inset',
      kind: 'border',
      left: 0.5,
      top: 0.5,
      width: 49,
      height: 29,
    },
  ];
  const crosses: Array<[string, number, number]> = [
    ['cross-tl', 6, 6],
    ['cross-tr', 44, 6],
    ['cross-bl', 6, 18],
    ['cross-br', 44, 18],
  ];
  for (const [id, cx, cy] of crosses) {
    marks.push({ id, kind: 'cross', left: cx - 1, top: cy - 1, width: 2, height: 2, cx, cy });
  }
  for (const x of [5, 10, 15, 20, 25, 30, 35, 40, 45]) {
    marks.push({
      id: `tick-top-${x}`,
      kind: 'tick',
      left: x,
      top: 0,
      width: DOT_MM,
      height: 1.5,
    });
  }
  for (const y of [5, 10, 15, 20, 25]) {
    marks.push({
      id: `tick-left-${y}`,
      kind: 'tick',
      left: 0,
      top: y,
      width: 1.5,
      height: DOT_MM,
    });
  }
  const boxes: Array<[string, number, number, number, number]> = [
    ['box-a', 10, 8, 6, 3],
    ['box-b', 20, 8, 8, 4],
    ['box-c', 32, 14, 6, 3],
  ];
  for (const [id, left, top, width, height] of boxes) {
    marks.push({ id, kind: 'box', left, top, width, height });
  }
  const textH = ptToMm(8);
  marks.push(
    { id: 'text-left', kind: 'text', left: 8, top: 21, width: 12, height: textH, align: 'left' },
    { id: 'text-center', kind: 'text', left: 20, top: 21, width: 12, height: textH, align: 'center' },
    { id: 'text-right', kind: 'text', left: 34, top: 21, width: 12, height: textH, align: 'right' },
  );

  const elements: LabelElement[] = [
    {
      id: 'border-inset',
      type: 'border',
      borderStyle: 'solid-medium',
      lineWidth: 0.55,
      rotation: 0,
      left: 0.5,
      top: 0.5,
      width: 49,
      height: 29,
      lockMovement: true,
      needPrinting: true,
      drawingColorIndex: 1,
    },
  ];
  for (const [id, cx, cy] of crosses) {
    elements.push(line(`${id}-h`, cx - 1, cy - DOT_MM / 2, 2, DOT_MM));
    elements.push(line(`${id}-v`, cx - DOT_MM / 2, cy - 1, DOT_MM, 2));
  }
  for (const x of [5, 10, 15, 20, 25, 30, 35, 40, 45]) {
    elements.push(line(`tick-top-${x}`, x, 0, DOT_MM, 1.5));
  }
  for (const y of [5, 10, 15, 20, 25]) {
    elements.push(line(`tick-left-${y}`, 0, y, 1.5, DOT_MM));
  }
  for (const [id, left, top, width, height] of boxes) {
    elements.push({
      id,
      type: 'shape',
      ...DEFAULT_SHAPE_STATE,
      figureShape: 'rectangle',
      fill: true,
      lineWidth: 0.2,
      left,
      top,
      width,
      height,
      needPrinting: true,
    });
  }
  const texts: Array<[string, string, 'left' | 'center' | 'right', number]> = [
    ['text-left', 'LEFT', 'left', 8],
    ['text-center', 'MID', 'center', 20],
    ['text-right', 'END', 'right', 34],
  ];
  for (const [id, text, align, left] of texts) {
    elements.push({
      id,
      type: 'text',
      ...DEFAULT_ELEMENT_STATE,
      text,
      fontSize: 8,
      align,
      left,
      top: 21,
      width: 12,
      height: textH,
      autoTextHeight: false,
      autoWrapping: 'Close',
      fontFamily: 'Default',
      needPrinting: true,
    });
  }

  return {
    doc: createLabelDocument({
      name: 'Location 50x30',
      widthMm: 50,
      heightMm: 30,
      elements,
    }),
    marks,
  };
}

function line(id: string, left: number, top: number, width: number, height: number): LabelElement {
  return {
    id,
    type: 'line',
    ...DEFAULT_LINE_STATE,
    left,
    top,
    width,
    height,
    needPrinting: true,
  };
}

export type DeltaRow = {
  id: string;
  kind: MarkKind;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  inkX0: number | null;
  inkY0: number | null;
  inkX1: number | null;
  inkY1: number | null;
  dX0: number | null;
  dY0: number | null;
  dX1: number | null;
  dY1: number | null;
  /** Delta of measured ink against the drawer contract (line center, text run). */
  inkDX0: number | null;
  inkDY0: number | null;
  inkDX1: number | null;
  inkDY1: number | null;
};

function exclusiveEnd(inkInclusive: number): number {
  return inkInclusive + 1;
}

export function measureLocationPage(
  gray: Uint8Array,
  width: number,
  height: number,
  doc: LabelDocument,
  marks: LocationMark[],
): DeltaRow[] {
  const dpi = LOCATION_DPI;
  const dpm = dotsPerMm(dpi);
  const byId = new Map(doc.elements.map((el) => [el.id, el]));
  const rows: DeltaRow[] = [];

  for (const mark of marks) {
    if (mark.kind === 'border') {
      const border = measureFrameFromStrips(gray, width, height, {
        id: mark.id,
        left: mark.left,
        top: mark.top,
        width: mark.width,
        height: mark.height,
        lineWidth: 0.55,
        widthMm: doc.widthMm,
        heightMm: doc.heightMm,
        sampleX: mmToDots(7.5, dpi),
        sampleY: mmToDots(7.5, dpi),
      });
      const rect = rectMmToDots(mark.left, mark.top, mark.width, mark.height, dpi);
      rows.push({
        id: mark.id,
        kind: 'border',
        x0: rect.x0,
        y0: rect.y0,
        x1: rect.x1,
        y1: rect.y1,
        inkX0: border.outerX0,
        inkY0: border.outerY0,
        inkX1: border.outerX1,
        inkY1: border.outerY1,
        dX0: border.outerX0 - rect.x0,
        dY0: border.outerY0 - rect.y0,
        dX1: exclusiveEnd(border.outerX1) - rect.x1,
        dY1: exclusiveEnd(border.outerY1) - rect.y1,
        inkDX0: border.outerX0 - (rect.x0 + border.pad),
        inkDY0: border.outerY0 - (rect.y0 + border.pad),
        inkDX1: exclusiveEnd(border.outerX1) - (rect.x1 - border.pad),
        inkDY1: exclusiveEnd(border.outerY1) - (rect.y1 - border.pad),
      });
      continue;
    }

    if (mark.kind === 'cross' && mark.cx != null && mark.cy != null) {
      const cx = mmToDots(mark.cx, dpi);
      const cy = mmToDots(mark.cy, dpi);
      const win = Math.round(dpm * 1.25);
      const box = inkBoundingBox(
        gray,
        width,
        height,
        { x: cx - win, y: cy - win, w: win * 2, h: win * 2 },
        160,
      );
      const inkCx = box ? (box.x0 + box.x1) / 2 : null;
      const inkCy = box ? (box.y0 + box.y1) / 2 : null;
      rows.push({
        id: mark.id,
        kind: 'cross',
        x0: cx,
        y0: cy,
        x1: cx,
        y1: cy,
        inkX0: box?.x0 ?? null,
        inkY0: box?.y0 ?? null,
        inkX1: box?.x1 ?? null,
        inkY1: box?.y1 ?? null,
        dX0: inkCx == null ? null : inkCx - cx,
        dY0: inkCy == null ? null : inkCy - cy,
        dX1: inkCx == null ? null : inkCx - cx,
        dY1: inkCy == null ? null : inkCy - cy,
        inkDX0: inkCx == null ? null : inkCx - cx,
        inkDY0: inkCy == null ? null : inkCy - cy,
        inkDX1: inkCx == null ? null : inkCx - cx,
        inkDY1: inkCy == null ? null : inkCy - cy,
      });
      continue;
    }

    const el = byId.get(mark.id);
    const size = el ? elementSizeMm(el) : { width: mark.width, height: mark.height };
    const rect = rectMmToDots(mark.left, mark.top, size.width, size.height, dpi);
    const search = inkBoundingBox(
      gray,
      width,
      height,
      { x: rect.x0 - 4, y: rect.y0 - 4, w: rect.widthDots + 8, h: rect.heightDots + 8 },
      160,
    );
    const drawn = el ? expectedInk(el, dpi, dpm) : null;
    rows.push({
      id: mark.id,
      kind: mark.kind,
      x0: rect.x0,
      y0: rect.y0,
      x1: rect.x1,
      y1: rect.y1,
      inkX0: search?.x0 ?? null,
      inkY0: search?.y0 ?? null,
      inkX1: search?.x1 ?? null,
      inkY1: search?.y1 ?? null,
      dX0: search ? search.x0 - rect.x0 : null,
      dY0: search ? search.y0 - rect.y0 : null,
      dX1: search ? exclusiveEnd(search.x1) - rect.x1 : null,
      dY1: search ? exclusiveEnd(search.y1) - rect.y1 : null,
      inkDX0: search && drawn ? search.x0 - drawn.x0 : null,
      inkDY0: search && drawn ? search.y0 - drawn.y0 : null,
      inkDX1: search && drawn ? exclusiveEnd(search.x1) - drawn.x1 : null,
      inkDY1: search && drawn ? exclusiveEnd(search.y1) - drawn.y1 : null,
    });
  }
  return rows;
}

function expectedInk(
  el: LabelElement,
  dpi: number,
  dpm: number,
): { x0: number; y0: number; x1: number; y1: number } | null {
  const size = elementSizeMm(el);
  const rect = rectMmToDots(el.left, el.top, size.width, size.height, dpi);
  if (el.type === 'shape' && el.fill) {
    return { x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y1 };
  }
  if (el.type === 'line') {
    const vertical = rect.heightDots >= rect.widthDots * 2;
    const stroke = Math.max(1, Math.round((vertical ? el.width : el.height) * dpm));
    if (vertical) {
      const x = rect.x0 + Math.floor(rect.widthDots / 2) - Math.floor(stroke / 2);
      return { x0: x, y0: rect.y0, x1: x + stroke, y1: rect.y1 };
    }
    const y = rect.y0 + Math.floor(rect.heightDots / 2) - Math.floor(stroke / 2);
    return { x0: rect.x0, y0: y, x1: rect.x1, y1: y + stroke };
  }
  if (el.type === 'text') {
    const layout = layoutPrintText({
      text: el.text,
      fontSize: el.fontSize,
      widthMm: el.width,
      autoWrapping: el.autoWrapping,
      lineSpacing: el.lineSpacing,
      charSpacing: el.charSpacing,
      bold: el.bold,
      verticalDisplay: el.verticalDisplay,
    });
    const fontH = Math.max(1, Math.round(ptToMm(el.fontSize) * dpm));
    const lineH = Math.max(1, Math.round(layout.lineHeightMm * dpm));
    const blockH = Math.max(lineH, layout.lines.length * lineH);
    const y = rect.y0 + Math.floor((rect.heightDots - blockH) / 2);
    const lineW = Math.max(1, Math.round((layout.widthsMm[0] ?? 0) * dpm));
    let x = rect.x0;
    if (el.align === 'center') x = rect.x0 + Math.floor((rect.widthDots - lineW) / 2);
    else if (el.align === 'right') x = rect.x0 + Math.max(0, rect.widthDots - lineW);
    return { x0: x, y0: y, x1: x + lineW, y1: y + fontH };
  }
  return null;
}

export function classifyLocation(rows: DeltaRow[]): string {
  const boxes = rows.filter((r) => r.kind === 'box' || r.kind === 'tick');
  const texts = rows.filter((r) => r.kind === 'text');
  const crosses = rows.filter((r) => r.kind === 'cross');
  const borders = rows.filter((r) => r.kind === 'border');
  const missing = rows.filter((r) => r.dX0 == null);
  if (missing.length) return `missing ink: ${missing.map((r) => r.id).join(', ')}`;

  const boxOff = boxes.filter((r) => Math.max(Math.abs(r.dX0!), Math.abs(r.dY0!), Math.abs(r.dX1!), Math.abs(r.dY1!)) > 1);
  const crossOff = crosses.filter((r) => Math.max(Math.abs(r.dX0!), Math.abs(r.dY0!)) > 1);
  const textInkOff = texts.filter(
    (r) => Math.max(Math.abs(r.inkDX0!), Math.abs(r.inkDY0!), Math.abs(r.inkDX1!), Math.abs(r.inkDY1!)) > 1,
  );
  const borderInkOff = borders.filter(
    (r) => Math.max(Math.abs(r.inkDX0!), Math.abs(r.inkDY0!), Math.abs(r.inkDX1!), Math.abs(r.inkDY1!)) > 1,
  );

  if (boxOff.length || crossOff.length) {
    const dx = boxes.map((r) => r.dX0!);
    const same = dx.length > 0 && dx.every((v) => v === dx[0]);
    const grows = dx.length > 1 && Math.abs(dx[dx.length - 1] - dx[0]) > 1;
    const crossNote = crossOff.length ? ` cross off: ${crossOff.map((r) => r.id).join(', ')}` : '';
    if (grows) return `proportional drift${crossNote}`;
    if (boxOff.length && same) return `constant shift Δx=${dx[0]} Δy=${boxes[0]?.dY0 ?? 0}${crossNote}`;
    if (crossOff.length && !boxOff.length) return `cross-only:${crossNote}`;
    return `mixed placement error${crossNote}`;
  }
  if (textInkOff.length && !borderInkOff.length) return 'text-only';
  if (borderInkOff.length && !textInkOff.length) return 'border-only';
  if (textInkOff.length || borderInkOff.length) return 'text-only and border-only';
  return 'payload matches rectMmToDots (text and border ink follow their drawers)';
}

export function formatDeltaTable(rows: DeltaRow[]): string {
  const header = 'id kind x0 y0 x1 y1 inkX0 inkY0 inkX1 inkY1 dX0 dY0 dX1 dY1 inkDX0 inkDY0 inkDX1 inkDY1';
  const lines = rows.map((r) =>
    [
      r.id,
      r.kind,
      r.x0,
      r.y0,
      r.x1,
      r.y1,
      r.inkX0 ?? '-',
      r.inkY0 ?? '-',
      r.inkX1 ?? '-',
      r.inkY1 ?? '-',
      r.dX0 ?? '-',
      r.dY0 ?? '-',
      r.dX1 ?? '-',
      r.dY1 ?? '-',
      r.inkDX0 ?? '-',
      r.inkDY0 ?? '-',
      r.inkDX1 ?? '-',
      r.inkDY1 ?? '-',
    ].join(' '),
  );
  return [header, ...lines].join('\n');
}

export type BorderCase = {
  id: string;
  widthMm: number;
  heightMm: number;
  left: number;
  top: number;
  width: number;
  height: number;
  lineWidth: number;
  borderStyle: 'solid-medium' | 'solid-thick';
};

export function borderCases(): BorderCase[] {
  const sizes: Array<[number, number]> = [
    [50, 30],
    [25, 30],
    [57, 30],
  ];
  const cases: BorderCase[] = [];
  for (const [widthMm, heightMm] of sizes) {
    cases.push({
      id: `flush-${widthMm}`,
      widthMm,
      heightMm,
      left: 0,
      top: 0,
      width: widthMm,
      height: heightMm,
      lineWidth: 0.55,
      borderStyle: 'solid-medium',
    });
    cases.push({
      id: `inset-${widthMm}`,
      widthMm,
      heightMm,
      left: 0.5,
      top: 0.5,
      width: widthMm - 1,
      height: heightMm - 1,
      lineWidth: 0.55,
      borderStyle: 'solid-medium',
    });
    cases.push({
      id: `thick-${widthMm}`,
      widthMm,
      heightMm,
      left: 0,
      top: 0,
      width: widthMm,
      height: heightMm,
      lineWidth: 0.9,
      borderStyle: 'solid-thick',
    });
  }
  return cases;
}

export function createBorderDocument(c: BorderCase): LabelDocument {
  const element: LabelElement = {
    id: c.id,
    type: 'border',
    borderStyle: c.borderStyle,
    lineWidth: c.lineWidth,
    rotation: 0,
    left: c.left,
    top: c.top,
    width: c.width,
    height: c.height,
    lockMovement: true,
    needPrinting: true,
    drawingColorIndex: 1,
  };
  return createLabelDocument({
    name: c.id,
    widthMm: c.widthMm,
    heightMm: c.heightMm,
    elements: [element],
  });
}

export type BorderMeasure = {
  id: string;
  widthMm: number;
  heightMm: number;
  sizeW: number;
  packedW: number;
  crop: number;
  marginL: number;
  marginR: number;
  marginT: number;
  marginB: number;
  strokeL: number;
  strokeR: number;
  strokeT: number;
  strokeB: number;
  expectedStroke: number;
  clipped: boolean;
  marginSpread: number;
  cropExplainsRight: boolean;
  pad: number;
  outerX0: number;
  outerY0: number;
  outerX1: number;
  outerY1: number;
  dOuterX0: number;
  dOuterY0: number;
  dOuterX1: number;
  dOuterY1: number;
  editor: Array<{ density: number; insetDots: number; deltaVsHeadless: number }>;
};

/** Editor padding in physical dots: max(2, round(scale*2)) * density, scale = dpm/density. */
export function editorInsetDots(dpm: number, density: number): number {
  const scale = dpm / density;
  const insetPx = Math.max(2, Math.round(scale * 2));
  return insetPx * density;
}

export function headlessInsetDots(dpm: number): number {
  return Math.max(2, Math.round(dpm * 2));
}

const EDITOR_DENSITIES = [2, 2.625, 2.75, 3, 3.5];

function measureFrameFromStrips(
  gray: Uint8Array,
  width: number,
  height: number,
  c: {
    id: string;
    left: number;
    top: number;
    width: number;
    height: number;
    lineWidth: number;
    widthMm: number;
    heightMm: number;
    sampleX: number;
    sampleY: number;
  },
): BorderMeasure {
  const column = scanAxis(gray, width, height, c.sampleX, true);
  const row = scanAxis(gray, width, height, c.sampleY, false);
  if (!column || !row) throw new Error(`No frame ink for ${c.id}`);
  return finishBorder(width, height, c, {
    minX: row.start,
    maxX: row.end,
    minY: column.start,
    maxY: column.end,
    strokeL: row.thickness,
    strokeR: row.endThickness,
    strokeT: column.thickness,
    strokeB: column.endThickness,
  });
}

function scanAxis(
  gray: Uint8Array,
  width: number,
  height: number,
  fixed: number,
  vertical: boolean,
): { start: number; end: number; thickness: number; endThickness: number } | null {
  const limit = vertical ? height : width;
  const at = (i: number) => (vertical ? gray[i * width + fixed] : gray[fixed * width + i]);
  let start = -1;
  let end = -1;
  let thickness = 0;
  let endThickness = 0;
  let run = 0;
  for (let i = 0; i < limit; i++) {
    if (at(i) < 160) {
      if (start < 0) start = i;
      end = i;
      run += 1;
    } else if (run > 0) {
      if (thickness === 0) thickness = run;
      endThickness = run;
      run = 0;
    }
  }
  if (run > 0) {
    if (thickness === 0) thickness = run;
    endThickness = run;
  }
  if (start < 0) return null;
  return { start, end, thickness, endThickness };
}

export function measureBorderInk(
  gray: Uint8Array,
  width: number,
  height: number,
  c: {
    id: string;
    left: number;
    top: number;
    width: number;
    height: number;
    lineWidth: number;
    widthMm: number;
    heightMm: number;
  },
): BorderMeasure {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (gray[row + x] < 160) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) {
    throw new Error(`No border ink for ${c.id}`);
  }

  const midX = Math.floor((minX + maxX) / 2);
  const midY = Math.floor((minY + maxY) / 2);
  const strokeT = runLength(gray, width, height, midX, minY, 0, 1);
  const strokeB = runLength(gray, width, height, midX, maxY, 0, -1);
  const strokeL = runLength(gray, width, height, minX, midY, 1, 0);
  const strokeR = runLength(gray, width, height, maxX, midY, -1, 0);
  return finishBorder(width, height, c, { minX, maxX, minY, maxY, strokeL, strokeR, strokeT, strokeB });
}

function finishBorder(
  width: number,
  height: number,
  c: {
    id: string;
    left: number;
    top: number;
    width: number;
    height: number;
    lineWidth: number;
    widthMm: number;
    heightMm: number;
  },
  edge: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    strokeL: number;
    strokeR: number;
    strokeT: number;
    strokeB: number;
  },
): BorderMeasure {
  const dpi = LOCATION_DPI;
  const dpm = dotsPerMm(dpi);
  const rect = rectMmToDots(c.left, c.top, c.width, c.height, dpi);
  const pad = headlessInsetDots(dpm);
  const sizeW = Math.max(1, Math.round(c.widthMm * dpm));
  const packedW = tsplPackedWidthDots(sizeW);
  const crop = sizeW - packedW;
  const expectedStroke = Math.max(1, Math.round(c.lineWidth * dpm));
  const marginL = edge.minX;
  const marginT = edge.minY;
  const marginR = width - 1 - edge.maxX;
  const marginB = height - 1 - edge.maxY;
  const margins = [marginL, marginR, marginT, marginB];
  const strokes = [edge.strokeL, edge.strokeR, edge.strokeT, edge.strokeB];
  const clipped = margins.some((m) => m === 0) || strokes.some((s) => s + 1 < expectedStroke);
  const marginSpread = Math.max(...margins) - Math.min(...margins);
  const cropExplainsRight = crop > 0 && marginL - marginR === crop && marginT === marginB;
  const expectedOuterX1 = rect.x1 - pad;
  const expectedOuterY1 = rect.y1 - pad;
  return {
    id: c.id,
    widthMm: c.widthMm,
    heightMm: c.heightMm,
    sizeW,
    packedW,
    crop,
    marginL,
    marginR,
    marginT,
    marginB,
    strokeL: edge.strokeL,
    strokeR: edge.strokeR,
    strokeT: edge.strokeT,
    strokeB: edge.strokeB,
    expectedStroke,
    clipped,
    marginSpread,
    cropExplainsRight,
    pad,
    outerX0: edge.minX,
    outerY0: edge.minY,
    outerX1: edge.maxX,
    outerY1: edge.maxY,
    dOuterX0: edge.minX - (rect.x0 + pad),
    dOuterY0: edge.minY - (rect.y0 + pad),
    dOuterX1: exclusiveEnd(edge.maxX) - Math.min(expectedOuterX1, width),
    dOuterY1: exclusiveEnd(edge.maxY) - expectedOuterY1,
    editor: EDITOR_DENSITIES.map((density) => {
      const insetDots = editorInsetDots(dpm, density);
      return { density, insetDots, deltaVsHeadless: insetDots - pad };
    }),
  };
}

function runLength(
  gray: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  dx: number,
  dy: number,
): number {
  let n = 0;
  let px = x;
  let py = y;
  while (px >= 0 && py >= 0 && px < width && py < height && gray[py * width + px] < 160) {
    n += 1;
    px += dx;
    py += dy;
  }
  return n;
}

export function formatBorderTable(rows: BorderMeasure[]): string {
  const header =
    'id mm packed crop marginL marginR marginT marginB strokeL strokeR strokeT strokeB expected clipped spread cropExplains dX0 dY0 dX1 dY1';
  const lines = rows.map((r) =>
    [
      r.id,
      `${r.widthMm}x${r.heightMm}`,
      r.packedW,
      r.crop,
      r.marginL,
      r.marginR,
      r.marginT,
      r.marginB,
      r.strokeL,
      r.strokeR,
      r.strokeT,
      r.strokeB,
      r.expectedStroke,
      r.clipped ? 'yes' : 'no',
      r.marginSpread,
      r.cropExplainsRight ? 'yes' : 'no',
      r.dOuterX0,
      r.dOuterY0,
      r.dOuterX1,
      r.dOuterY1,
    ].join(' '),
  );
  const editor = rows[0]
    ? rows[0].editor
        .map((e) => `density ${e.density}: editor inset ${e.insetDots} headless ${rows[0].pad} delta ${e.deltaVsHeadless}`)
        .join('\n')
    : '';
  return [header, ...lines, editor].join('\n');
}

export type HeaderReview = {
  spec: PrintSpec;
  centeringDots: number;
  crop: number;
  header: string[];
  negativeMono: string;
  positiveShift: string;
};

/** Header strings copied from Td404PrinterModule printPngLabelNative / printMonoLabelNative. */
export function reviewHeader(
  widthMm: number,
  heightMm: number,
  hOffsetMm: number,
  vOffsetMm: number,
  gapMm = 2,
): HeaderReview {
  const spec = createPrintSpec({
    widthMm,
    heightMm,
    dpi: LOCATION_DPI,
    gapMm,
    mediaType: 'gap',
    calibration: { horizontalOffsetMm: hOffsetMm, verticalOffsetMm: vOffsetMm },
  });
  const centeringDots = computePrintheadCenteringOffset(spec.widthDots, spec.profile);
  const crop = spec.widthDots - spec.rasterWidthDots;
  const gap = `${gapMm.toFixed(2)}`;
  const bitmapX = spec.xOffsetDots < 0 || spec.yOffsetDots < 0 ? 0 : spec.xOffsetDots;
  const bitmapY = spec.xOffsetDots < 0 || spec.yOffsetDots < 0 ? 0 : spec.yOffsetDots;
  const header = [
    `SIZE ${widthMm.toFixed(2)} mm,${heightMm.toFixed(2)} mm`,
    `GAP ${gap} mm,0 mm`,
    'DIRECTION 1',
    'SET TEAR ON',
    'OFFSET 0 mm',
    'REFERENCE 0,0',
    `BITMAP ${bitmapX},${bitmapY},${spec.bytesPerRow},${spec.heightDots},0`,
    `xDots=${spec.xOffsetDots} yDots=${spec.yOffsetDots}`,
    `stored hOffsetMm=${hOffsetMm} vOffsetMm=${vOffsetMm}`,
    `alignment centering=${centeringDots}`,
    `sizeDots=${spec.widthDots} packedDots=${spec.rasterWidthDots} crop=${crop}`,
  ];
  const negativeMono =
    spec.xOffsetDots < 0 || spec.yOffsetDots < 0
      ? 'mono throws: printMonoLabel cannot bake negative offsets. PNG bakes the shift into the bitmap and BITMAP stays 0,0.'
      : 'offsets are non-negative, so BITMAP x,y equal xDots,yDots on both paths.';
  const positiveShift =
    'A positive offset moves BITMAP x,y. Ink inside the bitmap does not move, so margins in the payload stay put and the paper shifts by that many dots.';
  return { spec, centeringDots, crop, header, negativeMono, positiveShift };
}

export function parseTsplJobHeader(job: Uint8Array): string[] {
  let text = '';
  let commasAfterBitmap = 0;
  let inBitmap = false;
  const limit = Math.min(job.length, 800);
  for (let i = 0; i < limit; i++) {
    const c = job[i];
    if (c < 9 || c > 126) break;
    text += String.fromCharCode(c);
    if (!inBitmap && text.endsWith('BITMAP ')) inBitmap = true;
    else if (inBitmap && c === 44) {
      commasAfterBitmap += 1;
      if (commasAfterBitmap >= 5) break;
    }
  }
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('CLS'));
}

export function bakeOffset(gray: Uint8Array, width: number, height: number, dx: number, dy: number): Uint8Array {
  const out = new Uint8Array(width * height);
  out.fill(255);
  for (let y = 0; y < height; y++) {
    const ny = y + dy;
    if (ny < 0 || ny >= height) continue;
    for (let x = 0; x < width; x++) {
      const nx = x + dx;
      if (nx < 0 || nx >= width) continue;
      out[ny * width + nx] = gray[y * width + x];
    }
  }
  return out;
}
