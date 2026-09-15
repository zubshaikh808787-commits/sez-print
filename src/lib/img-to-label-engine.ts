/**
 * Img to Label Engine
 *
 * Core conversion logic: imported image → physical label print bitmap.
 *
 * The screen is only a preview; it must never determine the actual printed
 * dimensions. The final print bitmap is always calculated from:
 *   physical label mm × printer DPI
 *
 * This module is independent of any printer SDK — it produces a GrayRaster
 * that the existing universal-bridge sends to the connected printer.
 */

import { createPrintGeometry, mmToDots, type PrintGeometry } from '@/lib/printer/print-spec';
import {
  binarizeGrayForPrint,
  fitGrayToSize,
  lockGrayToCanvas,
  rotateGray,
  trimGrayInkBounds,
  type GrayRaster,
} from '@/lib/printer/escpos';

// ─── Types ─────────────────────────────────────────────────────────────────

export type FitMode = 'contain' | 'cover' | 'stretch';
export type Orientation = 'portrait' | 'landscape' | 'auto';
export type HAlign = 'left' | 'center' | 'right';
export type VAlign = 'top' | 'center' | 'bottom';

export interface ImgToLabelConfig {
  /** Physical label width in mm (as selected by user). */
  widthMm: number;
  /** Physical label height in mm (as selected by user). */
  heightMm: number;
  /** Printer DPI (from connected printer profile). */
  dpi: number;
  /** Image scaling mode. Default: contain. */
  fitMode: FitMode;
  /** Label orientation. Default: portrait. */
  orientation: Orientation;
  /** Image rotation in degrees (clockwise). Default: 0. */
  imageRotationDeg: 0 | 90 | 180 | 270;
  /** Horizontal alignment within the label. Default: center. */
  hAlign: HAlign;
  /** Vertical alignment within the label. Default: center. */
  vAlign: VAlign;
  /** Trim empty photo margins before fit (label photos / scans). Default: true. */
  trimBorder?: boolean;
  /** Inset from label edge in mm so ink stays inside the die-cut. Default: 0. */
  safeMarginMm?: number;
}

export interface PrintLabelResult {
  /** Physical label width in mm (after orientation). */
  widthMm: number;
  /** Physical label height in mm (after orientation). */
  heightMm: number;
  /** Print canvas width in printer dots. */
  widthPx: number;
  /** Print canvas height in printer dots. */
  heightPx: number;
  /** Printer DPI used. */
  dpi: number;
  /** Final print-ready grayscale bitmap. */
  gray: GrayRaster;
  /** Fit mode applied. */
  fitMode: FitMode;
  /** Full print geometry for TSPL SIZE command. */
  geometry: PrintGeometry;
}

// ─── Orientation ───────────────────────────────────────────────────────────

/**
 * Resolve orientation: if landscape, swap width/height.
 * If 'auto', choose based on the source image aspect ratio.
 */
export function resolveOrientation(
  widthMm: number,
  heightMm: number,
  orientation: Orientation,
  sourceWidth?: number,
  sourceHeight?: number,
): { widthMm: number; heightMm: number } {
  if (orientation === 'landscape') {
    return {
      widthMm: Math.max(widthMm, heightMm),
      heightMm: Math.min(widthMm, heightMm),
    };
  }
  if (orientation === 'auto' && sourceWidth && sourceHeight) {
    const imageIsLandscape = sourceWidth > sourceHeight;
    const labelIsPortrait = widthMm < heightMm;
    if (imageIsLandscape && labelIsPortrait) {
      return { widthMm: heightMm, heightMm: widthMm };
    }
    const imageIsPortrait = sourceHeight > sourceWidth;
    const labelIsLandscape = widthMm > heightMm;
    if (imageIsPortrait && labelIsLandscape) {
      return { widthMm: heightMm, heightMm: widthMm };
    }
  }
  // portrait (default) or auto with matching aspect
  return { widthMm, heightMm };
}

// ─── Print Canvas Calculation ──────────────────────────────────────────────

/**
 * Calculate the exact print canvas pixel dimensions for a physical label size
 * at a given DPI. Uses the authoritative print geometry engine.
 */
export function calcPrintCanvas(
  widthMm: number,
  heightMm: number,
  dpi: number,
): { widthPx: number; heightPx: number; geometry: PrintGeometry } {
  const geometry = createPrintGeometry(widthMm, heightMm, dpi);
  return {
    widthPx: geometry.sizeDotsW,
    heightPx: geometry.sizeDotsH,
    geometry,
  };
}

// ─── Alignment ─────────────────────────────────────────────────────────────

/**
 * Apply alignment offsets to a contain-fitted image within the label canvas.
 * Returns a GrayRaster with the image placed according to alignment settings.
 */
