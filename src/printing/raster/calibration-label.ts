/**
 * 50×30 mm TD-404 calibration label and payload assertions.
 * Page is 600×360 at 304 DPI (12 dots/mm).
 */

import {
  DEFAULT_BARCODE_STATE,
  DEFAULT_ELEMENT_STATE,
  DEFAULT_LINE_STATE,
  DEFAULT_QRCODE_STATE,
  DEFAULT_SHAPE_STATE,
} from '@/components/editor/types';
import { createLabelDocument, type LabelDocument, type LabelElement } from '@/lib/label-document';
import { rectMmToDots } from '@/lib/printer/print-spec';
import { rasterizeDocumentToBitmapTimed } from './skia-rasterizer';
import { boxDownscaleGray, coverageDownscale, inkBoundingBox, thresholdGray } from './tspl-wire';

export const CALIBRATION_DPI = 304;
const DOT_MM = 1 / 12;

export type CalKind = 'box' | 'stroke1' | 'stroke2' | 'text-center' | 'text' | 'barcode' | 'qr' | 'border';

export type CalRegion = {
  id: string;
  kind: CalKind;
  left: number;
  top: number;
  width: number;
  height: number;
};

const COVERAGE_FLOOR: Partial<Record<CalKind, number>> = {
  box: 0.9,
  text: 0.01,
  'text-center': 0.01,
  barcode: 0.08,
  qr: 0.08,
  border: 0.005,
};

function shape(id: string, left: number, top: number, width: number, height: number): LabelElement {
  return {
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
  };
}

function hLine(id: string, left: number, top: number, width: number, dots: number): LabelElement {
  return {
    id,
    type: 'line',
    ...DEFAULT_LINE_STATE,
    left,
    top,
    width,
    height: dots * DOT_MM,
    needPrinting: true,
  };
}

function vTick(id: string, left: number, top: number): LabelElement {
  return {
    id,
    type: 'line',
    ...DEFAULT_LINE_STATE,
    left,
    top,
    width: DOT_MM,
    height: 0.6,
    needPrinting: true,
  };
}

function hTick(id: string, left: number, top: number): LabelElement {
  return {
    id,
    type: 'line',
    ...DEFAULT_LINE_STATE,
    left,
    top,
    width: 0.6,
    height: DOT_MM,
    needPrinting: true,
  };
}

function letter(
  id: string,
  text: string,
  fontSize: number,
  align: 'left' | 'center' | 'right',
  left: number,
  top: number,
  width: number,
  height: number,
): LabelElement {
  return {
    id,
    type: 'text',
    ...DEFAULT_ELEMENT_STATE,
    text,
    fontSize,
    align,
    left,
    top,
    width,
    height,
    autoTextHeight: false,
    autoWrapping: 'Close',
    fontFamily: 'Default',
    needPrinting: true,
  };
}

export function createCalibrationLabel(): { doc: LabelDocument; regions: CalRegion[] } {
  const regions: CalRegion[] = [
    { id: 'box10', kind: 'box', left: 1, top: 0.8, width: 10, height: 3.2 },
    { id: 'box20', kind: 'box', left: 12, top: 0.8, width: 20, height: 3.2 },
    { id: 'box40', kind: 'box', left: 1, top: 4.4, width: 40, height: 3.2 },
    { id: 'stroke1', kind: 'stroke1', left: 1, top: 8, width: 16, height: DOT_MM },
    { id: 'stroke2', kind: 'stroke2', left: 18, top: 8, width: 16, height: 2 * DOT_MM },
    { id: 'barcode', kind: 'barcode', left: 1, top: 9, width: 20, height: 6.2 },
    { id: 'qr', kind: 'qr', left: 22, top: 9, width: 6, height: 6 },
    { id: 'border', kind: 'border', left: 29, top: 9, width: 8, height: 6 },
  ];

  const texts: Array<[string, number, 'left' | 'center' | 'right', number, number, number]> = [
    ['L8', 8, 'left', 1, 16, 15],
    ['C8', 8, 'center', 17, 16, 15],
    ['R8', 8, 'right', 33, 16, 15],
    ['L12', 12, 'left', 1, 19.2, 15],
    ['C12', 12, 'center', 17, 19.2, 15],
    ['R12', 12, 'right', 33, 19.2, 15],
    ['L18', 18, 'left', 1, 23.6, 15],
    ['C18', 18, 'center', 17, 23.6, 15],
    ['R18', 18, 'right', 33, 23.6, 15],
  ];
  const textH = [2.9, 2.9, 2.9, 4.2, 4.2, 4.2, 6.2, 6.2, 6.2];
  texts.forEach((row, i) => {
    const [id, size, align, left, top, width] = row;
    regions.push({
      id,
      kind: align === 'center' ? 'text-center' : 'text',
      left,
      top,
      width,
      height: textH[i],
    });
  });

  const elements: LabelElement[] = [];
  for (let i = 0; i < 50; i++) elements.push(vTick(`tick-top-${i}`, i, 0));
  for (let i = 0; i < 30; i++) elements.push(hTick(`tick-left-${i}`, 0, i));
  for (const r of regions) {
    if (r.kind === 'box') elements.push(shape(r.id, r.left, r.top, r.width, r.height));
    else if (r.kind === 'stroke1') elements.push(hLine(r.id, r.left, r.top, r.width, 1));
    else if (r.kind === 'stroke2') elements.push(hLine(r.id, r.left, r.top, r.width, 2));
    else if (r.kind === 'barcode') {
      elements.push({
        id: r.id,
        type: 'barcode',
        ...DEFAULT_BARCODE_STATE,
        content: 'CAL',
        encodeMode: 'CODE-128',
        textFlag: 'Hide',
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
        needPrinting: true,
      });
    } else if (r.kind === 'qr') {
      elements.push({
        id: r.id,
        type: 'qrcode',
        ...DEFAULT_QRCODE_STATE,
        content: 'https://sez.print/cal',
        encodeMode: 'QRCode',
        errorLevel: 'M',
        zoneSize: '1' as typeof DEFAULT_QRCODE_STATE.zoneSize,
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
        needPrinting: true,
      });
    } else if (r.kind === 'border') {
      elements.push({
        id: r.id,
        type: 'border',
        borderStyle: 'solid-medium',
        lineWidth: 0.35,
        rotation: 0,
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
        lockMovement: true,
        needPrinting: true,
        drawingColorIndex: 1,
      });
    }
  }
  texts.forEach((row, i) => {
    const [glyph, size, align, left, top, width] = row;
    elements.push(letter(glyph, glyph[0], size, align, left, top, width, textH[i]));
  });

  return {
    doc: createLabelDocument({
      name: 'TD-404 calibration 50x30',
      widthMm: 50,
      heightMm: 30,
      paperType: 'Label',
      elements,
    }),
    regions,
  };
}

