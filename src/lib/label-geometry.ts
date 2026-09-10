/**
 * Single source of truth for label size.
 *
 * Design / editor coordinates are millimetres.
 * Screen preview: contain-fit mm into available pixels (not CSS 96dpi).
 * Print raster: dots = round(mm × 12) at 304 DPI. This printer is 12 dots/mm.
 */

import { JEWELRY_DIECUT, JEWELRY_DIECUT_2UP_SHEET_WIDTH_MM } from '@/constants/jewelry-diecut';
import { CABLE_FLAG_DIECUT } from '@/constants/cable-flag-diecut';
import { containFitLabel } from '@/lib/label-coordinate-system';
import { dotsToMm, MM_PER_INCH, mmToDots, tsplPackedWidthDots, createUniversalPrintLayout, formatTsplSizeCommand } from '@/lib/printer/print-spec';
import type { MediaShape } from '@/lib/label-document';

export {
  computeScale,
  containFitLabel,
  mmToPx,
  pxToMm,
  rectMmToPx,
  rectPxToMm,
  printDotsPerMm,
} from '@/lib/label-coordinate-system';

export { dotsToMm, MM_PER_INCH, mmToDots, tsplPackedWidthDots, createUniversalPrintLayout, formatTsplSizeCommand };
export type { MediaShape };
export const PRINT_DPI = 304;
/** 304 DPI thermal heads are 12 dots/mm (304.8), not 304/25.4. */
export const PRINT_DOTS_PER_MM = 12;
export const MIN_LABEL_MM = 8;
export const MAX_LABEL_MM = 310;

export type LabelUnit = 'mm' | 'cm' | 'in';

export type LabelSizeMm = {
  widthMm: number;
  heightMm: number;
};

export type LabelSizePreset = {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
};

export const LABEL_SIZE_PRESETS: LabelSizePreset[] = [
  { id: '100x155', label: '100×155 mm Waybill', widthMm: 100, heightMm: 155 },
  { id: '100x150', label: '100×150 mm (4×6 in)', widthMm: 100, heightMm: 150 },
  { id: '4x6in', label: '4×6 in (101.6×152.4 mm)', widthMm: 101.6, heightMm: 152.4 },
  { id: '100x100', label: '100×100 mm (4×4 in)', widthMm: 100, heightMm: 100 },
  { id: '76x130', label: '76×130 mm Courier', widthMm: 76, heightMm: 130 },
  { id: '75x100', label: '75×100 mm (3×4 in)', widthMm: 75, heightMm: 100 },
  { id: '80x50', label: '80×50 mm', widthMm: 80, heightMm: 50 },
  { id: '60x40', label: '60×40 mm Barcode', widthMm: 60, heightMm: 40 },
  { id: '50x30', label: '50×30 mm Retail', widthMm: 50, heightMm: 30 },
  { id: '57x30', label: '57×30 mm Receipt', widthMm: 57, heightMm: 30 },
  { id: '40x30', label: '40×30 mm Price Tag', widthMm: 40, heightMm: 30 },
  { id: '30x20', label: '30×20 mm Mini', widthMm: 30, heightMm: 20 },
  { id: '25x15', label: '25×15 mm Small', widthMm: 25, heightMm: 15 },
  { id: '20x15', label: '20×15 mm Tiny', widthMm: 20, heightMm: 15 },
  { id: '50x15', label: '50×15 mm Jewelry', widthMm: 50, heightMm: 15 },
  { id: '14x96', label: '14×96 mm Jewellery Tag', widthMm: JEWELRY_DIECUT.tagWidthMm, heightMm: JEWELRY_DIECUT.tagHeightMm },
  { id: '37x96-2up', label: '37×96 mm 2-Up Jewellery Sheet', widthMm: JEWELRY_DIECUT_2UP_SHEET_WIDTH_MM, heightMm: JEWELRY_DIECUT.sheetHeightMm },
  { id: '54x96-3up', label: '54×96 mm 3-Up Jewellery Sheet', widthMm: JEWELRY_DIECUT.sheetWidthMm, heightMm: JEWELRY_DIECUT.sheetHeightMm },
  { id: '50x73-cable-label', label: '50×73 mm Cable Label', widthMm: CABLE_FLAG_DIECUT.widthMm, heightMm: CABLE_FLAG_DIECUT.heightMm },
  { id: '80x15', label: '80×15 mm Rat Tail Tag', widthMm: 80, heightMm: 15 },
  { id: '85x13', label: '85×13 mm Barbell', widthMm: 85, heightMm: 13 },
  { id: '85x15', label: '85×15 mm Barbell', widthMm: 85, heightMm: 15 },
  { id: '2x1in', label: '2×1 in (50.8×25.4 mm)', widthMm: 50.8, heightMm: 25.4 },
  { id: '3x2in', label: '3×2 in (76.2×50.8 mm)', widthMm: 76.2, heightMm: 50.8 },
  { id: 'a6', label: 'A6 (105×148 mm)', widthMm: 105, heightMm: 148 },
  { id: 'a4', label: 'A4 (210×297 mm)', widthMm: 210, heightMm: 297 },
];

