/**
 * TSPL BITMAP payload: wire polarity black=0 (bit clear), white=1 (bit set).
 */

export function unpackWireMono1bppToGray(
  wire: Uint8Array,
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
      const bit = wire[srcRow + (x >> 3)] & (0x80 >> (x & 7));
      if (!bit) gray[destRow + x] = 0;
    }
  }
  return gray;
}

export function decodeBase64ToBytes(b64: string): Uint8Array {
  const bin = globalThis.atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export type InkBBox = { x0: number; y0: number; x1: number; y1: number; ink: number } | null;

export function inkBoundingBox(
  gray: Uint8Array,
  width: number,
  height: number,
  box: { x: number; y: number; w: number; h: number },
  threshold = 160,
): InkBBox {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  let ink = 0;
  const xStart = Math.max(0, Math.floor(box.x));
  const yStart = Math.max(0, Math.floor(box.y));
  const xEnd = Math.min(width, Math.ceil(box.x + box.w));
  const yEnd = Math.min(height, Math.ceil(box.y + box.h));
  for (let y = yStart; y < yEnd; y++) {
    for (let x = xStart; x < xEnd; x++) {
      if (gray[y * width + x] < threshold) {
        ink += 1;
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  if (ink === 0) return null;
  return { x0, y0, x1, y1, ink };
}

export function regionDiffPercent(
  a: Uint8Array,
  b: Uint8Array,
  width: number,
  box: { x: number; y: number; w: number; h: number },
  threshold = 160,
): { pixels: number; differing: number; percent: number } {
  let pixels = 0;
  let differing = 0;
  const xStart = Math.max(0, Math.floor(box.x));
  const yStart = Math.max(0, Math.floor(box.y));
  const xEnd = Math.min(width, Math.ceil(box.x + box.w));
  const yEnd = Math.min(a.length / width, Math.ceil(box.y + box.h));
  for (let y = yStart; y < yEnd; y++) {
    for (let x = xStart; x < xEnd; x++) {
      pixels += 1;
      const i = y * width + x;
      if ((a[i] < threshold) !== (b[i] < threshold)) differing += 1;
    }
  }
  return { pixels, differing, percent: pixels ? (100 * differing) / pixels : 0 };
}

export function boxDownscaleGray(src: Uint8Array, srcW: number, srcH: number, scale: number): Uint8Array {
  const s = Math.max(1, Math.round(scale));
  const w = Math.floor(srcW / s);
  const h = Math.floor(srcH / s);
  const out = new Uint8Array(w * h);
  const n = s * s;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let dy = 0; dy < s; dy++) {
        const row = (y * s + dy) * srcW + x * s;
        for (let dx = 0; dx < s; dx++) acc += src[row + dx];
      }
      out[y * w + x] = Math.round(acc / n);
    }
  }
  return out;
}

/** Destination dot is black when more than half the samples are darker than `darkBelow`. */
export function coverageDownscale(
  src: Uint8Array,
  srcW: number,
  srcH: number,
  scale: number,
  darkBelow = 160,
): Uint8Array {
  const s = Math.max(1, Math.round(scale));
  const w = Math.floor(srcW / s);
  const h = Math.floor(srcH / s);
  const out = new Uint8Array(w * h);
  const n = s * s;
  out.fill(255);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let dark = 0;
      for (let dy = 0; dy < s; dy++) {
        const row = (y * s + dy) * srcW + x * s;
        for (let dx = 0; dx < s; dx++) {
          if (src[row + dx] < darkBelow) dark += 1;
        }
      }
      out[y * w + x] = dark / n > 0.5 ? 0 : 255;
    }
  }
  return out;
}

export function thresholdGray(gray: Uint8Array, threshold: number): Uint8Array {
  const out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = gray[i] < threshold ? 0 : 255;
  return out;
}
