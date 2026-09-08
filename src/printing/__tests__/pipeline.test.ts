/**
 * Automated tests for Phase 7: Full End-to-End Print Pipeline.
 */

import {
  exportUnifiedCanvasJob,
  createMonochromePatternRaster,
  type CanvasDocument,
} from '../canvas-export';
import { DOTS_PER_MM } from '../calibration';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function runPipelineTests(): void {
  console.log('--- Phase 7: End-to-End Print Pipeline Tests ---');

  // Test 1: Synthetic 1-bit monochrome pattern raster generation
  const widthDots = 240; // 30 bytes per row
  const heightDots = 100;
  const checkerRaster = createMonochromePatternRaster(widthDots, heightDots, 'checker', 2, 3);

  assert(checkerRaster.bytesPerRow === 30, `Expected bytesPerRow 30, got ${checkerRaster.bytesPerRow}`);
  assert(
    checkerRaster.data.length === 30 * 100,
    `Expected data length 3000, got ${checkerRaster.data.length}`,
  );
  assert(checkerRaster.leftMm === 2 && checkerRaster.topMm === 3, 'Raster coordinates preserved');
  assert(checkerRaster.data.some((b) => b > 0), 'Checkerboard contains ink dots');

  const solidRaster = createMonochromePatternRaster(16, 8, 'solid');
  assert(solidRaster.bytesPerRow === 2, '16 dots = 2 bytes per row');
  assert(solidRaster.data.every((b) => b === 0xff), 'Solid raster should be all 0xFF ink');

  const borderRaster = createMonochromePatternRaster(16, 8, 'border');
  assert(borderRaster.data[0] === 0xff, 'Border top row should be solid ink');
  console.log('ok createMonochromePatternRaster generates byte-aligned 1bpp rasters');

  // Test 2: Pure vector label job across multiple label sizes
  const sizes = [
    { w: 50, h: 30, gap: 2 },
    { w: 60, h: 40, gap: 3 },
    { w: 80, h: 50, gap: 2 },
  ];

  for (const sz of sizes) {
    const doc: CanvasDocument = {
      widthMm: sz.w,
      heightMm: sz.h,
      gapMm: sz.gap,
      direction: 1,
      elements: [
        { id: 'b1', type: 'box', left: 2, top: 2, width: sz.w - 4, height: sz.h - 4 },
        { id: 't1', type: 'text', text: `Size ${sz.w}x${sz.h} mm`, left: 5, top: 5, fontSize: 12 },
        { id: 'bc1', type: 'barcode', data: 'SEZ-12345', left: 5, top: 12, height: 8 },
        { id: 'qr1', type: 'qr', data: 'https://sez-print.app', left: sz.w - 18, top: 5, sizeMm: 12 },
      ],
    };

    const result = exportUnifiedCanvasJob(doc, { copies: 2 });
    assert(!result.hasBitmap, 'Vector job hasBitmap should be false');
    assert(result.totalBytes === result.binaryPayload.length, 'Total bytes matches payload');

    const ascii = result.tsplAscii;
    assert(ascii.includes(`SIZE ${sz.w} mm, ${sz.h} mm`), `Contains SIZE ${sz.w} mm, ${sz.h} mm`);
    assert(ascii.includes(`GAP ${sz.gap} mm, 0 mm`), `Contains GAP ${sz.gap} mm, 0 mm`);
    assert(ascii.includes('DIRECTION 1'), 'Contains DIRECTION 1');
    assert(ascii.includes('CLS'), 'Contains CLS');
    assert(ascii.includes('BOX '), 'Contains BOX');
    assert(ascii.includes('TEXT '), 'Contains TEXT');
    assert(ascii.includes('BARCODE '), 'Contains BARCODE');
    assert(ascii.includes('QRCODE '), 'Contains QRCODE');
    assert(ascii.includes('PRINT 2'), 'Contains PRINT 2 copies');

    // Decode binary payload and verify exact match with ascii
    const decoded = new TextDecoder().decode(result.binaryPayload);
    assert(decoded === ascii, 'Pure vector binary payload matches ASCII string exactly');
  }
  console.log('ok multi-size vector print jobs generate valid TSPL');

  // Test 3: Unified Job with Bitmap Raster + Vector Overlays
  const docWithBitmap: CanvasDocument = {
    widthMm: 50,
    heightMm: 30,
    gapMm: 2,
    elements: [
      { id: 't1', type: 'text', text: 'OVERLAY TEXT', left: 10, top: 5, fontSize: 14 },
      { id: 'qr1', type: 'qr', data: 'SEZ-HYBRID', left: 20, top: 15, sizeMm: 10 },
    ],
  };

  const testRaster = createMonochromePatternRaster(120, 60, 'checker', 5, 4);
  const hybridResult = exportUnifiedCanvasJob(docWithBitmap, {
    bitmap: testRaster,
    copies: 1,
    printBoundary: true,
  });

  assert(hybridResult.hasBitmap, 'hybrid job hasBitmap must be true');
  assert(hybridResult.tsplAscii.includes('SIZE 50 mm, 30 mm'), 'Includes SIZE');
  assert(hybridResult.tsplAscii.includes('BITMAP '), 'Inspector includes BITMAP command header');
  assert(hybridResult.tsplAscii.includes('[...binary raster: 900 bytes...]'), 'Inspector hides raw binary bytes');
  assert(hybridResult.tsplAscii.includes('BOX 0,0,598,359,4'), 'Includes boundary box');
  assert(hybridResult.tsplAscii.includes('TEXT '), 'Includes overlay text');
  assert(hybridResult.tsplAscii.includes('QRCODE '), 'Includes overlay QR');
  assert(hybridResult.tsplAscii.endsWith('PRINT 1\r\n'), 'Ends with PRINT 1');

  // Verify binary layout of hybrid job:
  // [Header ASCII (up to "BITMAP x,y,w,h,0,")] + [raw raster bytes] + ["\r\n" + overlay commands]
  const xDots = Math.round(5 * DOTS_PER_MM);
  const yDots = Math.round(4 * DOTS_PER_MM);
  const expectedPrefix = `SIZE 50 mm, 30 mm\r\nGAP 2 mm, 0 mm\r\nDIRECTION 1\r\nCLS\r\nBITMAP ${xDots},${yDots},15,60,0,`;
  const prefixBytes = new TextEncoder().encode(expectedPrefix);

  // Check prefix matches
  const actualPrefixBytes = hybridResult.binaryPayload.slice(0, prefixBytes.length);
  assert(
    new TextDecoder().decode(actualPrefixBytes) === expectedPrefix,
    'Binary prefix matches header before bitmap bytes',
  );

  // Check bitmap data matches exactly
  const actualBitmapBytes = hybridResult.binaryPayload.slice(
    prefixBytes.length,
    prefixBytes.length + testRaster.data.length,
  );
  assert(
    actualBitmapBytes.length === testRaster.data.length,
    `Bitmap payload length ${actualBitmapBytes.length} matches expected ${testRaster.data.length}`,
  );
  let bitmapMatch = true;
  for (let i = 0; i < testRaster.data.length; i++) {
    if (actualBitmapBytes[i] !== testRaster.data[i]) {
      bitmapMatch = false;
      break;
    }
  }
  assert(bitmapMatch, 'Bitmap binary bytes in payload match test raster exactly');

  // Check post-bitmap trailer starts with CRLF and contains vector overlays
  const trailerBytes = hybridResult.binaryPayload.slice(prefixBytes.length + testRaster.data.length);
  const trailerText = new TextDecoder().decode(trailerBytes);
  assert(trailerText.startsWith('\r\n'), 'Trailer immediately after binary bitmap must start with CRLF');
  assert(trailerText.includes('BOX '), 'Trailer includes vector BOX');
  assert(trailerText.includes('TEXT '), 'Trailer includes vector TEXT');
  assert(trailerText.includes('QRCODE '), 'Trailer includes vector QRCODE');
  assert(trailerText.endsWith('PRINT 1\r\n'), 'Trailer ends with PRINT 1');
  console.log('ok hybrid bitmap + vector overlay payload is bit-perfect');

  // Test 4: Execution Order in Frame Buffer
  const clsIndex = hybridResult.tsplAscii.indexOf('CLS');
  const bitmapIndex = hybridResult.tsplAscii.indexOf('BITMAP');
  const boxIndex = hybridResult.tsplAscii.indexOf('BOX');
  const textIndex = hybridResult.tsplAscii.indexOf('TEXT');
  const printIndex = hybridResult.tsplAscii.indexOf('PRINT');

  assert(clsIndex < bitmapIndex, 'CLS must execute before BITMAP');
  assert(bitmapIndex < boxIndex, 'BITMAP must execute before overlay BOX');
  assert(boxIndex < textIndex, 'BOX executes before TEXT');
  assert(textIndex < printIndex, 'TEXT executes before PRINT');
  console.log('ok frame buffer execution order (CLS -> BITMAP -> OVERLAYS -> PRINT) verified');

  console.log('=== All Phase 7 Pipeline Tests Passed! ===\n');
}
