import * as zxing from '@zxing/library';
import QRCode from 'qrcode';

// Test drawing a QR code directly to a grayscale bitmap like drawQrCode does
const qr = QRCode.create('TEST1234', { errorCorrectionLevel: 'M' });
const matrixSize = qr.modules.size;

const w = 200;
const h = 200;
const size = Math.min(w, h);
const moduleSize = Math.max(1, Math.floor(size / matrixSize));
const totalSize = moduleSize * matrixSize;
const ox = Math.floor((w - totalSize) / 2);
const oy = Math.floor((h - totalSize) / 2);

const lum = new Uint8ClampedArray(w * h).fill(255);

for (let r = 0; r < matrixSize; r++) {
  for (let c = 0; c < matrixSize; c++) {
    if (qr.modules.get(r, c)) {
      const startX = ox + c * moduleSize;
      const startY = oy + r * moduleSize;
      for (let py = 0; py < moduleSize; py++) {
        for (let px = 0; px < moduleSize; px++) {
          lum[(startY + py) * w + (startX + px)] = 0;
        }
      }
    }
  }
}

const source = new zxing.RGBLuminanceSource(lum, w, h);
const bitmap = new zxing.BinaryBitmap(new zxing.HybridBinarizer(source));
const reader = new zxing.QRCodeReader();
const res = reader.decode(bitmap);
console.log('Decoded text:', res.getText());