export function toMm(value: number, unit: LabelUnit): number {
  if (!Number.isFinite(value)) return 0;
  if (unit === 'cm') return value * 10;
  if (unit === 'in') return value * MM_PER_INCH;
  return value;
}

export function fromMm(mm: number, unit: LabelUnit): number {
  if (unit === 'cm') return mm / 10;
  if (unit === 'in') return mm / MM_PER_INCH;
  return mm;
}

export function clampLabelMm(widthMm: number, heightMm: number): LabelSizeMm {
  const clamp = (n: number) => {
    if (!Number.isFinite(n)) return MIN_LABEL_MM;
    return Math.min(MAX_LABEL_MM, Math.max(MIN_LABEL_MM, Math.round(n * 100) / 100));
  };
  return { widthMm: clamp(widthMm), heightMm: clamp(heightMm) };
}

export function parseSizeInput(raw: string): number | null {
  const n = parseFloat(String(raw).replace(',', '.').trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function validateLabelSize(widthMm: number, heightMm: number): string | null {
  if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm)) return 'Enter a valid width and height.';
  if (widthMm < MIN_LABEL_MM || heightMm < MIN_LABEL_MM) {
    return `Minimum size is ${MIN_LABEL_MM} mm.`;
  }
  if (widthMm > MAX_LABEL_MM || heightMm > MAX_LABEL_MM) {
    return `Maximum size is ${MAX_LABEL_MM} mm.`;
  }
  return null;
}

export function matchingPresetId(widthMm: number, heightMm: number): string {
  const found = LABEL_SIZE_PRESETS.find(
    (p) => Math.abs(p.widthMm - widthMm) < 0.15 && Math.abs(p.heightMm - heightMm) < 0.15,
  );
  return found?.id ?? 'custom';
}

/** Uniform contain-fit from mm into a pixel box.
 * `scale` (px per mm) is the single source of truth for canvas + element layout.
 * Both axes share one scale so width/height aspect always matches widthMm/heightMm.
 */
export function fitLabelSize(
  widthMm: number,
  heightMm: number,
  maxWidthPx: number,
  maxHeightPx: number,
): { widthPx: number; heightPx: number; scale: number } {
  const fit = containFitLabel(
    { widthPx: maxWidthPx, heightPx: maxHeightPx },
    { widthMm, heightMm },
  );
  return { widthPx: fit.canvasWidthPx, heightPx: fit.canvasHeightPx, scale: fit.pxPerMM };
}


/**
 * Exact label size in printer dots (1:1 with preview mm layout).
 * Use this for ViewShot capture so aspect matches the preview.
 */
export function printContentSize(widthMm: number, heightMm: number, dpi = PRINT_DPI) {
  const layout = createUniversalPrintLayout(widthMm, heightMm, dpi);
  return {
    widthPx: layout.captureDotsW,
    heightPx: layout.captureDotsH,
  };
}

/**
 * BITMAP canvas size: width packed DOWN to a multiple of 8 (TSPL bytes×8).
 * Packing up past SIZE-in-dots is clipped by firmware (right edge cutoff).
 */
export function printRasterSize(widthMm: number, heightMm: number, dpi = PRINT_DPI) {
  const layout = createUniversalPrintLayout(widthMm, heightMm, dpi);
  return {
    widthPx: layout.bitmapDotsW,
    heightPx: layout.bitmapDotsH,
  };
}

/**
 * ViewShot captures `content` (SIZE-in-dots) so 1 px = 1 printer dot at the
 * same mm scale as the editor. `canvas` is the packed BITMAP size (crop, never scale).
 */
export function printCaptureLayout(widthMm: number, heightMm: number, dpi = PRINT_DPI) {
  const layout = createUniversalPrintLayout(widthMm, heightMm, dpi);
  const wMm = Math.max(widthMm, 0.01);
  return {
    content: { widthPx: layout.captureDotsW, heightPx: layout.captureDotsH },
    canvas: { widthPx: layout.bitmapDotsW, heightPx: layout.bitmapDotsH },
    scale: layout.captureDotsW / wMm,
  };
}

/**
 * Media size preserving true physical millimetres for exact 1:1 preview/print fidelity.
 * 4×6 in is preserved as 101.6 × 152.4 mm (no artificial integer rounding distortion).
 */
export function printMediaSizeMm(widthMm: number, heightMm: number): LabelSizeMm {
  return {
    widthMm: Math.max(0.1, Math.round(widthMm * 100) / 100),
    heightMm: Math.max(0.1, Math.round(heightMm * 100) / 100),
  };
}

