import type { LabelOrientation } from '@/lib/label-document';
import {
  mmToDots,
  printCaptureLayout as geometryPrintCaptureLayout,
  printContentSize,
  printRasterSize,
  validateLabelSize,
} from '@/lib/label-geometry';
import {
  encodeEscPosJob,
  fitGrayToSize,
  grayToBits,
  padBitsCentered,
  pngBase64ToGray,
  rotateGray,
  shiftBits,
  type BitRaster,
  type GrayRaster,
} from '@/lib/printer/escpos';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import {
  createPrintSpec,
  DEFAULT_PRINTER_PROFILE,
  formatPrintSpecDiagnostics,
  validatePrintSpec,
  type PrintSpec,
} from '@/lib/printer/print-spec';
import { encodeTscBitmapJob } from '@/lib/printer/tsc';

/** TD-404 / 203 DPI desktop thermal: ~4.25 in printable width. */
export const TD404_MAX_WIDTH_MM = 108;

/** Capture at printer dots. pixelRatio 1 stops Android density from inflating the bitmap. */
export const PRINT_CAPTURE_OPTIONS = {
  format: 'png' as const,
  quality: 1,
  result: 'base64' as const,
  pixelRatio: 1,
};

/**
 * Build ViewShot capture options that force the output to exact printer resolution.
 *
 * `pixelRatio: 1` alone doesn't reliably prevent density inflation on all Android
 * devices (a 3× screen still captures 3600×5400 instead of 1216×1824). Passing
 * explicit `width`/`height` makes ViewShot resize natively (fast) so the PNG is
 * exactly the size the printer needs — eliminates the 30+ second JS-side PNG decode
 * of an over-sized image.
 */
export function printCaptureOptionsForSize(widthPx: number, heightPx: number) {
  return {
    ...PRINT_CAPTURE_OPTIONS,
    width: widthPx,
    height: heightPx,
  };
}

export function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

export function printJobSizeError(widthMm: number, heightMm: number): string | null {
  const range = validateLabelSize(widthMm, heightMm);
  if (range) return range;
  if (widthMm > TD404_MAX_WIDTH_MM) {
    return `This printer supports labels up to ${TD404_MAX_WIDTH_MM} mm wide. Selected width is ${Math.round(widthMm * 10) / 10} mm.`;
  }
  return null;
}

/** Exact content dots for on-screen preview math. */
export function currentPrintRaster(widthMm: number, heightMm: number) {
  return printContentSize(widthMm, heightMm, getPrinterManager().getPrintDpi());
}

/** Full BITMAP canvas (width aligned to 8 dots for TSPL). */
export function printBitmapSize(widthMm: number, heightMm: number) {
  return printRasterSize(widthMm, heightMm, getPrinterManager().getPrintDpi());
}

/** ViewShot size (`content`) vs TSPL canvas (`canvas`) at the connected printer DPI. */
export function printCaptureLayout(widthMm: number, heightMm: number) {
  return geometryPrintCaptureLayout(widthMm, heightMm, getPrinterManager().getPrintDpi());
}

/** 90° / 270° swap paper millimetres so TSPL SIZE matches the rotated bitmap. */
export function orientedPrintSize(
  widthMm: number,
  heightMm: number,
  orientation: LabelOrientation = 0,
): { widthMm: number; heightMm: number } {
  if (orientation === 90 || orientation === 270) {
    return { widthMm: heightMm, heightMm: widthMm };
  }
  return { widthMm, heightMm };
}

/**
 * Map captured PNG onto the full label bitmap.
 * Uniform contain onto the 8-dot TSPL canvas (centers 0–7 pad columns).
 * Never stretch independently on X/Y — that distorts vs the preview.
 */
