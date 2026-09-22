import * as zxing from '@zxing/library';
import { generateQrMatrix } from '../src/printing/renderer/qrcode';

console.log('--- Testing Current generateQrMatrix with ZXing QRCodeReader ---');

const testStrings = ['TEST1234', 'https://example.com', 'Hello World', '1234567890'];

for (const text of testStrings) {
  const matrix = generateQrMatrix(text);
  if (!matrix) {
    console.error(`FAILED to generate matrix for '${text}'`);
    continue;
  }

  console.log(`\nGenerated QR size: ${matrix.size}x${matrix.size} for '${text}'`);

  // Render to a grayscale bitmap with 4 modules of quiet zone
  const qz = 4;
  const modulePx = 8;
  const totalModules = matrix.size + qz * 2;
  const imgW = totalModules * modulePx;
  const imgH = totalModules * modulePx;
  const lum = new Uint8ClampedArray(imgW * imgH).fill(255);

  for (let r = 0; r < matrix.size; r++) {
    for (let c = 0; c < matrix.size; c++) {
      if (matrix.data[r * matrix.size + c]) {
        const startX = (c + qz) * modulePx;
        const startY = (r + qz) * modulePx;
        for (let py = 0; py < modulePx; py++) {
          for (let px = 0; px < modulePx; px++) {
            lum[(startY + py) * imgW + (startX + px)] = 0;
          }
        }
      }
    }
  }

  const source = new zxing.RGBLuminanceSource(lum, imgW, imgH);
  const bitmap = new zxing.BinaryBitmap(new zxing.GlobalHistogramBinarizer(source));
  const hints = new Map();
  hints.set(zxing.DecodeHintType.POSSIBLE_FORMATS, [zxing.BarcodeFormat.QR_CODE]);
  const reader = new zxing.MultiFormatReader();
  reader.setHints(hints);

  try {
    const result = reader.decode(bitmap);
    console.log(`  ✓ Successfully decoded: '${result.getText()}' (matched: ${result.getText() === text})`);
  } catch (e: any) {
    console.error(`  ✗ Decode FAILED for '${text}': ${e.message || e}`);
  }
}
