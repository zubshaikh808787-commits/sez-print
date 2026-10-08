import type { LabelDocument } from '@/lib/label-document';
import { dotsPerMm, mmToDots } from '@/lib/printer/print-spec';
import {
  diagnoseBorders,
  formatBorderPrintDiagnostics,
  type BorderPrintDiagnostics,
} from '@/printing/raster/border-measure';
import type { RasterBitmap } from '@/printing/raster/skia-rasterizer';
import { rasterizeDocumentToBitmapTimed } from '@/printing/raster/skia-rasterizer';

/**
 * Pre-send border check: rasterize each border alone (dot-buffer, so text/QR
 * ink cannot enter the box) and compare its outer ink to the document rectangle.
 */
export function collectBorderPrintDiagnostics(
  doc: LabelDocument,
  dpi: number,
  bitmap: Pick<RasterBitmap, 'widthDots' | 'heightDots' | 'bytesPerRow'>,
  media: {
    gapMm: number;
    hOffsetMm: number;
    vOffsetMm: number;
    referenceDots: { x: number; y: number };
    printerName: string;
  },
): BorderPrintDiagnostics {
  const borders = diagnoseBorders(doc, dpi, (el) => {
    const t = rasterizeDocumentToBitmapTimed({ ...doc, elements: [el] }, dpi, {
      threshold: 160,
      backend: 'dot-buffer',
    });
    return { gray: t.gray, strideDots: t.result.widthDots };
  });
  return {
    widthMm: doc.widthMm,
    heightMm: doc.heightMm,
    dpi,
    dotsPerMm: dotsPerMm(dpi),
    sizeDotsW: mmToDots(doc.widthMm, dpi),
    sizeDotsH: mmToDots(doc.heightMm, dpi),
    bitmapWidthDots: bitmap.widthDots,
    bitmapBytesPerRow: bitmap.bytesPerRow,
    bitmapHeightDots: bitmap.heightDots,
    gapMm: media.gapMm,
    hOffsetMm: media.hOffsetMm,
    vOffsetMm: media.vOffsetMm,
    referenceDots: media.referenceDots,
    printerName: media.printerName,
    td404BorderCorrection: false,
    borders,
  };
}

export function logBorderPrintDiagnostics(
  ...args: Parameters<typeof collectBorderPrintDiagnostics>
): BorderPrintDiagnostics | null {
  try {
    const diag = collectBorderPrintDiagnostics(...args);
    if (diag.borders.length > 0) console.info(formatBorderPrintDiagnostics(diag));
    return diag;
  } catch (err) {
    console.warn('[BORDER-DIAG] skipped:', err);
    return null;
  }
}
