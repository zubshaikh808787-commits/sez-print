/**
 * Integer-Module Optical Barcode Snapping Engine.
 *
 * Quantizes 1D barcode and 2D matrix module dimensions (X-dimension) to exact
 * integer hardware printer dots (1, 2, 3, ... dots) at the target printer DPI.
 *
 * Eliminates sub-pixel dot jitter and fractional anti-aliasing distortion that
 * makes thermal-printed barcodes unscannable.
 *
 * Enforces ISO/IEC quiet zones (10× module width for 1D, 4× for 2D).
 */

export type HardwareDpi = 203 | 300 | 304 | 600;

export const DEFAULT_HARDWARE_DPI: HardwareDpi = 203;
export const MM_PER_INCH = 25.4;

/** Standard minimum quiet zone module count for 1D symbologies (10× X-dimension) */
export const QUIET_ZONE_MODULES_1D = 10;
/** Standard minimum quiet zone module count for 2D symbologies (4× X-dimension for QR) */
export const QUIET_ZONE_MODULES_2D = 4;

/** Minimum optical scan threshold for handheld commercial laser / CCD scanners (0.25 mm) */
export const OPTICAL_SCAN_MIN_X_MM = 0.25;
/** Marginal scan threshold — scannable by high-res imager cameras, marginal for laser scanners */
export const OPTICAL_SCAN_MARGINAL_X_MM = 0.17;

export type SnappedBar = {
  /** Offset in hardware dots from the start of the barcode (including left quiet zone) */
  dotX: number;
  /** Width in hardware dots */
  dotWidth: number;
  /** Normalized coordinate [0..1] relative to the total quantized barcode width */
  x: number;
  /** Normalized width [0..1] relative to the total quantized barcode width */
  width: number;
};

export type SnappedBarcodeLayout = {
  /** Module multiplier in hardware dots (1, 2, 3, ... integer dots) */
  dotMultiplier: number;
  /** Physical X-dimension (narrow bar width) in millimeters */
  xDimensionMm: number;
  /** Total modules in the barcode including quiet zones */
  totalModules: number;
  /** Total width of the barcode ink + quiet zones in integer hardware dots */
  quantizedWidthDots: number;
  /** Total physical width in millimeters corresponding to quantizedWidthDots */
  quantizedWidthMm: number;
  /** Offset in millimeters to center the quantized barcode within the requested container width */
  offsetXMm: number;
  /** Left & right quiet zone width in millimeters */
  quietZoneMm: number;
  /** Snapped discrete bar rectangles */
  bars: SnappedBar[];
  /** Optical scannability evaluation */
  scannability: 'optimal' | 'marginal' | 'sub-optical';
};

/** Converts millimeters to exact continuous hardware dots at target DPI */
export function mmToHardwareDots(mm: number, dpi: number = DEFAULT_HARDWARE_DPI): number {
  return (mm / MM_PER_INCH) * dpi;
}

/** Converts hardware dots to physical millimeters at target DPI */
export function hardwareDotsToMm(dots: number, dpi: number = DEFAULT_HARDWARE_DPI): number {
  return (dots / dpi) * MM_PER_INCH;
}

/**
 * Snaps 1D module widths to integer hardware dots at target DPI, enforcing quiet zones.
 *
 * @param rawModules Array of module counts for alternating [bar, space, bar, space, ...]
 * @param containerWidthMm Desired width allocated for the element on the label
 * @param dpi Target printer resolution (default 203 DPI)
 * @param includeQuietZone Whether to add standard 10× quiet zones on left and right
 */