export function finalizeGrayForPrint(
  gray: GrayRaster,
  options: {
    widthMm: number;
    heightMm: number;
    threshold: number;
    dither: boolean;
    hOffsetMm: number;
  },
): BitRaster {
  const dpi = getPrinterManager().getPrintDpi();
  const canvas = printRasterSize(options.widthMm, options.heightMm, dpi);

  console.info(
    '[print-job] finalizeGray:',
    options.widthMm.toFixed(1), '×', options.heightMm.toFixed(1), 'mm @', dpi, 'DPI →',
    canvas.widthPx, '×', canvas.heightPx, 'px canvas |',
    'src:', gray.width, '×', gray.height, '|',
    'threshold:', options.threshold, 'dither:', options.dither,
  );

  // The captured PNG is already at the correct label aspect (rendered from a
  // label-sized artboard at exact printer dots). Use 'stretch' so the bitmap
  // fills the full TSPL canvas — 'contain' was letterboxing by up to 7 dots
  // (the 8-dot alignment pad) which made the print smaller than the preview.
  const fitted =
    gray.width === canvas.widthPx && gray.height === canvas.heightPx
      ? gray
      : fitGrayToSize(gray, canvas.widthPx, canvas.heightPx, 'stretch');

  let bits = grayToBits(fitted, { threshold: options.threshold, dither: options.dither });

  if (bits.bytesPerRow * 8 !== canvas.widthPx || bits.height !== canvas.heightPx) {
    bits = padBitsCentered(bits, canvas.widthPx, canvas.heightPx);
  }

  const offsetDots = mmToDots(options.hOffsetMm, dpi);
  if (offsetDots !== 0) bits = shiftBits(bits, offsetDots);
  return bits;
}


export function rasterizePngForPrint(
  base64: string,
  options: {
    widthMm: number;
    heightMm: number;
    orientation: LabelOrientation;
    threshold: number;
    dither: boolean;
    hOffsetMm: number;
  },
): BitRaster {
  const t0 = Date.now();
  const inputLen = base64.length;

  let gray = pngBase64ToGray(base64);
  const tDecode = Date.now();

  console.info(
    '[print-job] rasterize: PNG decoded →', gray.width, '×', gray.height,
    '| base64:', Math.round(inputLen / 1024), 'KB',
    '| decode:', tDecode - t0, 'ms',
    '| label:', options.widthMm.toFixed(1), '×', options.heightMm.toFixed(1), 'mm',
    '| orient:', options.orientation + '°',
  );

  gray = rotateGray(gray, options.orientation);
  const tRotate = Date.now();

  const paper = orientedPrintSize(options.widthMm, options.heightMm, options.orientation);
  const bits = finalizeGrayForPrint(gray, {
    widthMm: paper.widthMm,
    heightMm: paper.heightMm,
    threshold: options.threshold,
    dither: options.dither,
    hOffsetMm: options.hOffsetMm,
  });
  const tFinalize = Date.now();

  console.info(
    '[print-job] rasterize done in', tFinalize - t0, 'ms →',
    bits.bytesPerRow * 8, '×', bits.height, 'dots |',
    bits.data.length, 'bytes raster |',
    'decode:', tDecode - t0, 'ms |',
    'rotate:', tRotate - tDecode, 'ms |',
    'finalize:', tFinalize - tRotate, 'ms',
  );
  return bits;
}

