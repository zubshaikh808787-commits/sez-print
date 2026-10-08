/**
 * Task 4.2 — 1-bit packer. Logical buffer: set bit = black (ink), MSB first.
 * TSPL wire invert (black = 0) is Stage B only.
 */

export function packGrayToMono1bpp(
  gray: Uint8Array,
  width: number,
  height: number,
  threshold = 160,
  out?: Uint8Array,
): { bytesPerRow: number; mono1bppBuffer: Uint8Array } {
  const w = Math.max(1, width | 0);
  const h = Math.max(1, height | 0);
  const bytesPerRow = Math.ceil(w / 8);
  const needed = bytesPerRow * h;
  const mono1bppBuffer = out && out.length === needed ? out : new Uint8Array(needed);
  if (out && out.length === needed) mono1bppBuffer.fill(0);
  const t = Math.max(0, Math.min(255, threshold));
  for (let y = 0; y < h; y++) {
    const srcRow = y * w;
    const destRow = y * bytesPerRow;
    for (let x = 0; x < w; x++) {
      if (gray[srcRow + x] < t) {
        mono1bppBuffer[destRow + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }
  return { bytesPerRow, mono1bppBuffer };
}

/** Pad (white) or crop the right so each row is destBytesPerRow. Logical 1bpp: 0 = white. */
export function padMono1bppToBytesPerRow(
  data: Uint8Array,
  srcBytesPerRow: number,
  height: number,
  destBytesPerRow: number,
): Uint8Array {
  const srcBpr = Math.max(1, srcBytesPerRow | 0);
  const destBpr = Math.max(1, destBytesPerRow | 0);
  const h = Math.max(1, height | 0);
  if (srcBpr === destBpr && data.length === destBpr * h) return data;
  const out = new Uint8Array(destBpr * h);
  const copy = Math.min(srcBpr, destBpr);
  for (let y = 0; y < h; y++) {
    const srcOff = y * srcBpr;
    out.set(data.subarray(srcOff, srcOff + Math.min(copy, Math.max(0, data.length - srcOff))), y * destBpr);
  }
  return out;
}

/** Expand logical 1-bit (MSB, black=1) to 8-bit luminance for decoders. */
export function unpackMono1bppToGray(
  packed: Uint8Array,
  width: number,
  height: number,
  bytesPerRow: number,
): Uint8Array {
  const gray = new Uint8Array(width * height);
  gray.fill(255);
  for (let y = 0; y < height; y++) {
    const srcRow = y * bytesPerRow;
    const destRow = y * width;
    for (let x = 0; x < width; x++) {
      const bit = packed[srcRow + (x >> 3)] & (0x80 >> (x & 7));
      if (bit) gray[destRow + x] = 0;
    }
  }
  return gray;
}
