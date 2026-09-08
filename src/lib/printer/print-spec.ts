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
    alignment: 'left',
    commandLanguage: 'tspl',
  },
  'generic-304-4in': {
    id: 'generic-304-4in',
    name: 'Generic 4" Thermal Label Printer (304 DPI / 12 dots/mm)',
    dpi: 304,
    printheadWidthMm: 104,
    printheadWidthDots: 1248, // 104mm * 12 dots/mm = 1248 dots (156 bytes/row)
    maxHeightMm: 1000,
    alignment: 'left',
    commandLanguage: 'tspl',
  },
  'td404-203': {
    id: 'td404-203',
    name: 'TD-404 / Desktop Thermal (203 DPI)',
    dpi: 203,
    printheadWidthMm: 108,
    printheadWidthDots: 864, // 108 * 8 = 864 (multiple of 8)
    maxHeightMm: 1000,
    alignment: 'left',
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

/** Keep millimetres to 0.01. Never integer-round a typed size. */
export function quantizeMm(mm: number): number {
  if (!Number.isFinite(mm)) return 0.1;
  return Math.max(0.1, Math.round(mm * 100) / 100);
}

export function formatTsplMm(mm: number): string {
  return quantizeMm(mm).toFixed(2);
}

/** TSPL SIZE always includes hundredths: `SIZE 50.80 mm,70.00 mm`. */
export function formatTsplSizeCommand(widthMm: number, heightMm: number): string {
  return `SIZE ${formatTsplMm(widthMm)} mm,${formatTsplMm(heightMm)} mm`;
}

/**
 * Hardware dots per millimetre.
 * 304 DPI heads are 12 dots/mm (304.8). Using 304/25.4 leaves 54 mm at 646 dots
 * while TSPL SIZE 54 mm is 648, which clips the right edge.
 */
export function dotsPerMm(dpi = 203): number {
  const d = Number.isFinite(dpi) && dpi > 0 ? dpi : 203;
  if (d === 304) return 12;
  if (d === 203) return 8;
  return d / MM_PER_INCH;
}

/** Authoritative conversion from physical millimetres to printer dots. */
export function mmToDots(mm: number, dpi = 203): number {
  if (!Number.isFinite(mm) || mm === 0) return 0;
  return Math.round(mm * dotsPerMm(dpi));
}

/**
 * Edge-based rectangle rounding. Round each edge independently so stacked
 * elements on a long label do not accumulate width/height rounding drift.
 */
export type DotRect = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  widthDots: number;
  heightDots: number;
};

export function rectMmToDots(
  xMm: number,
  yMm: number,
  widthMm: number,
  heightMm: number,
  dpi = 203,
): DotRect {
  const x0 = mmToDots(xMm, dpi);
  const y0 = mmToDots(yMm, dpi);
  const x1 = mmToDots(xMm + widthMm, dpi);
  const y1 = mmToDots(yMm + heightMm, dpi);
  return { x0, y0, x1, y1, widthDots: x1 - x0, heightDots: y1 - y0 };
}

/**
 * TSPL BITMAP width is bytes×8. Firmware clips any columns past SIZE-in-dots,
 * which reads as a left shift plus right-edge cutoff. Always pack DOWN.
 */
export function tsplPackedWidthDots(contentDots: number): number {
  const dots = Math.max(1, Math.round(contentDots));
  return Math.max(8, Math.floor(dots / 8) * 8);
}

/**
 * One layout for preview capture and TSPL BITMAP.
 *
 * Capture at SIZE-in-dots (1 px = 1 printer dot, same mm scale as the editor).
 * BITMAP width is packed DOWN; leftover 0–7 columns are cropped on the right —
 * never scaled, or the label would print slightly narrower than the preview.
 */
export type UniversalPrintLayout = {
  widthMm: number;
  heightMm: number;
  dpi: number;
  /** Firmware SIZE in dots (left/top origin). */
  sizeDotsW: number;
  sizeDotsH: number;
  /** ViewShot / editor capture — identical to SIZE so preview mm maps 1:1. */
  captureDotsW: number;
  captureDotsH: number;
  /** TSPL BITMAP width (multiple of 8, never wider than SIZE). */
  bitmapDotsW: number;
  bitmapDotsH: number;
  bytesPerRow: number;
  /** Uniform px/mm used by capture layout (from SIZE, not packed width). */
  dotsPerMm: number;
  /** Exact TSPL SIZE command for this millimetre pair. */
  sizeCommand: string;
};

