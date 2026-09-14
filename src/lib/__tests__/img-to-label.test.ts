/**
 * Tests for unit-conversion.ts and img-to-label-engine.ts
 */

// ──────────────────────────────────────────────────────────────────────────
// Minimal test harness (no external test runner needed)
// ──────────────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

function assertClose(actual: number, expected: number, tolerance: number, message: string) {
  assert(Math.abs(actual - expected) <= tolerance, `${message} (got ${actual}, expected ${expected})`);
}

function group(name: string, fn: () => void) {
  console.log(`\n${name}`);
  fn();
}

// ──────────────────────────────────────────────────────────────────────────
// unit-conversion.ts
// ──────────────────────────────────────────────────────────────────────────
import {
  mmToPixels,
  inchesToPixels,
  cmToPixels,
  pixelsToMm,
  pixelsToInches,
  pixelsToCm,
  calcPrintDimensions,
  convertToMm,
  convertFromMm,
  formatPrintPixels,
  formatDimension,
} from '@/lib/unit-conversion';

group('unit-conversion: mmToPixels', () => {
  // 4 inch = 101.6 mm @ 203 DPI
  assertClose(mmToPixels(101.6, 203), 812, 1, '101.6mm @ 203 DPI ≈ 812 px');
  // 6 inch = 152.4 mm @ 203 DPI
  assertClose(mmToPixels(152.4, 203), 1218, 1, '152.4mm @ 203 DPI ≈ 1218 px');
  // A4 width @ 300 DPI
  assertClose(mmToPixels(210, 300), 2480, 2, '210mm @ 300 DPI ≈ 2480 px');
  // Edge cases
  assert(mmToPixels(0, 203) === 0, '0mm = 0 px');
  assert(mmToPixels(NaN, 203) === 0, 'NaN mm = 0 px');
  assert(mmToPixels(100, 0) === 0, '0 DPI = 0 px');
});

group('unit-conversion: inchesToPixels', () => {
  assert(inchesToPixels(4, 203) === 812, '4in @ 203 DPI = 812 px');
  assert(inchesToPixels(6, 203) === 1218, '6in @ 203 DPI = 1218 px');
  assert(inchesToPixels(4, 300) === 1200, '4in @ 300 DPI = 1200 px');
  assert(inchesToPixels(6, 300) === 1800, '6in @ 300 DPI = 1800 px');
});

group('unit-conversion: cmToPixels', () => {
  // 10 cm = 100 mm = ~394 px @ 100 DPI
  assertClose(cmToPixels(10, 100), 394, 1, '10cm @ 100 DPI ≈ 394 px');
  assert(cmToPixels(2.54, 100) === 100, '2.54cm @ 100 DPI = 100 px');
});

group('unit-conversion: reverse conversions', () => {
  assertClose(pixelsToMm(812, 203), 101.6, 0.2, '812 px @ 203 DPI ≈ 101.6 mm');
  assertClose(pixelsToInches(812, 203), 4, 0.01, '812 px @ 203 DPI ≈ 4 in');
  assertClose(pixelsToCm(812, 203), 10.16, 0.02, '812 px @ 203 DPI ≈ 10.16 cm');
});

group('unit-conversion: convertToMm / convertFromMm', () => {
  assertClose(convertToMm(4, 'in'), 101.6, 0.01, '4 in = 101.6 mm');
  assertClose(convertToMm(10, 'cm'), 100, 0.01, '10 cm = 100 mm');
  assertClose(convertToMm(50, 'mm'), 50, 0.01, '50 mm = 50 mm');
  assertClose(convertFromMm(101.6, 'in'), 4, 0.01, '101.6 mm = 4 in');
  assertClose(convertFromMm(100, 'cm'), 10, 0.01, '100 mm = 10 cm');
});

group('unit-conversion: formatPrintPixels', () => {
  const s = formatPrintPixels(812, 1218, 203);
  assert(s === '812 × 1218 px @ 203 DPI', `format: "${s}"`);
});

group('unit-conversion: formatDimension', () => {
  const s = formatDimension(101.6, 'mm');
  assert(s === '101.60 mm', `mm format: "${s}"`);
  const sIn = formatDimension(101.6, 'in');
  assert(sIn === '4.00 in', `in format: "${sIn}"`);
});

// ──────────────────────────────────────────────────────────────────────────
// img-to-label-engine.ts
// ──────────────────────────────────────────────────────────────────────────
import {
  resolveOrientation,
  calcPrintCanvas,
  calcPreviewScale,
  renderImgToLabel,
  defaultImgToLabelConfig,
  type ImgToLabelConfig,
} from '@/lib/img-to-label-engine';
import type { GrayRaster } from '@/lib/printer/escpos';

function makeGray(w: number, h: number, value = 128): GrayRaster {
  const gray = new Uint8Array(w * h);
  gray.fill(value);
  return { width: w, height: h, gray };
}

