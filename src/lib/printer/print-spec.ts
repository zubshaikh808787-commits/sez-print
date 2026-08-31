/**
 * Centralized Print Specification Engine.
 * Single source of truth for physical dimensions, DPI calculations,
 * printer profile capabilities, and printhead alignment.
 */

import type { LabelOrientation } from '@/lib/label-document';

export const MM_PER_INCH = 25.4;

export type PrinterAlignment = 'center' | 'left';

export type PrinterProfile = {
  id: string;
  name: string;
  dpi: number;
  /** Maximum physical width of the printhead in mm (e.g. 108mm for 4" desktop thermal). */
  printheadWidthMm: number;
  /** Maximum physical width of the printhead in dots (e.g. 864 dots @ 203 DPI). */
  printheadWidthDots: number;
  /** Maximum printable length in mm. */
  maxHeightMm: number;
  /** How narrower media rolls are physically positioned in the printer guides. */
  alignment: PrinterAlignment;
  /** Supported command language. */
  commandLanguage: 'tspl' | 'escpos' | 'cpcl' | 'zpl';
};

/** Standard printer profiles. */
export const PRINTER_PROFILES: Record<string, PrinterProfile> = {
  'td404-304': {
    id: 'td404-304',
    name: 'TD-404 / 4" Thermal Label Printer (304 DPI / 12 dots/mm)',
    dpi: 304,
    printheadWidthMm: 108,
    printheadWidthDots: 1296, // 108mm * 12 dots/mm = 1296 dots (162 bytes/row)
    maxHeightMm: 1000,
    alignment: 'center',
    commandLanguage: 'tspl',
  },
  'generic-304-4in': {
    id: 'generic-304-4in',
    name: 'Generic 4" Thermal Label Printer (304 DPI / 12 dots/mm)',
    dpi: 304,
    printheadWidthMm: 104,
    printheadWidthDots: 1248, // 104mm * 12 dots/mm = 1248 dots (156 bytes/row)
    maxHeightMm: 1000,
    alignment: 'center',
    commandLanguage: 'tspl',
  },
  'td404-203': {
    id: 'td404-203',
    name: 'TD-404 / Desktop Thermal (203 DPI)',
    dpi: 203,
    printheadWidthMm: 108,
    printheadWidthDots: 864, // 108 * 8 = 864 (multiple of 8)
    maxHeightMm: 1000,
    alignment: 'center',
    commandLanguage: 'tspl',
  },
  'generic-203-4in': {
    id: 'generic-203-4in',
    name: 'Generic 4" Thermal (203 DPI)',
    dpi: 203,
    printheadWidthMm: 104,
    printheadWidthDots: 832,
    maxHeightMm: 1000,
    alignment: 'center',
    commandLanguage: 'tspl',
  },
  'generic-300-4in': {
    id: 'generic-300-4in',
    name: 'Generic 4" Thermal (300 DPI)',
    dpi: 300,
    printheadWidthMm: 104,
    printheadWidthDots: 1228,
    maxHeightMm: 1000,
    alignment: 'center',
    commandLanguage: 'tspl',
  },
  'receipt-58mm': {
    id: 'receipt-58mm',
    name: '58mm Mobile Receipt (203 DPI)',
    dpi: 203,
    printheadWidthMm: 48,
    printheadWidthDots: 384,
    maxHeightMm: 2000,
    alignment: 'left',
    commandLanguage: 'escpos',
  },
  'receipt-80mm': {
    id: 'receipt-80mm',
    name: '80mm POS Receipt (203 DPI)',
    dpi: 203,
    printheadWidthMm: 72,
    printheadWidthDots: 576,
    maxHeightMm: 2000,
    alignment: 'left',
    commandLanguage: 'escpos',
  },
};

export const DEFAULT_PRINTER_PROFILE = PRINTER_PROFILES['td404-304'];

