import type { AxisDpi } from '@/printing/geometry/units';
import type { GrayBitmap, MediaShapeKind } from '@/printing/document/types';

export type { GrayBitmap };

export type RenderedBitmap = {
  widthDots: number;
  heightDots: number;
  dpiX: number;
  dpiY: number;
  pixelFormat: '1bpp' | '8bpp';
  data: Uint8Array;
  bytesPerRow?: number;
};

export function createWhiteGray(width: number, height: number): GrayBitmap {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const gray = new Uint8Array(w * h);
  gray.fill(255);
  return { width: w, height: h, gray };
}

export function blitGray(
  dest: GrayBitmap,
  src: GrayBitmap,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  mode: 'fit' | 'fill' | 'stretch' | 'original',
): void {
  const destW = dest.width;
  const destH = dest.height;
  const boxX = Math.round(dx);
  const boxY = Math.round(dy);
  const boxW = Math.max(1, Math.round(dw));
  const boxH = Math.max(1, Math.round(dh));

  let dwOut = boxW;
  let dhOut = boxH;
  let ox = boxX;
  let oy = boxY;

  if (mode === 'original') {
    dwOut = src.width;
    dhOut = src.height;
    ox = boxX + Math.floor((boxW - dwOut) / 2);
    oy = boxY + Math.floor((boxH - dhOut) / 2);
  } else if (mode === 'fit') {
    const scale = Math.min(boxW / Math.max(src.width, 1), boxH / Math.max(src.height, 1));
    dwOut = Math.max(1, Math.round(src.width * scale));
    dhOut = Math.max(1, Math.round(src.height * scale));
    ox = boxX + Math.floor((boxW - dwOut) / 2);
    oy = boxY + Math.floor((boxH - dhOut) / 2);
  } else if (mode === 'fill') {
    const scale = Math.max(boxW / Math.max(src.width, 1), boxH / Math.max(src.height, 1));
    dwOut = Math.max(1, Math.round(src.width * scale));
    dhOut = Math.max(1, Math.round(src.height * scale));
    ox = boxX + Math.floor((boxW - dwOut) / 2);
    oy = boxY + Math.floor((boxH - dhOut) / 2);
  }

  const xMap = new Int32Array(dwOut);
  const yMap = new Int32Array(dhOut);
  const srcW = src.width;
  const srcH = src.height;
  // Edge-to-edge: dest 0 and dest last sample src 0 and src last.
  // Center sampling ((x+0.5)*src/dest) skipped the outer source pixels and
  // printed the imported border inside the label.
  const mapAxis = (destSize: number, srcSize: number, out: Int32Array) => {
    if (destSize <= 1 || srcSize <= 1) {
      out.fill(0);
      return;
    }
    const last = srcSize - 1;
    for (let i = 0; i < destSize; i++) {
      out[i] = Math.min(last, Math.round((i * last) / (destSize - 1)));
    }
  };
  mapAxis(dwOut, srcW, xMap);
  mapAxis(dhOut, srcH, yMap);

  const srcGray = src.gray;
  const destGray = dest.gray;
  for (let y = 0; y < dhOut; y++) {
    const py = oy + y;
    if (py < 0 || py >= destH) continue;
    const srcRow = yMap[y] * srcW;
    const destRow = py * destW;
    for (let x = 0; x < dwOut; x++) {
      const px = ox + x;
      if (px < 0 || px >= destW) continue;
      destGray[destRow + px] = srcGray[srcRow + xMap[x]];
    }
  }
}

export function fillRect(dest: GrayBitmap, x: number, y: number, w: number, h: number, value: number): void {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(dest.width, Math.round(x + w));
  const y1 = Math.min(dest.height, Math.round(y + h));
  const v = Math.max(0, Math.min(255, value));
  for (let py = y0; py < y1; py++) {
    const row = py * dest.width;
    dest.gray.fill(v, row + x0, row + x1);
  }
}

/** Outline in dots. Stroke is inset so a full-page border stays inside SIZE. */
export function strokeRect(
  dest: GrayBitmap,
  x: number,
  y: number,
  w: number,
  h: number,
  strokeDots: number,
  value: number,
): void {
  const s = Math.max(1, Math.round(strokeDots));
  fillRect(dest, x, y, w, s, value);
  fillRect(dest, x, y + h - s, w, s, value);
  fillRect(dest, x, y, s, h, value);
  fillRect(dest, x + w - s, y, s, h, value);
}

