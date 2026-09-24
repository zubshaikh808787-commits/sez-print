import assert from 'node:assert';

import {
  cropWindowPts,
  mmToPt,
  parsePageRange,
  resolveScopeIndices,
  sharpness0CropBoxesEqual,
  shouldRasterizePage,
  stampRectInCropSpace,
  tiledRepeatCount,
} from '../session';

console.log('--- pdf-editor session tests ---');

const r1 = parsePageRange('2', '5', 10);
assert.strictEqual(r1.start, 2);
assert.strictEqual(r1.end, 5);
assert.strictEqual(r1.error, undefined);

const r2 = parsePageRange('0', '99', 8);
assert.strictEqual(r2.start, 1);
assert.strictEqual(r2.end, 8);

const r3 = parsePageRange('7', '2', 8);
assert.strictEqual(r3.start, 2);
assert.strictEqual(r3.end, 7);
assert.ok(r3.error);

const idx = resolveScopeIndices({ mode: 'range', start: 2, end: 4 }, 6, 0);
assert.deepStrictEqual(idx, [1, 2, 3]);

const thisIdx = resolveScopeIndices({ mode: 'this' }, 6, 4);
assert.deepStrictEqual(thisIdx, [4]);

const page = { w: mmToPt(210), h: mmToPt(297) };
const output = { kind: '4x6' as const, widthMm: 101.6, heightMm: 152.4 };
const box = cropWindowPts(page, output, { x: 0, y: 0 });
assert.strictEqual(box.fits, true);
assert.ok(Math.abs(box.w - mmToPt(101.6)) < 0.05);
assert.ok(Math.abs(box.h - mmToPt(152.4)) < 0.05);
assert.ok(Math.abs(box.y + box.h - page.h) < 0.05, 'top-left origin maps to top of page (PDF y-up)');

const tooBig = cropWindowPts({ w: mmToPt(50), h: mmToPt(50) }, output, { x: 0, y: 0 });
assert.strictEqual(tooBig.fits, false);

const media = { ...box };
const crop = { ...box };
assert.strictEqual(sharpness0CropBoxesEqual(media, crop), true);
assert.strictEqual(
  sharpness0CropBoxesEqual(media, { ...crop, x: crop.x + 1 }),
  false,
  'CropBox-only mismatch is detected',
);

const stamp = stampRectInCropSpace(box, { offsetNorm: { x: 0.5, y: 0.5 }, sizeNorm: 0.2 });
assert.ok(stamp.x >= box.x - 0.01);
assert.ok(stamp.x + stamp.w <= box.x + box.w + 1);
assert.ok(stamp.y >= box.y - 0.01);

const mixed = cropWindowPts({ w: mmToPt(150), h: mmToPt(200) }, output, { x: 0.1, y: 0.1 });
assert.strictEqual(mixed.fits, true);

const repeats = tiledRepeatCount({ x: 0.2, y: 0.25 });
assert.strictEqual(repeats.cols, 5);
assert.strictEqual(repeats.rows, 4);
assert.notStrictEqual(repeats.cols, 4096, 'repeat count is not sourced from image pixel width');

assert.strictEqual(shouldRasterizePage(0), false);
assert.strictEqual(shouldRasterizePage(1), true);

const afterSizeChange = { crop: { scope: { mode: 'this' as const }, originNorm: { x: 0.2, y: 0.2 } }, outputSize: output };
const reset = { ...afterSizeChange, outputSize: { kind: '4x4' as const, widthMm: 100, heightMm: 100 }, crop: null };
assert.strictEqual(reset.crop, null);

console.log('ok pdf-editor session + crop boxes + stamp frame + tile repeats');
