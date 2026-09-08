/**
 * Automated tests for Phase 5: Barcode & QR Code Elements.
 */

import {
  calculateCode128WidthMm,
  resolveQrCellWidth,
  calculateQrFootprintMm,
  validateScannability,
  exportCanvasToTspl,
  type CanvasDocument,
  type CanvasBarcodeElement,
  type CanvasQrElement,
} from '../canvas-export';
import { DOTS_PER_MM } from '../calibration';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function runBarcodeQrElementTests(): void {
  console.log('--- Phase 5: Barcode & QR Code Element Tests ---');

  // Test 1: Code 128 width calculation
  const widthEmpty = calculateCode128WidthMm('');
  assert(widthEmpty === 0, `Empty barcode width should be 0, got ${widthEmpty}`);

  // "12345678" -> 8 digits -> 4 Code C pairs -> 55 + 44 = 99 modules * 2 dots = 198 dots / 11.9685 ≈ 16.54 mm
  const widthDigits = calculateCode128WidthMm('12345678', 2);
  assert(
    widthDigits >= 16.0 && widthDigits <= 17.0,
    `8-digit Code 128 width should be ~16.5mm, got ${widthDigits}mm`,
  );

  // "SEZ-PRINT" -> 9 chars -> 55 + 99 = 154 modules * 2 dots = 308 dots / 11.9685 ≈ 25.73 mm
  const widthAlpha = calculateCode128WidthMm('SEZ-PRINT', 2);
  assert(
    widthAlpha >= 25.0 && widthAlpha <= 26.5,
    `Alphanumeric Code 128 width should be ~25.7mm, got ${widthAlpha}mm`,
  );

  // narrowDots = 3 should be 1.5x larger than narrowDots = 2
  const width3 = calculateCode128WidthMm('SEZ-PRINT', 3);
  assert(
    Math.abs(width3 - widthAlpha * 1.5) < 0.5,
    `narrowDots=3 should scale width by 1.5x: ${width3} vs ${widthAlpha * 1.5}`,
  );
  console.log('ok Code 128 width calculation accurately models module counts and Code C compression');

  // Test 2: QR cell width resolution and footprint
  const cell8mm = resolveQrCellWidth(8, 20);
  assert(cell8mm === 2, `8mm QR should resolve to 2 dots per cell, got ${cell8mm}`);

  const cell12mm = resolveQrCellWidth(12, 20);
  assert(cell12mm === 4, `12mm QR should resolve to 4 dots per cell, got ${cell12mm}`);

  const cell16mm = resolveQrCellWidth(16, 20);
  assert(cell16mm === 5, `16mm QR should resolve to 5 dots per cell, got ${cell16mm}`);

  const cell20mm = resolveQrCellWidth(20, 20);
  assert(cell20mm === 7, `20mm QR should resolve to 7 dots per cell, got ${cell20mm}`);

  const footprint12mm = calculateQrFootprintMm(cell12mm, 20);
  assert(
    footprint12mm >= 10.0 && footprint12mm <= 12.0,
    `12mm target QR footprint should be ~11mm, got ${footprint12mm}mm`,
  );
  console.log('ok QR cell width resolution and footprint calculation verified across physical dimensions');

  // Test 3: Scannability validation
  // 3a: Valid barcode
  const validBarcode: CanvasBarcodeElement = {
    id: 'bc-1',
    type: 'barcode',
    data: '12345678',
    left: 5,
    top: 5,
    height: 10,
  };
  const validBcResult = validateScannability(validBarcode, 50, 30);
  assert(validBcResult.isScannable, `Valid barcode should be scannable`);
  assert(validBcResult.warnings.length === 0, `Valid barcode should have 0 warnings`);

  // 3b: Undersized barcode height (< 5mm)
  const shortBarcode: CanvasBarcodeElement = {
    ...validBarcode,
    height: 3.5,
  };
  const shortResult = validateScannability(shortBarcode, 50, 30);
  assert(!shortResult.isScannable, `Short barcode (<5mm) should fail scannability check`);
  assert(
    shortResult.warnings.some((w) => w.includes('under 5mm')),
    `Should warn about height under 5mm: ${shortResult.warnings.join(', ')}`,
  );

  // 3c: Barcode extending past label edge
  const overflowingBarcode: CanvasBarcodeElement = {
    ...validBarcode,
    left: 40, // 40 + ~16.5mm = 56.5mm > 50mm label
  };
  const overflowBcResult = validateScannability(overflowingBarcode, 50, 30);
  assert(!overflowBcResult.isScannable, `Overflowing barcode should fail scannability check`);
  assert(
    overflowBcResult.warnings.some((w) => w.includes('extends beyond right label edge')),
    `Should warn about right edge overflow: ${overflowBcResult.warnings.join(', ')}`,
  );

  // 3d: Valid QR code
  const validQr: CanvasQrElement = {
    id: 'qr-1',
    type: 'qr',
    data: 'https://example.com/item/1234',
    left: 5,
    top: 5,
    sizeMm: 14,
  };
  const validQrResult = validateScannability(validQr, 50, 30);
  assert(validQrResult.isScannable, `Valid 14mm QR code should be scannable`);

  // 3e: Undersized QR code (< 8mm)
  const smallQr: CanvasQrElement = {
    ...validQr,
    sizeMm: 6,
  };
  const smallQrResult = validateScannability(smallQr, 50, 30);
  assert(!smallQrResult.isScannable, `Sub-8mm QR code should fail scannability check`);
  assert(
    smallQrResult.warnings.some((w) => w.includes('under 8mm minimum threshold')),
    `Should warn about size < 8mm: ${smallQrResult.warnings.join(', ')}`,
  );

  // 3f: Empty data
  const emptyQr: CanvasQrElement = {
    ...validQr,
    data: '',
  };
  const emptyQrResult = validateScannability(emptyQr, 50, 30);
  assert(!emptyQrResult.isScannable, `Empty QR data should fail scannability check`);
  console.log('ok scannability validator flags size, overflow, and empty content edge cases');

  // Test 4: exportCanvasToTspl generates exact TSPL BARCODE command
  const barcodeDoc: CanvasDocument = {
    widthMm: 50,
    heightMm: 30,
    gapMm: 2,
    direction: 1,
    elements: [
      {
        id: 'bc-sample',
        type: 'barcode',
        data: 'SP-10023',
        left: 5,
        top: 8,
        height: 12,
        narrowDots: 2,
        readable: 1,
      },
    ],
  };

  const barcodeTspl = exportCanvasToTspl(barcodeDoc);
  const expectedBcX = Math.round(5 * DOTS_PER_MM); // 60
  const expectedBcY = Math.round(8 * DOTS_PER_MM); // 96
  const expectedBcHeightDots = Math.round(12 * DOTS_PER_MM); // 144
  const expectedBcCmd = `BARCODE ${expectedBcX},${expectedBcY},"128",${expectedBcHeightDots},1,0,2,2,"SP-10023"`;

  assert(
    barcodeTspl.includes(expectedBcCmd),
    `TSPL should include '${expectedBcCmd}', got:\n${barcodeTspl}`,
  );
  console.log(`ok exportCanvasToTspl generates exact TSPL BARCODE: ${expectedBcCmd}`);

  // Test 5: exportCanvasToTspl generates exact TSPL QRCODE command
  const qrDoc: CanvasDocument = {
    widthMm: 50,
    heightMm: 30,
    gapMm: 2,
    direction: 1,
    elements: [
      {
        id: 'qr-sample',
        type: 'qr',
        data: 'https://sez-print.local/verify',
        left: 28,
        top: 5,
        sizeMm: 16,
        eccLevel: 'M',
      },
    ],
  };

  const qrTspl = exportCanvasToTspl(qrDoc);
  const expectedQrX = Math.round(28 * DOTS_PER_MM); // 335
  const expectedQrY = Math.round(5 * DOTS_PER_MM); // 60
  const expectedCellWidth = resolveQrCellWidth(16, 'https://sez-print.local/verify'.length); // 5
  const expectedQrCmd = `QRCODE ${expectedQrX},${expectedQrY},M,${expectedCellWidth},A,0,M2,S7,"https://sez-print.local/verify"`;

  assert(
    qrTspl.includes(expectedQrCmd),
    `TSPL should include '${expectedQrCmd}', got:\n${qrTspl}`,
  );
  console.log(`ok exportCanvasToTspl generates exact TSPL QRCODE: ${expectedQrCmd}`);

  // Test 6: Full multi-element document (outer boundary + box + text + barcode + QR code)
  const fullDoc: CanvasDocument = {
    widthMm: 50,
    heightMm: 30,
    elements: [
      {
        id: 'title',
        type: 'text',
        text: 'INVENTORY TAG',
        left: 5,
        top: 3,
        fontSize: 14,
      },
      {
        id: 'divider',
        type: 'box',
        left: 5,
        top: 8,
        width: 40,
        height: 0.5,
      },
      {
        id: 'bc',
        type: 'barcode',
        data: 'INV-98765',
        left: 5,
        top: 10,
        height: 10,
      },
      {
        id: 'qr',
        type: 'qr',
        data: 'https://example.com/i/98765',
        left: 32,
        top: 10,
        sizeMm: 12,
      },
    ],
  };

  const fullTspl = exportCanvasToTspl(fullDoc, { printBoundary: true });
  assert(fullTspl.includes('BOX 0,0,'), 'Full doc TSPL should include outer boundary box');
  assert(fullTspl.includes('TEXT '), 'Full doc TSPL should include text command');
  assert(fullTspl.includes('BARCODE '), 'Full doc TSPL should include barcode command');
  assert(fullTspl.includes('QRCODE '), 'Full doc TSPL should include QR code command');
  assert(fullTspl.includes('PRINT 1'), 'Full doc TSPL should include print command');
  console.log('ok full document with boundary, box, text, barcode, and QR code exports accurately');

  console.log('ALL PHASE 5 BARCODE & QR CODE TESTS PASSED');
}