function applyContainWithAlignment(
  src: GrayRaster,
  destW: number,
  destH: number,
  hAlign: HAlign,
  vAlign: VAlign,
): GrayRaster {
  const width = Math.max(1, Math.round(destW));
  const height = Math.max(1, Math.round(destH));
  const out = new Uint8Array(width * height);
  out.fill(255); // white background

  const scale = Math.min(width / Math.max(src.width, 1), height / Math.max(src.height, 1));
  const dw = Math.max(1, Math.round(src.width * scale));
  const dh = Math.max(1, Math.round(src.height * scale));

  // Horizontal offset
  let ox: number;
  if (hAlign === 'left') ox = 0;
  else if (hAlign === 'right') ox = width - dw;
  else ox = Math.floor((width - dw) / 2);

  // Vertical offset
  let oy: number;
  if (vAlign === 'top') oy = 0;
  else if (vAlign === 'bottom') oy = height - dh;
  else oy = Math.floor((height - dh) / 2);

  // Build source lookup maps
  const buildMap = (destSize: number, srcSize: number): Uint32Array => {
    const map = new Uint32Array(destSize);
    const last = Math.max(0, srcSize - 1);
    if (destSize <= 1) { map[0] = 0; return map; }
    for (let i = 0; i < destSize; i++) {
      map[i] = Math.round((i * last) / (destSize - 1));
    }
    return map;
  };

  const yMap = buildMap(dh, src.height);
  const xMap = buildMap(dw, src.width);
  const srcW = src.width;
  const srcGray = src.gray;

  for (let y = 0; y < dh; y++) {
    const dy = y + oy;
    if (dy < 0 || dy >= height) continue;
    const srcRow = yMap[y] * srcW;
    const outRow = dy * width;
    for (let x = 0; x < dw; x++) {
      const dx = x + ox;
      if (dx < 0 || dx >= width) continue;
      out[outRow + dx] = srcGray[srcRow + xMap[x]];
    }
  }

  return { width, height, gray: out };
}

/**
 * Apply cover (fill) mode with alignment for crop positioning.
 */
function applyCoverWithAlignment(
  src: GrayRaster,
  destW: number,
  destH: number,
  hAlign: HAlign,
  vAlign: VAlign,
): GrayRaster {
  const width = Math.max(1, Math.round(destW));
  const height = Math.max(1, Math.round(destH));
  const out = new Uint8Array(width * height);
  out.fill(255);

  const scale = Math.max(width / Math.max(src.width, 1), height / Math.max(src.height, 1));
  const dw = Math.max(1, Math.round(src.width * scale));
  const dh = Math.max(1, Math.round(src.height * scale));

  // Crop position based on alignment
  let cropX: number;
  if (hAlign === 'left') cropX = 0;
  else if (hAlign === 'right') cropX = dw - width;
  else cropX = Math.floor((dw - width) / 2);

  let cropY: number;
  if (vAlign === 'top') cropY = 0;
  else if (vAlign === 'bottom') cropY = dh - height;
  else cropY = Math.floor((dh - height) / 2);

  const buildMap = (destSize: number, srcSize: number): Uint32Array => {
    const map = new Uint32Array(destSize);
    const last = Math.max(0, srcSize - 1);
    if (destSize <= 1) { map[0] = 0; return map; }
    for (let i = 0; i < destSize; i++) {
      map[i] = Math.round((i * last) / (destSize - 1));
    }
    return map;
  };

  const yMap = buildMap(dh, src.height);
  const xMap = buildMap(dw, src.width);
  const srcW = src.width;
  const srcGray = src.gray;

  for (let y = 0; y < height; y++) {
    const sy = y + cropY;
    if (sy < 0 || sy >= dh) continue;
    const srcRow = yMap[sy] * srcW;
    const outRow = y * width;
    for (let x = 0; x < width; x++) {
      const sx = x + cropX;
      if (sx < 0 || sx >= dw) continue;
      out[outRow + x] = srcGray[srcRow + xMap[sx]];
    }
  }

  return { width, height, gray: out };
}

function insetDots(totalDots: number, marginDots: number): number {
  return Math.max(1, totalDots - Math.max(0, marginDots) * 2);
}

function prepareSourceGray(gray: GrayRaster, trimBorder: boolean): GrayRaster {
  if (!trimBorder) return gray;
  const trimmed = trimGrayInkBounds(gray);
  return trimmed.width > 0 && trimmed.height > 0 ? trimmed : gray;
}

/**
 * Render an imported image into a label-sized print bitmap.
 *
 * Pipeline:
 *   1. Apply image rotation
 *   2. Resolve label orientation (portrait/landscape/auto)
 *   3. Calculate print canvas from physical mm + DPI
 *   4. Apply fit mode (contain/cover/stretch) with alignment
 *   5. Return final GrayRaster at exact print resolution
 *
 * The returned bitmap is ready for `printArtworkJob` via universal-bridge.
 */
