import { code128Bars } from '@/lib/barcode-code128';
import type { GrayBitmap } from '@/printing/document/types';
import { fillRect } from '@/printing/raster/bitmap';

export function drawCode128(dest: GrayBitmap, payload: string, x: number, y: number, w: number, h: number): void {
  const bars = code128Bars(payload);
  if (!bars || w <= 0 || h <= 0) return;
  for (const bar of bars) {
    fillRect(dest, x + bar.x * w, y, bar.width * w, h, 0);
  }
}
