import {
  DEFAULT_BARCODE_STATE,
  DEFAULT_ELEMENT_STATE,
  DEFAULT_QRCODE_STATE,
  type AutoWrapping,
} from '@/components/editor/types';
import { barcodeModulesForMode } from '@/lib/barcode-code128';
import { encodeDataMatrix } from '@/lib/barcode/datamatrix';
import { encodePdf417 } from '@/lib/barcode/pdf417';
import {
  snap1DBarcodeModules,
  snap2DMatrixToHardwareDots,
  type HardwareDpi,
} from '@/lib/barcode/barcode-snapping';
import {
  createLabelDocument,
  ptToMm,
  type LabelDocument,
  type LabelElement,
} from '@/lib/label-document';
import { dotsPerMm, mmToDots } from '@/lib/printer/print-spec';
import { generateQrMatrix } from '@/printing/renderer/qrcode';
import { computeWrappedLines } from '@/lib/text-metrics';
import { packGrayToMono1bpp } from './bit-packer';
import { makeOffscreenSurface, type RasterSurface, type RasterSurfaceBackend } from './skia-surface';

export type RasterizeOptions = {
  threshold?: number;
  /** Photographic content only. Fixture path leaves this false. */
  dither?: boolean;
  /** Reuse a previous result buffer (Task 4.6). Must match packed page size. */
  target?: RasterBitmap;
  /** Pin backend for profiling. Default: Skia when MakeOffscreen works. */
  backend?: RasterSurfaceBackend;
}

export type RasterBitmap = {
  widthDots: number;
  heightDots: number;
  bytesPerRow: number;
  mono1bppBuffer: Uint8Array;
};

const UNSUPPORTED: ReadonlySet<LabelElement['type']> = new Set([
  'table',
  'time',
  'arctext',
  'degrees',
  'clipart',
  'signature',
]);

export function packedPageDots(widthMm: number, heightMm: number, dpi: number): {
  sizeDotsW: number;
  sizeDotsH: number;
  packedW: number;
  packedH: number;
} {
  const dpm = dotsPerMm(dpi);
  const sizeDotsW = Math.max(1, Math.round(widthMm * dpm));
  const sizeDotsH = Math.max(1, Math.round(heightMm * dpm));
  const packedW = Math.max(8, Math.floor(sizeDotsW / 8) * 8);
  return { sizeDotsW, sizeDotsH, packedW, packedH: sizeDotsH };
}

export function wrapPrintText(element: {
  text: string;
  fontSize: number;
  width: number;
  autoWrapping?: AutoWrapping;
  charSpacing?: number;
  bold?: boolean;
  verticalDisplay?: boolean;
}): string[] {
  return computeWrappedLines({
    text: element.text,
    fontSize: element.fontSize,
    widthMm: element.width,
    autoWrapping: element.autoWrapping ?? 'Word',
    charSpacing: element.charSpacing ?? 0,
    bold: element.bold ?? false,
    verticalDisplay: element.verticalDisplay ?? false,
  });
}

export type RasterizeTiming = {
  allocMs: number;
  encodeMs: number;
  drawMs: number;
  readbackMs: number;
  packMs: number;
  rasterizeMs: number;
  bitpackMs: number;
  backend: RasterSurfaceBackend;
  result: RasterBitmap;
  gray: Uint8Array;
};

let encodeAccumMs = 0;

function timedEncode<T>(fn: () => T): T {
  const t = performance.now();
  const value = fn();
  encodeAccumMs += performance.now() - t;
  return value;
}

