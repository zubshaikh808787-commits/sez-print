/**
 * Optical Scannability Preflight Inspector.
 *
 * Evaluates 1D barcode layouts against ISO/IEC 15416 optical grading standards
 * and physical thermal printhead constraints (203 & 300 DPI).
 *
 * Diagnoses:
 * - Narrow-bar ($X$-dimension) physical size against laser/camera scanning thresholds.
 * - Hardware integer dot quantization (avoiding sub-pixel jitter on thermal heads).
 * - ISO $10\times$ module width quiet zone compliance.
 * - Vertical sweep headroom and 15% aspect ratio recommendations.
 * - Character count vs. width density constraints.
 */

import { barcodeModulesForMode } from '../barcode-code128';
import {
  DEFAULT_HARDWARE_DPI,
  OPTICAL_SCAN_MARGINAL_X_MM,
  OPTICAL_SCAN_MIN_X_MM,
  QUIET_ZONE_MODULES_1D,
  snap1DBarcodeModules,
} from './barcode-snapping';

export type ScannabilityStatus = 'optimal' | 'marginal' | 'sub-optical' | 'invalid';
export type ScannabilityGrade = 'A' | 'B' | 'C' | 'F';

export type ScannabilityIssue = {
  severity: 'error' | 'warning' | 'info';
  code:
    | 'INVALID_CONTENT'
    | 'SUB_OPTICAL_X_DIM'
    | 'MARGINAL_X_DIM'
    | 'INSUFFICIENT_HEIGHT_FLOOR'
    | 'LOW_ASPECT_RATIO'
    | 'HIGH_CHARACTER_DENSITY';
  message: string;
};

export type BarcodeScannabilityReport = {
  status: ScannabilityStatus;
  score: number; // 0 to 100
  grade: ScannabilityGrade;
  metrics: {
    xDimensionMm: number;
    moduleDots: number;
    quietZoneMm: number;
    barcodeWidthMm: number;
    heightMm: number;
    aspectRatio: number;
    characterCount: number;
    totalModules: number;
    dpi: number;
  };
  issues: ScannabilityIssue[];
  suggestedWidthMm: number;
  suggestedHeightMm: number;
  needsOptimization: boolean;
};

/**
 * Computes optimal physical dimensions in millimeters to achieve Grade A scannability.
 */
export function computeOptimalDimensionsMm(
  mode: string,
  content: string,
  currentHeightMm: number,
  dpi: number = DEFAULT_HARDWARE_DPI,
): { widthMm: number; heightMm: number } {
  const rawModules = barcodeModulesForMode(mode, content || '0123456789');
  if (!rawModules) {
    return { widthMm: 35, heightMm: Math.max(currentHeightMm, 10) };
  }

  const dataModules = rawModules.reduce((sum, m) => sum + m, 0);
  const totalModules = dataModules + QUIET_ZONE_MODULES_1D * 2;

  // Grade A requires at least 2 dots per module at target DPI
  const dotsPerMm = dpi / 25.4;
  const targetDots = totalModules * 2;
  const rawWidthMm = targetDots / dotsPerMm;

  // Round up to nearest 0.5 mm for clean layout dimensions
  const widthMm = Math.ceil(rawWidthMm * 2) / 2;

  // Height recommendation: at least 3.5mm floor, ideally >= 15% of width and >= 5mm
  const recommendedHeightMm = Math.max(currentHeightMm, 5.0, widthMm * 0.15);
  const heightMm = Math.ceil(recommendedHeightMm * 2) / 2;

  return { widthMm, heightMm };
}

/**
 * Inspects 1D barcode scannability against optical standards and hardware physics.
 */