/**
 * Catalog thumbnails keep true mm aspect, but cap px/mm so a 15 mm tag does not
 * fill the same slot as a 90 mm label. Oversized stock still contain-fits.
 */
export const CATALOG_REF_WIDTH_MM = 90;
export const CATALOG_REF_HEIGHT_MM = 52;

/** Typical editor pad reference — 80×50 mm nearly fills the pad; smaller stock stays smaller. */
export const EDITOR_REF_WIDTH_MM = 80;
export const EDITOR_REF_HEIGHT_MM = 50;

function fitLabelSizeCapped(
  widthMm: number,
  heightMm: number,
  maxWidthPx: number,
  maxHeightPx: number,
  refWidthMm: number,
  refHeightMm: number,
): { widthPx: number; heightPx: number; scale: number } {
  const contain = fitLabelSize(widthMm, heightMm, maxWidthPx, maxHeightPx);
  if (maxWidthPx <= 0 || maxHeightPx <= 0) return contain;
  const maxScale = Math.min(maxWidthPx / refWidthMm, maxHeightPx / refHeightMm);
  if (contain.scale <= maxScale + 1e-9) return contain;
  const w = Math.max(widthMm, 0.01);
  const h = Math.max(heightMm, 0.01);
  const widthPx = Math.max(1, Math.round(w * maxScale));
  const heightPx = Math.max(1, Math.round(h * maxScale));
  if (widthPx > maxWidthPx || heightPx > maxHeightPx) return contain;
  return { widthPx, heightPx, scale: widthPx / w };
}

export function fitCatalogLabel(
  widthMm: number,
  heightMm: number,
  maxWidthPx: number,
  maxHeightPx: number,
): { widthPx: number; heightPx: number; scale: number } {
  return fitLabelSizeCapped(
    widthMm,
    heightMm,
    maxWidthPx,
    maxHeightPx,
    CATALOG_REF_WIDTH_MM,
    CATALOG_REF_HEIGHT_MM,
  );
}

/**
 * Editor artboard: contain-fit into the pad, never overflow, never stretch.
 * One pxPerMM for both axes (Canva pad). Catalog thumbnails still use the ref cap.
 */
export function fitEditorLabel(
  widthMm: number,
  heightMm: number,
  maxWidthPx: number,
  maxHeightPx: number,
): { widthPx: number; heightPx: number; scale: number } {
  return fitLabelSize(widthMm, heightMm, maxWidthPx, maxHeightPx);
}

/** Space reserved at the bottom of the pad for the Fit / + / − chip. */
export const EDITOR_PAD_ZOOM_CHROME_PX = 48;

/**
 * Fit the canvas so the ruler board (rulers + artboard) stays inside the pad.
 * Use the measured ZoomableEditPad size, not the phone window width.
 */
export function fitEditorPadBoard(
  widthMm: number,
  heightMm: number,
  padWidthPx: number,
  padHeightPx: number,
  rulerSizePx: number,
): { widthPx: number; heightPx: number; scale: number; boardWidthPx: number; boardHeightPx: number } {
  const padInset = 6;
  const maxBoardW = Math.max(64, padWidthPx - padInset);
  const maxBoardH = Math.max(64, padHeightPx - padInset - EDITOR_PAD_ZOOM_CHROME_PX);
  const maxCanvasW = Math.max(48, maxBoardW - rulerSizePx);
  const maxCanvasH = Math.max(48, maxBoardH - rulerSizePx);
  const fitted = containFitLabel(
    { widthPx: maxCanvasW, heightPx: maxCanvasH },
    { widthMm, heightMm },
  );
  return {
    widthPx: fitted.canvasWidthPx,
    heightPx: fitted.canvasHeightPx,
    scale: fitted.pxPerMM,
    boardWidthPx: rulerSizePx + fitted.canvasWidthPx,
    boardHeightPx: rulerSizePx + fitted.canvasHeightPx,
  };
}

/** View zoom is on top of the fit scale. 1 = letterboxed fit, not a physical 1:1 print preview. */
export function formatViewZoomLabel(zoom: number): string {
  if (!Number.isFinite(zoom) || Math.abs(zoom - 1) <= 0.02) return 'Fit';
  return `${Math.round(zoom * 100)}%`;
}

/** Clip style so on-screen / capture artboard matches the physical stock outline. */
export function mediaShapeClipStyle(
  shape: MediaShape | undefined,
  widthPx: number,
  heightPx: number,
): { overflow: 'hidden'; borderRadius?: number } {
  const w = Math.max(1, widthPx);
  const h = Math.max(1, heightPx);
  if (shape === 'circle' || shape === 'ellipse') {
    return { overflow: 'hidden', borderRadius: Math.min(w, h) / 2 };
  }
  if (shape === 'roundedRectangle') {
    return { overflow: 'hidden', borderRadius: Math.min(w, h) * 0.1 };
  }
  return { overflow: 'hidden' };
}