export type AssertionLine = { id: string; pass: boolean; detail: string };

function regionRect(region: CalRegion, dpi: number) {
  return rectMmToDots(region.left, region.top, region.width, region.height, dpi);
}

function coverage(
  gray: Uint8Array,
  width: number,
  height: number,
  box: { x0: number; y0: number; widthDots: number; heightDots: number },
  threshold: number,
): number {
  let ink = 0;
  let pixels = 0;
  const x1 = Math.min(width, box.x0 + box.widthDots);
  const y1 = Math.min(height, box.y0 + box.heightDots);
  for (let y = Math.max(0, box.y0); y < y1; y++) {
    for (let x = Math.max(0, box.x0); x < x1; x++) {
      pixels += 1;
      if (gray[y * width + x] < threshold) ink += 1;
    }
  }
  return pixels ? ink / pixels : 0;
}

function strokeThickness(
  gray: Uint8Array,
  width: number,
  height: number,
  box: { x0: number; y0: number; widthDots: number; heightDots: number },
  threshold: number,
): number {
  const x0 = Math.max(0, box.x0 + 2);
  const x1 = Math.min(width, box.x0 + box.widthDots - 2);
  const y0 = Math.max(0, box.y0 - 2);
  const y1 = Math.min(height, box.y0 + box.heightDots + 2);
  let rows = 0;
  for (let y = y0; y < y1; y++) {
    let hit = false;
    for (let x = x0; x < x1; x++) {
      if (gray[y * width + x] < threshold) {
        hit = true;
        break;
      }
    }
    if (hit) rows += 1;
  }
  return rows;
}

