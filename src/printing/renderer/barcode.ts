import { barcodeBarsForMode } from '@/lib/barcode-code128';
import type { GrayBitmap } from '@/printing/document/types';
import { fillRect } from '@/printing/raster/bitmap';

export function drawCode128(dest: GrayBitmap, payload: string, x: number, y: number, w: number, h: number): void {
  drawBarcodeByMode(dest, payload, 'CODE-128', x, y, w, h);
}

export function drawBarcodeByMode(
  dest: GrayBitmap,
  payload: string,
  mode: string,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const bars = barcodeBarsForMode(mode, payload);
  if (!bars || w <= 0 || h <= 0) return;
  for (const bar of bars) {
    fillRect(dest, x + bar.x * w, y, Math.max(1, bar.width * w), h, 0);
  }
}
