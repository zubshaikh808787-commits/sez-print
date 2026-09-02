import type { LabelOrientation } from '@/lib/label-document';

type FastPngDecode = typeof import('fast-png').decode;

let fastPngDecode: FastPngDecode | null = null;

/**
 * Load fast-png lazily behind a TextDecoder shim.
 *
 * fast-png constructs `new TextDecoder('latin1')` at module scope, but Expo's
 * built-in TextDecoder only accepts UTF-8 labels and throws, which would crash
 * the entire /print route at import time. The shim decodes latin1 manually and
 * delegates every other label to the platform decoder.
 */
function loadFastPng(): FastPngDecode {
  if (fastPngDecode) return fastPngDecode;

  const g = globalThis as { TextDecoder?: typeof TextDecoder };
  const Original = g.TextDecoder;
  let supportsLatin1 = false;
  if (Original) {
    try {
      new Original('latin1');
      supportsLatin1 = true;
    } catch {
      supportsLatin1 = false;
    }
  }

  if (Original && !supportsLatin1) {
    const LATIN1_LABELS = new Set([
      'latin1',
      'iso-8859-1',
      'iso8859-1',
      'l1',
      'ascii',
      'us-ascii',
      'windows-1252',
    ]);

    class Latin1CapableTextDecoder {
      private inner: TextDecoder | null = null;
      readonly encoding: string;
      readonly fatal = false;
      readonly ignoreBOM = false;

      constructor(label = 'utf-8', options?: TextDecoderOptions) {
        if (LATIN1_LABELS.has(String(label).toLowerCase().trim())) {
          this.encoding = 'iso-8859-1';
        } else {
          this.inner = new (Original as typeof TextDecoder)(label, options);
          this.encoding = this.inner.encoding;
        }
      }

      decode(input?: ArrayBufferView | ArrayBuffer): string {
        if (this.inner) return this.inner.decode(input as ArrayBuffer);
        if (input == null) return '';
        const bytes =
          input instanceof Uint8Array
            ? input
            : ArrayBuffer.isView(input)
            ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
            : new Uint8Array(input);
        let out = '';
        for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
        return out;
      }
    }

    g.TextDecoder = Latin1CapableTextDecoder as unknown as typeof TextDecoder;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      fastPngDecode = (require('fast-png') as typeof import('fast-png')).decode;
    } finally {
      g.TextDecoder = Original;
    }
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    fastPngDecode = (require('fast-png') as typeof import('fast-png')).decode;
  }

  return fastPngDecode!;
}

/** Luminance raster: one byte per pixel, 0 = black, 255 = white. */
export type GrayRaster = {
  width: number;
  height: number;
  gray: Uint8Array;
};

/** Packed 1-bit raster ready for GS v 0: bit set = printed dot. */
export type BitRaster = {
  bytesPerRow: number;
  height: number;
  data: Uint8Array;
};

// Pre-built base64 lookup table (avoids re-creating per call).
const B64_LOOKUP = (() => {
  const tbl = new Uint8Array(128);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < chars.length; i++) tbl[chars.charCodeAt(i)] = i;
  return tbl;
})();

export function base64ToBytes(base64: string): Uint8Array {
  // ViewShot / fast-png always produce clean base64 — skip the costly regex.
  const clean = base64.indexOf('\n') >= 0 || base64.indexOf(' ') >= 0
    ? base64.replace(/[^A-Za-z0-9+/=]/g, '')
    : base64;

  const len = clean.length;
  if (len === 0) return new Uint8Array(0);

  let padding = 0;
  if (clean.charCodeAt(len - 1) === 61 /* = */) {
    padding = clean.charCodeAt(len - 2) === 61 ? 2 : 1;
  }

  const byteLength = (len / 4) * 3 - padding;
  const bytes = new Uint8Array(byteLength);
  let out = 0;

  // Process all full 4-char chunks except the last one without bounds checks (hot path)
  const safeEnd = len >= 4 ? len - 4 : 0;
  for (let i = 0; i < safeEnd; i += 4) {
    const a = B64_LOOKUP[clean.charCodeAt(i)];
    const b = B64_LOOKUP[clean.charCodeAt(i + 1)];
    const c = B64_LOOKUP[clean.charCodeAt(i + 2)];
    const d = B64_LOOKUP[clean.charCodeAt(i + 3)];
    bytes[out++] = (a << 2) | (b >> 4);
    bytes[out++] = ((b & 15) << 4) | (c >> 2);
    bytes[out++] = ((c & 3) << 6) | d;
  }

  // Process final chunk with exact padding bounds
  if (safeEnd < len) {
    const a = B64_LOOKUP[clean.charCodeAt(safeEnd)];
    const b = B64_LOOKUP[clean.charCodeAt(safeEnd + 1)];
    const c = B64_LOOKUP[clean.charCodeAt(safeEnd + 2)];
    const d = B64_LOOKUP[clean.charCodeAt(safeEnd + 3)];
    if (out < byteLength) bytes[out++] = (a << 2) | (b >> 4);
    if (out < byteLength) bytes[out++] = ((b & 15) << 4) | (c >> 2);
    if (out < byteLength) bytes[out++] = ((c & 3) << 6) | d;
  }

  return bytes;
}

