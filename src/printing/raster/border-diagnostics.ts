import type { LabelDocument } from '@/lib/label-document';
import { applySignedReferenceToMono } from '@/lib/printer/mono-shift';
import { dotsPerMm, mmToDots } from '@/lib/printer/print-spec';
import {
  diagnoseCanonicalGray,
  formatBorderPrintDiagnostics,
  type BorderPrintDiagnostics,
} from '@/printing/raster/border-measure';
import { unpackMono1bppToGray } from '@/printing/raster/bit-packer';
import type { RasterBitmap } from '@/printing/raster/skia-rasterizer';

export type BorderDiagMedia = {
  gapMm: number;
  hOffsetMm: number;
  vOffsetMm: number;
  referenceDots: { x: number; y: number };
  printerName: string;
};

export type CanonicalBitmapDump = {
  widthDots: number;
  heightDots: number;
  bytesPerRow: number;
  sha256: string;
  pbm: Uint8Array;
};

function sha256Hex(bytes: Uint8Array): string {
  try {
    const { createHash } = require('node:crypto') as typeof import('node:crypto');
    return createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  } catch {
    let h = 0;
    for (let i = 0; i < bytes.length; i++) h = (h * 33 + bytes[i]!) >>> 0;
    return h.toString(16);
  }
}

/** Exact canonical 1bpp as PBM P4 (same bits the print path packs). */
export function encodeCanonicalPbmP4(bitmap: RasterBitmap): Uint8Array {
  const header = `P4\n${bitmap.widthDots} ${bitmap.heightDots}\n`;
  const head = new TextEncoder().encode(header);
  const out = new Uint8Array(head.length + bitmap.mono1bppBuffer.length);
  out.set(head, 0);
  out.set(bitmap.mono1bppBuffer, head.length);
  return out;
}

export function canonicalBitmapDump(bitmap: RasterBitmap): CanonicalBitmapDump {
  return {
    widthDots: bitmap.widthDots,
    heightDots: bitmap.heightDots,
    bytesPerRow: bitmap.bytesPerRow,
    sha256: sha256Hex(bitmap.mono1bppBuffer),
    pbm: encodeCanonicalPbmP4(bitmap),
  };
}

function grayFromBitmap(
  bitmap: RasterBitmap,
  gray?: Uint8Array,
): { gray: Uint8Array; strideDots: number } {
  if (gray && gray.length >= bitmap.widthDots * bitmap.heightDots) {
    return { gray, strideDots: bitmap.widthDots };
  }
  return {
    gray: unpackMono1bppToGray(
      bitmap.mono1bppBuffer,
      bitmap.widthDots,
      bitmap.heightDots,
      bitmap.bytesPerRow,
    ),
    strideDots: bitmap.widthDots,
  };
}

/**
 * Pre-send border check against the SAME gray/mono the print path will send
 * (canonical bitmap, before negative-H/V firmware workaround).
 */
export function collectBorderPrintDiagnostics(
  doc: LabelDocument,
  dpi: number,
  bitmap: RasterBitmap,
  media: BorderDiagMedia,
  gray?: Uint8Array,
): BorderPrintDiagnostics {
  const src = grayFromBitmap(bitmap, gray);
  const borders = diagnoseCanonicalGray(doc, dpi, src.gray, src.strideDots);
  const layer = borders.length === 0 || borders.every((b) => b.withinOneDot) ? 'match' : 'raster_mismatch';
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
    source: 'canonical',
    layer,
    borders,
  };
}

/** Whole-print firmware workaround: only negative H/V may change bits. */
export function logCanonicalVsWire(
  bitmap: RasterBitmap,
  xOffsetDots: number,
  yOffsetDots: number,
): { shifted: boolean; sameBits: boolean } {
  const ref = applySignedReferenceToMono(
    bitmap.mono1bppBuffer,
    bitmap.bytesPerRow,
    bitmap.heightDots,
    xOffsetDots,
    yOffsetDots,
  );
  const shifted = ref.requestedX < 0 || ref.requestedY < 0;
  let sameBits = ref.monoBytes.length === bitmap.mono1bppBuffer.length;
  if (sameBits) {
    for (let i = 0; i < bitmap.mono1bppBuffer.length; i++) {
      if (ref.monoBytes[i] !== bitmap.mono1bppBuffer[i]) {
        sameBits = false;
        break;
      }
    }
  }
  console.info(
    `[BORDER-DIAG] wire vs canonical shifted=${shifted} sameBits=${sameBits} ` +
      `REFERENCE sent=${ref.xDots},${ref.yDots} requested=${ref.requestedX},${ref.requestedY}`,
  );
  return { shifted, sameBits };
}

export function logBorderPrintDiagnostics(
  doc: LabelDocument,
  dpi: number,
  bitmap: RasterBitmap,
  media: BorderDiagMedia,
  gray?: Uint8Array,
): BorderPrintDiagnostics | null {
  try {
    const diag = collectBorderPrintDiagnostics(doc, dpi, bitmap, media, gray);
    if (diag.borders.length > 0) console.info(formatBorderPrintDiagnostics(diag));
    logCanonicalVsWire(bitmap, media.referenceDots.x, media.referenceDots.y);
    return diag;
  } catch (err) {
    console.warn('[BORDER-DIAG] skipped:', err);
    return null;
  }
}

/** Dev-only dump of the canonical 1bpp actually about to be sent. */
export async function exportCanonicalBitmapIfDev(
  bitmap: RasterBitmap,
  tag: string,
): Promise<string | null> {
  if (typeof __DEV__ !== 'undefined' && !__DEV__) return null;
  try {
    const dump = canonicalBitmapDump(bitmap);
    const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
    const dir = FileSystem.documentDirectory;
    if (!dir) return null;
    const safe = tag.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 48);
    const path = `${dir}border-canonical-${safe}-${dump.sha256}.pbm`;
    const bytes = dump.pbm;
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    const base64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64');
    await FileSystem.writeAsStringAsync(path, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    console.info(`[BORDER-DIAG] exported canonical bitmap ${path} sha=${dump.sha256}`);
    return path;
  } catch (err) {
    console.warn('[BORDER-DIAG] export skipped:', err);
    return null;
  }
}
