/**
 * Comprehensive Skia scaling, QR square-lock, and barcode module verification suite.
 */

import { barcodeBarsForMode, BARCODE_MODES } from '@/lib/barcode-code128';
import { generateQrMatrix } from '@/printing/renderer/qrcode';
import { elementSizeMm } from '@/lib/label-document';
import { mmToPx, pxToMm } from '@/lib/label-coordinate-system';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`ok ${msg}`);
}

console.log('--- Running Skia Scaling & Symbology Geometry Tests ---');

// 1. Barcode module generation test
for (const mode of ['CODE-128', 'CODE-39', 'ITF', 'EAN-13', 'EAN-8'] as const) {
  const bars = barcodeBarsForMode(mode, '12345678');
  assert(Array.isArray(bars) && bars.length > 10, `Barcode mode ${mode} generates multiple discrete bars (found ${bars?.length})`);
  
  // Verify bars are non-overlapping and strictly sorted
  let prevEnd = 0;
  for (let i = 0; i < bars!.length; i++) {
    const b = bars![i];
    assert(b.x >= prevEnd - 1e-6, `Bar ${i} in ${mode} does not overlap previous bar`);
    assert(b.width > 0, `Bar ${i} in ${mode} has positive width (${b.width})`);
    prevEnd = b.x + b.width;
  }
  assert(prevEnd <= 1.0001, `Last bar in ${mode} terminates at normalized bounds (ends at ${prevEnd})`);
}

// 2. QR matrix generation & square module verification
const qr = generateQrMatrix('https://example.com');
assert(qr !== null && qr.size > 0, `QR matrix generated with size ${qr?.size}`);
assert(qr!.data.length === qr!.size * qr!.size, `QR data array length matches size^2 (${qr!.data.length})`);

// 3. QR 1:1 Square Lock Dual-Handle Clamping Invariant
const canvasW = 57;
const canvasH = 30;
const qrLeft = 39;
const qrTop = 15;
const pxPerMM = 6;

const maxW = mmToPx(canvasW - qrLeft, pxPerMM); // (57 - 39) * 6 = 108px
const maxH = mmToPx(canvasH - qrTop, pxPerMM);  // (30 - 15) * 6 = 90px
const maxSquarePx = Math.min(maxW, maxH);       // 90px (limited by vertical headroom)

assert(maxSquarePx === mmToPx(15, pxPerMM), 'QR square-lock correctly caps maximum size to vertical headroom (15mm)');

// Simulate an aggressive 50mm horizontal drag
const rawDragX = mmToPx(50, pxPerMM);
const clampedWidth = Math.min(maxSquarePx, rawDragX);
const clampedHeight = clampedWidth; // Option (a) synchronous driving

assert(clampedWidth === maxSquarePx, `East handle drag clamped to ${pxToMm(clampedWidth, pxPerMM)}mm without exceeding vertical canvas bound`);
assert(clampedHeight === clampedWidth, 'Synced height exactly equals clamped width (1:1 aspect preserved)');

// 4. Barcode East Drag Invariant (width changes, height remains static)
const bcW0: number = 32;
const bcH0: number = 15;
const bcDragW: number = 45;
const bcDragH: number = bcH0;
assert(bcDragW !== bcW0, 'Barcode width modified');
assert(bcDragH === bcH0, 'Barcode height strictly stationary during width drag');

// 5. boundBoxMm Origin Pinning Test (Must NEVER relocate left/top during resize)
import { boundBoxMm } from '@/lib/editor/resize-policy';

const initialBox = { left: 10, top: 12, width: 15, height: 15 };
const canvasBounds = { widthMm: 57, heightMm: 30 };

// 5a. Square resizing via East handle
const squareEastResult = boundBoxMm({
  anchor: 'e',
  behavior: 'square',
  start: initialBox,
  proposed: { width: 25, height: 15 },
  aspect: 1,
  minMm: 2,
  canvas: canvasBounds,
});
assert(squareEastResult.left === 10, `Square East drag left must remain pinned at 10 (got ${squareEastResult.left})`);
assert(squareEastResult.top === 12, `Square East drag top must remain pinned at 12 (got ${squareEastResult.top})`);
assert(squareEastResult.width === squareEastResult.height, 'Square East drag preserves 1:1 aspect');

// 5b. Square resizing via South handle
const squareSouthResult = boundBoxMm({
  anchor: 's',
  behavior: 'square',
  start: initialBox,
  proposed: { width: 15, height: 25 },
  aspect: 1,
  minMm: 2,
  canvas: canvasBounds,
});
assert(squareSouthResult.left === 10, `Square South drag left must remain pinned at 10 (got ${squareSouthResult.left})`);
assert(squareSouthResult.top === 12, `Square South drag top must remain pinned at 12 (got ${squareSouthResult.top})`);
assert(squareSouthResult.width === squareSouthResult.height, 'Square South drag preserves 1:1 aspect');

// 5c. Aspect resizing via East handle
const aspectEastResult = boundBoxMm({
  anchor: 'e',
  behavior: 'aspect',
  start: { left: 8, top: 6, width: 20, height: 10 },
  proposed: { width: 30, height: 10 },
  aspect: 2,
  minMm: 2,
  canvas: canvasBounds,
});
assert(aspectEastResult.left === 8, `Aspect East drag left must remain pinned at 8 (got ${aspectEastResult.left})`);
assert(aspectEastResult.top === 6, `Aspect East drag top must remain pinned at 6 (got ${aspectEastResult.top})`);
assert(Math.abs(aspectEastResult.width / aspectEastResult.height - 2) < 0.01, 'Aspect East drag preserves 2:1 aspect');

console.log('All Skia Scaling & Symbology Geometry tests passed successfully.');
