/**
 * Canvas Export & Coordinate Translation Engine.
 *
 * Ground-truth architecture principle:
 * All label geometry lives in millimeters. Never store or reason about pixels
 * until the single point where you either:
 * 1. Render to screen (multiply mm by screen scale factor).
 * 2. Render to printer TSPL (multiply mm by printer dots-per-mm).
 *
 * Screen px and zoom factor are strictly visual transformations and NEVER
 * alter underlying mm coordinates.
 */

import { PRINTER_DPI, DOTS_PER_MM, computeDotsPerMm } from './calibration';
import { TsplBuilder } from './tspl-builder';
import { LabelShapeDefinition, generateShapeBoundaryRaster } from './contour-detection';

export interface CanvasBoxElement {
  id: string;
  type?: 'box' | 'shape';
  left: number; // physical mm
  top: number; // physical mm
  width: number; // physical mm
  height: number; // physical mm
  lineWidth?: number; // physical mm (stroke thickness)
  [key: string]: unknown;
}

export interface CanvasTextElement {
  id: string;
  type: 'text';
  text: string;
  left: number; // physical mm
  top: number; // physical mm
  fontSize: number; // pt (e.g. 6, 8, 10, 12, 14, 18, 24, 36)
  rotation?: 0 | 90 | 180 | 270;
  width?: number; // physical mm
  height?: number; // physical mm
  [key: string]: unknown;
}

export interface CanvasBarcodeElement {
  id: string;
  type: 'barcode';
  data: string;
  left: number; // physical mm
  top: number; // physical mm
  height: number; // physical mm
  width?: number; // physical mm (auto-calculated from data & narrowDots if omitted)
  symbology?: '128' | '39' | 'EAN13'; // default '128'
  readable?: 0 | 1; // default 1 (human-readable text below)
  rotation?: 0 | 90 | 180 | 270;
  narrowDots?: number; // default 2 (~0.167mm at 304 DPI)
  [key: string]: unknown;
}

export interface CanvasQrElement {
  id: string;
  type: 'qr';
  data: string;
  left: number; // physical mm
  top: number; // physical mm
  sizeMm: number; // physical mm (width and height)
  eccLevel?: 'L' | 'M' | 'Q' | 'H'; // default 'M'
  rotation?: 0 | 90 | 180 | 270;
  cellWidthDots?: number; // optional explicit override
  [key: string]: unknown;
}

export type CanvasElement =
  | CanvasBoxElement
  | CanvasTextElement
  | CanvasBarcodeElement
  | CanvasQrElement;

export interface BackgroundReference {
  uri: string;
  imageWidthPx?: number;
  imageHeightPx?: number;
  leftMm?: number;
  topMm?: number;
  widthMm?: number;
  heightMm?: number;
  opacity?: number; // 0.0 - 1.0 (default 0.6)
  visible?: boolean;
}

export interface CanvasBitmapRaster {
  leftMm: number;
  topMm: number;
  widthMm: number;
  heightMm: number;
  widthDots: number;
  heightDots: number;
  bytesPerRow: number;
  data: Uint8Array; // 1-bit monochrome inverted bitmap (1 = black ink dot)
}

export interface CanvasPrintJobResult {
  tsplAscii: string;
  binaryPayload: Uint8Array;
  hasBitmap: boolean;
  totalBytes: number;
}

export interface CanvasDocument {
  widthMm: number;
  heightMm: number;
  gapMm?: number;
  direction?: 0 | 1;
  backgroundReference?: BackgroundReference;
  shape?: LabelShapeDefinition;
  elements: CanvasElement[];
}

export interface ExportCanvasJobOptions extends ExportCanvasOptions {
  bitmap?: CanvasBitmapRaster;
}


/**
 * Convert physical millimetres to screen pixels at a given scale (px per mm).
 */
export function mmToScreenPx(mm: number, scalePxPerMm: number): number {
  return mm * scalePxPerMm;
}

/**
 * Convert screen pixels back to physical millimetres at a given scale (px per mm).
 */
export function screenPxToMm(px: number, scalePxPerMm: number): number {
  if (scalePxPerMm <= 0) return 0;
  return px / scalePxPerMm;
}

/**
 * Compute contain-fit scale (pixels per mm) to display the label inside available viewport dimensions.
 */
export function computeScreenFitScale(
  widthMm: number,
  heightMm: number,
  viewportWidthPx: number,
  viewportHeightPx: number,
  paddingPx = 16,
): number {
  const availW = Math.max(10, viewportWidthPx - paddingPx * 2);
  const availH = Math.max(10, viewportHeightPx - paddingPx * 2);
  const scaleW = availW / Math.max(0.1, widthMm);
  const scaleH = availH / Math.max(0.1, heightMm);
  return Math.min(scaleW, scaleH);
}

/**
 * Calculate updated element position in mm from a screen pixel drag displacement.
 *
 * @param currentPosMm Current element left/top in physical mm
 * @param deltaPx Drag displacement in screen pixels
 * @param scalePxPerMm Base canvas scale (px/mm)
 * @param zoomFactor Current visual zoom multiplier (defaults to 1.0)
 * @param boundsMm Optional label boundary constraints in mm
 */
export function applyDragToMm(
  currentPosMm: { left: number; top: number },
  deltaPx: { x: number; y: number },
  scalePxPerMm: number,
  zoomFactor = 1.0,
  boundsMm?: { labelWidth: number; labelHeight: number; elementWidth: number; elementHeight: number },
): { left: number; top: number } {
  const effectiveScale = scalePxPerMm * Math.max(0.01, zoomFactor);
  let nextLeft = currentPosMm.left + deltaPx.x / effectiveScale;
  let nextTop = currentPosMm.top + deltaPx.y / effectiveScale;

  if (boundsMm) {
    const maxLeft = Math.max(0, boundsMm.labelWidth - boundsMm.elementWidth);
    const maxTop = Math.max(0, boundsMm.labelHeight - boundsMm.elementHeight);
    nextLeft = Math.max(0, Math.min(maxLeft, nextLeft));
    nextTop = Math.max(0, Math.min(maxTop, nextTop));
  }

  return {
    left: Math.round(nextLeft * 100) / 100,
    top: Math.round(nextTop * 100) / 100,
  };
}

/**
 * Calculate updated element size in mm from a screen pixel resize displacement.
 *
 * @param currentSizeMm Current element width/height in physical mm
 * @param deltaPx Resize displacement in screen pixels
 * @param scalePxPerMm Base canvas scale (px/mm)
 * @param zoomFactor Current visual zoom multiplier (defaults to 1.0)
 * @param minSizeMm Minimum allowable dimension in mm (defaults to 2.0 mm)
 * @param maxSizeMm Optional maximum dimension boundary constraints in mm
 */