group('img-to-label-engine: resolveOrientation', () => {
  const portrait = resolveOrientation(100, 150, 'portrait');
  assert(portrait.widthMm === 100 && portrait.heightMm === 150, 'portrait keeps original');

  const landscape = resolveOrientation(100, 150, 'landscape');
  assert(landscape.widthMm === 150 && landscape.heightMm === 100, 'landscape swaps');

  const autoMatch = resolveOrientation(100, 150, 'auto', 300, 500);
  assert(autoMatch.widthMm === 100 && autoMatch.heightMm === 150, 'auto: portrait image → portrait label');

  const autoSwap = resolveOrientation(100, 150, 'auto', 500, 300);
  assert(autoSwap.widthMm === 150 && autoSwap.heightMm === 100, 'auto: landscape image → landscape label');
});

group('img-to-label-engine: calcPrintCanvas', () => {
  // 4×6 inch @ 203 DPI — print-spec uses dotsPerMm which is 8 for 203 DPI
  const canvas203 = calcPrintCanvas(101.6, 152.4, 203);
  // 101.6 mm × 8 dots/mm = 812.8 → rounded
  assertClose(canvas203.widthPx, 813, 2, '4×6 @ 203 DPI width ≈ 813 dots');
  assertClose(canvas203.heightPx, 1219, 2, '4×6 @ 203 DPI height ≈ 1219 dots');
  assert(canvas203.geometry.dpi === 203, 'geometry carries DPI');
});

group('img-to-label-engine: calcPreviewScale', () => {
  const p = calcPreviewScale(100, 150, 300, 400);
  assert(p.previewWidth <= 300, 'preview width fits');
  assert(p.previewHeight <= 400, 'preview height fits');
  // Aspect ratio preserved
  const aspect = p.previewWidth / p.previewHeight;
  assertClose(aspect, 100 / 150, 0.02, 'preview preserves aspect ratio');
});

group('img-to-label-engine: renderImgToLabel contain', () => {
  // A4-ish image (2480×3508) into 4×6 inch label
  const src = makeGray(2480, 3508, 100);
  const config = defaultImgToLabelConfig(101.6, 152.4, 203);
  config.fitMode = 'contain';
  const result = renderImgToLabel(src, config);

  // Result must match label physical size at printer DPI
  assert(result.widthMm === 101.6, 'result widthMm matches');
  assert(result.heightMm === 152.4, 'result heightMm matches');
  assert(result.dpi === 203, 'result DPI matches');
  assert(result.gray.width === result.widthPx, 'gray width matches widthPx');
  assert(result.gray.height === result.heightPx, 'gray height matches heightPx');
  assert(result.fitMode === 'contain', 'fit mode is contain');

  // Not all white (image content should be present)
  const hasContent = result.gray.gray.some(v => v !== 255);
  assert(hasContent, 'contain output has image content');
});

group('img-to-label-engine: renderImgToLabel cover', () => {
  const src = makeGray(800, 600, 50);
  const config = defaultImgToLabelConfig(101.6, 152.4, 203);
  config.fitMode = 'cover';
  const result = renderImgToLabel(src, config);

  assert(result.gray.width === result.widthPx, 'cover: gray width matches');
  assert(result.gray.height === result.heightPx, 'cover: gray height matches');
  // In cover mode, no white border should exist on edges
  const hasContent = result.gray.gray.some(v => v !== 255);
  assert(hasContent, 'cover output has image content');
});

group('img-to-label-engine: renderImgToLabel stretch', () => {
  const src = makeGray(400, 300, 75);
  const config = defaultImgToLabelConfig(50, 30, 304);
  config.fitMode = 'stretch';
  const result = renderImgToLabel(src, config);

  assert(result.gray.width === result.widthPx, 'stretch: gray matches widthPx');
  assert(result.gray.height === result.heightPx, 'stretch: gray matches heightPx');
});

group('img-to-label-engine: renderImgToLabel with rotation', () => {
  const src = makeGray(100, 200, 128);
  const config = defaultImgToLabelConfig(50, 30, 203);
  config.imageRotationDeg = 90;
  const result = renderImgToLabel(src, config);
  // After 90° rotation, the source is 200×100 but output should still be label-sized
  assert(result.gray.width === result.widthPx, 'rotated: width matches');
  assert(result.gray.height === result.heightPx, 'rotated: height matches');
});

group('img-to-label-engine: same config = same output', () => {
  const src = makeGray(500, 700, 100);
  const config = defaultImgToLabelConfig(101.6, 152.4, 203);

  const r1 = renderImgToLabel(src, config);
  const r2 = renderImgToLabel(src, config);

  assert(r1.widthPx === r2.widthPx, 'deterministic: same widthPx');
  assert(r1.heightPx === r2.heightPx, 'deterministic: same heightPx');
  let match = true;
  for (let i = 0; i < r1.gray.gray.length; i++) {
    if (r1.gray.gray[i] !== r2.gray.gray[i]) { match = false; break; }
  }
  assert(match, 'deterministic: identical pixel data');
});

// ──────────────────────────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(50)}`);
if (failed > 0) process.exit(1);