/** Authoritative conversion from physical millimetres to printer dots. */
export function mmToDots(mm: number, dpi = 304): number {
  if (!Number.isFinite(mm) || mm <= 0) return 0;
  const d = Number.isFinite(dpi) && dpi > 0 ? dpi : 304;
  return Math.round((mm * d) / MM_PER_INCH);
}

/** Authoritative conversion from printer dots to physical millimetres. */
export function dotsToMm(dots: number, dpi = 203): number {
  if (!Number.isFinite(dots) || dots <= 0) return 0;
  const d = Number.isFinite(dpi) && dpi > 0 ? dpi : 203;
  return Math.round(((dots * MM_PER_INCH) / d) * 100) / 100;
}

export type PrintCalibration = {
  horizontalOffsetMm?: number;
  verticalOffsetMm?: number;
  scalingX?: number;
  scalingY?: number;
  /** Explicitly override printhead centering behavior if needed. */
  forceLeftAligned?: boolean;
};

export type PrintSpec = {
  /** Target physical label width in mm. */
  widthMm: number;
  /** Target physical label height in mm. */
  heightMm: number;
  /** Printer resolution in DPI. */
  dpi: number;
  /** Exact label width in printer dots. */
  widthDots: number;
  /** Exact label height in printer dots. */
  heightDots: number;
  /** Raster canvas width in dots (rounded up to 8 for byte-alignment). */
  rasterWidthDots: number;
  /** Bytes per row for 1-bit packed raster. */
  bytesPerRow: number;
  /** Print orientation in degrees. */
  orientation: LabelOrientation;
  /** Active printer profile. */
  profile: PrinterProfile;
  /** Printhead X offset (in dots) to align label on physical media. */
  xOffsetDots: number;
  /** Printhead Y offset (in dots). */
  yOffsetDots: number;
  /** Media sensor mode. */
  mediaType: 'gap' | 'bline' | 'continuous';
  /** Inter-label gap length in mm. */
  gapMm: number;
};

export type CreatePrintSpecOptions = {
  widthMm: number;
  heightMm: number;
  dpi?: number;
  orientation?: LabelOrientation;
  profile?: PrinterProfile;
  calibration?: PrintCalibration;
  mediaType?: 'gap' | 'bline' | 'continuous';
  gapMm?: number;
};

/**
 * Compute the printhead X offset (in dots) to center a label on the printhead.
 * Center-fed printers (most desktop thermal) physically center the media under
 * a printhead that is wider than the label. The BITMAP x coordinate must account
 * for this so the image lands on the media, not shifted to one side of the
 * printhead.
 *
 * Left-aligned printers (receipt printers) feed from the left edge — no offset.
 */
export function computePrintheadCenteringOffset(
  labelWidthDots: number,
  profile: PrinterProfile,
): number {
  if (profile.alignment !== 'center') return 0;
  const gap = profile.printheadWidthDots - labelWidthDots;
  return gap > 0 ? Math.round(gap / 2) : 0;
}

/**
 * Creates an authoritative, immutable PrintSpec for a print job.
 */
