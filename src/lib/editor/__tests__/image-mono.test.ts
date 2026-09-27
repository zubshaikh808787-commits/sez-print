import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_EDITOR_COLOR_MODE,
  DEFAULT_GRAY_THRESHOLD,
  applyMonoToRgba,
  binarizeLuminanceBuffer,
  looksLikeImageUri,
  monoFromLuminance,
  resolveEditorColorMode,
} from '../image-mono';

test('new images default to B & W at threshold 128', () => {
  assert.equal(DEFAULT_EDITOR_COLOR_MODE, 'B & W');
  assert.equal(DEFAULT_GRAY_THRESHOLD, 128);
  assert.equal(resolveEditorColorMode(undefined), 'B & W');
  assert.equal(resolveEditorColorMode('Original'), 'Original');
  assert.equal(resolveEditorColorMode('Halftone'), 'Halftone');
});

test('mid-gray is white at the threshold and black below it', () => {
  assert.equal(monoFromLuminance(128, 128), 255);
  assert.equal(monoFromLuminance(127, 128), 0);
  assert.equal(monoFromLuminance(200, 128), 255);
  assert.equal(monoFromLuminance(10, 128), 0);
});

test('binarizeLuminanceBuffer maps a buffer through the threshold', () => {
  const src = Uint8Array.from([0, 127, 128, 255]);
  assert.deepEqual([...binarizeLuminanceBuffer(src, 128)], [0, 0, 255, 255]);
});

test('looksLikeImageUri accepts file and http image paths', () => {
  assert.equal(looksLikeImageUri('https://example.com/photo.png'), true);
  assert.equal(looksLikeImageUri('file:///tmp/a.jpg'), true);
  assert.equal(looksLikeImageUri('Product name'), false);
});

test('applyMonoToRgba thresholds a mid-gray pixel in place', () => {
  const rgba = Uint8Array.from([128, 128, 128, 255, 10, 10, 10, 255]);
  applyMonoToRgba(rgba, 2, 1, 128, 'B & W');
  assert.deepEqual([...rgba], [255, 255, 255, 255, 0, 0, 0, 255]);
});