/** Alias used by print/preview/encode — same millimetre → dot contract. */
export type PrintGeometry = UniversalPrintLayout;

export function createUniversalPrintLayout(
  widthMm: number,
  heightMm: number,
  dpi = 203,
): UniversalPrintLayout {
  const wMm = quantizeMm(widthMm);
  const hMm = quantizeMm(heightMm);
  const dpm = dotsPerMm(dpi);
  const canvas = rectMmToDots(0, 0, wMm, hMm, dpi);
  const sizeDotsW = Math.max(1, canvas.widthDots);
  const sizeDotsH = Math.max(1, canvas.heightDots);
  const bitmapDotsW = tsplPackedWidthDots(sizeDotsW);
  return {
    widthMm: wMm,
    heightMm: hMm,
    dpi,
    sizeDotsW,
    sizeDotsH,
    captureDotsW: sizeDotsW,
    captureDotsH: sizeDotsH,
    bitmapDotsW,
    bitmapDotsH: sizeDotsH,
    bytesPerRow: bitmapDotsW / 8,
    dotsPerMm: dpm,
    sizeCommand: formatTsplSizeCommand(wMm, hMm),
  };
}

export function createPrintGeometry(
  widthMm: number,
  heightMm: number,
  dpi = 203,
): PrintGeometry {
  return createUniversalPrintLayout(widthMm, heightMm, dpi);
}

/** Authoritative conversion from printer dots to physical millimetres. */
export function dotsToMm(dots: number, dpi = 203): number {
  if (!Number.isFinite(dots) || dots <= 0) return 0;
  return Math.round((dots / dotsPerMm(dpi)) * 100) / 100;
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
  /** Raster canvas width in dots (packed down to a multiple of 8). */
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
 * In TSPL command language, the printer firmware uses the SIZE command and
 * hardware sensor calibration (GAP / BLINE / REFERENCE 0,0) to establish
 * the label's origin at the top-left of the media.
 * Injecting an artificial printhead offset shifts the image off the physical label.
 * Hardware offset is 0; fine-tuning is controlled by user calibration offsets.
 */
export function computePrintheadCenteringOffset(
  _labelWidthDots: number,
  _profile: PrinterProfile,
): number {
  return 0;
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

  const layout = createUniversalPrintLayout(effectiveWidthMm, effectiveHeightMm, dpi);
  const widthDots = layout.sizeDotsW;
  const heightDots = layout.sizeDotsH;
  const rasterWidthDots = layout.bitmapDotsW;
  const bytesPerRow = layout.bytesPerRow;

  // SIZE origin is the label top-left. BITMAP x/y are user calibration only.
  // Do not shift for pack-down leftover (those 0–7 columns are cropped on the right).
  const forceLeft = options.calibration?.forceLeftAligned === true;
  const centeringProfile = forceLeft ? { ...profile, alignment: 'left' as PrinterAlignment } : profile;
  const centeringOffsetDots = computePrintheadCenteringOffset(widthDots, centeringProfile);

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
      `Selected width (${spec.widthMm.toFixed(2)} mm) exceeds printer maximum width (${spec.profile.printheadWidthMm} mm).`,
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
    `Physical Size   : ${spec.widthMm.toFixed(2)} × ${spec.heightMm.toFixed(2)} mm`,
    `Printer DPI     : ${spec.dpi} DPI`,
    `Dots Dimension  : ${spec.widthDots} × ${spec.heightDots} dots (SIZE)`,
    `Raster Canvas   : ${spec.rasterWidthDots} × ${spec.heightDots} dots BITMAP (${spec.bytesPerRow} bytes/row, pack-down crop ${Math.max(0, spec.widthDots - spec.rasterWidthDots)} dots)`,
    `Orientation     : ${spec.orientation}°`,
    `Printer Profile : ${spec.profile.name} (${spec.profile.printheadWidthMm} mm / ${spec.profile.printheadWidthDots} dots)`,
    `Alignment Mode  : ${spec.profile.alignment} (xOffset: ${spec.xOffsetDots} dots, yOffset: ${spec.yOffsetDots} dots)`,
    `Media Mode      : ${spec.mediaType} (gap: ${spec.gapMm} mm)`,
    '========================================',
  ].join('\n');
}
