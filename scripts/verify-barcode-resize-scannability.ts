import * as zxing from '@zxing/library';
import { barcodeModulesForMode } from '../src/lib/barcode-code128';
import { snap1DBarcodeModules } from '../src/lib/barcode/barcode-snapping';

console.log('--- Verifying Barcode Scannability Across Varied Dimensions ---');

const content = '1234567890';
const raw = barcodeModulesForMode('CODE-128', content);
if (!raw) {
  console.error('Failed to encode raw modules');
  process.exit(1);
}

const widthsToTest = [18, 26, 34.21, 45]; // Range of widths (East handle)
const heightsToTest = [4, 8, 12, 19.27, 28]; // Range of heights (South handle)

let pass = 0;
let total = 0;

for (const wMm of widthsToTest) {
  const snapped = snap1DBarcodeModules(raw, wMm, 203, false);
  if (!snapped) continue;

  for (const hMm of heightsToTest) {
    total++;
    // Simulate rendered pixels at 8 dots/mm
    const scale = 2;
    const totalDots = snapped.quantizedWidthDots;
    const qzDots = 15;
    const imgW = (totalDots + qzDots * 2) * scale;
    const barH = Math.max(16, Math.round(hMm * 8 * scale));
    const marginY = 10;
    const imgH = barH + marginY * 2;
    const lum = new Uint8ClampedArray(imgW * imgH).fill(255);

    for (const bar of snapped.bars) {
      const startX = (qzDots + bar.dotX) * scale;
      const bw = bar.dotWidth * scale;
      for (let y = marginY; y < marginY + barH; y++) {
        for (let x = startX; x < startX + bw; x++) {
          lum[y * imgW + x] = 0;
        }
      }
    }

    const source = new zxing.RGBLuminanceSource(lum, imgW, imgH);
    const bitmap = new zxing.BinaryBitmap(new zxing.GlobalHistogramBinarizer(source));
    const hints = new Map();
    hints.set(zxing.DecodeHintType.POSSIBLE_FORMATS, [zxing.BarcodeFormat.CODE_128]);
    const reader = new zxing.MultiFormatReader();
    reader.setHints(hints);

    try {
      const result = reader.decode(bitmap);
      if (result.getText() === content) {
        pass++;
        console.log(`  ✓ Width ${wMm.toFixed(2).padStart(5)}mm × Height ${hMm.toFixed(2).padStart(5)}mm: Decoded '${result.getText()}'`);
      } else {
        console.error(`  ✗ Width ${wMm}mm × Height ${hMm}mm: Mismatch`);
      }
    } catch (e) {
      console.error(`  ✗ Width ${wMm}mm × Height ${hMm}mm: Decode failed`);
    }
  }
}

console.log(`\nResult: ${pass}/${total} combinations successfully scanned.`);
if (pass === total) {
  console.log('100% SUCCESS: Verified scannable across all tested vertical and horizontal resize dimensions.');
} else {
  process.exit(1);
}
