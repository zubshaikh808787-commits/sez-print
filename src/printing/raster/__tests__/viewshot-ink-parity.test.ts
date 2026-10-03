import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_BARCODE_STATE, DEFAULT_QRCODE_STATE } from '@/components/editor/types';
import { createLabelDocument, type LabelElement } from '@/lib/label-document';
import { captureInkDots, elementInkLayout } from '@/lib/printer/whole-dot-layout';
import { rasterizeDocumentToBitmap } from '@/printing/raster/skia-rasterizer';
import { unpackedHeadlessGray } from '@/printing/raster/parity-diff';
import { inkBoundingBox } from '@/printing/raster/tspl-wire';

const DPI = 304;

function qr(): Extract<LabelElement, { type: 'qrcode' }> {
  return {
    ...DEFAULT_QRCODE_STATE,
    id: 'qr',
    type: 'qrcode',
    content: 'ABC',
    encodeMode: 'QRCode',
    errorLevel: 'M',
    zoneSize: '0',
    left: 5,
    top: 5,
    width: 10,
    height: 10,
    needPrinting: true,
  };
}

function bar(): Extract<LabelElement, { type: 'barcode' }> {
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

function rasterInk(el: LabelElement, exact: boolean) {
  const doc = createLabelDocument({
    name: 'parity',
    widthMm: 50,
    heightMm: 30,
    paperType: 'Label',
    elements: [el],
  });
  const bits = rasterizeDocumentToBitmap(doc, DPI, { backend: 'dot-buffer', exactBarcodeWidth: exact });
  const gray = unpackedHeadlessGray(bits);
  const ink = inkBoundingBox(gray, bits.widthDots, bits.heightDots, {
    x: 0,
    y: 0,
    w: bits.widthDots,
    h: bits.heightDots,
  });
  assert.ok(ink);
  return ink;
}

test('ViewShot capture rectangle matches headless QR ink', () => {
  const el = qr();
  const layout = elementInkLayout(el, DPI);
  const capture = captureInkDots(el, DPI);
  assert.deepEqual(capture, layout.inkDots);
  const ink = rasterInk(el, false);
  assert.equal(ink.x0, capture.x0);
  assert.equal(ink.y0, capture.y0);
  assert.equal(ink.x1, capture.x1 - 1);
  assert.equal(ink.y1, capture.y1 - 1);
});

test('ViewShot capture rectangle matches headless barcode, stretch and exact', () => {
  const el = bar();
  const layout = elementInkLayout(el, DPI);
  const stretched = captureInkDots(el, DPI, { exactBarcodeWidth: false });
  const exact = captureInkDots(el, DPI, { exactBarcodeWidth: true });
  assert.deepEqual(stretched, layout.boxDots);
  assert.deepEqual(exact, layout.inkDots);
  const stretchInk = rasterInk(el, false);
  const exactInk = rasterInk(el, true);
  assert.equal(stretchInk.x0, stretched.x0);
  assert.equal(stretchInk.x1, stretched.x1 - 1);
  assert.equal(exactInk.x0, exact.x0);
  assert.equal(exactInk.x1, exact.x0 + exact.widthDots - 1);
});
