import assert from 'node:assert';
import {
  computeWrappedLines,
  computeTextElementHeightMm,
  measureTextWidthMm,
} from '../text-metrics';
import { ptToMm } from '../label-document';

console.log('Testing text-metrics module...');

// 1. Test "AMAZON BASICS MOUSE" at 3 different widths
const testText = 'AMAZON BASICS MOUSE';
const fontSize = 12; // pt
const fullWidth = measureTextWidthMm(testText, fontSize); // approx 47-50mm

// Wide: should fit all in 1 line
const linesWide = computeWrappedLines({
  text: testText,
  fontSize,
  widthMm: 55,
  autoWrapping: 'Word',
});
assert.strictEqual(linesWide.length, 1, 'Wide width should produce 1 line');
assert.strictEqual(linesWide[0], 'AMAZON BASICS MOUSE');
const heightWide = computeTextElementHeightMm({
  text: testText,
  fontSize,
  widthMm: 55,
  autoWrapping: 'Word',
});

// Medium: "AMAZON BASICS" on line 1, "MOUSE" on line 2
const linesMed = computeWrappedLines({
  text: testText,
  fontSize,
  widthMm: 35,
  autoWrapping: 'Word',
});
assert.strictEqual(linesMed.length, 2, 'Medium width should produce 2 lines');
assert.strictEqual(linesMed[0], 'AMAZON BASICS');
assert.strictEqual(linesMed[1], 'MOUSE');
const heightMed = computeTextElementHeightMm({
  text: testText,
  fontSize,
  widthMm: 35,
  autoWrapping: 'Word',
});
assert(heightMed > heightWide, '2 lines height must be greater than 1 line');

// Narrow: "AMAZON" (1), "BASICS" (2), "MOUSE" (3)
const linesNarrow = computeWrappedLines({
  text: testText,
  fontSize,
  widthMm: 20,
  autoWrapping: 'Word',
});
assert.strictEqual(linesNarrow.length, 3, 'Narrow width should produce 3 lines');
assert.strictEqual(linesNarrow[0], 'AMAZON');
assert.strictEqual(linesNarrow[1], 'BASICS');
assert.strictEqual(linesNarrow[2], 'MOUSE');
const heightNarrow = computeTextElementHeightMm({
  text: testText,
  fontSize,
  widthMm: 20,
  autoWrapping: 'Word',
});
assert(heightNarrow > heightMed, '3 lines height must be greater than 2 lines');

// Verify font size is unchanged throughout
const perLineExpected = ptToMm(fontSize) * 1.25;
assert.strictEqual(Math.round(heightWide * 10) / 10, Math.round(perLineExpected * 1 * 10) / 10);
assert.strictEqual(Math.round(heightMed * 10) / 10, Math.round(perLineExpected * 2 * 10) / 10);
assert.strictEqual(Math.round(heightNarrow * 10) / 10, Math.round(perLineExpected * 3 * 10) / 10);
console.log('✓ 3 widths produce 3 line-wrap counts and heights at unchanged font size');

// 2. Test AutoWrapping 'Close' mode
const linesClose = computeWrappedLines({
  text: testText,
  fontSize,
  widthMm: 20,
  autoWrapping: 'Close',
});
assert.strictEqual(linesClose.length, 1, 'Close mode should not wrap text automatically');

// 3. Test AutoWrapping 'Char' mode
const linesChar = computeWrappedLines({
  text: 'ABCDEF',
  fontSize: 12,
  widthMm: measureTextWidthMm('ABC', 12) + 0.1,
  autoWrapping: 'Char',
});
assert.strictEqual(linesChar.length, 2, 'Char mode wraps mid-word at width threshold');
assert.strictEqual(linesChar[0], 'ABC');
assert.strictEqual(linesChar[1], 'DEF');
console.log('✓ Char and Close modes behave correctly');

// 4. Test long single word breaking mid-word in 'Word' mode if narrower than word
const longWord = 'SUPERLONGWORDTHATOVERFLOWS';
const linesBreakWord = computeWrappedLines({
  text: longWord,
  fontSize: 12,
  widthMm: 15,
  autoWrapping: 'Word',
});
assert(linesBreakWord.length > 1, 'Word wider than container width breaks mid-word without clipping');
console.log('✓ Long words break mid-word cleanly without clipping');

// 5. Test vertical display
const linesVert = computeWrappedLines({
  text: 'TEST',
  fontSize: 12,
  widthMm: 50,
  verticalDisplay: true,
});
assert.deepStrictEqual(linesVert, ['T', 'E', 'S', 'T']);
console.log('✓ Vertical display produces one char per line');

console.log('ALL TEXT METRICS TESTS PASSED!');
