/**
 * TSC / TSPL label job builder for TD-404 / Ninestar printers.
 * Matches the vendor demo flow (LabelCommand → SIZE/GAP/CLS/BITMAP/PRINT).
 */

import type { BitRaster } from '@/lib/printer/escpos';
import { formatTsplSizeCommand } from '@/lib/label-geometry';

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

/**
 * TSPL BITMAP (Ninestar / TD-404 / Gprinter): 0 = print black, 1 = white.
 * Our BitRaster matches ESC/POS GS v 0 (1 = black). Invert into a fresh buffer
 * (never mutate the source) so batch / multi-copy jobs cannot share dirty state.
 */
function invertEscPosBitsForTspl(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] ^ 0xff;
  return out;
}

function mediaCommand(media: TscJobOptions['media'], gapMm: number): string {
  const g = Math.max(0, gapMm);
  if (media === 'bline') return `BLINE ${g} mm,0 mm\r\n`;
  if (media === 'continuous') return `GAP 0 mm,0 mm\r\n`;
  return `GAP ${g} mm,0 mm\r\n`;
}

/**
 * Encode a 1-bit packed raster as a full TSPL job with BITMAP payload.
 * Mode 0 = OVERWRITE. Always emits PRINT 1,1 — callers that need N copies must
 * send N independent jobs.
 *
 * DIRECTION 0,0 keeps the same top-left origin as the editor preview so
 * alignment matches on-screen layout (DIRECTION 1 flips print vs preview).
 */
export function encodeTscBitmapJob(bitmap: BitRaster, options: TscJobOptions): Uint8Array {
  const gap = options.gapMm ?? 2;
  const density =
    options.density != null ? Math.min(15, Math.max(0, Math.round(options.density))) : 8;
  const speed = options.speed != null ? Math.min(6, Math.max(1, Math.round(options.speed))) : 5;
  const x = options.x ?? 0;
  const y = options.y ?? 0;
  const payload = invertEscPosBitsForTspl(bitmap.data);

  const sizeCmd = formatTsplSizeCommand(options.widthMm, options.heightMm);
  const mediaCmd = mediaCommand(options.media ?? 'gap', gap);

  console.info(
    '[tsc] TSPL job:',
    sizeCmd, '|',
    mediaCmd.trim(), '|',
    'BITMAP', x + ',' + y + ',' + bitmap.bytesPerRow + ',' + bitmap.height + ',0 |',
    'SPEED', speed, '| DENSITY', density, '|',
    'payload:', payload.length, 'bytes',
  );

  const header =
    '\r\n' +
    `${sizeCmd}\r\n` +
    mediaCmd +
    `SPEED ${speed}\r\n` +
    'DIRECTION 0,0\r\n' +
    'REFERENCE 0,0\r\n' +
    `DENSITY ${density}\r\n` +
    'CLS\r\n' +
    `BITMAP ${x},${y},${bitmap.bytesPerRow},${bitmap.height},0,`;

  const footer = `\r\nPRINT 1,1\r\n`;

  return concatBytes([ascii(header), payload, ascii(footer)]);
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
    `GAP ${gapMm} mm,0 mm\r\n` +
    'SPEED 5\r\n' +
    'DIRECTION 0,0\r\n' +
    'REFERENCE 0,0\r\n' +
    `DENSITY ${density}\r\n` +
    'CLS\r\n' +
    `TEXT 40,40,"0",0,1,1,"${text}"\r\n` +
    'PRINT 1,1\r\n';
  return ascii(cmd);
}
