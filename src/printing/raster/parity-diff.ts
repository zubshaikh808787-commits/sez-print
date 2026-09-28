/**
 * Dev/host dump: packed mono vs flag-off editor-parity gray, pixel diff + overlays.
 */

import { encode as encodePng } from 'fast-png';
import { unpackMono1bppToGray } from './bit-packer';
import type { RasterBitmap } from './skia-rasterizer';
import {
  frozenFixtureRegions,
  type RegionId,
} from './editor-parity-reference';

export type RegionDiff = {
  region: RegionId | 'full';
  pixels: number;
  differing: number;
  percent: number;
};

export type ParityDiffReport = {
  width: number;
  height: number;
  threshold: number;
  full: RegionDiff;
  regions: RegionDiff[];
  confirmed: {
    barGeometry: boolean;
    missingDigits: boolean;
    borderStyle: boolean;
    textPlacement: boolean;
  };
};

const CONFIRM_PCT = 5;

function ink(gray: Uint8Array, i: number, threshold: number): boolean {
  return gray[i] < threshold;
}

export function grayToRgbaPng(gray: Uint8Array, width: number, height: number): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const g = gray[i];
    rgba[i * 4] = g;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = g;
    rgba[i * 4 + 3] = 255;
  }
  return encodePng({ width, height, data: rgba });
}

/** Headless ink red, reference ink blue, both black, neither white. */
export function overlayRgba(
  headless: Uint8Array,
  reference: Uint8Array,
  width: number,
  height: number,
  threshold: number,
  clip?: { x: number; y: number; w: number; h: number },
): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  rgba.fill(255);
  const x0 = clip?.x ?? 0;
  const y0 = clip?.y ?? 0;
  const x1 = clip ? clip.x + clip.w : width;
  const y1 = clip ? clip.y + clip.h : height;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * width + x;
      const o = i * 4;
      const h = ink(headless, i, threshold);
      const r = ink(reference, i, threshold);
      if (h && r) {
        rgba[o] = 0;
        rgba[o + 1] = 0;
        rgba[o + 2] = 0;
      } else if (h) {
        rgba[o] = 220;
        rgba[o + 1] = 32;
        rgba[o + 2] = 32;
      } else if (r) {
        rgba[o] = 32;
        rgba[o + 1] = 64;
        rgba[o + 2] = 220;
      }
    }
  }
  return encodePng({ width, height, data: rgba });
}

function regionDiff(
  headless: Uint8Array,
  reference: Uint8Array,
  width: number,
  region: RegionId | 'full',
  box: { x: number; y: number; w: number; h: number },
  threshold: number,
): RegionDiff {
  let differing = 0;
  let pixels = 0;
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      const i = y * width + x;
      pixels += 1;
      if (ink(headless, i, threshold) !== ink(reference, i, threshold)) differing += 1;
    }
  }
  return { region, pixels, differing, percent: pixels ? (100 * differing) / pixels : 0 };
}

export function unpackedHeadlessGray(bits: RasterBitmap): Uint8Array {
  return unpackMono1bppToGray(bits.mono1bppBuffer, bits.widthDots, bits.heightDots, bits.bytesPerRow);
}

export function diffHeadlessVsReference(
  headlessGray: Uint8Array,
  referenceGray: Uint8Array,
  width: number,
  height: number,
  dpi: number,
  threshold = 160,
): ParityDiffReport {
  const regions = frozenFixtureRegions(dpi);
  const full = regionDiff(headlessGray, referenceGray, width, 'full', { x: 0, y: 0, w: width, h: height }, threshold);
  const regionRows = (Object.keys(regions) as RegionId[]).map((id) =>
    regionDiff(headlessGray, referenceGray, width, id, regions[id], threshold),
  );
  const pct = (id: RegionId) => regionRows.find((r) => r.region === id)?.percent ?? 0;
  return {
    width,
    height,
    threshold,
    full,
    regions: regionRows,
    confirmed: {
      barGeometry: pct('bars') >= CONFIRM_PCT,
      missingDigits: pct('digits') >= CONFIRM_PCT,
      borderStyle: pct('border') >= CONFIRM_PCT,
      textPlacement: pct('text') >= CONFIRM_PCT,
    },
  };
}

/**
 * Native printPngLabelNative fit: scale only when |src-packed| > 8 on either axis.
 * Nearest-neighbor stand-in for host (ViewShot already targets packed SIZE dots).
 */
export function fitGrayToPacked(
  src: Uint8Array,
  srcW: number,
  srcH: number,
  packedW: number,
  packedH: number,
): Uint8Array {
  const out = new Uint8Array(packedW * packedH);
  out.fill(255);
  const needScale = srcW !== packedW || srcH !== packedH;
  const bigGap = Math.abs(srcW - packedW) > 8 || Math.abs(srcH - packedH) > 8;
  if (!needScale) {
    out.set(src.subarray(0, packedW * packedH));
    return out;
  }
  if (!bigGap) {
    const cw = Math.min(srcW, packedW);
    const ch = Math.min(srcH, packedH);
    for (let y = 0; y < ch; y++) {
      out.set(src.subarray(y * srcW, y * srcW + cw), y * packedW);
    }
    return out;
  }
  for (let y = 0; y < packedH; y++) {
    const sy = Math.min(srcH - 1, Math.round((y * (srcH - 1)) / Math.max(1, packedH - 1)));
    for (let x = 0; x < packedW; x++) {
      const sx = Math.min(srcW - 1, Math.round((x * (srcW - 1)) / Math.max(1, packedW - 1)));
      out[y * packedW + x] = src[sy * srcW + sx];
    }
  }
  return out;
}