/**
 * Decode a PNG (base64) into a luminance raster. Transparent pixels become white.
 *
 * Hot path — uses pure integer arithmetic (no float division/multiplication per pixel).
 * For a 1200×1800 RGBA image (2.16M pixels), this saves ~12M floating-point ops.
 */
export function pngBase64ToGray(base64: string): GrayRaster {
  const png = loadFastPng()(base64ToBytes(base64));
  const { width, height, channels, depth } = png;
  const data = png.data;
  const totalPixels = width * height;
  const gray = new Uint8Array(totalPixels);

  // Fast path: RGBA 8-bit (99% of ViewShot captures)
  if (channels === 4 && depth === 8) {
    for (let i = 0, base = 0; i < totalPixels; i++, base += 4) {
      const a = data[base + 3];
      // Fast path: completely opaque pixel (most thermal label artwork)
      if (a === 255) {
        gray[i] = (77 * data[base] + 150 * data[base + 1] + 29 * data[base + 2]) >> 8;
      } else if (a === 0) {
        gray[i] = 255;
      } else {
        const lum = (77 * data[base] + 150 * data[base + 1] + 29 * data[base + 2]) >> 8;
        gray[i] = (lum * a + 255 * (255 - a) + 128) >> 8;
      }
    }
    return { width, height, gray };
  }

  // Fast path: RGB 8-bit (no alpha)
  if (channels === 3 && depth === 8) {
    for (let i = 0, base = 0; i < totalPixels; i++, base += 3) {
      gray[i] = (77 * data[base] + 150 * data[base + 1] + 29 * data[base + 2]) >> 8;
    }
    return { width, height, gray };
  }

  // Fast path: Grayscale 8-bit
  if (channels === 1 && depth === 8) {
    gray.set(data.subarray(0, totalPixels));
    return { width, height, gray };
  }

  // Generic path for uncommon formats (16-bit, gray+alpha, etc.)
  const maxValue = depth === 16 ? 65535 : 255;
  for (let i = 0; i < totalPixels; i++) {
    const base = i * channels;
    let r: number, g: number, b: number, a = maxValue;
    if (channels === 1) {
      r = g = b = data[base];
    } else if (channels === 2) {
      r = g = b = data[base]; a = data[base + 1];
    } else {
      r = data[base]; g = data[base + 1]; b = data[base + 2];
      if (channels === 4) a = data[base + 3];
    }
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / maxValue;
    const alpha = a / maxValue;
    gray[i] = Math.round((lum * alpha + (1 - alpha)) * 255);
  }
  return { width, height, gray };
}

export function rotateGray(raster: GrayRaster, orientation: LabelOrientation): GrayRaster {
  if (orientation === 0) return raster;
  const { width, height, gray } = raster;
  if (orientation === 180) {
    const out = new Uint8Array(gray.length);
    for (let i = 0; i < gray.length; i++) out[gray.length - 1 - i] = gray[i];
    return { width, height, gray: out };
  }
  const out = new Uint8Array(gray.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = gray[y * width + x];
      if (orientation === 90) {
        // (x, y) -> (height - 1 - y, x) in a height×width image
        out[x * height + (height - 1 - y)] = value;
      } else {
        // 270: (x, y) -> (y, width - 1 - x)
        out[(width - 1 - x) * height + y] = value;
      }
    }
  }
  return { width: height, height: width, gray: out };
}

