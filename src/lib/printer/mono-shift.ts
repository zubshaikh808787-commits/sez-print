/**
 * TSPL REFERENCE only takes a non-negative origin on TD-404 firmware, so a
 * negative H/V is applied by moving the logical 1bpp image (1 = ink) left/up
 * by that many dots. Columns/rows pushed past the left/top edge would land
 * off the label anyway; the vacated right/bottom edge is white.
 */
export function shiftMonoTowardOrigin(
  mono: Uint8Array,
  bytesPerRow: number,
  heightDots: number,
  shiftLeftDots: number,
  shiftUpDots: number,
): Uint8Array {
  const dx = Math.max(0, Math.round(shiftLeftDots));
  const dy = Math.max(0, Math.round(shiftUpDots));
  if (dx === 0 && dy === 0) return mono;
  const widthDots = bytesPerRow * 8;
  const out = new Uint8Array(bytesPerRow * heightDots);
  for (let y = 0; y + dy < heightDots; y++) {
    const src = (y + dy) * bytesPerRow;
    const dst = y * bytesPerRow;
    for (let x = 0; x + dx < widthDots; x++) {
      const sx = x + dx;
      if ((mono[src + (sx >> 3)] >> (7 - (sx & 7))) & 1) {
        out[dst + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }
  return out;
}

/** Split a signed REFERENCE into the non-negative origin sent and the image shift. */
export function splitSignedReference(xDots: number, yDots: number): {
  xDots: number;
  yDots: number;
  shiftLeftDots: number;
  shiftUpDots: number;
  requestedX: number;
  requestedY: number;
} {
  const requestedX = Math.round(xDots);
  const requestedY = Math.round(yDots);
  return {
    xDots: Math.max(0, requestedX),
    yDots: Math.max(0, requestedY),
    shiftLeftDots: Math.max(0, -requestedX),
    shiftUpDots: Math.max(0, -requestedY),
    requestedX,
    requestedY,
  };
}

/** Apply signed REFERENCE on wire: shift 1bpp ink when origin would be negative. */
export function applySignedReferenceToMono(
  monoBytes: Uint8Array,
  bytesPerRow: number,
  heightDots: number,
  xOffsetDots: number,
  yOffsetDots: number,
): {
  monoBytes: Uint8Array;
  xDots: number;
  yDots: number;
  requestedX: number;
  requestedY: number;
} {
  const split = splitSignedReference(xOffsetDots, yOffsetDots);
  const shifted =
    split.shiftLeftDots || split.shiftUpDots
      ? shiftMonoTowardOrigin(monoBytes, bytesPerRow, heightDots, split.shiftLeftDots, split.shiftUpDots)
      : monoBytes;
  return {
    monoBytes: shifted,
    xDots: split.xDots,
    yDots: split.yDots,
    requestedX: split.requestedX,
    requestedY: split.requestedY,
  };
}
