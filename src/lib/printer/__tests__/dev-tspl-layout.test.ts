import assert from 'node:assert';
import { computeDevTsplPrintLayout } from '../print-spec';

console.log('--- Running DEV TSPL Generalized Layout Tests ---');

// Test 1: 50x50 mm (Baseline square, overwide for 48mm head)
{
  const layout = computeDevTsplPrintLayout(50, 50, { printheadWidthMm: 48, dpi: 203 });
  console.log('Test 1 (50x50 mm):', layout);
  assert.strictEqual(layout.isOverwide, true, '50mm must be marked overwide');
  assert.strictEqual(layout.targetWidthDots, 384, 'targetWidthDots must scale to headDots 384');
  assert.strictEqual(layout.widthBytes, 48, 'widthBytes must be 48 bytes');
  assert.strictEqual(layout.totalHeightDots, 400, 'totalHeightDots must match physical 50mm label length (400 dots)');
  assert.strictEqual(layout.drawX, 0, 'drawX must be 0 for full-head utilization');
  assert.strictEqual(layout.drawY, 8, 'drawY must be 8 dots (1mm) for vertical centering');
  assert.strictEqual(layout.sizeCommand, 'SIZE 50.00 mm,50.00 mm');
  console.log('✓ Test 1 Passed: 50x50 mm matches baseline perfectly');
}

// Test 2: 40x30 mm (Small landscape, non-square, <= 48mm head)
{
  const layout = computeDevTsplPrintLayout(40, 30, { printheadWidthMm: 48, dpi: 203 });
  console.log('Test 2 (40x30 mm):', layout);
  assert.strictEqual(layout.isOverwide, false, '40mm must not be overwide');
  assert.strictEqual(layout.fitScale, 1.0, 'fitScale must be 1.0 (no downscaling)');
  assert.strictEqual(layout.targetWidthDots, 320, 'targetWidthDots must be exactly 320 dots');
  assert.strictEqual(layout.widthBytes, 40, 'widthBytes must be exactly 40 bytes (not 48)');
  assert.strictEqual(layout.totalHeightDots, 240, 'totalHeightDots must be exactly 240 dots');
  assert.strictEqual(layout.drawX, 0, 'drawX must be 0 (no artificial head centering)');
  assert.strictEqual(layout.drawY, 0, 'drawY must be 0');
  assert.strictEqual(layout.sizeCommand, 'SIZE 40.00 mm,30.00 mm');
  console.log('✓ Test 2 Passed: 40x30 mm layout is exact 1:1, byte-aligned, zero shift');
}

// Test 3: 30x20 mm (Mini, non-square, narrow, <= 48mm head)
{
  const layout = computeDevTsplPrintLayout(30, 20, { printheadWidthMm: 48, dpi: 203 });
  console.log('Test 3 (30x20 mm):', layout);
  assert.strictEqual(layout.isOverwide, false, '30mm must not be overwide');
  assert.strictEqual(layout.fitScale, 1.0, 'fitScale must be 1.0');
  assert.strictEqual(layout.targetWidthDots, 240, 'targetWidthDots must be 240 dots');
  assert.strictEqual(layout.widthBytes, 30, 'widthBytes must be 30 bytes (not 48)');
  assert.strictEqual(layout.totalHeightDots, 160, 'totalHeightDots must be 160 dots');
  assert.strictEqual(layout.drawX, 0, 'drawX must be 0 (no artificial 72-dot offset)');
  assert.strictEqual(layout.drawY, 0, 'drawY must be 0');
  assert.strictEqual(layout.sizeCommand, 'SIZE 30.00 mm,20.00 mm');
  console.log('✓ Test 3 Passed: 30x20 mm eliminates 72-dot offset & right border cutoff');
}

// Test 4: 30x50 mm (Narrow portrait, odd aspect ratio, <= 48mm head)
{
  const layout = computeDevTsplPrintLayout(30, 50, { printheadWidthMm: 48, dpi: 203 });
  console.log('Test 4 (30x50 mm):', layout);
  assert.strictEqual(layout.isOverwide, false, '30mm must not be overwide');
  assert.strictEqual(layout.fitScale, 1.0, 'fitScale must be 1.0');
  assert.strictEqual(layout.targetWidthDots, 240, 'targetWidthDots must be 240 dots');
  assert.strictEqual(layout.widthBytes, 30, 'widthBytes must be 30 bytes');
  assert.strictEqual(layout.totalHeightDots, 400, 'totalHeightDots must be 400 dots (50mm height)');
  assert.strictEqual(layout.drawX, 0, 'drawX must be 0');
  assert.strictEqual(layout.drawY, 0, 'drawY must be 0');
  assert.strictEqual(layout.sizeCommand, 'SIZE 30.00 mm,50.00 mm');
  console.log('✓ Test 4 Passed: 30x50 mm portrait maintains full border integrity');
}

// Test 5: 60x40 mm (Overwide landscape, wider than 48mm head)
{
  const layout = computeDevTsplPrintLayout(60, 40, { printheadWidthMm: 48, dpi: 203 });
  console.log('Test 5 (60x40 mm):', layout);
  assert.strictEqual(layout.isOverwide, true, '60mm must be marked overwide');
  assert.strictEqual(layout.fitScale, 384 / 480, 'fitScale must be 0.8');
  assert.strictEqual(layout.targetWidthDots, 384, 'targetWidthDots must be 384 dots (full head)');
  assert.strictEqual(layout.widthBytes, 48, 'widthBytes must be 48 bytes');
  assert.strictEqual(layout.targetHeightDots, 256, 'targetHeightDots must be 256 dots');
  assert.strictEqual(layout.drawY, 32, 'drawY must be 32 dots (4mm top padding for centering)');
  assert.strictEqual(layout.totalHeightDots, 320, 'totalHeightDots must be 320 dots (40mm physical height)');
  assert.strictEqual(layout.sizeCommand, 'SIZE 60.00 mm,40.00 mm');
  console.log('✓ Test 5 Passed: 60x40 mm overwide scales proportionally with vertical centering');
}

// Test 6: Calibration Offsets
{
  const layout = computeDevTsplPrintLayout(40, 30, {
    printheadWidthMm: 48,
    dpi: 203,
    hOffsetMm: 1.5,
    vOffsetMm: -0.5,
  });
  console.log('Test 6 (Offsets):', layout);
  assert.strictEqual(layout.drawX, 12, '1.5mm * 8 = 12 dots');
  assert.strictEqual(layout.drawY, 0, 'negative offset clamped to 0');
  console.log('✓ Test 6 Passed: Calibration offsets apply cleanly');
}

console.log('--- ALL 6 TESTS PASSED SUCCESSFULLY! ---');