export function createPrintSpec(options: CreatePrintSpecOptions): PrintSpec {
  const profile = options.profile ?? DEFAULT_PRINTER_PROFILE;
  const dpi = options.dpi ?? profile.dpi;
  const orientation = options.orientation ?? 0;

  // Swap effective width/height for landscape orientations (90° / 270°)
  const isLandscape = orientation === 90 || orientation === 270;
  const effectiveWidthMm = isLandscape ? options.heightMm : options.widthMm;
  const effectiveHeightMm = isLandscape ? options.widthMm : options.heightMm;

  const widthDots = mmToDots(effectiveWidthMm, dpi);
  const heightDots = mmToDots(effectiveHeightMm, dpi);

  // TSPL BITMAP requires byte-aligned width (multiple of 8 dots)
  const rasterWidthDots = Math.max(8, Math.ceil(widthDots / 8) * 8);
  const bytesPerRow = rasterWidthDots / 8;

  // Printhead centering offset for center-fed printers (e.g. TD-404 108mm head).
  // A 50mm label on a 108mm head → ~232 dots offset so content lands on the label.
  const forceLeft = options.calibration?.forceLeftAligned === true;
  const centeringProfile = forceLeft ? { ...profile, alignment: 'left' as PrinterAlignment } : profile;
  const centeringOffsetDots = computePrintheadCenteringOffset(widthDots, centeringProfile);

  // User calibration offsets (additive to centering)
  const calibXOffsetDots = mmToDots(options.calibration?.horizontalOffsetMm ?? 0, dpi);
  const calibYOffsetDots = mmToDots(options.calibration?.verticalOffsetMm ?? 0, dpi);

  const xOffsetDots = Math.max(0, centeringOffsetDots + calibXOffsetDots);
  const yOffsetDots = Math.max(0, calibYOffsetDots);

  return {
    widthMm: effectiveWidthMm,
    heightMm: effectiveHeightMm,
    dpi,
    widthDots,
    heightDots,
    rasterWidthDots,
    bytesPerRow,
    orientation,
    profile,
    xOffsetDots,
    yOffsetDots,
    mediaType: options.mediaType ?? 'gap',
    gapMm: options.gapMm ?? 2,
  };
}

export type PrintSpecValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

/**
 * Validates a PrintSpec against physical hardware limits before rasterization.
 */
export function validatePrintSpec(spec: PrintSpec): PrintSpecValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (spec.widthMm <= 0 || !Number.isFinite(spec.widthMm)) {
    errors.push(`Invalid width: ${spec.widthMm} mm.`);
  }
  if (spec.heightMm <= 0 || !Number.isFinite(spec.heightMm)) {
    errors.push(`Invalid height: ${spec.heightMm} mm.`);
  }
  if (spec.dpi <= 0 || !Number.isFinite(spec.dpi)) {
    errors.push(`Invalid DPI: ${spec.dpi}.`);
  }
  if (spec.widthDots <= 0 || spec.heightDots <= 0) {
    errors.push(`Invalid dot dimensions: ${spec.widthDots} × ${spec.heightDots} dots.`);
  }

  // Check against printhead physical maximum width
  if (spec.widthMm > spec.profile.printheadWidthMm + 0.5) {
    errors.push(
      `Selected width (${spec.widthMm.toFixed(1)} mm) exceeds printer maximum width (${spec.profile.printheadWidthMm} mm).`,
    );
  }

  // Check if printable area overflows printhead with offset
  if (spec.xOffsetDots + spec.widthDots > spec.profile.printheadWidthDots + 8) {
    warnings.push(
      `Label + offset (${spec.xOffsetDots + spec.widthDots} dots) exceeds printhead width (${spec.profile.printheadWidthDots} dots). Right edge may be trimmed.`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/** Formats a complete structured diagnostic report for development logging. */
export function formatPrintSpecDiagnostics(spec: PrintSpec): string {
  return [
    '========================================',
    '             PRINT SPEC                 ',
    '========================================',
    `Physical Size   : ${spec.widthMm.toFixed(1)} × ${spec.heightMm.toFixed(1)} mm`,
    `Printer DPI     : ${spec.dpi} DPI`,
    `Dots Dimension  : ${spec.widthDots} × ${spec.heightDots} dots`,
    `Raster Canvas   : ${spec.rasterWidthDots} × ${spec.heightDots} dots (${spec.bytesPerRow} bytes/row)`,
    `Orientation     : ${spec.orientation}°`,
    `Printer Profile : ${spec.profile.name} (${spec.profile.printheadWidthMm} mm / ${spec.profile.printheadWidthDots} dots)`,
    `Alignment Mode  : ${spec.profile.alignment} (xOffset: ${spec.xOffsetDots} dots, yOffset: ${spec.yOffsetDots} dots)`,
    `Media Mode      : ${spec.mediaType} (gap: ${spec.gapMm} mm)`,
    '========================================',
  ].join('\n');
}
