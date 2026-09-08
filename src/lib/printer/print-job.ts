import type { LabelOrientation } from '@/lib/label-document';
import {
  mmToDots,
  printCaptureLayout as geometryPrintCaptureLayout,
  printContentSize,
  printMediaSizeMm,
  printRasterSize,
  validateLabelSize,
} from '@/lib/label-geometry';
import {
  createPrintGeometry,
  createPrintSpec,
  formatPrintSpecDiagnostics,
  validatePrintSpec,
} from '@/lib/printer/print-spec';
import {
  encodeEscPosJob,
  grayToBits,
  grayToPngBase64,
  cropGrayToSize,
  layoutImportedArtwork,
  pngBase64ToGray,
  prepareEditorGrayForPrint,
  rotateGray,
  type BitRaster,
  type GrayRaster,
} from '@/lib/printer/escpos';
import { encodeTscBitmapJob, inspectTsplJob } from '@/lib/printer/tsc';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import { logPrintTrace } from '@/printing';

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
 * ViewShot options for a view already laid out at SIZE-in-dots.
 * Do not pass width/height — that second resize is the dp→dots mismatch.
 * Density-inflated captures (2×/3× SIZE) are integer-downsampled later.
 */
export function printCaptureOptionsForSize(_widthPx?: number, _heightPx?: number) {
  return PRINT_CAPTURE_OPTIONS;
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
    return `This printer supports labels up to ${TD404_MAX_WIDTH_MM} mm wide. Selected width is ${Math.round(widthMm * 100) / 100} mm.`;
  }
  return null;
}

/** Exact content dots for on-screen preview math. */
export function currentPrintRaster(widthMm: number, heightMm: number) {
  const media = printMediaSizeMm(widthMm, heightMm);
  return printContentSize(media.widthMm, media.heightMm, getPrinterManager().getPrintDpi());
}

/** Full BITMAP canvas (width aligned to 8 dots for TSPL). */
export function printBitmapSize(widthMm: number, heightMm: number) {
  const media = printMediaSizeMm(widthMm, heightMm);
  return printRasterSize(media.widthMm, media.heightMm, getPrinterManager().getPrintDpi());
}

