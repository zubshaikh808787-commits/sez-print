import { createPrintDocument, type PrintDocument, type PrintElement } from '@/printing/document/types';
import { createWhiteGray, type GrayBitmap } from '@/printing/raster/bitmap';

/**
 * Millimetre geometry proof. No screen pixels. No ViewShot.
 *
 * Default 50 × 25 mm:
 * outer border, 10 mm square, 20 mm horizontal line, center cross, caption.
 */
export function createPhysicalProofDocument(
  widthMm = 50,
  heightMm = 25,
): PrintDocument {
  const strokeMm = 0.35;
  const elements: PrintElement[] = [
    {
      id: 'outer-border',
      type: 'rectangle',
      xMm: 0,
      yMm: 0,
      widthMm,
      heightMm,
      rotation: 0,
      visible: true,
      data: { fill: false, strokeMm },
    },
  ];

  if (widthMm >= 16 && heightMm >= 16) {
    elements.push({
      id: 'square-10mm',
      type: 'rectangle',
      xMm: 5,
      yMm: 5,
      widthMm: 10,
      heightMm: 10,
      rotation: 0,
      visible: true,
      data: { fill: false, strokeMm },
    });
  }

  const lineY = heightMm * 0.78;
  if (widthMm >= 22) {
    elements.push({
      id: 'line-20mm',
      type: 'line',
      xMm: (widthMm - 20) / 2,
      yMm: lineY,
      widthMm: 20,
      heightMm: strokeMm,
      rotation: 0,
      visible: true,
      data: {},
    });
  }

  const cx = widthMm / 2;
  const cy = heightMm / 2;
  const cross = Math.min(8, widthMm * 0.32, heightMm * 0.5);
  elements.push(
    {
      id: 'cross-h',
      type: 'line',
      xMm: cx - cross / 2,
      yMm: cy - strokeMm / 2,
      widthMm: cross,
      heightMm: strokeMm,
      rotation: 0,
      visible: true,
      data: {},
    },
    {
      id: 'cross-v',
      type: 'line',
      xMm: cx - strokeMm / 2,
      yMm: cy - cross / 2,
      widthMm: strokeMm,
      heightMm: cross,
      rotation: 0,
      visible: true,
      data: {},
    },
  );

  const caption = `${formatMm(widthMm)}x${formatMm(heightMm)}`;
  const textW = Math.min(22, widthMm * 0.55);
  const textH = Math.min(4.2, heightMm * 0.18);
  elements.push({
    id: 'centered-text',
    type: 'image',
    xMm: (widthMm - textW) / 2,
    yMm: cy + cross / 2 + 0.6,
    widthMm: textW,
    heightMm: textH,
    rotation: 0,
    visible: true,
    data: {
      gray: bitmapCaption(caption),
      fit: 'stretch',
      dither: false,
    },
  });

  return createPrintDocument({
    id: `physical-proof-${widthMm}x${heightMm}`,
    widthMm,
    heightMm,
    elements,
    metadata: { kind: 'physical-proof' },
  });
}

function formatMm(mm: number): string {
  return Number.isInteger(mm) ? String(mm) : String(Math.round(mm * 100) / 100);
}

/** 5×7 bitmap font — proof caption only, not editor text. */
const GLYPHS: Record<string, number[]> = {
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
  x: [0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b01010, 0b10001],
  '.': [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00100, 0b00100],
};

function bitmapCaption(text: string): GrayBitmap {
  const chars = text.toLowerCase().split('');
  const gw = 5;
  const gh = 7;
  const gap = 1;
  const pad = 1;
  const width = pad * 2 + chars.length * gw + Math.max(0, chars.length - 1) * gap;
  const height = pad * 2 + gh;
  const out = createWhiteGray(width, height);
  chars.forEach((ch, index) => {
    const glyph = GLYPHS[ch];
    if (!glyph) return;
    const ox = pad + index * (gw + gap);
    for (let y = 0; y < gh; y++) {
      const row = glyph[y] ?? 0;
      for (let x = 0; x < gw; x++) {
        if (row & (1 << (gw - 1 - x))) {
          out.gray[(y + pad) * width + ox + x] = 0;
        }
      }
    }
  });
  return out;
}
