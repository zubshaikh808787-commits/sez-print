import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_BARCODE_STATE } from '@/components/editor/types';
import { createLabelDocument, type LabelElement } from '@/lib/label-document';
import { rectMmToDots } from '@/lib/printer/print-spec';
import { elementInkLayout } from '@/lib/printer/whole-dot-layout';
import { rasterizeDocumentToBitmap } from '@/printing/raster/skia-rasterizer';
import { unpackedHeadlessGray } from '@/printing/raster/parity-diff';
import { inkBoundingBox } from '@/printing/raster/tspl-wire';

function barcode(): Extract<LabelElement, { type: 'barcode' }> {
  return {
    ...DEFAULT_BARCODE_STATE,
    id: 'barcode',
    type: 'barcode',
    content: 'ABC',
    encodeMode: 'CODE-128',
    textFlag: 'Hide',
    left: 2,
    top: 16,
    width: 18,
    height: 10,
    needPrinting: true,
  };
}

function inkWidth(exact: boolean): number {
  const el = barcode();
  const doc = createLabelDocument({
    name: 'exact-bar',
    widthMm: 50,
    heightMm: 30,
    paperType: 'Label',
    elements: [el],
  });
  const bits = rasterizeDocumentToBitmap(doc, 304, {
    backend: 'dot-buffer',
    exactBarcodeWidth: exact,
  });
  const gray = unpackedHeadlessGray(bits);
  const ink = inkBoundingBox(gray, bits.widthDots, bits.heightDots, {
    x: 0,
    y: 0,
    w: bits.widthDots,
    h: bits.heightDots,
  });
  assert.ok(ink);
  return ink.x1 - ink.x0 + 1;
}

test('exact barcode width is off by default and stretches to the box', () => {
  const el = barcode();
  const box = rectMmToDots(el.left, el.top, el.width, el.height, 304);
  assert.equal(inkWidth(false), box.widthDots);
});

test('exact barcode width matches elementInkLayout and does not stretch', () => {
  const el = barcode();
  const layout = elementInkLayout(el, 304);
  assert.equal(layout.inkDots.widthDots, 204);
  assert.equal(inkWidth(true), 204);
  assert.notEqual(inkWidth(true), inkWidth(false));
});