export function applyResizeToMm(
  currentSizeMm: { width: number; height: number },
  deltaPx: { w: number; h: number },
  scalePxPerMm: number,
  zoomFactor = 1.0,
  minSizeMm = 2.0,
  maxSizeMm?: { maxWidth: number; maxHeight: number },
): { width: number; height: number } {
  const effectiveScale = scalePxPerMm * Math.max(0.01, zoomFactor);
  let nextW = Math.max(minSizeMm, currentSizeMm.width + deltaPx.w / effectiveScale);
  let nextH = Math.max(minSizeMm, currentSizeMm.height + deltaPx.h / effectiveScale);

  if (maxSizeMm) {
    nextW = Math.min(maxSizeMm.maxWidth, nextW);
    nextH = Math.min(maxSizeMm.maxHeight, nextH);
  }

  return {
    width: Math.round(nextW * 100) / 100,
    height: Math.round(nextH * 100) / 100,
  };
}

export interface RulerTick {
  mm: number;
  isMajor: boolean; // every 10mm (0, 10, 20...)
  isMid: boolean; // every 5mm (5, 15, 25...)
  label?: string; // e.g. "0", "10", "20"
}

/**
 * Generate millimeter ruler tick marks for visual measurement scale guides.
 * Major ticks appear every 10mm with numeric label; mid ticks at 5mm; minor ticks every 1mm.
 */
export function generateRulerTicks(lengthMm: number, stepMm = 1): RulerTick[] {
  const ticks: RulerTick[] = [];
  const count = Math.floor(Math.max(0, lengthMm));
  for (let i = 0; i <= count; i += stepMm) {
    const isMajor = i % 10 === 0;
    const isMid = !isMajor && i % 5 === 0;
    ticks.push({
      mm: i,
      isMajor,
      isMid,
      label: isMajor ? String(i) : undefined,
    });
  }
  return ticks;
}

export interface TsplFontResolution {
  font: string; // '1' | '2' | '3' | '4' | '5'
  xMulti: number;
  yMulti: number;
  capHeightMm: number;
  dotsHeight: number;
}

/**
 * Deterministic mapping from font size (pt) to TSPL hardware bitmap font and multiplier.
 *
 * Physical heights at 304 DPI (11.9685 dots/mm):
 * - Font 1 (8x12):   12 dots = 1.00 mm cap height (~6-7 pt)
 * - Font 2 (12x20):  20 dots = 1.67 mm cap height (~8-9 pt)
 * - Font 3 (16x24):  24 dots = 2.01 mm cap height (~10-12 pt)
 * - Font 4 (24x32):  32 dots = 2.67 mm cap height (~14-16 pt)
 * - Font 5 (32x48):  48 dots = 4.01 mm cap height (~18-20 pt)
 * - Font 4 x2:       64 dots = 5.35 mm cap height (~24-28 pt)
 * - Font 5 x2:       96 dots = 8.02 mm cap height (~32-40 pt)
 * - Font 5 x3:      144 dots = 12.03 mm cap height (>40 pt)
 */
export function resolveTsplFont(fontSizePt: number): TsplFontResolution {
  const size = Math.max(4, fontSizePt);
  if (size <= 7) {
    return { font: '1', xMulti: 1, yMulti: 1, capHeightMm: 1.0, dotsHeight: 12 };
  }
  if (size <= 9) {
    return { font: '2', xMulti: 1, yMulti: 1, capHeightMm: 1.67, dotsHeight: 20 };
  }
  if (size <= 12) {
    return { font: '3', xMulti: 1, yMulti: 1, capHeightMm: 2.01, dotsHeight: 24 };
  }
  if (size <= 16) {
    return { font: '4', xMulti: 1, yMulti: 1, capHeightMm: 2.67, dotsHeight: 32 };
  }
  if (size <= 20) {
    return { font: '5', xMulti: 1, yMulti: 1, capHeightMm: 4.01, dotsHeight: 48 };
  }
  if (size <= 28) {
    return { font: '4', xMulti: 2, yMulti: 2, capHeightMm: 5.35, dotsHeight: 64 };
  }
  if (size <= 40) {
    return { font: '5', xMulti: 2, yMulti: 2, capHeightMm: 8.02, dotsHeight: 96 };
  }
  return { font: '5', xMulti: 3, yMulti: 3, capHeightMm: 12.03, dotsHeight: 144 };
}

/**
 * Return the physical printed cap-height in mm for a given font size.
 */
export function tsplFontHeightMm(fontSizePt: number): number {
  return resolveTsplFont(fontSizePt).capHeightMm;
}

export type MediaSensorType = 'gap' | 'blackmark' | 'continuous';

export interface ExportCanvasOptions {
  copies?: number;
  gapMm?: number;
  sensorType?: MediaSensorType;
  blackMarkHeightMm?: number;
  direction?: 0 | 1;
  dpi?: number;
  calibrationScale?: { scaleX: number; scaleY: number };
  printBoundary?: boolean;
}

/**
 * Export the canvas outer boundary as a TSPL box script for physical size verification.
 * The background reference image is non-printing, so this prints only the outer label footprint.
 */
export function exportCanvasBoundaryToTspl(
  doc: {
    widthMm: number;
    heightMm: number;
    gapMm?: number;
    direction?: 0 | 1;
    lineWidth?: number;
    shape?: LabelShapeDefinition;
  },
  options?: ExportCanvasOptions,
): string {
  const builder = new TsplBuilder({
    dpi: options?.dpi,
    calibrationScale: options?.calibrationScale,
  });
  builder.setSize(doc.widthMm, doc.heightMm);
  builder.setSensor(
    options?.sensorType ?? 'gap',
    options?.sensorType === 'blackmark'
      ? (options?.blackMarkHeightMm ?? 3)
      : (options?.gapMm ?? doc.gapMm ?? 2),
    0,
  );
  builder.setDirection(options?.direction ?? doc.direction ?? 1);
  builder.clear();

  const thickness = doc.lineWidth ?? 0.35;
  const shape = doc.shape;

  if (shape && shape.type === 'circle') {
    const diam = Math.min(doc.widthMm, doc.heightMm);
    builder.drawCircle(0, 0, diam, thickness);
  } else if (shape && (shape.type === 'roundedRectangle' || shape.type === 'diecut' || shape.type === 'ellipse')) {
    const raster = generateShapeBoundaryRaster(shape, { thicknessMm: thickness });
    builder.getCommands().push(`BITMAP 0,0,${raster.bytesPerRow},${raster.heightDots},0,[...binary raster: ${raster.data.length} bytes...]`);
  } else {
    builder.drawBox(0, 0, doc.widthMm, doc.heightMm, thickness);
  }

  builder.print(options?.copies ?? 1);
  return builder.build();
}

/**
 * Export the canvas boundary as an executable atomic CanvasPrintJobResult (supporting binary BITMAP for rounded/diecut).
 */