function drawDocumentToSurface(doc: LabelDocument, dpi: number, surface: RasterSurface): void {
  const dpm = dotsPerMm(dpi);
  const elements = [...doc.elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  for (const el of elements) {
    if (el.needPrinting === false) continue;
    if (UNSUPPORTED.has(el.type)) {
      throw new Error(`Unsupported print element type: ${el.type}`);
    }
    switch (el.type) {
      case 'text':
        drawText(surface, el, dpi, dpm);
        break;
      case 'barcode':
        drawBarcode(surface, el, dpi, dpm);
        break;
      case 'qrcode':
        drawQr(surface, el, dpi);
        break;
      case 'border':
        drawBorder(surface, el, dpi, dpm);
        break;
      case 'line':
        drawLine(surface, el, dpi, dpm);
        break;
      case 'shape':
        drawShape(surface, el, dpi, dpm);
        break;
      case 'image':
        throw new Error('Unsupported print element type: image (decode not wired in Stage A host path)');
      default:
        throw new Error(`Unsupported print element type: ${(el as LabelElement).type}`);
    }
  }
}

export function rasterizeDocumentToBitmap(
  doc: LabelDocument,
  dpi: number,
  options: RasterizeOptions = {},
): RasterBitmap {
  const { packedW, packedH } = packedPageDots(doc.widthMm, doc.heightMm, dpi);
  const surface = makeOffscreenSurface(packedW, packedH, options.backend);
  const threshold = options.threshold ?? 160;

  drawDocumentToSurface(doc, dpi, surface);

  const gray = surface.readGray();
  const packed = packGrayToMono1bpp(
    gray,
    packedW,
    packedH,
    threshold,
    options.target?.mono1bppBuffer,
  );
  if (options.target) {
    options.target.widthDots = packedW;
    options.target.heightDots = packedH;
    options.target.bytesPerRow = packed.bytesPerRow;
    options.target.mono1bppBuffer = packed.mono1bppBuffer;
    return options.target;
  }
  return {
    widthDots: packedW,
    heightDots: packedH,
    bytesPerRow: packed.bytesPerRow,
    mono1bppBuffer: packed.mono1bppBuffer,
  };
}

/** Task 4.4 — split rasterize vs bit-pack timing on device. */
export function rasterizeDocumentToBitmapTimed(
  doc: LabelDocument,
  dpi: number,
  options: RasterizeOptions = {},
): RasterizeTiming {
  const { packedW, packedH } = packedPageDots(doc.widthMm, doc.heightMm, dpi);
  const threshold = options.threshold ?? 160;

  encodeAccumMs = 0;
  const tAlloc0 = performance.now();
  const surface = makeOffscreenSurface(packedW, packedH, options.backend);
  const allocMs = performance.now() - tAlloc0;

  const tDraw0 = performance.now();
  drawDocumentToSurface(doc, dpi, surface);
  const drawWallMs = performance.now() - tDraw0;
  const encodeMs = encodeAccumMs;
  const drawMs = Math.max(0, drawWallMs - encodeMs);

  const tRead0 = performance.now();
  const gray = surface.readGray();
  const readbackMs = performance.now() - tRead0;

  const tPack0 = performance.now();
  const packed = packGrayToMono1bpp(
    gray,
    packedW,
    packedH,
    threshold,
    options.target?.mono1bppBuffer,
  );
  const packMs = performance.now() - tPack0;

  const result: RasterBitmap = options.target
    ? (() => {
        options.target!.widthDots = packedW;
        options.target!.heightDots = packedH;
        options.target!.bytesPerRow = packed.bytesPerRow;
        options.target!.mono1bppBuffer = packed.mono1bppBuffer;
        return options.target!;
      })()
    : {
        widthDots: packedW,
        heightDots: packedH,
        bytesPerRow: packed.bytesPerRow,
        mono1bppBuffer: packed.mono1bppBuffer,
      };

  return {
    allocMs,
    encodeMs,
    drawMs,
    readbackMs,
    packMs,
    rasterizeMs: allocMs + encodeMs + drawMs + readbackMs,
    bitpackMs: packMs,
    backend: surface.backend,
    result,
    gray,
  };
}

function inkValue(antiColor?: boolean): number {
  return antiColor ? 255 : 0;
}

function resolveFontFamily(name?: string): string | undefined {
  if (!name || name === 'Default' || name === 'Barcode') return undefined;
  // Stage A host path avoids FONT_LIBRARY (pulls react-native). Device uses matchFont fallback.
  return undefined;
}

function drawText(
  surface: RasterSurface,
  el: Extract<LabelElement, { type: 'text' }>,
  dpi: number,
  dpm: number,
): void {
  const x0 = mmToDots(el.left, dpi);
  const y0 = mmToDots(el.top, dpi);
  const boxW = Math.max(1, mmToDots(el.left + el.width, dpi) - x0);
  const heightMm = typeof el.height === 'number' && el.height > 0 ? el.height : 8;
  const boxH = Math.max(1, mmToDots(el.top + heightMm, dpi) - y0);
  if (el.antiColor) {
    surface.fillRect(x0, y0, boxW, boxH, 0);
  }
  const raw =
    el.contentType === 'Data Source' && el.columnNameContent
      ? `{${el.columnNameContent}}`
      : el.text;
  const lines = wrapPrintText({
    text: raw,
    fontSize: el.fontSize,
    width: el.width,
    autoWrapping: el.autoWrapping,
    charSpacing: el.charSpacing,
    bold: el.bold,
    verticalDisplay: el.verticalDisplay,
  });
  const fontH = Math.max(1, Math.round(ptToMm(el.fontSize) * dpm));
  const lineH = Math.max(fontH, Math.round(fontH * 1.25));
  const ink = inkValue(el.antiColor);
  const textStyle = {
    fontSizeDots: fontH,
    bold: el.bold,
    italic: el.italic,
    family: resolveFontFamily(el.fontFamily) ?? 'sans-serif',
    ink,
  };
  let ty = y0;
  for (const line of lines) {
    if (ty >= y0 + boxH) break;
    let tx = x0;
    const lineW = Math.round(surface.measureTextWidth(line, textStyle));
    if (el.align === 'center') tx = x0 + Math.max(0, Math.floor((boxW - lineW) / 2));
    else if (el.align === 'right') tx = x0 + Math.max(0, boxW - lineW);
    surface.drawTextLine(line, tx, ty, textStyle);
    ty += lineH;
  }
}

function drawBarcode(
  surface: RasterSurface,
  el: Extract<LabelElement, { type: 'barcode' }>,
  dpi: number,
  dpm: number,
): void {
  const content =
    el.contentType === 'Data Source' && el.columnNameContent
      ? `{${el.columnNameContent}}`
      : el.content || '0123456789';
  const rawModules = timedEncode(() => barcodeModulesForMode(el.encodeMode, content));
  if (!rawModules) throw new Error(`Invalid barcode content for mode ${el.encodeMode}`);
  const snapped = snap1DBarcodeModules(rawModules, el.width, dpi as HardwareDpi, false);
  if (!snapped) throw new Error('Barcode snap failed');
  const x0 = mmToDots(el.left, dpi);
  const y0 = mmToDots(el.top, dpi);
  const boxW = Math.max(1, mmToDots(el.left + el.width, dpi) - x0);
  const boxH = Math.max(1, mmToDots(el.top + el.height, dpi) - y0);
  const ink = inkValue(el.antiColor);
  if (el.antiColor) surface.fillRect(x0, y0, boxW, boxH, 0);
  const fontH = Math.max(8, Math.round(ptToMm(el.fontSize) * dpm));
  const showLabel = el.textFlag !== 'Hide';
  const labelH = showLabel ? Math.max(8, Math.round(fontH * 1.2)) : 0;
  const barsH = Math.max(2, boxH - labelH);
  const barsY = el.textFlag === 'Top' ? y0 + labelH : y0;
  const originX = x0 + Math.round(snapped.offsetXMm * dpm);
  for (const bar of snapped.bars) {
    surface.fillRect(originX + bar.dotX, barsY, bar.dotWidth, barsH, ink);
  }
  if (showLabel) {
    const labelY = el.textFlag === 'Top' ? y0 : y0 + barsH;
    surface.drawTextLine(content, x0, labelY, {
      fontSizeDots: fontH,
      bold: el.bold,
      italic: el.italic,
      family: resolveFontFamily(el.fontFamily) ?? 'sans-serif',
      ink,
    });
  }
}

function drawQr(
  surface: RasterSurface,
  el: Extract<LabelElement, { type: 'qrcode' }>,
  dpi: number,
): void {
  const content =
    el.contentType === 'Data Source' && el.columnNameContent
      ? `{${el.columnNameContent}}`
      : el.content || 'https://example.com';
  const qz = Math.max(0, parseInt(String(el.zoneSize), 10) || 0);
  const ink = inkValue(el.antiColor);
  const x0 = mmToDots(el.left, dpi);
  const y0 = mmToDots(el.top, dpi);
  const boxW = Math.max(1, mmToDots(el.left + el.width, dpi) - x0);
  const boxH = Math.max(1, mmToDots(el.top + el.height, dpi) - y0);
  if (!el.antiColor) surface.fillRect(x0, y0, boxW, boxH, 255);
  else surface.fillRect(x0, y0, boxW, boxH, 0);

  if (el.encodeMode === 'QRCode' || !el.encodeMode) {
    const matrix = timedEncode(() =>
      generateQrMatrix(content, (el.errorLevel as 'L' | 'M' | 'Q' | 'H') || 'M'),
    );
    if (!matrix) throw new Error('QR encode failed');
    const snap = snap2DMatrixToHardwareDots(
      matrix.size,
      matrix.size,
      el.width,
      el.height,
      dpi as HardwareDpi,
      qz,
    );
    const ox = x0 + mmToDots(snap.offsetXMm, dpi);
    const oy = y0 + mmToDots(snap.offsetYMm, dpi);
    const cell = snap.dotSize;
    const origin = qz * cell;
    for (let r = 0; r < matrix.size; r++) {
      for (let c = 0; c < matrix.size; c++) {
        if (matrix.data[r * matrix.size + c]) {
          surface.fillRect(ox + origin + c * cell, oy + origin + r * cell, cell, cell, ink);
        }
      }
    }
    return;
  }

  if (el.encodeMode === 'DataMatrix') {
    const dm = timedEncode(() => encodeDataMatrix(content, el.width > el.height * 1.5));
    if (!dm) throw new Error('DataMatrix encode failed');
    const snap = snap2DMatrixToHardwareDots(
      dm.cols,
      dm.rows,
      el.width,
      el.height,
      dpi as HardwareDpi,
      Math.max(1, qz),
    );
    const ox = x0 + mmToDots(snap.offsetXMm, dpi);
    const oy = y0 + mmToDots(snap.offsetYMm, dpi);
    const qzDots = Math.max(1, qz) * snap.dotSize;
    for (let r = 0; r < dm.rows; r++) {
      for (let c = 0; c < dm.cols; c++) {
        if (dm.matrix[r][c]) {
          surface.fillRect(
            ox + qzDots + c * snap.dotSize,
            oy + qzDots + r * snap.dotSize,
            snap.dotSize,
            snap.dotSize,
            ink,
          );
        }
      }
    }
    return;
  }

  if (el.encodeMode === 'PDF417') {
    const pdf = timedEncode(() => encodePdf417(content, 2));
    if (!pdf) throw new Error('PDF417 encode failed');
    const snap = snap2DMatrixToHardwareDots(
      pdf.cols,
      pdf.rows,
      el.width,
      el.height,
      dpi as HardwareDpi,
      Math.max(2, qz),
    );
    const ox = x0 + mmToDots(snap.offsetXMm, dpi);
    const oy = y0 + mmToDots(snap.offsetYMm, dpi);
    const qzM = Math.max(2, qz);
    for (let r = 0; r < pdf.rows; r++) {
      for (let c = 0; c < pdf.cols; c++) {
        if (pdf.matrix[r][c]) {
          surface.fillRect(
            ox + (c + qzM) * snap.dotSize,
            oy + (r + qzM) * snap.dotSize,
            snap.dotSize,
            snap.dotSize,
            ink,
          );
        }
      }
    }
    return;
  }

  throw new Error(`Unsupported 2D encode mode: ${el.encodeMode}`);
}

function drawBorder(
  surface: RasterSurface,
  el: Extract<LabelElement, { type: 'border' }>,
  dpi: number,
  dpm: number,
): void {
  const stroke = Math.max(1, Math.round(el.lineWidth * dpm));
  const x0 = mmToDots(el.left, dpi);
  const y0 = mmToDots(el.top, dpi);
  const w = Math.max(stroke * 2, mmToDots(el.left + el.width, dpi) - x0);
  const h = Math.max(stroke * 2, mmToDots(el.top + el.height, dpi) - y0);
  surface.strokeRect(x0, y0, w, h, stroke, 0);
}

function drawLine(
  surface: RasterSurface,
  el: Extract<LabelElement, { type: 'line' }>,
  dpi: number,
  dpm: number,
): void {
  const x0 = mmToDots(el.left, dpi);
  const y0 = mmToDots(el.top, dpi);
  const w = Math.max(1, mmToDots(el.left + el.width, dpi) - x0);
  const h = Math.max(1, mmToDots(el.top + el.height, dpi) - y0);
  const vertical = h >= w * 2;
  const stroke = Math.max(1, Math.round((vertical ? el.width : el.height) * dpm));
  if (vertical) {
    surface.fillRect(x0 + Math.floor(w / 2) - Math.floor(stroke / 2), y0, stroke, h, 0);
  } else {
    surface.fillRect(x0, y0 + Math.floor(h / 2) - Math.floor(stroke / 2), w, stroke, 0);
  }
}

function drawShape(
  surface: RasterSurface,
  el: Extract<LabelElement, { type: 'shape' }>,
  dpi: number,
  dpm: number,
): void {
  const x0 = mmToDots(el.left, dpi);
  const y0 = mmToDots(el.top, dpi);
  const w = Math.max(1, mmToDots(el.left + el.width, dpi) - x0);
  const h = Math.max(1, mmToDots(el.top + el.height, dpi) - y0);
  const stroke = Math.max(1, Math.round(el.lineWidth * dpm));
  if (el.figureShape === 'oval' || el.figureShape === 'circle') {
    const rx = el.figureShape === 'circle' ? Math.min(w, h) / 2 : w / 2;
    const ry = el.figureShape === 'circle' ? Math.min(w, h) / 2 : h / 2;
    surface.fillEllipse(x0 + w / 2, y0 + h / 2, rx, ry, el.fill ? 0 : 255);
    return;
  }
  if (el.fill) surface.fillRect(x0, y0, w, h, 0);
  else surface.strokeRect(x0, y0, w, h, stroke, 0);
}

/** Frozen 50×30 mm fixture from PHASE_4_PLAN.md Part 1. */
export function createPhase4FrozenDocument(): LabelDocument {
  const text: LabelElement = {
    id: 'phase4-text',
    type: 'text',
    ...DEFAULT_ELEMENT_STATE,
    text: 'Phase 4 baseline label 50x30 text wrap check',
    left: 3,
    top: 3,
    width: 44,
    height: 8,
    align: 'left',
    autoWrapping: 'Word',
    fontFamily: 'Default',
    needPrinting: true,
  };
  const barcode: LabelElement = {
    id: 'phase4-barcode',
    type: 'barcode',
    ...DEFAULT_BARCODE_STATE,
    content: 'BASELINE50X30',
    encodeMode: 'CODE-128',
    textFlag: 'Bottom',
    left: 3,
    top: 12,
    width: 28,
    height: 12,
    needPrinting: true,
  };
  const qr: LabelElement = {
    id: 'phase4-qr',
    type: 'qrcode',
    ...DEFAULT_QRCODE_STATE,
    content: 'https://sez.print/baseline',
    encodeMode: 'QRCode',
    errorLevel: 'M',
    zoneSize: '1' as typeof DEFAULT_QRCODE_STATE.zoneSize,
    left: 34,
    top: 12,
    width: 13,
    height: 13,
    needPrinting: true,
  };
  const border: LabelElement = {
    id: 'phase4-border',
    type: 'border',
        borderStyle: 'solid-medium',
    lineWidth: 0.35,
    rotation: 0,
    left: 1,
    top: 1,
    width: 48,
    height: 28,
    lockMovement: true,
    needPrinting: true,
    drawingColorIndex: 1,
  };
  return createLabelDocument({
    name: 'Phase 4 frozen 50x30',
    widthMm: 50,
    heightMm: 30,
    paperType: 'Label',
    elements: [border, text, barcode, qr],
  });
}
