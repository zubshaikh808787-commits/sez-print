/**
 * Software darkness for the 1-bit print bitmap. Lines, borders and fills are drawn without
 * anti-aliasing, so moving the threshold alone leaves them identical at every darkness.
 *
 * steps > 0: every stroke gets `steps` dots thicker (1 to 5).
 * steps < 0: the inside of solid areas is thinned in a Bayer pattern; a 1-dot outline stays.
 * Pixels inside `keep` rects (barcodes, QR codes) are never changed and do not seed growth.
 */

import { elementSizeMm, type LabelDocument } from '@/lib/label-document';

export type DotRect = { x0: number; y0: number; w: number; h: number };

/** Printed barcode / QR bounds in mm (rotation included) that darkness must not touch. */
export function scanCodeRectsMm(doc: LabelDocument): DotRect[] {
  const rects: DotRect[] = [];
  for (const el of doc.elements) {
    if (el.type !== 'barcode' && el.type !== 'qrcode') continue;
    if (el.needPrinting === false || el.visible === false) continue;
    const size = elementSizeMm(el);
    const rad = (((el.rotation ?? 0) % 360) * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const w = size.width * cos + size.height * sin;
    const h = size.width * sin + size.height * cos;
    const cx = el.left + size.width / 2;
    const cy = el.top + size.height / 2;
    rects.push({ x0: cx - w / 2, y0: cy - h / 2, w, h });
  }
  return rects;
}

/** mm rects to pixel rects at `pxPerMm`, grown by `marginPx` on every side. */
export function rectsToPx(rects: readonly DotRect[], pxPerMm: number, marginPx = 1): DotRect[] {
  return rects.map((r) => ({
    x0: r.x0 * pxPerMm - marginPx,
    y0: r.y0 * pxPerMm - marginPx,
    w: r.w * pxPerMm + 2 * marginPx,
    h: r.h * pxPerMm + 2 * marginPx,
  }));
}

/** Each darker step thickens strokes by one dot, alternating right/bottom and left/top. */
export const MAX_DARKER_STEPS = 5;
/** Interior dots dropped per lighter step, out of 16. */
export const MAX_LIGHTER_STEPS = 10;
/** Ink touching white edge-on (3 thirds of a dot) is the outline and always kept. */
const OUTLINE_THIRDS = 3;

const BAYER_4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const FAR = 0xffff;

function keepMask(width: number, height: number, keep: readonly DotRect[]): Uint8Array | null {
  if (keep.length === 0) return null;
  const mask = new Uint8Array(width * height);
  for (const r of keep) {
    const x0 = Math.max(0, Math.floor(r.x0));
    const y0 = Math.max(0, Math.floor(r.y0));
    const x1 = Math.min(width, Math.ceil(r.x0 + r.w));
    const y1 = Math.min(height, Math.ceil(r.y0 + r.h));
    for (let y = y0; y < y1; y++) mask.fill(1, y * width + x0, y * width + x1);
  }
  return mask;
}

/**
 * 1-D dilation along one axis: a pixel is set when a seed lies up to `after` pixels before it
 * or `before` pixels after it, so ink spreads `after` toward right/bottom and `before`
 * toward left/top.
 */
function dilate(
  src: Uint8Array,
  width: number,
  height: number,
  axis: 'x' | 'y',
  after: number,
  before: number,
): Uint8Array {
  const out = new Uint8Array(src.length);
  const lines = axis === 'x' ? height : width;
  const len = axis === 'x' ? width : height;
  const lineStep = axis === 'x' ? width : 1;
  const step = axis === 'x' ? 1 : width;
  for (let l = 0; l < lines; l++) {
    const start = l * lineStep;
    let last = -Infinity;
    for (let k = 0; k < len; k++) {
      if (src[start + k * step]) last = k;
      if (k - last <= after) out[start + k * step] = 1;
    }
    last = Infinity;
    for (let k = len - 1; k >= 0; k--) {
      if (src[start + k * step]) last = k;
      if (last - k <= before) out[start + k * step] = 1;
    }
  }
  return out;
}

/** Two-pass 3-4 chamfer distance to the nearest seed pixel. */
function chamfer(seed: Uint8Array, width: number, height: number): Uint16Array {
  const d = new Uint16Array(width * height);
  for (let i = 0; i < d.length; i++) d[i] = seed[i] ? 0 : FAR;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let v = d[i];
      if (v === 0) continue;
      if (x > 0) v = Math.min(v, d[i - 1] + 3);
      if (y > 0) {
        v = Math.min(v, d[i - width] + 3);
        if (x > 0) v = Math.min(v, d[i - width - 1] + 4);
        if (x < width - 1) v = Math.min(v, d[i - width + 1] + 4);
      }
      d[i] = v;
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      let v = d[i];
      if (v === 0) continue;
      if (x < width - 1) v = Math.min(v, d[i + 1] + 3);
      if (y < height - 1) {
        v = Math.min(v, d[i + width] + 3);
        if (x < width - 1) v = Math.min(v, d[i + width + 1] + 4);
        if (x > 0) v = Math.min(v, d[i + width - 1] + 4);
      }
      d[i] = v;
    }
  }
  return d;
}

/** Returns 0/255 gray (black = 0) with darkness applied; the input is not modified. */
export function applyInkDarkness(
  gray: Uint8Array,
  width: number,
  height: number,
  threshold: number,
  steps: number,
  keep: readonly DotRect[] = [],
): Uint8Array {
  const n = width * height;
  const out = new Uint8Array(n);
  const ink = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    ink[i] = gray[i] < threshold ? 1 : 0;
    out[i] = ink[i] ? 0 : 255;
  }
  const s = Math.round(steps);
  if (s === 0) return out;
  const locked = keepMask(width, height, keep);

  if (s > 0) {
    const grow = Math.min(s, MAX_DARKER_STEPS);
    const after = Math.ceil(grow / 2);
    const before = grow - after;
    const seed = new Uint8Array(n);
    for (let i = 0; i < n; i++) seed[i] = ink[i] && !(locked && locked[i]) ? 1 : 0;
    const grown = dilate(dilate(seed, width, height, 'x', after, before), width, height, 'y', after, before);
    for (let i = 0; i < n; i++) {
      if (grown[i] && !(locked && locked[i])) out[i] = 0;
    }
    return out;
  }

  const drop = Math.min(-s, MAX_LIGHTER_STEPS);
  const white = new Uint8Array(n);
  for (let i = 0; i < n; i++) white[i] = ink[i] ? 0 : 1;
  const inner = chamfer(white, width, height);
  for (let y = 0; y < height; y++) {
    const bayerRow = (y & 3) << 2;
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!ink[i] || inner[i] <= OUTLINE_THIRDS || (locked && locked[i])) continue;
      if (BAYER_4[bayerRow | (x & 3)] < drop) out[i] = 255;
    }
  }
  return out;
}
