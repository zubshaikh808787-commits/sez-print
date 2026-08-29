/**
 * Single source of truth for label size.
 *
 * Design / editor coordinates are millimetres.
 * Screen preview: contain-fit mm into available pixels (not CSS 96dpi).
 * Print raster: 8 dots/mm ≈ 203 DPI (typical TD-404 / thermal).
 */

export const PRINT_DOTS_PER_MM = 8;
export const PRINT_DPI = 203;
export const MM_PER_INCH = 25.4;
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
  { id: '30x20', label: '30×20 mm', widthMm: 30, heightMm: 20 },
  { id: '40x30', label: '40×30 mm', widthMm: 40, heightMm: 30 },
  { id: '50x30', label: '50×30 mm', widthMm: 50, heightMm: 30 },
  { id: '57x30', label: '57×30 mm', widthMm: 57, heightMm: 30 },
  { id: '25x15', label: '25×15 mm', widthMm: 25, heightMm: 15 },
  { id: '20x15', label: '20×15 mm', widthMm: 20, heightMm: 15 },
  { id: '50x13', label: '50×13 mm jewelry', widthMm: 50, heightMm: 13 },
  { id: '85x13', label: '85×13 mm barbell', widthMm: 85, heightMm: 13 },
  { id: '85x15', label: '85×15 mm barbell', widthMm: 85, heightMm: 15 },
  { id: '2x1in', label: '2×1 in', widthMm: 50.8, heightMm: 25.4 },
  { id: '4x6in', label: '4×6 in', widthMm: 101.6, heightMm: 152.4 },
  { id: 'a6', label: 'A6', widthMm: 105, heightMm: 148 },
  { id: 'a4', label: 'A4', widthMm: 210, heightMm: 297 },
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

/** Uniform contain-fit from mm into a pixel box. Pixel sizes are integers to avoid subpixel leak. */
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
  const scale = Math.min(maxWidthPx / w, maxHeightPx / h);
  const widthPx = Math.max(1, Math.round(w * scale));
  const heightPx = Math.max(1, Math.round(h * scale));
  return { widthPx, heightPx, scale: widthPx / w };
}

export function printRasterSize(widthMm: number, heightMm: number) {
  return {
    widthPx: Math.max(1, Math.round(widthMm * PRINT_DOTS_PER_MM)),
    heightPx: Math.max(1, Math.round(heightMm * PRINT_DOTS_PER_MM)),
  };
}
