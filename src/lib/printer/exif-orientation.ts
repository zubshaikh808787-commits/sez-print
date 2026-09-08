import type { GrayBitmap } from '@/printing/document/types';

/** EXIF Orientation tag values (TIFF). 1 = already upright. */
export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export function parseExifOrientation(value: unknown): ExifOrientation | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (n >= 1 && n <= 8) return n as ExifOrientation;
  return null;
}

/**
 * Make pixels match a gallery/preview that honors EXIF.
 * This is the only automatic orientation step for imported photos.
 */
export function applyExifOrientation(src: GrayBitmap, orientation: number | null): GrayBitmap {
  const tag = parseExifOrientation(orientation);
  if (!tag || tag === 1) return src;
  switch (tag) {
    case 2:
      return flipHorizontal(src);
    case 3:
      return rotate180(src);
    case 4:
      return flipVertical(src);
    case 5:
      return flipHorizontal(rotate90Cw(src));
    case 6:
      return rotate90Cw(src);
    case 7:
      return flipHorizontal(rotate90Ccw(src));
    case 8:
      return rotate90Ccw(src);
    default:
      return src;
  }
}

export function flipHorizontal(src: GrayBitmap): GrayBitmap {
  const { width, height, gray } = src;
  const out = new Uint8Array(gray.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) out[row + (width - 1 - x)] = gray[row + x];
  }
  return { width, height, gray: out };
}

export function flipVertical(src: GrayBitmap): GrayBitmap {
  const { width, height, gray } = src;
  const out = new Uint8Array(gray.length);
  for (let y = 0; y < height; y++) {
    out.set(gray.subarray(y * width, y * width + width), (height - 1 - y) * width);
  }
  return { width, height, gray: out };
}

function rotate180(src: GrayBitmap): GrayBitmap {
  const out = new Uint8Array(src.gray.length);
  for (let i = 0; i < src.gray.length; i++) out[src.gray.length - 1 - i] = src.gray[i];
  return { width: src.width, height: src.height, gray: out };
}

function rotate90Cw(src: GrayBitmap): GrayBitmap {
  const { width, height, gray } = src;
  const out = new Uint8Array(gray.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      out[x * height + (height - 1 - y)] = gray[y * width + x];
    }
  }
  return { width: height, height: width, gray: out };
}

function rotate90Ccw(src: GrayBitmap): GrayBitmap {
  const { width, height, gray } = src;
  const out = new Uint8Array(gray.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      out[(width - 1 - x) * height + y] = gray[y * width + x];
    }
  }
  return { width: height, height: width, gray: out };
}

/**
 * JPEG APP1 / TIFF Exif Orientation. Returns null when the file has no tag.
 */
export function readJpegExifOrientation(bytes: Uint8Array): number | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    const size = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (size < 2) return null;
    if (marker === 0xe1) {
      const start = offset + 4;
      const end = Math.min(bytes.length, offset + 2 + size);
      return readOrientationFromExif(bytes.subarray(start, end));
    }
    if (marker === 0xda) return null;
    offset += 2 + size;
  }
  return null;
}

function readOrientationFromExif(segment: Uint8Array): number | null {
  if (segment.length < 14) return null;
  const isExif =
    segment[0] === 0x45 &&
    segment[1] === 0x78 &&
    segment[2] === 0x69 &&
    segment[3] === 0x66 &&
    segment[4] === 0x00 &&
    segment[5] === 0x00;
  if (!isExif) return null;
  const tiff = segment.subarray(6);
  const little = tiff[0] === 0x49 && tiff[1] === 0x49;
  const big = tiff[0] === 0x4d && tiff[1] === 0x4d;
  if (!little && !big) return null;
  const u16 = (at: number) =>
    little ? tiff[at] | (tiff[at + 1] << 8) : (tiff[at] << 8) | tiff[at + 1];
  const u32 = (at: number) =>
    little
      ? tiff[at] | (tiff[at + 1] << 8) | (tiff[at + 2] << 16) | (tiff[at + 3] << 24)
      : (tiff[at] << 24) | (tiff[at + 1] << 16) | (tiff[at + 2] << 8) | tiff[at + 3];
  if (u16(2) !== 42) return null;
  let ifd = u32(4);
  if (ifd < 8 || ifd + 2 > tiff.length) return null;
  const count = u16(ifd);
  ifd += 2;
  for (let i = 0; i < count; i++) {
    const entry = ifd + i * 12;
    if (entry + 12 > tiff.length) break;
    const tag = u16(entry);
    if (tag !== 0x0112) continue;
    const type = u16(entry + 2);
    const value =
      type === 3 ? (little ? tiff[entry + 8] | (tiff[entry + 9] << 8) : (tiff[entry + 8] << 8) | tiff[entry + 9]) : u32(entry + 8);
    return parseExifOrientation(value);
  }
  return null;
}
