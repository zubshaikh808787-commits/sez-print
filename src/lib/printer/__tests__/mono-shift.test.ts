import assert from 'node:assert/strict';

import { shiftMonoTowardOrigin, splitSignedReference } from '@/lib/printer/mono-shift';

const bpr = 2;
const h = 4;
const ink = (buf: Uint8Array, x: number, y: number) => ((buf[y * bpr + (x >> 3)] >> (7 - (x & 7))) & 1) === 1;
const set = (buf: Uint8Array, x: number, y: number) => {
  buf[y * bpr + (x >> 3)] |= 0x80 >> (x & 7);
};

const src = new Uint8Array(bpr * h);
set(src, 5, 2);
set(src, 9, 3);
set(src, 0, 0);

assert.equal(shiftMonoTowardOrigin(src, bpr, h, 0, 0), src);

const left = shiftMonoTowardOrigin(src, bpr, h, 3, 0);
assert.ok(ink(left, 2, 2), 'x5 -> x2');
assert.ok(ink(left, 6, 3), 'x9 -> x6, crosses byte boundary');
assert.ok(!ink(left, 0, 0), 'column pushed past the left edge is dropped');
for (let x = 13; x < 16; x++) for (let y = 0; y < h; y++) assert.ok(!ink(left, x, y), 'vacated right edge is white');

const up = shiftMonoTowardOrigin(src, bpr, h, 0, 2);
assert.ok(ink(up, 5, 0));
assert.ok(ink(up, 9, 1));
assert.ok(!ink(up, 5, 2) && !ink(up, 9, 3), 'vacated bottom rows are white');

assert.deepEqual(splitSignedReference(15, 15), {
  xDots: 15,
  yDots: 15,
  shiftLeftDots: 0,
  shiftUpDots: 0,
  requestedX: 15,
  requestedY: 15,
});
assert.deepEqual(splitSignedReference(-24, 15), {
  xDots: 0,
  yDots: 15,
  shiftLeftDots: 24,
  shiftUpDots: 0,
  requestedX: -24,
  requestedY: 15,
});
assert.deepEqual(splitSignedReference(6, -6), {
  xDots: 6,
  yDots: 0,
  shiftLeftDots: 0,
  shiftUpDots: 6,
  requestedX: 6,
  requestedY: -6,
});

console.log('ok mono-shift');
