import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  DEFAULT_BARCODE_STATE,
  DEFAULT_QRCODE_STATE,
} from '@/components/editor/types';
import { encodeCode128 } from '@/lib/barcode-code128';
import { createLabelDocument, type LabelElement } from '@/lib/label-document';
import { mmToDots, rectMmToDots } from '@/lib/printer/print-spec';
import {
  layoutBarcodeWidthDots,
  layoutQrSquareDots,
  shrinkWrapSymbolElement,
} from '@/lib/printer/whole-dot-layout';
import { rasterizeEditorParityReference } from '@/printing/raster/editor-parity-reference';
import { unpackedHeadlessGray } from '@/printing/raster/parity-diff';
import { rasterizeDocumentToBitmap } from '@/printing/raster/skia-rasterizer';
import { inkBoundingBox } from '@/printing/raster/tspl-wire';
import { generateQrMatrix } from '@/printing/renderer/qrcode';

const DPI = 304;

const QR_21_SIZES: { boxMm: number; boxDots: number; cell: number; drawn: number }[] = [
  { boxMm: 6, boxDots: 72, cell: 3, drawn: 63 },
  { boxMm: 8, boxDots: 96, cell: 4, drawn: 84 },
  { boxMm: 10, boxDots: 120, cell: 5, drawn: 105 },
  { boxMm: 12, boxDots: 144, cell: 6, drawn: 126 },
  { boxMm: 15, boxDots: 180, cell: 8, drawn: 168 },
  { boxMm: 20, boxDots: 240, cell: 11, drawn: 231 },
];

function qrEl(widthMm: number, content: string): Extract<LabelElement, { type: 'qrcode' }> {
  return {
    ...DEFAULT_QRCODE_STATE,
    id: 'qr',
    type: 'qrcode',
    content,
    encodeMode: 'QRCode',
    errorLevel: 'M',
    zoneSize: '0',
    left: 2,
    top: 2,
    width: widthMm,
    height: widthMm,
    needPrinting: true,
  };
}

function barcodeEl(
  widthMm: number,
  content: string,
): Extract<LabelElement, { type: 'barcode' }> {
  return {
    ...DEFAULT_BARCODE_STATE,
    id: 'barcode',
    type: 'barcode',
    content,
    encodeMode: 'CODE-128',
    textFlag: 'Hide',
    left: 2,
    top: 16,
    width: widthMm,
    height: 10,
    needPrinting: true,
  };
}

test('QR 21-module squares at 304 dpi use dotsPerMm whole cells', () => {
  for (const row of QR_21_SIZES) {
    const matrix = generateQrMatrix('ABC', 'M');
    assert.ok(matrix);
    assert.equal(matrix.size, 21);
    assert.equal(mmToDots(row.boxMm, DPI), row.boxDots);
    const layout = layoutQrSquareDots({
      widthMm: row.boxMm,
      heightMm: row.boxMm,
      moduleCount: matrix.size,
      quietZone: 0,
      dpi: DPI,
    });
    assert.equal(layout.cell, row.cell);
    assert.equal(layout.drawnDots, row.drawn);
  }
});

test('ABC Code128 at 18 mm / 304 dpi is 204 dots, not the 216-dot box', () => {
  const modules = encodeCode128('ABC');
  assert.ok(modules);
  const moduleCount = modules.reduce((sum, m) => sum + m, 0);
  assert.equal(moduleCount, 68);
  assert.equal(mmToDots(18, DPI), 216);
  const layout = layoutBarcodeWidthDots({ widthMm: 18, moduleCount, dpi: DPI });
  assert.equal(layout.moduleDots, 3);
  assert.equal(layout.drawnDots, 204);
  assert.equal(layout.widthMm, 17);
});

