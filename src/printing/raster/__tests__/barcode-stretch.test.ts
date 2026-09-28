import assert from 'node:assert/strict';
import { encodeCode128 } from '@/lib/barcode-code128';
import { snap1DBarcodeModules } from '@/lib/barcode/barcode-snapping';
import { stretchThenRoundBars } from '@/printing/raster/barcode-stretch';

const modules = encodeCode128('BASELINE50X30');
assert.ok(modules);
const snapped = snap1DBarcodeModules(modules, 28, 203, false);
assert.ok(snapped);

const boxW = 336;
const originX = 36;
const rounded = stretchThenRoundBars(snapped.bars, originX, boxW);
assert.ok(rounded.length === snapped.bars.length);
assert.strictEqual(rounded[0].x0, originX);
const last = rounded[rounded.length - 1];
assert.ok(last.x0 + last.width <= originX + boxW);
for (let i = 1; i < rounded.length; i++) {
  assert.ok(rounded[i].x0 >= rounded[i - 1].x0 + rounded[i - 1].width, 'bars must not overlap');
}
console.log('ok stretch-then-round fills the editor box without overlap');