export function snap1DBarcodeModules(
  rawModules: number[],
  containerWidthMm: number,
  dpi: number = DEFAULT_HARDWARE_DPI,
  includeQuietZone: boolean = true,
): SnappedBarcodeLayout | null {
  if (!rawModules || rawModules.length === 0) return null;

  const dataModules = rawModules.reduce((sum, m) => sum + m, 0);
  if (dataModules <= 0) return null;

  const quietModules = includeQuietZone ? QUIET_ZONE_MODULES_1D : 0;
  const totalModules = dataModules + quietModules * 2;

  const dotsPerMm = dpi / MM_PER_INCH;
  const availableDots = Math.max(1, Math.round(containerWidthMm * dotsPerMm));

  // Compute maximum integer module multiplier that fits in the available dots
  let dotMultiplier = Math.floor(availableDots / totalModules);

  // If the container is too narrow for even a 1-dot module, clamp to 1 dot (minimum physics)
  if (dotMultiplier < 1) {
    dotMultiplier = 1;
  }

  const singleDotMm = 1 / dotsPerMm;
  const xDimensionMm = dotMultiplier * singleDotMm;
  const quantizedWidthDots = totalModules * dotMultiplier;
  const quantizedWidthMm = quantizedWidthDots * singleDotMm;

  // Center the quantized barcode if the allocated container is wider
  const offsetXMm = Math.max(0, (containerWidthMm - quantizedWidthMm) / 2);
  const quietZoneMm = quietModules * xDimensionMm;

  // Build snapped bar rectangles
  const bars: SnappedBar[] = [];
  let currentDot = quietModules * dotMultiplier; // Start after left quiet zone

  for (let i = 0; i < rawModules.length; i += 1) {
    const modCount = rawModules[i];
    const barDots = modCount * dotMultiplier;

    // Even indices are bars (black), odd indices are spaces (white)
    if (i % 2 === 0) {
      bars.push({
        dotX: currentDot,
        dotWidth: barDots,
        x: currentDot / quantizedWidthDots,
        width: barDots / quantizedWidthDots,
      });
    }
    currentDot += barDots;
  }

  // Determine optical scannability grade
  let scannability: SnappedBarcodeLayout['scannability'] = 'optimal';
  if (xDimensionMm < OPTICAL_SCAN_MARGINAL_X_MM) {
    scannability = 'sub-optical';
  } else if (xDimensionMm < OPTICAL_SCAN_MIN_X_MM) {
    scannability = 'marginal';
  }

  return {
    dotMultiplier,
    xDimensionMm,
    totalModules,
    quantizedWidthDots,
    quantizedWidthMm,
    offsetXMm,
    quietZoneMm,
    bars,
    scannability,
  };
}

/**
 * Snaps 2D matrix modules (QR, DataMatrix, PDF417) to integer hardware dots.
 * Ensures each cell is an exact $N \times N$ or $N \times M$ integer dot square.
 */
export function snap2DMatrixToHardwareDots(
  matrixColumns: number,
  matrixRows: number,
  containerWidthMm: number,
  containerHeightMm: number,
  dpi: number = DEFAULT_HARDWARE_DPI,
  quietZoneModules: number = 0,
): {
  dotSize: number;
  moduleSizeMm: number;
  quantizedWidthDots: number;
  quantizedHeightDots: number;
  quantizedWidthMm: number;
  quantizedHeightMm: number;
  offsetXMm: number;
  offsetYMm: number;
} {
  const totalCols = matrixColumns + quietZoneModules * 2;
  const totalRows = matrixRows + quietZoneModules * 2;

  const dotsPerMm = dpi / MM_PER_INCH;
  const availableWidthDots = Math.max(1, Math.round(containerWidthMm * dotsPerMm));
  const availableHeightDots = Math.max(1, Math.round(containerHeightMm * dotsPerMm));

  const maxDotW = Math.floor(availableWidthDots / totalCols);
  const maxDotH = Math.floor(availableHeightDots / totalRows);

  const dotSize = Math.max(1, Math.min(maxDotW, maxDotH));
  const singleDotMm = 1 / dotsPerMm;
  const moduleSizeMm = dotSize * singleDotMm;

  const quantizedWidthDots = totalCols * dotSize;
  const quantizedHeightDots = totalRows * dotSize;
  const quantizedWidthMm = quantizedWidthDots * singleDotMm;
  const quantizedHeightMm = quantizedHeightDots * singleDotMm;

  const offsetXMm = Math.max(0, (containerWidthMm - quantizedWidthMm) / 2);
  const offsetYMm = Math.max(0, (containerHeightMm - quantizedHeightMm) / 2);

  return {
    dotSize,
    moduleSizeMm,
    quantizedWidthDots,
    quantizedHeightDots,
    quantizedWidthMm,
    quantizedHeightMm,
    offsetXMm,
    offsetYMm,
  };
}
