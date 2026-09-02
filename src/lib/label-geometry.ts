/**
 * Single source of truth for label size.
 *
 * Design / editor coordinates are millimetres.
 * Screen preview: contain-fit mm into available pixels (not CSS 96dpi).
 * Print raster: dots = round(mm × DPI / 25.4). TD-404 is 203 DPI.
 */

import { dotsToMm, MM_PER_INCH, mmToDots } from '@/lib/printer/print-spec';

export { dotsToMm, MM_PER_INCH, mmToDots };
/** Default DPI when a caller omits it — matches TD-404 native resolution. */
export const PRINT_DPI = 203;
/** @deprecated Prefer mmToDots(mm, dpi). 203 DPI ≈ 7.992 dots/mm, not exactly 8. */
export const PRINT_DOTS_PER_MM = PRINT_DPI / MM_PER_INCH;
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
 * Both axes share one scale so width/height aspect always matches widthMm/heightMm
 * (required for ViewShot → printer-dot scaling without stretching past borders).
 */
export function fitLabelSize(
  widthMm: number,
  heightMm: number,
  maxWidthPx: number,
  maxHeightPx: number,
): { widthPx: number; heightPx: number; scale: number } {
  const w = Math.max(widthMm, 0.01);
  const h = Math.max(heightMm, 0.01);
  if (maxWidthPx <= 0 || maxHeightPx <= 0) {
    return { widthPx: 1, heightPx: 1, scale: 0 };
  }
  const rawScale = Math.min(maxWidthPx / w, maxHeightPx / h);
  let widthPx = Math.max(1, Math.floor(w * rawScale));
  let heightPx = Math.max(1, Math.round(h * (widthPx / w)));
  if (heightPx > maxHeightPx) {
    heightPx = Math.max(1, Math.floor(maxHeightPx));
    widthPx = Math.max(1, Math.round(w * (heightPx / h)));
  }
  if (widthPx > maxWidthPx) {
    widthPx = Math.max(1, Math.floor(maxWidthPx));
    heightPx = Math.max(1, Math.round(h * (widthPx / w)));
  }
  return { widthPx, heightPx, scale: widthPx / w };
}


/**
 * Exact label size in printer dots (1:1 with preview mm layout).
 * Use this for ViewShot capture so aspect matches the preview.
 */
export function printContentSize(widthMm: number, heightMm: number, dpi = PRINT_DPI) {
  const d = Number.isFinite(dpi) && dpi > 0 ? dpi : PRINT_DPI;
  return {
    widthPx: Math.max(1, mmToDots(widthMm, d)),
    heightPx: Math.max(1, mmToDots(heightMm, d)),
  };
}

/**
 * BITMAP canvas size: width rounded UP to a multiple of 8 (TSPL bytes×8).
 * Content is centered into this canvas so padding is even L/R (not left-biased).
 */
export function printRasterSize(widthMm: number, heightMm: number, dpi = PRINT_DPI) {
  const content = printContentSize(widthMm, heightMm, dpi);
  return {
    widthPx: Math.max(8, Math.ceil(content.widthPx / 8) * 8),
    heightPx: content.heightPx,
  };
}

/**
 * ViewShot uses `content` (true mm→dots). TSPL BITMAP uses `canvas` (8-dot pad).
 * `scale` is uniform px/mm so capture aspect matches the preview.
 */
export function printCaptureLayout(widthMm: number, heightMm: number, dpi = PRINT_DPI) {
  const content = printContentSize(widthMm, heightMm, dpi);
  const canvas = printRasterSize(widthMm, heightMm, dpi);
  const wMm = Math.max(widthMm, 0.01);
  const hMm = Math.max(heightMm, 0.01);
  const scale = Math.min(content.widthPx / wMm, content.heightPx / hMm);
  return { content, canvas, scale };
}

/**
 * TSPL SIZE command. Preserves one decimal when needed (e.g. 101.6 mm for 4")
 * so SIZE matches the same mm used for mm→dots capture math.
 */
export function formatTsplSizeCommand(widthMm: number, heightMm: number): string {
  const fmt = (mm: number) => {
    const n = Math.max(1, Math.round(mm * 10) / 10);
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  };
  return `SIZE ${fmt(widthMm)} mm,${fmt(heightMm)} mm`;
}
