import { createUniversalPrintLayout } from '@/lib/printer/print-spec';
import { padMono1bppToBytesPerRow } from '@/printing/raster/bit-packer';

/** Same packed-page math as createUniversalPrintLayout / BITMAP pack-up. */
export function td404PackedPageDots(
  widthMm: number,
  heightMm: number,
  dpi: number,
): { sizeDotsW: number; sizeDotsH: number; packedW: number; packedH: number } {
  const layout = createUniversalPrintLayout(widthMm, heightMm, dpi);
  return {
    sizeDotsW: layout.sizeDotsW,
    sizeDotsH: layout.sizeDotsH,
    packedW: layout.bitmapDotsW,
    packedH: layout.bitmapDotsH,
  };
}

export type Td404MonoBufferCheck = {
  monoBytes: Uint8Array;
  widthDots: number;
  heightDots: number;
  bytesPerRow: number;
  widthMm: number;
  heightMm: number;
  dpi: number;
};

/**
 * TSPL BITMAP width is bytes×8. Sizes like 99 mm (1188 dots) are not a
 * multiple of 8. Pad white on the right up to packedW so every millimetre
 * size can print. Never shift the left edge.
 */
export function normalizeTd404MonoBuffer(args: Td404MonoBufferCheck): Td404MonoBufferCheck {
  const { packedW, packedH } = td404PackedPageDots(args.widthMm, args.heightMm, args.dpi);
  const destBpr = packedW / 8;
  const srcBpr = Math.max(1, args.bytesPerRow | 0);
  const height = args.heightDots | 0;
  if (height !== packedH) {
    throw new Error(
      `TD-404 mono heightDots (${args.heightDots}) != packedH (${packedH}) for ${args.widthMm}x${args.heightMm}mm @ ${args.dpi} dpi`,
    );
  }
  const monoBytes = padMono1bppToBytesPerRow(args.monoBytes, srcBpr, packedH, destBpr);
  return {
    ...args,
    widthDots: packedW,
    heightDots: packedH,
    bytesPerRow: destBpr,
    monoBytes,
  };
}

/** Reject mismatched buffers after normalizeTd404MonoBuffer. */
export function assertTd404MonoBuffer(args: Td404MonoBufferCheck): void {
  const { packedW, packedH } = td404PackedPageDots(args.widthMm, args.heightMm, args.dpi);
  if (args.bytesPerRow * 8 !== packedW) {
    throw new Error(
      `TD-404 mono buffer bytesPerRow*8 (${args.bytesPerRow * 8}) != packedW (${packedW}) for ${args.widthMm}x${args.heightMm}mm @ ${args.dpi} dpi`,
    );
  }
  if (args.widthDots !== packedW) {
    throw new Error(`TD-404 mono widthDots (${args.widthDots}) != packedW (${packedW})`);
  }
  if (args.heightDots !== packedH) {
    throw new Error(`TD-404 mono heightDots (${args.heightDots}) != packedH (${packedH})`);
  }
  const expectedLen = args.bytesPerRow * args.heightDots;
  if (args.monoBytes.length !== expectedLen) {
    throw new Error(
      `TD-404 mono buffer length ${args.monoBytes.length} != bytesPerRow*heightDots (${expectedLen})`,
    );
  }
}