export function inspect1DBarcodeScannability(
  mode: string,
  content: string,
  widthMm: number,
  heightMm: number,
  dpi: number = DEFAULT_HARDWARE_DPI,
): BarcodeScannabilityReport {
  const safeContent = content || '0123456789';
  const rawModules = barcodeModulesForMode(mode, safeContent);

  if (!rawModules) {
    return {
      status: 'invalid',
      score: 0,
      grade: 'F',
      metrics: {
        xDimensionMm: 0,
        moduleDots: 0,
        quietZoneMm: 0,
        barcodeWidthMm: 0,
        heightMm,
        aspectRatio: 0,
        characterCount: safeContent.length,
        totalModules: 0,
        dpi,
      },
      issues: [
        {
          severity: 'error',
          code: 'INVALID_CONTENT',
          message: `The provided content cannot be encoded using ${mode} format.`,
        },
      ],
      suggestedWidthMm: 35,
      suggestedHeightMm: Math.max(heightMm, 10),
      needsOptimization: false,
    };
  }

  const snapped = snap1DBarcodeModules(rawModules, Math.max(1, widthMm), dpi, true);
  const issues: ScannabilityIssue[] = [];

  let score = 100;
  const xDim = snapped ? snapped.xDimensionMm : 0;
  const moduleDots = snapped ? snapped.dotMultiplier : 0;
  const quietZoneMm = snapped ? snapped.quietZoneMm : 0;
  const barcodeWidthMm = snapped ? snapped.quantizedWidthMm : 0;
  const totalModules = snapped ? snapped.totalModules : 0;
  const aspectRatio = widthMm > 0 ? heightMm / widthMm : 0;

  // 1. Narrow-bar physical size & container headroom check
  const overflowsContainer = widthMm < barcodeWidthMm;

  if (overflowsContainer) {
    score -= 45;
    issues.push({
      severity: 'error',
      code: 'SUB_OPTICAL_X_DIM',
      message: `Barcode requires at least ${barcodeWidthMm.toFixed(1)} mm for 1-dot physical modules, but container is only ${widthMm.toFixed(1)} mm. Bars will clip or distort.`,
    });
  } else if (moduleDots < 2 || xDim < OPTICAL_SCAN_MIN_X_MM) {
    // 1 dot at 203 DPI (0.125mm) or 2 dots at 300 DPI (< 0.25mm)
    score -= 25;
    issues.push({
      severity: 'warning',
      code: 'MARGINAL_X_DIM',
      message: `Narrow bar is 1 dot wide (${xDim.toFixed(2)} mm @ ${dpi} DPI). Scannable by smartphone cameras and fine lasers, but industrial scanners recommend ≥ 0.25 mm (2 dots).`,
    });
  }

  // 2. Vertical physical height check
  if (heightMm < 3.5) {
    score -= 30;
    issues.push({
      severity: 'error',
      code: 'INSUFFICIENT_HEIGHT_FLOOR',
      message: `Barcode height (${heightMm.toFixed(1)} mm) is below the 3.5 mm laser scanning floor. Handheld scanners will miss the beam.`,
    });
  } else if (aspectRatio < 0.12 && widthMm > 30) {
    score -= 15;
    issues.push({
      severity: 'warning',
      code: 'LOW_ASPECT_RATIO',
      message: `Height is relatively low (${(aspectRatio * 100).toFixed(0)}% of width). Standard recommendation is at least 15% to 20%.`,
    });
  }

  // 3. Character density check
  if (safeContent.length > 18 && widthMm < 35) {
    score -= 15;
    issues.push({
      severity: 'info',
      code: 'HIGH_CHARACTER_DENSITY',
      message: `High data density (${safeContent.length} chars in ${widthMm.toFixed(1)} mm). Increasing width will improve scan speed.`,
    });
  }

  // Final score clamping and grade derivation
  const finalScore = Math.max(0, Math.min(100, score));
  let status: ScannabilityStatus = 'optimal';
  let grade: ScannabilityGrade = 'A';

  if (finalScore >= 85) {
    status = 'optimal';
    grade = 'A';
  } else if (finalScore >= 60) {
    status = 'marginal';
    grade = 'B';
  } else if (finalScore >= 40) {
    status = 'sub-optical';
    grade = 'C';
  } else {
    status = 'sub-optical';
    grade = 'F';
  }

  const optimalDims = computeOptimalDimensionsMm(mode, safeContent, heightMm, dpi);

  return {
    status,
    score: finalScore,
    grade,
    metrics: {
      xDimensionMm: xDim,
      moduleDots,
      quietZoneMm,
      barcodeWidthMm,
      heightMm,
      aspectRatio,
      characterCount: safeContent.length,
      totalModules,
      dpi,
    },
    issues,
    suggestedWidthMm: optimalDims.widthMm,
    suggestedHeightMm: optimalDims.heightMm,
    needsOptimization: status !== 'optimal' || heightMm < 3.5 || aspectRatio < 0.12,
  };
}
