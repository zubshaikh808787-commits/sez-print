/**
 * Bitmap text renderer for the universal print engine.
 * Renders text directly to GrayBitmap at target DPI — no React Native, no ViewShot.
 *
 * Uses a built-in 5×7 bitmap font scaled to the target point size.
 * This covers the majority of thermal-printed labels (Latin characters, digits,
 * common punctuation). Complex scripts and custom fonts fall back to ViewShot
 * per-element capture in the converter.
 */

import type { GrayBitmap } from '@/printing/document/types';
import { fillRect } from '@/printing/raster/bitmap';

export type TextRenderOptions = {
  text: string;
  /** Physical size in mm — converted to dots by the caller. */
  fontSizeDots: number;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  /** Destination box width in dots. */
  boxWidthDots: number;
  /** Destination box height in dots. */
  boxHeightDots: number;
  /** Inverted (white on black). */
  inverted?: boolean;
};

/**
 * Render text into a new GrayBitmap at the given dot dimensions.
 * Returns a bitmap that can be blitted onto the page canvas.
 */
export function renderTextBitmap(options: TextRenderOptions): GrayBitmap {
  const { text, fontSizeDots, bold, align, boxWidthDots, boxHeightDots, inverted } = options;
  const w = Math.max(1, Math.round(boxWidthDots));
  const h = Math.max(1, Math.round(boxHeightDots));
  const gray = new Uint8Array(w * h);
  gray.fill(inverted ? 0 : 255);

  if (!text || fontSizeDots < 1) {
    return { width: w, height: h, gray };
  }

  // Scale factor: how many dest pixels per glyph pixel
  const glyphW = 5;
  const glyphH = 7;
  const scale = Math.max(1, Math.round(fontSizeDots / glyphH));
  const charW = (glyphW + 1) * scale; // 1 pixel gap between chars
  const charH = glyphH * scale;
  const lineHeight = Math.round(charH * 1.3);
  const ink = inverted ? 255 : 0;

  // Word-wrap the text to fit the box
  const lines = wordWrap(text, w, charW);

  let ty = Math.max(0, Math.floor((h - lines.length * lineHeight) / 2));
  for (const line of lines) {
    if (ty + charH > h) break;
    const lineWidthPx = line.length * charW;
    let tx: number;
    if (align === 'center') {
      tx = Math.max(0, Math.floor((w - lineWidthPx) / 2));
    } else if (align === 'right') {
      tx = Math.max(0, w - lineWidthPx);
    } else {
      tx = 0;
    }

    for (const ch of line) {
      const glyph = GLYPHS[ch] ?? GLYPHS[ch.toUpperCase()] ?? GLYPHS['?'];
      if (glyph) {
        drawGlyph(gray, w, h, glyph, tx, ty, scale, ink, bold ?? false);
      }
      tx += charW;
      if (tx >= w) break;
    }
    ty += lineHeight;
  }

  return { width: w, height: h, gray };
}

/**
 * Check if the given text can be rendered with the built-in bitmap font.
 * Returns false for scripts that need the ViewShot fallback.
 */
export function canRenderWithBitmapFont(text: string): boolean {
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    // ASCII printable + common Latin-1 supplement
    if (c >= 32 && c <= 126) continue;
    if (c === 10 || c === 13 || c === 9) continue; // newline/tab
    // Beyond basic Latin — needs ViewShot fallback
    return false;
  }
  return true;
}

function wordWrap(text: string, boxWidthPx: number, charWidthPx: number): string[] {
  const maxCharsPerLine = Math.max(1, Math.floor(boxWidthPx / charWidthPx));
  const inputLines = text.split('\n');
  const result: string[] = [];

  for (const input of inputLines) {
    const words = input.split(' ');
    let current = '';
    for (const word of words) {
      if (current.length === 0) {
        current = word;
      } else if (current.length + 1 + word.length <= maxCharsPerLine) {
        current += ' ' + word;
      } else {
        result.push(current);
        current = word;
      }
    }
    if (current.length > 0 || input.length === 0) result.push(current);
  }
  return result;
}