export function fillEllipse(dest: GrayBitmap, x: number, y: number, w: number, h: number, value: number): void {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = Math.max(0.5, w / 2);
  const ry = Math.max(0.5, h / 2);
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(dest.width, Math.ceil(x + w));
  const y1 = Math.min(dest.height, Math.ceil(y + h));
  const v = Math.max(0, Math.min(255, value));
  for (let py = y0; py < y1; py++) {
    const ny = (py + 0.5 - cy) / ry;
    const row = py * dest.width;
    for (let px = x0; px < x1; px++) {
      const nx = (px + 0.5 - cx) / rx;
      if (nx * nx + ny * ny <= 1) dest.gray[row + px] = v;
    }
  }
}

export function applyShapeMask(
  dest: GrayBitmap,
  shape: MediaShapeKind,
  cornerRadiusDots?: number,
): void {
  if (shape === 'rectangle' || shape === 'diecut' || shape === 'custom') return;
  const { width, height, gray } = dest;
  const cx = width / 2;
  const cy = height / 2;
  if (shape === 'circle' || shape === 'ellipse') {
    const rx = shape === 'circle' ? Math.min(width, height) / 2 : width / 2;
    const ry = shape === 'circle' ? rx : height / 2;
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        const nxx = (x + 0.5 - cx) / Math.max(rx, 0.5);
        const nyy = (y + 0.5 - cy) / Math.max(ry, 0.5);
        if (nxx * nxx + nyy * nyy > 1) gray[row + x] = 255;
      }
    }
    return;
  }
  if (shape === 'roundedRectangle') {
    const r =
      cornerRadiusDots != null && cornerRadiusDots > 0
        ? Math.min(cornerRadiusDots, Math.min(width, height) / 2)
        : Math.min(width, height) * 0.1;
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        const inX = x + 0.5;
        const inY = y + 0.5;
        let dx = 0;
        let dy = 0;
        if (inX < r) dx = r - inX;
        else if (inX > width - r) dx = inX - (width - r);
        if (inY < r) dy = r - inY;
        else if (inY > height - r) dy = inY - (height - r);
        if (dx > 0 && dy > 0 && dx * dx + dy * dy > r * r) gray[row + x] = 255;
      }
    }
  }
}

export function thresholdGray(src: GrayBitmap, threshold = 128): RenderedBitmap {
  const bytesPerRow = Math.ceil(src.width / 8);
  const data = new Uint8Array(bytesPerRow * src.height);
  const t = Math.max(0, Math.min(255, threshold));
  const { width, height, gray } = src;
  for (let y = 0; y < height; y++) {
    const srcRow = y * width;
    const destRow = y * bytesPerRow;
    for (let x = 0; x < width; x++) {
      if (gray[srcRow + x] < t) {
        data[destRow + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }
  return {
    widthDots: width,
    heightDots: height,
    dpiX: 0,
    dpiY: 0,
    pixelFormat: '1bpp',
    data,
    bytesPerRow,
  };
}

/** Floyd–Steinberg. Do not use for barcodes, QR, or text. */
export function ditherGray(src: GrayBitmap): GrayBitmap {
  const { width, height } = src;
  const gray = Int16Array.from(src.gray);
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const old = Math.max(0, Math.min(255, gray[i]));
      const next = old < 128 ? 0 : 255;
      out[i] = next;
      const err = old - next;
      if (x + 1 < width) gray[i + 1] += (err * 7) / 16;
      if (y + 1 < height) {
        if (x > 0) gray[i + width - 1] += (err * 3) / 16;
        gray[i + width] += (err * 5) / 16;
        if (x + 1 < width) gray[i + width + 1] += (err * 1) / 16;
      }
    }
  }
  return { width, height, gray: out };
}

export function flipGrayVertical(src: GrayBitmap): GrayBitmap {
  const { width, height, gray } = src;
  const out = new Uint8Array(gray.length);
  for (let y = 0; y < height; y++) {
    out.set(gray.subarray(y * width, y * width + width), (height - 1 - y) * width);
  }
  return { width, height, gray: out };
}

export function cropGrayRight(src: GrayBitmap, widthDots: number, heightDots: number): GrayBitmap {
  const w = Math.max(1, widthDots);
  const h = Math.max(1, heightDots);
  if (src.width === w && src.height === h) return src;
  const out = createWhiteGray(w, h);
  const copyW = Math.min(src.width, w);
  const copyH = Math.min(src.height, h);
  for (let y = 0; y < copyH; y++) {
    out.gray.set(src.gray.subarray(y * src.width, y * src.width + copyW), y * w);
  }
  return out;
}

export function withDpi(bitmap: RenderedBitmap, axis: AxisDpi): RenderedBitmap {
  return { ...bitmap, dpiX: axis.dpiX, dpiY: axis.dpiY };
}