test('shrink-wrap keeps top-left and matches the helper rectangle', () => {
  const qr = shrinkWrapSymbolElement(qrEl(8, 'ABC'), DPI);
  assert.equal(qr.left, 2);
  assert.equal(qr.top, 2);
  assert.equal(qr.width, 7);
  assert.equal(qr.height, 7);

  const bar = shrinkWrapSymbolElement(barcodeEl(18, 'ABC'), DPI);
  assert.equal(bar.left, 2);
  assert.equal(bar.top, 16);
  assert.equal(bar.width, 17);
});

test('raster ink bounds match whole-dot rectangles for QR sizes and ABC at 18 mm', () => {
  for (const row of QR_21_SIZES) {
    const el = shrinkWrapSymbolElement(qrEl(row.boxMm, 'ABC'), DPI);
    const doc = createLabelDocument({
      name: 'qr-ink',
      widthMm: 50,
      heightMm: 30,
      paperType: 'Label',
      elements: [el],
    });
    const bits = rasterizeDocumentToBitmap(doc, DPI, { backend: 'dot-buffer' });
    const gray = unpackedHeadlessGray(bits);
    const rect = rectMmToDots(el.left, el.top, el.width, el.height, DPI);
    const ink = inkBoundingBox(
      gray,
      bits.widthDots,
      bits.heightDots,
      { x: 0, y: 0, w: bits.widthDots, h: bits.heightDots },
    );
    assert.ok(ink);
    assert.equal(ink.x0, rect.x0);
    assert.equal(ink.y0, rect.y0);
    assert.equal(ink.x1, rect.x0 + row.drawn - 1);
    assert.equal(ink.y1, rect.y0 + row.drawn - 1);
    assert.equal(rect.widthDots, row.drawn);
  }

  const bar = shrinkWrapSymbolElement(barcodeEl(18, 'ABC'), DPI);
  const doc = createLabelDocument({
    name: 'barcode-ink',
    widthMm: 50,
    heightMm: 30,
    paperType: 'Label',
    elements: [bar],
  });
  const bits = rasterizeDocumentToBitmap(doc, DPI, { backend: 'dot-buffer' });
  const gray = unpackedHeadlessGray(bits);
  const rect = rectMmToDots(bar.left, bar.top, bar.width, bar.height, DPI);
  const ink = inkBoundingBox(
    gray,
    bits.widthDots,
    bits.heightDots,
    { x: 0, y: 0, w: bits.widthDots, h: bits.heightDots },
  );
  assert.ok(ink);
  assert.equal(rect.widthDots, 204);
  assert.equal(ink.x0, rect.x0);
  assert.equal(ink.x1, rect.x0 + 204 - 1);
  assert.equal(ink.y0, rect.y0);
  assert.equal(ink.y1, rect.y0 + rect.heightDots - 1);
});

test('golden 50x30 QR+barcode bitmap is stable and matches the editor helper', () => {
  const qr = shrinkWrapSymbolElement(qrEl(8, 'ABC'), DPI);
  const bar = shrinkWrapSymbolElement(barcodeEl(18, 'ABC'), DPI);
  const doc = createLabelDocument({
    name: 'golden-50x30',
    widthMm: 50,
    heightMm: 30,
    paperType: 'Label',
    elements: [qr, bar],
  });
  const a = rasterizeDocumentToBitmap(doc, DPI, { backend: 'dot-buffer' });
  const b = rasterizeDocumentToBitmap(doc, DPI, { backend: 'dot-buffer' });
  assert.deepEqual(a.mono1bppBuffer, b.mono1bppBuffer);

  const hash = createHash('sha256').update(a.mono1bppBuffer).digest('hex');
  assert.equal(a.widthDots, 600);
  assert.equal(a.heightDots, 360);
  assert.equal(a.mono1bppBuffer.length, 27000);
  assert.equal(hash, '1c39da9a580bced7e2fc8294d815d682aa393722f7e86bdaa608604ea0dcb178');

  const gray = unpackedHeadlessGray(a);
  const editor = rasterizeEditorParityReference(doc, DPI);
  assert.equal(editor.widthDots, a.widthDots);
  assert.equal(editor.heightDots, a.heightDots);
  assert.deepEqual(editor.gray, gray);
});