export function renderImgToLabel(
  sourceGray: GrayRaster,
  config: ImgToLabelConfig,
): PrintLabelResult {
  const trimBorder = config.trimBorder !== false;
  const safeMarginMm = Math.max(0, config.safeMarginMm ?? 0);

  // 1. Apply image rotation (independent of label orientation)
  let gray = sourceGray;
  if (config.imageRotationDeg) {
    gray = rotateGray(gray, config.imageRotationDeg);
  }
  gray = prepareSourceGray(gray, trimBorder);

  // 2. Resolve orientation
  const oriented = resolveOrientation(
    config.widthMm,
    config.heightMm,
    config.orientation,
    gray.width,
    gray.height,
  );

  // 3. Calculate print canvas from physical dimensions + DPI
  const canvas = calcPrintCanvas(oriented.widthMm, oriented.heightMm, config.dpi);
  const marginDotsX = mmToDots(safeMarginMm, config.dpi);
  const marginDotsY = mmToDots(safeMarginMm, config.dpi);
  const innerW = insetDots(canvas.widthPx, marginDotsX);
  const innerH = insetDots(canvas.heightPx, marginDotsY);

  // 4. Apply fit mode with alignment inside the safe inner rect, then lock to full canvas
  let inner: GrayRaster;
  switch (config.fitMode) {
    case 'contain':
      inner = applyContainWithAlignment(gray, innerW, innerH, config.hAlign, config.vAlign);
      break;
    case 'cover':
      inner = applyCoverWithAlignment(gray, innerW, innerH, config.hAlign, config.vAlign);
      break;
    case 'stretch':
      inner = fitGrayToSize(gray, innerW, innerH, 'stretch');
      break;
    default:
      inner = applyContainWithAlignment(gray, innerW, innerH, config.hAlign, config.vAlign);
  }

  let result = inner;
  if (safeMarginMm > 0) {
    result = padInnerOnCanvas(inner, canvas.widthPx, canvas.heightPx, marginDotsX, marginDotsY);
  }
  result = lockGrayToCanvas(result, canvas.widthPx, canvas.heightPx);

  return {
    widthMm: oriented.widthMm,
    heightMm: oriented.heightMm,
    widthPx: canvas.widthPx,
    heightPx: canvas.heightPx,
    dpi: config.dpi,
    gray: result,
    fitMode: config.fitMode,
    geometry: canvas.geometry,
  };
}

/** Place inner raster onto full label canvas with symmetric margin. */
function padInnerOnCanvas(
  inner: GrayRaster,
  canvasW: number,
  canvasH: number,
  marginDotsX: number,
  marginDotsY: number,
): GrayRaster {
  const width = Math.max(1, Math.round(canvasW));
  const height = Math.max(1, Math.round(canvasH));
  const out = new Uint8Array(width * height);
  out.fill(255);
  const ox = Math.max(0, marginDotsX);
  const oy = Math.max(0, marginDotsY);
  const copyW = Math.min(inner.width, width - ox);
  const copyH = Math.min(inner.height, height - oy);
  for (let y = 0; y < copyH; y++) {
    out.set(
      inner.gray.subarray(y * inner.width, y * inner.width + copyW),
      (oy + y) * width + ox,
    );
  }
  return { width, height, gray: out };
}

/**
 * Apply contrast stretch + 1-bit conversion for thermal print and WYSIWYG preview.
 * Output is pure black/white so native SDK re-threshold cannot fade thin strokes.
 */
export function finalizeImgToLabelForPrint(
  result: PrintLabelResult,
  options: { threshold: number; dither?: boolean },
): PrintLabelResult {
  const gray = binarizeGrayForPrint(result.gray, {
    threshold: options.threshold,
    dither: options.dither ?? false,
    stretchContrast: true,
  });
  return { ...result, gray };
}

// ─── Preview helpers ───────────────────────────────────────────────────────

/**
 * Calculate the editor/preview scale for displaying the label on screen.
 * The preview must maintain the correct physical aspect ratio but fit
 * within the available screen space.
 *
 * IMPORTANT: This scale is only for display. Print uses physical mm + DPI.
 */
export function calcPreviewScale(
  widthMm: number,
  heightMm: number,
  maxScreenWidth: number,
  maxScreenHeight: number,
): { previewWidth: number; previewHeight: number; scale: number } {
  const wMm = Math.max(1, widthMm);
  const hMm = Math.max(1, heightMm);
  const scale = Math.min(
    maxScreenWidth / wMm,
    maxScreenHeight / hMm,
  );
  return {
    previewWidth: Math.max(1, Math.round(wMm * scale)),
    previewHeight: Math.max(1, Math.round(hMm * scale)),
    scale,
  };
}

/**
 * Default configuration for Img to Label.
 * Contain mode is the default — preserves the entire image visible.
 */
export function defaultImgToLabelConfig(
  widthMm: number,
  heightMm: number,
  dpi: number,
): ImgToLabelConfig {
  return {
    widthMm,
    heightMm,
    dpi,
    fitMode: 'contain',
    orientation: 'portrait',
    imageRotationDeg: 0,
    hAlign: 'center',
    vAlign: 'center',
    trimBorder: true,
    safeMarginMm: 0,
  };
}
