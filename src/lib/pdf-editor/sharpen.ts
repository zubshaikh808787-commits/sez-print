import { sharpnessAmount } from '@/lib/pdf-editor/session';

/**
 * Unsharp mask on RGBA (4 bytes/pixel, row-major).
 * amount maps from the 0–100 slider (0 = identity).
 */
export function unsharpRgba(
  src: Uint8Array,
  width: number,
  height: number,
  slider0to100: number,
  radiusPx = 1,
): Uint8Array {
  const amount = sharpnessAmount(slider0to100);
  if (amount <= 0 || width < 3 || height < 3) return src;

  const blurred = boxBlurRgba(src, width, height, Math.max(1, Math.round(radiusPx)));
  const out = new Uint8Array(src.length);
  for (let i = 0; i < src.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const o = src[i + c];
      const b = blurred[i + c];
      out[i + c] = clampByte(o + amount * (o - b));
    }
    out[i + 3] = src[i + 3];
  }
  return out;
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function boxBlurRgba(src: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const tmp = new Uint8Array(src.length);
  const out = new Uint8Array(src.length);
  const w = radius * 2 + 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let dx = -radius; dx <= radius; dx++) {
        const xx = Math.min(width - 1, Math.max(0, x + dx));
        const i = (y * width + xx) * 4;
        r += src[i];
        g += src[i + 1];
        b += src[i + 2];
        a += src[i + 3];
        n++;
      }
      const o = (y * width + x) * 4;
      tmp[o] = r / n;
      tmp[o + 1] = g / n;
      tmp[o + 2] = b / n;
      tmp[o + 3] = a / n;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = Math.min(height - 1, Math.max(0, y + dy));
        const i = (yy * width + x) * 4;
        r += tmp[i];
        g += tmp[i + 1];
        b += tmp[i + 2];
        a += tmp[i + 3];
        n++;
      }
      const o = (y * width + x) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = a / n;
    }
  }
  void w;
  return out;
}

export const GRAYSCALE_COLOR_MATRIX = [
  0.299, 0.587, 0.114, 0, 0,
  0.299, 0.587, 0.114, 0, 0,
  0.299, 0.587, 0.114, 0, 0,
  0, 0, 0, 1, 0,
];

/** Grayscale + contrast boost for live sharpness preview. Export uses unsharpRgba. */
export function sharpnessPreviewMatrix(slider0to100: number): number[] {
  const norm = Math.min(100, Math.max(0, slider0to100)) / 100;
  if (norm <= 0) {
    return GRAYSCALE_COLOR_MATRIX;
  }
  // Contrast factor scaling from 1.0 at 0% up to 1.8 at 100% for crisp edges
  const c = 1 + norm * 0.8;
  // In Skia ColorMatrix, color channels are normalized [0.0, 1.0] floats. Pivot around 0.5.
  const intercept = 0.5 * (1 - c);
  const r = 0.299 * c;
  const g = 0.587 * c;
  const b = 0.114 * c;
  return [
    r, g, b, 0, intercept,
    r, g, b, 0, intercept,
    r, g, b, 0, intercept,
    0, 0, 0, 1, 0,
  ];
}


