import test from 'node:test';
import assert from 'node:assert/strict';
import { computeArcTextLayout } from '../arctext-layout';

test('computeArcTextLayout produces circular guide line geometry', () => {
  const result = computeArcTextLayout({
    text: 'Test',
    widthPx: 100,
    heightPx: 100,
    nominalFontSizePx: 12,
    lineWidthMm: 0.25,
    scale: 2,
  });

  assert.equal(result.cx, 50);
  assert.equal(result.cy, 50);
  assert.ok(result.radius > 40 && result.radius < 50);
  assert.ok(result.strokeWidth >= 0.5);
  assert.equal(result.characters.length, 4);
});

test('computeArcTextLayout centers text symmetrically at 12 o’clock', () => {
  const result = computeArcTextLayout({
    text: 'ABA',
    widthPx: 100,
    heightPx: 100,
    nominalFontSizePx: 10,
  });

  // Middle character 'B' should be very close to x = 50 (center) and at top (lowest y)
  const middleChar = result.characters[1];
  assert.equal(middleChar.char, 'B');
  assert.ok(Math.abs(middleChar.x - 50) < 1.0, `Expected middle char x close to 50, got ${middleChar.x}`);
  assert.ok(Math.abs(middleChar.rotationDeg) < 3.0, `Expected middle char rotation close to 0 deg, got ${middleChar.rotationDeg}`);

  // First character 'A' is to the left (x < 50, rotation < 0)
  const firstChar = result.characters[0];
  assert.ok(firstChar.x < 50, `Expected first char x < 50, got ${firstChar.x}`);
  assert.ok(firstChar.rotationDeg < 0, `Expected first char rotation < 0, got ${firstChar.rotationDeg}`);

  // Last character 'A' is to the right (x > 50, rotation > 0)
  const lastChar = result.characters[2];
  assert.ok(lastChar.x > 50, `Expected last char x > 50, got ${lastChar.x}`);
  assert.ok(lastChar.rotationDeg > 0, `Expected last char rotation > 0, got ${lastChar.rotationDeg}`);
});

test('computeArcTextLayout differentiates character widths (e.g. i vs W)', () => {
  const narrowResult = computeArcTextLayout({
    text: 'iii',
    widthPx: 100,
    heightPx: 100,
    nominalFontSizePx: 10,
  });

  const wideResult = computeArcTextLayout({
    text: 'WWW',
    widthPx: 100,
    heightPx: 100,
    nominalFontSizePx: 10,
  });

  const narrowSpan = narrowResult.characters[2].x - narrowResult.characters[0].x;
  const wideSpan = wideResult.characters[2].x - wideResult.characters[0].x;

  assert.ok(wideSpan > narrowSpan * 2, `Wide span (${wideSpan}) should be more than double narrow span (${narrowSpan})`);
});

test('computeArcTextLayout auto-shrinks font size to fit when text exceeds circumference', () => {
  const longText = 'THIS IS AN EXTREMELY LONG TEXT STRING THAT DEFINITELY EXCEEDS 360 DEGREES OF THE CIRCLE AT NOMINAL SIZE';
  const nominalFontSize = 16;
  const result = computeArcTextLayout({
    text: longText,
    widthPx: 100,
    heightPx: 100,
    nominalFontSizePx: nominalFontSize,
  });

  assert.ok(
    result.effectiveFontSizePx < nominalFontSize,
    `Expected font to auto-shrink below ${nominalFontSize}, got ${result.effectiveFontSizePx}`
  );
  assert.equal(result.characters.length, longText.length);
});
