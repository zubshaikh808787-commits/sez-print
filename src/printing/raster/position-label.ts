/**
 * Generic start/end fixture for the live screenshot path and the headless path.
 * Positions are millimetres. Expected ink is the canvas drawer, not a pixel constant.
 */

import {
  DEFAULT_BARCODE_STATE,
  DEFAULT_ELEMENT_STATE,
  DEFAULT_QRCODE_STATE,
  DEFAULT_SHAPE_STATE,
} from '@/components/editor/types';
import { barcodeModulesForMode } from '@/lib/barcode-code128';
import { snap1DBarcodeModules } from '@/lib/barcode/barcode-snapping';
import { createLabelDocument, elementSizeMm, type LabelDocument, type LabelElement } from '@/lib/label-document';
import { dotsPerMm, rectMmToDots } from '@/lib/printer/print-spec';
import { layoutPrintText, ptToMm } from '@/lib/text-metrics';
import { stretchThenRoundBars } from './barcode-stretch';
import { headlessInsetDots, measureBorderInk, type BorderMeasure } from './location-label';
import { generateQrMatrix } from '@/printing/renderer/qrcode';
import { inkBoundingBox } from './tspl-wire';

export const POSITION_DPI = 304;
const QR_CONTENT = 'SEZ';
const QR_LEVEL = 'L' as const;

export type PositionKind = 'qr' | 'barcode' | 'text' | 'box' | 'border';

export type PositionMark = {
  id: string;
  kind: PositionKind;
  left: number;
  top: number;
  width: number;
  height: number;
};

const TEXT_H = ptToMm(8);

export function positionMarks(widthMm: number, heightMm: number): PositionMark[] {
  return [
    { id: 'border', kind: 'border', left: 0, top: 0, width: widthMm, height: heightMm },
    { id: 'qr', kind: 'qr', left: 5, top: 5, width: 10, height: 10 },
    { id: 'barcode', kind: 'barcode', left: 5, top: 16, width: 12, height: 6 },
    { id: 'box', kind: 'box', left: 5, top: 23, width: 6, height: 3 },
    { id: 'text', kind: 'text', left: 12, top: 23, width: 8, height: TEXT_H },
  ];
}

export function createPositionLabel(widthMm: number, heightMm: number): LabelDocument {
  const elements: LabelElement[] = [
    {
      id: 'border',
      type: 'border',
      borderStyle: 'solid-medium',
      lineWidth: 0.55,
      rotation: 0,
      left: 0,
      top: 0,
      width: widthMm,
      height: heightMm,
      lockMovement: true,
      needPrinting: true,
      drawingColorIndex: 1,
    },
    {
      id: 'qr',
      type: 'qrcode',
      ...DEFAULT_QRCODE_STATE,
      content: QR_CONTENT,
      encodeMode: 'QRCode',
      errorLevel: QR_LEVEL,
      zoneSize: '0',
      left: 5,
      top: 5,
      width: 10,
      height: 10,
      needPrinting: true,
    },
    {
      id: 'barcode',
      type: 'barcode',
      ...DEFAULT_BARCODE_STATE,
      content: 'CAL',
      encodeMode: 'CODE-128',
      textFlag: 'Hide',
      left: 5,
      top: 16,
      width: 12,
      height: 6,
      needPrinting: true,
    },
    {
      id: 'box',
      type: 'shape',
      ...DEFAULT_SHAPE_STATE,
      figureShape: 'rectangle',
      fill: true,
      lineWidth: 0.2,
      left: 5,
      top: 23,
      width: 6,
      height: 3,
      needPrinting: true,
    },
    {
      id: 'text',
      type: 'text',
      ...DEFAULT_ELEMENT_STATE,
      text: 'AB',
      fontSize: 8,
      align: 'left',
      left: 12,
      top: 23,
      width: 8,
      height: TEXT_H,
      autoTextHeight: false,
      autoWrapping: 'Close',
      fontFamily: 'Default',
      needPrinting: true,
    },
  ];
  return createLabelDocument({
    name: `Position ${widthMm}x${heightMm}`,
    widthMm,
    heightMm,
    elements,
  });
}

