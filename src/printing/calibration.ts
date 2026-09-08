/**
 * Phase 0: Ground-Truth Calibration & TSPL Box Generator
 *
 * One source of truth: physical units (mm), not pixels.
 * PRINTER_DPI = 304 dots/inch
 * DOTS_PER_MM = 304 / 25.4 (≈ 11.9685 dots/mm - NOT rounded to 12)
 */

export const PRINTER_DPI = 304;
export const DOTS_PER_MM = PRINTER_DPI / 25.4; // 11.968503937007874

export type SupportedDpi = 203 | 300 | 304 | 600;

/**
 * Return dots per millimeter for any given DPI without rounding error.
 */
export function computeDotsPerMm(dpi: number = PRINTER_DPI): number {
  return dpi / 25.4;
}

export interface CalibrationAdjustment {
  nominalDpi: number;
  expectedWidthMm: number;
  measuredWidthMm: number;
  expectedHeightMm: number;
  measuredHeightMm: number;
  scaleFactorX: number; // expected / measured
  scaleFactorY: number; // expected / measured
}

/**
 * Calculate micro-calibration adjustment factors from real-world caliper measurements.
 */
export function calculateCalibrationAdjustment(
  expectedWidthMm: number,
  measuredWidthMm: number,
  expectedHeightMm: number,
  measuredHeightMm: number,
  nominalDpi: number = PRINTER_DPI,
): CalibrationAdjustment {
  const scaleFactorX = measuredWidthMm > 0 ? expectedWidthMm / measuredWidthMm : 1.0;
  const scaleFactorY = measuredHeightMm > 0 ? expectedHeightMm / measuredHeightMm : 1.0;
  return {
    nominalDpi,
    expectedWidthMm,
    measuredWidthMm,
    expectedHeightMm,
    measuredHeightMm,
    scaleFactorX: Number(scaleFactorX.toFixed(4)),
    scaleFactorY: Number(scaleFactorY.toFixed(4)),
  };
}

export type CalibrationBoxParams = {
  labelWidthMm: number;
  labelHeightMm: number;
  boxWidthMm: number;
  boxHeightMm: number;
  xMm?: number;
  yMm?: number;
  thicknessMm?: number;
  gapMm?: number;
  dpi?: number;
  calibrationScale?: { scaleX: number; scaleY: number };
};

export type CalibrationBoxResult = {
  tspl: string;
  bytes: Uint8Array;
  dots: {
    labelWidthDots: number;
    labelHeightDots: number;
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    boxWidthDots: number;
    boxHeightDots: number;
    thicknessDots: number;
  };
};

/**
 * Generate a minimal, valid raw TSPL script to print a calibration box
 * with exact mm dimensions, supporting multi-DPI and fine scale tuning.
 */
export function generateCalibrationTspl(params: CalibrationBoxParams): CalibrationBoxResult {
  const {
    labelWidthMm,
    labelHeightMm,
    boxWidthMm,
    boxHeightMm,
    gapMm = 2,
    thicknessMm = 0.35,
    dpi = PRINTER_DPI,
  } = params;

  const baseDpm = computeDotsPerMm(dpi);
  const scaleX = params.calibrationScale?.scaleX ?? 1.0;
  const scaleY = params.calibrationScale?.scaleY ?? 1.0;
  const dpmX = baseDpm * scaleX;
  const dpmY = baseDpm * scaleY;

  // Center box by default if offsets not given
  const xMm = params.xMm ?? Math.max(0, (labelWidthMm - boxWidthMm) / 2);
  const yMm = params.yMm ?? Math.max(0, (labelHeightMm - boxHeightMm) / 2);

  // Exact dot calculation using unrounded dpm
  const labelWidthDots = Math.round(labelWidthMm * dpmX);
  const labelHeightDots = Math.round(labelHeightMm * dpmY);

  const x0 = Math.round(xMm * dpmX);
  const y0 = Math.round(yMm * dpmY);
  const x1 = Math.round((xMm + boxWidthMm) * dpmX);
  const y1 = Math.round((yMm + boxHeightMm) * dpmY);
  const thicknessDots = Math.max(1, Math.round(thicknessMm * dpmX));

  const tspl = [
    `SIZE ${labelWidthMm} mm, ${labelHeightMm} mm`,
    `GAP ${gapMm} mm, 0 mm`,
    'DIRECTION 1',
    'CLS',
    `BOX ${x0},${y0},${x1},${y1},${thicknessDots}`,
    'PRINT 1',
    '',
  ].join('\r\n');

  // Convert string to bytes
  const bytes = new TextEncoder().encode(tspl);

  return {
    tspl,
    bytes,
    dots: {
      labelWidthDots,
      labelHeightDots,
      x0,
      y0,
      x1,
      y1,
      boxWidthDots: x1 - x0,
      boxHeightDots: y1 - y0,
      thicknessDots,
    },
  };
}

