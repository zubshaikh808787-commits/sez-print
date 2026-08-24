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

export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const lookup = new Uint8Array(128);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;

  let padding = 0;
  if (clean.endsWith('==')) padding = 2;
  else if (clean.endsWith('=')) padding = 1;

  const byteLength = (clean.length / 4) * 3 - padding;
  const bytes = new Uint8Array(byteLength);
  let out = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = lookup[clean.charCodeAt(i)];
    const b = lookup[clean.charCodeAt(i + 1)];
    const c = lookup[clean.charCodeAt(i + 2)];
    const d = lookup[clean.charCodeAt(i + 3)];
    if (out < byteLength) bytes[out++] = (a << 2) | (b >> 4);
    if (out < byteLength) bytes[out++] = ((b & 15) << 4) | (c >> 2);
    if (out < byteLength) bytes[out++] = ((c & 3) << 6) | d;
  }
  return bytes;
}

/** Decode a PNG (base64) into a luminance raster. Transparent pixels become white. */
export function pngBase64ToGray(base64: string): GrayRaster {
  const png = loadFastPng()(base64ToBytes(base64));
  const { width, height, channels, depth } = png;
  const data = png.data;
  const gray = new Uint8Array(width * height);
  const maxValue = depth === 16 ? 65535 : 255;

  for (let i = 0; i < width * height; i++) {
    const base = i * channels;
    let r: number;
    let g: number;
    let b: number;
    let a = maxValue;
    if (channels === 1) {
      r = g = b = data[base];
    } else if (channels === 2) {
      r = g = b = data[base];
      a = data[base + 1];
    } else {
      r = data[base];
      g = data[base + 1];
      b = data[base + 2];
      if (channels === 4) a = data[base + 3];
    }
    // Composite over white using alpha.
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / maxValue;
    const alpha = a / maxValue;
    const value = lum * alpha + (1 - alpha);
    gray[i] = Math.round(value * 255);
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
 */
export function grayToBits(
  raster: GrayRaster,
  options: { threshold: number; dither: boolean },
): BitRaster {
  const { width, height } = raster;
  const bytesPerRow = Math.ceil(width / 8);
  const data = new Uint8Array(bytesPerRow * height);
  const threshold = Math.min(255, Math.max(0, options.threshold));

  if (!options.dither) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (raster.gray[y * width + x] < threshold) {
          data[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
        }
      }
    }
    return { bytesPerRow, height, data };
  }

  // Floyd–Steinberg error diffusion on a float copy.
  const work = Float32Array.from(raster.gray);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const old = work[idx];
      const black = old < threshold;
      const next = black ? 0 : 255;
      const error = old - next;
      if (black) data[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
      if (x + 1 < width) work[idx + 1] += (error * 7) / 16;
      if (y + 1 < height) {
        if (x > 0) work[idx + width - 1] += (error * 3) / 16;
        work[idx + width] += (error * 5) / 16;
        if (x + 1 < width) work[idx + width + 1] += error / 16;
      }
    }
  }
  return { bytesPerRow, height, data };
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

/** Build a complete ESC/POS job for one label image. */
export function encodeEscPosJob(bitmap: BitRaster, options: EscPosJobOptions): Uint8Array {
  const parts: number[] = [];

  parts.push(ESC, 0x40); // initialize

  if (options.density != null) {
    // GS ( K — set print density (fn=49), supported by most thermal label printers.
    const n = Math.min(15, Math.max(1, Math.round(options.density)));
    parts.push(GS, 0x28, 0x4b, 0x02, 0x00, 0x31, n);
  }

  if (options.speed != null) {
    // GS ( K — set print speed (fn=50); printers that don't support it ignore the block.
    const n = Math.min(14, Math.max(1, Math.round(options.speed)));
    parts.push(GS, 0x28, 0x4b, 0x02, 0x00, 0x32, n);
  }

  const pushFeed = (dots: number) => {
    let remaining = Math.max(0, Math.round(dots));
    while (remaining > 0) {
      const step = Math.min(255, remaining);
      parts.push(ESC, 0x4a, step); // ESC J — feed n dot-lines
      remaining -= step;
    }
  };

  for (let copy = 0; copy < Math.max(1, options.copies); copy++) {
    pushFeed(options.leadFeedLines);

    for (let row = 0; row < bitmap.height; row += RASTER_BLOCK_ROWS) {
      const blockRows = Math.min(RASTER_BLOCK_ROWS, bitmap.height - row);
      parts.push(
        GS,
        0x76,
        0x30,
        0x00,
        bitmap.bytesPerRow & 0xff,
        (bitmap.bytesPerRow >> 8) & 0xff,
        blockRows & 0xff,
        (blockRows >> 8) & 0xff,
      );
      const start = row * bitmap.bytesPerRow;
      for (let i = 0; i < blockRows * bitmap.bytesPerRow; i++) {
        parts.push(bitmap.data[start + i]);
      }
    }

    pushFeed(options.trailFeedLines);
  }

  return Uint8Array.from(parts);
}
