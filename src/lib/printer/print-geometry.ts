/**
 * Authoritative WYSIWYG Print Geometry Engine.
 * Single source of truth for coordinate transformation from logical units (mm / %)
 * to screen DP and exact physical printer dots (203 / 300 DPI).
 *
 * @deprecated Prefer `createPrintSpec()` from `@/lib/printer/print-spec` for new code.
 * This module is retained for the shipping-editor and will be consolidated in a future cleanup.
 */

import { MM_PER_INCH } from '@/lib/printer/print-spec';

export type PrintGeometry = {
  /** Target physical label dimensions in mm */
  labelWidthMm: number;
  labelHeightMm: number;
  /** Printer resolution in DPI (typically 203 for thermal, 300 for high-res) */
  dpi: number;
  /** Exact label dimensions in printer hardware dots */
  widthDots: number;
  heightDots: number;
  /** Byte-aligned raster width (multiple of 8) */
  rasterWidthDots: number;
  bytesPerRow: number;
  /**
   * Hardware X offset (in dots) to center the label on center-fed desktop
   * thermal printer printheads (e.g. TD-404 / TSC 108mm / 864 dots printhead).
   */
  hardwareXOffsetDots: number;
  hardwareYOffsetDots: number;
  /** Scale factor in dots per mm */
  dotsPerMm: number;
};

/** Standard desktop thermal printer printhead width (108mm = 4.25 in = 864 dots @ 203 DPI) */
export const THERMAL_PRINTHEAD_WIDTH_MM = 108;
export const THERMAL_PRINTHEAD_DOTS_203 = 864;

/**
 * Computes exact physical printer geometry for a given label size and DPI.
 */
export function calculatePrintGeometry(
  widthMm: number,
  heightMm: number,
  dpi = 203,
  calibrationOffsetMm = { x: 0, y: 0 },
): PrintGeometry {
  const safeWidthMm = Math.max(10, widthMm);
  const safeHeightMm = Math.max(10, heightMm);
  const dotsPerMm = dpi / MM_PER_INCH;

  const widthDots = Math.round(safeWidthMm * dotsPerMm);
  const heightDots = Math.round(safeHeightMm * dotsPerMm);

  // TSPL / ESC-POS 1-bit packed raster requires byte-aligned rows (multiple of 8 dots)
  const rasterWidthDots = Math.max(8, Math.ceil(widthDots / 8) * 8);
  const bytesPerRow = rasterWidthDots / 8;

  // Printhead hardware centering:
  // Desktop thermal printers (TD-404, Zebra 4", TSC) have fixed center-fed paper guides.
  // A 100mm label sits in the middle of the 108mm printhead (26 dots margin each side).
  // A 50mm label sits in the middle (232 dots margin each side).
  const printheadDots = Math.round(THERMAL_PRINTHEAD_WIDTH_MM * dotsPerMm);
  let hardwareXOffsetDots = 0;
  if (printheadDots > widthDots) {
    hardwareXOffsetDots = Math.max(0, Math.round((printheadDots - widthDots) / 2));
  }

  // User calibration offsets
  const calibXDots = Math.round(calibrationOffsetMm.x * dotsPerMm);
  const calibYDots = Math.round(calibrationOffsetMm.y * dotsPerMm);

  const totalXOffsetDots = Math.max(0, hardwareXOffsetDots + calibXDots);
  const totalYOffsetDots = Math.max(0, calibYDots);

  return {
    labelWidthMm: safeWidthMm,
    labelHeightMm: safeHeightMm,
    dpi,
    widthDots,
    heightDots,
    rasterWidthDots,
    bytesPerRow,
    hardwareXOffsetDots: totalXOffsetDots,
    hardwareYOffsetDots: totalYOffsetDots,
    dotsPerMm,
  };
}

/**
 * Transforms a percentage or mm element coordinate into exact printer dots.
 */
export function transformToPrinterDots(
  logicalCoord: { xPct: number; yPct: number; widthPct: number; heightPct: number },
  geometry: PrintGeometry,
): { xDot: number; yDot: number; widthDot: number; heightDot: number } {
  return {
    xDot: Math.round((logicalCoord.xPct / 100) * geometry.widthDots),
    yDot: Math.round((logicalCoord.yPct / 100) * geometry.heightDots),
    widthDot: Math.round((logicalCoord.widthPct / 100) * geometry.widthDots),
    heightDot: Math.round((logicalCoord.heightPct / 100) * geometry.heightDots),
  };
}

/**
 * Formats a comprehensive print geometry debug log.
 */
export function formatPrintGeometryDiagnostics(
  geometry: PrintGeometry,
  jobName = 'Label',
): string {
  return `
========== PRINT GEOMETRY DIAGNOSTICS ==========
Job: ${jobName}
Label Size: ${geometry.labelWidthMm.toFixed(1)} × ${geometry.labelHeightMm.toFixed(1)} mm
Target DPI: ${geometry.dpi} DPI (${geometry.dotsPerMm.toFixed(3)} dots/mm)
Printer Canvas: ${geometry.widthDots} × ${geometry.heightDots} dots
Raster Allocation: ${geometry.rasterWidthDots} × ${geometry.heightDots} dots (${geometry.bytesPerRow} bytes/row, ${geometry.bytesPerRow * geometry.heightDots} bytes total)
Hardware Centering Offset: X=${geometry.hardwareXOffsetDots} dots (${(geometry.hardwareXOffsetDots / geometry.dotsPerMm).toFixed(2)} mm), Y=${geometry.hardwareYOffsetDots} dots
Printhead Width: ${THERMAL_PRINTHEAD_WIDTH_MM} mm (${Math.round(THERMAL_PRINTHEAD_WIDTH_MM * geometry.dotsPerMm)} dots)
================================================
  `.trim();
}
