import assert from 'node:assert';
import { encodeDataMatrix } from '../datamatrix';
import { encodePdf417 } from '../pdf417';

console.log('--- Running Authentic 2D Barcode Encoder Tests ---');

// 1. DataMatrix Tests
console.log('Testing DataMatrix ECC 200...');
const dmSquare = encodeDataMatrix('TEST1234');
assert(dmSquare !== null, 'DataMatrix generated for TEST1234');
assert(dmSquare.rows > 0 && dmSquare.cols > 0, 'DataMatrix has valid dimensions');
assert.strictEqual(dmSquare.rows, dmSquare.cols, 'Default DataMatrix symbol is square');

// Verify standard L-finder pattern:
// Bottom row must be solid true (dark)
const lastRow = dmSquare.matrix[dmSquare.rows - 1];
assert(lastRow.every((cell) => cell === true), 'DataMatrix bottom edge is solid finder line');

// Left column must be solid true (dark)
for (let r = 0; r < dmSquare.rows; r++) {
  assert.strictEqual(dmSquare.matrix[r][0], true, `Left edge row ${r} is solid finder line`);
}

// Top row must be alternating clock track (dark, light, dark, light...) ending with light in top-right
const firstRow = dmSquare.matrix[0];
for (let c = 0; c < dmSquare.cols; c++) {
  assert.strictEqual(firstRow[c], c % 2 === 0, `Top clock track at col ${c} alternates (even=dark, odd=light)`);
}
assert.strictEqual(firstRow[dmSquare.cols - 1], false, 'Top-right corner module is light (0) in ECC 200');
console.log('ok DataMatrix square L-finder and timing tracks validated');

// Rectangular DataMatrix test
const dmRect = encodeDataMatrix('ABC', true);
assert(dmRect !== null, 'Rectangular DataMatrix generated');
assert(dmRect.rows <= dmRect.cols, 'Rectangular DataMatrix has more columns than rows');
console.log('ok Rectangular DataMatrix generation validated');

// 2. PDF417 Tests
console.log('Testing PDF417 ISO/IEC 15438...');
const pdf = encodePdf417('Hello World 12345', 2);
assert(pdf !== null, 'PDF417 generated successfully');
assert(pdf.rows >= 3, 'PDF417 has at least 3 rows');
assert(pdf.cols >= 69, 'PDF417 row width has start (17) + left (17) + data (>=17) + right (17) + stop (18) modules');

// Verify Start & Stop patterns on every row
const START_BITS = [true, true, true, true, true, true, true, true, false, true, false, true, false, true, false, false, false];
const STOP_BITS = [true, true, true, true, true, true, true, false, true, false, false, false, true, false, true, false, false, true];

for (let r = 0; r < pdf.rows; r++) {
  const row: boolean[] = pdf.matrix[r];
  // Check start pattern (first 17 modules)
  for (let i = 0; i < 17; i++) {
    assert.strictEqual(row[i], START_BITS[i], `Row ${r} start pattern module ${i} matches ISO spec`);
  }
  // Check stop pattern (last 18 modules)
  const stopOffset = row.length - 18;
  for (let i = 0; i < 18; i++) {
    assert.strictEqual(row[stopOffset + i], STOP_BITS[i], `Row ${r} stop pattern module ${i} matches ISO spec`);
  }
}
console.log('ok PDF417 start and stop guard patterns validated across all rows');

// Test variable ECC levels
const pdfEcc0 = encodePdf417('DATA', 0);
const pdfEcc4 = encodePdf417('DATA', 4);
assert(pdfEcc0 !== null && pdfEcc4 !== null, 'PDF417 ECC 0 and ECC 4 generated');
assert(
  pdfEcc4.matrix.length * pdfEcc4.cols >= pdfEcc0.matrix.length * pdfEcc0.cols,
  'Higher error correction level allocates more total codewords/area',
);
console.log('ok PDF417 variable ECC capacity validated');

console.log('--- ALL Authentic 2D Barcode Encoder Tests Passed Successfully ---');
