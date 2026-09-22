import * as fs from 'fs';
import * as path from 'path';
import { encode as encodePng } from 'fast-png';
import { generateQrMatrix, drawQrCode } from '../src/printing/renderer/qrcode';
import type { GrayBitmap } from '../src/printing/document/types';

import { createWhiteGray } from '../src/printing/raster/bitmap';

const artifactDir = '/Users/aadityabasisth/.gemini/antigravity-ide/brain/41a538fa-2287-47ef-ab7e-790df6595946';

// Generate QR bitmap using app's drawQrCode rasterizer
const payload = 'https://example.com';
const w = 400;
const h = 400;

const dest = createWhiteGray(w, h);
drawQrCode(dest, payload, 20, 20, 360, 360);

// Convert 8bpp grayscale to 32bpp RGBA for standard PNG
const rgba = new Uint8Array(w * h * 4);
for (let i = 0; i < w * h; i++) {
  const g = dest.gray[i];
  rgba[i * 4 + 0] = g;
  rgba[i * 4 + 1] = g;
  rgba[i * 4 + 2] = g;
  rgba[i * 4 + 3] = 255;
}

const pngData = encodePng({
  width: w,
  height: h,
  data: rgba,
});

const outPath = path.join(artifactDir, 'scannable_qr_test.png');
fs.writeFileSync(outPath, Buffer.from(pngData));
console.log('Saved scannable QR test image to:', outPath);
