import assert from 'node:assert';
import {
  snap1DBarcodeModules,
  snap2DMatrixToHardwareDots,
  mmToHardwareDots,
  hardwareDotsToMm,
  QUIET_ZONE_MODULES_1D,
} from '../barcode-snapping';
import { encodeCode128 } from '../../barcode-code128';

console.log('--- Running Barcode Integer Snapping Engine Tests ---');

// 1. Conversion helper fidelity
const dots203 = mmToHardwareDots(25.4, 203);
assert.strictEqual(Math.round(dots203), 203, '25.4mm at 203 DPI equals 203 dots');
const mmBack = hardwareDotsToMm(203, 203);
assert.strictEqual(Math.round(mmBack * 10) / 10, 25.4, '203 dots at 203 DPI converts back to 25.4mm');
console.log('ok Unit conversion helpers validated');

// 2. 1D Barcode Module Snapping with Quiet Zones
const modules = encodeCode128('12345678');
assert(modules !== null, 'Code128 modules encoded successfully');
const dataModuleCount = modules.reduce((a, b) => a + b, 0);

// Test snapping onto a 40mm wide space at 203 DPI
const snap40mm = snap1DBarcodeModules(modules, 40, 203, true);
assert(snap40mm !== null, 'Snapped barcode layout exists');

// Verify module multiplier is an exact whole integer
assert(Number.isInteger(snap40mm.dotMultiplier), 'Module dot multiplier must be an exact integer');
assert(snap40mm.dotMultiplier >= 1, 'Module dot multiplier must be at least 1 dot');

// Verify total modules matches data modules + 20 quiet modules (10 left + 10 right)
assert.strictEqual(
  snap40mm.totalModules,
  dataModuleCount + QUIET_ZONE_MODULES_1D * 2,
  'Total modules must include exactly 2× quiet zones (10 left + 10 right)',
);

// Verify all bar coordinates and widths are whole integer dots
for (const bar of snap40mm.bars) {
  assert(Number.isInteger(bar.dotX), `Bar dotX (${bar.dotX}) must be integer`);
  assert(Number.isInteger(bar.dotWidth), `Bar dotWidth (${bar.dotWidth}) must be integer`);
  assert(bar.dotWidth >= snap40mm.dotMultiplier, `Bar width must be at least 1 module width`);
  assert(bar.x >= 0 && bar.x <= 1, `Normalized x (${bar.x}) must be in [0..1]`);
  assert(bar.width > 0 && bar.width <= 1, `Normalized width (${bar.width}) must be positive in [0..1]`);
}
console.log('ok 1D Barcode integer dot snapping & quiet zones verified at 203 DPI');

// 3. Test High-DPI (300 DPI) scaling
const snap300Dpi = snap1DBarcodeModules(modules, 40, 300, true);
assert(snap300Dpi !== null, '300 DPI layout exists');
assert(Number.isInteger(snap300Dpi.dotMultiplier), '300 DPI module multiplier is integer');
assert(
  snap300Dpi.quantizedWidthDots > snap40mm.quantizedWidthDots,
  '300 DPI produces more hardware dots for the same millimeter width',
);
console.log('ok 300 DPI integer dot snapping verified');

// 4. Centering Offset Verification
assert(snap40mm.offsetXMm >= 0, 'Horizontal offset within container is non-negative');
assert(
  snap40mm.quantizedWidthMm + snap40mm.offsetXMm * 2 <= 40.001,
  'Centered barcode with margins does not exceed container width',
);
console.log('ok Container centering and horizontal headroom verified');

// 5. Scannability classification
const narrowSnap = snap1DBarcodeModules(modules, 10, 203, true);
assert(narrowSnap !== null, 'Narrow layout generated');
assert(
  narrowSnap.scannability === 'sub-optical' || narrowSnap.scannability === 'marginal',
  'Compact 10mm Code128 flagged as marginal or sub-optical for laser scanners',
);

const wideSnap = snap1DBarcodeModules(modules, 60, 203, true);
assert(wideSnap !== null, 'Wide layout generated');
assert.strictEqual(wideSnap.scannability, 'optimal', 'Generous 60mm Code128 classified as optimal optical scannability');
console.log('ok Scannability grading logic verified');

// 6. 2D Matrix Snapping (QR / DataMatrix integer grid)
const matrixSnap = snap2DMatrixToHardwareDots(25, 25, 30, 30, 203, 4);
assert(Number.isInteger(matrixSnap.dotSize), '2D matrix dot size must be integer');
assert(matrixSnap.dotSize >= 1, '2D matrix dot size must be >= 1 dot');
assert.strictEqual(
  matrixSnap.quantizedWidthDots,
  matrixSnap.quantizedHeightDots,
  'Square 2D matrix retains 1:1 square dot dimensions',
);
console.log('ok 2D matrix module snapping to square integer dots verified');

console.log('--- ALL Barcode Snapping Tests Passed Successfully ---');
