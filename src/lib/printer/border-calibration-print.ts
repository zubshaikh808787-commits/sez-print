import { getPrinterManager } from '@/lib/printer/printer-manager';
import { createPrintSpec } from '@/lib/printer/print-spec';
import { buildBorderCalibrationDocument } from '@/printing/raster/border-calibration-label';
import {
  exportCanonicalBitmapIfDev,
  logBorderPrintDiagnostics,
} from '@/printing/raster/border-diagnostics';
import type { BorderPrintDiagnostics } from '@/printing/raster/border-measure';
import { ensurePrintTypefaces } from '@/printing/raster/print-typeface';
import { rasterizeDocumentToBitmapTimed } from '@/printing/raster/skia-rasterizer';

export type BorderCalibrationPrintOptions = {
  widthMm: number;
  heightMm: number;
  dpi: number;
  gapMm: number;
  hOffsetMm: number;
  vOffsetMm: number;
  media?: 'gap' | 'bline' | 'continuous';
  density?: number | null;
  speed?: number | null;
  direction?: 0 | 1;
  printerName?: string;
};

/**
 * Border isolation print: 2 mm border element (product path), rulers, and TL mark.
 * centre lines, corner marks, 1 mm rulers, and a "TL" mark. Sent through the
 * same headless raster + printMonoLabel path as a normal label.
 */
export async function printBorderCalibrationTest(
  opts: BorderCalibrationPrintOptions,
): Promise<{ sent: boolean; diagnostics: BorderPrintDiagnostics | null }> {
  const manager = getPrinterManager();
  if (!manager.usesTd404CommandSet) {
    throw new Error('Border calibration test needs a TD-404 printer.');
  }
  const doc = buildBorderCalibrationDocument(opts.widthMm, opts.heightMm, {
    dpi: opts.dpi,
    gapMm: opts.gapMm,
    hOffsetMm: opts.hOffsetMm,
    vOffsetMm: opts.vOffsetMm,
  });
  await ensurePrintTypefaces();
  const timed = rasterizeDocumentToBitmapTimed(doc, opts.dpi, { threshold: 160 });
  const bitmap = timed.result;
  const spec = createPrintSpec({
    widthMm: doc.widthMm,
    heightMm: doc.heightMm,
    dpi: opts.dpi,
    profile: manager.getActivePrinterProfile(),
    mediaType: opts.media ?? 'gap',
    gapMm: opts.gapMm,
    calibration: { horizontalOffsetMm: opts.hOffsetMm, verticalOffsetMm: opts.vOffsetMm },
  });
  const diagnostics = logBorderPrintDiagnostics(
    doc,
    opts.dpi,
    bitmap,
    {
      gapMm: opts.gapMm,
      hOffsetMm: opts.hOffsetMm,
      vOffsetMm: opts.vOffsetMm,
      referenceDots: { x: spec.xOffsetDots, y: spec.yOffsetDots },
      printerName: opts.printerName ?? 'unknown',
    },
    timed.gray,
  );
  void exportCanonicalBitmapIfDev(bitmap, `cal-${doc.widthMm}x${doc.heightMm}`);
  const sent = await manager.printMonoLabelFast({
    monoBytes: bitmap.mono1bppBuffer,
    widthDots: bitmap.widthDots,
    heightDots: bitmap.heightDots,
    bytesPerRow: bitmap.bytesPerRow,
    widthMm: doc.widthMm,
    heightMm: doc.heightMm,
    gapMm: opts.gapMm,
    copies: 1,
    density: opts.density,
    speed: opts.speed,
    vOffsetMm: opts.vOffsetMm,
    hOffsetMm: opts.hOffsetMm,
    media: opts.media ?? 'gap',
    dpi: opts.dpi,
    direction: opts.direction ?? 1,
  });
  return { sent, diagnostics };
}