export function exportCanvasBoundaryJob(
  doc: {
    widthMm: number;
    heightMm: number;
    gapMm?: number;
    direction?: 0 | 1;
    lineWidth?: number;
    shape?: LabelShapeDefinition;
  },
  options?: ExportCanvasOptions,
): CanvasPrintJobResult {
  const shape = doc.shape;
  const thickness = doc.lineWidth ?? 0.35;

  if (shape && (shape.type === 'roundedRectangle' || shape.type === 'diecut' || shape.type === 'ellipse')) {
    const raster = generateShapeBoundaryRaster(shape, { thicknessMm: thickness });
    const bm: CanvasBitmapRaster = {
      leftMm: 0,
      topMm: 0,
      widthMm: doc.widthMm,
      heightMm: doc.heightMm,
      widthDots: raster.widthDots,
      heightDots: raster.heightDots,
      bytesPerRow: raster.bytesPerRow,
      data: raster.data,
    };
    return exportUnifiedCanvasJob(
      {
        widthMm: doc.widthMm,
        heightMm: doc.heightMm,
        gapMm: doc.gapMm,
        direction: doc.direction,
        elements: [],
      },
      {
        ...options,
        bitmap: bm,
        printBoundary: false,
      },
    );
  }

  const ascii = exportCanvasBoundaryToTspl(doc, options);
  const binaryPayload = new TextEncoder().encode(ascii);
  return {
    tsplAscii: ascii,
    binaryPayload,
    hasBitmap: false,
    totalBytes: binaryPayload.length,
  };
}

/**
 * Calculate expected physical width in millimeters of a Code 128 barcode at 304 DPI.
 * Standard Code 128: 20 quiet modules + 11 start + (11 * chars) + 11 check + 13 stop.
 * Uses Code C pairing optimization for numeric runs (>= 4 digits).
 */
export function calculateCode128WidthMm(data: string, narrowDots = 2): number {
  if (!data || data.length === 0) return 0;
  let modules = 10 + 11 + 11 + 13 + 10; // quiet (20) + start (11) + check (11) + stop (13) = 55
  let i = 0;
  while (i < data.length) {
    let digitRun = 0;
    while (i + digitRun < data.length && data[i + digitRun] >= '0' && data[i + digitRun] <= '9') {
      digitRun++;
    }
    if (digitRun >= 4 || (digitRun >= 2 && i === 0 && digitRun === data.length)) {
      const pairs = Math.floor(digitRun / 2);
      modules += pairs * 11;
      i += pairs * 2;
    } else {
      modules += 11;
      i++;
    }
  }
  const totalDots = modules * narrowDots;
  return Number((totalDots / DOTS_PER_MM).toFixed(2));
}

/**
 * Resolve optimal QR module/cell width in printer dots (1-10) for a desired mm size.
 * At 304 DPI (11.97 dots/mm), cellWidthDots = 4 gives ~0.334mm per module.
 */
export function resolveQrCellWidth(sizeMm: number, dataLength = 20): number {
  let versionModules = 25; // default Version 2
  if (dataLength <= 14) versionModules = 21;
  else if (dataLength <= 32) versionModules = 25;
  else if (dataLength <= 50) versionModules = 29;
  else if (dataLength <= 78) versionModules = 33;
  else versionModules = 37;

  const totalModules = versionModules + 8; // 4 module quiet zone on each side
  const availableDots = sizeMm * DOTS_PER_MM;
  const computedDots = Math.floor(availableDots / totalModules);
  return Math.max(1, Math.min(10, computedDots || 3));
}

/**
 * Calculate expected physical QR code footprint in millimeters given a cell width in dots.
 */
export function calculateQrFootprintMm(cellWidthDots: number, dataLength = 20): number {
  let versionModules = 25;
  if (dataLength <= 14) versionModules = 21;
  else if (dataLength <= 32) versionModules = 25;
  else if (dataLength <= 50) versionModules = 29;
  else if (dataLength <= 78) versionModules = 33;
  else versionModules = 37;

  const totalModules = versionModules + 8;
  const totalDots = totalModules * cellWidthDots;
  return Number((totalDots / DOTS_PER_MM).toFixed(2));
}

export interface ScannabilityResult {
  isScannable: boolean;
  warnings: string[];
  calculatedWidthMm: number;
  calculatedHeightMm: number;
}

/**
 * Scannability validator for barcode and QR elements.
 * Verifies dimensions against minimum physical scanning thresholds and label boundaries.
 */
export function validateScannability(
  element: CanvasBarcodeElement | CanvasQrElement,
  labelWidthMm: number,
  labelHeightMm: number,
): ScannabilityResult {
  const warnings: string[] = [];
  let isScannable = true;
  let calculatedWidthMm = 0;
  let calculatedHeightMm = 0;

  if (element.type === 'barcode') {
    if (!element.data || element.data.trim().length === 0) {
      warnings.push('Barcode data is empty.');
      return { isScannable: false, warnings, calculatedWidthMm: 0, calculatedHeightMm: 0 };
    }

    calculatedHeightMm = typeof element.height === 'number' ? element.height : 10;
    const narrowDots = typeof element.narrowDots === 'number' ? element.narrowDots : 2;
    calculatedWidthMm =
      typeof element.width === 'number'
        ? element.width
        : calculateCode128WidthMm(element.data, narrowDots);

    if (calculatedHeightMm < 5) {
      warnings.push(`Barcode height (${calculatedHeightMm}mm) is under 5mm. Handheld 1D scanners may fail.`);
      isScannable = false;
    }

    if (element.left + calculatedWidthMm > labelWidthMm) {
      warnings.push(
        `Barcode extends beyond right label edge by ${(element.left + calculatedWidthMm - labelWidthMm).toFixed(1)}mm. Barcode will be clipped.`,
      );
      isScannable = false;
    }

    if (element.top + calculatedHeightMm > labelHeightMm) {
      warnings.push(
        `Barcode extends beyond bottom label edge by ${(element.top + calculatedHeightMm - labelHeightMm).toFixed(1)}mm.`,
      );
      isScannable = false;
    }

    if (narrowDots < 2) {
      warnings.push('Narrow bar width < 2 dots may blur on 304 DPI thermal print head.');
      isScannable = false;
    }
  } else if (element.type === 'qr') {
    if (!element.data || element.data.trim().length === 0) {
      warnings.push('QR Code data is empty.');
      return { isScannable: false, warnings, calculatedWidthMm: 0, calculatedHeightMm: 0 };
    }

    const sizeMm = typeof element.sizeMm === 'number' ? element.sizeMm : 15;
    const cellDots =
      typeof element.cellWidthDots === 'number'
        ? element.cellWidthDots
        : resolveQrCellWidth(sizeMm, element.data.length);
    calculatedWidthMm = calculateQrFootprintMm(cellDots, element.data.length);
    calculatedHeightMm = calculatedWidthMm;

    if (sizeMm < 8) {
      warnings.push(`QR Code size (${sizeMm}mm) is under 8mm minimum threshold. Cameras will struggle to decode.`);
      isScannable = false;
    } else if (sizeMm < 10) {
      warnings.push(`QR Code size (${sizeMm}mm) is under recommended 10mm.`);
    }

    if (cellDots < 3) {
      warnings.push(`QR cell width (${cellDots} dots) is below 3 dots. Thermal ink spread can cause module bridging.`);
      isScannable = false;
    }

    if (element.left + calculatedWidthMm > labelWidthMm) {
      warnings.push(
        `QR Code extends beyond right label edge by ${(element.left + calculatedWidthMm - labelWidthMm).toFixed(1)}mm.`,
      );
      isScannable = false;
    }

    if (element.top + calculatedHeightMm > labelHeightMm) {
      warnings.push(
        `QR Code extends beyond bottom label edge by ${(element.top + calculatedHeightMm - labelHeightMm).toFixed(1)}mm.`,
      );
      isScannable = false;
    }
  }

  return {
    isScannable,
    warnings,
    calculatedWidthMm,
    calculatedHeightMm,
  };
}

