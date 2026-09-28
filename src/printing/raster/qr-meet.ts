import { generateQrMatrix } from '@/printing/renderer/qrcode';

type FillTarget = {
  fillRect: (x: number, y: number, w: number, h: number, gray: number) => void;
};

/** Editor QrcodeContent: viewBox modules + preserveAspectRatio meet, integer cells. */
export function drawQrMeet(
  target: FillTarget,
  content: string,
  errorLevel: 'L' | 'M' | 'Q' | 'H',
  quietZone: number,
  x0: number,
  y0: number,
  boxW: number,
  boxH: number,
  ink: number,
): void {
  const matrix = generateQrMatrix(content, errorLevel);
  if (!matrix) throw new Error('QR encode failed');
  const qz = Math.max(0, quietZone);
  const total = matrix.size + qz * 2;
  const cell = Math.max(1, Math.floor(Math.min(boxW, boxH) / total));
  const drawn = cell * total;
  const ox = x0 + Math.floor((boxW - drawn) / 2);
  const oy = y0 + Math.floor((boxH - drawn) / 2);
  for (let r = 0; r < matrix.size; r++) {
    for (let c = 0; c < matrix.size; c++) {
      if (matrix.data[r * matrix.size + c]) {
        target.fillRect(ox + (c + qz) * cell, oy + (r + qz) * cell, cell, cell, ink);
      }
    }
  }
}
