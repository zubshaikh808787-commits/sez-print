import assert from 'node:assert';
import {
  computeOptimalDimensionsMm,
  inspect1DBarcodeScannability,
} from '../scannability-inspector';

console.log('--- Running Scannability Preflight Inspector Tests ---');

// 1. Optimal Layout Test
console.log('Testing Optimal Layout (Grade A)...');
const optimalReport = inspect1DBarcodeScannability('CODE-128', '12345678', 50, 15, 203);
assert.strictEqual(optimalReport.status, 'optimal', 'Status is optimal');
assert.strictEqual(optimalReport.grade, 'A', 'Grade is A');
assert(optimalReport.score >= 85, 'Score is at least 85');
assert(optimalReport.metrics.moduleDots >= 2, 'Module dots >= 2 at 203 DPI');
assert(optimalReport.metrics.xDimensionMm >= 0.25, 'X-dimension >= 0.25 mm');
assert.strictEqual(optimalReport.needsOptimization, false, 'No optimization needed');
console.log('ok Optimal layout evaluated correctly');

// 2. Marginal Layout Test (1-dot per module at 203 DPI)
console.log('Testing Marginal Layout (Grade B)...');
const marginalReport = inspect1DBarcodeScannability('CODE-128', '12345678', 18, 10, 203);
assert.strictEqual(marginalReport.status, 'marginal', 'Status is marginal');
assert.strictEqual(marginalReport.grade, 'B', 'Grade is B');
assert(marginalReport.score >= 60 && marginalReport.score < 85, 'Score is in marginal range');
assert.strictEqual(marginalReport.metrics.moduleDots, 1, 'Module dots is 1 at 203 DPI');
assert(marginalReport.issues.some((i) => i.code === 'MARGINAL_X_DIM'), 'Includes MARGINAL_X_DIM issue');
assert.strictEqual(marginalReport.needsOptimization, true, 'Flags optimization needed');
console.log('ok Marginal layout evaluated correctly');

// 3. Sub-Optical Layout Test (Cramped container)
console.log('Testing Sub-Optical Layout (Critical narrow-bar)...');
const subReport = inspect1DBarcodeScannability('CODE-128', 'LONG-BARCODE-STRING-123', 10, 8, 203);
assert.strictEqual(subReport.status, 'sub-optical', 'Status is sub-optical');
assert(subReport.grade === 'C' || subReport.grade === 'F', 'Grade is C or F');
assert(subReport.score < 60, 'Score is below 60');
assert(subReport.issues.some((i) => i.code === 'SUB_OPTICAL_X_DIM'), 'Includes SUB_OPTICAL_X_DIM issue');
assert.strictEqual(subReport.needsOptimization, true, 'Flags optimization needed');
console.log('ok Sub-optical layout evaluated correctly');

// 4. Insufficient Vertical Scan Height Floor Test
console.log('Testing Height Floor Warning (< 3.5mm)...');
const shortReport = inspect1DBarcodeScannability('CODE-128', '12345678', 45, 2.0, 203);
assert(shortReport.issues.some((i) => i.code === 'INSUFFICIENT_HEIGHT_FLOOR'), 'Flags INSUFFICIENT_HEIGHT_FLOOR');
assert(shortReport.score < optimalReport.score, 'Deducts points for insufficient height');
assert.strictEqual(shortReport.needsOptimization, true, 'Flags optimization needed due to height');
console.log('ok Height floor evaluated correctly');

// 5. Invalid Content Handling
console.log('Testing Invalid Content Handling...');
const invalidReport = inspect1DBarcodeScannability('UPC-A', 'NOT_NUMERIC', 35, 10, 203);
assert.strictEqual(invalidReport.status, 'invalid', 'Status is invalid');
assert.strictEqual(invalidReport.grade, 'F', 'Grade is F');
assert.strictEqual(invalidReport.score, 0, 'Score is 0');
assert(invalidReport.issues.some((i) => i.code === 'INVALID_CONTENT'), 'Flags INVALID_CONTENT');
console.log('ok Invalid content handled gracefully');

// 6. Dual-Axis computeOptimalDimensionsMm Test
console.log('Testing computeOptimalDimensionsMm (Width + Height)...');
const dimsFix = computeOptimalDimensionsMm('CODE-128', '12345678', 2.0, 203);
assert(dimsFix.widthMm >= 25, 'Calculates adequate width for optimal 2-dot modules');
assert(dimsFix.heightMm >= 3.5, 'Elevates height above 3.5 mm floor');
assert(dimsFix.heightMm >= dimsFix.widthMm * 0.15, 'Elevates height to at least 15% of width');

// Re-inspecting with optimal dimensions must yield Grade A
const fixedReport = inspect1DBarcodeScannability('CODE-128', '12345678', dimsFix.widthMm, dimsFix.heightMm, 203);
assert.strictEqual(fixedReport.status, 'optimal', 'Optimized dimensions produce optimal status');
assert.strictEqual(fixedReport.grade, 'A', 'Optimized dimensions produce Grade A');
assert.strictEqual(fixedReport.needsOptimization, false, 'Optimized dimensions need no further fix');
console.log('ok Dual-axis optimal dimension calculation validated');

console.log('--- ALL Scannability Preflight Inspector Tests Passed Successfully ---');