/**
 * Export a canvas label document to TSPL via Phase 1 TsplBuilder.
 * Accepts both CanvasDocument and general label document models with box and text elements.
 * Background reference images are non-printing.
 */
export function exportCanvasToTspl(
  doc: {
    widthMm: number;
    heightMm: number;
    gapMm?: number;
    direction?: 0 | 1;
    elements: Array<
      | CanvasBoxElement
      | CanvasTextElement
      | {
          left: number;
          top: number;
          width?: number;
          height?: number;
          lineWidth?: number;
          type?: string;
          text?: string;
          fontSize?: number;
          rotation?: number;
          [key: string]: unknown;
        }
    >;
  },
  options?: ExportCanvasOptions,
): string {
  const builder = new TsplBuilder({
    dpi: options?.dpi,
    calibrationScale: options?.calibrationScale,
  });

  builder.setSize(doc.widthMm, doc.heightMm);
  builder.setSensor(
    options?.sensorType ?? 'gap',
    options?.sensorType === 'blackmark'
      ? (options?.blackMarkHeightMm ?? 3)
      : (options?.gapMm ?? doc.gapMm ?? 2),
    0,
  );
  builder.setDirection(options?.direction ?? doc.direction ?? 1);
  builder.clear();

  if (options?.printBoundary) {
    builder.drawBox(0, 0, doc.widthMm, doc.heightMm, 0.35);
  }

  for (const el of doc.elements) {
    // 1. Text elements
    if (el.type === 'text' && typeof el.text === 'string') {
      const fontRes = resolveTsplFont(typeof el.fontSize === 'number' ? el.fontSize : 12);
      builder.drawText(el.left, el.top, el.text, el.fontSize, {
        font: fontRes.font,
        xMulti: fontRes.xMulti,
        yMulti: fontRes.yMulti,
        rotation: (el.rotation as 0 | 90 | 180 | 270) ?? 0,
      });
      continue;
    }

    // 3. Barcode elements
    if (el.type === 'barcode' && typeof el.data === 'string') {
      builder.drawBarcode(
        el.left,
        el.top,
        el.data,
        (el.symbology as string) ?? '128',
        {
          heightMm: typeof el.height === 'number' ? el.height : 10,
          readable: (el.readable as 0 | 1) ?? 1,
          rotation: (el.rotation as 0 | 90 | 180 | 270) ?? 0,
          narrowDots: typeof el.narrowDots === 'number' ? el.narrowDots : 2,
        },
      );
      continue;
    }

    // 4. QR code elements
    if (el.type === 'qr' && typeof el.data === 'string') {
      const cellWidth =
        typeof el.cellWidthDots === 'number'
          ? el.cellWidthDots
          : resolveQrCellWidth(typeof el.sizeMm === 'number' ? el.sizeMm : 15, el.data.length);
      builder.drawQrCode(el.left, el.top, el.data, {
        cellWidthDots: cellWidth,
        eccLevel: (el.eccLevel as 'L' | 'M' | 'Q' | 'H') ?? 'M',
        model: 'M2',
        mask: 'S7',
        rotation: (el.rotation as 0 | 90 | 180 | 270) ?? 0,
      });
      continue;
    }

    // 5. Box/shape elements
    const isBox = !el.type || el.type === 'box' || el.type === 'shape';
    if (isBox && typeof el.width === 'number') {
      const wMm = el.width;
      const hMm = el.height ?? el.width;
      const thickness = typeof el.lineWidth === 'number' ? el.lineWidth : 0.35;

      builder.drawBox(el.left, el.top, wMm, hMm, thickness);
    }
  }

  builder.print(options?.copies ?? 1);
  return builder.build();
}

/**
 * Snap physical millimetre coordinate or dimension to specified grid step (e.g. 0.5 mm or 1.0 mm).
 */
export function snapToGridMm(valMm: number, stepMm: number): number {
  if (stepMm <= 0) return Number(valMm.toFixed(2));
  return Number((Math.round(valMm / stepMm) * stepMm).toFixed(2));
}

/**
 * Return computed physical bounding footprint (width and height in mm) of any element.
 */
export function getElementFootprintMm(el: CanvasElement): { widthMm: number; heightMm: number } {
  if (el.type === 'barcode') {
    const bc = el as CanvasBarcodeElement;
    const w = bc.width ?? calculateCode128WidthMm(bc.data, bc.narrowDots ?? 2);
    const h = bc.height ?? 10;
    return { widthMm: w, heightMm: h };
  }
  if (el.type === 'qr') {
    const qr = el as CanvasQrElement;
    const cellDots = qr.cellWidthDots ?? resolveQrCellWidth(qr.sizeMm, qr.data.length);
    const footprint = calculateQrFootprintMm(cellDots, qr.data.length);
    return { widthMm: footprint, heightMm: footprint };
  }
  if (el.type === 'text') {
    const txt = el as CanvasTextElement;
    const capH = tsplFontHeightMm(txt.fontSize);
    const approxW = Math.max(8, txt.text.length * (capH * 0.65));
    return { widthMm: approxW, heightMm: Math.max(4, capH * 1.5) };
  }
  const box = el as CanvasBoxElement;
  const w = box.width ?? 10;
  const h = box.height ?? 10;
  return { widthMm: w, heightMm: h };
}

/**
 * Move element in canvas immutably, clamping within physical label mm bounds and applying optional grid snapping.
 */
export function moveElementInCanvas(
  elements: CanvasElement[],
  id: string,
  newLeftMm: number,
  newTopMm: number,
  labelWidthMm: number,
  labelHeightMm: number,
  snapStepMm = 0,
): CanvasElement[] {
  return elements.map((el) => {
    if (el.id !== id) return el;
    const { widthMm, heightMm } = getElementFootprintMm(el);
    let left = snapStepMm > 0 ? snapToGridMm(newLeftMm, snapStepMm) : newLeftMm;
    let top = snapStepMm > 0 ? snapToGridMm(newTopMm, snapStepMm) : newTopMm;

    // Clamp within label boundaries
    const maxLeft = Math.max(0, labelWidthMm - widthMm);
    const maxTop = Math.max(0, labelHeightMm - heightMm);
    left = Math.max(0, Math.min(left, maxLeft));
    top = Math.max(0, Math.min(top, maxTop));

    return {
      ...el,
      left: Number(left.toFixed(2)),
      top: Number(top.toFixed(2)),
    };
  });
}