export function positionPages(): Array<{ widthMm: number; heightMm: number; doc: LabelDocument }> {
  return [
    [50, 30],
    [25, 30],
    [57, 30],
  ].map(([widthMm, heightMm]) => ({
    widthMm,
    heightMm,
    doc: createPositionLabel(widthMm, heightMm),
  }));
}

type ExclusiveRect = { x0: number; y0: number; x1: number; y1: number };

export type PositionRow = {
  id: string;
  kind: PositionKind;
  boxX0: number;
  boxY0: number;
  boxX1: number;
  boxY1: number;
  canvasX0: number;
  canvasY0: number;
  canvasX1: number;
  canvasY1: number;
  inkX0: number | null;
  inkY0: number | null;
  inkX1: number | null;
  inkY1: number | null;
  dX0: number | null;
  dY0: number | null;
  dX1: number | null;
  dY1: number | null;
  expMmX0: number;
  expMmY0: number;
  expMmX1: number;
  expMmY1: number;
  measMmX0: number | null;
  measMmY0: number | null;
  measMmX1: number | null;
  measMmY1: number | null;
};

function canvasInk(el: LabelElement, dpi: number): ExclusiveRect {
  const dpm = dotsPerMm(dpi);
  const size = elementSizeMm(el);
  const rect = rectMmToDots(el.left, el.top, size.width, size.height, dpi);
  if (el.type === 'shape' && el.fill) {
    return { x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y1 };
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
  if (el.type === 'qrcode') {
    const matrix = generateQrMatrix(el.content || QR_CONTENT, QR_LEVEL);
    if (!matrix) return { x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y1 };
    const qz = Math.max(0, parseInt(String(el.zoneSize), 10) || 0);
    const total = matrix.size + qz * 2;
    const cell = Math.max(1, Math.floor(Math.min(rect.widthDots, rect.heightDots) / total));
    const drawn = cell * total;
    const ox = rect.x0 + Math.floor((rect.widthDots - drawn) / 2);
    const oy = rect.y0 + Math.floor((rect.heightDots - drawn) / 2);
    return { x0: ox + qz * cell, y0: oy + qz * cell, x1: ox + (qz + matrix.size) * cell, y1: oy + (qz + matrix.size) * cell };
  }
  if (el.type === 'barcode') {
    const modules = barcodeModulesForMode(el.encodeMode, el.content || 'CAL');
    const snapped = modules ? snap1DBarcodeModules(modules, el.width, 203, false) : null;
    if (!snapped) return { x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y1 };
    const rounded = stretchThenRoundBars(snapped.bars, rect.x0, rect.widthDots);
    const first = rounded[0];
    const last = rounded[rounded.length - 1];
    if (!first || !last) return { x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y1 };
    return { x0: first.x0, y0: rect.y0, x1: last.x0 + last.width, y1: rect.y1 };
  }
  if (el.type === 'border') {
    const pad = headlessInsetDots(dpm);
    return { x0: rect.x0 + pad, y0: rect.y0 + pad, x1: rect.x1 - pad, y1: rect.y1 - pad };
  }
  return { x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y1 };
}

export function measurePositionPage(
  gray: Uint8Array,
  width: number,
  height: number,
  doc: LabelDocument,
): PositionRow[] {
  const dpi = POSITION_DPI;
  const dpm = dotsPerMm(dpi);
  const rows: PositionRow[] = [];
  for (const el of doc.elements) {
    const kind = el.type === 'qrcode' ? 'qr' : el.type === 'shape' ? 'box' : (el.type as PositionKind);
    const size = elementSizeMm(el);
    const box = rectMmToDots(el.left, el.top, size.width, size.height, dpi);
    const canvas = canvasInk(el, dpi);
    let ink: { x0: number; y0: number; x1: number; y1: number } | null = null;
    if (el.type === 'border') {
      const frame: BorderMeasure = measureBorderInk(gray, width, height, {
        id: el.id,
        left: el.left,
        top: el.top,
        width: el.width,
        height: el.height,
        lineWidth: el.lineWidth,
        widthMm: doc.widthMm,
        heightMm: doc.heightMm,
      });
      ink = { x0: frame.outerX0, y0: frame.outerY0, x1: frame.outerX1, y1: frame.outerY1 };
    } else {
      const found = inkBoundingBox(
        gray,
        width,
        height,
        { x: box.x0 - 3, y: box.y0 - 3, w: box.widthDots + 6, h: box.heightDots + 6 },
        160,
      );
      if (found) ink = found;
    }
    const measX1 = ink ? ink.x1 + 1 : null;
    const measY1 = ink ? ink.y1 + 1 : null;
    rows.push({
      id: el.id,
      kind,
      boxX0: box.x0,
      boxY0: box.y0,
      boxX1: box.x1,
      boxY1: box.y1,
      canvasX0: canvas.x0,
      canvasY0: canvas.y0,
      canvasX1: canvas.x1,
      canvasY1: canvas.y1,
      inkX0: ink?.x0 ?? null,
      inkY0: ink?.y0 ?? null,
      inkX1: ink?.x1 ?? null,
      inkY1: ink?.y1 ?? null,
      dX0: ink ? ink.x0 - canvas.x0 : null,
      dY0: ink ? ink.y0 - canvas.y0 : null,
      dX1: measX1 == null ? null : measX1 - canvas.x1,
      dY1: measY1 == null ? null : measY1 - canvas.y1,
      expMmX0: canvas.x0 / dpm,
      expMmY0: canvas.y0 / dpm,
      expMmX1: canvas.x1 / dpm,
      expMmY1: canvas.y1 / dpm,
      measMmX0: ink ? ink.x0 / dpm : null,
      measMmY0: ink ? ink.y0 / dpm : null,
      measMmX1: measX1 == null ? null : measX1 / dpm,
      measMmY1: measY1 == null ? null : measY1 / dpm,
    });
  }
  return rows;
}

function n(value: number | null): string {
  if (value == null) return '-';
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function formatPositionTable(rows: PositionRow[]): string {
  const header =
    'id kind boxX0 boxY0 boxX1 boxY1 canvasX0 canvasY0 canvasX1 canvasY1 inkX0 inkY0 inkX1 inkY1 dX0 dY0 dX1 dY1 expMmX0 expMmY0 measMmX0 measMmY0';
  const lines = rows.map((r) =>
    [
      r.id,
      r.kind,
      r.boxX0,
      r.boxY0,
      r.boxX1,
      r.boxY1,
      r.canvasX0,
      r.canvasY0,
      r.canvasX1,
      r.canvasY1,
      n(r.inkX0),
      n(r.inkY0),
      n(r.inkX1),
      n(r.inkY1),
      n(r.dX0),
      n(r.dY0),
      n(r.dX1),
      n(r.dY1),
      r.expMmX0.toFixed(2),
      r.expMmY0.toFixed(2),
      n(r.measMmX0),
      n(r.measMmY0),
    ].join(' '),
  );
  return [header, ...lines].join('\n');
}

function off(row: PositionRow): boolean {
  return [row.dX0, row.dY0, row.dX1, row.dY1].some((d) => d == null || Math.abs(d) > 1);
}

export function classifyPosition(rows: PositionRow[]): string {
  const missing = rows.filter((r) => r.dX0 == null);
  if (missing.length) return `missing ink: ${missing.map((r) => r.id).join(', ')}`;
  const bad = rows.filter(off);
  if (!bad.length) return 'matches canvas within 1 dot';
  const starts = bad.map((r) => r.dX0);
  const sameX = starts.every((v) => v === starts[0]);
  const sameY = bad.every((r) => r.dY0 === bad[0].dY0);
  const kinds = new Set(bad.map((r) => r.kind));
  if (bad.length === rows.length && sameX && sameY) {
    return `constant shift Δx=${starts[0]} Δy=${bad[0].dY0}`;
  }
  const xs = rows.map((r) => r.canvasX0);
  const dx = rows.map((r) => r.dX0 ?? 0);
  const grows = Math.abs(dx[dx.length - 1] - dx[0]) > 1 && xs[xs.length - 1] !== xs[0];
  if (grows && bad.length > 1) return 'proportional drift';
  if (kinds.size === 1 && (kinds.has('qr') || kinds.has('barcode'))) return `${[...kinds][0]}-only`;
  if (kinds.size === 1 && kinds.has('text')) return 'text-only';
  if (bad.every((r) => r.kind === 'border' && Math.abs(r.dX1 ?? 0) > 1 && Math.abs(r.dX0 ?? 0) <= 1)) {
    return 'right-edge crop';
  }
  return `mixed: ${bad.map((r) => r.id).join(', ')}`;
}