/** ViewShot size (`content`) vs TSPL canvas (`canvas`) at the connected printer DPI. */
export function printCaptureLayout(widthMm: number, heightMm: number, dpi?: number) {
  const media = printMediaSizeMm(widthMm, heightMm);
  const targetDpi = Number.isFinite(dpi) && (dpi as number) > 0 ? (dpi as number) : getPrinterManager().getPrintDpi();
  return geometryPrintCaptureLayout(media.widthMm, media.heightMm, targetDpi);
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
 * Map captured PNG onto the TSPL bitmap canvas.
 *
 * Capture is SIZE-in-dots. Pack-down leftover (0–7 columns) is cropped on the
 * right — never stretched. User H offset is BITMAP x only.
 */
export function finalizeGrayForPrint(
  gray: GrayRaster,
  options: {
    widthMm: number;
    heightMm: number;
    threshold: number;
    dither: boolean;
    hOffsetMm: number;
    dpi?: number;
    /**
     * Imported photo / die-cut template: trim empty margin then fill the
     * selected millimetre stock (SIZE-in-dots).
     */
    fitArtwork?: boolean;
  },
): BitRaster {
  const dpi = options.dpi ?? getPrinterManager().getPrintDpi();
  const geometry = createPrintGeometry(options.widthMm, options.heightMm, dpi);

  console.info(
    '[print-job] finalizeGray:',
    geometry.widthMm.toFixed(2), '×', geometry.heightMm.toFixed(2), 'mm @', dpi, 'DPI →',
    geometry.sizeCommand, '| SIZE dots', geometry.sizeDotsW, '×', geometry.sizeDotsH,
    '| BITMAP', geometry.bitmapDotsW, '×', geometry.bitmapDotsH, '|', geometry.bytesPerRow, 'bytes/row',
    '| src:', gray.width, '×', gray.height,
    '| artwork:', Boolean(options.fitArtwork),
    '| threshold:', options.threshold, 'dither:', options.dither,
  );

  let fitted: GrayRaster;
  if (options.fitArtwork) {
    fitted = layoutImportedArtwork(gray, geometry.sizeDotsW, geometry.sizeDotsH);
    if (fitted.width !== geometry.bitmapDotsW || fitted.height !== geometry.bitmapDotsH) {
      fitted = cropGrayToSize(fitted, geometry.bitmapDotsW, geometry.bitmapDotsH);
    }
  } else {
    fitted = prepareEditorGrayForPrint(
      gray,
      geometry.sizeDotsW,
      geometry.sizeDotsH,
      geometry.bitmapDotsW,
      geometry.bitmapDotsH,
    );
  }

  logPrintTrace('PRINT_GEOMETRY', {
    widthMm: geometry.widthMm,
    heightMm: geometry.heightMm,
    sizeCommand: geometry.sizeCommand,
    sizeDotsW: geometry.sizeDotsW,
    sizeDotsH: geometry.sizeDotsH,
    bitmapDotsW: geometry.bitmapDotsW,
    bitmapDotsH: geometry.bitmapDotsH,
    bytesPerRow: geometry.bytesPerRow,
    pngW: gray.width,
    pngH: gray.height,
    fittedW: fitted.width,
    fittedH: fitted.height,
    dpi,
    dpm: geometry.dotsPerMm,
  });

  const bits = grayToBits(fitted, { threshold: options.threshold, dither: options.dither });

  if (bits.bytesPerRow * 8 !== geometry.bitmapDotsW || bits.height !== geometry.bitmapDotsH) {
    logPrintTrace('BITMAP_PACK_MISMATCH', {
      bitW: bits.bytesPerRow * 8,
      bitH: bits.height,
      canvasW: geometry.bitmapDotsW,
      canvasH: geometry.bitmapDotsH,
      note: 'Not letterboxing. BITMAP uses cropped packed width.',
    });
  }

  return bits;
}

/** ViewShot PNG → packed BITMAP PNG (same raster encoded to TSPL). */
export function mapCapturePngToPackedPng(
  base64: string,
  widthMm: number,
  heightMm: number,
  dpi: number,
): { pngBase64: string; geometry: ReturnType<typeof createPrintGeometry>; pngW: number; pngH: number } {
  const geometry = createPrintGeometry(widthMm, heightMm, dpi);
  const gray = pngBase64ToGray(base64);
  const packed = prepareEditorGrayForPrint(
    gray,
    geometry.sizeDotsW,
    geometry.sizeDotsH,
    geometry.bitmapDotsW,
    geometry.bitmapDotsH,
  );
  logPrintTrace('PACKED_PREVIEW', {
    sizeCommand: geometry.sizeCommand,
    pngW: gray.width,
    pngH: gray.height,
    packedW: packed.width,
    packedH: packed.height,
    sizeDotsW: geometry.sizeDotsW,
    sizeDotsH: geometry.sizeDotsH,
    bitmapDotsW: geometry.bitmapDotsW,
    bytesPerRow: geometry.bytesPerRow,
    dpi,
  });
  return {
    pngBase64: grayToPngBase64(packed),
    geometry,
    pngW: gray.width,
    pngH: gray.height,
  };
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
    dpi?: number;
    fitArtwork?: boolean;
  },
): BitRaster {
  const t0 = Date.now();
  const inputLen = base64.length;

  let gray = pngBase64ToGray(base64);
  const tDecode = Date.now();
  const dpi = options.dpi ?? getPrinterManager().getPrintDpi();
  const expected = printContentSize(options.widthMm, options.heightMm, dpi);

  logPrintTrace('EDITOR_PNG_SIZE', {
    pngW: gray.width,
    pngH: gray.height,
    sizeW: expected.widthPx,
    sizeH: expected.heightPx,
    match: gray.width === expected.widthPx && gray.height === expected.heightPx ? 1 : 0,
    dpi,
    widthMm: options.widthMm,
    heightMm: options.heightMm,
  });

  console.info(
    '[print-job] rasterize: PNG decoded →', gray.width, '×', gray.height,
    '| expected SIZE', expected.widthPx, '×', expected.heightPx,
    '| base64:', Math.round(inputLen / 1024), 'KB',
    '| decode:', tDecode - t0, 'ms',
    '| label:', options.widthMm.toFixed(2), '×', options.heightMm.toFixed(2), 'mm',
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
    dpi,
    fitArtwork: options.fitArtwork,
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
    dpi?: number;
  },
): Uint8Array {
  const manager = getPrinterManager();
  const dpi = options.dpi ?? manager.getPrintDpi();
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
    const tspl = inspectTsplJob(job);
    logPrintTrace('TSPL_COMMAND', {
      size: tspl.sizeCommand,
      gap: tspl.gapCommand,
      direction: tspl.directionCommand,
      reference: tspl.referenceCommand,
      bitmap: tspl.bitmapCommand,
      bitmapWidthBytes: tspl.bitmapWidthBytes,
      bitmapHeightDots: tspl.bitmapHeightDots,
      payloadBytes: tspl.payloadBytes,
      rawByteLength: tspl.totalBytes,
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
