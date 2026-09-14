/**
 * Central physical-size conversion utility.
 *
 * Single source of truth for converting between physical units (mm, inch, cm)
 * and printer pixels at a given DPI. All printing code should use these
 * functions rather than duplicating conversion math.
 */

import { toMm, fromMm, type LabelUnit } from '@/lib/label-geometry';
import { createPrintGeometry } from '@/lib/printer/print-spec';

export { toMm as toPhysicalMm, fromMm as fromPhysicalMm };
export type { LabelUnit };

// ─── Physical → Pixel conversions ──────────────────────────────────────────

/** Convert millimetres to printer pixels at the given DPI. */
export function mmToPixels(mm: number, dpi: number): number {
  if (!Number.isFinite(mm) || !Number.isFinite(dpi) || dpi <= 0) return 0;
  return Math.round((mm / 25.4) * dpi);
}

/** Convert inches to printer pixels at the given DPI. */
export function inchesToPixels(inches: number, dpi: number): number {
  if (!Number.isFinite(inches) || !Number.isFinite(dpi) || dpi <= 0) return 0;
  return Math.round(inches * dpi);
}

/** Convert centimetres to printer pixels at the given DPI. */
export function cmToPixels(cm: number, dpi: number): number {
  if (!Number.isFinite(cm) || !Number.isFinite(dpi) || dpi <= 0) return 0;
  return Math.round((cm / 2.54) * dpi);
}

// ─── Pixel → Physical conversions ──────────────────────────────────────────

/** Convert printer pixels to millimetres at the given DPI. */
export function pixelsToMm(px: number, dpi: number): number {
  if (!Number.isFinite(px) || !Number.isFinite(dpi) || dpi <= 0) return 0;
  return (px * 25.4) / dpi;
}

/** Convert printer pixels to inches at the given DPI. */
export function pixelsToInches(px: number, dpi: number): number {
  if (!Number.isFinite(px) || !Number.isFinite(dpi) || dpi <= 0) return 0;
  return px / dpi;
}

/** Convert printer pixels to centimetres at the given DPI. */
export function pixelsToCm(px: number, dpi: number): number {
  if (!Number.isFinite(px) || !Number.isFinite(dpi) || dpi <= 0) return 0;
  return (px * 2.54) / dpi;
}

// ─── Composite helpers ─────────────────────────────────────────────────────

/**
 * Calculate the exact print canvas pixel dimensions for a physical label size
 * at a given printer DPI. Uses the authoritative `createPrintGeometry` from
 * print-spec so that TSPL byte-alignment rules are respected.
 */
export function calcPrintDimensions(
  widthMm: number,
  heightMm: number,
  dpi: number,
): { widthPx: number; heightPx: number } {
  const geometry = createPrintGeometry(widthMm, heightMm, dpi);
  return {
    widthPx: geometry.sizeDotsW,
    heightPx: geometry.sizeDotsH,
  };
}

/**
 * Convert a value in any supported unit to millimetres.
 * Wrapper around `toMm` for explicit naming.
 */
export function convertToMm(value: number, unit: LabelUnit): number {
  return toMm(value, unit);
}

/**
 * Convert millimetres to any supported display unit.
 * Wrapper around `fromMm` for explicit naming.
 */
export function convertFromMm(mm: number, unit: LabelUnit): number {
  return fromMm(mm, unit);
}

/**
 * Format a physical dimension for display.
 * E.g. `formatDimension(101.6, 'mm')` → `"101.60 mm"`
 */
export function formatDimension(valueMm: number, unit: LabelUnit): string {
  const v = fromMm(valueMm, unit);
  const rounded = Math.round(v * 100) / 100;
  const suffix = unit === 'in' ? 'in' : unit === 'cm' ? 'cm' : 'mm';
  return `${rounded.toFixed(2)} ${suffix}`;
}

/**
 * Format print canvas dimensions for display.
 * E.g. `"812 × 1218 px @ 203 DPI"`
 */
export function formatPrintPixels(widthPx: number, heightPx: number, dpi: number): string {
  return `${widthPx} × ${heightPx} px @ ${dpi} DPI`;
}