/**
 * Convert luminance to a packed 1-bit raster.
 * `dither` uses Floyd–Steinberg (for the Halftone color mode); otherwise a plain threshold.
 *
 * Optimized hot path:
 * - Threshold: packs 8 pixels per iteration (8× fewer loop cycles + no per-pixel bit shift).
 * - Dither: uses Int16Array (half the memory of Float32Array) with integer-scaled error
 *   diffusion (no float division per pixel).
 */
export function grayToBits(
  raster: GrayRaster,
  options: { threshold: number; dither: boolean },
): BitRaster {
  const { width, height, gray } = raster;
  const bytesPerRow = Math.ceil(width / 8);
  const data = new Uint8Array(bytesPerRow * height);
  const threshold = Math.min(255, Math.max(0, options.threshold));

  if (!options.dither) {
    // Pack 8 pixels per byte in one go — avoids per-pixel bit shift and OR.
    const fullBytes = width >> 3;       // complete 8-pixel groups
    const remainBits = width & 7;       // leftover pixels in last byte
    for (let y = 0; y < height; y++) {
      const rowStart = y * width;
      const outRow = y * bytesPerRow;
      let x = 0;
      for (let col = 0; col < fullBytes; col++) {
        let byte = 0;
        if (gray[rowStart + x    ] < threshold) byte |= 0x80;
        if (gray[rowStart + x + 1] < threshold) byte |= 0x40;
        if (gray[rowStart + x + 2] < threshold) byte |= 0x20;
        if (gray[rowStart + x + 3] < threshold) byte |= 0x10;
        if (gray[rowStart + x + 4] < threshold) byte |= 0x08;
        if (gray[rowStart + x + 5] < threshold) byte |= 0x04;
        if (gray[rowStart + x + 6] < threshold) byte |= 0x02;
        if (gray[rowStart + x + 7] < threshold) byte |= 0x01;
        data[outRow + col] = byte;
        x += 8;
      }
      if (remainBits > 0) {
        let byte = 0;
        for (let bit = 0; bit < remainBits; bit++) {
          if (gray[rowStart + x + bit] < threshold) byte |= 0x80 >> bit;
        }
        data[outRow + fullBytes] = byte;
      }
    }
    return { bytesPerRow, height, data };
  }

  // Floyd–Steinberg error diffusion — integer-scaled to avoid float division.
  // Work buffer uses Int16Array (2 bytes/pixel) instead of Float32Array (4 bytes/pixel),
  // halving memory for large labels (e.g. 2.16M pixels: 4.3 MB → 2.16 MB).
  // Error values are kept in original 0–255 scale; diffusion uses integer multiply + shift.
  const work = new Int16Array(width * height);
  work.set(gray);

  for (let y = 0; y < height; y++) {
    const rowIdx = y * width;
    const outRow = y * bytesPerRow;
    const hasNextRow = y + 1 < height;
    const nextRowIdx = rowIdx + width;
    for (let x = 0; x < width; x++) {
      const idx = rowIdx + x;
      const old = work[idx];
      const black = old < threshold;
      if (black) data[outRow + (x >> 3)] |= 0x80 >> (x & 7);
      // error = old - (black ? 0 : 255)
      const error = black ? old : old - 255;
      if (error === 0) continue;
      // Distribute error with integer multiply + right-shift-4 (÷16):
      //   7/16 ≈ (error * 7) >> 4,  5/16 ≈ (error * 5) >> 4, etc.
      if (x + 1 < width) work[idx + 1]         += (error * 7) >> 4;
      if (hasNextRow) {
        if (x > 0)       work[nextRowIdx + x - 1] += (error * 3) >> 4;
                         work[nextRowIdx + x]     += (error * 5) >> 4;
        if (x + 1 < width) work[nextRowIdx + x + 1] += error >> 4;
      }
    }
  }
  return { bytesPerRow, height, data };
}

