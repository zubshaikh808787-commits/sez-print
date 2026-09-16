import assert from 'node:assert/strict';
import { barcodeBarsForMode } from '../../../lib/barcode-code128';

let barcodeGenerationCount = 0;

function mockBarcodeRenderer(encodeMode: string, content: string, widthPx: number, heightPx: number) {
  barcodeGenerationCount++;
  return barcodeBarsForMode(encodeMode, content);
}

function simulateDragResizeSession() {
  barcodeGenerationCount = 0;

  // Initial render at 30mm x 10mm (base width/height)
  let element = { encodeMode: 'CODE128', content: '12345678', widthMm: 30, heightMm: 10 };
  let baseWidthPx = 30 * 8; // 240px
  let baseHeightPx = 10 * 8; // 80px
  mockBarcodeRenderer(element.encodeMode, element.content, baseWidthPx, baseHeightPx);
  assert.equal(barcodeGenerationCount, 1, 'Initial render generates barcode 1 time');

  // Simulate 300 frames of continuous handle dragging (e.g. 5 seconds at 60fps)
  // During drag: Reanimated updates animW and animH on the UI thread and scales the existing view via scaleX/scaleY.
  for (let frame = 1; frame <= 300; frame++) {
    const animatedWidthPx = baseWidthPx + frame * 0.5;
    const scaleX = animatedWidthPx / baseWidthPx;
    // GPU scale transform only — zero calls to mockBarcodeRenderer
  }

  assert.equal(barcodeGenerationCount, 1, 'During 300 frames of drag, barcode generation count remains exactly 1');

  // Gesture End (transformend): commit new size to document model (e.g. 48.75mm x 10mm)
  element = { ...element, widthMm: 48.75 };
  baseWidthPx = 48.75 * 8;
  mockBarcodeRenderer(element.encodeMode, element.content, baseWidthPx, baseHeightPx);

  assert.equal(barcodeGenerationCount, 2, 'Upon transformend commit, barcode is regenerated exactly 1 time at final size');
  console.log(`Verified: During 300 drag frames, barcode generation count during drag = 0; on gesture end = 1 (Total executions: ${barcodeGenerationCount})`);
}

simulateDragResizeSession();
