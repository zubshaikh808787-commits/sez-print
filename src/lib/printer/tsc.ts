/**
 * TSC / TSPL label job builder for TD-404 / Ninestar printers.
 * Matches the vendor demo flow (LabelCommand → SIZE/GAP/CLS/BITMAP/PRINT).
 */

import type { BitRaster } from '@/lib/printer/escpos';

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

/**
 * Encode a 1-bit packed raster as a full TSPL job with BITMAP payload.
 * Mode 0 = OVERWRITE (same as LabelCommand.BITMAP_MODE.OVERWRITE).
 */
export function encodeTscBitmapJob(bitmap: BitRaster, options: TscJobOptions): Uint8Array {
  const gap = options.gapMm ?? 2;
  const copies = Math.max(1, options.copies ?? 1);
  const density =
    options.density != null ? Math.min(15, Math.max(0, Math.round(options.density))) : 8;
  const speed = options.speed != null ? Math.min(6, Math.max(1, Math.round(options.speed))) : 5;
  const x = options.x ?? 0;
  const y = options.y ?? 0;

  const header =
    '\r\n' +
    `SIZE ${options.widthMm} mm,${options.heightMm} mm\r\n` +
    `GAP ${gap} mm,0 mm\r\n` +
    `SPEED ${speed}\r\n` +
    'DIRECTION 1,0\r\n' +
    'REFERENCE 0,0\r\n' +
    `DENSITY ${density}\r\n` +
    'CLS\r\n' +
    `BITMAP ${x},${y},${bitmap.bytesPerRow},${bitmap.height},0,`;

  const footer = `\r\nPRINT ${copies},1\r\n`;

  return concatBytes([ascii(header), bitmap.data, ascii(footer)]);
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
    `SIZE ${widthMm} mm,${heightMm} mm\r\n` +
    `GAP ${gapMm} mm,0 mm\r\n` +
    'SPEED 5\r\n' +
    'DIRECTION 1,0\r\n' +
    'REFERENCE 0,0\r\n' +
    `DENSITY ${density}\r\n` +
    'CLS\r\n' +
    `TEXT 40,40,"0",0,1,1,"${text}"\r\n` +
    'PRINT 1,1\r\n';
  return ascii(cmd);
}