export type ResizeHandle = 'se' | 'e' | 's' | 'sw' | 'nw' | 'ne';

/**
 * Resize element in canvas immutably, respecting element type constraints and label boundaries.
 */
export function resizeElementInCanvas(
  elements: CanvasElement[],
  id: string,
  handle: ResizeHandle,
  deltaMmX: number,
  deltaMmY: number,
  labelWidthMm: number,
  labelHeightMm: number,
  snapStepMm = 0,
): CanvasElement[] {
  return elements.map((el) => {
    if (el.id !== id) return el;

    if (el.type === 'barcode') {
      const bc = el as CanvasBarcodeElement;
      let newHeight = bc.height + deltaMmY;
      if (snapStepMm > 0) newHeight = snapToGridMm(newHeight, snapStepMm);
      newHeight = Math.max(5, Math.min(newHeight, labelHeightMm - bc.top));
      return { ...bc, height: Number(newHeight.toFixed(2)) };
    }

    if (el.type === 'qr') {
      const qr = el as CanvasQrElement;
      const delta = Math.abs(deltaMmX) > Math.abs(deltaMmY) ? deltaMmX : deltaMmY;
      let newSize = qr.sizeMm + delta;
      if (snapStepMm > 0) newSize = snapToGridMm(newSize, snapStepMm);
      const maxSize = Math.min(labelWidthMm - qr.left, labelHeightMm - qr.top);
      newSize = Math.max(8, Math.min(newSize, maxSize));
      return { ...qr, sizeMm: Number(newSize.toFixed(2)) };
    }

    if (el.type === 'text') {
      const txt = el as CanvasTextElement;
      const newFontSize = Math.max(6, Math.min(48, Math.round(txt.fontSize + deltaMmY * 1.5)));
      return { ...txt, fontSize: newFontSize };
    }

    // Box element
    const box = el as CanvasBoxElement;
    let newWidth = box.width;
    let newHeight = box.height;
    let newLeft = box.left;
    let newTop = box.top;

    if (handle.includes('e')) {
      newWidth = Math.max(2, Math.min(box.width + deltaMmX, labelWidthMm - box.left));
    }
    if (handle.includes('s')) {
      newHeight = Math.max(2, Math.min(box.height + deltaMmY, labelHeightMm - box.top));
    }
    if (handle.includes('w')) {
      const maxDeltaX = box.width - 2;
      const clampedDeltaX = Math.min(deltaMmX, maxDeltaX);
      newLeft = Math.max(0, box.left + clampedDeltaX);
      newWidth = box.width - (newLeft - box.left);
    }
    if (handle.includes('n')) {
      const maxDeltaY = box.height - 2;
      const clampedDeltaY = Math.min(deltaMmY, maxDeltaY);
      newTop = Math.max(0, box.top + clampedDeltaY);
      newHeight = box.height - (newTop - box.top);
    }

    if (snapStepMm > 0) {
      newWidth = snapToGridMm(newWidth, snapStepMm);
      newHeight = snapToGridMm(newHeight, snapStepMm);
      newLeft = snapToGridMm(newLeft, snapStepMm);
      newTop = snapToGridMm(newTop, snapStepMm);
    }

    return {
      ...box,
      left: Number(newLeft.toFixed(2)),
      top: Number(newTop.toFixed(2)),
      width: Number(newWidth.toFixed(2)),
      height: Number(newHeight.toFixed(2)),
    };
  });
}

/**
 * Cycle element rotation clockwise: 0 -> 90 -> 180 -> 270 -> 0.
 */
export function rotateElementInCanvas(elements: CanvasElement[], id: string): CanvasElement[] {
  return elements.map((el) => {
    if (el.id !== id) return el;
    const currentRot = (el.rotation as 0 | 90 | 180 | 270) ?? 0;
    const nextRot: 0 | 90 | 180 | 270 =
      currentRot === 0 ? 90 : currentRot === 90 ? 180 : currentRot === 180 ? 270 : 0;
    return { ...el, rotation: nextRot };
  });
}

export type ReorderAction = 'bringToFront' | 'sendToBack' | 'moveForward' | 'moveBackward';

/**
 * Reorder elements array immutably for z-ordering.
 */
export function reorderElementInCanvas(
  elements: CanvasElement[],
  id: string,
  action: ReorderAction,
): CanvasElement[] {
  const index = elements.findIndex((el) => el.id === id);
  if (index === -1) return elements;

  const result = [...elements];
  const [item] = result.splice(index, 1);

  if (action === 'bringToFront') {
    result.push(item);
  } else if (action === 'sendToBack') {
    result.unshift(item);
  } else if (action === 'moveForward') {
    const newIndex = Math.min(result.length, index + 1);
    result.splice(newIndex, 0, item);
  } else if (action === 'moveBackward') {
    const newIndex = Math.max(0, index - 1);
    result.splice(newIndex, 0, item);
  }

  return result;
}

/**
 * Delete element from canvas immutably.
 */
export function deleteElementInCanvas(elements: CanvasElement[], id: string): CanvasElement[] {
  return elements.filter((el) => el.id !== id);
}

/**
 * Pure Undo / Redo history manager storing canvas snapshots in physical mm.
 */
export class CanvasHistoryManager<T> {
  private past: T[] = [];
  private present: T;
  private future: T[] = [];
  private maxHistory: number;

  constructor(initialState: T, maxHistory = 30) {
    this.present = initialState;
    this.maxHistory = maxHistory;
  }

  push(newState: T): void {
    this.past.push(this.present);
    if (this.past.length > this.maxHistory) {
      this.past.shift();
    }
    this.present = newState;
    this.future = [];
  }

  undo(): T | null {
    if (this.past.length === 0) return null;
    this.future.unshift(this.present);
    this.present = this.past.pop()!;
    return this.present;
  }

