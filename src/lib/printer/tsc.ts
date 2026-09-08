/**
 * TSC / TSPL label job builder for TD-404 / Ninestar printers.
 * Matches the vendor demo flow (LabelCommand → SIZE/GAP/CLS/BITMAP/PRINT).
 */

import type { BitRaster } from '@/lib/printer/escpos';
import { formatTsplMm, formatTsplSizeCommand } from '@/lib/printer/print-spec';

export type TscJobOptions = {
  widthMm: number;
  heightMm: number;
  gapMm?: number;
  copies?: number;
  density?: number | null;
  /** TSPL SPEED 1–6. Higher is faster feed. */
  speed?: number | null;
  /** Dot offset for BITMAP x,y */
  x?: number;
  y?: number;
  /**
   * Media sensor: gap (default), black-mark (BLINE), or continuous.
   * Wrong mode causes overlapping prints on one physical label.
   */
  media?: 'gap' | 'bline' | 'continuous';
};

function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function ascii(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function mediaCommand(media: TscJobOptions['media'], gapMm: number): string {
  const g = formatTsplMm(gapMm);
  if (media === 'bline') return `BLINE ${g} mm,0 mm\r\n`;
  if (media === 'continuous') return `GAP 0.00 mm,0 mm\r\n`;
  return `GAP ${g} mm,0 mm\r\n`;
}

/**
 * Encode a 1-bit packed raster as a full TSPL job with BITMAP payload.
 * Mode 0 = OVERWRITE. Always emits PRINT 1,1 — callers that need N copies must
 * send N independent jobs.
 *
 * Single-allocation zero-copy: inverts raster directly into output buffer
 * without allocating intermediate 250KB payloads or multi-array concatenation.
 *
 * DIRECTION 0,0 keeps the same top-left origin as the editor preview so
 * alignment matches on-screen layout (DIRECTION 1 flips print vs preview).
 */
export function encodeTscBitmapJob(bitmap: BitRaster, options: TscJobOptions): Uint8Array {
  const gap = options.gapMm ?? 2;
  const density =
    options.density != null ? Math.min(15, Math.max(0, Math.round(options.density))) : 8;
  const speed = options.speed != null ? Math.min(6, Math.max(1, Math.round(options.speed))) : 6;
  const x = options.x ?? 0;
  const y = options.y ?? 0;

  const sizeCmd = formatTsplSizeCommand(options.widthMm, options.heightMm);
  const mediaCmd = mediaCommand(options.media ?? 'gap', gap);

  const bitmapCmd = `BITMAP ${x},${y},${bitmap.bytesPerRow},${bitmap.height},0`;
  console.info(
    '[tsc] TSPL job:',
    sizeCmd, '|',
    mediaCmd.trim(), '|',
    bitmapCmd, '|',
    'SPEED', speed, '| DENSITY', density, '|',
    'payload:', bitmap.data.length, 'bytes',
    '| BITMAP width is byte-width', bitmap.bytesPerRow,
    'not pixel width', bitmap.bytesPerRow * 8,
  );

  const header =
    '\r\n' +
    `${sizeCmd}\r\n` +
    mediaCmd +
    `SPEED ${speed}\r\n` +
    `DENSITY ${density}\r\n` +
    'DIRECTION 0,0\r\n' +
    'REFERENCE 0,0\r\n' +
    'CLS\r\n' +
    `BITMAP ${x},${y},${bitmap.bytesPerRow},${bitmap.height},0,`;

  const footer = '\r\nPRINT 1,1\r\n';

  const headerLen = header.length;
  const dataLen = bitmap.data.length;
  const footerLen = footer.length;
  const out = new Uint8Array(headerLen + dataLen + footerLen);

  // 1. Write header directly
  for (let i = 0; i < headerLen; i++) out[i] = header.charCodeAt(i) & 0xff;

  // 2. Invert directly into output buffer (zero intermediate allocation)
  const src = bitmap.data;
  for (let i = 0; i < dataLen; i++) {
    out[headerLen + i] = src[i] ^ 0xff;
  }

  // 3. Write footer directly
  const footerOffset = headerLen + dataLen;
  for (let i = 0; i < footerLen; i++) out[footerOffset + i] = footer.charCodeAt(i) & 0xff;

  return out;
}

export type TsplJobInspection = {
  sizeCommand: string;
  gapCommand: string;
  directionCommand: string;
  referenceCommand: string;
  bitmapCommand: string;
  bitmapX: number;
  bitmapY: number;
  bitmapWidthBytes: number;
  bitmapHeightDots: number;
  payloadBytes: number;
  totalBytes: number;
  header: string;
};

/** Parse the TSPL ASCII header that this encoder actually wrote. */
export function inspectTsplJob(bytes: Uint8Array): TsplJobInspection {
  const { text, payloadStart } = readTsplHeader(bytes);
  const footerLen = '\r\nPRINT 1,1\r\n'.length;
  const sizeCommand = matchLine(text, /^SIZE .+$/m) ?? '';
  const gapCommand = matchLine(text, /^(GAP|BLINE) .+$/m) ?? '';
  const directionCommand = matchLine(text, /^DIRECTION .+$/m) ?? '';
  const referenceCommand = matchLine(text, /^REFERENCE .+$/m) ?? '';
  const bitmapMatch = text.match(/BITMAP\s+(-?\d+),(-?\d+),(\d+),(\d+),(\d+)/);
  const bitmapCommand = bitmapMatch ? bitmapMatch[0] : '';
  return {
    sizeCommand,
    gapCommand,
    directionCommand,
    referenceCommand,
    bitmapCommand,
    bitmapX: Number(bitmapMatch?.[1] ?? 0),
    bitmapY: Number(bitmapMatch?.[2] ?? 0),
    bitmapWidthBytes: Number(bitmapMatch?.[3] ?? 0),
    bitmapHeightDots: Number(bitmapMatch?.[4] ?? 0),
    payloadBytes: Math.max(0, bytes.length - payloadStart - footerLen),
    totalBytes: bytes.length,
    header: text,
  };
}

function matchLine(text: string, re: RegExp): string | undefined {
  return text.match(re)?.[0]?.trim();
}

function readTsplHeader(bytes: Uint8Array): { text: string; payloadStart: number } {
  let text = '';
  const limit = Math.min(bytes.length, 800);
  for (let i = 0; i < limit; i++) {
    const c = bytes[i];
    if (c < 9 || c > 126) {
      return { text, payloadStart: i };
    }
    text += String.fromCharCode(c);
    // BITMAP x,y,byteWidth,height,mode,  — do not stop at BITMAP x,y,
    if (/BITMAP\s+-?\d+,-?\d+,\d+,\d+,\d+,$/.test(text)) {
      return { text, payloadStart: i + 1 };
    }
  }
  return { text, payloadStart: limit };
}

/** Simple text-only sample label (no bitmap) — good for connection smoke tests. */
export function encodeTscTextSample(options: {
  widthMm?: number;
  heightMm?: number;
  gapMm?: number;
  text?: string;
  density?: number;
}): Uint8Array {
  const widthMm = options.widthMm ?? 50;
  const heightMm = options.heightMm ?? 30;
  const gapMm = options.gapMm ?? 2;
  const density = options.density ?? 8;
  const text = String(options.text ?? 'Sez Print TD-404').replace(/"/g, '');
  const cmd =
    '\r\n' +
    `${formatTsplSizeCommand(widthMm, heightMm)}\r\n` +
    `GAP ${formatTsplMm(gapMm)} mm,0 mm\r\n` +
    'SPEED 5\r\n' +
    `DENSITY ${density}\r\n` +
    'DIRECTION 0,0\r\n' +
    'REFERENCE 0,0\r\n' +
    'CLS\r\n' +
    `TEXT 40,40,"0",0,1,1,"${text}"\r\n` +
    'PRINT 1,1\r\n';
  return ascii(cmd);
}