export function assertCalibrationPage(
  gray: Uint8Array,
  width: number,
  height: number,
  regions: CalRegion[],
  dpi = CALIBRATION_DPI,
  threshold = 160,
): { ok: boolean; lines: AssertionLine[] } {
  const lines: AssertionLine[] = [];
  for (const region of regions) {
    const rect = regionRect(region, dpi);
    if (region.kind === 'box') {
      const ink = inkBoundingBox(gray, width, height, { x: rect.x0, y: rect.y0, w: rect.widthDots, h: rect.heightDots }, threshold);
      if (!ink) {
        lines.push({ id: region.id, pass: false, detail: 'no ink' });
        continue;
      }
      const dx0 = Math.abs(ink.x0 - rect.x0);
      const dy0 = Math.abs(ink.y0 - rect.y0);
      const dx1 = Math.abs(ink.x1 - (rect.x1 - 1));
      const dy1 = Math.abs(ink.y1 - (rect.y1 - 1));
      const pass = dx0 <= 1 && dy0 <= 1 && dx1 <= 1 && dy1 <= 1;
      lines.push({
        id: region.id,
        pass,
        detail: `bbox ${ink.x0},${ink.y0}-${ink.x1},${ink.y1} vs ${rect.x0},${rect.y0}-${rect.x1 - 1},${rect.y1 - 1} Δ ${dx0},${dy0},${dx1},${dy1}`,
      });
    } else if (region.kind === 'text-center') {
      const ink = inkBoundingBox(
        gray,
        width,
        height,
        { x: rect.x0, y: rect.y0, w: rect.widthDots, h: rect.heightDots },
        threshold,
      );
      if (!ink) {
        lines.push({ id: region.id, pass: false, detail: 'no ink' });
        continue;
      }
      const inkCx = (ink.x0 + ink.x1) / 2;
      const boxCx = rect.x0 + (rect.widthDots - 1) / 2;
      const delta = Math.abs(inkCx - boxCx);
      lines.push({
        id: region.id,
        pass: delta <= 1,
        detail: `ink center ${inkCx.toFixed(2)} box center ${boxCx.toFixed(2)} Δ ${delta.toFixed(2)}`,
      });
    } else if (region.kind === 'stroke1' || region.kind === 'stroke2') {
      const thick = strokeThickness(gray, width, height, rect, threshold);
      const expect = region.kind === 'stroke1' ? 1 : 2;
      lines.push({
        id: region.id,
        pass: thick === expect,
        detail: `thickness ${thick} expected ${expect}`,
      });
    }
    const floor = COVERAGE_FLOOR[region.kind];
    if (floor != null) {
      const cov = coverage(gray, width, height, rect, threshold);
      lines.push({
        id: `${region.id}:coverage`,
        pass: cov >= floor,
        detail: `coverage ${(cov * 100).toFixed(2)}% floor ${(floor * 100).toFixed(2)}%`,
      });
    }
  }
  return { ok: lines.every((line) => line.pass), lines };
}

export function formatAssertions(result: { ok: boolean; lines: AssertionLine[] }): string {
  return result.lines.map((line) => `${line.pass ? 'PASS' : 'FAIL'} ${line.id} ${line.detail}`).join('\n');
}

export type DullnessRow = {
  method: string;
  stroke1: number;
  stroke2: number;
  stroke1Survives: boolean;
  stroke2Survives: boolean;
  box10: number;
  text: number;
  barcode: number;
  qr: number;
};

function regionById(regions: CalRegion[], id: string): CalRegion {
  const found = regions.find((r) => r.id === id);
  if (!found) throw new Error(`missing region ${id}`);
  return found;
}

function dullnessFromGray(
  method: string,
  gray: Uint8Array,
  width: number,
  height: number,
  regions: CalRegion[],
  threshold: number,
): DullnessRow {
  const stroke = (id: string) => strokeThickness(gray, width, height, regionRect(regionById(regions, id), CALIBRATION_DPI), threshold);
  const cov = (id: string) => coverage(gray, width, height, regionRect(regionById(regions, id), CALIBRATION_DPI), threshold);
  const s1 = stroke('stroke1');
  const s2 = stroke('stroke2');
  return {
    method,
    stroke1: s1,
    stroke2: s2,
    stroke1Survives: s1 >= 1,
    stroke2Survives: s2 >= 1,
    box10: cov('box10'),
    text: cov('C12'),
    barcode: cov('barcode'),
    qr: cov('qr'),
  };
}

/** Compare thresholding. Does not change the live print threshold or density. */
export function dullnessReport(doc: LabelDocument, regions: CalRegion[], threshold = 160): DullnessRow[] {
  const once = rasterizeDocumentToBitmapTimed(doc, CALIBRATION_DPI, { threshold, backend: 'dot-buffer', dotScale: 1 });
  const triple = rasterizeDocumentToBitmapTimed(doc, CALIBRATION_DPI, { threshold, backend: 'dot-buffer', dotScale: 3 });
  const averaged = thresholdGray(
    boxDownscaleGray(triple.gray, triple.result.widthDots, triple.result.heightDots, 3),
    threshold,
  );
  const covered = coverageDownscale(triple.gray, triple.result.widthDots, triple.result.heightDots, 3, threshold);
  const w = once.result.widthDots;
  const h = once.result.heightDots;
  return [
    dullnessFromGray('1x-threshold-160', thresholdGray(once.gray, threshold), w, h, regions, threshold),
    dullnessFromGray('3x-average-threshold-160', averaged, w, h, regions, threshold),
    dullnessFromGray('3x-coverage-0.5', covered, w, h, regions, threshold),
  ];
}

export function formatDullness(rows: DullnessRow[]): string {
  return rows
    .map(
      (row) =>
        `${row.method} stroke1=${row.stroke1}${row.stroke1Survives ? ' survives' : ' lost'} stroke2=${row.stroke2}${row.stroke2Survives ? ' survives' : ' lost'} box10=${(row.box10 * 100).toFixed(1)}% text=${(row.text * 100).toFixed(1)}% barcode=${(row.barcode * 100).toFixed(1)}% qr=${(row.qr * 100).toFixed(1)}%`,
    )
    .join('\n');
}