  redo(): T | null {
    if (this.future.length === 0) return null;
    this.past.push(this.present);
    this.present = this.future.shift()!;
    return this.present;
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  getCurrent(): T {
    return this.present;
  }

  getPastCount(): number {
    return this.past.length;
  }

  getFutureCount(): number {
    return this.future.length;
  }
}

/**
 * Generate a synthetic 1-bit monochrome raster buffer for demonstration and end-to-end testing.
 * Output is packed MSB-first per byte, where bit 1 = black ink dot.
 */
export function createMonochromePatternRaster(
  widthDots: number,
  heightDots: number,
  pattern: 'checker' | 'border' | 'solid' = 'checker',
  leftMm = 0,
  topMm = 0,
): CanvasBitmapRaster {
  const bytesPerRow = Math.ceil(widthDots / 8);
  const data = new Uint8Array(bytesPerRow * heightDots);
  const widthMm = Number((widthDots / DOTS_PER_MM).toFixed(2));
  const heightMm = Number((heightDots / DOTS_PER_MM).toFixed(2));

  for (let y = 0; y < heightDots; y++) {
    for (let x = 0; x < widthDots; x++) {
      let isInk = false;
      if (pattern === 'solid') {
        isInk = true;
      } else if (pattern === 'border') {
        const borderWidthDots = 4;
        isInk =
          x < borderWidthDots ||
          x >= widthDots - borderWidthDots ||
          y < borderWidthDots ||
          y >= heightDots - borderWidthDots;
      } else {
        // 'checker' - 16x16 dot squares
        const blockSize = 16;
        const checkX = Math.floor(x / blockSize) % 2;
        const checkY = Math.floor(y / blockSize) % 2;
        isInk = (checkX ^ checkY) === 1;
      }

      if (isInk) {
        const byteIndex = y * bytesPerRow + Math.floor(x / 8);
        const bitIndex = 7 - (x % 8);
        data[byteIndex] |= 1 << bitIndex;
      }
    }
  }

  return {
    leftMm,
    topMm,
    widthMm,
    heightMm,
    widthDots,
    heightDots,
    bytesPerRow,
    data,
  };
}

/**
 * Phase 7: Universal End-to-End Print Pipeline.
 *
 * Combines bitmap raster (if present) and all vector canvas overlay elements
 * (boxes, text, barcodes, QR codes) into a single atomic TSPL print payload.
 *
 * Frame buffer order:
 * 1. SIZE / GAP / DIRECTION / CLS header
 * 2. BITMAP <x>,<y>,<bytesPerRow>,<heightDots>,0,<raw_bytes>\r\n (if bitmap provided)
 * 3. Vector overlays: BOX, TEXT, BARCODE, QRCODE (rendered over the bitmap)
 * 4. PRINT <copies>\r\n
 */
export function exportUnifiedCanvasJob(
  doc: CanvasDocument,
  options?: ExportCanvasJobOptions,
): CanvasPrintJobResult {
  const gapMm = options?.gapMm ?? doc.gapMm ?? 2;
  const direction = options?.direction ?? doc.direction ?? 1;
  const copies = Math.max(1, Math.round(options?.copies ?? 1));
  const dpi = options?.dpi ?? PRINTER_DPI;
  const baseDpm = computeDotsPerMm(dpi);
  const dpmX = baseDpm * (options?.calibrationScale?.scaleX ?? 1.0);
  const dpmY = baseDpm * (options?.calibrationScale?.scaleY ?? 1.0);

  const sensorCmd =
    options?.sensorType === 'continuous'
      ? 'GAP 0 mm, 0 mm\r\n'
      : options?.sensorType === 'blackmark'
        ? `BLINE ${options?.blackMarkHeightMm ?? 3} mm, 0 mm\r\n`
        : `GAP ${gapMm} mm, 0 mm\r\n`;

  // 1. Build header commands
  const headerAscii =
    `SIZE ${doc.widthMm} mm, ${doc.heightMm} mm\r\n` +
    sensorCmd +
    `DIRECTION ${direction}\r\n` +
    `CLS\r\n`;

  const bm = options?.bitmap;
  let bitmapCmdAscii = '';
  if (bm) {
    const xDots = Math.round(bm.leftMm * dpmX);
    const yDots = Math.round(bm.topMm * dpmY);
    bitmapCmdAscii = `BITMAP ${xDots},${yDots},${bm.bytesPerRow},${bm.heightDots},0,`;
  }

  // 2. Build vector overlays using TsplBuilder
  const overlayBuilder = new TsplBuilder({
    dpi: options?.dpi,
    calibrationScale: options?.calibrationScale,
  });
  if (options?.printBoundary) {
    overlayBuilder.drawBox(0, 0, doc.widthMm, doc.heightMm, 0.35);
  }

  for (const el of doc.elements) {
    if (el.type === 'text' && typeof el.text === 'string') {
      const fontRes = resolveTsplFont(typeof el.fontSize === 'number' ? el.fontSize : 12);
      overlayBuilder.drawText(el.left, el.top, el.text, el.fontSize, {
        font: fontRes.font,
        xMulti: fontRes.xMulti,
        yMulti: fontRes.yMulti,
        rotation: (el.rotation as 0 | 90 | 180 | 270) ?? 0,
      });
      continue;
    }

    if (el.type === 'barcode' && typeof el.data === 'string') {
      overlayBuilder.drawBarcode(
        el.left,
        el.top,
        el.data,
        (el.symbology as string) ?? '128',
        {
          heightMm: typeof el.height === 'number' ? el.height : 10,
          readable: (el.readable as 0 | 1) ?? 1,
          rotation: (el.rotation as 0 | 90 | 180 | 270) ?? 0,
          narrowDots: typeof el.narrowDots === 'number' ? el.narrowDots : 2,
        },
      );
      continue;
    }

    if (el.type === 'qr' && typeof el.data === 'string') {
      const cellWidth =
        typeof el.cellWidthDots === 'number'
          ? el.cellWidthDots
          : resolveQrCellWidth(typeof el.sizeMm === 'number' ? el.sizeMm : 15, el.data.length);
      overlayBuilder.drawQrCode(el.left, el.top, el.data, {
        cellWidthDots: cellWidth,
        eccLevel: (el.eccLevel as 'L' | 'M' | 'Q' | 'H') ?? 'M',
        model: 'M2',
        mask: 'S7',
        rotation: (el.rotation as 0 | 90 | 180 | 270) ?? 0,
      });
      continue;
    }

    const isBox = !el.type || el.type === 'box' || el.type === 'shape';
    if (isBox && typeof el.width === 'number') {
      const wMm = el.width;
      const hMm = el.height ?? el.width;
      const thickness = typeof el.lineWidth === 'number' ? el.lineWidth : 0.35;
      overlayBuilder.drawBox(el.left, el.top, wMm, hMm, thickness);
    }
  }

  overlayBuilder.print(copies);
  const overlayCommands = overlayBuilder.getCommands();
  const overlayAscii = overlayCommands.join('\r\n') + '\r\n';

  // 3. Assemble binary payload and inspector ASCII
  let tsplAscii = '';
  let binaryPayload: Uint8Array;

  const encoder = new TextEncoder();

  if (bm && bm.data.length > 0) {
    const preBitmapAscii = headerAscii + bitmapCmdAscii;
    const preBitmapBytes = encoder.encode(preBitmapAscii);
    const postBitmapAscii = '\r\n' + overlayAscii;
    const postBitmapBytes = encoder.encode(postBitmapAscii);

    binaryPayload = new Uint8Array(
      preBitmapBytes.length + bm.data.length + postBitmapBytes.length,
    );
    binaryPayload.set(preBitmapBytes, 0);
    binaryPayload.set(bm.data, preBitmapBytes.length);
    binaryPayload.set(postBitmapBytes, preBitmapBytes.length + bm.data.length);

    tsplAscii =
      preBitmapAscii +
      `[...binary raster: ${bm.data.length} bytes...]\r\n` +
      overlayAscii;
  } else {
    tsplAscii = headerAscii + overlayAscii;
    binaryPayload = encoder.encode(tsplAscii);
  }

  return {
    tsplAscii,
    binaryPayload,
    hasBitmap: Boolean(bm && bm.data.length > 0),
    totalBytes: binaryPayload.length,
  };
}

/**
 * Substitute sequential variable data placeholders in text/barcode/QR templates.
 * Supported placeholder formats:
 * - {seq} -> "1", "2", "10"
 * - {{seq}} -> "1", "2", "10"
 * - {serial} -> "1", "2", "10"
 * - {seq:001} or {seq:3} -> "001", "002", "010"
 */
export function substituteSequencePlaceholders(
  template: string,
  seqNum: number,
  defaultPad = 0,
): string {
  return template.replace(/\{\{seq\}\}|\{seq\}|\{seq:(\d+)\}|\{serial\}/gi, (_match, padGroup) => {
    let pad = defaultPad;
    if (padGroup) {
      if (padGroup.startsWith('0')) {
        pad = padGroup.length;
      } else {
        pad = parseInt(padGroup, 10);
      }
    }
    return String(seqNum).padStart(pad, '0');
  });
}

export interface BatchJobOptions extends ExportCanvasJobOptions {
  startSequence?: number; // default 1
  stepSequence?: number; // default 1
  padDigits?: number; // default 0
}

export interface BatchPrintJobResult {
  tsplAscii: string;
  binaryPayload: Uint8Array;
  labelCount: number;
  totalBytes: number;
}

/**
 * Phase 9: Batch Printing Engine with Sequential Variable Data Merge.
 *
 * Outputs an atomic multi-label TSPL stream where:
 * - Common setup commands (SIZE, GAP/BLINE, DIRECTION) are emitted once.
 * - Each label runs CLS -> BITMAP (if present) -> Vector overlays with merged placeholders -> PRINT 1.
 */
export function exportBatchCanvasJob(
  doc: CanvasDocument,
  count: number,
  options?: BatchJobOptions,
): BatchPrintJobResult {
  const labelCount = Math.max(1, Math.round(count));
  const startSeq = options?.startSequence ?? 1;
  const stepSeq = options?.stepSequence ?? 1;
  const padDigits = options?.padDigits ?? 0;
  const copiesPerLabel = Math.max(1, Math.round(options?.copies ?? 1));

  const gapMm = options?.gapMm ?? doc.gapMm ?? 2;
  const direction = options?.direction ?? doc.direction ?? 1;
  const dpi = options?.dpi ?? PRINTER_DPI;
  const baseDpm = computeDotsPerMm(dpi);
  const dpmX = baseDpm * (options?.calibrationScale?.scaleX ?? 1.0);
  const dpmY = baseDpm * (options?.calibrationScale?.scaleY ?? 1.0);

  const sensorCmd =
    options?.sensorType === 'continuous'
      ? 'GAP 0 mm, 0 mm\r\n'
      : options?.sensorType === 'blackmark'
        ? `BLINE ${options?.blackMarkHeightMm ?? 3} mm, 0 mm\r\n`
        : `GAP ${gapMm} mm, 0 mm\r\n`;

  // Initial job configuration emitted once
  const jobHeaderAscii =
    `SIZE ${doc.widthMm} mm, ${doc.heightMm} mm\r\n` +
    sensorCmd +
    `DIRECTION ${direction}\r\n`;

  const bm = options?.bitmap;
  let bitmapCmdAscii = '';
  if (bm) {
    const xDots = Math.round(bm.leftMm * dpmX);
    const yDots = Math.round(bm.topMm * dpmY);
    bitmapCmdAscii = `BITMAP ${xDots},${yDots},${bm.bytesPerRow},${bm.heightDots},0,`;
  }

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [encoder.encode(jobHeaderAscii)];
  let inspectorAscii = jobHeaderAscii;

  for (let i = 0; i < labelCount; i++) {
    const currentSeq = startSeq + i * stepSeq;

    // 1. CLS
    inspectorAscii += 'CLS\r\n';
    chunks.push(encoder.encode('CLS\r\n'));

    // 2. Bitmap if present
    if (bm && bm.data.length > 0) {
      inspectorAscii += bitmapCmdAscii + `[...binary raster: ${bm.data.length} bytes...]\r\n`;
      chunks.push(encoder.encode(bitmapCmdAscii));
      chunks.push(bm.data);
      chunks.push(encoder.encode('\r\n'));
    }

    // 3. Vector overlays with sequence substitution
    const overlayBuilder = new TsplBuilder({
      dpi: options?.dpi,
      calibrationScale: options?.calibrationScale,
    });

    if (options?.printBoundary) {
      overlayBuilder.drawBox(0, 0, doc.widthMm, doc.heightMm, 0.35);
    }

    for (const el of doc.elements) {
      if (el.type === 'text' && typeof el.text === 'string') {
        const substitutedText = substituteSequencePlaceholders(el.text, currentSeq, padDigits);
        const fontRes = resolveTsplFont(typeof el.fontSize === 'number' ? el.fontSize : 12);
        overlayBuilder.drawText(el.left, el.top, substitutedText, el.fontSize, {
          font: fontRes.font,
          xMulti: fontRes.xMulti,
          yMulti: fontRes.yMulti,
          rotation: (el.rotation as 0 | 90 | 180 | 270) ?? 0,
        });
        continue;
      }

      if (el.type === 'barcode' && typeof el.data === 'string') {
        const substitutedData = substituteSequencePlaceholders(el.data, currentSeq, padDigits);
        overlayBuilder.drawBarcode(
          el.left,
          el.top,
          substitutedData,
          (el.symbology as string) ?? '128',
          {
            heightMm: typeof el.height === 'number' ? el.height : 10,
            readable: (el.readable as 0 | 1) ?? 1,
            rotation: (el.rotation as 0 | 90 | 180 | 270) ?? 0,
            narrowDots: typeof el.narrowDots === 'number' ? el.narrowDots : 2,
          },
        );
        continue;
      }

      if (el.type === 'qr' && typeof el.data === 'string') {
        const substitutedData = substituteSequencePlaceholders(el.data, currentSeq, padDigits);
        const cellWidth =
          typeof el.cellWidthDots === 'number'
            ? el.cellWidthDots
            : resolveQrCellWidth(typeof el.sizeMm === 'number' ? el.sizeMm : 15, substitutedData.length);
        overlayBuilder.drawQrCode(el.left, el.top, substitutedData, {
          cellWidthDots: cellWidth,
          eccLevel: (el.eccLevel as 'L' | 'M' | 'Q' | 'H') ?? 'M',
          model: 'M2',
          mask: 'S7',
          rotation: (el.rotation as 0 | 90 | 180 | 270) ?? 0,
        });
        continue;
      }

      const isBox = !el.type || el.type === 'box' || el.type === 'shape';
      if (isBox && typeof el.width === 'number') {
        const wMm = el.width;
        const hMm = el.height ?? el.width;
        const thickness = typeof el.lineWidth === 'number' ? el.lineWidth : 0.35;
        overlayBuilder.drawBox(el.left, el.top, wMm, hMm, thickness);
      }
    }

    overlayBuilder.print(copiesPerLabel);
    const cmds = overlayBuilder.getCommands().join('\r\n') + '\r\n';
    inspectorAscii += cmds;
    chunks.push(encoder.encode(cmds));
  }

  const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
  const binaryPayload = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    binaryPayload.set(chunk, offset);
    offset += chunk.length;
  }

