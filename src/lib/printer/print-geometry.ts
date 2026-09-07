/**
 * Authoritative WYSIWYG Print Geometry Engine.
 * Delegates mm→dots to print-spec so 304 DPI stays 12 dots/mm (TSPL SIZE-safe).
 */

import {
  createUniversalPrintLayout,
  MM_PER_INCH,
  mmToDots,
  tsplPackedWidthDots,
} from '@/lib/printer/print-spec';

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
  const layout = createUniversalPrintLayout(safeWidthMm, safeHeightMm, dpi);

  const calibXDots = mmToDots(calibrationOffsetMm.x, dpi);
  const calibYDots = mmToDots(calibrationOffsetMm.y, dpi);

  return {
    labelWidthMm: safeWidthMm,
    labelHeightMm: safeHeightMm,
    dpi,
    widthDots: layout.sizeDotsW,
    heightDots: layout.sizeDotsH,
    rasterWidthDots: layout.bitmapDotsW,
    bytesPerRow: layout.bytesPerRow,
    hardwareXOffsetDots: Math.max(0, calibXDots),
    hardwareYOffsetDots: Math.max(0, calibYDots),
    dotsPerMm: layout.dotsPerMm,
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
Printhead Width: ${THERMAL_PRINTHEAD_WIDTH_MM} mm (${mmToDots(THERMAL_PRINTHEAD_WIDTH_MM, geometry.dpi)} dots)
================================================
  `.trim();
}

export { tsplPackedWidthDots, MM_PER_INCH };
