import assert from 'node:assert/strict';
import test from 'node:test';

import { snap1DBarcodeModules } from '@/lib/barcode/barcode-snapping';
import { encodeCode128 } from '@/lib/barcode-code128';
import {
  DEFAULT_BARCODE_STATE,
  DEFAULT_QRCODE_STATE,
} from '@/components/editor/types';
import { mmToDots, rectMmToDots } from '@/lib/printer/print-spec';
import {
  centreShrinkSymbol,
  elementInkLayout,
  layoutQrSquareDots,
  withRequestedSize,
} from '@/lib/printer/whole-dot-layout';
import type { LabelElement } from '@/lib/label-document';

const DPI = 304;

function qr(width: number, left = 10): Extract<LabelElement, { type: 'qrcode' }> {
  return {
    ...DEFAULT_QRCODE_STATE,
    id: 'qr',
    type: 'qrcode',
    content: 'ABC',
    encodeMode: 'QRCode',
    errorLevel: 'M',
    zoneSize: '0',
    left,
    top: left,
    width,
    height: width,
    needPrinting: true,
  };
}

function bar(width: number, content: string): Extract<LabelElement, { type: 'barcode' }> {
  return {
    ...DEFAULT_BARCODE_STATE,
    id: 'bar',
    type: 'barcode',
    content,
    encodeMode: 'CODE-128',
    textFlag: 'Hide',
    left: 2,
    top: 16,
    width,
    height: 10,
    needPrinting: true,
  };
}

test('21-module QR at 20 mm is centred in the 240-dot box (231-dot ink)', () => {
  const el = qr(20, 10);
  const layout = elementInkLayout(el, DPI);
  const box = rectMmToDots(10, 10, 20, 20, DPI);
  assert.equal(box.widthDots, 240);
  assert.equal(layout.cell, 11);
  assert.equal(layout.inkDots.widthDots, 231);
  assert.equal(layout.inkDots.heightDots, 231);
  assert.equal(layout.inkDots.x0, box.x0 + Math.floor((240 - 231) / 2));
  assert.equal(layout.inkDots.y0, box.y0 + Math.floor((240 - 231) / 2));
  assert.ok(layout.warnings.includes('qr_cell_gt_10'));
  assert.equal(layout.printedWidthMm, 19.25);
});

test('25-module QR in a 10 mm box is 100 dots (8.33 mm), not the full box', () => {
  const layout = layoutQrSquareDots({
    widthMm: 10,
    heightMm: 10,
    moduleCount: 25,
    quietZone: 0,
    dpi: DPI,
  });
  assert.equal(layout.cell, 4);
  assert.equal(layout.drawnDots, 100);
  assert.equal(layout.widthMm, 8.33);
});

test('Code128 ABC at 18 mm is 204 dots, left-aligned, no stretch', () => {
  const layout = elementInkLayout(bar(18, 'ABC'), DPI);
  assert.equal(layout.moduleDots, 3);
  assert.equal(layout.inkDots.widthDots, 204);
  assert.equal(layout.inkDots.x0, layout.boxDots.x0);
  assert.equal(layout.printedWidthMm, 17);
  assert.equal(layout.inkDots.heightDots, layout.boxDots.heightDots);
});

test('8-char and 12-char Code128 module counts match the encoder', () => {
  const eight = encodeCode128('01234567');
  const twelve = encodeCode128('012345678901');
  assert.ok(eight && twelve);
  assert.equal(eight.reduce((s, m) => s + m, 0), 79);
  assert.equal(twelve.reduce((s, m) => s + m, 0), 101);
  const a = elementInkLayout(bar(20, '01234567'), DPI);
  const b = elementInkLayout(bar(20, '012345678901'), DPI);
  assert.equal(a.inkDots.widthDots, 237);
  assert.equal(b.inkDots.widthDots, 202);
  assert.ok(b.warnings.includes('bar_narrow_lt_2') === false);
  const narrow = elementInkLayout(bar(18, '012345678901'), 203);
  assert.equal(narrow.moduleDots, 1);
});

test('304 dpi snap uses 12 dots/mm, not 304/25.4', () => {
  const modules = encodeCode128('ABC');
  assert.ok(modules);
  const snapped = snap1DBarcodeModules(modules, 20, 304, false);
  assert.ok(snapped);
  assert.equal(mmToDots(20, 304), 240);
  assert.equal(snapped.dotMultiplier, 3);
  assert.equal(snapped.quantizedWidthDots, 204);
});

test('migration stores requested size without moving the box', () => {
  const el = qr(20, 10);
  const migrated = withRequestedSize(el);
  assert.equal(migrated.requestedWidthMm, 20);
  assert.equal(migrated.left, el.left);
  assert.equal(migrated.width, el.width);
  assert.equal(withRequestedSize(migrated), migrated);
});

test('a second resize starts from requested size, not the shrunk box', () => {
  const once = centreShrinkSymbol(qr(20, 10), DPI, 20, 20);
  assert.equal(once.width, 19.25);
  const twice = centreShrinkSymbol(once, DPI, once.requestedWidthMm ?? once.width, once.requestedHeightMm ?? once.height);
  assert.equal(twice.width, once.width);
  assert.equal(twice.requestedWidthMm, 20);
});

test('centre shrink keeps the box centre and stores requested size', () => {
  const el = qr(20, 10);
  const next = centreShrinkSymbol(el, DPI, 20, 20);
  assert.equal(next.requestedWidthMm, 20);
  assert.equal(next.requestedHeightMm, 20);
  assert.equal(next.width, 19.25);
  assert.equal(next.height, 19.25);
  const oldCx = el.left + el.width / 2;
  const newCx = next.left + next.width / 2;
  assert.ok(Math.abs(oldCx - newCx) < 0.02);
});