  return {
    tsplAscii: inspectorAscii,
    binaryPayload,
    labelCount,
    totalBytes: binaryPayload.length,
  };
}

export interface PrintValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  elementId?: string;
  suggestedFix?: string;
}

export interface PrintValidationReport {
  isValid: boolean;
  errors: PrintValidationIssue[];
  warnings: PrintValidationIssue[];
}

/**
 * Phase 9: Pre-Flight Print Job Validation Engine.
 *
 * Inspects canvas geometry, physical dimensions, element bounds, and symbology scannability
 * before emitting TSPL or transmitting bytes to the thermal printer.
 */
export function validateCanvasPrintJob(
  doc: CanvasDocument,
  options?: { maxPrintWidthMm?: number },
): PrintValidationReport {
  const errors: PrintValidationIssue[] = [];
  const warnings: PrintValidationIssue[] = [];
  const maxPrintWidthMm = options?.maxPrintWidthMm ?? 108; // 108 mm standard 4-inch printhead

  // 1. Validate label physical dimensions
  if (doc.widthMm <= 0 || doc.heightMm <= 0) {
    errors.push({
      severity: 'error',
      code: 'INVALID_DIMENSIONS',
      message: `Label dimensions (${doc.widthMm}mm x ${doc.heightMm}mm) must be positive values.`,
      suggestedFix: 'Set positive label width and height.',
    });
  }

  if (doc.widthMm > maxPrintWidthMm) {
    errors.push({
      severity: 'error',
      code: 'OVERSIZED_LABEL_WIDTH',
      message: `Label width (${doc.widthMm}mm) exceeds maximum printable head width (${maxPrintWidthMm}mm).`,
      suggestedFix: `Reduce label width to <= ${maxPrintWidthMm}mm or rotate orientation.`,
    });
  }

  // 2. Validate circular shape on non-square labels
  if (doc.shape?.type === 'circle' && Math.abs(doc.widthMm - doc.heightMm) > 0.01) {
    warnings.push({
      severity: 'warning',
      code: 'CIRCULAR_NON_SQUARE',
      message: `Circle label shape specified on non-square label canvas (${doc.widthMm}mm x ${doc.heightMm}mm).`,
      suggestedFix: 'Set equal width and height for circular labels.',
    });
  }

  // 3. Validate elements
  for (const el of doc.elements) {
    // Negative coordinate bounds check
    if (el.left < 0 || el.top < 0) {
      errors.push({
        severity: 'error',
        code: 'ELEMENT_NEGATIVE_OFFSET',
        elementId: el.id,
        message: `Element "${el.id}" position (${el.left}mm, ${el.top}mm) is placed outside the canvas boundary.`,
        suggestedFix: 'Reposition element inside canvas (left >= 0, top >= 0).',
      });
    }

    // Text checks
    if (el.type === 'text') {
      const txtEl = el as CanvasTextElement;
      if (!txtEl.text || txtEl.text.trim().length === 0) {
        warnings.push({
          severity: 'warning',
          code: 'EMPTY_TEXT',
          elementId: el.id,
          message: `Text element "${el.id}" has empty content.`,
          suggestedFix: 'Provide text content or remove unused element.',
        });
      }
      const fontRes = resolveTsplFont(txtEl.fontSize);
      const estimatedTextW = (txtEl.text?.length ?? 0) * (fontRes.capHeightMm * 0.6);
      if (txtEl.left + estimatedTextW > doc.widthMm) {
        warnings.push({
          severity: 'warning',
          code: 'TEXT_OVERFLOW',
          elementId: el.id,
          message: `Text element "${el.id}" may overflow right edge of label by ${(txtEl.left + estimatedTextW - doc.widthMm).toFixed(1)}mm.`,
          suggestedFix: 'Reduce font size or wrap text.',
        });
      }
    }

    // Barcode checks
    if (el.type === 'barcode') {
      const bcEl = el as CanvasBarcodeElement;
      const scannability = validateScannability(bcEl, doc.widthMm, doc.heightMm);
      if (!scannability.isScannable) {
        for (const warn of scannability.warnings) {
          const isFatal =
            warn.includes('Barcode data is empty') ||
            warn.includes('clipped') ||
            warn.includes('extends beyond');
          const issue: PrintValidationIssue = {
            severity: isFatal ? 'error' : 'warning',
            code: isFatal ? 'BARCODE_CLIPPED' : 'BARCODE_SCANNABILITY',
            elementId: el.id,
            message: `Barcode "${el.id}": ${warn}`,
            suggestedFix: 'Adjust barcode position, height, or width within label borders.',
          };
          if (isFatal) {
            errors.push(issue);
          } else {
            warnings.push(issue);
          }
        }
      }
    }

    // QR checks
    if (el.type === 'qr') {
      const qrEl = el as CanvasQrElement;
      const scannability = validateScannability(qrEl, doc.widthMm, doc.heightMm);
      if (!scannability.isScannable) {
        for (const warn of scannability.warnings) {
          const isFatal = warn.includes('QR Code data is empty') || warn.includes('extends beyond');
          const issue: PrintValidationIssue = {
            severity: isFatal ? 'error' : 'warning',
            code: isFatal ? 'QR_CLIPPED' : 'QR_SCANNABILITY',
            elementId: el.id,
            message: `QR Code "${el.id}": ${warn}`,
            suggestedFix: 'Ensure QR Code is >= 8mm and within canvas borders.',
          };
          if (isFatal) {
            errors.push(issue);
          } else {
            warnings.push(issue);
          }
        }
      }
    }

    // Box checks
    const isBox = !el.type || el.type === 'box' || el.type === 'shape';
    if (isBox) {
      const boxEl = el as CanvasBoxElement;
      if (typeof boxEl.width === 'number' && typeof boxEl.height === 'number') {
        if (boxEl.left + boxEl.width > doc.widthMm) {
          warnings.push({
            severity: 'warning',
            code: 'BOX_OVERFLOW_X',
            elementId: el.id,
            message: `Box "${el.id}" right edge extends beyond canvas width by ${(boxEl.left + boxEl.width - doc.widthMm).toFixed(1)}mm.`,
          });
        }
        if (boxEl.top + boxEl.height > doc.heightMm) {
          warnings.push({
            severity: 'warning',
            code: 'BOX_OVERFLOW_Y',
            elementId: el.id,
            message: `Box "${el.id}" bottom edge extends beyond canvas height by ${(boxEl.top + boxEl.height - doc.heightMm).toFixed(1)}mm.`,
          });
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}