/**
 * Map a gray raster onto destW×destH.
 * `stretch` fills the label (same mm→dot mapping as the editor).
 * `contain` is only for 90°/270° when the rotated bitmap has a swapped aspect.
 *
 * Optimized: precomputes row/col lookup tables to avoid per-pixel Math.floor division.
 */
export function fitGrayToSize(
  src: GrayRaster,
  destW: number,
  destH: number,
  mode: 'contain' | 'stretch' = 'stretch',
): GrayRaster {
  const width = Math.max(1, Math.round(destW));
  const height = Math.max(1, Math.round(destH));
  if (src.width === width && src.height === height) return src;
  const out = new Uint8Array(width * height);
  out.fill(255);

  // Precompute source row/col maps to avoid per-pixel division.
  const buildMap = (destSize: number, srcSize: number): Uint32Array => {
    const map = new Uint32Array(destSize);
    const max = srcSize - 1;
    for (let i = 0; i < destSize; i++) {
      map[i] = Math.min(max, ((2 * i + 1) * srcSize) >>> 1 / destSize | 0);
      // More precise: use the original formula but compute once
      map[i] = Math.min(max, Math.floor(((i + 0.5) * srcSize) / destSize));
    }
    return map;
  };

  if (mode === 'stretch') {
    const yMap = buildMap(height, src.height);
    const xMap = buildMap(width, src.width);
    const srcW = src.width;
    const srcGray = src.gray;
    for (let y = 0; y < height; y++) {
      const srcRow = yMap[y] * srcW;
      const outRow = y * width;
      for (let x = 0; x < width; x++) {
        out[outRow + x] = srcGray[srcRow + xMap[x]];
      }
    }
    return { width, height, gray: out };
  }

  const scale = Math.min(width / Math.max(src.width, 1), height / Math.max(src.height, 1));
  const dw = Math.max(1, Math.round(src.width * scale));
  const dh = Math.max(1, Math.round(src.height * scale));
  const ox = Math.floor((width - dw) / 2);
  const oy = Math.floor((height - dh) / 2);
  const yMap = buildMap(dh, src.height);
  const xMap = buildMap(dw, src.width);
  const srcW = src.width;
  const srcGray = src.gray;
  for (let y = 0; y < dh; y++) {
    const srcRow = yMap[y] * srcW;
    const outRow = (y + oy) * width;
    for (let x = 0; x < dw; x++) {
      out[outRow + (x + ox)] = srcGray[srcRow + xMap[x]];
    }
  }
  return { width, height, gray: out };
}

/**
 * Place a bit raster centered on a dest canvas (white fill).
 * destWidth is forced to a multiple of 8 for TSPL BITMAP packing.
 * Used so 8-dot alignment padding is equal left/right, not all on the right.
 */
export function padBitsCentered(
  raster: BitRaster,
  destWidth: number,
  destHeight: number,
): BitRaster {
  const destW = Math.max(8, Math.ceil(Math.max(1, destWidth) / 8) * 8);
  const destH = Math.max(1, Math.round(destHeight));
  const srcW = raster.bytesPerRow * 8;
  const srcH = raster.height;
  if (srcW === destW && srcH === destH) return raster;

  const bytesPerRow = destW >> 3;
  const out = new Uint8Array(bytesPerRow * destH);
  const ox = Math.floor((destW - srcW) / 2);
  const oy = Math.floor((destH - srcH) / 2);

  for (let y = 0; y < srcH; y++) {
    const dy = y + oy;
    if (dy < 0 || dy >= destH) continue;
    for (let x = 0; x < srcW; x++) {
      const dx = x + ox;
      if (dx < 0 || dx >= destW) continue;
      if (raster.data[y * raster.bytesPerRow + (x >> 3)] & (0x80 >> (x & 7))) {
        out[dy * bytesPerRow + (dx >> 3)] |= 0x80 >> (dx & 7);
      }
    }
  }
  return { bytesPerRow, height: destH, data: out };
}

