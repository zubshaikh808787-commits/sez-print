/**
 * Vector SVG Barcode & QR Code Generator.
 * Provides crisp vector representations for React Native SVG and HTML/PDF rendering.
 */

import { barcodeBarsForMode, encodeCode128 } from '@/lib/barcode-code128';

export type BarcodeBar = {
  x: number; // 0 to 1 fraction
  width: number; // fraction
};

export type VectorBarcodeResult = {
  bars: BarcodeBar[];
  totalModules: number;
  svgHtml: string;
};

/**
 * Generates vector bar positions and an SVG string for CODE128 barcodes.
 */
export function generateCode128Vector(
  value: string,
  widthPx: number,
  heightPx: number,
  color = '#000000',
  showValue = true,
): VectorBarcodeResult {
  const bars = barcodeBarsForMode('CODE-128', value || 'SAMPLE123');
  if (!bars || bars.length === 0) {
    return {
      bars: [],
      totalModules: 0,
      svgHtml: `<svg width="${widthPx}" height="${heightPx}"><text x="50%" y="50%" text-anchor="middle" fill="${color}" font-size="12">Invalid Barcode</text></svg>`,
    };
  }

  const labelHeight = showValue ? Math.min(18, Math.max(10, heightPx * 0.2)) : 0;
  const barHeight = Math.max(4, heightPx - labelHeight);

  // Generate clean SVG HTML snippet
  const rectsHtml = bars
    .map((bar) => {
      const x = (bar.x * widthPx).toFixed(2);
      const w = Math.max(1, bar.width * widthPx).toFixed(2);
      return `<rect x="${x}" y="0" width="${w}" height="${barHeight.toFixed(2)}" fill="${color}" />`;
    })
    .join('');

  const textHtml = showValue
    ? `<text x="${(widthPx / 2).toFixed(2)}" y="${heightPx.toFixed(2)}" text-anchor="middle" font-family="monospace, monospace" font-size="${labelHeight.toFixed(2)}px" font-weight="600" fill="${color}">${escapeHtml(value)}</text>`
    : '';

  const svgHtml = `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${widthPx} ${heightPx}">${rectsHtml}${textHtml}</svg>`;

  return {
    bars,
    totalModules: bars.length,
    svgHtml,
  };
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
