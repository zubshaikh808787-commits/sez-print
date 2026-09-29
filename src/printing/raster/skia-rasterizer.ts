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
  elementSizeMm,
  ptToMm,
  type LabelDocument,
  type LabelElement,
} from '@/lib/label-document';
import { dotsPerMm, mmToDots, rectMmToDots } from '@/lib/printer/print-spec';
import { sortLayers } from '@/lib/template-schema';
import { computeWrappedLines, layoutPrintText } from '@/lib/text-metrics';
import { formatBarcodeHri } from '@/lib/barcode/hri';
import { stretchThenRoundBars } from './barcode-stretch';
import { packGrayToMono1bpp } from './bit-packer';
import { cropGrayKeepLeft, padGray } from './bitmap';
import { drawPrintBorder } from './print-border';
import { drawQrMeet } from './qr-meet';
import {
  makeOffscreenSurface,
  resetTextDrawLog,
  type RasterSurface,
  type RasterSurfaceBackend,
} from './skia-surface';

export type RasterizeOptions = {
  threshold?: number;
  /** Photographic content only. Fixture path leaves this false. */
  dither?: boolean;
  /** Pin the label frame to SIZE with a 2 mm inset on every side. */
  lockBorderToPage?: boolean;
  /**
   * White columns added on the left. The bitmap grows by the same amount
   * (byte-aligned) so the right edge of the canvas is not cropped.
   */
  registrationPadXMm?: number;
  /** Reuse a previous result buffer (Task 4.6). Must match packed page size. */
  target?: RasterBitmap;
  /** Pin backend for profiling. Default: Skia when MakeOffscreen works. */
  backend?: RasterSurfaceBackend;
  /** Ground-truth only. Default 1. Packs/draws at N× then caller downscales. */
  dotScale?: number;
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

function isUnsupportedPrintType(type: LabelElement['type']): boolean {
  return type === 'image' || UNSUPPORTED.has(type);
}

function collectUnsupportedHeadlessElements(doc: LabelDocument): { types: Set<string>; ids: string[] } {
  const types = new Set<string>();
  const ids: string[] = [];
  for (const el of doc.elements) {
    if (!isUnsupportedPrintType(el.type)) continue;
    types.add(el.type);
    ids.push(`${el.type}:${el.id}`);
  }
  return { types, ids };
}

/** True when every layer can be drawn by the headless Skia/dot raster (no ViewShot needed). */
export function canHeadlessRasterPrint(doc: LabelDocument): boolean {
  return collectUnsupportedHeadlessElements(doc).types.size === 0;
}

/**
 * Headless TD-404 must abort if the document contains any Stage A-unsupported
 * type — including needPrinting=false. Skipping those and drawing the rest
 * would send a partial label.
 */
export function assertHeadlessRasterDocument(doc: LabelDocument): void {
  const { types, ids } = collectUnsupportedHeadlessElements(doc);
  if (types.size === 0) return;
  throw new Error(
    `Unsupported print element type: ${[...types].join(', ')} (${ids.join(', ')}). Headless TD-404 print aborted; no bytes were sent.`,
  );
}

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
let activeDotScale = 1;

function dots(mm: number, dpi: number): number {
  return mmToDots(mm, dpi) * activeDotScale;
}

function dpmScaled(dpi: number): number {
  return dotsPerMm(dpi) * activeDotScale;
}

function timedEncode<T>(fn: () => T): T {
  const t = performance.now();
  const value = fn();
  encodeAccumMs += performance.now() - t;
  return value;
}

type DotBox = { x0: number; y0: number; w: number; h: number };

/** Same rectangle LabelPreview uses when printDpi is set. */
function placementBox(el: LabelElement, dpi: number): DotBox {
  const size = elementSizeMm(el);
  const rect = rectMmToDots(el.left, el.top, size.width, size.height, dpi);
  const s = activeDotScale;
  return {
    x0: rect.x0 * s,
    y0: rect.y0 * s,
    w: Math.max(1, rect.widthDots * s),
    h: Math.max(1, rect.heightDots * s),
  };
}

function drawDocumentToSurface(
  doc: LabelDocument,
  dpi: number,
  surface: RasterSurface,
  lockBorderToPage?: boolean,
): void {
  const dpm = dpmScaled(dpi);
  for (const el of sortLayers(doc.elements)) {
    if (el.needPrinting === false || el.visible === false) continue;
    if (UNSUPPORTED.has(el.type)) {
      throw new Error(`Unsupported print element type: ${el.type}`);
    }
    const box = placementBox(el, dpi);
    const draw = () => {
      switch (el.type) {
        case 'text':
          drawText(surface, el, dpi, dpm, box);
          break;
        case 'barcode':
          drawBarcode(surface, el, dpi, dpm, box);
          break;
        case 'qrcode':
          drawQr(surface, el, dpi, box);
          break;
        case 'border':
          drawPrintBorder(
            surface,
            el,
            dpi,
            activeDotScale,
            lockBorderToPage ? { pageWidthMm: doc.widthMm, pageHeightMm: doc.heightMm } : undefined,
          );
          break;
        case 'line':
          drawLine(surface, el, dpm, box);
          break;
        case 'shape':
          drawShape(surface, el, dpm, box);
          break;
        case 'image':
          throw new Error('Unsupported print element type: image (decode not wired in Stage A host path)');
        default:
          throw new Error(`Unsupported print element type: ${(el as LabelElement).type}`);
      }
    };
    const rotation = el.rotation ?? 0;
    if (rotation % 360 !== 0) {
      surface.withRotation(box.x0 + box.w / 2, box.y0 + box.h / 2, rotation, draw);
    } else {
      draw();
    }
  }
}

export function rasterizeDocumentToBitmap(
  doc: LabelDocument,
  dpi: number,
  options: RasterizeOptions = {},
): RasterBitmap {
  return rasterizeDocumentToBitmapTimed(doc, dpi, options).result;
}

/** Task 4.4 — split rasterize vs bit-pack timing on device. */
export function rasterizeDocumentToBitmapTimed(
  doc: LabelDocument,
  dpi: number,
  options: RasterizeOptions = {},
): RasterizeTiming {
  const { sizeDotsW, packedW, packedH } = packedPageDots(doc.widthMm, doc.heightMm, dpi);
  const threshold = options.threshold ?? 160;
  activeDotScale = Math.max(1, Math.round(options.dotScale ?? 1));
  resetTextDrawLog();
  const surfW = sizeDotsW * activeDotScale;
  const surfH = packedH * activeDotScale;
  const packedSurfW = packedW * activeDotScale;

  encodeAccumMs = 0;
  const tAlloc0 = performance.now();
  const surface = makeOffscreenSurface(surfW, surfH, options.backend);
  const allocMs = performance.now() - tAlloc0;

  const tDraw0 = performance.now();
  drawDocumentToSurface(doc, dpi, surface, options.lockBorderToPage);
  const drawWallMs = performance.now() - tDraw0;
  const encodeMs = encodeAccumMs;
  const drawMs = Math.max(0, drawWallMs - encodeMs);

  const tRead0 = performance.now();
  let grayBmp = { width: surfW, height: surfH, gray: surface.readGray() };
  const padX = Math.max(0, mmToDots(options.registrationPadXMm ?? 0, dpi) * activeDotScale);
  let outW = packedSurfW;
  if (padX > 0) {
    const rawW = grayBmp.width + padX;
    const aligned = Math.ceil(rawW / 8) * 8;
    grayBmp = padGray(grayBmp, padX, aligned - rawW);
    outW = grayBmp.width;
  } else if (grayBmp.width !== packedSurfW || grayBmp.height !== surfH) {
    grayBmp = cropGrayKeepLeft(grayBmp, packedSurfW, surfH);
  }
  const gray = grayBmp.gray;
  const readbackMs = performance.now() - tRead0;

  const tPack0 = performance.now();
  const packed = packGrayToMono1bpp(
    gray,
    outW,
    surfH,
    threshold,
    options.target?.mono1bppBuffer,
  );
  const packMs = performance.now() - tPack0;

  const result: RasterBitmap = options.target
    ? (() => {
        options.target!.widthDots = outW;
        options.target!.heightDots = surfH;
        options.target!.bytesPerRow = packed.bytesPerRow;
        options.target!.mono1bppBuffer = packed.mono1bppBuffer;
        return options.target!;
      })()
    : {
        widthDots: outW,
        heightDots: packedH * activeDotScale,
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
  try {
    const { FONT_LIBRARY } = require('@/constants/font-library') as {
      FONT_LIBRARY: { name: string; id: string; family?: string }[];
    };
    const byName = FONT_LIBRARY.find((f) => f.name === name || f.id === name);
    return byName?.family;
  } catch {
    return undefined;
  }
}

function drawText(
  surface: RasterSurface,
  el: Extract<LabelElement, { type: 'text' }>,
  _dpi: number,
  dpm: number,
  box: DotBox,
): void {
  const { x0, y0, w: boxW, h: boxH } = box;
  if (el.antiColor) {
    surface.fillRect(x0, y0, boxW, boxH, 0);
  }
  const raw =
    el.contentType === 'Data Source' && el.columnNameContent
      ? `{${el.columnNameContent}}`
      : el.text;
  const layout = layoutPrintText({
    text: raw,
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
  const ink = inkValue(el.antiColor);
  const blockH = Math.max(lineH, layout.lines.length * lineH);
  const textStyle = {
    fontSizeDots: fontH,
    bold: el.bold,
    italic: el.italic,
    family: resolveFontFamily(el.fontFamily),
    ink,
  };
  let ty = y0 + Math.floor((boxH - blockH) / 2);
  for (let i = 0; i < layout.lines.length; i++) {
    const line = layout.lines[i];
    const next = ty + lineH;
    if (next > y0 && ty < y0 + boxH && line.length > 0) {
      const lineW = Math.round(surface.measureTextWidth(line, textStyle));
      let tx = x0;
      if (el.align === 'center') tx = x0 + Math.floor((boxW - lineW) / 2);
      else if (el.align === 'right') tx = x0 + Math.max(0, boxW - lineW);
      surface.drawTextLine(line, tx, ty, textStyle);
    }
    ty = next;
  }
}

function drawBarcode(
  surface: RasterSurface,
  el: Extract<LabelElement, { type: 'barcode' }>,
  _dpi: number,
  dpm: number,
  box: DotBox,
): void {
  const content =
    el.contentType === 'Data Source' && el.columnNameContent
      ? `{${el.columnNameContent}}`
      : el.content || '0123456789';
  const rawModules = timedEncode(() => barcodeModulesForMode(el.encodeMode, content));
  if (!rawModules) throw new Error(`Invalid barcode content for mode ${el.encodeMode}`);
  // Same snap inputs as BarcodeContent (203 DPI, no quiet zone). Stretch fills the print box.
  const snapped = snap1DBarcodeModules(rawModules, el.width, 203, false);
  if (!snapped) throw new Error('Barcode snap failed');
  const { x0, y0, w: boxW, h: boxH } = box;
  const ink = inkValue(el.antiColor);
  if (el.antiColor) surface.fillRect(x0, y0, boxW, boxH, 0);
  const fontH = Math.max(8, Math.round(ptToMm(el.fontSize) * dpm));
  const showLabel = el.textFlag !== 'Hide';
  const labelH = showLabel ? Math.max(8, Math.round(fontH * 1.2)) : 0;
  const barsH = Math.max(2, boxH - labelH);
  const barsY = el.textFlag === 'Top' ? y0 + labelH : y0;
  const rounded = stretchThenRoundBars(snapped.bars, x0, boxW);
  for (const bar of rounded) {
    surface.fillRect(bar.x0, barsY, bar.width, barsH, ink);
  }
  if (showLabel) {
    const hri = formatBarcodeHri(el.encodeMode, content);
    const labelY = el.textFlag === 'Top' ? y0 : y0 + barsH;
    const textStyle = {
      fontSizeDots: fontH,
      bold: el.bold,
      italic: el.italic,
      family: resolveFontFamily(el.fontFamily),
      ink,
    };
    const lineW = Math.round(surface.measureTextWidth(hri, textStyle));
    let tx = x0;
    if (el.align === 'center') tx = x0 + Math.max(0, Math.floor((boxW - lineW) / 2));
    else if (el.align === 'right') tx = x0 + Math.max(0, boxW - lineW);
    const textY = labelY + Math.max(0, Math.floor((labelH - fontH) / 2));
    surface.drawTextLine(hri, tx, textY, textStyle);
  }
}

function drawQr(
  surface: RasterSurface,
  el: Extract<LabelElement, { type: 'qrcode' }>,
  dpi: number,
  box: DotBox,
): void {
  const content =
    el.contentType === 'Data Source' && el.columnNameContent
      ? `{${el.columnNameContent}}`
      : el.content || 'https://example.com';
  const qz = Math.max(0, parseInt(String(el.zoneSize), 10) || 0);
  const ink = inkValue(el.antiColor);
  const { x0, y0, w: boxW, h: boxH } = box;
  if (el.antiColor) surface.fillRect(x0, y0, boxW, boxH, 0);

  if (el.encodeMode === 'QRCode' || !el.encodeMode) {
    timedEncode(() =>
      drawQrMeet(
        surface,
        content,
        (el.errorLevel as 'L' | 'M' | 'Q' | 'H') || 'M',
        qz,
        x0,
        y0,
        boxW,
        boxH,
        ink,
      ),
    );
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
    const ox = x0 + dots(snap.offsetXMm, dpi);
    const oy = y0 + dots(snap.offsetYMm, dpi);
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
    const ox = x0 + dots(snap.offsetXMm, dpi);
    const oy = y0 + dots(snap.offsetYMm, dpi);
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

function drawLine(
  surface: RasterSurface,
  el: Extract<LabelElement, { type: 'line' }>,
  dpm: number,
  box: DotBox,
): void {
  const { x0, y0, w, h } = box;
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
  dpm: number,
  box: DotBox,
): void {
  const { x0, y0, w, h } = box;
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