export function encodeConnectedPrinterJob(
  bits: BitRaster,
  options: {
    widthMm: number;
    heightMm: number;
    gapMm: number;
    copies: number;
    density: number | null;
    speed: number | null;
    vOffsetMm: number;
    hOffsetMm?: number;
    media?: 'gap' | 'bline' | 'continuous';
    forceLeftAligned?: boolean;
  },
): Uint8Array {
  const manager = getPrinterManager();
  const dpi = manager.getPrintDpi();
  const profile = manager.getActivePrinterProfile();

  const spec = createPrintSpec({
    widthMm: options.widthMm,
    heightMm: options.heightMm,
    dpi,
    profile,
    mediaType: options.media ?? 'gap',
    gapMm: options.gapMm,
    calibration: {
      horizontalOffsetMm: options.hOffsetMm ?? 0,
      verticalOffsetMm: options.vOffsetMm,
      forceLeftAligned: options.forceLeftAligned,
    },
  });

  const validation = validatePrintSpec(spec);
  if (!validation.valid) {
    console.error('[print-job] ❌ Invalid PrintSpec:', validation.errors);
    throw new Error(validation.errors.join(' '));
  }
  if (validation.warnings.length > 0) {
    console.warn('[print-job] ⚠️ PrintSpec warnings:', validation.warnings);
  }

  console.info(formatPrintSpecDiagnostics(spec));

  if (manager.usesTd404CommandSet) {
    const job = encodeTscBitmapJob(bits, {
      widthMm: spec.widthMm,
      heightMm: spec.heightMm,
      gapMm: spec.gapMm,
      copies: 1,
      density: options.density,
      speed: options.speed ?? 6,
      media: spec.mediaType,
      x: spec.xOffsetDots,
      y: spec.yOffsetDots,
    });
    console.info(
      '[print-job] TSPL job:', job.length, 'bytes total |',
      spec.widthMm.toFixed(1), '×', spec.heightMm.toFixed(1), 'mm |',
      'gap:', spec.gapMm, 'mm | media:', spec.mediaType,
      '| xOffset:', spec.xOffsetDots, 'dots | yOffset:', spec.yOffsetDots, 'dots |',
      'density:', options.density, '| speed:', options.speed ?? 6,
    );
    return job;
  }

  const gapDots = Math.max(0, mmToDots(options.gapMm, dpi));
  const job = encodeEscPosJob(bits, {
    copies: 1,
    leadFeedLines: spec.yOffsetDots,
    trailFeedLines: Math.min(32, gapDots),
    density: options.density,
    speed: options.speed,
  });
  console.info('[print-job] ESC/POS job:', job.length, 'bytes total');
  return job;
}

/**
 * Send one complete print payload per physical label.
 * For TSPL this avoids firmware PRINT n,1 buffer-reuse inversion; for all
 * transports it serializes through PrinterManager so jobs cannot overlap.
 */
export async function sendIsolatedPrintCopies(jobBytes: Uint8Array, copies: number): Promise<void> {
  const manager = getPrinterManager();
  const n = Math.max(1, Math.round(copies));
  console.info('[print-job] sending', n, 'copies,', jobBytes.length, 'bytes/copy');
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    // jobBytes is already immutable (fresh buffer from encodeTscBitmapJob / encodeEscPosJob).
    // Avoid Uint8Array.from() deep copy — saves ~200–300 KB allocation per copy.
    await manager.print(jobBytes);
  }
  console.info('[print-job] all', n, 'copies sent in', Date.now() - t0, 'ms');
}

export type NativePngPrintOptions = {
  pngBase64: string;
  widthMm: number;
  heightMm: number;
  gapMm: number;
  copies?: number;
  density?: number | null;
  speed?: number | null;
  vOffsetMm?: number;
  hOffsetMm?: number;
  media?: 'gap' | 'bline' | 'continuous';
  orientation?: number;
  dpi?: number;
};

/**
 * Prefer Ninestar LabelCommand native path (SDK-style, no JS rasterize).
 * Returns true when the job was sent natively; false → caller should use JS path.
 */
export async function tryNativeSdkPngPrint(options: NativePngPrintOptions): Promise<boolean> {
  return getPrinterManager().printPngLabelFast(options);
}

export function formatPrintFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/cancel|dismiss/i.test(message)) return '';
  if (/not connected|no printer/i.test(message)) {
    return 'Printer disconnected. Reconnect Bluetooth or Wi‑Fi and try again.';
  }
  if (/network request failed|failed to fetch|econnrefused|timed out|timeout/i.test(message)) {
    return 'Could not reach the printer. Check Wi‑Fi, the print service, and that the printer is on.';
  }
  return message || 'Could not send data to the printer.';
}