function drawGlyph(
  gray: Uint8Array,
  canvasW: number,
  canvasH: number,
  glyph: number[],
  ox: number,
  oy: number,
  scale: number,
  ink: number,
  bold: boolean,
): void {
  for (let gy = 0; gy < 7 && gy < glyph.length; gy++) {
    const row = glyph[gy] ?? 0;
    for (let gx = 0; gx < 5; gx++) {
      if (!(row & (1 << (4 - gx)))) continue;
      // Draw scaled pixel
      for (let sy = 0; sy < scale; sy++) {
        const py = oy + gy * scale + sy;
        if (py < 0 || py >= canvasH) continue;
        for (let sx = 0; sx < scale; sx++) {
          const px = ox + gx * scale + sx;
          if (px < 0 || px >= canvasW) continue;
          gray[py * canvasW + px] = ink;
        }
        // Bold: duplicate one pixel to the right
        if (bold) {
          const px = ox + gx * scale + scale;
          if (px >= 0 && px < canvasW) {
            gray[py * canvasW + px] = ink;
          }
        }
      }
    }
  }
}

/**
 * Render text directly onto a destination GrayBitmap at the specified position.
 */
export function drawText(
  dest: GrayBitmap,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  fontSizeDots: number,
  options?: { bold?: boolean; align?: 'left' | 'center' | 'right'; inverted?: boolean },
): void {
  const bitmap = renderTextBitmap({
    text,
    fontSizeDots,
    bold: options?.bold,
    align: options?.align ?? 'left',
    boxWidthDots: w,
    boxHeightDots: h,
    inverted: options?.inverted,
  });

  // Blit onto destination
  const destW = dest.width;
  const destH = dest.height;
  for (let py = 0; py < bitmap.height; py++) {
    const dy = y + py;
    if (dy < 0 || dy >= destH) continue;
    for (let px = 0; px < bitmap.width; px++) {
      const dx = x + px;
      if (dx < 0 || dx >= destW) continue;
      const srcVal = bitmap.gray[py * bitmap.width + px];
      if (srcVal < 128) {
        dest.gray[dy * destW + dx] = srcVal;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 5×7 bitmap font — ASCII 32–126
// Each glyph is 7 rows, each row a 5-bit mask (MSB = leftmost pixel).
// ---------------------------------------------------------------------------
const GLYPHS: Record<string, number[]> = {
  ' ': [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000],
  '!': [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00000, 0b00100],
  '"': [0b01010, 0b01010, 0b01010, 0b00000, 0b00000, 0b00000, 0b00000],
  '#': [0b01010, 0b01010, 0b11111, 0b01010, 0b11111, 0b01010, 0b01010],
  '$': [0b00100, 0b01111, 0b10100, 0b01110, 0b00101, 0b11110, 0b00100],
  '%': [0b11000, 0b11001, 0b00010, 0b00100, 0b01000, 0b10011, 0b00011],
  '&': [0b01100, 0b10010, 0b10100, 0b01000, 0b10101, 0b10010, 0b01101],
  "'": [0b00100, 0b00100, 0b01000, 0b00000, 0b00000, 0b00000, 0b00000],
  '(': [0b00010, 0b00100, 0b01000, 0b01000, 0b01000, 0b00100, 0b00010],
  ')': [0b01000, 0b00100, 0b00010, 0b00010, 0b00010, 0b00100, 0b01000],
  '*': [0b00000, 0b00100, 0b10101, 0b01110, 0b10101, 0b00100, 0b00000],
  '+': [0b00000, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0b00000],
  ',': [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00100, 0b01000],
  '-': [0b00000, 0b00000, 0b00000, 0b11111, 0b00000, 0b00000, 0b00000],
  '.': [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00100, 0b00100],
  '/': [0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b00000, 0b00000],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  '3': [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b01110, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
  ':': [0b00000, 0b00100, 0b00100, 0b00000, 0b00000, 0b00100, 0b00100],
  ';': [0b00000, 0b00100, 0b00100, 0b00000, 0b00000, 0b00100, 0b01000],
  '<': [0b00010, 0b00100, 0b01000, 0b10000, 0b01000, 0b00100, 0b00010],
  '=': [0b00000, 0b00000, 0b11111, 0b00000, 0b11111, 0b00000, 0b00000],
  '>': [0b01000, 0b00100, 0b00010, 0b00001, 0b00010, 0b00100, 0b01000],
  '?': [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b00000, 0b00100],
  '@': [0b01110, 0b10001, 0b10111, 0b10101, 0b10110, 0b10000, 0b01110],
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11100, 0b10010, 0b10001, 0b10001, 0b10001, 0b10010, 0b11100],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  '[': [0b01110, 0b01000, 0b01000, 0b01000, 0b01000, 0b01000, 0b01110],
  '\\': [0b10000, 0b01000, 0b00100, 0b00010, 0b00001, 0b00000, 0b00000],
  ']': [0b01110, 0b00010, 0b00010, 0b00010, 0b00010, 0b00010, 0b01110],
  '^': [0b00100, 0b01010, 0b10001, 0b00000, 0b00000, 0b00000, 0b00000],
  _: [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b11111],
  '`': [0b01000, 0b00100, 0b00010, 0b00000, 0b00000, 0b00000, 0b00000],
  a: [0b00000, 0b00000, 0b01110, 0b00001, 0b01111, 0b10001, 0b01111],
  b: [0b10000, 0b10000, 0b10110, 0b11001, 0b10001, 0b10001, 0b11110],
  c: [0b00000, 0b00000, 0b01110, 0b10000, 0b10000, 0b10001, 0b01110],
  d: [0b00001, 0b00001, 0b01101, 0b10011, 0b10001, 0b10001, 0b01111],
  e: [0b00000, 0b00000, 0b01110, 0b10001, 0b11111, 0b10000, 0b01110],
  f: [0b00110, 0b01001, 0b01000, 0b11100, 0b01000, 0b01000, 0b01000],
  g: [0b00000, 0b01111, 0b10001, 0b10001, 0b01111, 0b00001, 0b01110],
  h: [0b10000, 0b10000, 0b10110, 0b11001, 0b10001, 0b10001, 0b10001],
  i: [0b00100, 0b00000, 0b01100, 0b00100, 0b00100, 0b00100, 0b01110],
  j: [0b00010, 0b00000, 0b00110, 0b00010, 0b00010, 0b10010, 0b01100],
  k: [0b10000, 0b10000, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010],
  l: [0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  m: [0b00000, 0b00000, 0b11010, 0b10101, 0b10101, 0b10001, 0b10001],
  n: [0b00000, 0b00000, 0b10110, 0b11001, 0b10001, 0b10001, 0b10001],
  o: [0b00000, 0b00000, 0b01110, 0b10001, 0b10001, 0b10001, 0b01110],
  p: [0b00000, 0b00000, 0b11110, 0b10001, 0b11110, 0b10000, 0b10000],
  q: [0b00000, 0b00000, 0b01101, 0b10011, 0b01111, 0b00001, 0b00001],
  r: [0b00000, 0b00000, 0b10110, 0b11001, 0b10000, 0b10000, 0b10000],
  s: [0b00000, 0b00000, 0b01110, 0b10000, 0b01110, 0b00001, 0b11110],
  t: [0b01000, 0b01000, 0b11100, 0b01000, 0b01000, 0b01001, 0b00110],
  u: [0b00000, 0b00000, 0b10001, 0b10001, 0b10001, 0b10011, 0b01101],
  v: [0b00000, 0b00000, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  w: [0b00000, 0b00000, 0b10001, 0b10001, 0b10101, 0b10101, 0b01010],
  x: [0b00000, 0b00000, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001],
  y: [0b00000, 0b00000, 0b10001, 0b10001, 0b01111, 0b00001, 0b01110],
  z: [0b00000, 0b00000, 0b11111, 0b00010, 0b00100, 0b01000, 0b11111],
  '{': [0b00010, 0b00100, 0b00100, 0b01000, 0b00100, 0b00100, 0b00010],
  '|': [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  '}': [0b01000, 0b00100, 0b00100, 0b00010, 0b00100, 0b00100, 0b01000],
  '~': [0b00000, 0b00000, 0b01000, 0b10101, 0b00010, 0b00000, 0b00000],
};

// Lowercase alias — glyphs above include both cases
