import { dotsPerMm } from '@/lib/printer/print-spec';

/** Same packed-page math as printPngLabelNative / packedPageDots. */
export function td404PackedPageDots(
  widthMm: number,
  heightMm: number,
  dpi: number,
): { sizeDotsW: number; sizeDotsH: number; packedW: number; packedH: number } {
  const dpm = dotsPerMm(dpi);
  const sizeDotsW = Math.max(1, Math.round(widthMm * dpm));
  const sizeDotsH = Math.max(1, Math.round(heightMm * dpm));
  const packedW = Math.max(8, Math.floor(sizeDotsW / 8) * 8);
  return { sizeDotsW, sizeDotsH, packedW, packedH: sizeDotsH };
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

/** Reject mismatched buffers; never pad or truncate. */
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
