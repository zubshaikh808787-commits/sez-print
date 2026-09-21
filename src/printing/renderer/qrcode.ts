/**
 * Crisp QR code renderer for printer output.
 * Renders QR modules as exact black/white squares — no anti-aliasing.
 * Uses standards-compliant ISO/IEC 18004 QR encoder via qrcode engine.
 */

import QRCode from 'qrcode';
import type { GrayBitmap } from '@/printing/document/types';
import { fillRect } from '@/printing/raster/bitmap';

export type QrMatrix = { size: number; data: Uint8Array };

/**
 * Generate a standards-compliant QR Code matrix (ISO/IEC 18004).
 * Returns size (width/height in modules) and a Uint8Array where 1 = black, 0 = white.
 */
export function generateQrMatrix(
  text: string,
  ecLevel: 'L' | 'M' | 'Q' | 'H' = 'M',
): QrMatrix | null {
  if (!text) return null;
  try {
    const qr = QRCode.create(text, { errorCorrectionLevel: ecLevel });
    const size = qr.modules.size;
    const data = new Uint8Array(qr.modules.data);
    return { size, data };
  } catch {
    return null;
  }
}

/**
 * Draw a QR code for `payload` into `dest` at the given dot rectangle.
 * Each module is rendered as a sharp integer-sized square.
 */
export function drawQrCode(
  dest: GrayBitmap,
  payload: string,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  if (!payload || w <= 0 || h <= 0) return;

  const matrix = generateQrMatrix(payload);
  if (!matrix || matrix.size === 0) return;

  const size = Math.min(w, h);
  const moduleSize = Math.max(1, Math.floor(size / matrix.size));
  const totalSize = moduleSize * matrix.size;

  // Center the QR code in the box
  const ox = x + Math.floor((w - totalSize) / 2);
  const oy = y + Math.floor((h - totalSize) / 2);

  // White background for quiet zone
  fillRect(dest, x, y, w, h, 255);

  // Draw modules
  for (let row = 0; row < matrix.size; row++) {
    for (let col = 0; col < matrix.size; col++) {
      if (matrix.data[row * matrix.size + col]) {
        fillRect(
          dest,
          ox + col * moduleSize,
          oy + row * moduleSize,
          moduleSize,
          moduleSize,
          0,
        );
      }
    }
  }
}