/** Shift a bit raster horizontally by whole dots (positive = right). */
export function shiftBits(raster: BitRaster, offsetDots: number): BitRaster {
  if (offsetDots === 0) return raster;
  const { bytesPerRow, height, data } = raster;
  const width = bytesPerRow * 8;
  const out = new Uint8Array(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = x - offsetDots;
      if (src < 0 || src >= width) continue;
      if (data[y * bytesPerRow + (src >> 3)] & (0x80 >> (src & 7))) {
        out[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }
  return { bytesPerRow, height, data: out };
}

const ESC = 0x1b;
const GS = 0x1d;

/** Max rows per GS v 0 block; some firmwares choke on very tall single blocks. */
const RASTER_BLOCK_ROWS = 128;

export type EscPosJobOptions = {
  copies: number;
  /** Blank dot-lines fed before the image (vertical offset). */
  leadFeedLines: number;
  /** Blank dot-lines fed after each copy (gap / tear-off). */
  trailFeedLines: number;
  /** 1..15, or null for printer default. */
  density: number | null;
  /** 1..14 print speed, or null for printer default. */
  speed?: number | null;
};

/**
 * Build a complete ESC/POS job for one label image.
 *
 * Pre-allocates the output buffer to exact size and uses Uint8Array.set() for
 * bulk raster copy — avoids the O(n) JS number[] push + Uint8Array.from() that
 * doubled peak memory and CPU for large bitmaps (200–300 KB).
 */
export function encodeEscPosJob(bitmap: BitRaster, options: EscPosJobOptions): Uint8Array {
  const copies = Math.max(1, options.copies);
  const leadDots = Math.max(0, Math.round(options.leadFeedLines));
  const trailDots = Math.max(0, Math.round(options.trailFeedLines));

  // --- Phase 1: compute exact output size ---
  let size = 2; // ESC @ (initialize)
  if (options.density != null) size += 7; // GS ( K density
  if (options.speed != null) size += 7;   // GS ( K speed

  const feedBytes = (dots: number) => {
    let remaining = dots;
    let bytes = 0;
    while (remaining > 0) {
      bytes += 3; // ESC J n
      remaining -= Math.min(255, remaining);
    }
    return bytes;
  };

  const rasterBlocks = Math.ceil(bitmap.height / RASTER_BLOCK_ROWS);
  const rasterDataBytes = bitmap.bytesPerRow * bitmap.height;
  const rasterHeaderBytes = rasterBlocks * 8; // 8-byte header per GS v 0 block

  const perCopy = feedBytes(leadDots) + rasterHeaderBytes + rasterDataBytes + feedBytes(trailDots);
  size += perCopy * copies;

  // --- Phase 2: fill pre-allocated buffer ---
  const out = new Uint8Array(size);
  let pos = 0;

  const writeByte = (b: number) => { out[pos++] = b; };
  const writeBytes = (...bytes: number[]) => { for (const b of bytes) out[pos++] = b; };

  const writeFeed = (dots: number) => {
    let remaining = dots;
    while (remaining > 0) {
      const step = Math.min(255, remaining);
      writeBytes(ESC, 0x4a, step);
      remaining -= step;
    }
  };

  writeBytes(ESC, 0x40); // initialize

  if (options.density != null) {
    const n = Math.min(15, Math.max(1, Math.round(options.density)));
    writeBytes(GS, 0x28, 0x4b, 0x02, 0x00, 0x31, n);
  }
  if (options.speed != null) {
    const n = Math.min(14, Math.max(1, Math.round(options.speed)));
    writeBytes(GS, 0x28, 0x4b, 0x02, 0x00, 0x32, n);
  }

  for (let copy = 0; copy < copies; copy++) {
    writeFeed(leadDots);

    for (let row = 0; row < bitmap.height; row += RASTER_BLOCK_ROWS) {
      const blockRows = Math.min(RASTER_BLOCK_ROWS, bitmap.height - row);
      writeBytes(
        GS, 0x76, 0x30, 0x00,
        bitmap.bytesPerRow & 0xff, (bitmap.bytesPerRow >> 8) & 0xff,
        blockRows & 0xff, (blockRows >> 8) & 0xff,
      );
      // Bulk copy the raster block instead of byte-by-byte push
      const start = row * bitmap.bytesPerRow;
      out.set(bitmap.data.subarray(start, start + blockRows * bitmap.bytesPerRow), pos);
      pos += blockRows * bitmap.bytesPerRow;
    }

    writeFeed(trailDots);
  }

  return out;
}
