import type { LabelDocument } from '@/lib/label-document';
import { pngBase64ToGray } from '@/lib/printer/escpos';
import { mmToDots, tsplPackedWidthDots } from '@/lib/printer/print-spec';
import { packGrayToMono1bpp } from '@/printing/raster/bit-packer';
import { normalizeTd404MonoBuffer } from '@/printing/raster/td404-mono-validate';
import { stampPrintBordersOnGray } from '@/printing/raster/print-border';
import type { RasterBitmap } from '@/printing/raster/skia-rasterizer';

export function padGrayRight(
  gray: Uint8Array,
  srcW: number,
  srcH: number,
  destW: number,
  destH: number,
): Uint8Array {
  if (srcW === destW && srcH === destH) return gray;
  const out = new Uint8Array(destW * destH);
  out.fill(255);
  const copyW = Math.min(srcW, destW);
  const copyH = Math.min(srcH, destH);
  for (let y = 0; y < copyH; y++) {
    out.set(gray.subarray(y * srcW, y * srcW + copyW), y * destW);
  }
  return out;
}

/**
 * ViewShot PNG (no border layer) → pad-up gray → stamp integer borders → 1-bit.
 * Keeps photos/signatures from resampling the border.
 */
export function rasterizeViewShotPngWithStampedBorders(
  pngBase64: string,
  doc: LabelDocument,
  dpi: number,
  threshold = 160,
): RasterBitmap {
  const src = pngBase64ToGray(pngBase64);
  const sizeW = mmToDots(doc.widthMm, dpi);
  const sizeH = mmToDots(doc.heightMm, dpi);
  const packedW = tsplPackedWidthDots(sizeW);
  const packedH = sizeH;
  const gray = padGrayRight(src.gray, src.width, src.height, packedW, packedH);
  stampPrintBordersOnGray(gray, packedW, packedH, doc, dpi, {
    labelWidthDots: sizeW,
    labelHeightDots: sizeH,
  });
  const packed = packGrayToMono1bpp(gray, packedW, packedH, threshold);
  const finalized = normalizeTd404MonoBuffer({
    monoBytes: packed.mono1bppBuffer,
    widthDots: packedW,
    heightDots: packedH,
    bytesPerRow: packed.bytesPerRow,
    widthMm: doc.widthMm,
    heightMm: doc.heightMm,
    dpi,
  });
  return {
    widthDots: finalized.widthDots,
    heightDots: finalized.heightDots,
    bytesPerRow: finalized.bytesPerRow,
    mono1bppBuffer: finalized.monoBytes,
  };
}
